// ========================================
// 💳 TRANSACTION MODEL
// ========================================
// Stores financial transactions from Plaid integration
// Used by Jupiter controller for spending analysis
// ========================================

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Finance',
      required: [true, 'Account ID is required'],
      index: true
    },
    
    // Plaid Integration Fields
    plaidTransactionId: {
      type: String,
      required: [true, 'Plaid transaction ID is required'],
      unique: true,
      index: true
    },
    
    plaidAccountId: {
      type: String,
      required: [true, 'Plaid account ID is required']
    },
    
    // Transaction Details
    name: {
      type: String,
      required: [true, 'Transaction name is required']
    },
    
    merchantName: {
      type: String
    },
    
    amount: {
      type: Number,
      required: [true, 'Transaction amount is required']
    },
    
    isoCurrencyCode: {
      type: String,
      default: 'USD'
    },
    
    // Transaction Type
    transactionType: {
      type: String,
      enum: ['purchase', 'transfer', 'payment', 'refund', 'fee', 'other'],
      default: 'purchase'
    },
    
    // Category Information
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
        'income',
        'transfer',
        'other'
      ],
      default: 'other'
    },
    
    categoryDetailed: {
      type: [String],
      default: []
    },
    
    isManuallyRecategorized: {
      type: Boolean,
      default: false
    },
    
    // Date Information
    date: {
      type: Date,
      required: [true, 'Transaction date is required'],
      index: true
    },
    
    authorizedDate: {
      type: Date
    },
    
    // Transaction Status
    pending: {
      type: Boolean,
      default: false
    },
    
    // Location Information
    location: {
      address: String,
      city: String,
      region: String,
      postalCode: String,
      country: String,
      lat: Number,
      lon: Number
    },
    
    // Payment Details
    paymentChannel: {
      type: String,
      enum: ['online', 'in_store', 'other']
    },
    
    // Merchant Details
    merchantWebsite: {
      type: String
    },
    
    merchantLogo: {
      type: String
    },
    
    // Notes and Tags
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    
    tags: {
      type: [String],
      default: []
    },
    
    // Recurring Transaction Detection
    isRecurring: {
      type: Boolean,
      default: false
    },
    
    recurringFrequency: {
      type: String,
      enum: ['weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly', null],
      default: null
    },
    
    // Split Transaction Support
    isSplit: {
      type: Boolean,
      default: false
    },
    
    splitWith: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      amount: Number,
      settled: {
        type: Boolean,
        default: false
      }
    }],
    
    // Excluded from Analysis
    excludeFromBudget: {
      type: Boolean,
      default: false
    },
    
    excludeFromAnalytics: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound Indexes
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, category: 1, date: -1 });
transactionSchema.index({ userId: 1, merchantName: 1 });
transactionSchema.index({ accountId: 1, date: -1 });

// Virtual Fields
transactionSchema.virtual('isIncome').get(function() {
  return this.amount < 0; // Plaid uses negative amounts for income
});

transactionSchema.virtual('isExpense').get(function() {
  return this.amount > 0;
});

transactionSchema.virtual('absoluteAmount').get(function() {
  return Math.abs(this.amount);
});

transactionSchema.virtual('displayAmount').get(function() {
  return this.isExpense ? this.amount : Math.abs(this.amount);
});

// Instance Methods
transactionSchema.methods.categorize = async function(category) {
  this.category = category;
  this.isManuallyRecategorized = true;
  return this.save();
};

transactionSchema.methods.addNote = async function(note) {
  this.notes = note;
  return this.save();
};

transactionSchema.methods.addTag = async function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return this;
};

transactionSchema.methods.removeTag = async function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

transactionSchema.methods.markAsRecurring = async function(frequency) {
  this.isRecurring = true;
  this.recurringFrequency = frequency;
  return this.save();
};

// Static Methods
transactionSchema.statics.getSpendingByCategory = async function(userId, startDate, endDate) {
  const match = {
    userId: mongoose.Types.ObjectId(userId),
    amount: { $gt: 0 }, // Only spending
    excludeFromAnalytics: false
  };
  
  if (startDate && endDate) {
    match.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        avgTransaction: { $avg: '$amount' }
      }
    },
    { $sort: { total: -1 } }
  ]);
};

transactionSchema.statics.getSpendingTrend = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        date: { $gte: startDate },
        amount: { $gt: 0 },
        excludeFromAnalytics: false
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$date' }
        },
        daily: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

transactionSchema.statics.getRecurringTransactions = async function(userId) {
  return this.find({
    userId,
    isRecurring: true
  }).sort('-amount');
};

transactionSchema.statics.getTotalSpending = async function(userId, startDate, endDate) {
  const match = {
    userId: mongoose.Types.ObjectId(userId),
    amount: { $gt: 0 },
    excludeFromAnalytics: false
  };
  
  if (startDate && endDate) {
    match.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }
  
  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  return result[0] || { total: 0, count: 0 };
};

transactionSchema.statics.getTotalIncome = async function(userId, startDate, endDate) {
  const match = {
    userId: mongoose.Types.ObjectId(userId),
    amount: { $lt: 0 }, // Negative amounts are income in Plaid
    excludeFromAnalytics: false
  };
  
  if (startDate && endDate) {
    match.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }
  
  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: { $abs: '$amount' } },
        count: { $sum: 1 }
      }
    }
  ]);
  
  return result[0] || { total: 0, count: 0 };
};

// Pre-save middleware
transactionSchema.pre('save', async function(next) {
  // Auto-update budget if not excluded
  if (this.isNew && !this.excludeFromBudget && this.amount > 0) {
    const Budget = mongoose.model('Budget');
    const budget = await Budget.findOne({
      userId: this.userId,
      category: this.category,
      isActive: true
    });
    
    if (budget) {
      await budget.addSpending(this.amount);
    }
  }
  
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
