/**
 * 🪐 SATURN CONTROLLER
 * Legacy Planning, Mortality Awareness, & Quarterly Reviews
 * 
 * Base Path: /api/saturn
 * Total Methods: 12
 * Models: LegacyVision, QuarterlyReview
 * Service: legacyService.js
 */

const LegacyVision = require('../models/LegacyVision');
const QuarterlyReview = require('../models/QuarterlyReview');
const legacyService = require('../services/saturn/legacyService');

// ========================================
// LEGACY VISION MANAGEMENT (6 methods)
// ========================================

/**
 * @desc    Create or update legacy vision
 * @route   POST /api/saturn/vision
 * @access  Private
 */
exports.createOrUpdateVision = async (req, res) => {
  try {
    const {
      tenYearVision,
      coreValues,
      lifeAreas,
      legacyGoals,
      biggestRegrets,
      deathDate,
      eulogyDraft,
      legacyStatement
    } = req.body;

    // Check if vision already exists
    let vision = await LegacyVision.findOne({ userId: req.user.id });

    if (vision) {
      // Update existing vision
      Object.assign(vision, {
        tenYearVision,
        coreValues,
        lifeAreas,
        legacyGoals,
        biggestRegrets,
        deathDate,
        eulogyDraft,
        legacyStatement,
        lastReviewed: Date.now()
      });
      await vision.save();
    } else {
      // Create new vision
      vision = await LegacyVision.create({
        userId: req.user.id,
        tenYearVision,
        coreValues,
        lifeAreas,
        legacyGoals,
        biggestRegrets,
        deathDate,
        eulogyDraft,
        legacyStatement
      });
    }

    res.status(200).json({
      success: true,
      data: vision
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create/update legacy vision',
      error: error.message
    });
  }
};

/**
 * @desc    Get user's legacy vision
 * @route   GET /api/saturn/vision
 * @access  Private
 */
exports.getVision = async (req, res) => {
  try {
    const vision = await LegacyVision.findOne({ userId: req.user.id });

    if (!vision) {
      return res.status(404).json({
        success: false,
        message: 'Legacy vision not found. Create one to get started.'
      });
    }

    res.status(200).json({
      success: true,
      data: vision
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve legacy vision',
      error: error.message
    });
  }
};

/**
 * @desc    Update life area scores
 * @route   PUT /api/saturn/vision/life-areas
 * @access  Private
 */
exports.updateLifeAreas = async (req, res) => {
  try {
    const { lifeAreas } = req.body;

    const vision = await LegacyVision.findOne({ userId: req.user.id });

    if (!vision) {
      return res.status(404).json({
        success: false,
        message: 'Legacy vision not found. Create one first.'
      });
    }

    // Update life areas
    vision.lifeAreas = lifeAreas;
    vision.lastReviewed = Date.now();
    await vision.save();

    res.status(200).json({
      success: true,
      data: vision.lifeAreas
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update life areas',
      error: error.message
    });
  }
};

/**
 * @desc    Add legacy goal
 * @route   POST /api/saturn/vision/legacy-goal
 * @access  Private
 */
exports.addLegacyGoal = async (req, res) => {
  try {
    const { description, importance, deadline } = req.body;

    const vision = await LegacyVision.findOne({ userId: req.user.id });

    if (!vision) {
      return res.status(404).json({
        success: false,
        message: 'Legacy vision not found. Create one first.'
      });
    }

    // Add new legacy goal
    const newGoal = {
      description,
      importance: importance || 3,
      progress: 0,
      deadline
    };

    vision.legacyGoals.push(newGoal);
    await vision.save();

    res.status(201).json({
      success: true,
      data: newGoal,
      allGoals: vision.legacyGoals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add legacy goal',
      error: error.message
    });
  }
};

/**
 * @desc    Get mortality data (days remaining)
 * @route   GET /api/saturn/mortality
 * @access  Private
 */
