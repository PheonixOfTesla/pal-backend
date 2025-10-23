// ============================================
// CORRELATION ENGINE SERVICE - FULLY IMPLEMENTED
// ============================================
// Complete pattern discovery with statistical analysis
// ============================================

const CorrelationPattern = require('../../models/phoenix/CorrelationPattern');
const WearableData = require('../../models/mercury/WearableData');
const Workout = require('../../models/venus/Workout');
const Transaction = require('../../models/jupiter/Transaction');
const CalendarEvent = require('../../models/earth/CalendarEvent');
const RecoveryScore = require('../../models/mercury/RecoveryScore');
const Goal = require('../../models/mars/Goal');

/**
 * Analyze user for correlation patterns
 */
exports.analyzeUser = async (userId, domains, minConfidence) => {
  try {
    const patterns = [];
    const insights = [];
    const recommendations = [];

    // Get historical data (90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Sleep-Recovery correlation
    if (domains.includes('all') || domains.includes('sleep')) {
      const sleepRecoveryPattern = await analyzeSleepRecovery(userId, ninetyDaysAgo, minConfidence);
      if (sleepRecoveryPattern) {
        patterns.push(sleepRecoveryPattern);
        insights.push('Sleep quality significantly impacts recovery');
      }
    }

    // Workout-Recovery correlation
    if (domains.includes('all') || domains.includes('workout')) {
      const workoutRecoveryPattern = await analyzeWorkoutRecovery(userId, ninetyDaysAgo, minConfidence);
      if (workoutRecoveryPattern) {
        patterns.push(workoutRecoveryPattern);
        insights.push('Training volume affects next-day recovery');
      }
    }

    // Stress-Spending correlation (HRV as stress proxy)
    if (domains.includes('all') || domains.includes('finance')) {
      const stressSpendingPattern = await analyzeStressSpending(userId, ninetyDaysAgo, minConfidence);
      if (stressSpendingPattern) {
        patterns.push(stressSpendingPattern);
        insights.push('Stress levels correlate with spending behavior');
      }
    }

    // Calendar-Recovery correlation
    if (domains.includes('all') || domains.includes('calendar')) {
      const calendarRecoveryPattern = await analyzeCalendarRecovery(userId, ninetyDaysAgo, minConfidence);
      if (calendarRecoveryPattern) {
        patterns.push(calendarRecoveryPattern);
        insights.push('Meeting load impacts recovery');
      }
    }

    // HRV-Performance correlation
    if (domains.includes('all') || domains.includes('performance')) {
      const hrvPerformancePattern = await analyzeHRVPerformance(userId, ninetyDaysAgo, minConfidence);
      if (hrvPerformancePattern) {
        patterns.push(hrvPerformancePattern);
        insights.push('HRV predicts workout performance');
      }
    }

    // Save new patterns to database
    for (const pattern of patterns) {
      // Check if pattern already exists
      const existing = await CorrelationPattern.findOne({
        userId,
        patternType: pattern.patternType
      });

      if (existing) {
        // Update existing pattern
        existing.correlation = pattern.correlation;
        existing.lastValidated = new Date();
        existing.outcomes = pattern.outcomes || [];
        await existing.save();
      } else {
        // Create new pattern
        await CorrelationPattern.create({
          userId,
          ...pattern,
          isActive: true,
          lastValidated: new Date()
        });
      }
    }

    // Generate recommendations based on patterns
    if (patterns.length > 0) {
      patterns.forEach(pattern => {
        const recommendation = generateRecommendation(pattern);
        if (recommendation) {
          recommendations.push(recommendation);
        }
      });
    } else {
      insights.push('Need more data to detect significant patterns');
      recommendations.push('Continue tracking for 2-4 more weeks');
    }

    return {
      patterns,
      insights,
      recommendations
    };

  } catch (error) {
    console.error('Analyze user error:', error);
    throw error;
  }
};

/**
 * Analyze sleep-recovery correlation
 */
