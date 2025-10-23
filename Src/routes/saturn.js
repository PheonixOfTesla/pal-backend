/**
 * 🪐 SATURN ROUTES
 * Legacy Planning, Mortality Awareness, & Quarterly Reviews
 * 
 * Base Path: /api/saturn
 * Total Endpoints: 12
 * Status: ✅ Complete
 */

const express = require('express');
const router = express.Router();
const saturnController = require('../controllers/saturnController');
const { protect } = require('../middleware/auth');

// All Saturn routes require authentication
router.use(protect);

// ========================================
// LEGACY VISION ROUTES (6 endpoints)
// ========================================

/**
 * @route   POST /api/saturn/vision
 * @desc    Create or update legacy vision
 * @access  Private
 */
router.post('/vision', saturnController.createOrUpdateVision);

/**
 * @route   GET /api/saturn/vision
 * @desc    Get user's legacy vision
 * @access  Private
 */
router.get('/vision', saturnController.getVision);

/**
 * @route   PUT /api/saturn/vision/life-areas
 * @desc    Update life area scores
 * @access  Private
 */
router.put('/vision/life-areas', saturnController.updateLifeAreas);

/**
 * @route   POST /api/saturn/vision/legacy-goal
 * @desc    Add a legacy goal
 * @access  Private
 */
router.post('/vision/legacy-goal', saturnController.addLegacyGoal);

/**
 * @route   GET /api/saturn/mortality
 * @desc    Get mortality data (days remaining)
 * @access  Private
 */
router.get('/mortality', saturnController.getMortality);

/**
 * @route   PUT /api/saturn/vision/review
 * @desc    Update last reviewed date
 * @access  Private
 */
router.put('/vision/review', saturnController.updateLastReviewed);

// ========================================
// QUARTERLY REVIEW ROUTES (6 endpoints)
// ========================================

/**
 * @route   POST /api/saturn/quarterly
 * @desc    Create quarterly review
 * @access  Private
 */
router.post('/quarterly', saturnController.createQuarterlyReview);

/**
 * @route   GET /api/saturn/quarterly
 * @desc    Get user's quarterly reviews
 * @access  Private
 */
router.get('/quarterly', saturnController.getQuarterlyReviews);

/**
 * @route   GET /api/saturn/quarterly/latest
 * @desc    Get latest quarterly review
 * @access  Private
 */
router.get('/quarterly/latest', saturnController.getLatestQuarterlyReview);

/**
 * @route   PUT /api/saturn/quarterly/:id
 * @desc    Update quarterly review
 * @access  Private
 */
router.put('/quarterly/:id', saturnController.updateQuarterlyReview);

/**
 * @route   GET /api/saturn/quarterly/trend
 * @desc    Get satisfaction trend over time
 * @access  Private
 */
router.get('/quarterly/trend', saturnController.getSatisfactionTrend);

/**
 * @route   GET /api/saturn/quarterly/compare/:q1/:q2
 * @desc    Compare two quarters
 * @access  Private
 */
router.get('/quarterly/compare/:q1/:q2', saturnController.compareQuarters);

module.exports = router;
