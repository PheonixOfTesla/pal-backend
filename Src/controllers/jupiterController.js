// Src/controllers/jupiterController.js
const BankAccount = require('../models/BankAccount');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const WearableData = require('../models/WearableData');
const User = require('../models/User');
const axios = require('axios');

// ============================================
// PLAID INTEGRATION
// ============================================

/**
 * Create Plaid Link token
 */
exports.createLinkToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    const response = await axios.post('https://sandbox.plaid.com/link/token/create', {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      user: {
        client_user_id: userId
      },
      client_name: 'Phoenix of Tesla',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en'
    });
    
    res.json({
      success: true,
      linkToken: response.data.link_token
    });
  } catch (error) {
    console.error('Create link token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create link token'
    });
  }
};

/**
 * Exchange public token for access token
 */
exports.exchangePublicToken = async (req, res) => {
  try {
    const { publicToken } = req.body;
    const userId = req.user.id;
    
    const response = await axios.post('https://sandbox.plaid.com/item/public_token/exchange', {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      public_token: publicToken
    });
    
    const { access_token, item_id } = response.data;
    
    // Get accounts
    const accountsResponse = await axios.post('https://sandbox.plaid.com/accounts/get', {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      access_token
    });
    
    // Store accounts
    for (const account of accountsResponse.data.accounts) {
      await BankAccount.create({
        userId,
        plaidAccountId: account.account_id,
        plaidAccessToken: access_token,
        plaidItemId: item_id,
        institutionName: accountsResponse.data.item.institution_id,
        accountType: account.type,
        accountSubtype: account.subtype,
        currentBalance: account.balances.current,
        availableBalance: account.balances.available,
        isActive: true,
        lastSynced: new Date()
      });
    }
    
    res.json({
      success: true,
      message: 'Bank connected successfully',
      accountCount: accountsResponse.data.accounts.length
    });
  } catch (error) {
    console.error('Exchange token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to connect bank'
    });
  }
};

/**
 * Get user's bank accounts
 */
exports.getAccounts = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const accounts = await BankAccount.find({ userId, isActive: true });
    
    res.json({
      success: true,
      count: accounts.length,
      data: accounts.map(acc => ({
        id: acc._id,
        institutionName: acc.institutionName,
        accountType: acc.accountType,
        currentBalance: acc.currentBalance,
        lastSynced: acc.lastSynced
      }))
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accounts'
    });
  }
};

/**
 * Sync transactions from Plaid
 */
exports.syncTransactions = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const accounts = await BankAccount.find({ userId, isActive: true });
    
    let totalTransactions = 0;
    
    for (const account of accounts) {
      const response = await axios.post('https://sandbox.plaid.com/transactions/get', {
        client_id: process.env.PLAID_CLIENT_ID,
        secret: process.env.PLAID_SECRET,
        access_token: account.plaidAccessToken,
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
      });
      
      // Store transactions
      for (const txn of response.data.transactions) {
        await Transaction.findOneAndUpdate(
          {
            userId,
            plaidTransactionId: txn.transaction_id
          },
          {
            userId,
            accountId: account._id,
            plaidTransactionId: txn.transaction_id,
            amount: txn.amount,
            date: new Date(txn.date),
            description: txn.name,
            category: txn.category?.[0] || 'Other',
            merchantName: txn.merchant_name,
            pending: txn.pending,
            lastSynced: new Date()
          },
          { upsert: true, new: true }
        );
        
        totalTransactions++;
      }
    }
    
    res.json({
      success: true,
      message: `Synced ${totalTransactions} transactions`,
      count: totalTransactions
    });
  } catch (error) {
    console.error('Sync transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync transactions'
    });
  }
};

/**
 * Get user's transactions
 */
exports.getTransactions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, category } = req.query;
    
    const query = { userId };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    if (category) {
      query.category = category;
    }
    
    const transactions = await Transaction.find(query).sort('-date');
    
    res.json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
};

/**
 * Categorize transaction
 */
exports.categorizeTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { category } = req.body;
    
    const transaction = await Transaction.findByIdAndUpdate(
      transactionId,
      { category },
      { new: true }
    );
    
    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Categorize transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to categorize transaction'
    });
  }
};

/**
 * Get budget
 */
exports.getBudget = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month } = req.query;
    
    const targetMonth = month ? new Date(month) : new Date();
    targetMonth.setDate(1); // First of month
    
    let budget = await Budget.findOne({
      userId,
      month: targetMonth
    });
    
    if (!budget) {
      // Create default budget
      budget = await Budget.create({
        userId,
        month: targetMonth,
        categories: [
          { name: 'Food & Dining', budgeted: 600, spent: 0 },
          { name: 'Transportation', budgeted: 200, spent: 0 },
          { name: 'Shopping', budgeted: 300, spent: 0 },
          { name: 'Entertainment', budgeted: 150, spent: 0 },
          { name: 'Bills & Utilities', budgeted: 500, spent: 0 },
          { name: 'Health & Fitness', budgeted: 100, spent: 0 }
        ]
      });
    }
    
    res.json({
      success: true,
      data: budget
    });
  } catch (error) {
    console.error('Get budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch budget'
    });
  }
};

/**
 * Update budget
 */