async function analyzeSleepRecovery(userId, startDate, minConfidence) {
  try {
    // Get wearable data with sleep
    const wearableData = await WearableData.find({
      userId,
      date: { $gte: startDate },
      sleepDuration: { $exists: true, $gt: 0 }
    }).sort({ date: 1 });

    // Get recovery scores
    const recoveryScores = await RecoveryScore.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    if (wearableData.length < 14 || recoveryScores.length < 14) {
      return null; // Need at least 2 weeks of data
    }

    // Match sleep data with next-day recovery
    const pairs = [];
    for (const wearable of wearableData) {
      const nextDay = new Date(wearable.date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const recovery = recoveryScores.find(r => {
        const rDate = new Date(r.date);
        return rDate.toDateString() === nextDay.toDateString();
      });

      if (recovery && wearable.sleepDuration) {
        pairs.push({
          sleep: wearable.sleepDuration, // in minutes
          recovery: recovery.score
        });
      }
    }

    if (pairs.length < 14) return null;

    // Calculate Pearson correlation
    const correlation = calculatePearsonCorrelation(
      pairs.map(p => p.sleep),
      pairs.map(p => p.recovery)
    );

    // Calculate confidence (based on sample size and r-squared)
    const rSquared = correlation.coefficient ** 2;
    const confidence = Math.min(
      100,
      (pairs.length / 30) * 50 + rSquared * 50
    );

    if (confidence < minConfidence) return null;

    // Determine threshold and direction
    const avgSleep = pairs.reduce((sum, p) => sum + p.sleep, 0) / pairs.length;
    const goodSleep = avgSleep + 60; // 1 hour above average
    const poorSleep = avgSleep - 60; // 1 hour below average

    return {
      patternType: 'sleep_performance',
      primaryMetric: {
        name: 'sleepDuration',
        source: 'wearable',
        threshold: goodSleep,
        direction: 'increase'
      },
      secondaryMetric: {
        name: 'recoveryScore',
        source: 'wearable',
        threshold: 70,
        direction: 'increase'
      },
      correlation: {
        strength: correlation.coefficient,
        confidence: Math.round(confidence),
        sampleSize: pairs.length,
        pValue: correlation.pValue,
        rsquared: rSquared
      },
      timeRelationship: {
        lag: 0, // Same day / next day
        window: 24,
        periodicity: 'daily'
      },
      triggers: [
        {
          condition: `sleepDuration < ${poorSleep}`,
          threshold: poorSleep,
          action: 'alert_poor_sleep',
          severity: 'medium'
        },
        {
          condition: `sleepDuration > ${goodSleep}`,
          threshold: goodSleep,
          action: 'acknowledge_good_sleep',
          severity: 'low'
        }
      ],
      outcomes: pairs.slice(-10).map(p => ({
        date: new Date(),
        predicted: p.sleep > avgSleep ? 75 : 60,
        actual: p.recovery,
        accuracy: 100 - Math.abs(p.recovery - (p.sleep > avgSleep ? 75 : 60))
      }))
    };

  } catch (error) {
    console.error('Analyze sleep-recovery error:', error);
    return null;
  }
}

/**
 * Analyze workout-recovery correlation
 */
async function analyzeWorkoutRecovery(userId, startDate, minConfidence) {
  try {
    const workouts = await Workout.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    const recoveryScores = await RecoveryScore.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    if (workouts.length < 10 || recoveryScores.length < 10) return null;

    // Calculate workout load for each day
    const dailyLoad = {};
    workouts.forEach(w => {
      const dateKey = new Date(w.date).toDateString();
      if (!dailyLoad[dateKey]) dailyLoad[dateKey] = 0;
      // Simple load calculation: duration * intensity (or volume as proxy)
      dailyLoad[dateKey] += (w.duration || 0) * (w.totalVolume || 100) / 100;
    });

    // Match workout load with next-day recovery
    const pairs = [];
    for (const dateKey in dailyLoad) {
      const nextDay = new Date(dateKey);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const recovery = recoveryScores.find(r => {
        return new Date(r.date).toDateString() === nextDay.toDateString();
      });

      if (recovery) {
        pairs.push({
          load: dailyLoad[dateKey],
          recovery: recovery.score
        });
      }
    }

    if (pairs.length < 10) return null;

    // Calculate negative correlation (more load = lower recovery)
    const correlation = calculatePearsonCorrelation(
      pairs.map(p => p.load),
      pairs.map(p => p.recovery)
    );

    const rSquared = correlation.coefficient ** 2;
    const confidence = Math.min(100, (pairs.length / 20) * 50 + rSquared * 50);

    if (confidence < minConfidence) return null;

    const avgLoad = pairs.reduce((sum, p) => sum + p.load, 0) / pairs.length;
    const highLoad = avgLoad * 1.5;

    return {
      patternType: 'workout_recovery',
      primaryMetric: {
        name: 'workoutLoad',
        source: 'workout',
        threshold: highLoad,
        direction: 'increase'
      },
      secondaryMetric: {
        name: 'recoveryScore',
        source: 'wearable',
        threshold: 60,
        direction: 'decrease'
      },
      correlation: {
        strength: correlation.coefficient,
        confidence: Math.round(confidence),
        sampleSize: pairs.length,
        pValue: correlation.pValue,
        rsquared: rSquared
      },
      timeRelationship: {
        lag: 24,
        window: 24,
        periodicity: 'daily'
      },
      triggers: [
        {
          condition: `workoutLoad > ${highLoad}`,
          threshold: highLoad,
          action: 'warn_high_load',
          severity: 'high'
        }
      ]
    };

  } catch (error) {
    console.error('Analyze workout-recovery error:', error);
    return null;
  }
}

/**
 * Analyze stress-spending correlation (HRV as stress proxy)
 */
async function analyzeStressSpending(userId, startDate, minConfidence) {
  try {
    const wearableData = await WearableData.find({
      userId,
      date: { $gte: startDate },
      hrv: { $exists: true, $gt: 0 }
    }).sort({ date: 1 });

    const transactions = await Transaction.find({
      userId,
      date: { $gte: startDate },
      amount: { $lt: 0 } // Only expenses
    }).sort({ date: 1 });

    if (wearableData.length < 20 || transactions.length < 20) return null;

    // Calculate daily spending
    const dailySpending = {};
    transactions.forEach(t => {
      const dateKey = new Date(t.date).toDateString();
      if (!dailySpending[dateKey]) dailySpending[dateKey] = 0;
      dailySpending[dateKey] += Math.abs(t.amount);
    });

    // Match HRV (stress indicator) with spending
    const pairs = [];
    wearableData.forEach(w => {
      const dateKey = new Date(w.date).toDateString();
      if (dailySpending[dateKey]) {
        pairs.push({
          hrv: w.hrv, // Lower HRV = higher stress
          spending: dailySpending[dateKey]
        });
      }
    });

    if (pairs.length < 15) return null;

    // Calculate correlation (lower HRV should correlate with higher spending)
    const correlation = calculatePearsonCorrelation(
      pairs.map(p => p.hrv),
      pairs.map(p => p.spending)
    );

    // Look for negative correlation (low HRV = high spending)
    if (correlation.coefficient > -0.3) return null;

    const rSquared = correlation.coefficient ** 2;
    const confidence = Math.min(100, (pairs.length / 30) * 50 + rSquared * 50);

    if (confidence < minConfidence) return null;

    const avgHRV = pairs.reduce((sum, p) => sum + p.hrv, 0) / pairs.length;
    const lowHRV = avgHRV * 0.85; // 15% below average

    return {
      patternType: 'stress_spending',
      primaryMetric: {
        name: 'hrv',
        source: 'wearable',
        threshold: lowHRV,
        direction: 'decrease'
      },
      secondaryMetric: {
        name: 'spending',
        source: 'finance',
        threshold: 0,
        direction: 'increase'
      },
      correlation: {
        strength: correlation.coefficient,
        confidence: Math.round(confidence),
        sampleSize: pairs.length,
        pValue: correlation.pValue,
        rsquared: rSquared
      },
      timeRelationship: {
        lag: 0,
        window: 24,
        periodicity: 'daily'
      },
      triggers: [
        {
          condition: `hrv < ${lowHRV}`,
          threshold: lowHRV,
          action: 'warn_stress_spending',
          severity: 'medium'
        }
      ]
    };

  } catch (error) {
    console.error('Analyze stress-spending error:', error);
    return null;
  }
}

/**
 * Analyze calendar-recovery correlation
 */
async function analyzeCalendarRecovery(userId, startDate, minConfidence) {
  try {
    const events = await CalendarEvent.find({
      userId,
      startTime: { $gte: startDate }
    }).sort({ startTime: 1 });

    const recoveryScores = await RecoveryScore.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    if (events.length < 20 || recoveryScores.length < 14) return null;

    // Calculate daily meeting load
    const dailyMeetingLoad = {};
    events.forEach(e => {
      const dateKey = new Date(e.startTime).toDateString();
      if (!dailyMeetingLoad[dateKey]) dailyMeetingLoad[dateKey] = 0;
      
      // Calculate duration in hours
      const duration = (new Date(e.endTime) - new Date(e.startTime)) / (1000 * 60 * 60);
      dailyMeetingLoad[dateKey] += duration;
    });

    // Match meeting load with next-day recovery
    const pairs = [];
    for (const dateKey in dailyMeetingLoad) {
      const nextDay = new Date(dateKey);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const recovery = recoveryScores.find(r => {
        return new Date(r.date).toDateString() === nextDay.toDateString();
      });

      if (recovery) {
        pairs.push({
          meetingHours: dailyMeetingLoad[dateKey],
          recovery: recovery.score
        });
      }
    }

    if (pairs.length < 10) return null;

    const correlation = calculatePearsonCorrelation(
      pairs.map(p => p.meetingHours),
      pairs.map(p => p.recovery)
    );

    // Look for negative correlation
    if (correlation.coefficient > -0.25) return null;

    const rSquared = correlation.coefficient ** 2;
    const confidence = Math.min(100, (pairs.length / 20) * 50 + rSquared * 50);

    if (confidence < minConfidence) return null;

    const avgMeetingHours = pairs.reduce((sum, p) => sum + p.meetingHours, 0) / pairs.length;
    const highMeetingLoad = avgMeetingHours + 2;

    return {
      patternType: 'calendar_recovery',
      primaryMetric: {
        name: 'meetingHours',
        source: 'calendar',
        threshold: highMeetingLoad,
        direction: 'increase'
      },
      secondaryMetric: {
        name: 'recoveryScore',
        source: 'wearable',
        threshold: 65,
        direction: 'decrease'
      },
      correlation: {
        strength: correlation.coefficient,
        confidence: Math.round(confidence),
        sampleSize: pairs.length,
        pValue: correlation.pValue,
        rsquared: rSquared
      },
      timeRelationship: {
        lag: 24,
        window: 24,
        periodicity: 'daily'
      },
      triggers: [
        {
          condition: `meetingHours > ${highMeetingLoad}`,
          threshold: highMeetingLoad,
          action: 'warn_meeting_overload',
          severity: 'medium'
        }
      ]
    };

  } catch (error) {
    console.error('Analyze calendar-recovery error:', error);
    return null;
  }
}

/**
 * Analyze HRV-Performance correlation
 */
async function analyzeHRVPerformance(userId, startDate, minConfidence) {
  try {
    const wearableData = await WearableData.find({
      userId,
      date: { $gte: startDate },
      hrv: { $exists: true, $gt: 0 }
    }).sort({ date: 1 });

    const workouts = await Workout.find({
      userId,
      date: { $gte: startDate },
      performanceRating: { $exists: true }
    }).sort({ date: 1 });

    if (wearableData.length < 15 || workouts.length < 15) return null;

    // Match HRV with workout performance
    const pairs = [];
    workouts.forEach(w => {
      const workoutDate = new Date(w.date);
      const wearable = wearableData.find(wd => {
        const wdDate = new Date(wd.date);
        return wdDate.toDateString() === workoutDate.toDateString();
      });

      if (wearable && w.performanceRating) {
        pairs.push({
          hrv: wearable.hrv,
          performance: w.performanceRating
        });
      }
    });

    if (pairs.length < 10) return null;

    const correlation = calculatePearsonCorrelation(
      pairs.map(p => p.hrv),
      pairs.map(p => p.performance)
    );

    // Look for positive correlation
    if (correlation.coefficient < 0.3) return null;

    const rSquared = correlation.coefficient ** 2;
    const confidence = Math.min(100, (pairs.length / 20) * 50 + rSquared * 50);

    if (confidence < minConfidence) return null;

    const avgHRV = pairs.reduce((sum, p) => sum + p.hrv, 0) / pairs.length;
    const optimalHRV = avgHRV * 1.1;

    return {
      patternType: 'hrv_performance',
      primaryMetric: {
        name: 'hrv',
        source: 'wearable',
        threshold: optimalHRV,
        direction: 'increase'
      },
      secondaryMetric: {
        name: 'performanceRating',
        source: 'workout',
        threshold: 7,
        direction: 'increase'
      },
      correlation: {
        strength: correlation.coefficient,
        confidence: Math.round(confidence),
        sampleSize: pairs.length,
        pValue: correlation.pValue,
        rsquared: rSquared
      },
      timeRelationship: {
        lag: 0,
        window: 24,
        periodicity: 'daily'
      }
    };

  } catch (error) {
    console.error('Analyze HRV-performance error:', error);
    return null;
  }
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculatePearsonCorrelation(x, y) {
  if (x.length !== y.length || x.length === 0) {
    return { coefficient: 0, pValue: 1 };
  }

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) {
    return { coefficient: 0, pValue: 1 };
  }

  const r = numerator / denominator;

  // Calculate p-value (simplified)
  const t = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r);
  const pValue = 2 * (1 - tCDF(Math.abs(t), n - 2));

  return {
    coefficient: r,
    pValue: Math.min(1, Math.max(0, pValue))
  };
}

