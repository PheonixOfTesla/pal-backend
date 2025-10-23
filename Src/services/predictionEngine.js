// ============================================
// PREDICTION ENGINE SERVICE - FULLY IMPLEMENTED
// ============================================
// ML-based predictions with real algorithms
// ============================================

const Prediction = require('../models/Prediction');
const WearableData = require('../models/WearableData');
const RecoveryScore = require('../models/RecoveryScore');
const Workout = require('../models/Workout');
const Goal = require('../models/Goal');
const BodyMeasurement = require('../models/BodyMeasurement');

/**
 * Generate prediction using historical data and algorithms
 */
exports.generatePrediction = async (userId, type, horizon, confidence) => {
  try {
    let predictedValue;
    let predictionModel;
    let factors = [];

    switch (type) {
      case 'recovery':
        const recoveryPred = await predictRecoveryScore(userId, horizon);
        predictedValue = recoveryPred.value;
        factors = recoveryPred.factors;
        predictionModel = 'linear_regression';
        break;

      case 'illness':
        const illnessPred = await predictIllnessRisk(userId, horizon);
        predictedValue = illnessPred.risk;
        factors = illnessPred.factors;
        predictionModel = 'risk_assessment';
        break;

      case 'injury':
        const injuryPred = await predictInjuryRisk(userId, horizon);
        predictedValue = injuryPred.risk;
        factors = injuryPred.factors;
        predictionModel = 'risk_assessment';
        break;

      case 'performance':
        const perfPred = await predictPerformance(userId, horizon);
        predictedValue = perfPred.value;
        factors = perfPred.factors;
        predictionModel = 'trend_analysis';
        break;

      case 'goal_success':
        const goalPred = await predictGoalSuccess(userId, horizon);
        predictedValue = goalPred.probability;
        factors = goalPred.factors;
        predictionModel = 'probability_model';
        break;

      case 'energy':
        const energyPred = await predictEnergyLevel(userId, horizon);
        predictedValue = energyPred.value;
        factors = energyPred.factors;
        predictionModel = 'time_series';
        break;

      default:
        throw new Error('Invalid prediction type');
    }

    const predictionDate = new Date();
    predictionDate.setDate(predictionDate.getDate() + horizon);

    const prediction = await Prediction.create({
      userId,
      predictionType: type,
      horizon,
      confidenceLevel: confidence,
      predictedValue,
      predictionDate,
      predictionModel,
      factors,
      status: 'active',
      createdAt: new Date()
    });

    return prediction;

  } catch (error) {
    console.error('Generate prediction error:', error);
    throw error;
  }
};

/**
 * Predict recovery score using linear regression
 */
async function predictRecoveryScore(userId, horizon) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recoveryScores = await RecoveryScore.find({
    userId,
    date: { $gte: thirtyDaysAgo }
  }).sort({ date: 1 });

  if (recoveryScores.length < 7) {
    // Not enough data - use simple average
    const avg = recoveryScores.reduce((sum, r) => sum + r.score, 0) / recoveryScores.length || 70;
    return {
      value: Math.round(avg),
      factors: ['insufficient_data']
    };
  }

  // Calculate trend using simple linear regression
  const scores = recoveryScores.map(r => r.score);
  const trend = calculateLinearTrend(scores);

  // Get recent wearable data for factors
  const recentWearable = await WearableData.findOne({ userId })
    .sort({ date: -1 });

  const factors = [];
  
  // Factor in trend
  if (trend > 0.5) factors.push('improving_trend');
  else if (trend < -0.5) factors.push('declining_trend');
  else factors.push('stable_trend');

  // Factor in current HRV
  if (recentWearable?.hrv) {
    if (recentWearable.hrv > 60) factors.push('good_hrv');
    else if (recentWearable.hrv < 40) factors.push('low_hrv');
  }

  // Factor in recent workouts
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentWorkouts = await Workout.countDocuments({
    userId,
    date: { $gte: sevenDaysAgo }
  });

  if (recentWorkouts > 5) factors.push('high_training_volume');
  else if (recentWorkouts < 2) factors.push('low_training_volume');

  // Project future score
  const currentScore = scores[scores.length - 1];
  const predictedScore = currentScore + (trend * horizon);
  const bounded = Math.max(30, Math.min(100, predictedScore));

  return {
    value: Math.round(bounded),
    factors
  };
}

