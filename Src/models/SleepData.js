// SleepData.js
// Model for sleep logs and sleep-related metrics

const mongoose = require('mongoose');

const sleepStageSchema = new mongoose.Schema({
  deep: {
    type: Number,
    default: 0,
    min: 0
  },
  light: {
    type: Number,
    default: 0,
    min: 0
  },
  rem: {
    type: Number,
    default: 0,
    min: 0
  },
  awake: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

const sleepDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  // Basic sleep metrics
  bedtime: {
    type: Date,
    required: true
  },
  wakeTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // Total sleep duration in minutes
    required: true,
    min: 0
  },
  // Sleep stages (in minutes)
  stages: {
    type: sleepStageSchema,
    required: true
  },
  // Sleep quality metrics
  efficiency: {
    type: Number, // Percentage of time asleep while in bed
    min: 0,
    max: 100,
    default: null
  },
  latency: {
    type: Number, // Time to fall asleep in minutes
    min: 0,
    default: null
  },
  interruptions: {
    type: Number, // Number of times woken during night
    min: 0,
    default: 0
  },
  restless: {
    type: Number, // Minutes of restless sleep
    min: 0,
    default: 0
  },
  // Sleep score
  score: {
    type: Number, // Overall sleep quality score (0-100)
    min: 0,
    max: 100,
    default: null
  },
  // Heart rate during sleep
  avgHeartRate: {
    type: Number,
    min: 0,
    default: null
  },
  minHeartRate: {
    type: Number,
    min: 0,
    default: null
  },
  maxHeartRate: {
    type: Number,
    min: 0,
    default: null
  },
  // Respiratory rate
  avgRespiratoryRate: {
    type: Number,
    min: 0,
    default: null
  },
  // SpO2 during sleep
  avgSpO2: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  minSpO2: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  // HRV during sleep
  avgHRV: {
    type: Number,
    min: 0,
    default: null
  },
  // Temperature variation
  avgTemperature: {
    type: Number,
    default: null
  },
  // Movement and snoring
  movementCount: {
    type: Number,
    min: 0,
    default: 0
  },
  snoringDuration: {
    type: Number, // Minutes of snoring detected
    min: 0,
    default: 0
  },
  // Data source
  provider: {
    type: String,
    enum: ['fitbit', 'oura', 'whoop', 'garmin', 'polar', 'apple', 'manual', 'other'],
    default: 'manual'
  },
  isManual: {
    type: Boolean,
    default: false
  },
  // Notes and tags
  notes: {
    type: String,
    maxlength: 500,
    default: ''
  },
  tags: [{
    type: String,
    trim: true
  }],
  // Factors affecting sleep
  factors: {
    alcohol: {
      type: Boolean,
      default: false
    },
    caffeine: {
      type: Boolean,
      default: false
    },
    exercise: {
      type: Boolean,
      default: false
    },
    stress: {
      type: Boolean,
      default: false
    },
    medication: {
      type: Boolean,
      default: false
    },
    nap: {
      type: Boolean,
      default: false
    }
  },
  // Sleep environment
  environment: {
    temperature: {
      type: Number,
      default: null
    },
    noise: {
      type: String,
      enum: ['quiet', 'moderate', 'loud', null],
      default: null
    },
    light: {
      type: String,
      enum: ['dark', 'dim', 'bright', null],
      default: null
    }
  },
  // Sync metadata
  syncedAt: {
    type: Date,
    default: Date.now
  },
  rawData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for efficient queries
sleepDataSchema.index({ userId: 1, date: -1 });
sleepDataSchema.index({ userId: 1, provider: 1 });

// Virtual for time in bed (minutes)
sleepDataSchema.virtual('timeInBed').get(function() {
  if (this.bedtime && this.wakeTime) {
    return Math.round((this.wakeTime - this.bedtime) / (1000 * 60));
  }
  return null;
});

// Virtual for total sleep stage time
sleepDataSchema.virtual('totalStageTime').get(function() {
  if (this.stages) {
    return this.stages.deep + this.stages.light + this.stages.rem + this.stages.awake;
  }
  return 0;
});

// Virtual for sleep quality category
sleepDataSchema.virtual('qualityCategory').get(function() {
  if (this.score === null || this.score === undefined) return 'unknown';
  if (this.score >= 85) return 'excellent';
  if (this.score >= 70) return 'good';
  if (this.score >= 50) return 'fair';
  return 'poor';
});

// Method to calculate sleep efficiency if not provided
sleepDataSchema.methods.calculateEfficiency = function() {
  if (this.bedtime && this.wakeTime && this.duration) {
    const timeInBed = (this.wakeTime - this.bedtime) / (1000 * 60); // minutes
    this.efficiency = Math.round((this.duration / timeInBed) * 100);
  }
  return this.efficiency;
};

// Method to calculate sleep score
sleepDataSchema.methods.calculateScore = function() {
  let score = 0;
  
  // Duration (30 points): 7-9 hours is optimal
  const hours = this.duration / 60;
  if (hours >= 7 && hours <= 9) {
    score += 30;
  } else if (hours >= 6 && hours < 7) {
    score += 20;
  } else if (hours >= 5 && hours < 6) {
    score += 10;
  }
  
  // Efficiency (25 points): >85% is excellent
  if (this.efficiency) {
    if (this.efficiency >= 85) score += 25;
    else if (this.efficiency >= 75) score += 20;
    else if (this.efficiency >= 65) score += 15;
    else if (this.efficiency >= 55) score += 10;
  }
  
  // Sleep stages (25 points): Check for balanced distribution
  if (this.stages) {
    const totalStageTime = this.stages.deep + this.stages.light + this.stages.rem;
    if (totalStageTime > 0) {
      const deepPercent = (this.stages.deep / totalStageTime) * 100;
      const remPercent = (this.stages.rem / totalStageTime) * 100;
      
      // Deep sleep: 15-25% is optimal
      if (deepPercent >= 15 && deepPercent <= 25) score += 12;
      else if (deepPercent >= 10 && deepPercent < 15) score += 8;
      
      // REM sleep: 20-25% is optimal
      if (remPercent >= 20 && remPercent <= 25) score += 13;
      else if (remPercent >= 15 && remPercent < 20) score += 8;
    }
  }
  
  // Interruptions (10 points): Fewer is better
  if (this.interruptions !== undefined) {
    if (this.interruptions === 0) score += 10;
    else if (this.interruptions <= 2) score += 7;
    else if (this.interruptions <= 4) score += 4;
  }
  
  // Latency (10 points): <15 minutes is good
  if (this.latency !== null && this.latency !== undefined) {
    if (this.latency <= 15) score += 10;
    else if (this.latency <= 30) score += 7;
    else if (this.latency <= 45) score += 4;
  }
  
  this.score = Math.min(score, 100);
  return this.score;
};

// Method to get sleep insights
sleepDataSchema.methods.getInsights = function() {
  const insights = [];
  const hours = this.duration / 60;
  
  // Duration insights
  if (hours < 6) {
    insights.push({
      type: 'warning',
      category: 'duration',
      message: 'You may not be getting enough sleep. Adults need 7-9 hours.'
    });
  } else if (hours > 9) {
    insights.push({
      type: 'info',
      category: 'duration',
      message: 'You slept longer than average. This could indicate recovery needs.'
    });
  }
  
  // Efficiency insights
  if (this.efficiency && this.efficiency < 75) {
    insights.push({
      type: 'warning',
      category: 'efficiency',
      message: 'Your sleep efficiency is low. Try to minimize time awake in bed.'
    });
  }
  
  // Deep sleep insights
  if (this.stages) {
    const totalStageTime = this.stages.deep + this.stages.light + this.stages.rem;
    if (totalStageTime > 0) {
      const deepPercent = (this.stages.deep / totalStageTime) * 100;
      if (deepPercent < 10) {
        insights.push({
          type: 'warning',
          category: 'deep_sleep',
          message: 'Low deep sleep. Consider reducing stress and avoiding caffeine.'
        });
      }
    }
  }
  
  // Heart rate insights
  if (this.avgHeartRate && this.avgHeartRate > 70) {
    insights.push({
      type: 'info',
      category: 'heart_rate',
      message: 'Elevated heart rate during sleep may indicate stress or poor recovery.'
    });
  }
  
  // Interruptions insights
  if (this.interruptions > 4) {
    insights.push({
      type: 'warning',
      category: 'interruptions',
      message: 'Frequent wake-ups detected. Consider improving sleep environment.'
    });
  }
  
  return insights;
};

// Static method to get user's average sleep metrics
sleepDataSchema.statics.getAverageMetrics = async function(userId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const sleepLogs = await this.find({
    userId,
    date: { $gte: startDate }
  });
  
  if (sleepLogs.length === 0) {
    return null;
  }
  
  const totals = sleepLogs.reduce((acc, log) => {
    acc.duration += log.duration;
    acc.efficiency += log.efficiency || 0;
    acc.score += log.score || 0;
    acc.deep += log.stages?.deep || 0;
    acc.light += log.stages?.light || 0;
    acc.rem += log.stages?.rem || 0;
    acc.awake += log.stages?.awake || 0;
    acc.interruptions += log.interruptions || 0;
    acc.latency += log.latency || 0;
    return acc;
  }, {
    duration: 0,
    efficiency: 0,
    score: 0,
    deep: 0,
    light: 0,
    rem: 0,
    awake: 0,
    interruptions: 0,
    latency: 0
  });
  
  const count = sleepLogs.length;
  
  return {
    duration: Math.round(totals.duration / count),
    efficiency: Math.round(totals.efficiency / count),
    score: Math.round(totals.score / count),
    stages: {
      deep: Math.round(totals.deep / count),
      light: Math.round(totals.light / count),
      rem: Math.round(totals.rem / count),
      awake: Math.round(totals.awake / count)
    },
    interruptions: Math.round(totals.interruptions / count),
    latency: Math.round(totals.latency / count),
    totalLogs: count
  };
};

// Static method to analyze sleep trends
sleepDataSchema.statics.analyzeTrends = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const sleepLogs = await this.find({
    userId,
    date: { $gte: startDate }
  }).sort({ date: 1 });
  
  if (sleepLogs.length < 3) {
    return {
      trend: 'insufficient_data',
      message: 'Need at least 3 sleep logs to analyze trends'
    };
  }
  
  // Calculate moving averages
  const recentLogs = sleepLogs.slice(-7);
  const olderLogs = sleepLogs.slice(0, 7);
  
  const recentAvg = recentLogs.reduce((sum, log) => sum + log.duration, 0) / recentLogs.length;
  const olderAvg = olderLogs.reduce((sum, log) => sum + log.duration, 0) / olderLogs.length;
  
  let trend = 'stable';
  if (recentAvg > olderAvg * 1.1) trend = 'improving';
  else if (recentAvg < olderAvg * 0.9) trend = 'declining';
  
  // Calculate consistency (standard deviation)
  const durations = sleepLogs.map(log => log.duration);
  const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);
  
  const consistency = stdDev < 60 ? 'high' : stdDev < 90 ? 'moderate' : 'low';
  
  return {
    trend,
    consistency,
    recentAverage: Math.round(recentAvg),
    olderAverage: Math.round(olderAvg),
    change: Math.round(recentAvg - olderAvg),
    totalLogs: sleepLogs.length
  };
};

// Pre-save middleware to calculate missing fields
sleepDataSchema.pre('save', function(next) {
  // Calculate efficiency if not provided
  if (!this.efficiency && this.bedtime && this.wakeTime && this.duration) {
    this.calculateEfficiency();
  }
  
  // Calculate score if not provided
  if (!this.score) {
    this.calculateScore();
  }
  
  next();
});

const SleepData = mongoose.model('SleepData', sleepDataSchema);

module.exports = SleepData;