// Src/models/Subscription.js
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true 
  },
  plan: { 
    type: String, 
    enum: ['free', 'pro', 'elite'], 
    default: 'free' 
  },
  status: { 
    type: String, 
    enum: ['active', 'trialing', 'canceled', 'past_due'], 
    default: 'active' 
  },
  stripeSubscriptionId: String,
  stripeCustomerId: String,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: { 
    type: Boolean, 
    default: false 
  },
  canceledAt: Date,
  trialEndsAt: Date,
  paymentHistory: [{
    amount: Number,
    date: Date,
    status: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);