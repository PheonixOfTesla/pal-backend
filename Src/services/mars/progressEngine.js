// Progress Engine Service
// Body composition analysis, recomp tracking, symmetry analysis

const Measurement = require('../models/Measurement');
const Workout = require('../models/Workout');

/**
 * Analyze body composition with predictions
 */
exports.analyzeComposition = async (userId) => {
  try {
    const measurements = await Measurement.find({ userId })
      .sort({ date: -1 })
      .limit(30);

    if (measurements.length === 0) {
      return {
        current: null,
        starting: null,
        changes: null,
        predictions: null,
        message: 'No measurements found'
      };
    }

    const current = measurements[0];
    const starting = measurements[measurements.length - 1];

    // Calculate changes
    const changes = {
      weight: {
        value: current.weight - starting.weight,
        percentage: ((current.weight - starting.weight) / starting.weight * 100).toFixed(1)
      },
      bodyFat: {
        value: (current.bodyFat - starting.bodyFat).toFixed(1),
        percentage: ((current.bodyFat - starting.bodyFat) / starting.bodyFat * 100).toFixed(1)
      },
      muscleMass: current.muscleMass && starting.muscleMass ? {
        value: (current.muscleMass - starting.muscleMass).toFixed(1),
        percentage: ((current.muscleMass - starting.muscleMass) / starting.muscleMass * 100).toFixed(1)
      } : null
    };

    // Calculate weekly rate of change
    const daysDiff = (current.date - starting.date) / (1000 * 60 * 60 * 24);
    const weeksDiff = daysDiff / 7;
    
    const weeklyChange = {
      weight: (changes.weight.value / weeksDiff).toFixed(2),
      bodyFat: current.bodyFat && starting.bodyFat ? 
        ((current.bodyFat - starting.bodyFat) / weeksDiff).toFixed(2) : null
    };

    // Predict 4 weeks out
    const predictions = {
      fourWeeks: {
        weight: (current.weight + (weeklyChange.weight * 4)).toFixed(1),
        bodyFat: current.bodyFat && weeklyChange.bodyFat ? 
          (current.bodyFat + (weeklyChange.bodyFat * 4)).toFixed(1) : null
      },
      twelveWeeks: {
        weight: (current.weight + (weeklyChange.weight * 12)).toFixed(1),
        bodyFat: current.bodyFat && weeklyChange.bodyFat ? 
          (current.bodyFat + (weeklyChange.bodyFat * 12)).toFixed(1) : null
      }
    };

    return {
      current: {
        weight: current.weight,
        bodyFat: current.bodyFat,
        muscleMass: current.muscleMass,
        date: current.date
      },
      starting: {
        weight: starting.weight,
        bodyFat: starting.bodyFat,
        muscleMass: starting.muscleMass,
        date: starting.date
      },
      changes,
      weeklyChange,
      predictions,
      daysTracked: Math.round(daysDiff)
    };

  } catch (error) {
    console.error('Composition analysis error:', error);
    throw error;
  }
};

/**
 * Analyze body recomposition (simultaneous fat loss + muscle gain)
 */
exports.analyzeRecomp = async (userId) => {
  try {
    const measurements = await Measurement.find({ userId })
      .sort({ date: -1 })
      .limit(12); // 12 weeks

    if (measurements.length < 2) {
      return {
        recompScore: 0,
        message: 'Need at least 2 measurements to analyze recomposition'
      };
    }

    const current = measurements[0];
    const start = measurements[measurements.length - 1];

    // Calculate changes
    const weightChange = current.weight - start.weight;
    const bodyFatChange = current.bodyFat - start.bodyFat;
    const muscleMassChange = current.muscleMass && start.muscleMass ? 
      current.muscleMass - start.muscleMass : null;

    // Recomp is happening if:
    // 1. Weight stays stable or slightly decreases
    // 2. Body fat decreases
    // 3. Muscle mass increases (if tracked)

    let recompScore = 0;

    // Weight component (20 points for staying within 5 lbs)
    if (Math.abs(weightChange) <= 5) {
      recompScore += 20;
    }

    // Body fat component (40 points for decrease)
    if (bodyFatChange < 0) {
      recompScore += Math.min(40, Math.abs(bodyFatChange) * 10);
    }

    // Muscle mass component (40 points for increase)
    if (muscleMassChange && muscleMassChange > 0) {
      recompScore += Math.min(40, muscleMassChange * 4);
    } else {
      // If no muscle mass data, estimate from weight + body fat
      const estimatedLeanGain = -weightChange - (weightChange * (bodyFatChange / 100));
      if (estimatedLeanGain > 0) {
        recompScore += Math.min(40, estimatedLeanGain * 4);
      }
    }

    const daysDiff = (current.date - start.date) / (1000 * 60 * 60 * 24);
    const weeksDiff = daysDiff / 7;

    return {
      recompScore: Math.min(100, Math.round(recompScore)),
      fatLoss: bodyFatChange < 0 ? Math.abs(bodyFatChange).toFixed(1) : 0,
      muscleGain: muscleMassChange > 0 ? muscleMassChange.toFixed(1) : 0,
      rate: {
        fatLossPerWeek: (Math.abs(bodyFatChange) / weeksDiff).toFixed(2),
        muscleGainPerWeek: muscleMassChange ? (muscleMassChange / weeksDiff).toFixed(2) : 'N/A'
      },
      efficiency: recompScore >= 80 ? 'excellent' : recompScore >= 60 ? 'good' : 'moderate',
      recommendations: generateRecompRecommendations(recompScore, bodyFatChange, muscleMassChange)
    };

  } catch (error) {
    console.error('Recomp analysis error:', error);
    throw error;
  }
};

