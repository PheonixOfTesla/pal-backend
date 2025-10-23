// ============================================
// PHOENIX ROUTES - AI Butler & Intelligence System
// ============================================
// Total Endpoints: 76
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

/**
 * @route   POST /api/phoenix/companion/chat
 * @desc    Chat with Phoenix AI companion
 * @access  Private
 */
router.post('/companion/chat', phoenixController.chat);

/**
 * @route   GET /api/phoenix/companion/history
 * @desc    Get conversation history
 * @access  Private
 */
router.get('/companion/history', phoenixController.getHistory);

/**
 * @route   DELETE /api/phoenix/companion/history
 * @desc    Clear conversation history
 * @access  Private
 */
router.delete('/companion/history', phoenixController.clearHistory);

/**
 * @route   GET /api/phoenix/companion/context
 * @desc    Get current user context
 * @access  Private
 */
router.get('/companion/context', phoenixController.getContext);

/**
 * @route   GET /api/phoenix/companion/personality
 * @desc    Get companion personality settings
 * @access  Private
 */
router.get('/companion/personality', phoenixController.getPersonality);

/**
 * @route   PUT /api/phoenix/companion/personality
 * @desc    Update companion personality settings
 * @access  Private
 */
router.put('/companion/personality', phoenixController.updatePersonality);

// ========================================
// B. CORRELATION ENGINE (6 endpoints)
// ========================================

/**
 * @route   GET /api/phoenix/patterns
 * @desc    Get all discovered correlation patterns
 * @access  Private
 */
router.get('/patterns', phoenixController.getPatterns);

/**
 * @route   POST /api/phoenix/patterns/analyze
 * @desc    Trigger pattern analysis
 * @access  Private
 */
router.post('/patterns/analyze', phoenixController.analyzePatterns);

/**
 * @route   GET /api/phoenix/patterns/realtime
 * @desc    Get real-time pattern monitoring
 * @access  Private
 */
router.get('/patterns/realtime', phoenixController.getRealtimePatterns);

/**
 * @route   PUT /api/phoenix/patterns/:id/validate
 * @desc    Validate a pattern
 * @access  Private
 */
router.put('/patterns/:id/validate', phoenixController.validatePattern);

/**
 * @route   DELETE /api/phoenix/patterns/:id
 * @desc    Delete a pattern
 * @access  Private
 */
router.delete('/patterns/:id', phoenixController.deletePattern);

/**
 * @route   GET /api/phoenix/insights
 * @desc    Get AI-generated insights
 * @access  Private
 */
router.get('/insights', phoenixController.getInsights);

// ========================================
// C. PREDICTION ENGINE (10 endpoints)
// ========================================

/**
 * @route   GET /api/phoenix/predictions
 * @desc    Get all predictions
 * @access  Private
 */
router.get('/predictions', phoenixController.getPredictions);

/**
 * @route   GET /api/phoenix/predictions/active
 * @desc    Get active predictions
 * @access  Private
 */
router.get('/predictions/active', phoenixController.getActivePredictions);

/**
 * @route   GET /api/phoenix/predictions/:id
 * @desc    Get prediction by ID
 * @access  Private
 */
router.get('/predictions/:id', phoenixController.getPredictionById);

/**
 * @route   POST /api/phoenix/predictions/request/:type
 * @desc    Request a specific prediction
 * @access  Private
 */
router.post('/predictions/request/:type', phoenixController.requestPrediction);

/**
 * @route   PUT /api/phoenix/predictions/:id/outcome
 * @desc    Record prediction outcome
 * @access  Private
 */
router.put('/predictions/:id/outcome', phoenixController.recordOutcome);

/**
 * @route   GET /api/phoenix/predictions/accuracy
 * @desc    Get prediction accuracy stats
 * @access  Private
 */
router.get('/predictions/accuracy', phoenixController.getPredictionAccuracy);

/**
 * @route   GET /api/phoenix/predictions/forecast
 * @desc    Get forecast for next 7-30 days
 * @access  Private
 */
router.get('/predictions/forecast', phoenixController.getForecast);

/**
 * @route   GET /api/phoenix/predictions/optimal-window
 * @desc    Get optimal performance window
 * @access  Private
 */
router.get('/predictions/optimal-window', phoenixController.getOptimalWindow);

/**
 * @route   GET /api/phoenix/predictions/burnout-risk
 * @desc    Get burnout risk assessment
 * @access  Private
 */
router.get('/predictions/burnout-risk', phoenixController.getBurnoutRisk);

/**
 * @route   GET /api/phoenix/predictions/weight-change
 * @desc    Get weight change prediction
 * @access  Private
 */
router.get('/predictions/weight-change', phoenixController.getWeightPrediction);

// ========================================
// D. INTERVENTION ENGINE (9 endpoints)
// ========================================

/**
 * @route   GET /api/phoenix/interventions
 * @desc    Get all interventions
 * @access  Private
 */
router.get('/interventions', phoenixController.getInterventions);