exports.updateBudget = async (req, res) => {
  try {
    const { userId } = req.params;
    const { categories, totalIncome } = req.body;
    
    const targetMonth = new Date();
    targetMonth.setDate(1);
    
    const budget = await Budget.findOneAndUpdate(
      { userId, month: targetMonth },
      {
        categories,
        totalIncome,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      data: budget
    });
  } catch (error) {
    console.error('Update budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update budget'
    });
  }
};

/**
 * Get cash flow analysis
 */
exports.getCashflow = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const transactions = await Transaction.find({
      userId,
      date: { $gte: last30Days }
    });
    
    const income = transactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const expenses = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const netCashflow = income - expenses;
    
    // Group by category
    const byCategory = {};
    transactions
      .filter(t => t.amount > 0)
      .forEach(t => {
        if (!byCategory[t.category]) {
          byCategory[t.category] = 0;
        }
        byCategory[t.category] += t.amount;
      });
    
    res.json({
      success: true,
      data: {
        income,
        expenses,
        netCashflow,
        savingsRate: income > 0 ? ((netCashflow / income) * 100).toFixed(1) : 0,
        byCategory
      }
    });
  } catch (error) {
    console.error('Get cashflow error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate cashflow'
    });
  }
};

/**
 * Get net worth
 */
exports.getNetWorth = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const accounts = await BankAccount.find({ userId, isActive: true });
    
    const assets = accounts
      .filter(a => a.accountType !== 'credit')
      .reduce((sum, a) => sum + a.currentBalance, 0);
    
    const liabilities = accounts
      .filter(a => a.accountType === 'credit')
      .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
    
    const netWorth = assets - liabilities;
    
    res.json({
      success: true,
      data: {
        assets,
        liabilities,
        netWorth,
        accounts: accounts.length
      }
    });
  } catch (error) {
    console.error('Get net worth error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate net worth'
    });
  }
};

/**
 * Analyze stress-spending correlation
 */
exports.analyzeStressSpending = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Get wearable data and transactions
    const [wearableData, transactions] = await Promise.all([
      WearableData.find({
        userId,
        date: { $gte: last30Days }
      }).sort('date'),
      Transaction.find({
        userId,
        date: { $gte: last30Days },
        amount: { $gt: 0 } // Only expenses
      }).sort('date')
    ]);
    
    // Correlate spending with HRV
    const correlations = [];
    
    for (const txn of transactions) {
      const txnDate = txn.date.toISOString().split('T')[0];
      const wearable = wearableData.find(w => 
        w.date.toISOString().split('T')[0] === txnDate
      );
      
      if (wearable && wearable.hrv) {
        correlations.push({
          date: txnDate,
          amount: txn.amount,
          hrv: wearable.hrv,
          category: txn.category,
          isImpulse: wearable.hrv < 50 && txn.amount > 50
        });
      }
    }
    
    // Calculate insights
    const impulsePurchases = correlations.filter(c => c.isImpulse);
    const totalImpulseSpending = impulsePurchases.reduce((sum, c) => sum + c.amount, 0);
    
    const avgHRVOnSpending = correlations.reduce((sum, c) => sum + c.hrv, 0) / correlations.length;
    const avgHRVOverall = wearableData.reduce((sum, w) => sum + (w.hrv || 0), 0) / wearableData.length;
    
    const insights = [];
    
    if (impulsePurchases.length > 0) {
      insights.push({
        type: 'warning',
        message: `Detected ${impulsePurchases.length} potential stress purchases totaling $${totalImpulseSpending.toFixed(2)}`,
        recommendation: 'Consider implementing a 24-hour rule for non-essential purchases when HRV is low'
      });
    }
    
    if (avgHRVOnSpending < avgHRVOverall) {
      insights.push({
        type: 'info',
        message: 'You tend to spend more when stressed',
        recommendation: 'Practice mindful spending checks during high-stress periods'
      });
    }
    
    res.json({
      success: true,
      insights,
      data: {
        totalCorrelations: correlations.length,
        impulsePurchases: impulsePurchases.length,
        totalImpulseSpending,
        avgHRVOnSpending: avgHRVOnSpending.toFixed(1),
        avgHRVOverall: avgHRVOverall.toFixed(1)
      }
    });
  } catch (error) {
    console.error('Stress spending analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze stress spending'
    });
  }
};

/**
 * Forecast spending
 */
exports.forecastSpending = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get last 90 days of transactions
    const last90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    
    const transactions = await Transaction.find({
      userId,
      date: { $gte: last90Days },
      amount: { $gt: 0 }
    });
    
    // Calculate average daily spending
    const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
    const avgDailySpending = totalSpent / 90;
    
    // Forecast next 30 days
    const forecast30Days = avgDailySpending * 30;
    
    // By category
    const categoryForecast = {};
    transactions.forEach(t => {
      if (!categoryForecast[t.category]) {
        categoryForecast[t.category] = 0;
      }
      categoryForecast[t.category] += t.amount;
    });
    
    Object.keys(categoryForecast).forEach(cat => {
      categoryForecast[cat] = (categoryForecast[cat] / 90 * 30).toFixed(2);
    });
    
    res.json({
      success: true,
      forecast: {
        next30Days: forecast30Days.toFixed(2),
        avgDailySpending: avgDailySpending.toFixed(2),
        byCategory: categoryForecast
      }
    });
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to forecast spending'
    });
  }
};

module.exports = exports;