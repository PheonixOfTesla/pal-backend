// BiometricSnapshot.js
// Model for storing comprehensive biometric snapshots at specific points in time

const mongoose = require('mongoose');

const biometricSnapshotSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Timestamp
  snapshotDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Body Composition
  weight: {
    value: Number,
    unit: {
      type: String,
      enum: ['kg', 'lbs'],
      default: 'kg'
    }
  },
  
  bodyFatPercentage: Number,
  leanMass: Number,
  muscleMass: Number,
  boneMass: Number,
  visceralFat: Number,
  
  // Measurements
  waist: Number,
  hips: Number,
  chest: Number,
  arms: Number,
  thighs: Number,
  neck: Number,
  
  // Cardiovascular
  hrv: {
    value: Number,
    source: {
      type: String,
      enum: ['wearable', 'manual', 'calculated']
    }
  },
  
  restingHeartRate: Number,
  bloodPressure: {
    systolic: Number,
    diastolic: Number
  },
  
  vo2Max: Number,
  
  // Metabolic
  bmr: Number,
  rmr: Number,
  tdee: Number,
  
  // Hydration
  hydrationLevel: {
    type: String,
    enum: ['optimal', 'low', 'dehydrated', 'overhydrated']
  },
  waterIntakeMl: Number,
  
  // Health Ratios
  bmi: Number,
  absi: Number,
  bri: Number,
  whr: Number, // waist-to-hip ratio
  waistToHeight: Number,
  
  // Sleep (from previous night)
  sleepDuration: Number,
  sleepQuality: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor']
  },
  
  // Recovery
  recoveryScore: Number,
  readinessScore: Number,
  
  // Source of data
  dataSource: {
    type: String,
    enum: ['wearable', 'manual', 'calculated', 'dexa', 'mixed'],
    default: 'calculated'
  },
  
  // Device sources
  sources: [{
    provider: String,
    metrics: [String],
    timestamp: Date
  }],
  
  // Notes
  notes: String,
  
  // Tags for categorization
  tags: [String],
  
  // Completeness score (0-100)
  completeness: {
    type: Number,
    default: 0
  }
  
}, {
  timestamps: true
});

// Indexes
biometricSnapshotSchema.index({ userId: 1, snapshotDate: -1 });
biometricSnapshotSchema.index({ userId: 1, completeness: -1 });

// Virtual for overall health score
biometricSnapshotSchema.virtual('healthScore').get(function() {
  let score = 0;
  let factors = 0;
  
  if (this.hrv?.value) {
    score += this.hrv.value > 60 ? 25 : (this.hrv.value / 60) * 25;
    factors++;
  }
  
  if (this.recoveryScore) {
    score += (this.recoveryScore / 100) * 25;
    factors++;
  }
  
  if (this.sleepQuality) {
    const sleepScores = { excellent: 25, good: 20, fair: 12, poor: 5 };
    score += sleepScores[this.sleepQuality] || 0;
    factors++;
  }
  
  if (this.bodyFatPercentage) {
    // Optimal ranges: 10-20% for men, 18-28% for women
    // This is simplified - would need user gender
    const optimal = this.bodyFatPercentage >= 10 && this.bodyFatPercentage <= 25;
    score += optimal ? 25 : 12;
    factors++;
  }
  
  return factors > 0 ? Math.round(score / factors * 4) : 0; // Scale to 100
});

// Calculate completeness score before saving
biometricSnapshotSchema.pre('save', function(next) {
  const fields = [
    'weight.value', 'bodyFatPercentage', 'waist', 'hrv.value',
    'restingHeartRate', 'bmr', 'sleepDuration', 'recoveryScore',
    'hydrationLevel', 'bmi'
  ];
  
  let filled = 0;
  fields.forEach(field => {
    const value = field.split('.').reduce((obj, key) => obj?.[key], this);
    if (value !== undefined && value !== null) filled++;
  });
  
  this.completeness = Math.round((filled / fields.length) * 100);
  next();
});

// Static method to get latest snapshot
biometricSnapshotSchema.statics.getLatest = function(userId) {
  return this.findOne({ userId }).sort({ snapshotDate: -1 });
};

// Static method to get snapshots in date range
biometricSnapshotSchema.statics.getRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    snapshotDate: { $gte: startDate, $lte: endDate }
  }).sort({ snapshotDate: -1 });
};

// Static method to calculate trends
biometricSnapshotSchema.statics.calculateTrends = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const snapshots = await this.find({
    userId,
    snapshotDate: { $gte: startDate }
  }).sort({ snapshotDate: 1 });
  
  if (snapshots.length < 2) return null;
  
  const trends = {
    weight: calculateTrend(snapshots, 'weight.value'),
    bodyFat: calculateTrend(snapshots, 'bodyFatPercentage'),
    hrv: calculateTrend(snapshots, 'hrv.value'),
    rhr: calculateTrend(snapshots, 'restingHeartRate'),
    recovery: calculateTrend(snapshots, 'recoveryScore')
  };
  
  return trends;
};

// Helper function to calculate trend
function calculateTrend(snapshots, field) {
  const values = snapshots.map(s => {
    const value = field.split('.').reduce((obj, key) => obj?.[key], s);
    return value;
  }).filter(v => v !== undefined && v !== null);
  
  if (values.length < 2) return null;
  
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const percentChange = (change / first) * 100;
  
  return {
    first,
    last,
    change,
    percentChange: Math.round(percentChange * 100) / 100,
    direction: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
    dataPoints: values.length
  };
}

module.exports = mongoose.model('BiometricSnapshot', biometricSnapshotSchema);
