/**
 * 🪐 QUARTERLY REVIEW MODEL
 * Structured quarterly life reviews
 * 
 * Saturn System
 */

const mongoose = require('mongoose');

const lifeAreaScoresSchema = new mongoose.Schema({
  health: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  wealth: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  relationships: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  career: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  personalGrowth: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  impact: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  learning: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  recreation: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  }
}, { _id: false });

const QuarterlyReviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  quarter: {
    type: String,
    required: true,
    trim: true,
    // Format: "Q1 2025", "Q2 2025", etc.
    match: /^Q[1-4] \d{4}$/
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  winsThisQuarter: [{
    type: String,
    maxlength: 500
  }],
  lessonsLearned: [{
    type: String,
    maxlength: 500
  }],
  areasForImprovement: [{
    type: String,
    maxlength: 500
  }],
  nextQuarterFocus: [{
    type: String,
    maxlength: 500
  }],
  lifeAreaScores: {
    type: lifeAreaScoresSchema,
    required: true
  },
  overallSatisfaction: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  gratefulFor: [{
    type: String,
    maxlength: 300
  }],
  additionalNotes: {
    type: String,
    maxlength: 2000
  }
}, {
  timestamps: true
});

// ========================================
// COMPOUND INDEX
// ========================================
QuarterlyReviewSchema.index({ userId: 1, quarter: 1 }, { unique: true });

// ========================================
// VIRTUAL FIELDS
// ========================================

/**
 * Calculate average life area score
 */
QuarterlyReviewSchema.virtual('avgLifeScore').get(function() {
  if (!this.lifeAreaScores) return 0;
  
  const scores = Object.values(this.lifeAreaScores);
  const sum = scores.reduce((acc, score) => acc + score, 0);
  return (sum / scores.length).toFixed(1);
});

/**
 * Get highest scoring life area
 */
QuarterlyReviewSchema.virtual('highestArea').get(function() {
  if (!this.lifeAreaScores) return null;
  
  let highest = { area: null, score: 0 };
  Object.entries(this.lifeAreaScores).forEach(([area, score]) => {
    if (score > highest.score) {
      highest = { area, score };
    }
  });
  
  return highest;
});

/**
 * Get lowest scoring life area
 */
QuarterlyReviewSchema.virtual('lowestArea').get(function() {
  if (!this.lifeAreaScores) return null;
  
  let lowest = { area: null, score: 11 };
  Object.entries(this.lifeAreaScores).forEach(([area, score]) => {
    if (score < lowest.score) {
      lowest = { area, score };
    }
  });
  
  return lowest;
});

// ========================================
// INSTANCE METHODS
// ========================================

/**
 * Compare with previous quarter
 */
QuarterlyReviewSchema.methods.compareToPrevious = async function() {
  const [currentQ, currentYear] = this.quarter.split(' ');
  const currentQuarterNum = parseInt(currentQ.replace('Q', ''));
  
  let prevQuarter, prevYear;
  if (currentQuarterNum === 1) {
    prevQuarter = 'Q4';
    prevYear = (parseInt(currentYear) - 1).toString();
  } else {
    prevQuarter = `Q${currentQuarterNum - 1}`;
    prevYear = currentYear;
  }
  
  const previousReview = await this.constructor.findOne({
    userId: this.userId,
    quarter: `${prevQuarter} ${prevYear}`
  });
  
  if (!previousReview) {
    return null;
  }
  
  const satisfactionChange = this.overallSatisfaction - previousReview.overallSatisfaction;
  
  return {
    previous: previousReview,
    satisfactionChange,
    trend: satisfactionChange > 0 ? 'improved' : satisfactionChange < 0 ? 'declined' : 'stable'
  };
};

/**
 * Get areas that improved vs previous quarter
 */
QuarterlyReviewSchema.methods.getImprovedAreas = async function() {
  const comparison = await this.compareToPrevious();
  if (!comparison) return [];
  
  const improved = [];
  Object.entries(this.lifeAreaScores).forEach(([area, score]) => {
    const prevScore = comparison.previous.lifeAreaScores[area];
    if (score > prevScore) {
      improved.push({
        area,
        improvement: score - prevScore,
        currentScore: score,
        previousScore: prevScore
      });
    }
  });
  
  return improved.sort((a, b) => b.improvement - a.improvement);
};

/**
 * Get areas that declined vs previous quarter
 */
QuarterlyReviewSchema.methods.getDeclinedAreas = async function() {
  const comparison = await this.compareToPrevious();
  if (!comparison) return [];
  
  const declined = [];
  Object.entries(this.lifeAreaScores).forEach(([area, score]) => {
    const prevScore = comparison.previous.lifeAreaScores[area];
    if (score < prevScore) {
      declined.push({
        area,
        decline: prevScore - score,
        currentScore: score,
        previousScore: prevScore
      });
    }
  });
  
  return declined.sort((a, b) => b.decline - a.decline);
};

// ========================================
// STATIC METHODS
// ========================================

/**
 * Get latest review for a user
 */
QuarterlyReviewSchema.statics.getLatest = async function(userId) {
  return await this.findOne({ userId }).sort({ date: -1 });
};

/**
 * Get all reviews for a user
 */
QuarterlyReviewSchema.statics.getUserReviews = async function(userId, limit = 10) {
  return await this.find({ userId })
    .sort({ date: -1 })
    .limit(limit);
};

/**
 * Calculate satisfaction trend for a user
 */
QuarterlyReviewSchema.statics.getSatisfactionTrend = async function(userId) {
  const reviews = await this.find({ userId })
    .sort({ date: 1 })
    .select('quarter overallSatisfaction date');
  
  if (reviews.length === 0) return null;
  
  const trend = reviews.map(r => ({
    quarter: r.quarter,
    satisfaction: r.overallSatisfaction,
    date: r.date
  }));
  
  // Calculate linear regression
  const n = trend.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  trend.forEach((point, index) => {
    sumX += index;
    sumY += point.satisfaction;
    sumXY += index * point.satisfaction;
    sumX2 += index * index;
  });
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  
  return {
    trend,
    direction: slope > 0.1 ? 'improving' : slope < -0.1 ? 'declining' : 'stable',
    slope: slope.toFixed(2),
    avgSatisfaction: (sumY / n).toFixed(1)
  };
};

/**
 * Get review by quarter
 */
QuarterlyReviewSchema.statics.getByQuarter = async function(userId, quarter) {
  return await this.findOne({ userId, quarter });
};

/**
 * Get current quarter string
 */
QuarterlyReviewSchema.statics.getCurrentQuarter = function() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  
  let quarter;
  if (month <= 3) quarter = 'Q1';
  else if (month <= 6) quarter = 'Q2';
  else if (month <= 9) quarter = 'Q3';
  else quarter = 'Q4';
  
  return `${quarter} ${year}`;
};

/**
 * Check if current quarter review exists
 */
QuarterlyReviewSchema.statics.hasCurrentQuarterReview = async function(userId) {
  const currentQuarter = this.getCurrentQuarter();
  const review = await this.findOne({ userId, quarter: currentQuarter });
  return !!review;
};

// Enable virtuals in JSON output
QuarterlyReviewSchema.set('toJSON', { virtuals: true });
QuarterlyReviewSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('QuarterlyReview', QuarterlyReviewSchema);
