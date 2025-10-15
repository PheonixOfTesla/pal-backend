// Src/models/BankAccount.js
const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plaidAccountId: { type: String, required: true, unique: true },
  plaidAccessToken: { type: String, required: true },
  plaidItemId: { type: String, required: true },
  institutionName: { type: String, required: true },
  accountType: { type: String, enum: ['checking', 'savings', 'credit', 'investment'], required: true },
  accountSubtype: String,
  currentBalance: { type: Number, default: 0 },
  availableBalance: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  lastSynced: { type: Date, default: Date.now },
  mask: String
}, { timestamps: true });

bankAccountSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('BankAccount', bankAccountSchema);