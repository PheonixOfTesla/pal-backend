// ================================================================
// ENERGY PATTERN MODEL
// ================================================================
// File: Src/models/EnergyPattern.js
// Purpose: Track daily energy patterns for schedule optimization
// System: Earth (Calendar & Energy)
// ================================================================

const mongoose = require('mongoose');

const HourlyEnergySchema = new mongoose.Schema({
  hour: {
    type: Number,
    required: true,
    min: 0,
    max: 23
  },
  energyLevel: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    description: '0=Exhausted, 100=Peak energy'
  },
  activity: {
    type: String,
    trim: true,
    description: 'What the user was doing'
  },
  correlatedHRV: {
    type: Number,
    description: 'HRV reading at this time'
  },
  sleepQuality: {
    type: Number,
    min: 0,
    max: 100,
    description: 'Sleep quality from previous night'
  }
}, { _id: false });

const EnergyPatternSchema = new mongoose.Schema(
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
    hourlyEnergy: [HourlyEnergySchema],
    // Calculated fields
    peakEnergyHours: [{
      type: Number,
      min: 0,
      max: 23,
      description: 'Hours with highest energy (top 20%)'
    }],
    lowEnergyHours: [{
      type: Number,
      min: 0,
      max: 23,
      description: 'Hours with lowest energy (bottom 20%)'
    }],
    optimalMeetingTimes: [{
      type: Number,
      min: 0,
      max: 23,
      description: 'Best hours for important meetings'
    }],
    avgDailyEnergy: {
      type: Number,
      min: 0,
      max: 100,
      description: 'Average energy level for the day'
    },
    pattern: {
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'inconsistent', 'unknown'],
      default: 'unknown',
      description: 'Primary energy pattern type'
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      description: 'How reliable is this pattern (based on data completeness)'
    },
    // Additional insights
    energyTrend: {
      type: String,
      enum: ['improving', 'stable', 'declining', 'volatile'],
      description: 'Trend compared to recent patterns'
    },
    sleepImpact: {
      type: Number,
      min: -100,
      max: 100,
      description: 'How much previous night sleep affected energy'
    },
    stressIndicators: [{
      hour: Number,
      indicator: String,
      severity: {
        type: String,
        enum: ['low', 'medium', 'high']
      }
    }]
  },
  {
    timestamps: true
  }
);

// ================================================================
// INDEXES
// ================================================================

// Compound indexes for efficient queries
EnergyPatternSchema.index({ userId: 1, date: -1 });
EnergyPatternSchema.index({ userId: 1, pattern: 1 });
EnergyPatternSchema.index({ date: -1 });

// Unique constraint: one pattern per user per day
EnergyPatternSchema.index({ userId: 1, date: 1 }, { unique: true });

// ================================================================
// VIRTUAL FIELDS
// ================================================================

// Get the day of week
EnergyPatternSchema.virtual('dayOfWeek').get(function() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[this.date.getDay()];
});

// Calculate energy variance (stability)
EnergyPatternSchema.virtual('energyVariance').get(function() {
  if (!this.hourlyEnergy || this.hourlyEnergy.length === 0) return 0;
  
  const values = this.hourlyEnergy.map(h => h.energyLevel);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  
  return Math.sqrt(variance).toFixed(2);
});

EnergyPatternSchema.set('toJSON', { virtuals: true });
EnergyPatternSchema.set('toObject', { virtuals: true });

// ================================================================
// INSTANCE METHODS
// ================================================================

/**
 * Calculate and update derived fields
 */
EnergyPatternSchema.methods.calculateDerivedFields = function() {
  if (!this.hourlyEnergy || this.hourlyEnergy.length === 0) {
    return this;
  }

  // Calculate average daily energy
  const totalEnergy = this.hourlyEnergy.reduce((sum, h) => sum + h.energyLevel, 0);
  this.avgDailyEnergy = Math.round(totalEnergy / this.hourlyEnergy.length);

  // Sort hours by energy level
  const sortedHours = [...this.hourlyEnergy]
    .sort((a, b) => b.energyLevel - a.energyLevel);

  // Get top 20% (peak energy hours)
  const peakCount = Math.max(1, Math.ceil(sortedHours.length * 0.2));
  this.peakEnergyHours = sortedHours
    .slice(0, peakCount)
    .map(h => h.hour)
    .sort((a, b) => a - b);

  // Get bottom 20% (low energy hours)
  const lowCount = Math.max(1, Math.ceil(sortedHours.length * 0.2));
  this.lowEnergyHours = sortedHours
    .slice(-lowCount)
    .map(h => h.hour)
    .sort((a, b) => a - b);

  // Optimal meeting times are peak energy hours during work hours (8-18)
  this.optimalMeetingTimes = this.peakEnergyHours
    .filter(hour => hour >= 8 && hour <= 18)
    .sort((a, b) => a - b);

  // Determine pattern type
  this.pattern = this.determinePattern();

  // Calculate confidence score
  this.confidenceScore = this.calculateConfidence();

  return this;
};