/**
 * Predict illness risk
 */
async function predictIllnessRisk(userId, horizon) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recoveryScores = await RecoveryScore.find({
    userId,
    date: { $gte: thirtyDaysAgo }
  }).sort({ date: 1 });

  const wearableData = await WearableData.find({
    userId,
    date: { $gte: thirtyDaysAgo }
  }).sort({ date: 1 });

  let riskScore = 0;
  const factors = [];

  // Factor 1: Declining HRV
  if (wearableData.length >= 7) {
    const recentHRV = wearableData.slice(-3).reduce((sum, w) => sum + (w.hrv || 0), 0) / 3;
    const olderHRV = wearableData.slice(0, 3).reduce((sum, w) => sum + (w.hrv || 0), 0) / 3;
    
    if (recentHRV < olderHRV * 0.9) {
      riskScore += 25;
      factors.push('declining_hrv');
    }
  }

  // Factor 2: Low recovery scores
  if (recoveryScores.length >= 7) {
    const avgRecovery = recoveryScores.reduce((sum, r) => sum + r.score, 0) / recoveryScores.length;
    if (avgRecovery < 60) {
      riskScore += 25;
      factors.push('chronic_low_recovery');
    }
  }

  // Factor 3: Poor sleep
  if (wearableData.length >= 7) {
    const avgSleep = wearableData.reduce((sum, w) => sum + (w.sleepDuration || 0), 0) / wearableData.length;
    if (avgSleep < 6 * 60) {  // Less than 6 hours
      riskScore += 20;
      factors.push('insufficient_sleep');
    }
  }

  // Factor 4: High training load
  const workouts = await Workout.find({
    userId,
    date: { $gte: thirtyDaysAgo }
  });

  const weeklyAvg = (workouts.length / 4);
  if (weeklyAvg > 6) {
    riskScore += 15;
    factors.push('high_training_frequency');
  }

  // Factor 5: Elevated resting heart rate
  if (wearableData.length >= 7) {
    const recentRHR = wearableData.slice(-3).reduce((sum, w) => sum + (w.restingHeartRate || 0), 0) / 3;
    const baselineRHR = wearableData.slice(0, 10).reduce((sum, w) => sum + (w.restingHeartRate || 0), 0) / 10;
    
    if (recentRHR > baselineRHR * 1.1) {
      riskScore += 15;
      factors.push('elevated_rhr');
    }
  }

  // Cap at 100
  riskScore = Math.min(100, riskScore);

  // Adjust for horizon (longer horizon = slightly lower immediate risk)
  const adjusted = riskScore * (1 - horizon * 0.02);

  return {
    risk: Math.round(Math.max(0, adjusted)),
    factors: factors.length > 0 ? factors : ['normal_range']
  };
}

/**
 * Predict injury risk
 */
async function predictInjuryRisk(userId, horizon) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const workouts = await Workout.find({
    userId,
    date: { $gte: thirtyDaysAgo }
  }).sort({ date: 1 });

  let riskScore = 0;
  const factors = [];

  // Factor 1: Rapid training volume increase
  if (workouts.length >= 14) {
    const week1 = workouts.slice(0, 7);
    const week2 = workouts.slice(7, 14);
    
    const volume1 = week1.reduce((sum, w) => sum + (w.totalVolume || 0), 0);
    const volume2 = week2.reduce((sum, w) => sum + (w.totalVolume || 0), 0);
    
    if (volume2 > volume1 * 1.3) {  // 30% increase
      riskScore += 30;
      factors.push('rapid_volume_increase');
    }
  }

  // Factor 2: Consecutive high-intensity days
  let consecutiveHigh = 0;
  let maxConsecutive = 0;
  
  workouts.slice(-14).forEach(w => {
    if ((w.totalVolume || 0) > 5000) {  // High intensity proxy
      consecutiveHigh++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveHigh);
    } else {
      consecutiveHigh = 0;
    }
  });

  if (maxConsecutive >= 4) {
    riskScore += 25;
    factors.push('insufficient_recovery');
  }

  // Factor 3: Low recovery scores with continued training
  const recoveryScores = await RecoveryScore.find({
    userId,
    date: { $gte: thirtyDaysAgo }
  });

  if (recoveryScores.length >= 7) {
    const recentRecovery = recoveryScores.slice(-7);
    const lowRecoveryDays = recentRecovery.filter(r => r.score < 60).length;
    
    if (lowRecoveryDays >= 4 && workouts.length >= 4) {
      riskScore += 25;
      factors.push('training_through_fatigue');
    }
  }

  // Factor 4: Lack of variety (overuse risk)
  const workoutTypes = new Set(workouts.map(w => w.workoutType));
  if (workoutTypes.size === 1 && workouts.length > 10) {
    riskScore += 15;
    factors.push('lack_of_variety');
  }

  // Factor 5: Previous injury recovery incomplete
  const hasRecentLowVolume = workouts.some(w => (w.notes || '').toLowerCase().includes('injury'));
  if (hasRecentLowVolume) {
    riskScore += 10;
    factors.push('previous_injury_history');
  }

  riskScore = Math.min(100, riskScore);

  return {
    risk: Math.round(riskScore),
    factors: factors.length > 0 ? factors : ['normal_range']
  };
}

