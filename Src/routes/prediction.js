const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const predictionController = require('../controllers/predictionController');

// Predict HRV trends
router.get('/:userId/hrv', protect, predictionController.predictHRV);

// Predict illness risk
router.get('/:userId/illness', protect, predictionController.predictIllness);

// Predict goal completion
router.get('/goal/:goalId/completion', protect, predictionController.predictGoalCompletion);

// Predict energy levels
router.get('/:userId/energy', protect, predictionController.predictEnergy);

module.exports = router;