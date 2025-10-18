// Src/controllers/healthController.js
const WearableData = require('../models/WearableData');
const Measurement = require('../models/Measurement');
const Workout = require('../models/Workout');
const CalendarEvent = require('../models/CalenderEvent');
const CompanionConversation = require('../models/CompanionConversation');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

/**
 * Get comprehensive health status
 * GET /api/health/status/:userId
 */
exports.getHealthStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 7 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Fetch all health data
    const [wearableData, measurements, recentWorkouts, upcomingEvents] = await Promise.all([
      WearableData.find({ 
        userId, 
        date: { $gte: startDate } 
      }).sort('-date').lean(),
      
      Measurement.find({ 
        clientId: userId 
      }).sort('-date').limit(10).lean(),
      
      Workout.find({ 
        clientId: userId,
        completed: true,
        completedAt: { $gte: startDate }
      }).sort('-completedAt').lean(),
      
      CalendarEvent.find({
        userId,
        startTime: { 
          $gte: new Date(),
          $lte: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      }).lean()
    ]);
    
    // Calculate health metrics
    const latestWearable = wearableData[0] || {};
    const latestMeasurement = measurements[0] || {};
    
    // Recovery analysis
    const recoveryMetrics = {
      current: latestWearable.recoveryScore || 0,
      average: wearableData.reduce((sum, d) => sum + (d.recoveryScore || 0), 0) / (wearableData.length || 1),
      trend: calculateTrend(wearableData.map(d => d.recoveryScore || 0)),
      status: getRecoveryStatus(latestWearable.recoveryScore)
    };
    
    // Sleep analysis
    const sleepMetrics = {
      lastNight: latestWearable.sleepDuration || 0,
      average: wearableData.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / (wearableData.length || 1),
      quality: latestWearable.sleepScore || 0,
      debt: calculateSleepDebt(wearableData)
    };
    
    // Activity analysis
    const activityMetrics = {
      todaySteps: latestWearable.steps || 0,
      weeklyAverage: wearableData.reduce((sum, d) => sum + (d.steps || 0), 0) / (wearableData.length || 1),
      workoutsCompleted: recentWorkouts.length,
      caloriesBurned: latestWearable.caloriesBurned || 0
    };
    
    // Stress indicators
    const stressMetrics = {
      hrv: latestWearable.hrv || null,
      restingHR: latestWearable.restingHeartRate || null,
      stressLevel: calculateStressLevel(latestWearable),
      calendarLoad: upcomingEvents.length
    };
    
    // Body composition
    const bodyMetrics = {
      weight: latestMeasurement.weight || null,
      bodyFat: latestMeasurement.bodyFat || null,
      trend: measurements.length >= 2 ? 
        (measurements[0].weight - measurements[1].weight).toFixed(1) : 0
    };
    
    // Generate AI insights if configured
    let aiInsights = null;
    if (process.env.GOOGLE_AI_API_KEY) {
      aiInsights = await generateHealthInsights(
        recoveryMetrics,
        sleepMetrics,
        activityMetrics,
        stressMetrics
      );
    }
    
    res.json({
      success: true,
      data: {
        recovery: recoveryMetrics,
        sleep: sleepMetrics,
        activity: activityMetrics,
        stress: stressMetrics,
        body: bodyMetrics,
        insights: aiInsights,
        dataQuality: {
          wearableData: wearableData.length > 0,
          measurements: measurements.length > 0,
          workouts: recentWorkouts.length > 0
        },
        lastUpdated: latestWearable.lastSynced || new Date()
      }
    });
  } catch (error) {
    console.error('Get health status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health status'
    });
  }
};

/**
 * Get vital signs
 * GET /api/health/vitals/:userId
 */
