// ========================================
// 🪐 JUPITER CONTROLLER - Finance System
// ========================================
// Financial tracking, banking, budgets, transactions
// Plaid integration for bank connections
// Spending analysis and budget management
// Status: ✅ COMPLETE (16 methods)
// ========================================

const Finance = require('../models/jupiter/Finance');
const Budget = require('../models/jupiter/Budget');
const Transaction = require('../models/jupiter/Transaction');
const plaidService = require('../services/jupiter/plaidService');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// ========================================
// A. PLAID INTEGRATION (2 methods)
// ========================================

// 1. Create Plaid link token
exports.createLinkToken = asyncHandler(async (req, res, next) => {
  // POST /api/jupiter/link-token
  // Creates Plaid Link token for connecting bank accounts
  // Returns: { linkToken, expiration }
  // Service: plaidService.createLinkToken(userId)

  const userId = req.user.id;

  const linkToken = await plaidService.createLinkToken(userId);

  res.status(200).json({
    success: true,
    data: {
      linkToken: linkToken.link_token,
      expiration: linkToken.expiration,
      requestId: linkToken.request_id
    }
  });
});

// 2. Exchange public token for access token
exports.exchangeToken = asyncHandler(async (req, res, next) => {
  // POST /api/jupiter/exchange-token
  // Body: { publicToken }
  // Exchanges Plaid public token for permanent access token
  // Creates account records in database
  // Returns: { accounts: [], itemId }
  // Service: plaidService.exchangeToken(publicToken, userId)

  const { publicToken } = req.body;
  const userId = req.user.id;

  if (!publicToken) {
    return next(new ErrorResponse('Public token is required', 400));
  }

  const result = await plaidService.exchangeToken(publicToken, userId);

  res.status(201).json({
    success: true,
    message: 'Bank account connected successfully',
    data: {
      accounts: result.accounts,
      itemId: result.itemId,
      institution: result.institution
    }
  });
});

// ========================================
// B. BANK ACCOUNTS (3 methods)
// ========================================

// 3. Get connected accounts
exports.getAccounts = asyncHandler(async (req, res, next) => {
  // GET /api/jupiter/accounts
  // Returns: { accounts: [{ name, type, balance, lastSync }] }

  const userId = req.user.id;

  const accounts = await Finance.find({ userId }).sort('-lastSynced');

  const accountData = accounts.map(account => ({
    id: account._id,
    itemId: account.plaidItemId,
    accountId: account.plaidAccountId,
    name: account.accountName,
    officialName: account.officialName,
    type: account.accountType,
    subtype: account.accountSubtype,
    mask: account.mask,
    balance: {
      current: account.currentBalance,
      available: account.availableBalance,
      limit: account.creditLimit
    },
    institution: account.institutionName,
    lastSynced: account.lastSynced,
    isActive: account.isActive
  }));

  res.status(200).json({
    success: true,
    count: accountData.length,
    data: accountData
  });
});

// 4. Disconnect account
exports.disconnectAccount = asyncHandler(async (req, res, next) => {
  // DELETE /api/jupiter/account/:id
  // Removes Plaid item and deletes account records
  // Returns: { success: true }
  // Service: plaidService.removeItem(itemId)

  const { id } = req.params;
  const userId = req.user.id;

  const account = await Finance.findById(id);

  if (!account) {
    return next(new ErrorResponse('Account not found', 404));
  }

  if (account.userId.toString() !== userId) {
    return next(new ErrorResponse('Not authorized to disconnect this account', 403));
  }

  // Remove from Plaid
  await plaidService.removeItem(account.plaidItemId);

  // Mark as inactive (keep transaction history)
  account.isActive = false;
  await account.save();

  res.status(200).json({
    success: true,
    message: 'Account disconnected successfully'
  });
});

// 5. Manual sync
exports.syncAccount = asyncHandler(async (req, res, next) => {
  // POST /api/jupiter/sync/:accountId
  // Manually triggers sync for specific account
  // Returns: { synced: true, newTransactions: count, balance }
  // Service: plaidService.syncTransactions(accessToken, accountId)

  const { accountId } = req.params;
  const userId = req.user.id;

  const account = await Finance.findById(accountId);

  if (!account) {
    return next(new ErrorResponse('Account not found', 404));
  }

  if (account.userId.toString() !== userId) {
    return next(new ErrorResponse('Not authorized to sync this account', 403));
  }

  const syncResult = await plaidService.syncTransactions(
    account.plaidAccessToken,
    account.plaidAccountId,
    userId
  );

  // Update last synced time
  account.lastSynced = new Date();
  account.currentBalance = syncResult.balance.current;
  account.availableBalance = syncResult.balance.available;
  await account.save();

  res.status(200).json({
    success: true,
    message: 'Account synced successfully',
    data: {
      newTransactions: syncResult.addedCount,
      modifiedTransactions: syncResult.modifiedCount,
      removedTransactions: syncResult.removedCount,
      balance: {
        current: syncResult.balance.current,
        available: syncResult.balance.available
      },
      lastSynced: account.lastSynced
    }
  });
});

