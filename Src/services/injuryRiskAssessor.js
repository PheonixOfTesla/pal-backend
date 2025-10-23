// Injury Risk Assessor Service
// Analyze injury risk factors and provide prevention recommendations

const Workout = require('../models/Workout');
const InjuryLog = require('../models/InjuryLog');
const WearableData = require('../models/WearableData');

/**
 * Assess overall injury risk
 */
exports.assess = async (userId) => {
  try {
    const riskFactors = [];
    let totalRisk = 0;

    // 1. Training Load Analysis
    const loadRisk = await analyzeTrainingLoad(userId);
    totalRisk += loadRisk.score;
    if (loadRisk.score > 20) {
      riskFactors.push(loadRisk);
    }

    // 2. Recovery Analysis
    const recoveryRisk = await analyzeRecovery(userId);
    totalRisk += recoveryRisk.score;
    if (recoveryRisk.score > 20) {
      riskFactors.push(recoveryRisk);
    }

    // 3. Previous Injury History
    const historyRisk = await analyzeInjuryHistory(userId);
    totalRisk += historyRisk.score;
    if (historyRisk.score > 15) {
      riskFactors.push(historyRisk);
    }

    // 4. Movement Pattern Analysis
    const movementRisk = await analyzeMovementPatterns(userId);
    totalRisk += movementRisk.score;
    if (movementRisk.score > 15) {
      riskFactors.push(movementRisk);
    }

    // Determine overall risk level
    let overallRisk = 'low';
    if (totalRisk > 60) overallRisk = 'high';
    else if (totalRisk > 35) overallRisk = 'medium';

    // Generate recommendations
    const recommendations = generateRecommendations(riskFactors, overallRisk);

    // Generate warnings
    const warnings = riskFactors
      .filter(f => f.score > 25)
      .map(f => `⚠️ ${f.factor}: ${f.description}`);

    return {
      overallRisk,
      totalRiskScore: totalRisk,
      factors: riskFactors.map(f => ({
        factor: f.factor,
        impact: f.score > 25 ? 'high' : f.score > 15 ? 'medium' : 'low',
        description: f.description,
        mitigation: f.mitigation
      })),
      recommendations,
      warnings
    };

  } catch (error) {
    console.error('Injury risk assessment error:', error);
    throw error;
  }
};

/**
 * Analyze training load patterns
 */
async function analyzeTrainingLoad(userId) {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const workouts = await Workout.find({
    userId,
    date: { $gte: fourWeeksAgo },
    completed: true
  }).sort({ date: 1 });

  if (workouts.length < 4) {
    return {
      factor: 'Training Load',
      score: 0,
      description: 'Insufficient data',
      mitigation: 'Continue tracking workouts'
    };
  }

  // Calculate weekly load
  const weeklyLoads = [];
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  for (let week = 0; week < 4; week++) {
    const weekStart = new Date(fourWeeksAgo.getTime() + (week * sevenDaysMs));
    const weekEnd = new Date(weekStart.getTime() + sevenDaysMs);

    const weekWorkouts = workouts.filter(w => 
      w.date >= weekStart && w.date < weekEnd
    );

    const load = weekWorkouts.reduce((sum, w) => {
      return sum + (w.duration || 60) * (w.intensity === 'max' ? 2 : w.intensity === 'hard' ? 1.5 : 1);
    }, 0);

    weeklyLoads.push(load);
  }

  // Calculate acute:chronic ratio
  const acuteLoad = weeklyLoads[3]; // Last week
  const chronicLoad = (weeklyLoads[0] + weeklyLoads[1] + weeklyLoads[2]) / 3; // Average of previous 3 weeks

  const acratio = chronicLoad > 0 ? acuteLoad / chronicLoad : 1;

  let score = 0;
  let description = 'Training load is well-managed';
  let mitigation = 'Continue current training approach';

  // Sweet spot is 0.8-1.3
  if (acratio > 1.5) {
    score = 35;
    description = 'Rapid training load increase detected';
    mitigation = 'Reduce volume by 20-30% this week';
  } else if (acratio > 1.3) {
    score = 20;
    description = 'Training load increasing quickly';
    mitigation = 'Monitor recovery closely, consider deload';
  } else if (acratio < 0.7) {
    score = 15;
    description = 'Training load dropped significantly';
    mitigation = 'Maintain consistency to avoid detraining';
  }

  return {
    factor: 'Training Load',
    score,
    description,
    mitigation,
    metrics: {
      acuteLoad,
      chronicLoad,
      ratio: acratio.toFixed(2)
    }
  };
}

/**
 * Analyze recovery quality
 */
async function analyzeRecovery(userId) {
  const recentRecovery = await WearableData.findOne({ userId })
    .sort({ date: -1 });

  if (!recentRecovery || !recentRecovery.recoveryScore) {
    return {
      factor: 'Recovery',
      score: 10,
      description: 'Recovery data not available',
      mitigation: 'Connect wearable device for recovery tracking'
    };
  }

  const recovery = recentRecovery.recoveryScore;
  let score = 0;
  let description = 'Recovery is adequate';
  let mitigation = 'Continue current recovery practices';

  if (recovery < 50) {
    score = 30;
    description = 'Poor recovery detected';
    mitigation = 'Take 1-2 rest days, prioritize sleep';
  } else if (recovery < 65) {
    score = 20;
    description = 'Below-average recovery';
    mitigation = 'Reduce training intensity, focus on recovery';
  }

  // Check HRV if available
  if (recentRecovery.hrv) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weekData = await WearableData.find({
      userId,
      date: { $gte: sevenDaysAgo }
    }).sort({ date: 1 });

    if (weekData.length >= 5) {
      const avgHRV = weekData.reduce((sum, d) => sum + (d.hrv || 0), 0) / weekData.length;
      const currentHRV = recentRecovery.hrv;

      // HRV dropped > 10% from average
      if (currentHRV < avgHRV * 0.9) {
        score += 15;
        description = 'HRV significantly below baseline';
        mitigation = 'High stress/fatigue detected - prioritize recovery';
      }
    }
  }

  return {
    factor: 'Recovery',
    score: Math.min(30, score),
    description,
    mitigation,
    metrics: {
      recoveryScore: recovery,
      hrv: recentRecovery.hrv
    }
  };
}

