const mongoose = require('mongoose');

const performanceTestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['strength', 'endurance', 'power', 'mobility', 'flexibility'],
    required: true
  },
  name: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  exercises: [{
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise'
    },
    exerciseName: String,
    testType: {
      type: String,
      enum: ['1RM', '3RM', '5RM', 'VO2max', 'lactate_threshold', 'time_trial', 'distance', 'reps_to_failure']
    },
    result: {
      weight: Number,       // For strength tests
      reps: Number,         // For rep-based tests
      time: Number,         // For timed tests (seconds)
      distance: Number,     // For distance tests (meters)
      vo2max: Number,       // For cardio tests
      heartRate: Number     // For cardio tests
    },
    percentile: Number,     // Compared to population
    improvement: Number,    // % improvement from last test
    notes: String
  }],
  baseline: {
    type: Boolean,
    default: false  // First test is baseline
  },
  environment: {
    location: String,
    temperature: Number,
    weather: String
  },
  preTestMetrics: {
    sleep: Number,          // Hours of sleep
    recovery: Number,       // Recovery score
    nutrition: String,      // Pre-test meal
    energyLevel: Number     // 1-10
  },
  postTestMetrics: {
    fatigue: Number,        // 1-10
    soreness: Number,       // 1-10
    satisfaction: Number    // 1-10
  },
  comparisonToPrevious: {
    improvement: Number,    // Percentage
    timeSinceLastTest: Number // Days
  },
  notes: String,
  tags: [String]
}, {
  timestamps: true
});

// Compound indexes
performanceTestSchema.index({ userId: 1, type: 1 });
performanceTestSchema.index({ userId: 1, date: -1 });

// Calculate percentile based on population data
performanceTestSchema.methods.calculatePercentile = function(exercise, result) {
  // Simplified percentile calculation
  // In production, this would query a benchmarks database
  return Math.floor(Math.random() * 100); // Placeholder
};

// Get improvement from last test
performanceTestSchema.methods.getImprovement = async function() {
  const lastTest = await this.constructor.findOne({
    userId: this.userId,
    type: this.type,
    _id: { $ne: this._id },
    date: { $lt: this.date }
  }).sort({ date: -1 });

  if (!lastTest) return null;

  const improvements = [];
  this.exercises.forEach((currentEx, idx) => {
    const prevEx = lastTest.exercises.find(e => 
      e.exerciseId?.toString() === currentEx.exerciseId?.toString()
    );
    
    if (prevEx && prevEx.result && currentEx.result) {
      const improvement = ((currentEx.result.weight - prevEx.result.weight) / prevEx.result.weight) * 100;
      improvements.push({
        exercise: currentEx.exerciseName,
        improvement: improvement.toFixed(2)
      });
    }
  });

  return improvements;
};

// Pre-save hook to set baseline flag
performanceTestSchema.pre('save', async function(next) {
  if (this.isNew) {
    const existingTests = await this.constructor.countDocuments({
      userId: this.userId,
      type: this.type
    });
    
    if (existingTests === 0) {
      this.baseline = true;
    }
  }
  next();
});

module.exports = mongoose.model('PerformanceTest', performanceTestSchema);