// ========================================
// C. TRANSACTIONS (6 methods)
// ========================================

// 6. Get all transactions
exports.getTransactions = asyncHandler(async (req, res, next) => {
  // GET /api/jupiter/transactions
  // Query: ?limit=100&offset=0&accountId=xyz&category=food
  // Returns: { transactions: [], total, summary }

  const userId = req.user.id;
  const {
    limit = 100,
    offset = 0,
    accountId,
    category,
    minAmount,
    maxAmount
  } = req.query;

  const query = { userId };

  if (accountId) {
    query.accountId = accountId;
  }

  if (category) {
    query.category = category;
  }

  if (minAmount || maxAmount) {
    query.amount = {};
    if (minAmount) query.amount.$gte = parseFloat(minAmount);
    if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort('-date')
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate('accountId', 'accountName institutionName'),
    Transaction.countDocuments(query)
  ]);

  // Calculate summary
  const summary = {
    totalSpending: 0,
    totalIncome: 0,
    netCashFlow: 0
  };

  transactions.forEach(txn => {
    if (txn.amount > 0) {
      summary.totalSpending += txn.amount;
    } else {
      summary.totalIncome += Math.abs(txn.amount);
    }
  });

  summary.netCashFlow = summary.totalIncome - summary.totalSpending;

  res.status(200).json({
    success: true,
    count: transactions.length,
    total,
    data: transactions,
    summary
  });
});

// 7. Get transactions by date range
exports.getTransactionsByDateRange = asyncHandler(async (req, res, next) => {
  // GET /api/jupiter/transactions/date-range
  // Query: ?startDate=2025-10-01&endDate=2025-10-22
  // Returns: { transactions: [], summary: { totalSpending, byCategory } }

  const userId = req.user.id;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse('Start date and end date are required', 400));
  }

  const transactions = await Transaction.find({
    userId,
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  })
    .sort('-date')
    .populate('accountId', 'accountName institutionName');

  // Calculate summary by category
  const byCategory = {};
  let totalSpending = 0;
  let totalIncome = 0;

  transactions.forEach(txn => {
    const category = txn.category || 'Uncategorized';

    if (!byCategory[category]) {
      byCategory[category] = { amount: 0, count: 0 };
    }

    byCategory[category].amount += txn.amount;
    byCategory[category].count += 1;

    if (txn.amount > 0) {
      totalSpending += txn.amount;
    } else {
      totalIncome += Math.abs(txn.amount);
    }
  });

  res.status(200).json({
    success: true,
    count: transactions.length,
    data: transactions,
    summary: {
      totalSpending,
      totalIncome,
      netCashFlow: totalIncome - totalSpending,
      byCategory
    }
  });
});

