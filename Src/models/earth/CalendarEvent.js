// ================================================================
// CALENDAR EVENT MODEL
// ================================================================
// File: Src/models/CalendarEvent.js
// Purpose: Store calendar events with energy optimization data
// System: Earth (Calendar & Energy)
// ================================================================

const mongoose = require('mongoose');

const CalendarEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    provider: {
      type: String,
      enum: ['google', 'outlook', 'apple', 'manual'],
      required: [true, 'Provider is required']
    },
    externalEventId: {
      type: String,
      index: true,
      sparse: true // Only for synced events
    },
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
      index: true
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required']
    },
    location: {
      type: String,
      trim: true
    },
    attendees: [{
      type: String,
      lowercase: true,
      trim: true
    }],
    meetingType: {
      type: String,
      enum: ['focus', 'social', 'stressful', 'travel', 'workout', 'other'],
      default: 'other'
    },
    // ⭐ UNIQUE: Energy optimization features
    energyRequirement: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
      description: '1=Low energy needed, 5=High energy needed'
    },
    performanceRating: {
      type: Number,
      min: 1,
      max: 5,
      description: 'Post-meeting performance assessment'
    },
    // ⭐ UNIQUE: Biometric correlation
    correlatedHRV: {
      type: Number,
      description: 'HRV during this meeting'
    },
    correlatedSleep: {
      type: Number,
      description: 'Sleep quality the night before'
    },
    autoScheduled: {
      type: Boolean,
      default: false,
      description: 'Was this event scheduled by AI optimization?'
    },
    lastSynced: {
      type: Date,
      description: 'Last time this event was synced from provider'
    },
    // Event metadata
    isRecurring: {
      type: Boolean,
      default: false
    },
    recurringEventId: {
      type: String,
      description: 'ID of the recurring event series'
    },
    status: {
      type: String,
      enum: ['confirmed', 'tentative', 'cancelled'],
      default: 'confirmed'
    },
    // AI insights
    aiSuggestions: [{
      type: {
        type: String,
        enum: ['reschedule', 'decline', 'prepare', 'break_before', 'break_after']
      },
      reason: String,
      confidence: Number,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  {
    timestamps: true
  }
);

// ================================================================
// INDEXES
// ================================================================

// Compound index for efficient queries
CalendarEventSchema.index({ userId: 1, startTime: -1 });
CalendarEventSchema.index({ userId: 1, provider: 1 });
CalendarEventSchema.index({ userId: 1, meetingType: 1 });
CalendarEventSchema.index({ externalEventId: 1, provider: 1 }, { sparse: true });

// ================================================================
// VIRTUAL FIELDS
// ================================================================

// Duration in minutes
CalendarEventSchema.virtual('duration').get(function() {
  return Math.round((this.endTime - this.startTime) / (1000 * 60));
});

// Energy alignment score (calculated with energy pattern)
CalendarEventSchema.virtual('energyAlignmentScore').get(function() {
  // This will be populated by the controller when energy pattern is available
  return this._energyAlignmentScore || null;
});

CalendarEventSchema.set('toJSON', { virtuals: true });
CalendarEventSchema.set('toObject', { virtuals: true });

// ================================================================
// INSTANCE METHODS
// ================================================================

/**
 * Check if event conflicts with another event
 */
CalendarEventSchema.methods.conflictsWith = function(otherEvent) {
  return (
    (this.startTime < otherEvent.endTime && this.endTime > otherEvent.startTime) ||
    (otherEvent.startTime < this.endTime && otherEvent.endTime > this.startTime)
  );
};

/**
 * Calculate energy cost of this event
 */
CalendarEventSchema.methods.calculateEnergyCost = function() {
  const duration = this.duration;
  const energyReq = this.energyRequirement || 3;
  
  // Energy cost = duration (hours) * energy requirement * meeting type multiplier
  const typeMultiplier = {
    focus: 1.5,
    stressful: 2.0,
    social: 0.8,
    travel: 1.2,
    workout: 1.8,
    other: 1.0
  };
  
  const multiplier = typeMultiplier[this.meetingType] || 1.0;
  const hours = duration / 60;
  
  return hours * energyReq * multiplier;
};

/**
 * Get optimal buffer time before this event (in minutes)
 */
CalendarEventSchema.methods.getOptimalBufferTime = function() {
  const bufferMap = {
    focus: 15,
    stressful: 30,
    social: 10,
    travel: 30,
    workout: 15,
    other: 10
  };
  
  return bufferMap[this.meetingType] || 10;
};

// ================================================================
// STATIC METHODS
// ================================================================

/**
 * Get events for a specific date range
 */
CalendarEventSchema.statics.getEventsByDateRange = async function(userId, startDate, endDate) {
  return this.find({
    userId,
    startTime: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort({ startTime: 1 });
};

/**
 * Get events for today
 */
CalendarEventSchema.statics.getTodayEvents = async function(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.find({
    userId,
    startTime: {
      $gte: today,
      $lt: tomorrow
    }
  }).sort({ startTime: 1 });
};

/**
 * Get upcoming events (next 7 days)
 */
CalendarEventSchema.statics.getUpcomingEvents = async function(userId, days = 7) {
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + days);
  
  return this.find({
    userId,
    startTime: {
      $gte: now,
      $lte: future
    },
    status: { $ne: 'cancelled' }
  }).sort({ startTime: 1 });
};

/**
 * Find free slots in a given date range
 */
CalendarEventSchema.statics.findFreeSlots = async function(userId, startDate, endDate, durationMinutes = 60) {
  const events = await this.getEventsByDateRange(userId, startDate, endDate);
  
  const freeSlots = [];
  let currentTime = new Date(startDate);
  
  events.forEach((event, index) => {
    // Add free slot if there's a gap
    if (currentTime < event.startTime) {
      const gapDuration = (event.startTime - currentTime) / (1000 * 60);
      if (gapDuration >= durationMinutes) {
        freeSlots.push({
          start: new Date(currentTime),
          end: new Date(event.startTime),
          duration: gapDuration
        });
      }
    }
    currentTime = event.endTime > currentTime ? new Date(event.endTime) : currentTime;
  });
  
  // Check for free time after last event
  if (currentTime < endDate) {
    const gapDuration = (endDate - currentTime) / (1000 * 60);
    if (gapDuration >= durationMinutes) {
      freeSlots.push({
        start: new Date(currentTime),
        end: new Date(endDate),
        duration: gapDuration
      });
    }
  }
  
  return freeSlots;
};

/**
 * Calculate total meeting load for a date
 */
CalendarEventSchema.statics.calculateDailyLoad = async function(userId, date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  
  const events = await this.find({
    userId,
    startTime: { $gte: dayStart, $lt: dayEnd }
  });
  
  let totalMinutes = 0;
  let totalEnergyCost = 0;
  let totalEvents = events.length;
  
  events.forEach(event => {
    totalMinutes += event.duration;
    totalEnergyCost += event.calculateEnergyCost();
  });
  
  return {
    totalEvents,
    totalMinutes,
    totalHours: (totalMinutes / 60).toFixed(2),
    totalEnergyCost: totalEnergyCost.toFixed(2),
    averageEnergyPerEvent: totalEvents > 0 ? (totalEnergyCost / totalEvents).toFixed(2) : 0,
    utilizationPercent: ((totalMinutes / (16 * 60)) * 100).toFixed(1) // Assuming 16 hour day
  };
};

// ================================================================
// MIDDLEWARE
// ================================================================

// Ensure endTime is after startTime
CalendarEventSchema.pre('save', function(next) {
  if (this.endTime <= this.startTime) {
    next(new Error('End time must be after start time'));
  }
  next();
});

// Set lastSynced on update for external events
CalendarEventSchema.pre('save', function(next) {
  if (this.isModified() && this.provider !== 'manual') {
    this.lastSynced = new Date();
  }
  next();
});

module.exports = mongoose.model('CalendarEvent', CalendarEventSchema);