/**
 * @route   GET /api/phoenix/interventions/active
 * @desc    Get active interventions
 * @access  Private
 */
router.get('/interventions/active', phoenixController.getActiveInterventions);

/**
 * @route   GET /api/phoenix/interventions/pending
 * @desc    Get pending interventions
 * @access  Private
 */
router.get('/interventions/pending', phoenixController.getPendingInterventions);

/**
 * @route   POST /api/phoenix/interventions/:id/acknowledge
 * @desc    Acknowledge intervention
 * @access  Private
 */
router.post('/interventions/:id/acknowledge', phoenixController.acknowledgeIntervention);

/**
 * @route   PUT /api/phoenix/interventions/:id/outcome
 * @desc    Record intervention outcome
 * @access  Private
 */
router.put('/interventions/:id/outcome', phoenixController.recordInterventionOutcome);

/**
 * @route   GET /api/phoenix/interventions/stats
 * @desc    Get intervention statistics
 * @access  Private
 */
router.get('/interventions/stats', phoenixController.getInterventionStats);

/**
 * @route   GET /api/phoenix/interventions/history
 * @desc    Get intervention history
 * @access  Private
 */
router.get('/interventions/history', phoenixController.getInterventionHistory);

/**
 * @route   POST /api/phoenix/interventions/settings
 * @desc    Configure intervention settings
 * @access  Private
 */
router.post('/interventions/settings', phoenixController.configureInterventionSettings);

/**
 * @route   POST /api/phoenix/interventions/request
 * @desc    Request manual intervention
 * @access  Private
 */
router.post('/interventions/request', phoenixController.requestManualIntervention);

// ========================================
// E. INTELLIGENCE ENGINE (8 endpoints)
// ========================================

/**
 * @route   GET /api/phoenix/intelligence
 * @desc    Get intelligence dashboard
 * @access  Private
 */
router.get('/intelligence', phoenixController.getIntelligence);

/**
 * @route   POST /api/phoenix/intelligence/analyze
 * @desc    Trigger comprehensive analysis
 * @access  Private
 */
router.post('/intelligence/analyze', phoenixController.triggerAnalysis);

/**
 * @route   GET /api/phoenix/intelligence/insights
 * @desc    Get AI insights
 * @access  Private
 */
router.get('/intelligence/insights', phoenixController.getAIInsights);

/**
 * @route   POST /api/phoenix/intelligence/query
 * @desc    Natural language query
 * @access  Private
 */
router.post('/intelligence/query', phoenixController.naturalLanguageQuery);

/**
 * @route   GET /api/phoenix/intelligence/summary
 * @desc    Get daily summary
 * @access  Private
 */
router.get('/intelligence/summary', phoenixController.getDailySummary);

/**
 * @route   POST /api/phoenix/intelligence/deep-dive
 * @desc    Get deep dive analysis
 * @access  Private
 */
router.post('/intelligence/deep-dive', phoenixController.getDeepDive);

/**
 * @route   GET /api/phoenix/intelligence/recommendations
 * @desc    Get personalized recommendations
 * @access  Private
 */
router.get('/intelligence/recommendations', phoenixController.getRecommendations);

/**
 * @route   POST /api/phoenix/intelligence/auto-optimize
 * @desc    Auto-optimize user settings
 * @access  Private
 */
router.post('/intelligence/auto-optimize', phoenixController.autoOptimize);

// ========================================
// F. VOICE AI (4 endpoints)
// ========================================

/**
 * @route   POST /api/phoenix/voice/session
 * @desc    Create voice session
 * @access  Private
 */
router.post('/voice/session', phoenixController.createVoiceSession);

/**
 * @route   DELETE /api/phoenix/voice/session
 * @desc    End voice session
 * @access  Private
 */
router.delete('/voice/session', phoenixController.endVoiceSession);

/**
 * @route   GET /api/phoenix/voice/transcriptions
 * @desc    Get transcriptions
 * @access  Private
 */
router.get('/voice/transcriptions', phoenixController.getTranscriptions);

/**
 * @route   GET /api/phoenix/voice/history
 * @desc    Get voice history
 * @access  Private
 */
router.get('/voice/history', phoenixController.getVoiceHistory);

// ========================================
// G. ML & LEARNING (7 endpoints)
// ========================================

/**
 * @route   POST /api/phoenix/ml/train
 * @desc    Train ML model
 * @access  Private
 */
router.post('/ml/train', phoenixController.trainModel);

/**
 * @route   GET /api/phoenix/ml/models
 * @desc    Get user's ML models
 * @access  Private
 */
router.get('/ml/models', phoenixController.getModels);

/**
 * @route   GET /api/phoenix/ml/training-status
 * @desc    Get training status
 * @access  Private
 */
router.get('/ml/training-status', phoenixController.getTrainingStatus);

/**
 * @route   POST /api/phoenix/behavior/track
 * @desc    Track behavior
 * @access  Private
 */
router.post('/behavior/track', phoenixController.trackBehavior);

