// Workout Intelligence Service
// AI-powered workout recommendations, form analysis, and periodization

const Workout = require('../models/Workout');
const Exercise = require('../models/Exercise');
const WearableData = require('../models/WearableData');

/**
 * Generate workout recommendations based on user preferences and goals
 */
exports.recommend = async (userId, preferences = {}) => {
  try {
    const {
      goals = [],
      equipment = [],
      timeAvailable = 60,
      muscleGroups = [],
      difficulty = 'intermediate',
      workoutType = 'strength'
    } = preferences;

    // Get recent workouts for context
    const recentWorkouts = await Workout.find({ userId })
      .sort({ date: -1 })
      .limit(10)
      .populate('exercises.exerciseId');

    // Get available exercises based on equipment
    let exerciseQuery = { category: workoutType };
    if (equipment.length > 0) {
      exerciseQuery.equipment = { $in: equipment };
    }
    if (muscleGroups.length > 0) {
      exerciseQuery.muscleGroups = { $in: muscleGroups };
    }
    
    const availableExercises = await Exercise.find(exerciseQuery);

    // Build workout recommendations
    const workouts = [];
    
    // Algorithm: Create 3 workout options
    for (let i = 0; i < 3; i++) {
      const workout = {
        name: `${workoutType.charAt(0).toUpperCase() + workoutType.slice(1)} Workout ${i + 1}`,
        type: workoutType,
        difficulty,
        estimatedDuration: timeAvailable,
        exercises: [],
        reasoning: []
      };

      // Select 4-6 exercises
      const exerciseCount = Math.floor(Math.random() * 3) + 4; // 4-6 exercises
      const selectedExercises = [];

      // Prioritize compound movements
      const compoundExercises = availableExercises.filter(ex => 
        ['bench-press', 'squat', 'deadlift', 'overhead-press'].some(compound => 
          ex.name.toLowerCase().includes(compound)
        )
      );

      // Add 1-2 compound exercises
      if (compoundExercises.length > 0) {
        const compound = compoundExercises[Math.floor(Math.random() * compoundExercises.length)];
        selectedExercises.push({
          exerciseId: compound._id,
          name: compound.name,
          sets: difficulty === 'beginner' ? 3 : difficulty === 'advanced' ? 5 : 4,
          reps: '8-12',
          restTime: 120
        });
        workout.reasoning.push(`Started with compound movement: ${compound.name}`);
      }

      // Add remaining exercises
      while (selectedExercises.length < exerciseCount && availableExercises.length > 0) {
        const randomExercise = availableExercises[
          Math.floor(Math.random() * availableExercises.length)
        ];
        
        if (!selectedExercises.find(e => e.exerciseId === randomExercise._id)) {
          selectedExercises.push({
            exerciseId: randomExercise._id,
            name: randomExercise.name,
            sets: 3,
            reps: '10-15',
            restTime: 90
          });
        }
      }

      workout.exercises = selectedExercises;
      workout.reasoning.push(`Total exercises: ${selectedExercises.length}`);
      workout.reasoning.push(`Estimated time: ${timeAvailable} minutes`);
      
      workouts.push(workout);
    }

    return {
      workouts,
      reasoning: [
        `Generated ${workouts.length} workout options`,
        `Based on ${equipment.length} equipment types`,
        `Targeting ${muscleGroups.length || 'all'} muscle groups`
      ],
      alternatives: workouts.map(w => w.name)
    };

  } catch (error) {
    console.error('Workout recommendation error:', error);
    throw error;
  }
};

/**
 * Analyze form based on workout data patterns
 */
exports.analyzeForm = async (exerciseData) => {
  try {
    const {
      exerciseId,
      recentSets = [],
      progressionHistory = []
    } = exerciseData;

    const issues = [];
    const recommendations = [];
    let formScore = 100;

    // Analyze weight progression
    if (progressionHistory.length >= 3) {
      const weights = progressionHistory.map(h => h.weight);
      const hasDecrease = weights.some((w, i) => i > 0 && w < weights[i - 1]);
      
      if (hasDecrease) {
        issues.push('Weight decrease detected - possible form breakdown');
        formScore -= 15;
        recommendations.push('Consider reducing weight to maintain proper form');
      }
    }

    // Analyze rep consistency
    if (recentSets.length >= 3) {
      const reps = recentSets.map(s => s.reps);
      const repVariance = Math.max(...reps) - Math.min(...reps);
      
      if (repVariance > 5) {
        issues.push('Large variance in reps across sets');
        formScore -= 10;
        recommendations.push('Focus on consistent rep ranges to ensure proper form');
      }
    }

    // Analyze RPE if available
    const avgRPE = recentSets.reduce((sum, s) => sum + (s.rpe || 7), 0) / recentSets.length;
    if (avgRPE > 9) {
      issues.push('Consistently high RPE may compromise form');
      formScore -= 10;
      recommendations.push('Leave 1-2 reps in reserve for better form');
    }

    // Check rest times
    const avgRest = recentSets.reduce((sum, s) => sum + (s.restTime || 90), 0) / recentSets.length;
    if (avgRest < 60 && exerciseData.type === 'strength') {
      issues.push('Short rest periods for strength training');
      formScore -= 5;
      recommendations.push('Increase rest to 2-3 minutes for compound lifts');
    }

    // Add positive feedback if score is good
    if (formScore >= 90) {
      recommendations.push('Form appears consistent - keep up the good work!');
    }

    return {
      formScore: Math.max(0, formScore),
      issues,
      recommendations,
      analysis: {
        avgRPE,
        avgRest,
        consistency: formScore >= 85 ? 'high' : formScore >= 70 ? 'medium' : 'low'
      }
    };

  } catch (error) {
    console.error('Form analysis error:', error);
    throw error;
  }
};