/**
 * Analyze muscle symmetry
 */
exports.analyzeSymmetry = async (userId) => {
  try {
    const latest = await Measurement.findOne({ userId })
      .sort({ date: -1 });

    if (!latest || !latest.circumferences) {
      return {
        symmetry: null,
        message: 'No circumference measurements found'
      };
    }

    const { circumferences } = latest;
    const imbalances = [];
    const exercises = [];

    // Check arm symmetry
    if (circumferences.bicepLeft && circumferences.bicepRight) {
      const diff = Math.abs(circumferences.bicepLeft - circumferences.bicepRight);
      const avgSize = (circumferences.bicepLeft + circumferences.bicepRight) / 2;
      const diffPercent = (diff / avgSize * 100).toFixed(1);

      if (diff > 0.5) {
        imbalances.push({
          bodyPart: 'Arms',
          difference: `${diff}" (${diffPercent}%)`,
          concern: diff > 1 ? 'moderate' : 'minor'
        });
        exercises.push('Single-arm dumbbell curls (focus on weaker side)');
      }
    }

    // Check leg symmetry
    if (circumferences.thighLeft && circumferences.thighRight) {
      const diff = Math.abs(circumferences.thighLeft - circumferences.thighRight);
      const avgSize = (circumferences.thighLeft + circumferences.thighRight) / 2;
      const diffPercent = (diff / avgSize * 100).toFixed(1);

      if (diff > 0.5) {
        imbalances.push({
          bodyPart: 'Thighs',
          difference: `${diff}" (${diffPercent}%)`,
          concern: diff > 1 ? 'moderate' : 'minor'
        });
        exercises.push('Bulgarian split squats');
        exercises.push('Single-leg deadlifts');
      }
    }

    // Check calf symmetry
    if (circumferences.calfLeft && circumferences.calfRight) {
      const diff = Math.abs(circumferences.calfLeft - circumferences.calfRight);
      if (diff > 0.5) {
        imbalances.push({
          bodyPart: 'Calves',
          difference: `${diff}"`,
          concern: 'minor'
        });
        exercises.push('Single-leg calf raises');
      }
    }

    return {
      symmetry: {
        arms: circumferences.bicepLeft && circumferences.bicepRight ? {
          left: circumferences.bicepLeft,
          right: circumferences.bicepRight,
          difference: Math.abs(circumferences.bicepLeft - circumferences.bicepRight).toFixed(2),
          balanced: Math.abs(circumferences.bicepLeft - circumferences.bicepRight) < 0.5
        } : null,
        legs: circumferences.thighLeft && circumferences.thighRight ? {
          left: circumferences.thighLeft,
          right: circumferences.thighRight,
          difference: Math.abs(circumferences.thighLeft - circumferences.thighRight).toFixed(2),
          balanced: Math.abs(circumferences.thighLeft - circumferences.thighRight) < 0.5
        } : null
      },
      imbalances,
      exercises,
      overallBalance: imbalances.length === 0 ? 'excellent' : 
        imbalances.length <= 2 ? 'good' : 'needs-attention'
    };

  } catch (error) {
    console.error('Symmetry analysis error:', error);
    throw error;
  }
};

/**
 * Analyze fat distribution pattern
 */
