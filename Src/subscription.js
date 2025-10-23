// Src/routes/subscription.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');

// Checkout
router.post('/checkout', protect, subscriptionController.createCheckoutSession);

// Webhooks (no auth - Stripe will authenticate)
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.handleWebhook);

// Subscription Management
router.get('/status', protect, subscriptionController.getSubscription);
router.post('/cancel', protect, subscriptionController.cancelSubscription);
router.post('/portal', protect, subscriptionController.createPortalSession);

module.exports = router;