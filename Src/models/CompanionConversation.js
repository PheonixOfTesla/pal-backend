// Src/models/CompanionConversation.js
const mongoose = require('mongoose');

const companionConversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  message: { type: String, required: true },
  context: {
    wearable: Boolean,
    workouts: Number,
    goals: Number,
    recovery: Number,
    mood: String
  },
  sentiment: { type: String, enum: ['positive', 'neutral', 'negative', 'urgent'] },
  actionTaken: String,
  tags: [String],
  embedding: [Number]
}, { timestamps: true });

companionConversationSchema.index({ userId: 1, createdAt: -1 });
companionConversationSchema.index({ userId: 1, tags: 1 });

companionConversationSchema.virtual('timestamp').get(function() {
  return this.createdAt;
});

companionConversationSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('CompanionConversation', companionConversationSchema);