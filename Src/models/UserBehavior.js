// Src/models/UserBehavior.js
const mongoose = require('mongoose');

const userBehaviorSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true,
    index: true 
  },
  patterns: {
    workout: {
      preferredTimes: [{
        hour: { type: Number, min: 0, max: 23 },
        dayOfWeek: { type: Number, min: 0, max: 6 },
        frequency: Number,
        successRate: Number
      }],
      averageDuration: Number,
      consistencyScore: { type: Number, min: 0, max: 100 },
      streakCurrent: { type: Number, default: 0 },
      streakBest: { type: Number, default: 0 },
      missedWorkoutReasons: [{
        reason: String,
        count: Number,
        lastOccurred: Date
      }],
      intensityPreference: { type: String, enum: ['low', 'moderate', 'high', 'varied'] },
      responseToReminders: { type: Number, min: 0, max: 100 }
    },
    sleep: {
      averageBedtime: String,
      averageWakeTime: String,
      weekdayPattern: {
        bedtime: String,
        wakeTime: String,
        duration: Number
      },
      weekendPattern: {
        bedtime: String,
        wakeTime: String,
        duration: Number
      },
      optimalDuration: Number,
      consistencyScore: { type: Number, min: 0, max: 100 },
      disruptors: [{
        factor: String,
        impact: Number,
        frequency: Number
      }]
    },
    nutrition: {
      mealTimes: [{
        meal: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
        typicalTime: String,
        consistency: Number
      }],
      trackingConsistency: { type: Number, min: 0, max: 100 },
      commonFoods: [{
        name: String,
        frequency: Number,
        category: String
      }],
      cheatDayPattern: {
        dayOfWeek: Number,
        frequency: String,
        impact: Number
      },
      hydrationHabits: {
        averageDaily: Number,
        consistency: Number,
        triggers: [String]
      }
    },
    stress: {
      patterns: [{
        trigger: String,
        frequency: Number,
        timeOfDay: String,
        dayOfWeek: Number,
        severity: { type: Number, min: 1, max: 10 }
      }],
      copingMechanisms: [{
        method: String,
        effectiveness: { type: Number, min: 0, max: 100 },
        frequency: Number
      }],
      physicalManifestations: [{
        symptom: String,
        correlatedWithHRV: Boolean,
        threshold: Number
      }],
      stressSpendingCorrelation: Number,
      stressEatingCorrelation: Number
    },
    engagement: {
      appUsage: {
        dailyAverage: Number,
        preferredTimes: [Number],
        sessionsPerDay: Number,
        averageSessionLength: Number
      },
      featureUsage: [{
        feature: String,
        frequency: Number,
        lastUsed: Date,
        satisfaction: Number
      }],
      notificationPreferences: {
        optimalTime: String,
        frequency: { type: String, enum: ['minimal', 'moderate', 'frequent'] },
        responseRate: Number,
        preferredTypes: [String]
      },
      dataInputConsistency: {
        wearable: Number,
        manual: Number,
        goals: Number,
        measurements: Number
      }
    }
  },
  insights: {
    personalityType: { 
      type: String, 
      enum: ['competitor', 'socializer', 'achiever', 'explorer', 'maintainer'] 
    },
    motivationDrivers: [{
      driver: String,
      strength: { type: Number, min: 0, max: 100 },
      evidence: [String]
    }],
    barriers: [{
      barrier: String,
      impact: { type: Number, min: 0, max: 100 },
      frequency: Number,
      solutions: [String]
    }],
    optimalInterventions: [{
      type: String,
      effectiveness: Number,
      bestTiming: String,
      message: String
    }],
    riskFactors: [{
      risk: String,
      probability: Number,
      preventionStrategy: String
    }]
  },
  predictions: {
    nextWorkoutTime: Date,
    nextRestDay: Date,
    burnoutRisk: { type: Number, min: 0, max: 100 },
    adherenceNextWeek: { type: Number, min: 0, max: 100 },
    goalCompletionProbability: { type: Number, min: 0, max: 100 }
  },
  adaptations: {
    workoutIntensity: {
      current: Number,
      recommended: Number,
      lastAdjusted: Date
    },
    notificationTiming: {
      current: [String],
      testing: [String],
      lastOptimized: Date
    },
    recoveryDays: {
      current: Number,
      recommended: Number,
      reasoning: String
    }
  },
  scores: {
    overall: { type: Number, min: 0, max: 100 },
    consistency: { type: Number, min: 0, max: 100 },
    engagement: { type: Number, min: 0, max: 100 },
    progress: { type: Number, min: 0, max: 100 },
    resilience: { type: Number, min: 0, max: 100 }
  },
  lastAnalyzed: { type: Date, default: Date.now },
  dataPoints: { type: Number, default: 0 },
  confidence: { type: Number, min: 0, max: 100, default: 0 }
}, { 
  timestamps: true 
});