exports.getVitals = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const latestWearable = await WearableData.findOne({ userId })
      .sort('-date')
      .lean();
    
    if (!latestWearable) {
      return res.json({
        success: true,
        data: {
          heartRate: { current: null, resting: null, zones: [] },
          bloodOxygen: null,
          temperature: null,
          respiratoryRate: null,
          bloodPressure: null,
          message: 'No wearable data available'
        }
      });
    }
    
    const vitals = {
      heartRate: {
        current: latestWearable.averageHeartRate || null,
        resting: latestWearable.restingHeartRate || null,
        max: latestWearable.maxHeartRate || null,
        zones: latestWearable.heartRateZones || [],
        status: getHeartRateStatus(latestWearable.restingHeartRate)
      },
      hrv: {
        value: latestWearable.hrv || null,
        baseline: latestWearable.hrvBaseline || 60,
        status: getHRVStatus(latestWearable.hrv)
      },
      bloodOxygen: {
        value: latestWearable.spo2Avg || null,
        min: latestWearable.spo2Min || null,
        max: latestWearable.spo2Max || null,
        status: latestWearable.spo2Avg >= 95 ? 'normal' : 'low'
      },
      respiratoryRate: {
        value: latestWearable.breathingRate || null,
        deepSleep: latestWearable.deepSleepBreathingRate || null,
        status: getRespiratoryStatus(latestWearable.breathingRate)
      },
      temperature: {
        value: latestWearable.skinTemperature || null,
        deviation: latestWearable.temperatureDeviation || null
      },
      timestamp: latestWearable.date
    };
    
    res.json({
      success: true,
      data: vitals
    });
  } catch (error) {
    console.error('Get vitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vitals'
    });
  }
};

/**
 * Get health risk assessment
 * GET /api/health/risk-assessment/:userId
 */
exports.getRiskAssessment = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get 30 days of data for risk calculation
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [wearableData, workouts, measurements] = await Promise.all([
      WearableData.find({
        userId,
        date: { $gte: thirtyDaysAgo }
      }).lean(),
      
      Workout.find({
        clientId: userId,
        scheduledDate: { $gte: thirtyDaysAgo }
      }).lean(),
      
      Measurement.find({
        clientId: userId,
        date: { $gte: thirtyDaysAgo }
      }).lean()
    ]);
    
    const risks = {
      overtraining: calculateOvertrainingRisk(wearableData, workouts),
      injury: calculateInjuryRisk(wearableData, workouts),
      illness: calculateIllnessRisk(wearableData),
      burnout: calculateBurnoutRisk(wearableData, workouts),
      cardiovascular: calculateCardiovascularRisk(wearableData, measurements)
    };
    
    // Generate recommendations
    const recommendations = [];
    
    if (risks.overtraining.level === 'high') {
      recommendations.push({
        area: 'Training',
        priority: 'high',
        action: 'Reduce training volume by 30% this week',
        reason: risks.overtraining.reason
      });
    }
    
    if (risks.illness.level === 'high') {
      recommendations.push({
        area: 'Recovery',
        priority: 'critical',
        action: 'Prioritize sleep and nutrition',
        reason: risks.illness.reason
      });
    }
    
    if (risks.burnout.level === 'high') {
      recommendations.push({
        area: 'Stress',
        priority: 'high',
        action: 'Schedule rest days and stress management activities',
        reason: risks.burnout.reason
      });
    }
    
    res.json({
      success: true,
      data: {
        risks,
        recommendations,
        overallRisk: calculateOverallRisk(risks),
        assessmentDate: new Date()
      }
    });
  } catch (error) {
    console.error('Risk assessment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform risk assessment'
    });
  }
};

/**
 * Get health trends
 * GET /api/health/trends/:userId
 */
exports.getHealthTrends = async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = '30d' } = req.query;
    
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const wearableData = await WearableData.find({
      userId,
      date: { $gte: startDate }
    }).sort('date').lean();
    
    if (wearableData.length === 0) {
      return res.json({
        success: true,
        data: {
          message: 'No data available for trend analysis',
          trends: {}
        }
      });
    }
    
    const trends = {
      recovery: {
        data: wearableData.map(d => ({
          date: d.date,
          value: d.recoveryScore || 0
        })),
        average: calculateAverage(wearableData, 'recoveryScore'),
        direction: calculateTrend(wearableData.map(d => d.recoveryScore || 0))
      },
      sleep: {
        data: wearableData.map(d => ({
          date: d.date,
          value: (d.sleepDuration || 0) / 60
        })),
        average: calculateAverage(wearableData, 'sleepDuration') / 60,
        direction: calculateTrend(wearableData.map(d => d.sleepDuration || 0))
      },
      hrv: {
        data: wearableData.map(d => ({
          date: d.date,
          value: d.hrv || 0
        })),
        average: calculateAverage(wearableData, 'hrv'),
        direction: calculateTrend(wearableData.map(d => d.hrv || 0))
      },
      activity: {
        data: wearableData.map(d => ({
          date: d.date,
          value: d.steps || 0
        })),
        average: calculateAverage(wearableData, 'steps'),
        direction: calculateTrend(wearableData.map(d => d.steps || 0))
      },
      restingHR: {
        data: wearableData.map(d => ({
          date: d.date,
          value: d.restingHeartRate || 0
        })),
        average: calculateAverage(wearableData, 'restingHeartRate'),
        direction: calculateTrend(wearableData.map(d => d.restingHeartRate || 0))
      }
    };
    
    res.json({
      success: true,
      data: {
        period: period,
        days: days,
        dataPoints: wearableData.length,
        trends
      }
    });
  } catch (error) {
    console.error('Get trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health trends'
    });
  }
};