exports.getMortality = async (req, res) => {
  try {
    const vision = await LegacyVision.findOne({ userId: req.user.id });

    if (!vision || !vision.deathDate) {
      return res.status(404).json({
        success: false,
        message: 'No mortality data available. Set your estimated death date in legacy vision.'
      });
    }

    const now = new Date();
    const deathDate = new Date(vision.deathDate);
    const daysRemaining = Math.floor((deathDate - now) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.floor(daysRemaining / 7);
    const yearsRemaining = Math.floor(daysRemaining / 365);

    // Calculate life percentage
    const lifeExpectancy = req.user.age ? (vision.deathDate.getFullYear() - (new Date().getFullYear() - req.user.age)) : 80;
    const percentageLived = req.user.age ? ((req.user.age / lifeExpectancy) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        deathDate: vision.deathDate,
        daysRemaining: vision.daysRemaining,
        weeksRemaining,
        yearsRemaining,
        percentageLived: parseFloat(percentageLived),
        message: daysRemaining > 0 
          ? `You have ${daysRemaining.toLocaleString()} days remaining. Make them count.`
          : 'Every day is a gift.',
        motivation: legacyService.getMotivationalMessage(daysRemaining)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve mortality data',
      error: error.message
    });
  }
};

/**
 * @desc    Update last reviewed date
 * @route   PUT /api/saturn/vision/review
 * @access  Private
 */
exports.updateLastReviewed = async (req, res) => {
  try {
    const vision = await LegacyVision.findOne({ userId: req.user.id });

    if (!vision) {
      return res.status(404).json({
        success: false,
        message: 'Legacy vision not found.'
      });
    }

    vision.lastReviewed = Date.now();
    await vision.save();

    res.status(200).json({
      success: true,
      data: {
        lastReviewed: vision.lastReviewed
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update review date',
      error: error.message
    });
  }
};

// ========================================
// QUARTERLY REVIEWS (6 methods)
// ========================================

/**
 * @desc    Create quarterly review
 * @route   POST /api/saturn/quarterly
 * @access  Private
 */
exports.createQuarterlyReview = async (req, res) => {
  try {
    const {
      quarter,
      winsThisQuarter,
      lessonsLearned,
      areasForImprovement,
      nextQuarterFocus,
      lifeAreaScores,
      overallSatisfaction,
      gratefulFor,
      additionalNotes
    } = req.body;

    // Check if review already exists for this quarter
    const existingReview = await QuarterlyReview.findOne({
      userId: req.user.id,
      quarter
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: `Review for ${quarter} already exists. Use PUT to update.`
      });
    }

    const review = await QuarterlyReview.create({
      userId: req.user.id,
      quarter,
      winsThisQuarter,
      lessonsLearned,
      areasForImprovement,
      nextQuarterFocus,
      lifeAreaScores,
      overallSatisfaction,
      gratefulFor,
      additionalNotes
    });

    res.status(201).json({
      success: true,
      data: review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create quarterly review',
      error: error.message
    });
  }
};

/**
 * @desc    Get user's quarterly reviews
 * @route   GET /api/saturn/quarterly
 * @access  Private
 */
exports.getQuarterlyReviews = async (req, res) => {
  try {
    const reviews = await QuarterlyReview.find({ userId: req.user.id })
      .sort({ date: -1 })
      .limit(parseInt(req.query.limit) || 10);

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve quarterly reviews',
      error: error.message
    });
  }
};

/**
 * @desc    Get latest quarterly review
 * @route   GET /api/saturn/quarterly/latest
 * @access  Private
 */
exports.getLatestQuarterlyReview = async (req, res) => {
  try {
    const review = await QuarterlyReview.getLatest(req.user.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'No quarterly reviews found. Create your first review!'
      });
    }

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve latest review',
      error: error.message
    });
  }
};

/**
 * @desc    Update quarterly review
 * @route   PUT /api/saturn/quarterly/:id
 * @access  Private
 */