/**
 * T-distribution CDF (simplified approximation)
 */
function tCDF(t, df) {
  // Simplified approximation for t-distribution CDF
  const x = df / (df + t * t);
  return 1 - 0.5 * Math.pow(x, df / 2);
}

/**
 * Generate insights from patterns
 */
exports.generateInsights = async (userId) => {
  try {
    const patterns = await CorrelationPattern.find({
      userId,
      isActive: true
    }).sort({ 'correlation.strength': -1 });

    const insights = {
      patterns: patterns.length,
      strongest: null,
      recommendations: []
    };

    if (patterns.length > 0) {
      const topPattern = patterns[0];
      insights.strongest = {
        type: topPattern.patternType,
        strength: topPattern.correlation.strength,
        confidence: topPattern.correlation.confidence,
        description: describePattern(topPattern)
      };

      // Generate recommendations based on patterns
      patterns.forEach(pattern => {
        const recommendation = generateRecommendation(pattern);
        if (recommendation) {
          insights.recommendations.push(recommendation);
        }
      });
    }

    return insights;

  } catch (error) {
    console.error('Generate insights error:', error);
    throw error;
  }
};

/**
 * Describe pattern in human-readable format
 */
function describePattern(pattern) {
  const descriptions = {
    'sleep_performance': 'Sleep quality strongly impacts recovery scores',
    'workout_recovery': 'Training volume affects next-day recovery',
    'stress_spending': 'Stress levels influence spending patterns',
    'calendar_recovery': 'Meeting load impacts recovery capacity',
    'hrv_performance': 'HRV predicts workout performance',
    'nutrition_energy': 'Diet quality affects energy levels',
    'goal_motivation': 'Goal progress influences motivation levels'
  };
  
  const desc = descriptions[pattern.patternType] || `${pattern.patternType} pattern detected`;
  const strength = Math.abs(pattern.correlation.strength);
  
  if (strength > 0.7) {
    return `Strong correlation: ${desc}`;
  } else if (strength > 0.5) {
    return `Moderate correlation: ${desc}`;
  } else {
    return `Weak correlation: ${desc}`;
  }
}

/**
 * Generate recommendation from pattern
 */
function generateRecommendation(pattern) {
  if (pattern.correlation.strength > 0.7 || pattern.correlation.strength < -0.7) {
    const recommendations = {
      'sleep_performance': 'Prioritize 7-9 hours of sleep to optimize recovery',
      'workout_recovery': 'Monitor training load to prevent overtraining',
      'stress_spending': 'Be aware of stress-driven purchases - use mindful spending',
      'calendar_recovery': 'Protect recovery time after heavy meeting days',
      'hrv_performance': 'Use HRV to guide training intensity decisions'
    };

    return {
      priority: 'high',
      text: recommendations[pattern.patternType] || 'Monitor this pattern closely',
      action: 'optimize',
      strength: pattern.correlation.strength
    };
  }
  return null;
}

module.exports = exports;