/**
 * Predict performance trend
 */
async function predictPerformance(userId, horizon) {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const workouts = await Workout.find({
    userId,
    date: { $gte: sixtyDaysAgo },
    performanceRating: { $exists: true }
  }).sort({ date: 1 });

  if (workouts.length < 10) {
    return {
      value: 5,  // Neutral
      factors: ['insufficient_data']
    };
  }

  // Calculate trend in performance ratings
  const ratings = workouts.map(w => w.performanceRating);
  const trend = calculateLinearTrend(ratings);

  const factors = [];
  const currentPerformance = ratings[ratings.length - 1];

  // Project performance
  let predictedPerformance = currentPerformance + (trend * horizon * 0.1);
  predictedPerformance = Math.max(1, Math.min(10, predictedPerformance));

  // Add factors
  if (trend > 0.1) factors.push('improving_performance');
  else if (trend < -0.1) factors.push('declining_performance');
  else factors.push('stable_performance');

  // Check training consistency
  const recentWorkouts = workouts.slice(-14).length;
  if (recentWorkouts >= 8) factors.push('consistent_training');
  else if (recentWorkouts < 4) factors.push('inconsistent_training');

  return {
    value: Math.round(predictedPerformance * 10) / 10,
    factors
  };
}

/**
 * Predict goal success probability
 */
async function predictGoalSuccess(userId, horizon) {
  const goals = await Goal.find({
    userId,
    status: 'active'
  });

  if (goals.length === 0) {
    return {
      probability: 0,
      factors: ['no_active_goals']
    };
  }

  let totalProbability = 0;
  const factors = [];

  for (const goal of goals) {
    const progress = (goal.progress || 0) / (goal.target || 1);
    const timeElapsed = (new Date() - new Date(goal.createdAt)) / (1000 * 60 * 60 * 24);
    const daysUntilDue = goal.dueDate ? 
      (new Date(goal.dueDate) - new Date()) / (1000 * 60 * 60 * 24) : 
      90;

    // Calculate velocity (progress per day)
    const velocity = progress / timeElapsed;

    // Calculate days needed
    const daysNeeded = (1 - progress) / velocity;

    // Probability based on trajectory
    let probability;
    if (daysNeeded <= daysUntilDue) {
      probability = 75 + Math.min(25, (daysUntilDue - daysNeeded) * 2);
    } else {
      probability = 75 * (daysUntilDue / daysNeeded);
    }

    totalProbability += probability;
  }

  const avgProbability = totalProbability / goals.length;

  // Add factors
  const highProgress = goals.filter(g => (g.progress / g.target) > 0.7).length;
  const onTrack = goals.filter(g => {
    const progress = (g.progress || 0) / (g.target || 1);
    const timeElapsed = (new Date() - new Date(g.createdAt)) / (1000 * 60 * 60 * 24);
    const daysUntilDue = g.dueDate ? 
      (new Date(g.dueDate) - new Date()) / (1000 * 60 * 60 * 24) : 90;
    const expectedProgress = timeElapsed / (timeElapsed + daysUntilDue);
    return progress >= expectedProgress * 0.9;
  }).length;

  if (highProgress > goals.length / 2) factors.push('multiple_goals_near_completion');
  if (onTrack > goals.length / 2) factors.push('on_track');
  else factors.push('behind_schedule');

  return {
    probability: Math.round(avgProbability),
    factors
  };
}

/**
 * Predict energy level
 */
