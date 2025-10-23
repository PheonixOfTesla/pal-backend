/**
 * 🪐 LEGACY VISION MODEL
 * Long-term life planning and mortality awareness
 * 
 * Saturn System
 */

const mongoose = require('mongoose');

const coreValueSchema = new mongoose.Schema({
  value: {
    type: String,
    required: true
  },
  importance: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  }
}, { _id: false });

const lifeAreaSchema = new mongoose.Schema({
  area: {
    type: String,
    required: true,
    enum: ['health', 'wealth', 'relationships', 'career', 'impact', 'learning', 'recreation']
  },
  currentScore: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  },
  targetScore: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  },
  keyGoals: [{
    type: String
  }],
  onTrack: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const legacyGoalSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  importance: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  deadline: {
    type: Date
  }
}, { _id: false });

const LegacyVisionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  tenYearVision: {
    type: String,
    maxlength: 5000,
    trim: true
  },
  coreValues: [coreValueSchema],
  lifeAreas: [lifeAreaSchema],
  legacyGoals: [legacyGoalSchema],
  biggestRegrets: [{
    type: String,
    maxlength: 500
  }],
  deathDate: {
    type: Date,
    required: true
  },
  daysRemaining: {
    type: Number,
    default: 0
  },
  eulogyDraft: {
    type: String,
    maxlength: 2000,
    trim: true
  },
  legacyStatement: {
    type: String,
    maxlength: 1000,
    trim: true
  },
  lastReviewed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ========================================
// PRE-SAVE HOOK: Auto-calculate days remaining
// ========================================
LegacyVisionSchema.pre('save', function(next) {
  if (this.deathDate) {
    const now = new Date();
    const death = new Date(this.deathDate);
    const diffTime = death - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    this.daysRemaining = diffDays > 0 ? diffDays : 0;
  }
  
  // Auto-calculate onTrack status for life areas
  if (this.lifeAreas && this.lifeAreas.length > 0) {
    this.lifeAreas.forEach(area => {
      area.onTrack = area.currentScore >= area.targetScore * 0.7; // 70% threshold
    });
  }
  
  next();
});

// ========================================
// VIRTUAL FIELDS
// ========================================

// Calculate overall life satisfaction score
LegacyVisionSchema.virtual('overallLifeScore').get(function() {
  if (!this.lifeAreas || this.lifeAreas.length === 0) return 0;
  const sum = this.lifeAreas.reduce((acc, area) => acc + area.currentScore, 0);
  return (sum / this.lifeAreas.length).toFixed(1);
});

// Calculate legacy goal completion percentage
LegacyVisionSchema.virtual('legacyGoalProgress').get(function() {
  if (!this.legacyGoals || this.legacyGoals.length === 0) return 0;
  const sum = this.legacyGoals.reduce((acc, goal) => acc + goal.progress, 0);
  return Math.round(sum / this.legacyGoals.length);
});

// Calculate weeks remaining
LegacyVisionSchema.virtual('weeksRemaining').get(function() {
  return Math.floor(this.daysRemaining / 7);
});

// Calculate years remaining
LegacyVisionSchema.virtual('yearsRemaining').get(function() {
  return Math.floor(this.daysRemaining / 365);
});

// ========================================
// INSTANCE METHODS
// ========================================

/**
 * Check if vision needs review (>90 days since last review)
 */
LegacyVisionSchema.methods.needsReview = function() {
  if (!this.lastReviewed) return true;
  const daysSinceReview = Math.floor((Date.now() - this.lastReviewed) / (1000 * 60 * 60 * 24));
  return daysSinceReview > 90;
};

/**
 * Get areas that need attention (currentScore < targetScore * 0.7)
 */
LegacyVisionSchema.methods.getAreasNeedingAttention = function() {
  return this.lifeAreas.filter(area => !area.onTrack);
};

/**
 * Get top priority legacy goals (importance >= 4 and progress < 50%)
 */
LegacyVisionSchema.methods.getTopPriorityGoals = function() {
  return this.legacyGoals.filter(goal => goal.importance >= 4 && goal.progress < 50);
};

// ========================================
// STATIC METHODS
// ========================================

/**
 * Get vision by userId
 */
LegacyVisionSchema.statics.getByUserId = async function(userId) {
  return await this.findOne({ userId });
};

/**
 * Update legacy goal progress
 */
LegacyVisionSchema.statics.updateGoalProgress = async function(userId, goalDescription, progress) {
  const vision = await this.findOne({ userId });
  if (!vision) throw new Error('Legacy vision not found');
  
  const goal = vision.legacyGoals.find(g => g.description === goalDescription);
  if (goal) {
    goal.progress = progress;
    await vision.save();
  }
  
  return vision;
};

// Enable virtuals in JSON output
LegacyVisionSchema.set('toJSON', { virtuals: true });
LegacyVisionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('LegacyVision', LegacyVisionSchema);