/**
 * @route   GET /api/phoenix/behavior/patterns
 * @desc    Get behavior patterns
 * @access  Private
 */
router.get('/behavior/patterns', phoenixController.getBehaviorPatterns);

/**
 * @route   GET /api/phoenix/behavior/insights
 * @desc    Get behavior insights
 * @access  Private
 */
router.get('/behavior/insights', phoenixController.getBehaviorInsights);

/**
 * @route   GET /api/phoenix/behavior/:type
 * @desc    Get behavior by type
 * @access  Private
 */
router.get('/behavior/:type', phoenixController.getBehaviorByType);

// ========================================
// H. BUTLER ACTIONS (26 endpoints)
// ========================================

// --------- Reservations (2) ---------

/**
 * @route   POST /api/phoenix/butler/reservation
 * @desc    Make restaurant reservation
 * @access  Private
 */
router.post('/butler/reservation', phoenixController.makeReservation);

/**
 * @route   GET /api/phoenix/butler/reservations
 * @desc    Get reservations
 * @access  Private
 */
router.get('/butler/reservations', phoenixController.getReservations);

// --------- Food Ordering (3) ---------

/**
 * @route   POST /api/phoenix/butler/food
 * @desc    Order food
 * @access  Private
 */
router.post('/butler/food', phoenixController.orderFood);

/**
 * @route   GET /api/phoenix/butler/food/history
 * @desc    Get food order history
 * @access  Private
 */
router.get('/butler/food/history', phoenixController.getFoodHistory);

/**
 * @route   POST /api/phoenix/butler/food/reorder
 * @desc    Reorder previous food order
 * @access  Private
 */
router.post('/butler/food/reorder', phoenixController.reorderFood);

// --------- Rides (2) ---------

/**
 * @route   POST /api/phoenix/butler/ride
 * @desc    Book ride
 * @access  Private
 */
router.post('/butler/ride', phoenixController.bookRide);

/**
 * @route   GET /api/phoenix/butler/rides
 * @desc    Get ride history
 * @access  Private
 */
router.get('/butler/rides', phoenixController.getRideHistory);

// --------- Phone Calls (2) ---------

/**
 * @route   POST /api/phoenix/butler/call
 * @desc    Make phone call
 * @access  Private
 */
router.post('/butler/call', phoenixController.makePhoneCall);

/**
 * @route   GET /api/phoenix/butler/calls
 * @desc    Get call history
 * @access  Private
 */
router.get('/butler/calls', phoenixController.getCallHistory);

// --------- Email (3) ---------

/**
 * @route   POST /api/phoenix/butler/email
 * @desc    Send email
 * @access  Private
 */
router.post('/butler/email', phoenixController.sendEmail);

/**
 * @route   GET /api/phoenix/butler/emails
 * @desc    Get email history
 * @access  Private
 */
router.get('/butler/emails', phoenixController.getEmailHistory);

/**
 * @route   POST /api/phoenix/butler/email/reply
 * @desc    Reply to email
 * @access  Private
 */
router.post('/butler/email/reply', phoenixController.replyToEmail);

// --------- Calendar (2) ---------

/**
 * @route   POST /api/phoenix/butler/calendar
 * @desc    Manage calendar event
 * @access  Private
 */
router.post('/butler/calendar', phoenixController.manageCalendar);

/**
 * @route   POST /api/phoenix/butler/calendar/optimize
 * @desc    Optimize calendar
 * @access  Private
 */
router.post('/butler/calendar/optimize', phoenixController.optimizeCalendar);

// --------- Web Automation (2) ---------

/**
 * @route   POST /api/phoenix/butler/search
 * @desc    Search web
 * @access  Private
 */
router.post('/butler/search', phoenixController.searchWeb);

/**
 * @route   POST /api/phoenix/butler/web-task
 * @desc    Perform web task
 * @access  Private
 */
router.post('/butler/web-task', phoenixController.performWebTask);

// --------- Summarization (2) ---------

/**
 * @route   POST /api/phoenix/butler/summarize
 * @desc    Summarize content
 * @access  Private
 */
router.post('/butler/summarize', phoenixController.summarizeContent);

/**
 * @route   POST /api/phoenix/butler/summarize/batch
 * @desc    Batch summarize multiple items
 * @access  Private
 */
router.post('/butler/summarize/batch', phoenixController.batchSummarize);

// --------- Task Automation (3) ---------

/**
 * @route   POST /api/phoenix/butler/automate
 * @desc    Create automation
 * @access  Private
 */
router.post('/butler/automate', phoenixController.createAutomation);

/**
 * @route   GET /api/phoenix/butler/automations
 * @desc    Get automations
 * @access  Private
 */
router.get('/butler/automations', phoenixController.getAutomations);

/**
 * @route   DELETE /api/phoenix/butler/automations/:id
 * @desc    Delete automation
 * @access  Private
 */
router.delete('/butler/automations/:id', phoenixController.deleteAutomation);

// ========================================
// Export router
// ========================================

module.exports = router;