async function predictEnergyLevel(userId, horizon) {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const recoveryScores = await RecoveryScore.find({
    userId,
    date: { $gte: fourteenDaysAgo }
  }).sort({ date: 1 });

  const wearableData = await WearableData.find({
    userId,
    date: { $gte: fourteenDaysAgo }
  }).sort({ date: 1 });

  if (recoveryScores.length < 7 || wearableData.length < 7) {
    return {
      value: 5,
      factors: ['insufficient_data']
    };
  }

  // Calculate energy proxy from recovery and sleep
  const energyScores = recoveryScores.map((r, i) => {
    const wearable = wearableData.find(w => 
      new Date(w.date).toDateString() === new Date(r.date).toDateString()
    );
    
    const sleep = wearable?.sleepDuration || 420;  // 7 hours default
    const sleepScore = Math.min(100, (sleep / 480) * 100);  // 8 hours = 100%
    
    return (r.score * 0.6 + sleepScore * 0.4);
  });

  // Calculate trend
  const trend = calculateLinearTrend(energyScores);
  const currentEnergy = energyScores[energyScores.length - 1];

  // Project energy
  let predictedEnergy = currentEnergy + (trend * horizon);
  predictedEnergy = Math.max(20, Math.min(100, predictedEnergy));

  // Convert to 1-10 scale
  const energyLevel = (predictedEnergy / 10);

  const factors = [];
  if (trend > 1) factors.push('energy_improving');
  else if (trend < -1) factors.push('energy_declining');
  else factors.push('energy_stable');

  // Check sleep quality
  const avgSleep = wearableData.reduce((sum, w) => sum + (w.sleepDuration || 0), 0) / wearableData.length;
  if (avgSleep < 6.5 * 60) factors.push('insufficient_sleep');
  else if (avgSleep >= 8 * 60) factors.push('good_sleep');

  return {
    value: Math.round(energyLevel * 10) / 10,
    factors
  };
}

/**
 * Calculate linear trend
 */
