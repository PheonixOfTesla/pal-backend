const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const gymController = require('../controllers/gymController');

// Create gym (owner/admin only)
router.post('/create', protect, checkRole(['owner', 'admin']), gymController.createGym);

// Get gym details
router.get('/:id', protect, gymController.getGymById);

// Update gym (owner/admin only)
router.put('/:id', protect, checkRole(['owner', 'admin']), gymController.updateGym);

// Setup progress
router.get('/:id/progress', protect, gymController.getGymProgress);
router.put('/:id/progress', protect, gymController.updateSetupProgress);

module.exports = router;