exports.analyzeFatDistribution = async (userId) => {
  try {
    const latest = await Measurement.findOne({ userId })
      .sort({ date: -1 });

    if (!latest || !latest.circumferences) {
      return {
        distribution: null,
        message: 'No measurements found'
      };
    }

    const { waist, hips, chest, bodyFat } = latest;

    // Calculate waist-to-hip ratio
    const whr = waist && hips ? (waist / hips).toFixed(2) : null;

    // Determine pattern
    let pattern = 'balanced';
    let healthRisk = 'low';

    if (whr) {
      if (whr > 0.90) {
        pattern = 'apple'; // Android - more visceral fat
        healthRisk = 'moderate-high';
      } else if (whr < 0.80) {
        pattern = 'pear'; // Gynoid - subcutaneous fat
        healthRisk = 'low';
      }
    }

    // Estimate regional fat
    const distribution = {
      android: null,  // Upper body/abdomen
      gynoid: null,   // Hips/thighs
      trunk: null,
      limbs: null
    };

    if (bodyFat && waist && hips) {
      // Simplified estimation
      distribution.android = pattern === 'apple' ? 'high' : pattern === 'pear' ? 'low' : 'moderate';
      distribution.gynoid = pattern === 'pear' ? 'high' : pattern === 'apple' ? 'low' : 'moderate';
    }

    return {
      distribution,
      pattern,
      whr,
      healthRisk,
      recommendations: [
        pattern === 'apple' ? 'Focus on reducing visceral fat through cardio' : 
        'Continue balanced training approach',
        'Monitor waist circumference monthly',
        healthRisk !== 'low' ? 'Consider consulting with a healthcare provider' : 
        'Current fat distribution is healthy'
      ]
    };

  } catch (error) {
    console.error('Fat distribution analysis error:', error);
    throw error;
  }
};

/**
 * Calculate performance benchmarks
 */
exports.calculateBenchmarks = async (userId) => {
  try {
    const workouts = await Workout.find({ userId, completed: true })
      .sort({ date: -1 })
      .limit(50)
      .populate('exercises.exerciseId');

    if (workouts.length === 0) {
      return {
        benchmarks: null,
        message: 'No workout data found'
      };
    }

    // Find personal records for major lifts
    const prs = {};
    const exercises = ['squat', 'deadlift', 'bench press', 'overhead press'];

    workouts.forEach(workout => {
      workout.exercises.forEach(ex => {
        const exerciseName = ex.exerciseId?.name?.toLowerCase() || '';
        
        exercises.forEach(lift => {
          if (exerciseName.includes(lift)) {
            ex.sets.forEach(set => {
              if (set.weight && set.reps) {
                const estimated1RM = set.weight * (1 + set.reps / 30); // Brzycki formula
                
                if (!prs[lift] || estimated1RM > prs[lift].weight) {
                  prs[lift] = {
                    weight: estimated1RM.toFixed(1),
                    actualWeight: set.weight,
                    reps: set.reps,
                    date: workout.date
                  };
                }
              }
            });
          }
        });
      });
    });

    // Determine strength category (simplified)
    const totalLifts = Object.values(prs).reduce((sum, pr) => sum + parseFloat(pr.weight), 0);
    let category = 'beginner';
    
    if (totalLifts > 800) category = 'advanced';
    else if (totalLifts > 600) category = 'intermediate';
    else if (totalLifts > 400) category = 'novice';

    return {
      benchmarks: prs,
      category,
      totalStrength: totalLifts.toFixed(0),
      nextMilestone: {
        category: category === 'beginner' ? 'novice' : 
                  category === 'novice' ? 'intermediate' : 
                  category === 'intermediate' ? 'advanced' : 'elite',
        target: category === 'beginner' ? 400 : 
                category === 'novice' ? 600 : 
                category === 'intermediate' ? 800 : 1000
      },
      percentile: Math.min(95, Math.max(5, Math.round(totalLifts / 10)))
    };

  } catch (error) {
    console.error('Benchmark calculation error:', error);
    throw error;
  }
};

function generateRecompRecommendations(score, fatChange, muscleChange) {
  const recommendations = [];

  if (score >= 80) {
    recommendations.push('Excellent recomp progress - maintain current approach');
  } else {
    if (fatChange >= 0) {
      recommendations.push('Increase cardio or create a slight calorie deficit');
    }
    if (!muscleChange || muscleChange <= 0) {
      recommendations.push('Increase protein intake and progressive overload in strength training');
    }
  }

  recommendations.push('Track measurements every 2-4 weeks for best progress monitoring');
  
  return recommendations;
}

module.exports = exports;
