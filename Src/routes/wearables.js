const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const wearableController = require('../controllers/wearableController');

// ============================================
// WEARABLE DATA ROUTES
// ============================================

// Get wearable data for a user
router.get('/user/:userId', protect, wearableController.getWearableData);

// Get user insights (averages, trends)
router.get('/insights/:userId', protect, wearableController.getInsights);

// Manual entry for users without wearables
router.post('/user/:userId/manual', protect, wearableController.manualEntry);

// ============================================
// CONNECTION MANAGEMENT
// ============================================

// Get all wearable connections for current user
router.get('/connections', protect, wearableController.getConnections);

// Disconnect a wearable
router.delete('/disconnect/:provider', protect, wearableController.disconnect);

// ============================================
// OAUTH 2.0 FLOW (Fitbit, Polar, Oura, Whoop)
// ============================================

// Step 1: Initiate OAuth connection (returns authUrl for frontend to redirect)
router.post('/connect/:provider', wearableController.initiateOAuth2);
// Step 2: Exchange authorization code for access token (NEW - Frontend sends code here)
router.post('/:provider/exchange', protect, wearableController.exchangeCodeForToken);

// ============================================
// OAUTH 1.0a FLOW (Garmin) - Coming Soon
// ============================================

// Initiate Garmin OAuth (OAuth 1.0a)
router.post('/connect/garmin', protect, wearableController.initiateGarminOAuth);

// ============================================
// DATA SYNCING
// ============================================

// Manually trigger sync for a provider
router.post('/sync/:provider', protect, wearableController.syncWearableData);

module.exports = router;
