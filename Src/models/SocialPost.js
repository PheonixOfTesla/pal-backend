const mongoose = require('mongoose');

const socialPostSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  postType: {
    type: String,
    enum: ['workout', 'measurement', 'achievement', 'photo', 'text'],
    required: true,
    default: 'workout'
  },
  content: {
    // For workout posts
    workoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workout'
    },
    // For measurement posts
    measurementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Measurement'
    },
    // For achievement posts
    achievement: {
      type: String,
      enum: ['PR', 'streak', 'goal-completed', 'milestone', 'transformation']
    },
    achievementDetails: {
      exercise: String,
      value: Number,
      unit: String,
      improvement: Number
    },
    // For text/general posts
    text: String,
    
    // For all posts
    photos: [String],  // URLs
    stats: {
      duration: Number,
      volume: Number,
      calories: Number,
      distance: Number,
      exercises: Number
    }
  },
  caption: {
    type: String,
    maxlength: 500
  },
  visibility: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'friends',
    index: true
  },
  likes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    date: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true,
      maxlength: 300
    },
    date: {
      type: Date,
      default: Date.now
    },
    edited: Boolean,
    likes: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      date: Date
    }]
  }],
  tags: [String],
  location: String,
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  challenge: {
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Challenge'
    },
    challengeName: String
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    caption: String,
    editedAt: Date
  }],
  engagement: {
    likeCount: {
      type: Number,
      default: 0
    },
    commentCount: {
      type: Number,
      default: 0
    },
    shareCount: {
      type: Number,
      default: 0
    },
    views: {
      type: Number,
      default: 0
    }
  },
  reported: {
    isReported: Boolean,
    reports: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String,
      date: Date
    }]
  }
}, {
  timestamps: true
});

// Compound indexes for feed queries
socialPostSchema.index({ userId: 1, createdAt: -1 });
socialPostSchema.index({ visibility: 1, createdAt: -1 });
socialPostSchema.index({ 'likes.userId': 1 });

// Virtual for like count (backup to engagement.likeCount)
socialPostSchema.virtual('likeCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Virtual for comment count
socialPostSchema.virtual('commentCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Method to add like
socialPostSchema.methods.addLike = function(userId) {
  // Check if already liked
  const alreadyLiked = this.likes.some(like => 
    like.userId.toString() === userId.toString()
  );
  
  if (!alreadyLiked) {
    this.likes.push({ userId, date: new Date() });
    this.engagement.likeCount = this.likes.length;
  }
  
  return this.save();
};

// Method to remove like
socialPostSchema.methods.removeLike = function(userId) {
  this.likes = this.likes.filter(like => 
    like.userId.toString() !== userId.toString()
  );
  this.engagement.likeCount = this.likes.length;
  
  return this.save();
};

// Method to add comment
socialPostSchema.methods.addComment = function(userId, text) {
  this.comments.push({
    userId,
    text,
    date: new Date()
  });
  this.engagement.commentCount = this.comments.length;
  
  return this.save();
};

// Method to delete comment
socialPostSchema.methods.deleteComment = function(commentId) {
  this.comments = this.comments.filter(comment => 
    comment._id.toString() !== commentId.toString()
  );
  this.engagement.commentCount = this.comments.length;
  
  return this.save();
};

// Method to edit post
socialPostSchema.methods.editPost = function(newCaption) {
  // Save to edit history
  if (this.caption) {
    this.editHistory.push({
      caption: this.caption,
      editedAt: new Date()
    });
  }
  
  this.caption = newCaption;
  this.isEdited = true;
  
  return this.save();
};

// Method to increment view count
socialPostSchema.methods.incrementViews = function() {
  this.engagement.views += 1;
  return this.save();
};

// Pre-save hook to update engagement counts
socialPostSchema.pre('save', function(next) {
  this.engagement.likeCount = this.likes.length;
  this.engagement.commentCount = this.comments.length;
  next();
});

// Static method to get feed for user
socialPostSchema.statics.getFeedForUser = async function(userId, page = 1, limit = 20, filter = 'all') {
  const skip = (page - 1) * limit;
  
  // Get user's friends (you'll need a Friends model)
  // For now, we'll just show public posts
  let query = {};
  
  if (filter === 'friends') {
    // Would need to fetch friend IDs
    // query.userId = { $in: friendIds };
    query.visibility = { $in: ['public', 'friends'] };
  } else if (filter === 'following') {
    // Similar to friends
    query.visibility = 'public';
  } else {
    query.visibility = 'public';
  }
  
  const posts = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'name profilePicture')
    .populate('content.workoutId')
    .populate('comments.userId', 'name profilePicture');
  
  const total = await this.countDocuments(query);
  
  return {
    posts,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalPosts: total,
      hasMore: skip + posts.length < total
    }
  };
};

// Static method to get user's posts
socialPostSchema.statics.getUserPosts = async function(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const posts = await this.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('content.workoutId')
    .populate('comments.userId', 'name profilePicture');
  
  const total = await this.countDocuments({ userId });
  
  return {
    posts,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalPosts: total
    }
  };
};

// Static method to get trending posts
socialPostSchema.statics.getTrendingPosts = async function(timeframe = 24, limit = 20) {
  const since = new Date();
  since.setHours(since.getHours() - timeframe);
  
  return await this.find({
    visibility: 'public',
    createdAt: { $gte: since }
  })
    .sort({ 'engagement.likeCount': -1, 'engagement.commentCount': -1 })
    .limit(limit)
    .populate('userId', 'name profilePicture');
};

module.exports = mongoose.model('SocialPost', socialPostSchema);
