// Src/models/QuarterlyReview.js
const mongoose = require('mongoose');

const quarterlyReviewSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  quarter: { 
    type: String, 
    required: true 
  },
  date: { 
    type: Date, 
    required: true 
  },
  wins: [String],
  losses: [String],
  learnings: [String],
  gratitude: [String],
  nextQuarterGoals: [String],
  lifeWheelScores: {
    health: Number,
    wealth: Number,
    relationships: Number,
    career: Number,
    growth: Number,
    legacy: Number
  },
  overallSatisfaction: { 
    type: Number, 
    min: 0, 
    max: 10 
  },
  notes: String
}, { timestamps: true });

quarterlyReviewSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('QuarterlyReview', quarterlyReviewSchema);