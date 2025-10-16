const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const companionController = require('../controllers/phoenixCompanionController');

// Chat with Phoenix AI companion
router.post('/chat', protect, companionController.chat);

// Get conversation history
router.get('/history', protect, companionController.getHistory);

// Proactive health check from companion
router.get('/check/:userId', protect, companionController.proactiveCheck);

module.exports = router;