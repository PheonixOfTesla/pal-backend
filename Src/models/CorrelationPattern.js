// Src/models/CorrelationPattern.js
const mongoose = require('mongoose');

const correlationPatternSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  patternType: { 
    type: String, 
    enum: [
      'workout_recovery', 
      'sleep_performance', 
      'stress_spending', 
      'nutrition_energy',
      'calendar_recovery',
      'goal_motivation',
      'illness_prediction',
      'injury_risk'
    ], 
    required: true,
    index: true
  },
  primaryMetric: {
    name: { type: String, required: true },
    source: { type: String, enum: ['wearable', 'workout', 'nutrition', 'calendar', 'finance'] },
    threshold: Number,
    direction: { type: String, enum: ['increase', 'decrease', 'stable'] }
  },
  secondaryMetric: {
    name: { type: String, required: true },
    source: { type: String, enum: ['wearable', 'workout', 'nutrition', 'calendar', 'finance'] },
    threshold: Number,
    direction: { type: String, enum: ['increase', 'decrease', 'stable'] }
  },
  correlation: {
    strength: { type: Number, min: -1, max: 1, required: true },
    confidence: { type: Number, min: 0, max: 100, required: true },
    sampleSize: { type: Number, required: true },
    pValue: Number,
    rsquared: Number
  },
  timeRelationship: {
    lag: { type: Number, default: 0 }, // Hours between cause and effect
    window: { type: Number, default: 24 }, // Hours of data considered
    periodicity: { type: String, enum: ['daily', 'weekly', 'monthly', 'none'] }
  },
  triggers: [{
    condition: String,
    threshold: Number,
    action: String,
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] }
  }],
  outcomes: [{
    date: Date,
    predicted: Number,
    actual: Number,
    accuracy: Number,
    intervention: { type: mongoose.Schema.Types.ObjectId, ref: 'Intervention' }
  }],
  insights: {
    description: String,
    recommendation: String,
    impact: String,
    confidenceExplanation: String
  },
  isActive: { type: Boolean, default: true },
  lastTriggered: Date,
  triggerCount: { type: Number, default: 0 },
  successRate: { type: Number, min: 0, max: 100 },
  discoveredAt: { type: Date, default: Date.now },
  lastValidated: Date,
  validationStatus: { 
    type: String, 
    enum: ['pending', 'validated', 'invalidated', 'monitoring'], 
    default: 'monitoring' 
  }
}, { 
  timestamps: true 
});

// Indexes for performance
correlationPatternSchema.index({ userId: 1, patternType: 1 });
correlationPatternSchema.index({ 'correlation.strength': -1 });
correlationPatternSchema.index({ 'correlation.confidence': -1 });
correlationPatternSchema.index({ isActive: 1, lastTriggered: -1 });

// Virtual for pattern quality score
correlationPatternSchema.virtual('qualityScore').get(function() {
  const strengthWeight = Math.abs(this.correlation.strength) * 0.4;
  const confidenceWeight = (this.correlation.confidence / 100) * 0.3;
  const sampleWeight = Math.min(this.correlation.sampleSize / 100, 1) * 0.2;
  const successWeight = (this.successRate || 50) / 100 * 0.1;
  
  return Math.round((strengthWeight + confidenceWeight + sampleWeight + successWeight) * 100);
});

// Method to check if pattern should trigger
correlationPatternSchema.methods.shouldTrigger = function(currentData) {
  if (!this.isActive) return false;
  
  // Check if enough time has passed since last trigger
  if (this.lastTriggered) {
    const hoursSinceTrigger = (Date.now() - this.lastTriggered) / (1000 * 60 * 60);
    if (hoursSinceTrigger < this.timeRelationship.window) return false;
  }
  
  // Check trigger conditions
  for (const trigger of this.triggers) {
    const metricValue = currentData[trigger.condition];
    if (metricValue !== undefined && metricValue >= trigger.threshold) {
      return {
        shouldTrigger: true,
        trigger: trigger,
        value: metricValue
      };
    }
  }
  
  return false;
};

// Method to update pattern after outcome
correlationPatternSchema.methods.recordOutcome = function(predicted, actual, interventionId) {
  const accuracy = 100 - Math.abs((predicted - actual) / actual * 100);
  
  this.outcomes.push({
    date: new Date(),
    predicted,
    actual,
    accuracy,
    intervention: interventionId
  });
  
  // Update success rate
  const recentOutcomes = this.outcomes.slice(-20);
  const avgAccuracy = recentOutcomes.reduce((sum, o) => sum + o.accuracy, 0) / recentOutcomes.length;
  this.successRate = Math.round(avgAccuracy);
  
  // Update trigger count
  this.triggerCount++;
  this.lastTriggered = new Date();
  
  return this.save();
};

// Static method to find strongest patterns for user
correlationPatternSchema.statics.getStrongestPatterns = function(userId, limit = 5) {
  return this.find({ 
    userId, 
    isActive: true,
    'correlation.confidence': { $gte: 70 }
  })
  .sort({ 'correlation.strength': -1, 'correlation.confidence': -1 })
  .limit(limit);
};

// Static method to find patterns ready to trigger
correlationPatternSchema.statics.getPatternsReadyToTrigger = function(userId) {
  const windowHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  return this.find({
    userId,
    isActive: true,
    $or: [
      { lastTriggered: { $lt: windowHoursAgo } },
      { lastTriggered: null }
    ]
  });
};

module.exports = mongoose.model('CorrelationPattern', correlationPatternSchema);