/**
 * Analyze injury history
 */
async function analyzeInjuryHistory(userId) {
  const activeInjuries = await InjuryLog.find({
    userId,
    status: { $in: ['active', 'recovering'] }
  });

  const recentInjuries = await InjuryLog.find({
    userId,
    dateOccurred: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } // Last 6 months
  });

  let score = 0;
  let description = 'No significant injury history';
  let mitigation = 'Continue preventive exercises';

  if (activeInjuries.length > 0) {
    score = 30;
    description = `${activeInjuries.length} active injury/injuries`;
    mitigation = 'Modify training around injuries, seek professional guidance';
  } else if (recentInjuries.length >= 3) {
    score = 25;
    description = 'Multiple recent injuries - pattern detected';
    mitigation = 'Review training program, ensure adequate recovery';
  } else if (recentInjuries.length >= 1) {
    score = 15;
    description = 'Recent injury history';
    mitigation = 'Progressive return to training, monitor for re-injury';
  }

  // Check for recurrent injuries
  const recurrent = recentInjuries.filter(inj => inj.recurrence.isPreviousInjury);
  if (recurrent.length > 0) {
    score += 10;
    mitigation = 'Address underlying weakness causing recurrent injuries';
  }

  return {
    factor: 'Injury History',
    score: Math.min(30, score),
    description,
    mitigation,
    metrics: {
      activeInjuries: activeInjuries.length,
      recentInjuries: recentInjuries.length,
      recurrent: recurrent.length
    }
  };
}

/**
 * Analyze movement patterns
 */
async function analyzeMovementPatterns(userId) {
  const recentWorkouts = await Workout.find({
    userId,
    completed: true
  }).sort({ date: -1 }).limit(20);

  if (recentWorkouts.length < 5) {
    return {
      factor: 'Movement Patterns',
      score: 0,
      description: 'Insufficient workout data',
      mitigation: 'Continue tracking workouts'
    };
  }

  let score = 0;
  let description = 'Movement patterns appear balanced';
  let mitigation = 'Maintain varied training';

  // Check for muscle group imbalances
  const muscleGroupFrequency = {};
  
  recentWorkouts.forEach(workout => {
    if (workout.type) {
      muscleGroupFrequency[workout.type] = (muscleGroupFrequency[workout.type] || 0) + 1;
    }
  });

  // Check for overemphasis on one type
  const maxFreq = Math.max(...Object.values(muscleGroupFrequency));
  const totalWorkouts = recentWorkouts.length;

  if (maxFreq / totalWorkouts > 0.7) {
    score = 20;
    description = 'Training heavily focused on one modality';
    mitigation = 'Incorporate variety to prevent overuse injuries';
  }

  // Check for consecutive high-intensity days
  let consecutiveHard = 0;
  let maxConsecutive = 0;

  recentWorkouts.reverse().forEach(workout => {
    if (workout.intensity === 'hard' || workout.intensity === 'max') {
      consecutiveHard++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveHard);
    } else {
      consecutiveHard = 0;
    }
  });

  if (maxConsecutive >= 4) {
    score += 20;
    description = 'Multiple consecutive high-intensity sessions';
    mitigation = 'Incorporate easy days between hard sessions';
  }

  return {
    factor: 'Movement Patterns',
    score: Math.min(25, score),
    description,
    mitigation,
    metrics: {
      muscleGroupBalance: muscleGroupFrequency,
      maxConsecutiveHard: maxConsecutive
    }
  };
}

/**
 * Generate comprehensive recommendations
 */
function generateRecommendations(riskFactors, overallRisk) {
  const recommendations = [];

  if (overallRisk === 'high') {
    recommendations.push({
      priority: 'immediate',
      action: 'Take 2-3 rest days for recovery',
      reason: 'High injury risk detected'
    });
    recommendations.push({
      priority: 'immediate',
      action: 'Reduce training volume by 30-40%',
      reason: 'Prevent overtraining injury'
    });
  } else if (overallRisk === 'medium') {
    recommendations.push({
      priority: 'soon',
      action: 'Schedule a deload week within 2 weeks',
      reason: 'Elevated injury risk'
    });
  }

  // Add specific recommendations based on factors
  riskFactors.forEach(factor => {
    if (factor.mitigation) {
      recommendations.push({
        priority: factor.score > 25 ? 'immediate' : 'routine',
        action: factor.mitigation,
        reason: factor.description
      });
    }
  });

  // General prevention
  recommendations.push({
    priority: 'routine',
    action: 'Perform dynamic warm-up before training',
    reason: 'Injury prevention'
  });
  recommendations.push({
    priority: 'routine',
    action: 'Include mobility work 2-3x per week',
    reason: 'Maintain joint health'
  });

  return recommendations;
}

module.exports = exports;
