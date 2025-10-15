// Src/models/Budget.js
const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  month: { type: Date, required: true, index: true },
  categories: [{
    name: { type: String, required: true },
    budgeted: { type: Number, required: true, min: 0 },
    spent: { type: Number, default: 0, min: 0 },
    remaining: { type: Number, default: 0 }
  }],
  totalIncome: { type: Number, default: 0 },
  totalExpenses: { type: Number, default: 0 },
  savingsRate: { type: Number, default: 0, min: 0, max: 100 },
  stressSpendingDetected: { type: Boolean, default: false },
  alerts: [{
    category: String,
    message: String,
    severity: { type: String, enum: ['low', 'medium', 'high'] },
    date: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

budgetSchema.index({ userId: 1, month: -1 });

budgetSchema.pre('save', function(next) {
  this.totalExpenses = this.categories.reduce((sum, cat) => sum + cat.spent, 0);
  this.categories.forEach(cat => cat.remaining = cat.budgeted - cat.spent);
  if (this.totalIncome > 0) this.savingsRate = Math.round(((this.totalIncome - this.totalExpenses) / this.totalIncome) * 100);
  next();
});

module.exports = mongoose.model('Budget', budgetSchema);