/**
 * Determine energy pattern type
 */
EnergyPatternSchema.methods.determinePattern = function() {
  if (!this.hourlyEnergy || this.hourlyEnergy.length < 4) {
    return 'unknown';
  }

  const morningEnergy = this.getAverageEnergyForPeriod(6, 12);
  const afternoonEnergy = this.getAverageEnergyForPeriod(12, 18);
  const eveningEnergy = this.getAverageEnergyForPeriod(18, 23);

  const max = Math.max(morningEnergy, afternoonEnergy, eveningEnergy);
  const min = Math.min(morningEnergy, afternoonEnergy, eveningEnergy);

  // Check if pattern is inconsistent (low variance)
  if (max - min < 15) {
    return 'inconsistent';
  }

  // Determine dominant pattern
  if (morningEnergy === max) return 'morning';
  if (afternoonEnergy === max) return 'afternoon';
  if (eveningEnergy === max) return 'evening';

  return 'inconsistent';
};

/**
 * Get average energy for a time period
 */
EnergyPatternSchema.methods.getAverageEnergyForPeriod = function(startHour, endHour) {
  const periodData = this.hourlyEnergy.filter(
    h => h.hour >= startHour && h.hour < endHour
  );

  if (periodData.length === 0) return 0;

  const total = periodData.reduce((sum, h) => sum + h.energyLevel, 0);
  return total / periodData.length;
};

/**
 * Calculate confidence score based on data completeness
 */
EnergyPatternSchema.methods.calculateConfidence = function() {
  if (!this.hourlyEnergy || this.hourlyEnergy.length === 0) {
    return 0;
  }

  // More data points = higher confidence
  const dataPointsScore = Math.min(100, (this.hourlyEnergy.length / 16) * 100);

  // Check if we have data spread throughout the day
  const hours = this.hourlyEnergy.map(h => h.hour);
  const hasWorkHours = hours.some(h => h >= 8 && h <= 18);
  const hasMorning = hours.some(h => h >= 6 && h <= 12);
  const hasAfternoon = hours.some(h => h >= 12 && h <= 18);
  const hasEvening = hours.some(h => h >= 18 && h <= 23);

  let spreadScore = 0;
  if (hasWorkHours) spreadScore += 25;
  if (hasMorning) spreadScore += 25;
  if (hasAfternoon) spreadScore += 25;
  if (hasEvening) spreadScore += 25;

  // Average the two scores
  return Math.round((dataPointsScore + spreadScore) / 2);
};

/**
 * Get energy level for a specific hour (with interpolation if needed)
 */
EnergyPatternSchema.methods.getEnergyAtHour = function(hour) {
  const exactMatch = this.hourlyEnergy.find(h => h.hour === hour);
  if (exactMatch) return exactMatch.energyLevel;

  // Interpolate from nearby hours
  const sortedHours = [...this.hourlyEnergy].sort((a, b) => a.hour - b.hour);
  
  let before = null;
  let after = null;

  for (let i = 0; i < sortedHours.length; i++) {
    if (sortedHours[i].hour < hour) {
      before = sortedHours[i];
    } else if (sortedHours[i].hour > hour) {
      after = sortedHours[i];
      break;
    }
  }

  if (before && after) {
    // Linear interpolation
    const ratio = (hour - before.hour) / (after.hour - before.hour);
    return Math.round(before.energyLevel + (after.energyLevel - before.energyLevel) * ratio);
  }

  // Return average if can't interpolate
  return this.avgDailyEnergy || 50;
};

// ================================================================
// STATIC METHODS
// ================================================================

/**
 * Get energy pattern for a specific date
 */
