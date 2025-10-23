// BodyComposition.js
// Model for tracking detailed body composition measurements over time

const mongoose = require('mongoose');

const bodyCompositionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Measurement date
  measurementDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Source of measurement
  measurementMethod: {
    type: String,
    enum: ['dexa', 'bodpod', 'hydrostatic', 'bioimpedance', 'skinfold', 'calculated', 'estimation'],
    required: true
  },
  
  // Basic metrics
  weight: {
    type: Number,
    required: true
  },
  
  height: Number,
  
  // Body fat analysis
  bodyFat: {
    percentage: {
      type: Number,
      required: true
    },
    mass: Number, // Total fat mass in kg
    essential: Number, // Essential fat in kg
    storage: Number, // Storage fat in kg
    visceral: {
      level: Number, // 1-12 scale
      area: Number // cm²
    }
  },
  
  // Lean body mass
  leanMass: {
    total: Number,
    arms: Number,
    legs: Number,
    trunk: Number,
    percentage: Number
  },
  
  // Muscle mass
  muscleMass: {
    total: Number,
    skeletal: Number,
    arms: Number,
    legs: Number,
    trunk: Number
  },
  
  // Bone composition
  bone: {
    mass: Number,
    density: {
      spine: Number,
      femur: Number,
      total: Number
    },
    tScore: Number, // Comparison to young adult
    zScore: Number, // Age-matched comparison
    mineralContent: Number
  },
  
  // Regional analysis (DEXA-style)
  regions: {
    android: { // Upper body/belly
      fatMass: Number,
      leanMass: Number,
      fatPercentage: Number
    },
    gynoid: { // Hips/thighs
      fatMass: Number,
      leanMass: Number,
      fatPercentage: Number
    },
    arms: {
      left: {
        fatMass: Number,
        leanMass: Number,
        muscleMass: Number
      },
      right: {
        fatMass: Number,
        leanMass: Number,
        muscleMass: Number
      }
    },
    legs: {
      left: {
        fatMass: Number,
        leanMass: Number,
        muscleMass: Number
      },
      right: {
        fatMass: Number,
        leanMass: Number,
        muscleMass: Number
      }
    },
    trunk: {
      fatMass: Number,
      leanMass: Number,
      muscleMass: Number
    }
  },
  
  // Body water
  waterComposition: {
    total: Number, // Total body water percentage
    intracellular: Number,
    extracellular: Number
  },
  
  // Metabolic data
  metabolic: {
    bmr: Number, // Basal metabolic rate
    rmr: Number, // Resting metabolic rate
    tdee: Number, // Total daily energy expenditure
    method: String // Calculation method used
  },
  
  // Circumference measurements (in cm)
  circumferences: {
    neck: Number,
    shoulders: Number,
    chest: Number,
    waist: Number,
    hips: Number,
    leftArm: Number,
    rightArm: Number,
    leftThigh: Number,
    rightThigh: Number,
    leftCalf: Number,
    rightCalf: Number
  },
  
  // Health risk indicators
  healthIndicators: {
    androidGynoidRatio: Number, // Apple vs pear shape
    whr: Number, // Waist-to-hip ratio
    waistToHeight: Number,
    bmi: Number,
    bai: Number, // Body adiposity index
    ffmi: Number, // Fat-free mass index
    fmi: Number // Fat mass index
  },
  
  // Comparison to previous
  changes: {
    weightChange: Number,
    fatMassChange: Number,
    leanMassChange: Number,
    muscleMassChange: Number,
    daysSinceLastMeasurement: Number
  },
  
  // Goals and targets
  targets: {
    targetBodyFat: Number,
    targetWeight: Number,
    targetLeanMass: Number,
    projectedDate: Date
  },
  
  // Quality metrics
  quality: {
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    accuracy: String, // 'high', 'medium', 'low'
    notes: String
  },
  
  // Photos (optional references)
  photos: [{
    url: String,
    angle: {
      type: String,
      enum: ['front', 'back', 'left', 'right']
    },
    uploadDate: Date
  }],
  
  // Analysis notes
  notes: String,
  
  // AI-generated insights
  insights: [{
    type: String,
    message: String,
    severity: {
      type: String,
      enum: ['info', 'warning', 'alert']
    },
    generatedAt: Date
  }]
  
}, {
  timestamps: true
});

// Indexes
bodyCompositionSchema.index({ userId: 1, measurementDate: -1 });
bodyCompositionSchema.index({ userId: 1, measurementMethod: 1 });

// Virtual for android/gynoid ratio
bodyCompositionSchema.virtual('androidGynoidRatio').get(function() {
  if (this.regions?.android?.fatMass && this.regions?.gynoid?.fatMass) {
    return this.regions.android.fatMass / this.regions.gynoid.fatMass;
  }
  return null;
});