// 8. Get transactions by category
exports.getTransactionsByCategory = asyncHandler(async (req, res, next) => {
  // GET /api/jupiter/transactions/category/:category
  // Query: ?startDate=&endDate=&limit=50
  // Returns: { transactions: [], total: amount }

  const userId = req.user.id;
  const { category } = req.params;
  const { startDate, endDate, limit = 50 } = req.query;

  const query = { userId, category };

  if (startDate && endDate) {
    query.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const transactions = await Transaction.find(query)
    .sort('-date')
    .limit(parseInt(limit))
    .populate('accountId', 'accountName institutionName');

  const total = transactions.reduce((sum, txn) => sum + txn.amount, 0);

  res.status(200).json({
    success: true,
    count: transactions.length,
    category,
    data: transactions,
    total
  });
});

// 9. Recategorize transaction
exports.recategorizeTransaction = asyncHandler(async (req, res, next) => {
  // PUT /api/jupiter/transactions/:id
  // Body: { category }
  // Returns: { transaction: updated }

  const { id } = req.params;
  const { category } = req.body;
  const userId = req.user.id;

  if (!category) {
    return next(new ErrorResponse('Category is required', 400));
  }

  const transaction = await Transaction.findById(id);

  if (!transaction) {
    return next(new ErrorResponse('Transaction not found', 404));
  }

  if (transaction.userId.toString() !== userId) {
    return next(new ErrorResponse('Not authorized to update this transaction', 403));
  }

  transaction.category = category;
  transaction.isManuallyRecategorized = true;
  await transaction.save();

  res.status(200).json({
    success: true,
    message: 'Transaction recategorized successfully',
    data: transaction
  });
});

// 10. Get recurring transactions
exports.getRecurringTransactions = asyncHandler(async (req, res, next) => {
  // GET /api/jupiter/transactions/recurring
  // Detects recurring transactions (subscriptions, bills)
  // Returns: { recurring: [{ name, amount, frequency, nextDate }] }

  const userId = req.user.id;

  // Get transactions from last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transactions = await Transaction.find({
    userId,
    date: { $gte: ninetyDaysAgo }
  }).sort('date');

  // Simple recurring transaction detection algorithm
  // Group by merchant and amount
  const groupedTransactions = {};

  transactions.forEach(txn => {
    const key = `${txn.merchantName || txn.name}_${txn.amount}`;

    if (!groupedTransactions[key]) {
      groupedTransactions[key] = [];
    }

    groupedTransactions[key].push(txn);
  });

  // Find recurring patterns (3+ occurrences)
  const recurring = [];

  Object.entries(groupedTransactions).forEach(([key, txns]) => {
    if (txns.length >= 3) {
      // Calculate average days between transactions
      const dates = txns.map(t => new Date(t.date)).sort((a, b) => a - b);
      const intervals = [];

      for (let i = 1; i < dates.length; i++) {
        const diff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        intervals.push(diff);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      // Determine frequency
      let frequency = 'Unknown';
      if (avgInterval >= 28 && avgInterval <= 32) frequency = 'Monthly';
      else if (avgInterval >= 13 && avgInterval <= 15) frequency = 'Bi-weekly';
      else if (avgInterval >= 6 && avgInterval <= 8) frequency = 'Weekly';
      else if (avgInterval >= 88 && avgInterval <= 95) frequency = 'Quarterly';
      else if (avgInterval >= 358 && avgInterval <= 372) frequency = 'Yearly';

      // Predict next date
      const lastDate = dates[dates.length - 1];
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + Math.round(avgInterval));

      recurring.push({
        name: txns[0].merchantName || txns[0].name,
        category: txns[0].category,
        amount: txns[0].amount,
        frequency,
        occurrences: txns.length,
        avgInterval: Math.round(avgInterval),
        lastDate: lastDate,
        nextDate: nextDate,
        confidence: txns.length >= 5 ? 'High' : 'Medium'
      });
    }
  });

  res.status(200).json({
    success: true,
    count: recurring.length,
    data: recurring
  });
});

// 11. Get spending patterns
exports.getSpendingPatterns = asyncHandler(async (req, res, next) => {
  // GET /api/jupiter/spending-patterns
  // Query: ?days=30
  // Analyzes spending patterns and trends
  // Returns: { 
  //   byCategory: {}, 
  //   byDay: {}, 
  //   trends: [], 
  //   insights: [],
  //   averages: {}
  // }

  const userId = req.user.id;
  const { days = 30 } = req.query;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));

  const transactions = await Transaction.find({
    userId,
    date: { $gte: startDate },
    amount: { $gt: 0 } // Only spending (positive amounts)
  });

  // Analyze by category
  const byCategory = {};
  transactions.forEach(txn => {
    const category = txn.category || 'Uncategorized';
    if (!byCategory[category]) {
      byCategory[category] = { total: 0, count: 0, transactions: [] };
    }
    byCategory[category].total += txn.amount;
    byCategory[category].count += 1;
    byCategory[category].transactions.push(txn);
  });

  // Sort categories by spending
  const sortedCategories = Object.entries(byCategory)
    .map(([name, data]) => ({
      name,
      total: data.total,
      count: data.count,
      average: data.total / data.count
    }))
    .sort((a, b) => b.total - a.total);

  // Analyze by day of week
  const byDayOfWeek = {};
  transactions.forEach(txn => {
    const day = new Date(txn.date).toLocaleDateString('en-US', { weekday: 'long' });
    if (!byDayOfWeek[day]) {
      byDayOfWeek[day] = { total: 0, count: 0 };
    }
    byDayOfWeek[day].total += txn.amount;
    byDayOfWeek[day].count += 1;
  });

  // Calculate totals and averages
  const totalSpending = transactions.reduce((sum, txn) => sum + txn.amount, 0);
  const dailyAverage = totalSpending / parseInt(days);
  const weeklyAverage = dailyAverage * 7;
  const monthlyProjected = dailyAverage * 30;

  // Generate insights
  const insights = [];

  // Top spending category
  if (sortedCategories.length > 0) {
    insights.push({
      type: 'top_category',
      message: `Your highest spending is in ${sortedCategories[0].name} ($${sortedCategories[0].total.toFixed(2)})`,
      category: sortedCategories[0].name,
      amount: sortedCategories[0].total
    });
  }

  // Spending frequency
  if (transactions.length > 0) {
    insights.push({
      type: 'frequency',
      message: `You made ${transactions.length} transactions in the last ${days} days`,
      averagePerDay: (transactions.length / parseInt(days)).toFixed(1)
    });
  }

  res.status(200).json({
    success: true,
    period: `Last ${days} days`,
    data: {
      totalSpending,
      transactionCount: transactions.length,
      averages: {
        daily: dailyAverage,
        weekly: weeklyAverage,
        monthlyProjected
      },
      byCategory: sortedCategories,
      byDayOfWeek,
      insights
    }
  });
});

