// ========================================
// 💰 BUDGET MODEL
// ========================================
// Category-based budget tracking and overspending alerts
// Used by Jupiter controller for financial management
// ========================================

const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    
    // Budget Details
    category: {
      type: String,
      enum: [
        'food',
        'transportation',
        'entertainment',
        'shopping',
        'bills',
        'health',
        'travel',
        'education',
        'personal',
        'business',
        'other'
      ],
      required: [true, 'Category is required']
    },
    
    amount: {
      type: Number,
      required: [true, 'Budget amount is required'],
      min: [0, 'Budget amount cannot be negative']
    },
    
    // Legacy field for backward compatibility
    monthlyLimit: {
      type: Number
    },
    
    spent: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // Period Configuration
    period: {
      type: String,
      enum: ['weekly', 'monthly', 'yearly'],
      default: 'monthly'
    },
    
    startDate: {
      type: Date,
      default: Date.now
    },
    
    endDate: {
      type: Date
    },
    
    // Alert Settings
    alertThreshold: {
      type: Number,
      default: 90, // Alert at 90% of budget
      min: 0,
      max: 100
    },
    
    alertEnabled: {
      type: Boolean,
      default: true
    },
    
    // Budget Behavior
    rollover: {
      type: Boolean,
      default: false // Unused budget carries over
    },
    
    autoReset: {
      type: Boolean,
      default: true // Auto-reset each period
    },
    
    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    
    lastReset: {
      type: Date,
      default: Date.now
    },
    
    // Notes
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters']
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound Indexes
budgetSchema.index({ userId: 1, category: 1 });
budgetSchema.index({ userId: 1, isActive: 1 });

// Virtual Fields
budgetSchema.virtual('remaining').get(function() {
  return Math.max(0, this.amount - this.spent);
});

budgetSchema.virtual('percentUsed').get(function() {
  if (this.amount === 0) return 0;
  return Math.min(100, (this.spent / this.amount) * 100);
});

budgetSchema.virtual('isOverBudget').get(function() {
  return this.spent > this.amount;
});

budgetSchema.virtual('shouldAlert').get(function() {
  return this.alertEnabled && this.percentUsed >= this.alertThreshold;
});

budgetSchema.virtual('status').get(function() {
  const percentUsed = this.percentUsed;
  
  if (percentUsed >= 100) return 'exceeded';
  if (percentUsed >= this.alertThreshold) return 'warning';
  if (percentUsed >= 70) return 'caution';
  return 'on_track';
});

// Instance Methods
budgetSchema.methods.addSpending = async function(amount) {
  this.spent += amount;
  return this.save();
};

budgetSchema.methods.resetBudget = async function() {
  if (this.rollover) {
    // Carry over unused budget
    const remaining = this.remaining;
    this.amount += remaining;
  }
  
  this.spent = 0;
  this.lastReset = new Date();
  return this.save();
};

budgetSchema.methods.shouldAutoReset = function() {
  if (!this.autoReset || !this.lastReset) return false;
  
  const now = new Date();
  const lastReset = new Date(this.lastReset);
  
  if (this.period === 'weekly') {
    const daysSinceReset = (now - lastReset) / (1000 * 60 * 60 * 24);
    return daysSinceReset >= 7;
  }
  
  if (this.period === 'monthly') {
    return (
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    );
  }
  
  if (this.period === 'yearly') {
    return now.getFullYear() !== lastReset.getFullYear();
  }
  
  return false;
};

// Static Methods
budgetSchema.statics.findActiveBudgets = function(userId) {
  return this.find({ userId, isActive: true }).sort('category');
};

budgetSchema.statics.getBudgetAlerts = async function(userId) {
  const budgets = await this.find({ userId, isActive: true });
  
  return budgets.filter(budget => budget.shouldAlert).map(budget => ({
    budgetId: budget._id,
    category: budget.category,
    amount: budget.amount,
    spent: budget.spent,
    remaining: budget.remaining,
    percentUsed: budget.percentUsed,
    status: budget.status
  }));
};

budgetSchema.statics.getTotalBudgeted = async function(userId) {
  const budgets = await this.find({ userId, isActive: true });
  return budgets.reduce((total, budget) => total + budget.amount, 0);
};

budgetSchema.statics.getTotalSpent = async function(userId) {
  const budgets = await this.find({ userId, isActive: true });
  return budgets.reduce((total, budget) => total + budget.spent, 0);
};

// Pre-save middleware
budgetSchema.pre('save', function(next) {
  // Backward compatibility: sync monthlyLimit with amount
  if (this.isModified('amount')) {
    this.monthlyLimit = this.amount;
  }
  
  // Calculate end date based on period
  if (this.isModified('startDate') || this.isModified('period')) {
    const start = new Date(this.startDate);
    
    if (this.period === 'weekly') {
      this.endDate = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (this.period === 'monthly') {
      this.endDate = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());
    } else if (this.period === 'yearly') {
      this.endDate = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    }
  }
  
  next();
});

// Post-find middleware - auto-reset budgets if needed
budgetSchema.post('find', async function(docs) {
  const resetPromises = docs
    .filter(doc => doc.shouldAutoReset())
    .map(doc => doc.resetBudget());
  
  if (resetPromises.length > 0) {
    await Promise.all(resetPromises);
  }
});

module.exports = mongoose.model('Budget', budgetSchema);
