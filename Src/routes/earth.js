// Src/routes/earth.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const earthController = require('../controllers/earthController');

// Calendar Integration
router.post('/:userId/calendar/connect/google', protect, earthController.connectGoogleCalendar);
router.get('/calendar/callback/google', earthController.googleCalendarCallback);
router.post('/:userId/calendar/sync', protect, earthController.syncCalendarEvents);
router.get('/:userId/calendar/events', protect, earthController.getCalendarEvents);

// Schedule Optimization
router.get('/:userId/schedule/optimize', protect, earthController.optimizeSchedule);
router.get('/:userId/energy/patterns', protect, earthController.analyzeEnergyPatterns);

module.exports = router;