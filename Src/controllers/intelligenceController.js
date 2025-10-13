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
 * Fetches all health data and generates AI-powered insights
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
      activeGoals
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
      }))
    };
    
    // ============================================
    // 4. GENERATE AI INSIGHTS
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
    // 5. RETURN COMPLETE RESPONSE
    // ============================================
    res.json({
      success: true,
      data: {
        metrics,
        insights: aiInsights,
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
      metrics.goals.reduce((sum, g) => sum + ((g.current / g.target) * 100), 0) / metrics.goals.length
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