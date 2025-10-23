// Src/models/phoenix/BodyMeasurement.js
// Model for body measurement predictions and tracking
// Used by Phoenix prediction engine for forecasting body composition changes

const mongoose = require('mongoose');

const bodyMeasurementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Measurement type
  measurementType: {
    type: String,
    required: true,
    enum: [
      'weight',
      'body_fat_percentage',
      'muscle_mass',
      'bmi',
      'waist',
      'chest',
      'arms',
      'legs',
      'hips',
      'neck',
      'shoulders',
      'thighs',
      'calves'
    ]
  },
  
  // Measurement data
  value: {
    type: Number,
    required: true
  },
  
  unit: {
    type: String,
    required: true,
    enum: ['kg', 'lbs', 'cm', 'inches', 'percentage']
  },
  
  // Prediction metadata
  isPrediction: {
    type: Boolean,
    default: false
  },
  
  predictionConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: null
  },
  
  predictedFor: {
    type: Date,
    default: null
  },
  
  // Actual measurement date
  measuredAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Source of measurement
  source: {
    type: String,
    enum: ['manual', 'smart_scale', 'dexa_scan', 'predicted', 'imported'],
    default: 'manual'
  },
  
  // Additional context
  notes: {
    type: String,
    maxlength: 500
  },
  
  // Environmental factors
  conditions: {
    timeOfDay: {
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'night']
    },
    hydrationLevel: {
      type: String,
      enum: ['low', 'normal', 'high']
    },
    recentExercise: Boolean,
    recentMeal: Boolean
  },
  
  // Validation
  validated: {
    type: Boolean,
    default: false
  },
  
  // Related data
  relatedWorkoutId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workout'
  },
  
  relatedGoalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal'
  }
  
}, {
  timestamps: true
});

// Indexes
bodyMeasurementSchema.index({ userId: 1, measurementType: 1, measuredAt: -1 });
bodyMeasurementSchema.index({ userId: 1, isPrediction: 1 });

// Methods
bodyMeasurementSchema.methods.validate = function() {
  this.validated = true;
  return this.save();
};

// Statics
bodyMeasurementSchema.statics.getLatestMeasurement = function(userId, measurementType) {
  return this.findOne({ 
    userId, 
    measurementType,
    isPrediction: false 
  })
    .sort({ measuredAt: -1 })
    .exec();
};

bodyMeasurementSchema.statics.getMeasurementHistory = function(userId, measurementType, days = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    userId,
    measurementType,
    isPrediction: false,
    measuredAt: { $gte: startDate }
  })
    .sort({ measuredAt: 1 })
    .exec();
};

const BodyMeasurement = mongoose.model('BodyMeasurement', bodyMeasurementSchema);

module.exports = BodyMeasurement;
