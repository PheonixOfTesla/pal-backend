const express = require('express');
const router = express.Router();
const earthController = require('../controllers/earthController');
const { protect } = require('../middleware/auth');

// Calendar Integration (7 endpoints)
router.get('/calendar/connect/:provider', protect, earthController.connectCalendar);
router.post('/calendar/callback', protect, earthController.handleCalendarCallback);
router.get('/calendar/events', protect, earthController.getCalendarEvents);
router.post('/calendar/events', protect, earthController.createCalendarEvent);
router.get('/calendar/energy-map', protect, earthController.getEnergyOptimizedSchedule);
router.get('/calendar/conflicts', protect, earthController.detectConflicts);
router.post('/calendar/sync', protect, earthController.syncCalendar);

// Energy Tracking (4 endpoints)
router.get('/energy/pattern', protect, earthController.getEnergyPattern);
router.post('/energy/log', protect, earthController.logEnergyLevel);
router.get('/energy/optimal-times', protect, earthController.getOptimalMeetingTimes);
router.get('/energy/prediction', protect, earthController.predictEnergy);

module.exports = router;
