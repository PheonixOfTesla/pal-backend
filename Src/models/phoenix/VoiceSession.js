// ============================================
// VOICE SESSION MODEL - Voice AI Conversations
// ============================================
// Tracks voice interactions with Phoenix AI
// ============================================

const mongoose = require('mongoose');

const voiceSessionSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Session status
  status: {
    type: String,
    enum: ['active', 'completed', 'failed', 'cancelled'],
    default: 'active',
    index: true
  },

  // Transcript of the conversation
  transcript: {
    type: String,
    default: ''
  },

  // Intent/purpose of the call
  intent: {
    type: String
  },

  // Duration in seconds
  duration: {
    type: Number,
    default: 0
  },

  // Audio recording URL (if recorded)
  recordingUrl: {
    type: String
  },

  // Metadata (flexible storage for session-specific data)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Messages in the conversation
  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    audioUrl: String
  }],

  // Sentiment analysis
  sentiment: {
    overall: {
      type: String,
      enum: ['positive', 'neutral', 'negative']
    },
    score: {
      type: Number,
      min: -1,
      max: 1
    }
  },

  // Session end reason
  endReason: {
    type: String,
    enum: ['completed', 'user_hangup', 'timeout', 'error', 'cancelled']
  }

}, {
  timestamps: true
});

// Indexes
voiceSessionSchema.index({ userId: 1, createdAt: -1 });
voiceSessionSchema.index({ status: 1, createdAt: -1 });

// Virtual for checking if session is active
voiceSessionSchema.virtual('isActive').get(function() {
  return this.status === 'active';
});

// Method to add message to conversation
voiceSessionSchema.methods.addMessage = function(role, content, audioUrl = null) {
  this.messages.push({
    role,
    content,
    timestamp: new Date(),
    audioUrl
  });
  
  // Append to transcript
  const speaker = role === 'user' ? 'User' : 'Phoenix';
  this.transcript += `\n[${speaker}]: ${content}`;
  
  return this.save();
};

// Method to end session
voiceSessionSchema.methods.endSession = function(reason = 'completed') {
  this.status = 'completed';
  this.endReason = reason;
  return this.save();
};

// Static method to get user's session history
voiceSessionSchema.statics.getUserSessions = function(userId, days = 30, limit = 50) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    userId,
    createdAt: { $gte: startDate }
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get active sessions
voiceSessionSchema.statics.getActiveSessions = function(userId) {
  return this.find({
    userId,
    status: 'active'
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('VoiceSession', voiceSessionSchema);
