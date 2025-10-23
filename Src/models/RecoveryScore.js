// ========================================
// 💪 RECOVERY SCORE MODEL
// ========================================
// Daily recovery score calculation for Mercury system
// Used for training readiness and stress correlation
// ========================================

const mongoose = require('mongoose');

const recoveryScoreSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    
    date: {
      type: Date,
      required: [true, 'Date is required'],
      index: true
    },
    
    // Recovery Score Components (0-100 each)
    totalScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    
    // Component Scores
    hrvScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    
    sleepScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    
    rhrScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    
    trainingLoadScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    
    // Raw Biometric Data
    hrv: {
      type: Number,
      default: null
    },
    
    rhr: {
      type: Number,
      default: null
    },
    
    sleepDuration: {
      type: Number, // hours
      default: null
    },
    
    sleepQuality: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    
    // Training Load
    acuteLoad: {
      type: Number,
      default: 0
    },
    
    chronicLoad: {
      type: Number,
      default: 0
    },
    
    trainingStrain: {
      type: Number,
      default: 0
    },
    
    // Recovery Status
    status: {
      type: String,
      enum: ['excellent', 'good', 'moderate', 'poor', 'very_poor'],
      default: 'moderate'
    },
    
    // Training Recommendation
    trainingReady: {
      type: Boolean,
      default: true
    },
    
    recommendation: {
      type: String,
      enum: ['high_intensity', 'moderate', 'light', 'rest', 'active_recovery'],
      default: 'moderate'
    },
    
    // Insights
    insights: [{
      type: String
    }],
    
    alerts: [{
      type: String
    }],
    
    // Calculation Method
    calculationVersion: {
      type: String,
      default: 'v2.0'
    },
    
    dataQuality: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound Indexes
recoveryScoreSchema.index({ userId: 1, date: -1 });

// Virtual Fields
recoveryScoreSchema.virtual('stressLevel').get(function() {
  return 100 - this.totalScore;
});

recoveryScoreSchema.virtual('isWellRecovered').get(function() {
  return this.totalScore >= 70;
});

// Instance Methods
recoveryScoreSchema.methods.calculateStatus = function() {
  if (this.totalScore >= 85) return 'excellent';
  if (this.totalScore >= 70) return 'good';
  if (this.totalScore >= 55) return 'moderate';
  if (this.totalScore >= 40) return 'poor';
  return 'very_poor';
};

recoveryScoreSchema.methods.calculateRecommendation = function() {
  if (this.totalScore >= 85) return 'high_intensity';
  if (this.totalScore >= 70) return 'moderate';
  if (this.totalScore >= 55) return 'light';
  if (this.totalScore >= 40) return 'active_recovery';
  return 'rest';
};

// Static Methods
recoveryScoreSchema.statics.getLatestScore = function(userId) {
  return this.findOne({ userId }).sort('-date');
};

recoveryScoreSchema.statics.getAverageScore = async function(userId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const scores = await this.find({
    userId,
    date: { $gte: startDate }
  });
  
  if (scores.length === 0) return null;
  
  const avg = scores.reduce((sum, score) => sum + score.totalScore, 0) / scores.length;
  return Math.round(avg);
};

recoveryScoreSchema.statics.getTrend = async function(userId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const scores = await this.find({
    userId,
    date: { $gte: startDate }
  }).sort('date');
  
  if (scores.length < 2) return 'insufficient_data';
  
  // Simple linear trend
  const firstScore = scores[0].totalScore;
  const lastScore = scores[scores.length - 1].totalScore;
  const change = lastScore - firstScore;
  
  if (change > 5) return 'improving';
  if (change < -5) return 'declining';
  return 'stable';
};

// Pre-save middleware
recoveryScoreSchema.pre('save', function(next) {
  // Calculate status and recommendation if not set
  if (!this.status) {
    this.status = this.calculateStatus();
  }
  
  if (!this.recommendation) {
    this.recommendation = this.calculateRecommendation();
  }
  
  // Determine training readiness
  this.trainingReady = this.totalScore >= 55;
  
  next();
});

module.exports = mongoose.model('RecoveryScore', recoveryScoreSchema);