function calculateLinearTrend(values) {
  if (values.length < 2) return 0;

  const n = values.length;
  const indices = Array.from({length: n}, (_, i) => i);

  const sumX = indices.reduce((sum, x) => sum + x, 0);
  const sumY = values.reduce((sum, y) => sum + y, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  return slope;
}

/**
 * Calculate accuracy between predicted and actual
 */
exports.calculateAccuracy = (predicted, actual) => {
  if (!predicted || !actual) return 0;
  
  const difference = Math.abs(predicted - actual);
  const average = (predicted + actual) / 2;
  const percentageError = (difference / average) * 100;
  
  const accuracy = Math.max(0, 100 - percentageError);
  return Math.round(accuracy);
};

/**
 * Calculate accuracy stats for multiple predictions
 */
exports.calculateAccuracyStats = (predictions) => {
  if (predictions.length === 0) {
    return {
      averageAccuracy: 0,
      totalPredictions: 0,
      byType: {},
      trend: 'insufficient_data'
    };
  }

  const totalAccuracy = predictions.reduce((sum, p) => sum + (p.accuracy || 0), 0);
  const avgAccuracy = totalAccuracy / predictions.length;

  // Group by type
  const byType = {};
  predictions.forEach(p => {
    if (!byType[p.predictionType]) {
      byType[p.predictionType] = {
        count: 0,
        totalAccuracy: 0,
        avgAccuracy: 0
      };
    }
    byType[p.predictionType].count++;
    byType[p.predictionType].totalAccuracy += p.accuracy || 0;
  });

  // Calculate averages
  Object.keys(byType).forEach(type => {
    byType[type].avgAccuracy = Math.round(
      byType[type].totalAccuracy / byType[type].count
    );
  });

  // Calculate trend
  const recent = predictions.slice(-10);
  const older = predictions.slice(0, 10);
  
  const recentAvg = recent.reduce((sum, p) => sum + (p.accuracy || 0), 0) / recent.length;
  const olderAvg = older.reduce((sum, p) => sum + (p.accuracy || 0), 0) / older.length;
  
  let trend = 'stable';
  if (recentAvg > olderAvg + 5) trend = 'improving';
  else if (recentAvg < olderAvg - 5) trend = 'declining';

  return {
    averageAccuracy: Math.round(avgAccuracy),
    totalPredictions: predictions.length,
    byType,
    trend,
    recentAccuracy: Math.round(recentAvg)
  };
};

/**
 * Generate forecast for multiple metrics
 */
exports.generateForecast = async (userId, metrics, days) => {
  try {
    const forecast = {
      startDate: new Date(),
      endDate: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      metrics: {}
    };

    for (const metric of metrics) {
      forecast.metrics[metric] = await forecastMetric(userId, metric, days);
    }

    return forecast;

  } catch (error) {
    console.error('Generate forecast error:', error);
    throw error;
  }
};

/**
 * Forecast a specific metric
 */
async function forecastMetric(userId, metric, days) {
  let historical;
  let forecast = [];

  switch (metric) {
    case 'recovery':
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      historical = await RecoveryScore.find({
        userId,
        date: { $gte: thirtyDaysAgo }
      }).sort({ date: 1 });

      if (historical.length >= 7) {
        const scores = historical.map(h => h.score);
        const trend = calculateLinearTrend(scores);
        const current = scores[scores.length - 1];

        for (let i = 1; i <= days; i++) {
          const predicted = Math.max(30, Math.min(100, current + trend * i));
          forecast.push({
            day: i,
            date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
            value: Math.round(predicted),
            confidence: Math.max(40, 90 - i * 2)  // Confidence decreases with time
          });
        }
      }
      break;

    case 'energy':
    case 'performance':
      // Use recovery as proxy
      const recoveryForecast = await forecastMetric(userId, 'recovery', days);
      forecast = recoveryForecast.map(f => ({
        ...f,
        value: Math.round(f.value / 10) // Scale to 1-10
      }));
      break;

    default:
      // Generic forecast
      for (let i = 1; i <= days; i++) {
        forecast.push({
          day: i,
          date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
          value: 70,
          confidence: 50
        });
      }
  }

  return forecast;
}

/**
 * Find optimal performance window
 */
exports.findOptimalWindow = async (userId, activity, days) => {
  try {
    const recoveryForecast = await forecastMetric(userId, 'recovery', days);

    const windows = recoveryForecast.map(f => ({
      date: f.date,
      score: f.value,
      optimal: f.value >= 75,
      good: f.value >= 65 && f.value < 75,
      moderate: f.value >= 50 && f.value < 65,
      poor: f.value < 50,
      confidence: f.confidence
    }));

    // Sort by score (best days first)
    const sorted = [...windows].sort((a, b) => b.score - a.score);

    return {
      activity,
      timeframe: `${days} days`,
      optimalDays: windows.filter(w => w.optimal),
      goodDays: windows.filter(w => w.good),
      bestDay: sorted[0],
      allWindows: windows
    };

  } catch (error) {
    console.error('Find optimal window error:', error);
    throw error;
  }
};

/**
 * Assess burnout risk
 */
exports.assessBurnoutRisk = async (userId) => {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recoveryScores = await RecoveryScore.find({ 
      userId,
      date: { $gte: fourteenDaysAgo }
    }).sort({ date: 1 });

    if (recoveryScores.length < 7) {
      return {
        risk: 'unknown',
        score: 0,
        factors: [],
        message: 'Insufficient data to assess burnout risk'
      };
    }

    let riskScore = 0;
    const factors = [];

    // Factor 1: Low average recovery
    const avgScore = recoveryScores.reduce((sum, s) => sum + s.score, 0) / recoveryScores.length;
    if (avgScore < 60) {
      riskScore += 35;
      factors.push('chronic_low_recovery');
    } else if (avgScore < 70) {
      riskScore += 20;
      factors.push('below_optimal_recovery');
    }

    // Factor 2: Declining trend
    const scores = recoveryScores.map(r => r.score);
    const trend = calculateLinearTrend(scores);
    if (trend < -1) {
      riskScore += 25;
      factors.push('declining_recovery_trend');
    }

    // Factor 3: Consecutive low days
    let consecutiveLow = 0;
    let maxConsecutiveLow = 0;
    recoveryScores.forEach(r => {
      if (r.score < 60) {
        consecutiveLow++;
        maxConsecutiveLow = Math.max(maxConsecutiveLow, consecutiveLow);
      } else {
        consecutiveLow = 0;
      }
    });

    if (maxConsecutiveLow >= 5) {
      riskScore += 30;
      factors.push('extended_low_recovery_period');
    } else if (maxConsecutiveLow >= 3) {
      riskScore += 15;
      factors.push('multiple_consecutive_low_days');
    }

    // Factor 4: High training load with low recovery
    const workouts = await Workout.find({
      userId,
      date: { $gte: fourteenDaysAgo }
    });

    if (workouts.length > 10 && avgScore < 65) {
      riskScore += 20;
      factors.push('high_load_low_recovery');
    }

    // Determine risk level
    let risk = 'low';
    if (riskScore >= 70) risk = 'high';
    else if (riskScore >= 40) risk = 'moderate';

    const recommendations = generateBurnoutRecommendations(risk, factors);

    return {
      risk,
      score: Math.min(100, riskScore),
      averageRecovery: Math.round(avgScore),
      trend: trend < -0.5 ? 'declining' : trend > 0.5 ? 'improving' : 'stable',
      factors,
      recommendations,
      message: getBurnoutMessage(risk)
    };

  } catch (error) {
    console.error('Assess burnout error:', error);
    throw error;
  }
};

