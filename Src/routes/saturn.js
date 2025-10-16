const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const saturnController = require('../controllers/saturnController');

// Legacy Vision Management
router.post('/:userId/vision', protect, saturnController.createOrUpdateVision);
router.get('/:userId/vision', protect, saturnController.getVision);
router.put('/vision/:visionId', protect, saturnController.updateVisionField);

// Life Timeline
router.get('/:userId/timeline', protect, saturnController.getTimeline);

// Quarterly Reviews
router.post('/:userId/review', protect, saturnController.createQuarterlyReview);
router.get('/:userId/reviews', protect, saturnController.getQuarterlyReviews);

// Trajectory & Analysis
router.get('/:userId/trajectory', protect, saturnController.calculateTrajectory);
router.get('/:userId/alignment', protect, saturnController.checkAlignment);
router.get('/:userId/life-wheel', protect, saturnController.getLifeWheel);
router.get('/:userId/mortality', protect, saturnController.getMortalityData);

module.exports = router;