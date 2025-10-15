// Src/controllers/subscriptionController.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Subscription = require('../models/Subscription');
const User = require('../models/User');

const PLANS = {
  free: { price: 0, features: ['mercury', 'venus'], historyDays: 7, predictions: false },
  pro: { priceId: process.env.STRIPE_PRO_PRICE_ID, price: 4900, features: ['all_planets'], historyDays: 30, predictions: true },
  elite: { priceId: process.env.STRIPE_ELITE_PRICE_ID, price: 9900, features: ['all_planets', 'priority_support'], historyDays: 999, predictions: true }
};

exports.createCheckoutSession = async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.user.id;
    
    if (!PLANS[plan] || plan === 'free') return res.status(400).json({ success: false, message: 'Invalid plan' });
    
    const user = await User.findById(userId);
    let customerId = user.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
      customerId = customer.id;
      await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
    }
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      subscription_data: { trial_period_days: 7, metadata: { userId, plan } }
    });
    
    res.json({ success: true, sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ success: false, message: 'Checkout failed' });
  }
};

exports.handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, plan } = session.metadata;
        
        await Subscription.create({
          userId,
          plan,
          status: 'trialing',
          stripeSubscriptionId: session.subscription,
          stripeCustomerId: session.customer,
          currentPeriodStart: new Date(session.subscription_data?.trial_start || Date.now()),
          currentPeriodEnd: new Date(session.subscription_data?.trial_end || Date.now() + 7 * 86400000),
          trialEndsAt: new Date(Date.now() + 7 * 86400000)
        });
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          { 
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000)
          }
        );
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          { status: 'canceled', canceledAt: new Date() }
        );
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: invoice.subscription },
          { $push: { paymentHistory: { amount: invoice.amount_paid, date: new Date() } } }
        );
        break;
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

exports.getSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = await Subscription.findOne({ userId }).sort('-createdAt').lean();
    
    if (!subscription) return res.json({ success: true, plan: 'free', features: PLANS.free.features });
    
    const planDetails = PLANS[subscription.plan] || PLANS.free;
    
    res.json({ 
      success: true, 
      subscription: {
        ...subscription,
        features: planDetails.features,
        historyDays: planDetails.historyDays,
        predictions: planDetails.predictions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch subscription' });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = await Subscription.findOne({ userId, status: { $ne: 'canceled' } });
    
    if (!subscription) return res.status(404).json({ success: false, message: 'No active subscription' });
    
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
    await Subscription.findByIdAndUpdate(subscription._id, { cancelAtPeriodEnd: true });
    
    res.json({ success: true, message: 'Subscription will cancel at period end' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Cancelation failed' });
  }
};

exports.createPortalSession = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.stripeCustomerId) return res.status(400).json({ success: false, message: 'No subscription found' });
    
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/settings`
    });
    
    res.json({ success: true, url: session.url });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Portal creation failed' });
  }
};