// ============================================
// PHOENIX ROUTES - AI Butler & Intelligence System
// ============================================
// Total Endpoints: 81 (76 original + 5 new SMS/Budget)
// Base Path: /api/phoenix
// Authentication: All routes require JWT auth (protect middleware)
// ============================================

const express = require('express');
const router = express.Router();
const phoenixController = require('../controllers/phoenixController');
const { protect } = require('../middleware/auth');

// Apply authentication to all Phoenix routes
router.use(protect);

// ========================================
// A. AI COMPANION (6 endpoints)
// ========================================

router.post('/companion/chat', phoenixController.chat);
router.get('/companion/history', phoenixController.getHistory);
router.delete('/companion/history', phoenixController.clearHistory);
router.get('/companion/context', phoenixController.getContext);
router.get('/companion/personality', phoenixController.getPersonality);
router.put('/companion/personality', phoenixController.updatePersonality);

// ========================================
// B. CORRELATION ENGINE (6 endpoints)
// ========================================

router.get('/patterns', phoenixController.getPatterns);
router.post('/patterns/analyze', phoenixController.analyzePatterns);
router.get('/patterns/realtime', phoenixController.getRealtimePatterns);
router.put('/patterns/:id/validate', phoenixController.validatePattern);
router.delete('/patterns/:id', phoenixController.deletePattern);
router.get('/insights', phoenixController.getInsights);

// ========================================
// C. PREDICTION ENGINE (10 endpoints)
// ========================================

router.get('/predictions', phoenixController.getPredictions);
router.get('/predictions/active', phoenixController.getActivePredictions);
router.get('/predictions/:id', phoenixController.getPredictionById);
router.post('/predictions/request/:type', phoenixController.requestPrediction);
router.put('/predictions/:id/outcome', phoenixController.recordOutcome);
router.get('/predictions/accuracy', phoenixController.getPredictionAccuracy);
router.get('/predictions/forecast', phoenixController.getForecast);
router.get('/predictions/optimal-window', phoenixController.getOptimalWindow);
router.get('/predictions/burnout-risk', phoenixController.getBurnoutRisk);
router.get('/predictions/weight-change', phoenixController.getWeightPrediction);

// ========================================
// D. INTERVENTION ENGINE (9 endpoints)
// ========================================

router.get('/interventions', phoenixController.getInterventions);
router.get('/interventions/active', phoenixController.getActiveInterventions);
router.get('/interventions/pending', phoenixController.getPendingInterventions);
router.post('/interventions/:id/acknowledge', phoenixController.acknowledgeIntervention);
router.put('/interventions/:id/outcome', phoenixController.recordInterventionOutcome);
router.get('/interventions/stats', phoenixController.getInterventionStats);
router.get('/interventions/history', phoenixController.getInterventionHistory);
router.post('/interventions/settings', phoenixController.configureInterventionSettings);
router.post('/interventions/request', phoenixController.requestManualIntervention);

// ========================================
// E. INTELLIGENCE ENGINE (8 endpoints)
// ========================================

router.get('/intelligence', phoenixController.getIntelligence);
router.post('/intelligence/analyze', phoenixController.triggerAnalysis);
router.get('/intelligence/insights', phoenixController.getAIInsights);
router.post('/intelligence/query', phoenixController.naturalLanguageQuery);
router.get('/intelligence/summary', phoenixController.getDailySummary);
router.post('/intelligence/deep-dive', phoenixController.getDeepDive);
router.get('/intelligence/recommendations', phoenixController.getRecommendations);
router.post('/intelligence/auto-optimize', phoenixController.autoOptimize);

// ========================================
// F. VOICE AI (4 endpoints)
// ========================================

router.post('/voice/session', phoenixController.createVoiceSession);
router.delete('/voice/session', phoenixController.endVoiceSession);
router.get('/voice/transcriptions', phoenixController.getTranscriptions);
router.get('/voice/history', phoenixController.getVoiceHistory);

// ========================================
// G. ML & LEARNING (7 endpoints)
// ========================================

router.post('/ml/train', phoenixController.trainModel);
router.get('/ml/models', phoenixController.getModels);
router.get('/ml/training-status', phoenixController.getTrainingStatus);
router.post('/behavior/track', phoenixController.trackBehavior);
router.get('/behavior/patterns', phoenixController.getBehaviorPatterns);
router.get('/behavior/insights', phoenixController.getBehaviorInsights);
router.get('/behavior/:type', phoenixController.getBehaviorByType);

// ========================================
// H. BUTLER ACTIONS (31 endpoints - 26 original + 5 new)
// ========================================

// --------- Reservations (2) ---------
router.post('/butler/reservation', phoenixController.makeReservation);
router.get('/butler/reservations', phoenixController.getReservations);

// --------- Food Ordering (3) ---------
router.post('/butler/food', phoenixController.orderFood);
router.get('/butler/food/history', phoenixController.getFoodHistory);
router.post('/butler/food/reorder', phoenixController.reorderFood);

// --------- Rides (2) ---------
router.post('/butler/ride', phoenixController.bookRide);
router.get('/butler/rides', phoenixController.getRideHistory);

// --------- Phone Calls (2) ---------
router.post('/butler/call', phoenixController.makePhoneCall);
router.get('/butler/calls', phoenixController.getCallHistory);

// --------- SMS/Text Messages (2 NEW) ---------
router.post('/butler/sms', phoenixController.sendSMS);
router.get('/butler/sms', phoenixController.getSMSHistory);

// --------- Email (3) ---------
router.post('/butler/email', phoenixController.sendEmail);
router.get('/butler/emails', phoenixController.getEmailHistory);
router.post('/butler/email/reply', phoenixController.replyToEmail);

// --------- Calendar (2) ---------
router.post('/butler/calendar', phoenixController.manageCalendar);
router.post('/butler/calendar/optimize', phoenixController.optimizeCalendar);

// --------- Web Automation (2) ---------
router.post('/butler/search', phoenixController.searchWeb);
router.post('/butler/web-task', phoenixController.performWebTask);

// --------- Summarization (2) ---------
router.post('/butler/summarize', phoenixController.summarizeContent);
router.post('/butler/summarize/batch', phoenixController.batchSummarize);

// --------- Task Automation (3) ---------
router.post('/butler/automate', phoenixController.createAutomation);
router.get('/butler/automations', phoenixController.getAutomations);
router.delete('/butler/automations/:id', phoenixController.deleteAutomation);

// --------- Budget Management (3 NEW) ---------
router.get('/butler/budget', phoenixController.manageBudget);
router.put('/butler/budget', phoenixController.manageBudget);

// ========================================
// Export router
// ========================================

module.exports = router;
