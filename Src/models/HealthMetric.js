// HealthMetric.js
// Model for storing general health metrics

const mongoose = require('mongoose');

const healthMetricSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  // Vital signs
  bloodPressureSystolic: {
    type: Number,
    min: 0,
    max: 300
  },
  bloodPressureDiastolic: {
    type: Number,
    min: 0,
    max: 200
  },
  heartRate: {
    type: Number,
    min: 0,
    max: 300
  },
  restingHeartRate: {
    type: Number,
    min: 0,
    max: 200
  },
  hrv: {
    type: Number,
    min: 0,
    max: 300
  },
  respiratoryRate: {
    type: Number,
    min: 0,
    max: 100
  },
  oxygenSaturation: {
    type: Number,
    min: 0,
    max: 100
  },
  bodyTemperature: {
    type: Number,
    min: 90,
    max: 110
  },
  
  // Body metrics
  weight: {
    type: Number,
    min: 0
  },
  height: {
    type: Number,
    min: 0
  },
  bmi: {
    type: Number,
    min: 0
  },
  bodyFatPercentage: {
    type: Number,
    min: 0,
    max: 100
  },
  leanMass: {
    type: Number,
    min: 0
  },
  muscleMass: {
    type: Number,
    min: 0
  },
  boneMass: {
    type: Number,
    min: 0
  },
  
  // Circumference measurements
  waistCircumference: {
    type: Number,
    min: 0
  },
  hipCircumference: {
    type: Number,
    min: 0
  },
  neckCircumference: {
    type: Number,
    min: 0
  },
  chestCircumference: {
    type: Number,
    min: 0
  },
  
  // Activity metrics
  steps: {
    type: Number,
    min: 0
  },
  activeMinutes: {
    type: Number,
    min: 0
  },
  caloriesBurned: {
    type: Number,
    min: 0
  },
  distance: {
    type: Number,
    min: 0
  },
  
  // Sleep metrics
  sleepDuration: {
    type: Number,
    min: 0
  },
  sleepQuality: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Recovery metrics
  recoveryScore: {
    type: Number,
    min: 0,
    max: 100
  },
  stressLevel: {
    type: Number,
    min: 0,
    max: 100
  },
  energyLevel: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Hydration
  waterIntake: {
    type: Number,
    min: 0
  },
  hydrationLevel: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Blood work (optional)
  glucoseLevel: {
    type: Number,
    min: 0
  },
  cholesterolTotal: {
    type: Number,
    min: 0
  },
  cholesterolLDL: {
    type: Number,
    min: 0
  },
  cholesterolHDL: {
    type: Number,
    min: 0
  },
  triglycerides: {
    type: Number,
    min: 0
  },
  
  // Metadata
  source: {
    type: String,
    enum: ['manual', 'wearable', 'scale', 'blood_pressure_monitor', 'lab', 'other'],
    default: 'manual'
  },
  provider: {
    type: String
  },
  notes: {
    type: String,
    maxlength: 1000
  },
  tags: [{
    type: String
  }],
  
  // Sync info
  syncedAt: {
    type: Date
  },
  isManual: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
healthMetricSchema.index({ userId: 1, date: -1 });
healthMetricSchema.index({ userId: 1, source: 1, date: -1 });

// Virtual for waist-to-hip ratio
healthMetricSchema.virtual('waistToHipRatio').get(function() {
  if (this.waistCircumference && this.hipCircumference) {
    return this.waistCircumference / this.hipCircumference;
  }
  return null;
});

// Method to calculate BMI if not provided
healthMetricSchema.pre('save', function(next) {
  if (this.weight && this.height && !this.bmi) {
    const heightInMeters = this.height / 100;
    this.bmi = this.weight / (heightInMeters * heightInMeters);
  }
  next();
});

// Static method to get latest metrics for user
healthMetricSchema.statics.getLatestMetrics = async function(userId) {
  return await this.findOne({ userId })
    .sort({ date: -1 })
    .exec();
};

// Static method to get metrics for date range
healthMetricSchema.statics.getMetricsInRange = async function(userId, startDate, endDate) {
  return await this.find({
    userId,
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: -1 }).exec();
};

const HealthMetric = mongoose.model('HealthMetric', healthMetricSchema);

module.exports = HealthMetric;
