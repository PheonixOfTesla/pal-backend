// Src/models/CalendarEvent.js
const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['google', 'outlook', 'apple', 'manual'], required: true },
  externalEventId: { type: String, index: true },
  title: { type: String, required: true },
  description: String,
  startTime: { type: Date, required: true, index: true },
  endTime: { type: Date, required: true },
  location: String,
  attendees: [String],
  meetingType: { type: String, enum: ['focus', 'social', 'stressful', 'travel', 'workout', 'other'], default: 'other' },
  energyRequirement: { type: Number, min: 1, max: 5, default: 3 },
  performanceRating: Number,
  correlatedHRV: Number,
  correlatedSleep: Number,
  autoScheduled: { type: Boolean, default: false },
  lastSynced: { type: Date, default: Date.now }
}, { timestamps: true });

calendarEventSchema.index({ userId: 1, startTime: -1 });
calendarEventSchema.index({ userId: 1, provider: 1 });

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);