const mongoose = require('mongoose');

const voiceSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  transcript: { type: String, required: true },
  intent: String,
  response: String,
  duration: Number, // seconds
  status: { type: String, enum: ['active', 'completed', 'failed'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('VoiceSession', voiceSessionSchema);