exports.updateQuarterlyReview = async (req, res) => {
  try {
    const review = await QuarterlyReview.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Quarterly review not found'
      });
    }

    // Verify ownership
    if (review.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this review'
      });
    }

    // Update fields
    Object.assign(review, req.body);
    await review.save();

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update quarterly review',
      error: error.message
    });
  }
};

/**
 * @desc    Get satisfaction trend over time
 * @route   GET /api/saturn/quarterly/trend
 * @access  Private
 */
exports.getSatisfactionTrend = async (req, res) => {
  try {
    const reviews = await QuarterlyReview.find({ userId: req.user.id })
      .sort({ date: 1 })
      .select('quarter overallSatisfaction lifeAreaScores date');

    if (reviews.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No reviews available for trend analysis'
      });
    }

    // Calculate trend
    const trend = reviews.map(review => ({
      quarter: review.quarter,
      date: review.date,
      satisfaction: review.overallSatisfaction,
      avgLifeScore: review.avgLifeScore
    }));

    // Calculate overall trajectory
    const firstSatisfaction = reviews[0].overallSatisfaction;
    const latestSatisfaction = reviews[reviews.length - 1].overallSatisfaction;
    const trajectory = latestSatisfaction > firstSatisfaction ? 'improving' : 
                       latestSatisfaction < firstSatisfaction ? 'declining' : 'stable';

    res.status(200).json({
      success: true,
      data: {
        trend,
        trajectory,
        improvement: (latestSatisfaction - firstSatisfaction).toFixed(1),
        avgSatisfaction: (trend.reduce((sum, r) => sum + r.satisfaction, 0) / trend.length).toFixed(1)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to calculate satisfaction trend',
      error: error.message
    });
  }
};

/**
 * @desc    Compare two quarters
 * @route   GET /api/saturn/quarterly/compare/:q1/:q2
 * @access  Private
 */
exports.compareQuarters = async (req, res) => {
  try {
    const { q1, q2 } = req.params;

    const review1 = await QuarterlyReview.findOne({
      userId: req.user.id,
      quarter: q1
    });

    const review2 = await QuarterlyReview.findOne({
      userId: req.user.id,
      quarter: q2
    });

    if (!review1 || !review2) {
      return res.status(404).json({
        success: false,
        message: 'One or both quarterly reviews not found'
      });
    }

    // Calculate differences
    const satisfactionDiff = review2.overallSatisfaction - review1.overallSatisfaction;
    
    const lifeAreaDiffs = {};
    Object.keys(review1.lifeAreaScores).forEach(area => {
      lifeAreaDiffs[area] = review2.lifeAreaScores[area] - review1.lifeAreaScores[area];
    });

    const analysis = {
      quarter1: {
        quarter: review1.quarter,
        satisfaction: review1.overallSatisfaction,
        avgLifeScore: review1.avgLifeScore
      },
      quarter2: {
        quarter: review2.quarter,
        satisfaction: review2.overallSatisfaction,
        avgLifeScore: review2.avgLifeScore
      },
      comparison: {
        satisfactionChange: satisfactionDiff,
        satisfactionTrend: satisfactionDiff > 0 ? 'improved' : satisfactionDiff < 0 ? 'declined' : 'unchanged',
        lifeAreaChanges: lifeAreaDiffs,
        biggestImprovement: Object.entries(lifeAreaDiffs).reduce((max, [area, diff]) => 
          diff > max.diff ? { area, diff } : max, { area: null, diff: -Infinity }),
        biggestDecline: Object.entries(lifeAreaDiffs).reduce((min, [area, diff]) => 
          diff < min.diff ? { area, diff } : min, { area: null, diff: Infinity }),
        insights: legacyService.generateComparisonInsights(review1, review2)
      }
    };

    res.status(200).json({
      success: true,
      data: analysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to compare quarters',
      error: error.message
    });
  }
};

module.exports = exports;
