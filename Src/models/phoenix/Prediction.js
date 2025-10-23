// Src/models/Prediction.js
const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  predictionType: { 
    type: String, 
    enum: [
      'illness_risk',
      'injury_risk', 
      'burnout_risk',
      'goal_completion',
      'weight_change',
      'performance_peak',
      'recovery_time',
      'sleep_quality',
      'stress_level',
      'energy_level'
    ], 
    required: true,
    index: true
  },
  targetDate: { 
    type: Date, 
    required: true,
    index: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  prediction: {
    value: { type: Number, required: true },
    unit: String,
    probability: { type: Number, min: 0, max: 100 },
    confidence: { type: Number, min: 0, max: 100, required: true },
    range: {
      min: Number,
      max: Number
    }
  },
  factors: [{
    name: String,
    impact: { type: Number, min: -100, max: 100 },
    currentValue: Number,
    optimalValue: Number,
    source: { type: String, enum: ['wearable', 'workout', 'nutrition', 'calendar', 'goal'] }
  }],
  modelUsed: {
    name: { type: String, required: true },
    version: String,
    accuracy: Number,
    features: [String],
    hyperparameters: mongoose.Schema.Types.Mixed
  },
  inputData: {
    wearableMetrics: {
      hrv: Number,
      restingHR: Number,
      sleepDuration: Number,
      sleepQuality: Number,
      recoveryScore: Number,
      steps: Number,
      activeMinutes: Number
    },
    workoutMetrics: {
      completionRate: Number,
      avgIntensity: Number,
      totalVolume: Number,
      restDays: Number
    },
    nutritionMetrics: {
      proteinAdherence: Number,
      calorieAdherence: Number,
      hydration: Number
    },
    behaviorMetrics: {
      consistency: Number,
      trend: String,
      momentum: Number
    }
  },
  recommendations: [{
    action: String,
    impact: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    effort: { type: String, enum: ['low', 'medium', 'high'] },
    timeframe: String,
    expectedImprovement: Number
  }],
  actual: {
    value: Number,
    recordedAt: Date,
    accuracy: Number,
    difference: Number
  },
  feedback: {
    wasHelpful: Boolean,
    userRating: { type: Number, min: 1, max: 5 },
    comment: String,
    submittedAt: Date
  },
  alerts: [{
    level: { type: String, enum: ['info', 'warning', 'critical'] },
    message: String,
    timestamp: Date,
    acknowledged: { type: Boolean, default: false }
  }],
  status: { 
    type: String, 
    enum: ['pending', 'active', 'completed', 'expired', 'cancelled'], 
    default: 'active',
    index: true
  }
}, { 
  timestamps: true 
});

// Indexes for performance
predictionSchema.index({ userId: 1, predictionType: 1, targetDate: -1 });
predictionSchema.index({ userId: 1, status: 1 });
predictionSchema.index({ 'prediction.confidence': -1 });

// Virtual for days until prediction
predictionSchema.virtual('daysUntilTarget').get(function() {
  const now = new Date();
  const diffTime = this.targetDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for prediction age
predictionSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const diffTime = now - this.createdAt;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
});

// Method to check if prediction has expired
predictionSchema.methods.checkExpiration = function() {
  if (this.status === 'completed' || this.status === 'cancelled') return;
  
  const now = new Date();
  if (now > this.targetDate) {
    this.status = 'expired';
    return this.save();
  }
  return this;
};

// Method to record actual outcome
predictionSchema.methods.recordActual = function(actualValue) {
  const accuracy = 100 - Math.abs((this.prediction.value - actualValue) / actualValue * 100);
  
  this.actual = {
    value: actualValue,
    recordedAt: new Date(),
    accuracy: Math.min(Math.max(accuracy, 0), 100),
    difference: actualValue - this.prediction.value
  };
  
  this.status = 'completed';
  
  // Add alert if prediction was significantly off
  if (accuracy < 70) {
    this.alerts.push({
      level: 'info',
      message: `Prediction accuracy was ${accuracy.toFixed(1)}%. Model will be adjusted.`,
      timestamp: new Date()
    });
  }
  
  return this.save();
};

// Method to add alert
predictionSchema.methods.addAlert = function(level, message) {
  this.alerts.push({
    level,
    message,
    timestamp: new Date(),
    acknowledged: false
  });
  return this.save();
};

// Static method to get active predictions for user
predictionSchema.statics.getActivePredictions = function(userId, type = null) {
  const query = { 
    userId, 
    status: 'active',
    targetDate: { $gte: new Date() }
  };
  
  if (type) {
    query.predictionType = type;
  }
  
  return this.find(query).sort('targetDate');
};

// Static method to get prediction accuracy stats
predictionSchema.statics.getAccuracyStats = async function(userId, type = null) {
  const match = { 
    userId, 
    status: 'completed',
    'actual.value': { $exists: true }
  };
  
  if (type) {
    match.predictionType = type;
  }
  
  const stats = await this.aggregate([
    { $match: match },
    { 
      $group: {
        _id: '$predictionType',
        avgAccuracy: { $avg: '$actual.accuracy' },
        count: { $sum: 1 },
        bestAccuracy: { $max: '$actual.accuracy' },
        worstAccuracy: { $min: '$actual.accuracy' }
      }
    }
  ]);
  
  return stats;
};

// Static method to find predictions needing alerts
predictionSchema.statics.getPredictionsNeedingAlerts = function(userId) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.find({
    userId,
    status: 'active',
    targetDate: { $lte: tomorrow },
    'alerts.acknowledged': { $ne: false }
  });
};

module.exports = mongoose.model('Prediction', predictionSchema);