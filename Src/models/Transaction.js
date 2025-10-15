// Src/models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true },
  plaidTransactionId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true, index: true },
  description: { type: String, required: true },
  category: { type: String, required: true, index: true },
  isRecurring: { type: Boolean, default: false },
  merchantName: String,
  pending: { type: Boolean, default: false },
  correlatedStress: Number,
  correlatedHRV: Number,
  isImpulsePurchase: { type: Boolean, default: false },
  lastSynced: { type: Date, default: Date.now }
}, { timestamps: true });

transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, category: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);