// Helper functions
function calculateTrend(values) {
  if (values.length < 3) return 'insufficient_data';
  const recent = values.slice(0, Math.ceil(values.length / 2));
  const older = values.slice(Math.ceil(values.length / 2));
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  
  if (recentAvg > olderAvg * 1.1) return 'improving';
  if (recentAvg < olderAvg * 0.9) return 'declining';
  return 'stable';
}

function getRecoveryStatus(score) {
  if (!score) return 'unknown';
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'moderate';
  return 'poor';
}

function calculateSleepDebt(wearableData) {
  const targetSleep = 480; // 8 hours in minutes
  const totalDeficit = wearableData.reduce((debt, d) => {
    const deficit = targetSleep - (d.sleepDuration || 0);
    return debt + (deficit > 0 ? deficit : 0);
  }, 0);
  return Math.round(totalDeficit / 60); // Convert to hours
}

function calculateStressLevel(wearable) {
  if (!wearable.hrv) return 'unknown';
  const hrv = wearable.hrv;
  const rhr = wearable.restingHeartRate || 60;
  
  let stressScore = 0;
  if (hrv < 30) stressScore += 40;
  else if (hrv < 50) stressScore += 20;
  
  if (rhr > 75) stressScore += 30;
  else if (rhr > 65) stressScore += 15;
  
  if (stressScore >= 50) return 'high';
  if (stressScore >= 25) return 'moderate';
  return 'low';
}

function getHeartRateStatus(rhr) {
  if (!rhr) return 'unknown';
  if (rhr < 50) return 'athlete';
  if (rhr < 60) return 'excellent';
  if (rhr < 70) return 'good';
  if (rhr < 80) return 'average';
  return 'poor';
}

function getHRVStatus(hrv) {
  if (!hrv) return 'unknown';
  if (hrv >= 70) return 'excellent';
  if (hrv >= 50) return 'good';
  if (hrv >= 35) return 'fair';
  return 'poor';
}

function getRespiratoryStatus(rate) {
  if (!rate) return 'unknown';
  if (rate >= 12 && rate <= 20) return 'normal';
  if (rate < 12) return 'low';
  return 'elevated';
}

function calculateOvertrainingRisk(wearableData, workouts) {
  const recentLoad = wearableData.slice(0, 7)
    .reduce((sum, d) => sum + (d.trainingLoad || 0), 0) / 7;
  const completedWorkouts = workouts.filter(w => w.completed).length;
  
  let risk = 0;
  if (recentLoad > 85) risk += 40;
  if (completedWorkouts > 10) risk += 30;
  
  const avgHRV = wearableData.reduce((sum, d) => sum + (d.hrv || 0), 0) / wearableData.length;
  if (avgHRV < 40) risk += 30;
  
  return {
    score: risk,
    level: risk >= 70 ? 'high' : risk >= 40 ? 'moderate' : 'low',
    reason: risk >= 70 ? 'Training load excessive with poor recovery' : 'Training load manageable'
  };
}