EnergyPatternSchema.statics.getPatternForDate = async function(userId, date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return this.findOne({
    userId,
    date: { $gte: dayStart, $lt: dayEnd }
  });
};

/**
 * Get average pattern over a period
 */
EnergyPatternSchema.statics.getAveragePattern = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const patterns = await this.find({
    userId,
    date: { $gte: startDate }
  }).sort({ date: -1 });

  if (patterns.length === 0) return null;

  // Calculate average energy for each hour
  const hourlyAverages = {};
  for (let hour = 0; hour < 24; hour++) {
    hourlyAverages[hour] = [];
  }

  patterns.forEach(pattern => {
    pattern.hourlyEnergy.forEach(h => {
      hourlyAverages[h.hour].push(h.energyLevel);
    });
  });

  // Calculate average for each hour
  const averagePattern = [];
  for (let hour = 0; hour < 24; hour++) {
    if (hourlyAverages[hour].length > 0) {
      const avg = hourlyAverages[hour].reduce((sum, val) => sum + val, 0) / hourlyAverages[hour].length;
      averagePattern.push({
        hour,
        energyLevel: Math.round(avg),
        sampleSize: hourlyAverages[hour].length
      });
    }
  }

  return {
    userId,
    period: days,
    patterns: patterns.length,
    averagePattern,
    overallAverage: averagePattern.length > 0 
      ? Math.round(averagePattern.reduce((sum, h) => sum + h.energyLevel, 0) / averagePattern.length)
      : 0
  };
};

/**
 * Find best energy pattern day (most consistent high energy)
 */
EnergyPatternSchema.statics.findBestDay = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const patterns = await this.find({
    userId,
    date: { $gte: startDate }
  }).sort({ avgDailyEnergy: -1 }).limit(1);

  return patterns[0] || null;
};

/**
 * Predict energy pattern for a future date based on historical data
 */
EnergyPatternSchema.statics.predictPattern = async function(userId, targetDate) {
  const targetDay = targetDate.getDay(); // 0-6 (Sunday-Saturday)
  
  // Get patterns from the same day of week in the past 12 weeks
  const historicalPatterns = await this.find({
    userId,
    date: {
      $gte: new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000),
      $lt: targetDate
    }
  }).sort({ date: -1 });

  const sameDayPatterns = historicalPatterns.filter(p => p.date.getDay() === targetDay);

  if (sameDayPatterns.length === 0) {
    return null;
  }

  // Calculate weighted average (more recent = higher weight)
  const hourlyPredictions = {};
  for (let hour = 0; hour < 24; hour++) {
    hourlyPredictions[hour] = [];
  }

  sameDayPatterns.forEach((pattern, index) => {
    const weight = 1 / (index + 1); // More recent patterns have higher weight
    pattern.hourlyEnergy.forEach(h => {
      hourlyPredictions[h.hour].push({
        energy: h.energyLevel,
        weight
      });
    });
  });

  // Calculate weighted average
  const prediction = [];
  for (let hour = 0; hour < 24; hour++) {
    if (hourlyPredictions[hour].length > 0) {
      const weightedSum = hourlyPredictions[hour].reduce((sum, item) => sum + (item.energy * item.weight), 0);
      const totalWeight = hourlyPredictions[hour].reduce((sum, item) => sum + item.weight, 0);
      const avgEnergy = Math.round(weightedSum / totalWeight);
      
      prediction.push({
        hour,
        energyLevel: avgEnergy,
        confidence: Math.min(100, (hourlyPredictions[hour].length / sameDayPatterns.length) * 100)
      });
    }
  }

  return {
    date: targetDate,
    dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][targetDay],
    prediction,
    basedOnDays: sameDayPatterns.length,
    confidenceScore: sameDayPatterns.length >= 3 ? 'high' : sameDayPatterns.length >= 2 ? 'medium' : 'low'
  };
};

// ================================================================
// MIDDLEWARE
// ================================================================

// Calculate derived fields before saving
EnergyPatternSchema.pre('save', function(next) {
  if (this.isModified('hourlyEnergy')) {
    this.calculateDerivedFields();
  }
  next();
});

// Ensure date is set to start of day
EnergyPatternSchema.pre('save', function(next) {
  if (this.isModified('date')) {
    this.date.setHours(0, 0, 0, 0);
  }
  next();
});

module.exports = mongoose.model('EnergyPattern', EnergyPatternSchema);