/**
 * Plan deload week based on training load
 */
exports.planDeload = async (userId) => {
  try {
    // Get last 4 weeks of workouts
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const workouts = await Workout.find({
      userId,
      date: { $gte: fourWeeksAgo },
      completed: true
    }).sort({ date: 1 });

    // Calculate weekly volume
    const weeklyVolumes = {};
    workouts.forEach(workout => {
      const week = Math.floor(
        (workout.date - fourWeeksAgo) / (7 * 24 * 60 * 60 * 1000)
      );
      
      const volume = workout.exercises.reduce((sum, ex) => {
        return sum + ex.sets.reduce((setSum, set) => {
          return setSum + (set.weight || 0) * (set.reps || 0);
        }, 0);
      }, 0);

      weeklyVolumes[week] = (weeklyVolumes[week] || 0) + volume;
    });

    const volumes = Object.values(weeklyVolumes);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    // Check for overreaching indicators
    const lastWeekVolume = volumes[volumes.length - 1] || 0;
    const volumeIncrease = ((lastWeekVolume - avgVolume) / avgVolume) * 100;

    let deloadNeeded = false;
    let reason = [];

    // Deload indicators
    if (workouts.length >= 12) { // 3+ workouts per week for 4 weeks
      deloadNeeded = true;
      reason.push('4 weeks of consistent training completed');
    }

    if (volumeIncrease > 30) {
      deloadNeeded = true;
      reason.push('Significant volume increase detected');
    }

    // Get recovery data if available
    const recentRecovery = await WearableData.findOne({
      userId
    }).sort({ date: -1 });

    if (recentRecovery && recentRecovery.recoveryScore < 60) {
      deloadNeeded = true;
      reason.push('Low recovery score');
    }

    // Generate deload workouts
    const deloadWorkouts = [];
    if (deloadNeeded) {
      const recentWorkoutTypes = [...new Set(workouts.slice(-3).map(w => w.type))];
      
      recentWorkoutTypes.forEach(type => {
        deloadWorkouts.push({
          name: `Deload ${type}`,
          type,
          volume: '50% of normal',
          intensity: '60-70% of max',
          duration: 30,
          notes: 'Focus on technique and movement quality'
        });
      });
    }

    return {
      deloadNeeded,
      reason: reason.join(', '),
      recommendation: deloadNeeded 
        ? 'Schedule a deload week with 40-50% volume reduction'
        : 'Continue current training - deload not needed yet',
      deloadWorkouts,
      metrics: {
        weeklyVolumes,
        avgVolume,
        volumeIncrease: volumeIncrease.toFixed(1),
        workoutsLast4Weeks: workouts.length
      }
    };

  } catch (error) {
    console.error('Deload planning error:', error);
    throw error;
  }
};

/**
 * Create periodization plan
 */
exports.createPeriodizationPlan = async (userId, data) => {
  try {
    const {
      goal = 'strength',
      duration = 12, // weeks
      experience = 'intermediate'
    } = data;

    const plan = [];
    
    // Phase 1: Hypertrophy (4 weeks)
    for (let week = 1; week <= 4; week++) {
      plan.push({
        week,
        phase: 'Hypertrophy',
        volume: experience === 'beginner' ? 'Medium' : 'High',
        intensity: '65-75% 1RM',
        sets: '3-4',
        reps: '8-12',
        focus: 'Muscle building and work capacity',
        exercisesPerWorkout: experience === 'beginner' ? 4 : 6
      });
    }

    // Phase 2: Strength (4 weeks)
    for (let week = 5; week <= 8; week++) {
      plan.push({
        week,
        phase: 'Strength',
        volume: 'Medium',
        intensity: '80-90% 1RM',
        sets: '4-5',
        reps: '3-6',
        focus: 'Maximum strength development',
        exercisesPerWorkout: 4
      });
    }

    // Phase 3: Peak/Power (3 weeks)
    for (let week = 9; week <= 11; week++) {
      plan.push({
        week,
        phase: 'Peak',
        volume: 'Low',
        intensity: '90-100% 1RM',
        sets: '3-5',
        reps: '1-3',
        focus: 'Peak strength and testing',
        exercisesPerWorkout: 3
      });
    }

    // Deload week
    plan.push({
      week: 12,
      phase: 'Deload',
      volume: 'Very Low',
      intensity: '50-60% 1RM',
      sets: '2-3',
      reps: '5-8',
      focus: 'Recovery and adaptation',
      exercisesPerWorkout: 3
    });

    return {
      plan,
      deloadWeeks: [4, 8, 12],
      testing: [
        { week: 1, type: 'Baseline testing' },
        { week: 12, type: 'Final testing' }
      ],
      summary: {
        totalWeeks: duration,
        phases: ['Hypertrophy', 'Strength', 'Peak', 'Deload'],
        goal
      }
    };

  } catch (error) {
    console.error('Periodization planning error:', error);
    throw error;
  }
};