// ========================================
// D. BUDGETS (4 methods)
// ========================================

// 12. Create budget
exports.createBudget = asyncHandler(async (req, res, next) => {
  // POST /api/jupiter/budgets
  // Body: { category, amount, period: 'monthly' }
  // Returns: { budget created }

  const userId = req.user.id;
  const { category, amount, period = 'monthly', startDate } = req.body;

  if (!category || !amount) {
    return next(new ErrorResponse('Category and amount are required', 400));
  }

  const budget = await Budget.create({
    userId,
    category,
    amount: parseFloat(amount),
    period,
    startDate: startDate || new Date(),
    spent: 0,
    remaining: parseFloat(amount)
  });

  res.status(201).json({
    success: true,
    message: 'Budget created successfully',
    data: budget
  });
});

// 13. Get budgets
exports.getBudgets = asyncHandler(async (req, res, next) => {
  // GET /api/jupiter/budgets
  // Returns: { budgets: [{ category, amount, spent, remaining, status }] }

  const userId = req.user.id;

  const budgets = await Budget.find({ userId, isActive: true });

  // Update spent amounts for each budget
  const updatedBudgets = await Promise.all(
    budgets.map(async (budget) => {
      // Get current period start date
      const periodStart = new Date();
      if (budget.period === 'monthly') {
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);
      } else if (budget.period === 'weekly') {
        const day = periodStart.getDay();
        periodStart.setDate(periodStart.getDate() - day);
        periodStart.setHours(0, 0, 0, 0);
      }

      // Calculate spent amount for current period
      const transactions = await Transaction.find({
        userId,
        category: budget.category,
        date: { $gte: periodStart },
        amount: { $gt: 0 } // Only spending
      });

      const spent = transactions.reduce((sum, txn) => sum + txn.amount, 0);
      const remaining = budget.amount - spent;
      const percentUsed = (spent / budget.amount) * 100;

      // Determine status
      let status = 'on_track';
      if (percentUsed >= 100) status = 'exceeded';
      else if (percentUsed >= 80) status = 'warning';

      // Update budget document
      budget.spent = spent;
      budget.remaining = remaining;
      await budget.save();

      return {
        id: budget._id,
        category: budget.category,
        amount: budget.amount,
        spent,
        remaining,
        percentUsed: percentUsed.toFixed(1),
        status,
        period: budget.period,
        startDate: periodStart
      };
    })
  );

  res.status(200).json({
    success: true,
    count: updatedBudgets.length,
    data: updatedBudgets
  });
});

// 14. Update budget
exports.updateBudget = asyncHandler(async (req, res, next) => {
  // PUT /api/jupiter/budgets/:id
  // Body: { amount?, period? }
  // Returns: { budget: updated }

  const { id } = req.params;
  const userId = req.user.id;
  const { amount, period } = req.body;

  const budget = await Budget.findById(id);

  if (!budget) {
    return next(new ErrorResponse('Budget not found', 404));
  }

  if (budget.userId.toString() !== userId) {
    return next(new ErrorResponse('Not authorized to update this budget', 403));
  }

  if (amount) budget.amount = parseFloat(amount);
  if (period) budget.period = period;

  budget.remaining = budget.amount - budget.spent;
  await budget.save();

  res.status(200).json({
    success: true,
    message: 'Budget updated successfully',
    data: budget
  });
});

// 15. Delete budget
exports.deleteBudget = asyncHandler(async (req, res, next) => {
  // DELETE /api/jupiter/budgets/:id
  // Returns: { success: true }

  const { id } = req.params;
  const userId = req.user.id;

  const budget = await Budget.findById(id);

  if (!budget) {
    return next(new ErrorResponse('Budget not found', 404));
  }

  if (budget.userId.toString() !== userId) {
    return next(new ErrorResponse('Not authorized to delete this budget', 403));
  }

  budget.isActive = false;
  await budget.save();

  res.status(200).json({
    success: true,
    message: 'Budget deleted successfully'
  });
});

