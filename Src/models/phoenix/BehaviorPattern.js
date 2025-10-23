// Src/models/phoenix/BehaviorPattern.js
// Model for tracking learned user behavior patterns through ML analysis
// Used by Phoenix AI for predictive insights and personalized recommendations

const mongoose = require('mongoose');

const behaviorPatternSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Pattern identification
  patternType: {
    type: String,
    required: true,
    enum: [
      'sleep',           // Sleep timing patterns
      'exercise',        // Workout frequency/timing
      'nutrition',       // Eating habits
      'stress',          // Stress triggers
      'productivity',    // Peak performance times
      'recovery',        // Recovery patterns
      'energy',          // Energy level fluctuations
      'mood',            // Mood patterns
      'social',          // Social activity patterns
      'financial',       // Spending patterns
      'goal_progress'    // Goal achievement patterns
    ],
    index: true
  },
  
  // Pattern details
  pattern: {
    type: String,
    required: true,
    maxlength: 500
  },
  
  description: {
    type: String,
    maxlength: 1000
  },
  
  // Pattern strength and reliability
  frequency: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
    description: 'Number of times this pattern has been observed'
  },
  
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0,
    description: 'ML confidence score (0-1) for this pattern'
  },
  
  // Statistical data
  statistics: {
    firstObserved: {
      type: Date,
      default: Date.now
    },
    lastObserved: {
      type: Date,
      default: Date.now
    },
    averageInterval: {
      type: Number, // Average days between occurrences
      default: null
    },
    successRate: {
      type: Number, // Percentage of times pattern holds true
      min: 0,
      max: 100,
      default: null
    }
  },
  
  // Context and triggers
  triggers: [{
    type: {
      type: String,
      enum: ['time', 'location', 'activity', 'metric', 'event']
    },
    value: String,
    weight: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5
    }
  }],
  
  // Associated data points
  dataPoints: [{
    timestamp: Date,
    value: mongoose.Schema.Types.Mixed,
    context: mongoose.Schema.Types.Mixed
  }],
  
  // Metadata for ML model
  metadata: {
    modelVersion: {
      type: String,
      default: '1.0'
    },
    algorithm: {
      type: String,
      enum: ['regression', 'classification', 'clustering', 'timeseries', 'neural_network'],
      default: 'classification'
    },
    features: [String], // Features used to detect this pattern
    accuracy: Number,   // Model accuracy for this pattern
    lastTrained: Date
  },
  
  // Pattern status
  status: {
    type: String,
    enum: ['active', 'inactive', 'deprecated', 'needs_validation'],
    default: 'active',
    index: true
  },
  
  // Validation
  validated: {
    type: Boolean,
    default: false
  },
  
  validatedBy: {
    type: String,
    enum: ['user', 'system', 'ml_model'],
    default: 'system'
  },
  
  validatedAt: {
    type: Date,
    default: null
  },
  
  // User feedback
  userFeedback: {
    helpful: {
      type: Boolean,
      default: null
    },
    feedbackDate: Date,
    notes: String
  },
  
  // Tags for categorization
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  
  // Expiry for temporary patterns
  expiresAt: {
    type: Date,
    default: null,
    index: true
  }
  
}, {
  timestamps: true
});

// ========================================
// INDEXES
// ========================================

// Compound indexes for common queries
behaviorPatternSchema.index({ userId: 1, patternType: 1 });
behaviorPatternSchema.index({ userId: 1, status: 1 });
behaviorPatternSchema.index({ userId: 1, confidence: -1 });
behaviorPatternSchema.index({ userId: 1, 'statistics.lastObserved': -1 });

// TTL index for expired patterns
behaviorPatternSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ========================================
// VIRTUALS
// ========================================

// Calculate pattern strength (frequency * confidence)
behaviorPatternSchema.virtual('strength').get(function() {
  return this.frequency * this.confidence;
});

// Check if pattern is recent (observed in last 30 days)
behaviorPatternSchema.virtual('isRecent').get(function() {
  if (!this.statistics.lastObserved) return false;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return this.statistics.lastObserved > thirtyDaysAgo;
});

