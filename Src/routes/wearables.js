const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const wearableController = require('../controllers/wearableController');

// Get wearable data
router.get('/user/:userId', protect, wearableController.getWearableData);

// Manual entry
router.post('/user/:userId/manual', protect, wearableController.manualEntry);

// Get connections
router.get('/connections', protect, wearableController.getConnections);

// OAuth flow
router.get('/connect/:provider', protect, (req, res) => {
    // Redirect to provider's OAuth page
    const { provider } = req.params;
    const redirectUri = `${process.env.API_URL}/api/wearables/callback/${provider}`;
    
    // Provider-specific OAuth URLs would go here
    res.redirect(`https://oauth.provider.com/authorize?redirect_uri=${redirectUri}`);
});

router.get('/callback/:provider', wearableController.oauthCallback);

// Disconnect
router.delete('/disconnect/:provider', protect, wearableController.disconnect);

// Sync
router.post('/sync/:provider', protect, wearableController.syncNow);

// Insights
router.get('/insights/:userId', protect, wearableController.getInsights);

module.exports = router;