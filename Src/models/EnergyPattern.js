// Src/models/EnergyPattern.js
const mongoose = require('mongoose');

const energyPatternSchema = new mongoose.Schema({
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
  hourlyEnergy: [{
    hour: { type: Number, min: 0, max: 23 },
    energyLevel: { type: Number, min: 0, max: 100 },
    activity: String,
    correlatedHRV: Number,
    sleepQuality: Number
  }],
  peakEnergyHours: [Number],
  lowEnergyHours: [Number],
  optimalMeetingTimes: [Number],
  avgDailyEnergy: { 
    type: Number, 
    min: 0, 
    max: 100 
  },
  pattern: { 
    type: String, 
    enum: ['morning', 'afternoon', 'evening', 'inconsistent'], 
    default: 'inconsistent' 
  },
  confidenceScore: { 
    type: Number, 
    min: 0, 
    max: 100, 
    default: 0 
  }
}, { timestamps: true });

energyPatternSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('EnergyPattern', energyPatternSchema);