/**
 * Recommend exercises based on goals and equipment
 */
exports.recommendExercises = async (params) => {
  try {
    const {
      goal,
      equipment = [],
      experience = 'intermediate',
      muscleGroups = [],
      avoidExercises = []
    } = params;

    let query = {};
    
    // Filter by equipment
    if (equipment.length > 0) {
      query.equipment = { $in: equipment };
    }

    // Filter by muscle groups
    if (muscleGroups.length > 0) {
      query.muscleGroups = { $in: muscleGroups };
    }

    // Filter by difficulty
    const difficultyMap = {
      beginner: ['beginner', 'intermediate'],
      intermediate: ['beginner', 'intermediate', 'advanced'],
      advanced: ['intermediate', 'advanced', 'expert']
    };
    query.difficulty = { $in: difficultyMap[experience] || difficultyMap.intermediate };

    const exercises = await Exercise.find(query);

    // Filter out avoided exercises
    const filtered = exercises.filter(ex => 
      !avoidExercises.some(avoid => 
        ex.name.toLowerCase().includes(avoid.toLowerCase())
      )
    );

    // Prioritize by goal
    const prioritized = filtered.sort((a, b) => {
      if (goal === 'strength') {
        // Prioritize compound movements
        const aCompound = ['squat', 'deadlift', 'bench', 'press'].some(c => 
          a.name.toLowerCase().includes(c)
        );
        const bCompound = ['squat', 'deadlift', 'bench', 'press'].some(c => 
          b.name.toLowerCase().includes(c)
        );
        if (aCompound !== bCompound) return bCompound ? 1 : -1;
      }
      return 0;
    });

    return {
      recommended: prioritized.slice(0, 10),
      reasoning: [
        `Found ${filtered.length} exercises matching criteria`,
        `Filtered by ${equipment.length} equipment types`,
        `Optimized for ${goal} goal`
      ]
    };

  } catch (error) {
    console.error('Exercise recommendation error:', error);
    throw error;
  }
};

/**
 * Find optimal training window based on performance data
 */
exports.findOptimalWindow = async (userId) => {
  try {
    // Get workouts with performance data
    const workouts = await Workout.find({
      userId,
      completed: true,
      'performance.energyBefore': { $exists: true }
    }).sort({ date: -1 }).limit(30);

    if (workouts.length < 5) {
      return {
        optimalTime: 'Insufficient data',
        reasoning: ['Need at least 5 workouts with performance data'],
        alternatives: ['Continue tracking energy levels before workouts']
      };
    }

    // Analyze by time of day
    const timePerformance = {};
    
    workouts.forEach(workout => {
      const hour = new Date(workout.date).getHours();
      const timeWindow = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
      
      if (!timePerformance[timeWindow]) {
        timePerformance[timeWindow] = {
          count: 0,
          avgEnergyBefore: 0,
          avgEnergyAfter: 0,
          avgFeeling: 0
        };
      }

      const perf = timePerformance[timeWindow];
      perf.count++;
      perf.avgEnergyBefore += workout.performance.energyBefore || 0;
      perf.avgEnergyAfter += workout.performance.energyAfter || 0;
      
      const feelingMap = { terrible: 1, poor: 2, okay: 3, good: 4, great: 5 };
      perf.avgFeeling += feelingMap[workout.feeling] || 3;
    });

    // Calculate averages
    Object.keys(timePerformance).forEach(time => {
      const perf = timePerformance[time];
      perf.avgEnergyBefore /= perf.count;
      perf.avgEnergyAfter /= perf.count;
      perf.avgFeeling /= perf.count;
      perf.score = (perf.avgEnergyBefore + perf.avgEnergyAfter + perf.avgFeeling) / 3;
    });

    // Find best time
    const bestTime = Object.keys(timePerformance).reduce((best, time) => 
      timePerformance[time].score > timePerformance[best].score ? time : best
    );

    return {
      optimalTime: bestTime,
      reasoning: [
        `Based on ${workouts.length} workouts`,
        `${bestTime} shows highest performance scores`,
        `Average energy: ${timePerformance[bestTime].avgEnergyBefore.toFixed(1)}/10`
      ],
      alternatives: Object.keys(timePerformance)
        .filter(t => t !== bestTime)
        .map(t => `${t}: Score ${timePerformance[t].score.toFixed(1)}/10`),
      breakdown: timePerformance
    };

  } catch (error) {
    console.error('Optimal window analysis error:', error);
    throw error;
  }
};

module.exports = exports;