function getBurnoutMessage(risk) {
  const messages = {
    low: 'Your burnout risk is low. Continue monitoring recovery and maintaining balance.',
    moderate: 'Moderate burnout risk detected. Consider adding recovery days and reducing training intensity.',
    high: 'High burnout risk! Immediate action recommended: reduce training load, prioritize sleep and recovery.'
  };
  return messages[risk];
}

function generateBurnoutRecommendations(risk, factors) {
  const recommendations = [];

  if (risk === 'high') {
    recommendations.push('Take 2-3 complete rest days immediately');
    recommendations.push('Reduce training volume by 40-50%');
    recommendations.push('Prioritize 8+ hours of sleep');
    recommendations.push('Consider scheduling recovery activities (massage, stretching)');
  } else if (risk === 'moderate') {
    recommendations.push('Add 1-2 extra rest days this week');
    recommendations.push('Reduce training intensity by 20-30%');
    recommendations.push('Focus on recovery protocols');
    recommendations.push('Monitor recovery scores daily');
  } else {
    recommendations.push('Maintain current routine');
    recommendations.push('Continue monitoring recovery');
    recommendations.push('Ensure adequate sleep (7-9 hours)');
  }

  return recommendations;
}

/**
 * Predict weight change
 */
exports.predictWeightChange = async (userId, days) => {
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const measurements = await BodyMeasurement.find({
      userId,
      date: { $gte: sixtyDaysAgo },
      weight: { $exists: true }
    }).sort({ date: 1 });

    if (measurements.length < 4) {
      return {
        currentWeight: measurements.length > 0 ? measurements[measurements.length - 1].weight : 0,
        predictedWeight: 0,
        change: 0,
        confidence: 0,
        factors: ['insufficient_data'],
        message: 'Need more weight measurements to make prediction'
      };
    }

    const weights = measurements.map(m => m.weight);
    const trend = calculateLinearTrend(weights);
    const currentWeight = weights[weights.length - 1];

    // Project weight
    const predictedWeight = currentWeight + (trend * days);

    // Get factors
    const factors = [];
    
    // Check workout frequency
    const workouts = await Workout.find({
      userId,
      date: { $gte: sixtyDaysAgo }
    });
    
    if (workouts.length >= 20) factors.push('consistent_training');
    else if (workouts.length < 8) factors.push('inconsistent_training');

    // Check trend
    if (trend > 0.05) factors.push('weight_gain_trend');
    else if (trend < -0.05) factors.push('weight_loss_trend');
    else factors.push('weight_stable');

    // Calculate confidence
    const dataQuality = Math.min(100, (measurements.length / 30) * 100);
    const consistency = Math.abs(trend) < 0.5 ? 90 : 70;
    const confidence = Math.round((dataQuality + consistency) / 2);

    return {
      currentWeight: Math.round(currentWeight * 10) / 10,
      predictedWeight: Math.round(predictedWeight * 10) / 10,
      change: Math.round((predictedWeight - currentWeight) * 10) / 10,
      changePercent: Math.round(((predictedWeight - currentWeight) / currentWeight) * 100 * 10) / 10,
      confidence,
      factors,
      timeframe: `${days} days`,
      message: `Based on current trends, predicted ${trend > 0 ? 'gain' : 'loss'} of ${Math.abs(predictedWeight - currentWeight).toFixed(1)} lbs`
    };

  } catch (error) {
    console.error('Predict weight error:', error);
    throw error;
  }
};

module.exports = exports;
