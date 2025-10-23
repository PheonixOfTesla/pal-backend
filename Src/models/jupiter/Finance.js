// ========================================
// 💰 FINANCE MODEL (BankAccount)
// ========================================
// Stores connected bank account information from Plaid integration
// Used by Jupiter controller for financial tracking
// ========================================

const mongoose = require('mongoose');

const financeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    
    // Plaid Integration Fields
    plaidAccountId: {
      type: String,
      required: [true, 'Plaid account ID is required'],
      unique: true,
      index: true
    },
    
    plaidAccessToken: {
      type: String,
      required: [true, 'Plaid access token is required']
    },
    
    plaidItemId: {
      type: String,
      required: [true, 'Plaid item ID is required'],
      index: true
    },
    
    // Bank Account Information
    institutionName: {
      type: String,
      required: [true, 'Institution name is required']
    },
    
    institutionId: {
      type: String
    },
    
    accountName: {
      type: String,
      required: [true, 'Account name is required']
    },
    
    officialName: {
      type: String
    },
    
    accountType: {
      type: String,
      enum: ['checking', 'savings', 'credit', 'investment', 'loan', 'other'],
      required: [true, 'Account type is required']
    },
    
    accountSubtype: {
      type: String
    },
    
    // Balance Information
    currentBalance: {
      type: Number,
      default: 0
    },
    
    availableBalance: {
      type: Number,
      default: 0
    },
    
    creditLimit: {
      type: Number,
      default: null
    },
    
    // Account Status
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    
    lastSynced: {
      type: Date,
      default: Date.now
    },
    
    // Account Identification
    mask: {
      type: String // Last 4 digits
    },
    
    // Currency
    isoCurrencyCode: {
      type: String,
      default: 'USD'
    },
    
    // Error Tracking
    lastError: {
      type: String
    },
    
    errorCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Compound Indexes
financeSchema.index({ userId: 1, isActive: 1 });
financeSchema.index({ userId: 1, accountType: 1 });

// Instance Methods
financeSchema.methods.updateBalance = async function(balances) {
  this.currentBalance = balances.current || this.currentBalance;
  this.availableBalance = balances.available || this.availableBalance;
  this.creditLimit = balances.limit || this.creditLimit;
  this.lastSynced = new Date();
  return this.save();
};

financeSchema.methods.recordError = async function(error) {
  this.lastError = error;
  this.errorCount += 1;
  
  // Deactivate after 5 consecutive errors
  if (this.errorCount >= 5) {
    this.isActive = false;
  }
  
  return this.save();
};

financeSchema.methods.clearErrors = async function() {
  this.lastError = null;
  this.errorCount = 0;
  this.isActive = true;
  return this.save();
};

// Static Methods
financeSchema.statics.findActiveAccounts = function(userId) {
  return this.find({ userId, isActive: true }).sort('-lastSynced');
};

financeSchema.statics.getTotalBalance = async function(userId) {
  const accounts = await this.find({ userId, isActive: true });
  
  const totals = accounts.reduce(
    (acc, account) => {
      if (account.accountType === 'credit') {
        acc.credit += account.currentBalance;
      } else {
        acc.assets += account.currentBalance;
      }
      return acc;
    },
    { assets: 0, credit: 0 }
  );
  
  totals.netWorth = totals.assets - totals.credit;
  return totals;
};

// Pre-save middleware
financeSchema.pre('save', function(next) {
  // Ensure positive balances for asset accounts
  if (this.accountType !== 'credit' && this.currentBalance < 0) {
    this.currentBalance = 0;
  }
  next();
});

module.exports = mongoose.model('Finance', financeSchema);
