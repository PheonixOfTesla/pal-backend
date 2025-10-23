const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  type: {
    type: String,
    enum: [
      'workout-count',      // Complete X workouts
      'total-volume',       // Lift X total weight
      'consistency',        // Workout X days in a row
      'distance',           // Run/cycle X distance
      'time-based',         // Exercise for X minutes
      'specific-exercise',  // Do X reps of specific exercise
      'weight-loss',        // Lose X weight
      'custom'
    ],
    required: true
  },
  goal: {
    target: {
      type: Number,
      required: true
    },
    unit: String,  // workouts, lbs, km, minutes, etc.
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise'
    }
  },
  duration: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    durationDays: Number
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'invite-only'],
    default: 'public'
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    progress: {
      current: {
        type: Number,
        default: 0
      },
      percentage: {
        type: Number,
        default: 0
      },
      lastUpdated: Date
    },
    completed: Boolean,
    completedAt: Date,
    rank: Number
  }],
  maxParticipants: {
    type: Number,
    default: null  // null = unlimited
  },
  rules: [String],
  prizes: [{
    place: Number,  // 1st, 2nd, 3rd
    description: String,
    badge: String
  }],
  category: {
    type: String,
    enum: ['strength', 'cardio', 'weight-loss', 'consistency', 'mixed'],
    default: 'mixed'
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    default: 'intermediate'
  },
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  featured: Boolean,
  tags: [String],
  coverImage: String,
  leaderboard: {
    updateFrequency: {
      type: String,
      enum: ['realtime', 'daily', 'weekly'],
      default: 'daily'
    },
    lastUpdated: Date
  }
}, {
  timestamps: true
});

// Indexes
challengeSchema.index({ status: 1, 'duration.startDate': 1 });
challengeSchema.index({ 'participants.userId': 1 });
challengeSchema.index({ visibility: 1, status: 1 });

// Virtual for participant count
challengeSchema.virtual('participantCount').get(function() {
  return this.participants ? this.participants.length : 0;
});

// Virtual for spots remaining
challengeSchema.virtual('spotsRemaining').get(function() {
  if (!this.maxParticipants) return null;
  return this.maxParticipants - this.participantCount;
});

// Virtual for is full
challengeSchema.virtual('isFull').get(function() {
  if (!this.maxParticipants) return false;
  return this.participantCount >= this.maxParticipants;
});

// Method to join challenge
challengeSchema.methods.addParticipant = function(userId) {
  // Check if already joined
  const alreadyJoined = this.participants.some(p => 
    p.userId.toString() === userId.toString()
  );
  
  if (alreadyJoined) {
    throw new Error('User already participating in challenge');
  }
  
  // Check if full
  if (this.isFull) {
    throw new Error('Challenge is full');
  }
  
  // Check if active or upcoming
  if (this.status === 'completed' || this.status === 'cancelled') {
    throw new Error('Challenge is not accepting new participants');
  }
  
  this.participants.push({
    userId,
    joinedAt: new Date(),
    progress: {
      current: 0,
      percentage: 0,
      lastUpdated: new Date()
    },
    completed: false
  });
  
  return this.save();
};

// Method to update participant progress
challengeSchema.methods.updateProgress = function(userId, currentValue) {
  const participant = this.participants.find(p => 
    p.userId.toString() === userId.toString()
  );
  
  if (!participant) {
    throw new Error('User not participating in challenge');
  }
  
  participant.progress.current = currentValue;
  participant.progress.percentage = Math.min(100, 
    (currentValue / this.goal.target) * 100
  );
  participant.progress.lastUpdated = new Date();
  
  // Check if completed
  if (currentValue >= this.goal.target && !participant.completed) {
    participant.completed = true;
    participant.completedAt = new Date();
  }
  
  return this.save();
};

// Method to get leaderboard
challengeSchema.methods.getLeaderboard = function() {
  // Sort participants by progress
  const sorted = [...this.participants].sort((a, b) => {
    if (b.completed !== a.completed) {
      return b.completed ? 1 : -1;  // Completed first
    }
    return b.progress.current - a.progress.current;  // Then by progress
  });
  
  // Assign ranks
  sorted.forEach((participant, index) => {
    participant.rank = index + 1;
  });
  
  return sorted;
};

// Method to check and update status
challengeSchema.methods.updateStatus = function() {
  const now = new Date();
  
  if (this.duration.startDate > now) {
    this.status = 'upcoming';
  } else if (this.duration.endDate < now) {
    this.status = 'completed';
  } else {
    this.status = 'active';
  }
  
  return this.save();
};

// Pre-save hook to calculate duration days
challengeSchema.pre('save', function(next) {
  if (this.duration.startDate && this.duration.endDate) {
    const days = Math.ceil(
      (this.duration.endDate - this.duration.startDate) / (1000 * 60 * 60 * 24)
    );
    this.duration.durationDays = days;
  }
  next();
});

// Static method to get active challenges
challengeSchema.statics.getActiveChallenges = async function() {
  return await this.find({
    status: 'active',
    visibility: { $in: ['public', 'invite-only'] }
  })
    .populate('createdBy', 'name profilePicture')
    .sort({ 'duration.startDate': -1 });
};

// Static method to get user's challenges
challengeSchema.statics.getUserChallenges = async function(userId) {
  const active = await this.find({
    'participants.userId': userId,
    status: 'active'
  });
  
  const completed = await this.find({
    'participants.userId': userId,
    status: 'completed'
  });
  
  return { active, completed };
};

// Static method to get featured challenges
challengeSchema.statics.getFeaturedChallenges = async function() {
  return await this.find({
    featured: true,
    status: { $in: ['upcoming', 'active'] },
    visibility: 'public'
  })
    .populate('createdBy', 'name profilePicture')
    .sort({ 'duration.startDate': 1 })
    .limit(10);
};

module.exports = mongoose.model('Challenge', challengeSchema);
