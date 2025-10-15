// Src/models/Intervention.js
const mongoose = require('mongoose');

const interventionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['recovery_critical', 'hrv_low', 'overtraining', 'sleep_debt', 'goal_risk', 'illness_predicted', 'calendar_conflict', 'spending_alert'], required: true },
  action: { type: String, required: true },
  reason: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  affectedWorkouts: Number,
  affectedEvents: Number,
  goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal' },
  workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'CalendarEvent' },
  userAcknowledged: { type: Boolean, default: false },
  acknowledgedAt: Date,
  outcome: { type: String, enum: ['accepted', 'rejected', 'ignored', 'successful', 'failed'] },
  metrics: {
    beforeHRV: Number,
    afterHRV: Number,
    beforeRecovery: Number,
    afterRecovery: Number
  }
}, { timestamps: true });

interventionSchema.index({ userId: 1, timestamp: -1 });
interventionSchema.index({ userId: 1, type: 1 });
interventionSchema.index({ userId: 1, severity: 1 });

module.exports = mongoose.model('Intervention', interventionSchema);