// Calculate health indicators before saving
bodyCompositionSchema.pre('save', async function(next) {
  // Calculate BMI if weight and height available
  if (this.weight && this.height) {
    const heightInMeters = this.height / 100;
    this.healthIndicators = this.healthIndicators || {};
    this.healthIndicators.bmi = this.weight / (heightInMeters * heightInMeters);
  }
  
  // Calculate WHR if measurements available
  if (this.circumferences?.waist && this.circumferences?.hips) {
    this.healthIndicators = this.healthIndicators || {};
    this.healthIndicators.whr = this.circumferences.waist / this.circumferences.hips;
  }
  
  // Calculate waist-to-height ratio
  if (this.circumferences?.waist && this.height) {
    this.healthIndicators = this.healthIndicators || {};
    this.healthIndicators.waistToHeight = this.circumferences.waist / this.height;
  }
  
  // Calculate FFMI (Fat-Free Mass Index)
  if (this.leanMass?.total && this.height) {
    const heightInMeters = this.height / 100;
    this.healthIndicators = this.healthIndicators || {};
    this.healthIndicators.ffmi = this.leanMass.total / (heightInMeters * heightInMeters);
  }
  
  // Calculate FMI (Fat Mass Index)
  if (this.bodyFat?.mass && this.height) {
    const heightInMeters = this.height / 100;
    this.healthIndicators = this.healthIndicators || {};
    this.healthIndicators.fmi = this.bodyFat.mass / (heightInMeters * heightInMeters);
  }
  
  // Calculate android/gynoid ratio
  if (this.regions?.android?.fatMass && this.regions?.gynoid?.fatMass) {
    this.healthIndicators = this.healthIndicators || {};
    this.healthIndicators.androidGynoidRatio = 
      this.regions.android.fatMass / this.regions.gynoid.fatMass;
  }
  
  // Calculate changes from previous measurement
  const previous = await this.constructor.findOne({
    userId: this.userId,
    measurementDate: { $lt: this.measurementDate }
  }).sort({ measurementDate: -1 });
  
  if (previous) {
    this.changes = {
      weightChange: this.weight - previous.weight,
      fatMassChange: (this.bodyFat?.mass || 0) - (previous.bodyFat?.mass || 0),
      leanMassChange: (this.leanMass?.total || 0) - (previous.leanMass?.total || 0),
      muscleMassChange: (this.muscleMass?.total || 0) - (previous.muscleMass?.total || 0),
      daysSinceLastMeasurement: Math.floor(
        (this.measurementDate - previous.measurementDate) / (1000 * 60 * 60 * 24)
      )
    };
  }
  
  next();
});

// Static method to get latest measurement
bodyCompositionSchema.statics.getLatest = function(userId) {
  return this.findOne({ userId }).sort({ measurementDate: -1 });
};

// Static method to get progress over time
bodyCompositionSchema.statics.getProgress = function(userId, days = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    userId,
    measurementDate: { $gte: startDate }
  }).sort({ measurementDate: 1 });
};

// Static method to calculate body composition trends
bodyCompositionSchema.statics.calculateTrends = async function(userId, days = 90) {
  const measurements = await this.getProgress(userId, days);
  
  if (measurements.length < 2) {
    return {
      error: 'Insufficient data for trend analysis',
      dataPoints: measurements.length
    };
  }
  
  const first = measurements[0];
  const last = measurements[measurements.length - 1];
  
  return {
    weight: {
      start: first.weight,
      end: last.weight,
      change: last.weight - first.weight,
      percentChange: ((last.weight - first.weight) / first.weight) * 100
    },
    bodyFat: {
      start: first.bodyFat.percentage,
      end: last.bodyFat.percentage,
      change: last.bodyFat.percentage - first.bodyFat.percentage,
      massChange: (last.bodyFat.mass || 0) - (first.bodyFat.mass || 0)
    },
    leanMass: {
      start: first.leanMass?.total || 0,
      end: last.leanMass?.total || 0,
      change: (last.leanMass?.total || 0) - (first.leanMass?.total || 0)
    },
    muscleMass: {
      start: first.muscleMass?.total || 0,
      end: last.muscleMass?.total || 0,
      change: (last.muscleMass?.total || 0) - (first.muscleMass?.total || 0)
    },
    timespan: {
      days: Math.floor((last.measurementDate - first.measurementDate) / (1000 * 60 * 60 * 24)),
      measurements: measurements.length
    }
  };
};

module.exports = mongoose.model('BodyComposition', bodyCompositionSchema);
