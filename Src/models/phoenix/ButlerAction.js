// ============================================
// BUTLER ACTION MODEL - Phoenix Task Tracking
// ============================================
// Tracks all automated actions performed by Phoenix AI
// (calls, SMS, emails, reservations, rides, etc.)
// ============================================

const mongoose = require('mongoose');

const butlerActionSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Action type
  actionType: {
    type: String,
    required: true,
    enum: [
      'call',           // Phone call
      'sms',            // Text message
      'email',          // Email
      'calendar',       // Calendar event
      'reservation',    // Restaurant reservation
      'food',           // Food order
      'ride',           // Ride booking
      'task',           // Generic task
      'reminder',       // Reminder
      'notification',   // Notification
      'automation'      // Automated workflow
    ],
    index: true
  },

  // Action description
  description: {
    type: String,
    required: true
  },

  // Status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'in_progress', 'sent', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },

  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Metadata (flexible storage for action-specific data)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Scheduling
  scheduledFor: {
    type: Date
  },

  // Completion
  completedAt: {
    type: Date
  },

  // Error tracking
  errorMessage: {
    type: String
  },

  // Retry tracking
  retryCount: {
    type: Number,
    default: 0
  },

  maxRetries: {
    type: Number,
    default: 3
  }

}, {
  timestamps: true
});

// Indexes for common queries
butlerActionSchema.index({ userId: 1, actionType: 1 });
butlerActionSchema.index({ userId: 1, status: 1 });
butlerActionSchema.index({ userId: 1, createdAt: -1 });
butlerActionSchema.index({ scheduledFor: 1, status: 1 });

// Virtual for checking if action is overdue
butlerActionSchema.virtual('isOverdue').get(function() {
  if (this.scheduledFor && this.status === 'pending') {
    return new Date() > this.scheduledFor;
  }
  return false;
});

// Method to mark as completed
butlerActionSchema.methods.complete = function(metadata = {}) {
  this.status = 'completed';
  this.completedAt = new Date();
  if (Object.keys(metadata).length > 0) {
    this.metadata = { ...this.metadata, ...metadata };
  }
  return this.save();
};

// Method to mark as failed
butlerActionSchema.methods.fail = function(errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.completedAt = new Date();
  return this.save();
};

// Method to retry
butlerActionSchema.methods.retry = function() {
  if (this.retryCount < this.maxRetries) {
    this.retryCount += 1;
    this.status = 'pending';
    this.errorMessage = undefined;
    return this.save();
  }
  throw new Error('Maximum retries exceeded');
};

// Static method to get user's action history
butlerActionSchema.statics.getUserHistory = function(userId, days = 30, limit = 50) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    userId,
    createdAt: { $gte: startDate }
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get pending actions
butlerActionSchema.statics.getPendingActions = function(userId) {
  return this.find({
    userId,
    status: 'pending'
  }).sort({ scheduledFor: 1, priority: -1 });
};

module.exports = mongoose.model('ButlerAction', butlerActionSchema);
