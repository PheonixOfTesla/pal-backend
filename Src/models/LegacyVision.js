// Src/models/LegacyVision.js
const mongoose = require('mongoose');

const legacyVisionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true 
  },
  tenYearVision: {
    type: String,
    maxlength: 2000
  },
  coreValues: [{
    value: String,
    importance: { type: Number, min: 1, max: 10 }
  }],
  lifeAreas: [{
    area: { 
      type: String,
      enum: ['health', 'wealth', 'relationships', 'career', 'growth', 'legacy']
    },
    currentScore: { type: Number, min: 0, max: 10 },
    targetScore: { type: Number, min: 0, max: 10 },
    description: String
  }],
  deathDate: Date,
  daysRemaining: Number,
  lastReviewed: Date,
  eulogyDraft: String,
  legacyStatement: String
}, { timestamps: true });

module.exports = mongoose.model('LegacyVision', legacyVisionSchema);