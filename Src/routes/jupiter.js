// ========================================
// 🪐 JUPITER ROUTES - Finance System
// ========================================
// Financial tracking, banking, budgets, transactions
// Base Path: /api/jupiter
// Total Endpoints: 16
// Status: ✅ COMPLETE
// ========================================

const express = require('express');
const router = express.Router();
const jupiterController = require('../controllers/jupiterController');
const { protect } = require('../middleware/auth');

// Apply authentication to all routes
router.use(protect);

// ========================================
// PLAID INTEGRATION (2 endpoints)
// ========================================

// Create Plaid link token for connecting bank accounts
router.post('/link-token', jupiterController.createLinkToken);

// Exchange Plaid public token for permanent access token
router.post('/exchange-token', jupiterController.exchangeToken);

// ========================================
// BANK ACCOUNTS (3 endpoints)
// ========================================

// Get all connected bank accounts
router.get('/accounts', jupiterController.getAccounts);

// Disconnect/remove a bank account
router.delete('/account/:id', jupiterController.disconnectAccount);

// Manually sync transactions for a specific account
router.post('/sync/:accountId', jupiterController.syncAccount);

// ========================================
// TRANSACTIONS (6 endpoints)
// ========================================

// Get all transactions with optional filters
// Query params: limit, offset, accountId, category, minAmount, maxAmount
router.get('/transactions', jupiterController.getTransactions);

// Get transactions filtered by date range
// Query params: startDate, endDate (required)
router.get('/transactions/date-range', jupiterController.getTransactionsByDateRange);

// Get transactions by category
// Query params: startDate, endDate, limit
router.get('/transactions/category/:category', jupiterController.getTransactionsByCategory);

// Update/recategorize a transaction
// Body: { category }
router.put('/transactions/:id', jupiterController.recategorizeTransaction);

// Detect recurring transactions (subscriptions, bills)
router.get('/transactions/recurring', jupiterController.getRecurringTransactions);

// Analyze spending patterns and trends
// Query params: days (default: 30)
router.get('/spending-patterns', jupiterController.getSpendingPatterns);

// ========================================
// BUDGETS (4 endpoints)
// ========================================

// Create a new budget
// Body: { category, amount, period, startDate }
router.post('/budgets', jupiterController.createBudget);

// Get all active budgets with current spending
router.get('/budgets', jupiterController.getBudgets);

// Update an existing budget
// Body: { amount, period }
router.put('/budgets/:id', jupiterController.updateBudget);

// Delete/deactivate a budget
router.delete('/budgets/:id', jupiterController.deleteBudget);

// Get budget overspending alerts
router.get('/budgets/alerts', jupiterController.getBudgetAlerts);

// ========================================
// STRESS-SPENDING CORRELATION (1 endpoint)
// ========================================

// Analyze correlation between stress/recovery and spending patterns
router.get('/stress-correlation', jupiterController.getStressCorrelation);

module.exports = router;