function calculateInjuryRisk(wearableData, workouts) {
  const recoveryScores = wearableData.map(d => d.recoveryScore || 0);
  const avgRecovery = recoveryScores.reduce((a, b) => a + b, 0) / recoveryScores.length;
  
  let risk = 0;
  if (avgRecovery < 50) risk += 35;
  
  const highIntensityDays = workouts.filter(w => w.completed).length;
  if (highIntensityDays > 5 && avgRecovery < 60) risk += 35;
  
  const sleepAvg = wearableData.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / wearableData.length;
  if (sleepAvg < 360) risk += 30;
  
  return {
    score: risk,
    level: risk >= 70 ? 'high' : risk >= 40 ? 'moderate' : 'low',
    reason: risk >= 70 ? 'Poor recovery with high training frequency' : 'Recovery adequate for training load'
  };
}

function calculateIllnessRisk(wearableData) {
  const recent = wearableData.slice(0, 7);
  const avgHRV = recent.reduce((sum, d) => sum + (d.hrv || 0), 0) / recent.length;
  const avgSleep = recent.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / recent.length;
  const avgRHR = recent.reduce((sum, d) => sum + (d.restingHeartRate || 0), 0) / recent.length;
  
  let risk = 0;
  if (avgHRV < 35) risk += 40;
  if (avgSleep < 360) risk += 30;
  if (avgRHR > 70) risk += 30;
  
  return {
    score: risk,
    level: risk >= 70 ? 'high' : risk >= 40 ? 'moderate' : 'low',
    reason: risk >= 70 ? 'Multiple biomarkers indicate compromised immune system' : 'Biomarkers within healthy range'
  };
}

function calculateBurnoutRisk(wearableData, workouts) {
  const avgHRV = wearableData.reduce((sum, d) => sum + (d.hrv || 0), 0) / wearableData.length;
  const workoutFrequency = workouts.filter(w => w.completed).length;
  const avgRecovery = wearableData.reduce((sum, d) => sum + (d.recoveryScore || 0), 0) / wearableData.length;
  
  let risk = 0;
  if (avgHRV < 40 && workoutFrequency > 15) risk += 40;
  if (avgRecovery < 50) risk += 30;
  
  const trend = calculateTrend(wearableData.map(d => d.hrv || 0));
  if (trend === 'declining') risk += 30;
  
  return {
    score: risk,
    level: risk >= 70 ? 'high' : risk >= 40 ? 'moderate' : 'low',
    reason: risk >= 70 ? 'Sustained high stress with declining recovery' : 'Stress levels manageable'
  };
}

function calculateCardiovascularRisk(wearableData, measurements) {
  const avgRHR = wearableData.reduce((sum, d) => sum + (d.restingHeartRate || 0), 0) / wearableData.length;
  const latestBP = measurements[0]?.bloodPressure;
  
  let risk = 0;
  if (avgRHR > 80) risk += 35;
  else if (avgRHR > 70) risk += 20;
  
  if (latestBP) {
    const [systolic] = latestBP.split('/').map(Number);
    if (systolic > 140) risk += 35;
    else if (systolic > 130) risk += 20;
  }
  
  const latestBodyFat = measurements[0]?.bodyFat;
  if (latestBodyFat > 25) risk += 30;
  else if (latestBodyFat > 20) risk += 15;
  
  return {
    score: risk,
    level: risk >= 70 ? 'high' : risk >= 40 ? 'moderate' : 'low',
    reason: risk >= 70 ? 'Multiple cardiovascular risk factors present' : 'Cardiovascular health within normal range'
  };
}

function calculateOverallRisk(risks) {
  const scores = Object.values(risks).map(r => r.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  
  return {
    score: Math.round(avgScore),
    level: avgScore >= 70 ? 'high' : avgScore >= 40 ? 'moderate' : 'low'
  };
}

function calculateAverage(data, field) {
  const values = data.map(d => d[field] || 0).filter(v => v > 0);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

async function generateHealthInsights(recovery, sleep, activity, stress) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 300
      }
    });
    
    const prompt = `As a health coach, provide 3 brief, actionable insights based on:
    Recovery: ${recovery.current}/100 (${recovery.trend})
    Sleep: ${(sleep.lastNight / 60).toFixed(1)}h average, ${sleep.debt}h debt
    Activity: ${activity.todaySteps} steps, ${activity.workoutsCompleted} workouts this week
    Stress: ${stress.stressLevel} (HRV: ${stress.hrv}ms)
    
    Keep each insight to 1 sentence, be specific and actionable.`;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('AI insights error:', error);
    return null;
  }
}

module.exports = exports;