// Calculate pattern age in days
behaviorPatternSchema.virtual('ageInDays').get(function() {
  if (!this.statistics.firstObserved) return 0;
  const diff = Date.now() - this.statistics.firstObserved.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

// ========================================
// METHODS
// ========================================

// Update pattern statistics when new observation occurs
behaviorPatternSchema.methods.recordObservation = async function(dataPoint = null) {
  this.frequency += 1;
  this.statistics.lastObserved = new Date();
  
  // Update average interval
  if (this.frequency > 1 && this.statistics.firstObserved) {
    const totalDays = (Date.now() - this.statistics.firstObserved.getTime()) / (1000 * 60 * 60 * 24);
    this.statistics.averageInterval = totalDays / (this.frequency - 1);
  }
  
  // Add data point if provided
  if (dataPoint) {
    this.dataPoints.push({
      timestamp: new Date(),
      value: dataPoint.value,
      context: dataPoint.context
    });
    
    // Keep only last 100 data points to avoid document bloat
    if (this.dataPoints.length > 100) {
      this.dataPoints = this.dataPoints.slice(-100);
    }
  }
  
  return this.save();
};

// Update confidence score
behaviorPatternSchema.methods.updateConfidence = function(newConfidence) {
  this.confidence = Math.max(0, Math.min(1, newConfidence));
  return this.save();
};

// Mark pattern as validated
behaviorPatternSchema.methods.validate = function(validatedBy = 'system') {
  this.validated = true;
  this.validatedBy = validatedBy;
  this.validatedAt = new Date();
  return this.save();
};

// Deprecate pattern
behaviorPatternSchema.methods.deprecate = function() {
  this.status = 'deprecated';
  return this.save();
};

// ========================================
// STATICS
// ========================================

// Get active patterns for user by type
behaviorPatternSchema.statics.getActivePatterns = function(userId, patternType = null) {
  const query = { 
    userId, 
    status: 'active',
    confidence: { $gte: 0.3 } // Minimum confidence threshold
  };
  
  if (patternType) {
    query.patternType = patternType;
  }
  
  return this.find(query)
    .sort({ confidence: -1, frequency: -1 })
    .exec();
};

// Get strongest patterns for user
behaviorPatternSchema.statics.getStrongestPatterns = function(userId, limit = 10) {
  return this.find({ 
    userId, 
    status: 'active' 
  })
    .sort({ confidence: -1, frequency: -1 })
    .limit(limit)
    .exec();
};

// Get recent patterns (last 30 days)
behaviorPatternSchema.statics.getRecentPatterns = function(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  return this.find({
    userId,
    status: 'active',
    'statistics.lastObserved': { $gte: thirtyDaysAgo }
  })
    .sort({ 'statistics.lastObserved': -1 })
    .exec();
};

// Clean up old, low-confidence patterns
behaviorPatternSchema.statics.cleanupOldPatterns = async function(userId, daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await this.updateMany(
    {
      userId,
      'statistics.lastObserved': { $lt: cutoffDate },
      confidence: { $lt: 0.3 },
      status: 'active'
    },
    {
      $set: { status: 'deprecated' }
    }
  );
  
  return result.modifiedCount;
};

// Get patterns needing validation
behaviorPatternSchema.statics.getPatternsNeedingValidation = function(userId) {
  return this.find({
    userId,
    status: 'needs_validation',
    confidence: { $gte: 0.5 }
  })
    .sort({ confidence: -1 })
    .exec();
};

// ========================================
// MIDDLEWARE
// ========================================

// Update lastObserved before save if frequency increased
behaviorPatternSchema.pre('save', function(next) {
  if (this.isModified('frequency') && !this.isModified('statistics.lastObserved')) {
    this.statistics.lastObserved = new Date();
  }
  next();
});

// Set firstObserved on creation
behaviorPatternSchema.pre('save', function(next) {
  if (this.isNew && !this.statistics.firstObserved) {
    this.statistics.firstObserved = new Date();
  }
  next();
});

// ========================================
// JSON TRANSFORM
// ========================================

behaviorPatternSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    
    // Don't expose raw data points in API response (too large)
    if (ret.dataPoints && ret.dataPoints.length > 10) {
      ret.dataPointsCount = ret.dataPoints.length;
      ret.recentDataPoints = ret.dataPoints.slice(-10);
      delete ret.dataPoints;
    }
    
    return ret;
  }
});

const BehaviorPattern = mongoose.model('BehaviorPattern', behaviorPatternSchema);

module.exports = BehaviorPattern;