// 16. Get budget alerts
exports.getBudgetAlerts = asyncHandler(async (req, res, next) => {
  // GET /api/jupiter/budgets/alerts
  // Returns: { alerts: [{ budget, status, percentUsed, message }] }

  const userId = req.user.id;

  const budgets = await Budget.find({ userId, isActive: true });

  const alerts = [];

  for (const budget of budgets) {
    const percentUsed = (budget.spent / budget.amount) * 100;

    if (percentUsed >= 80) {
      alerts.push({
        budgetId: budget._id,
        category: budget.category,
        amount: budget.amount,
        spent: budget.spent,
        remaining: budget.remaining,
        percentUsed: percentUsed.toFixed(1),
        severity: percentUsed >= 100 ? 'critical' : 'warning',
        message:
          percentUsed >= 100
            ? `You've exceeded your ${budget.category} budget by $${(budget.spent - budget.amount).toFixed(2)}`
            : `You've used ${percentUsed.toFixed(0)}% of your ${budget.category} budget`
      });
    }
  }

  res.status(200).json({
    success: true,
    count: alerts.length,
    data: alerts
  });
});

// ========================================
// E. STRESS-SPENDING CORRELATION (1 method)
// ========================================

// 17. Get stress-spending correlation
exports.getStressCorrelation = asyncHandler(async (req, res, next) => {
  // GET /api/jupiter/stress-correlation
  // Analyzes correlation between stress/recovery and spending
  // Returns: { 
  //   correlation: coefficient, 
  //   insights: [], 
  //   data: [{ date, spending, recoveryScore }]
  // }

  const userId = req.user.id;

  // Get last 90 days of data
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Get transactions (spending only)
  const transactions = await Transaction.find({
    userId,
    date: { $gte: ninetyDaysAgo },
    amount: { $gt: 0 }
  }).sort('date');

  // Get recovery scores from Mercury
  const RecoveryScore = require('../models/mercury/RecoveryScore');
  const recoveryScores = await RecoveryScore.find({
    userId,
    date: { $gte: ninetyDaysAgo }
  }).sort('date');

  // Group spending by day
  const dailySpending = {};
  transactions.forEach(txn => {
    const date = new Date(txn.date).toISOString().split('T')[0];
    if (!dailySpending[date]) {
      dailySpending[date] = 0;
    }
    dailySpending[date] += txn.amount;
  });

  // Create correlation data
  const correlationData = [];
  recoveryScores.forEach(score => {
    const date = new Date(score.date).toISOString().split('T')[0];
    const spending = dailySpending[date] || 0;

    correlationData.push({
      date,
      spending,
      recoveryScore: score.totalScore,
      stressLevel: 100 - score.totalScore // Inverse of recovery
    });
  });

  // Calculate correlation coefficient (Pearson)
  if (correlationData.length >= 10) {
    const n = correlationData.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    correlationData.forEach(d => {
      sumX += d.stressLevel;
      sumY += d.spending;
      sumXY += d.stressLevel * d.spending;
      sumX2 += d.stressLevel * d.stressLevel;
      sumY2 += d.spending * d.spending;
    });

    const correlation =
      (n * sumXY - sumX * sumY) /
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    // Generate insights
    const insights = [];

    if (correlation > 0.3) {
      insights.push({
        type: 'positive_correlation',
        strength: correlation > 0.6 ? 'strong' : 'moderate',
        message: `There is a ${correlation > 0.6 ? 'strong' : 'moderate'} positive correlation between stress and spending. You tend to spend more when stressed.`
      });
    } else if (correlation < -0.3) {
      insights.push({
        type: 'negative_correlation',
        strength: correlation < -0.6 ? 'strong' : 'moderate',
        message: `There is a ${correlation < -0.6 ? 'strong' : 'moderate'} negative correlation. You tend to spend less when stressed.`
      });
    } else {
      insights.push({
        type: 'no_correlation',
        message: 'No significant correlation detected between stress levels and spending patterns.'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        correlation: parseFloat(correlation.toFixed(3)),
        dataPoints: correlationData.length,
        insights,
        chartData: correlationData
      }
    });
  } else {
    res.status(200).json({
      success: true,
      message: 'Insufficient data for correlation analysis',
      data: {
        correlation: null,
        dataPoints: correlationData.length,
        minimumRequired: 10
      }
    });
  }
});

module.exports = exports;
