// Src/controllers/intelligenceController.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Measurement = require('../models/Measurement');
const Nutrition = require('../models/Nutrition');
const Goal = require('../models/Goal');
const { getLatestCompleteData } = require('./wearableController');

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

/**
 * ✅ MAIN INTELLIGENCE ENDPOINT
 * Fetches all health data and generates AI-powered insights + ClockWork Unified Scores
 */
exports.getHealthMetrics = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('🧠 Intelligence Engine: Fetching data for user', userId);
    
    // ============================================
    // 1. FETCH ALL HEALTH DATA IN PARALLEL
    // ============================================
    const [
      wearableData,
      recentWorkouts,
      latestMeasurement,
      nutritionPlan,
      activeGoals,
      allMeasurements,
      last7DaysWearable
    ] = await Promise.all([
      // Wearable Data - Use smart fallback to yesterday if today incomplete
      getLatestCompleteData(userId, 'fitbit').catch(() => null),
      
      // Recent Workouts (last 7 days)
      Workout.find({ 
        clientId: userId,
        scheduledDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
        .sort('-scheduledDate')
        .limit(5)
        .lean(),
      
      // Latest Measurement
      Measurement.findOne({ clientId: userId })
        .sort('-date')
        .lean(),
      
      // Nutrition Plan
      Nutrition.findOne({ clientId: userId })
        .lean(),
      
      // Active Goals (not completed)
      Goal.find({ 
        clientId: userId,
        completed: false 
      })
        .sort('-createdAt')
        .limit(5)
        .lean(),
      
      // All Measurements (for trends)
      Measurement.find({ clientId: userId })
        .sort('-date')
        .limit(10)
        .lean(),
      
      // Last 7 days of wearable data (for training load chart)
      WearableData.find({
        userId: userId,
        date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
        .sort('-date')
        .lean()
    ]);
    
    console.log('✅ Data fetched:', {
      wearable: !!wearableData,
      workouts: recentWorkouts?.length || 0,
      measurement: !!latestMeasurement,
      nutrition: !!nutritionPlan,
      goals: activeGoals?.length || 0
    });
    
    // ============================================
    // 2. CALCULATE KEY METRICS
    // ============================================
    const completedWorkouts = recentWorkouts.filter(w => w.completed).length;
    const workoutCompletionRate = recentWorkouts.length > 0 
      ? Math.round((completedWorkouts / recentWorkouts.length) * 100)
      : 0;
    
    // ============================================
    // 3. BUILD METRICS RESPONSE
    // ============================================
    const metrics = {
      // Wearable Metrics
      steps: wearableData?.steps || 0,
      sleep: wearableData?.sleepDuration || 0,
      recoveryScore: wearableData?.recoveryScore || null,
      hrv: wearableData?.hrv || null,
      restingHR: wearableData?.restingHeartRate || null,
      trainingLoad: wearableData?.trainingLoad || null,
      
      // Workout Metrics
      workoutsThisWeek: completedWorkouts,
      workoutCompletionRate,
      totalWorkouts: recentWorkouts.length,
      
      // Body Metrics
      weight: latestMeasurement?.weight || null,
      bodyFat: latestMeasurement?.bodyFat || null,
      
      // Nutrition Metrics
      proteinTarget: nutritionPlan?.protein?.target || 0,
      proteinCurrent: nutritionPlan?.protein?.current || 0,
      caloriesTarget: nutritionPlan?.calories?.target || 0,
      caloriesCurrent: nutritionPlan?.calories?.current || 0,
      
      // Goals
      activeGoalsCount: activeGoals.length,
      goals: activeGoals.map(g => ({
        name: g.name,
        progress: Math.round((g.current / g.target) * 100),
        current: g.current,
        target: g.target
      })),
      
      // Measurement History
      measurements: {
        latest: latestMeasurement,
        history: allMeasurements
      }
    };
    
    // ============================================
    // 4. CALCULATE CLOCKWORK UNIFIED SCORES (0-100)
    // ============================================
    
    // Helper function for nutrition adherence
    const calculateNutritionAdherence = (nutrition) => {
      if (!nutrition) return 0;
      const macros = ['protein', 'carbs', 'fat'];
      let adherenceSum = 0;
      let adherenceCount = 0;
      
      macros.forEach(macro => {
        if (nutrition[macro] && nutrition[macro].target > 0) {
          const adherence = Math.min((nutrition[macro].current / nutrition[macro].target) * 100, 100);
          adherenceSum += adherence;
          adherenceCount++;
        }
      });
      
      return adherenceCount > 0 ? Math.round(adherenceSum / adherenceCount) : 0;
    };
    
    // 🟢 ClockWork Recovery Score
    let recoveryScore = 0;
    let recoveryWeights = 0;
    if (wearableData?.recoveryScore) { 
      recoveryScore += wearableData.recoveryScore * 0.5; 
      recoveryWeights += 0.5; 
    }
    if (wearableData?.sleepScore) { 
      recoveryScore += wearableData.sleepScore * 0.3; 
      recoveryWeights += 0.3; 
    }
    if (wearableData?.hrv) { 
      recoveryScore += Math.min((wearableData.hrv / 80) * 100, 100) * 0.2; 
      recoveryWeights += 0.2; 
    }
    recoveryScore = recoveryWeights > 0 ? Math.round(recoveryScore / recoveryWeights) : 0;
    
    // 🔵 ClockWork Performance Score
    let performanceScore = 0;
    let perfWeights = 0;
    performanceScore += workoutCompletionRate * 0.4; 
    perfWeights += 0.4;
    if (wearableData?.trainingLoad) { 
      const loadScore = wearableData.trainingLoad >= 60 && wearableData.trainingLoad <= 80 
        ? 100 
        : Math.max(0, 100 - Math.abs(70 - wearableData.trainingLoad));
      performanceScore += loadScore * 0.3; 
      perfWeights += 0.3;
    }
    if (wearableData?.steps) { 
      performanceScore += Math.min((wearableData.steps / 10000) * 100, 100) * 0.3; 
      perfWeights += 0.3; 
    }
    performanceScore = perfWeights > 0 ? Math.round(performanceScore / perfWeights) : 0;
    
    // 🟡 ClockWork Wellness Score
    let wellnessScore = 0;
    let wellWeights = 0;
    const nutritionAdherence = calculateNutritionAdherence(nutritionPlan);
    wellnessScore += nutritionAdherence * 0.4; 
    wellWeights += 0.4;
    if (wearableData?.restingHeartRate) {
      const rhrScore = wearableData.restingHeartRate >= 50 && wearableData.restingHeartRate <= 70 
        ? 100 
        : Math.max(0, 100 - Math.abs(60 - wearableData.restingHeartRate));
      wellnessScore += rhrScore * 0.3; 
      wellWeights += 0.3;
    }
    if (wearableData?.sleepEfficiency) { 
      wellnessScore += wearableData.sleepEfficiency * 0.3; 
      wellWeights += 0.3; 
    }
    wellnessScore = wellWeights > 0 ? Math.round(wellnessScore / wellWeights) : 0;
    
    // 🟣 ClockWork Progress Score
    let progressScore = 0;
    let progWeights = 0;
    if (activeGoals.length > 0) {
      const avgGoalProgress = activeGoals.reduce((sum, g) => {
        const progress = Math.min((g.current / g.target) * 100, 100);
        return sum + progress;
      }, 0) / activeGoals.length;
      progressScore += avgGoalProgress * 0.5; 
      progWeights += 0.5;
    }
    progressScore += workoutCompletionRate * 0.3; 
    progWeights += 0.3;
    if (latestMeasurement && allMeasurements.length >= 2) {
      const prev = allMeasurements[1];
      const bodyProgress = latestMeasurement.weight <= prev.weight ? 100 : 50;
      progressScore += bodyProgress * 0.2; 
      progWeights += 0.2;
    }
    progressScore = progWeights > 0 ? Math.round(progressScore / progWeights) : 0;
    
    // ============================================
    // 5. GENERATE AI INSIGHTS FOR EACH SCORE
    // ============================================
    
    const recoveryInsights = [];
    const sleepHours = wearableData?.sleepDuration ? Math.floor(wearableData.sleepDuration / 60) : 0;
    if (recoveryScore < 70 && sleepHours < 7) {
      recoveryInsights.push(`Add ${8 - sleepHours} more hours of sleep for optimal body recovery`);
    }
    if (wearableData?.hrv && wearableData.hrv < 50) {
      recoveryInsights.push('Consider active recovery or rest day - HRV below optimal range');
    }
    if (recoveryScore >= 80) {
      recoveryInsights.push('Excellent recovery - ready for high-intensity training');
    }
    if (!wearableData) {
      recoveryInsights.push('Connect a wearable device to track recovery metrics');
    }
    
    const performanceInsights = [];
    if (workoutCompletionRate < 80) {
      const needed = Math.ceil((recentWorkouts.length - completedWorkouts) * 0.5);
      performanceInsights.push(`Complete ${needed} more workouts this week to hit 80% consistency`);
    }
    if (wearableData?.steps && wearableData.steps < 8000) {
      const needed = Math.round((10000 - wearableData.steps) / 1000);
      performanceInsights.push(`Add ${needed}k more steps for optimal daily activity level`);
    }
    if (performanceScore >= 80) {
      performanceInsights.push('Outstanding performance - maintain current training load');
    }
    if (wearableData?.trainingLoad && wearableData.trainingLoad > 85) {
      performanceInsights.push('Training load is high - consider scheduling a recovery day');
    }
    
    const wellnessInsights = [];
    if (nutritionAdherence < 80) {
      wellnessInsights.push('Increase protein intake to meet daily nutrition targets');
    }
    if (wearableData?.restingHeartRate && wearableData.restingHeartRate > 70) {
      wellnessInsights.push('Elevated resting HR - prioritize sleep and stress management');
    }
    if (wellnessScore >= 85) {
      wellnessInsights.push('Excellent wellness status - body is optimized');
    }
    if (latestMeasurement && allMeasurements.length >= 2) {
      const prev = allMeasurements[1];
      const weightChange = latestMeasurement.weight - prev.weight;
      if (weightChange > 2) {
        wellnessInsights.push(`Weight increased ${weightChange.toFixed(1)} lbs - review nutrition plan`);
      } else if (weightChange < -2) {
        wellnessInsights.push(`Great progress! ${Math.abs(weightChange).toFixed(1)} lbs lost`);
      }
    }
    
    const progressInsights = [];
    if (activeGoals.length > 0) {
      const nearComplete = activeGoals.filter(g => (g.current / g.target) >= 0.8);
      if (nearComplete.length > 0) {
        progressInsights.push(`${nearComplete.length} goal(s) are 80%+ complete - push to finish!`);
      }
      const behindSchedule = activeGoals.filter(g => {
        const daysLeft = Math.ceil((new Date(g.deadline) - new Date()) / (1000 * 60 * 60 * 24));
        const progressNeeded = 100 - (g.current / g.target) * 100;
        return daysLeft < 7 && progressNeeded > 30;
      });
      if (behindSchedule.length > 0) {
        progressInsights.push(`${behindSchedule.length} goal(s) need acceleration to meet deadline`);
      }
    }
    if (progressScore >= 85) {
      progressInsights.push('Exceptional progress across all metrics - keep it up!');
    }
    if (workoutCompletionRate >= 90 && activeGoals.length > 0) {
      progressInsights.push('Outstanding consistency driving your goal progress forward');
    }
    
    // ============================================
    // 6. GENERATE OVERALL AI INSIGHTS (OPTIONAL)
    // ============================================
    let aiInsights = null;
    
    if (process.env.GOOGLE_AI_API_KEY) {
      try {
        console.log('🤖 Calling Google AI for insights...');
        
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        
        const prompt = buildInsightPrompt(metrics, wearableData, recentWorkouts, activeGoals);
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        aiInsights = response.text();
        
        console.log('✅ AI insights generated');
      } catch (aiError) {
        console.error('⚠️ AI generation failed:', aiError.message);
        aiInsights = generateFallbackInsights(metrics);
      }
    } else {
      console.log('⚠️ No AI API key, using fallback insights');
      aiInsights = generateFallbackInsights(metrics);
    }
    
    // ============================================
    // 7. BUILD HEALTH METRICS FOR DASHBOARD PANELS
    // ============================================
    const healthMetrics = wearableData ? {
      heartRate: {
        current: wearableData.restingHeartRate || 0,
        zones: wearableData.heartRateZones || [],
        trend: 'stable'
      },
      sleep: {
        score: wearableData.sleepScore || 0,
        duration: wearableData.sleepDuration || 0,
        deep: wearableData.deepSleep || 0,
        rem: wearableData.remSleep || 0,
        light: wearableData.lightSleep || 0,
        awake: wearableData.awakeTime || 0,
        efficiency: wearableData.sleepEfficiency || 0
      },
      recovery: {
        score: wearableData.recoveryScore || 0,
        hrv: wearableData.hrv || 0,
        restingHR: wearableData.restingHeartRate || 0
      },
      activity: {
        steps: wearableData.steps || 0,
        activeMinutes: wearableData.activeMinutes || 0,
        calories: wearableData.caloriesBurned || 0,
        distance: wearableData.distance || 0
      }
    } : null;
    
    // ============================================
    // 8. RETURN COMPLETE UNIFIED RESPONSE
    // ============================================
    res.json({
      success: true,
      data: {
        metrics,
        insights: aiInsights,
        healthMetrics: healthMetrics,
        wearableData: last7DaysWearable,
        
        // 🎯 CLOCKWORK UNIFIED SCORES
        clockworkScores: {
          recovery: {
            score: recoveryScore,
            insights: recoveryInsights
          },
          performance: {
            score: performanceScore,
            insights: performanceInsights
          },
          wellness: {
            score: wellnessScore,
            insights: wellnessInsights
          },
          progress: {
            score: progressScore,
            insights: progressInsights
          }
        },
        
        dataQuality: {
          wearable: !!wearableData,
          workouts: recentWorkouts.length > 0,
          measurements: !!latestMeasurement,
          nutrition: !!nutritionPlan,
          goals: activeGoals.length > 0
        },
        lastUpdated: new Date()
      }
    });
    
  } catch (error) {
    console.error('❌ Intelligence Engine error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate health insights',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Build AI prompt from health data
 */
function buildInsightPrompt(metrics, wearableData, workouts, goals) {
  return `You are an elite fitness and recovery specialist analyzing health data for a client. Provide concise, actionable insights in a friendly but professional tone.

**CLIENT DATA:**
- Steps Today: ${metrics.steps}
- Sleep Last Night: ${Math.round(metrics.sleep / 60)} hours ${metrics.sleep % 60} minutes
- Recovery Score: ${metrics.recoveryScore || 'N/A'}/100
- HRV: ${metrics.hrv || 'N/A'} ms
- Resting Heart Rate: ${metrics.restingHR || 'N/A'} bpm
- Training Load: ${metrics.trainingLoad || 'N/A'}/100
- Workouts This Week: ${metrics.workoutsThisWeek}/${metrics.totalWorkouts}
- Completion Rate: ${metrics.workoutCompletionRate}%
- Weight: ${metrics.weight || 'N/A'} lbs
- Body Fat: ${metrics.bodyFat || 'N/A'}%
- Protein: ${metrics.proteinCurrent}/${metrics.proteinTarget}g
- Calories: ${metrics.caloriesCurrent}/${metrics.caloriesTarget} kcal

**ACTIVE GOALS:**
${goals.map(g => `- ${g.name}: ${Math.round((g.current / g.target) * 100)}% complete`).join('\n')}

**RECENT WORKOUT PATTERN:**
${workouts.slice(0, 3).map(w => `- ${w.name} (${w.completed ? 'Completed' : 'Scheduled'})`).join('\n')}

Provide insights in 3-4 short paragraphs covering:
1. **Recovery Status**: What the recovery/HRV/sleep data indicates
2. **Training Recommendations**: Based on current load and completion rate
3. **Nutrition Guidance**: Protein/calorie adherence and suggestions
4. **Goal Progress**: Encouraging feedback on active goals

Keep it conversational, motivating, and under 200 words total. Use specific numbers from the data.`;
}

/**
 * Generate fallback insights when AI is unavailable
 */
function generateFallbackInsights(metrics) {
  let insights = [];
  
  // Recovery Insights
  if (metrics.recoveryScore !== null) {
    if (metrics.recoveryScore >= 70) {
      insights.push(`🟢 **Great Recovery** (${metrics.recoveryScore}/100): Your body is well-rested and ready for intense training. This is an excellent time to push your limits.`);
    } else if (metrics.recoveryScore >= 50) {
      insights.push(`🟡 **Moderate Recovery** (${metrics.recoveryScore}/100): Your body is recovering but could use more rest. Consider lighter training or active recovery today.`);
    } else if (metrics.recoveryScore > 0) {
      insights.push(`🔴 **Low Recovery** (${metrics.recoveryScore}/100): Your body needs rest. Prioritize sleep, hydration, and consider taking a rest day or doing light mobility work.`);
    }
  }
  
  // Sleep Insights
  const sleepHours = Math.round(metrics.sleep / 60);
  if (sleepHours > 0) {
    if (sleepHours >= 7) {
      insights.push(`😴 **Solid Sleep**: ${sleepHours}h ${metrics.sleep % 60}m is great for recovery. Keep this consistent!`);
    } else if (sleepHours >= 5) {
      insights.push(`⚠️ **Sleep Alert**: Only ${sleepHours}h ${metrics.sleep % 60}m. Aim for 7-9 hours for optimal recovery and performance.`);
    } else {
      insights.push(`🚨 **Critical Sleep**: ${sleepHours}h ${metrics.sleep % 60}m is insufficient. Prioritize sleep tonight - it's when your body rebuilds.`);
    }
  }
  
  // Workout Consistency
  if (metrics.workoutCompletionRate >= 75) {
    insights.push(`💪 **Excellent Consistency**: ${metrics.workoutCompletionRate}% completion rate this week. You're crushing it!`);
  } else if (metrics.workoutCompletionRate >= 50) {
    insights.push(`📈 **Good Progress**: ${metrics.workoutsThisWeek}/${metrics.totalWorkouts} workouts completed. Try to hit all scheduled sessions this week!`);
  } else if (metrics.totalWorkouts > 0) {
    insights.push(`⏰ **Consistency Opportunity**: Only ${metrics.workoutsThisWeek}/${metrics.totalWorkouts} workouts done. Small steps lead to big results - get after it!`);
  }
  
  // Nutrition Check
  const proteinPercent = metrics.proteinTarget > 0 
    ? Math.round((metrics.proteinCurrent / metrics.proteinTarget) * 100)
    : 0;
  
  if (proteinPercent >= 90) {
    insights.push(`🥩 **Protein On Point**: ${metrics.proteinCurrent}/${metrics.proteinTarget}g. Perfect for muscle recovery!`);
  } else if (proteinPercent >= 70) {
    insights.push(`🍗 **Nutrition Check**: ${metrics.proteinCurrent}/${metrics.proteinTarget}g protein. You're close - try to hit your target for better recovery.`);
  } else if (metrics.proteinTarget > 0) {
    insights.push(`⚠️ **Fuel Up**: Only ${metrics.proteinCurrent}/${metrics.proteinTarget}g protein today. Your muscles need fuel to grow and recover!`);
  }
  
  // Goals Progress
  if (metrics.activeGoalsCount > 0) {
    const avgProgress = Math.round(
      metrics.goals.reduce((sum, g) => sum + g.progress, 0) / metrics.goals.length
    );
    insights.push(`🎯 **Goal Tracking**: ${metrics.activeGoalsCount} active goals, ${avgProgress}% average progress. Stay focused!`);
  }
  
  // Default if no insights
  if (insights.length === 0) {
    insights.push('📊 Keep logging your data to get personalized insights! Connect a wearable and track your workouts for AI-powered guidance.');
  }
  
  return insights.join('\n\n');
}

module.exports = exports;
