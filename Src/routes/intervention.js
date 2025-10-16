const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const interventionController = require('../controllers/interventionController');

// Analyze and trigger interventions for a user
router.post('/:userId/analyze', protect, interventionController.analyzeAndIntervene);

// Get intervention history
router.get('/:userId/history', protect, interventionController.getInterventionHistory);

// Simulate intervention (dry-run mode)
router.post('/:userId/simulate', protect, interventionController.simulateIntervention);

module.exports = router;