// Indexes
userBehaviorSchema.index({ userId: 1 });
userBehaviorSchema.index({ lastAnalyzed: 1 });
userBehaviorSchema.index({ 'scores.overall': -1 });

// Method to update behavior from new data point
userBehaviorSchema.methods.updateFromDataPoint = function(dataType, data) {
  this.dataPoints++;
  
  // Update confidence based on data points
  this.confidence = Math.min(100, this.dataPoints / 100 * 100);
  
  // Update relevant pattern based on data type
  switch(dataType) {
    case 'workout':
      this.updateWorkoutPattern(data);
      break;
    case 'sleep':
      this.updateSleepPattern(data);
      break;
    case 'nutrition':
      this.updateNutritionPattern(data);
      break;
    case 'stress':
      this.updateStressPattern(data);
      break;
    case 'app':
      this.updateEngagementPattern(data);
      break;
  }
  
  this.lastAnalyzed = new Date();
  return this.save();
};

// Method to update workout patterns
userBehaviorSchema.methods.updateWorkoutPattern = function(workoutData) {
  const hour = new Date(workoutData.scheduledDate).getHours();
  const day = new Date(workoutData.scheduledDate).getDay();
  
  // Find or create time preference
  let timePref = this.patterns.workout.preferredTimes.find(
    p => p.hour === hour && p.dayOfWeek === day
  );
  
  if (!timePref) {
    this.patterns.workout.preferredTimes.push({
      hour,
      dayOfWeek: day,
      frequency: 1,
      successRate: workoutData.completed ? 100 : 0
    });
  } else {
    timePref.frequency++;
    const newSuccess = workoutData.completed ? 1 : 0;
    timePref.successRate = ((timePref.successRate * (timePref.frequency - 1)) + (newSuccess * 100)) / timePref.frequency;
  }
  
  // Update streaks
  if (workoutData.completed) {
    this.patterns.workout.streakCurrent++;
    if (this.patterns.workout.streakCurrent > this.patterns.workout.streakBest) {
      this.patterns.workout.streakBest = this.patterns.workout.streakCurrent;
    }
  } else {
    this.patterns.workout.streakCurrent = 0;
  }
};

// Method to get personalized recommendations
userBehaviorSchema.methods.getRecommendations = function() {
  const recommendations = [];
  
  // Workout timing recommendation
  if (this.patterns.workout.preferredTimes.length > 0) {
    const bestTime = this.patterns.workout.preferredTimes.sort((a, b) => 
      b.successRate - a.successRate
    )[0];
    
    recommendations.push({
      type: 'workout_timing',
      message: `Schedule workouts at ${bestTime.hour}:00 on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][bestTime.dayOfWeek]} for best adherence`,
      confidence: bestTime.successRate
    });
  }
  
  // Sleep optimization
  if (this.patterns.sleep.consistencyScore < 70) {
    recommendations.push({
      type: 'sleep_consistency',
      message: 'Improve sleep consistency by setting a fixed bedtime',
      confidence: 85
    });
  }
  
  // Stress management
  if (this.patterns.stress.patterns.length > 0) {
    const highStress = this.patterns.stress.patterns.filter(p => p.severity >= 7);
    if (highStress.length > 0) {
      recommendations.push({
        type: 'stress_management',
        message: `High stress detected. Most effective coping: ${this.patterns.stress.copingMechanisms[0]?.method || 'meditation'}`,
        confidence: 90
      });
    }
  }
  
  return recommendations;
};

// Static method to identify similar users
userBehaviorSchema.statics.findSimilarUsers = async function(userId, limit = 5) {
  const userBehavior = await this.findOne({ userId });
  if (!userBehavior) return [];
  
  // Find users with similar personality type and scores
  return this.find({
    userId: { $ne: userId },
    'insights.personalityType': userBehavior.insights.personalityType,
    'scores.overall': {
      $gte: userBehavior.scores.overall - 10,
      $lte: userBehavior.scores.overall + 10
    }
  })
  .limit(limit)
  .select('userId scores insights.personalityType');
};

module.exports = mongoose.model('UserBehavior', userBehaviorSchema);