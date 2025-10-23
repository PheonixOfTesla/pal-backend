const mongoose = require('mongoose');

const butlerActionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actionType: { type: String, required: true, enum: ['email', 'calendar', 'reminder', 'notification', 'task', 'call'] },
  description: { type: String, required: true },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'pending', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  scheduledFor: Date,
  completedAt: Date,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

butlerActionSchema.index({ userId: 1, status: 1 });
butlerActionSchema.index({ userId: 1, scheduledFor: 1 });

module.exports = mongoose.model('ButlerAction', butlerActionSchema);
