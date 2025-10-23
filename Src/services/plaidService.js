// ========================================
// 💳 PLAID SERVICE
// ========================================
// Handles all Plaid API integration for bank connections
// Used by Jupiter controller for financial data sync
// ========================================

const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const Finance = require('../models/Finance');
const Transaction = require('../models/Transaction');

// Plaid Configuration
const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET
    }
  }
});

const plaidClient = new PlaidApi(configuration);

// ========================================
// LINK TOKEN CREATION
// ========================================

/**
 * Create Plaid Link token for bank connection
 * @param {String} userId - User ID
 * @returns {Object} Link token and expiration
 */
exports.createLinkToken = async (userId) => {
  try {
    const request = {
      user: {
        client_user_id: userId.toString()
      },
      client_name: 'Phoenix/PAL',
      products: ['transactions', 'auth', 'identity'],
      country_codes: ['US', 'CA'],
      language: 'en',
      webhook: process.env.PLAID_WEBHOOK_URL || 'https://pal-backend.up.railway.app/api/jupiter/webhook',
      account_filters: {
        depository: {
          account_subtypes: ['checking', 'savings']
        },
        credit: {
          account_subtypes: ['credit card']
        }
      }
    };

    const response = await plaidClient.linkTokenCreate(request);
    return response.data;
  } catch (error) {
    console.error('Plaid Link Token Error:', error);
    throw new Error('Failed to create Plaid link token');
  }
};

// ========================================
// TOKEN EXCHANGE & ACCOUNT SETUP
// ========================================

/**
 * Exchange public token for access token and create account records
 * @param {String} publicToken - Plaid public token
 * @param {String} userId - User ID
 * @returns {Object} Account information
 */
exports.exchangeToken = async (publicToken, userId) => {
  try {
    // Exchange public token for access token
    const tokenResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken
    });

    const accessToken = tokenResponse.data.access_token;
    const itemId = tokenResponse.data.item_id;

    // Get account information
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken
    });

    const accounts = accountsResponse.data.accounts;
    const institution = accountsResponse.data.item.institution_id;

    // Get institution details
    let institutionName = 'Unknown Bank';
    try {
      const institutionResponse = await plaidClient.institutionsGetById({
        institution_id: institution,
        country_codes: ['US', 'CA']
      });
      institutionName = institutionResponse.data.institution.name;
    } catch (err) {
      console.error('Failed to get institution name:', err);
    }

    // Create Finance records for each account
    const createdAccounts = [];

    for (const account of accounts) {
      const financeAccount = await Finance.create({
        userId,
        plaidAccountId: account.account_id,
        plaidAccessToken: accessToken,
        plaidItemId: itemId,
        institutionName,
        institutionId: institution,
        accountName: account.name,
        officialName: account.official_name || account.name,
        accountType: account.type,
        accountSubtype: account.subtype,
        currentBalance: account.balances.current || 0,
        availableBalance: account.balances.available || 0,
        creditLimit: account.balances.limit || null,
        mask: account.mask,
        isoCurrencyCode: account.balances.iso_currency_code || 'USD',
        isActive: true,
        lastSynced: new Date()
      });

      createdAccounts.push(financeAccount);
    }

    // Initial transaction sync (last 30 days)
    await this.syncTransactions(accessToken, null, userId);

    return {
      accounts: createdAccounts,
      itemId,
      institution: institutionName
    };
  } catch (error) {
    console.error('Plaid Token Exchange Error:', error);
    throw new Error('Failed to connect bank account');
  }
};

// ========================================
// TRANSACTION SYNCING
// ========================================

/**
 * Sync transactions from Plaid
 * @param {String} accessToken - Plaid access token
 * @param {String} accountId - Specific account ID (optional)
 * @param {String} userId - User ID
 * @returns {Object} Sync results
 */
exports.syncTransactions = async (accessToken, accountId, userId) => {
  try {
    // Get transactions from last 30 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const endDate = new Date();

    const request = {
      access_token: accessToken,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      options: {
        count: 500,
        offset: 0
      }
    };

    if (accountId) {
      request.options.account_ids = [accountId];
    }

    const response = await plaidClient.transactionsGet(request);
    let transactions = response.data.transactions;

    // Handle pagination
    const totalTransactions = response.data.total_transactions;
    while (transactions.length < totalTransactions) {
      request.options.offset = transactions.length;
      const moreResponse = await plaidClient.transactionsGet(request);
      transactions = transactions.concat(moreResponse.data.transactions);
    }

    // Process and save transactions
    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    for (const txn of transactions) {
      // Find corresponding Finance account
      const account = await Finance.findOne({
        plaidAccountId: txn.account_id,
        userId
      });

      if (!account) continue;

      // Check if transaction already exists
      const existing = await Transaction.findOne({
        plaidTransactionId: txn.transaction_id
      });

      if (existing) {
        // Update existing transaction
        if (existing.pending !== txn.pending || existing.amount !== txn.amount) {
          existing.name = txn.name;
          existing.merchantName = txn.merchant_name;
          existing.amount = txn.amount;
          existing.date = new Date(txn.date);
          existing.pending = txn.pending;
          existing.categoryDetailed = txn.category || [];
          existing.category = this.mapCategory(txn.category);
          await existing.save();
          modifiedCount++;
        }
      } else {
        // Create new transaction
        await Transaction.create({
          userId,
          accountId: account._id,
          plaidTransactionId: txn.transaction_id,
          plaidAccountId: txn.account_id,
          name: txn.name,
          merchantName: txn.merchant_name,
          amount: txn.amount,
          isoCurrencyCode: txn.iso_currency_code || 'USD',
          category: this.mapCategory(txn.category),
          categoryDetailed: txn.category || [],
          date: new Date(txn.date),
          authorizedDate: txn.authorized_date ? new Date(txn.authorized_date) : null,
          pending: txn.pending,
          paymentChannel: txn.payment_channel,
          location: txn.location || {},
          merchantWebsite: txn.merchant_name ? null : null
        });
        addedCount++;
      }
    }

    // Get account balances
    const balancesResponse = await plaidClient.accountsBalanceGet({
      access_token: accessToken
    });

    const balances = balancesResponse.data.accounts[0]?.balances || {};

    return {
      addedCount,
      modifiedCount,
      removedCount,
      balance: {
        current: balances.current || 0,
        available: balances.available || 0
      }
    };
  } catch (error) {
    console.error('Plaid Transaction Sync Error:', error);
    throw new Error('Failed to sync transactions');
  }
};

// ========================================
// ACCOUNT MANAGEMENT
// ========================================

/**
 * Remove Plaid item (disconnect bank)
 * @param {String} itemId - Plaid item ID
 */
exports.removeItem = async (itemId) => {
  try {
    // Get access token
    const account = await Finance.findOne({ plaidItemId: itemId });
    if (!account) {
      throw new Error('Account not found');
    }

    // Remove item from Plaid
    await plaidClient.itemRemove({
      access_token: account.plaidAccessToken
    });

    return { success: true };
  } catch (error) {
    console.error('Plaid Remove Item Error:', error);
    throw new Error('Failed to remove bank connection');
  }
};

/**
 * Get account balances
 * @param {String} accessToken - Plaid access token
 */
exports.getBalances = async (accessToken) => {
  try {
    const response = await plaidClient.accountsBalanceGet({
      access_token: accessToken
    });

    return response.data.accounts;
  } catch (error) {
    console.error('Plaid Get Balances Error:', error);
    throw new Error('Failed to get account balances');
  }
};

// ========================================
// WEBHOOK HANDLING
// ========================================

/**
 * Handle Plaid webhooks
 * @param {Object} webhookData - Webhook payload
 */
exports.handleWebhook = async (webhookData) => {
  try {
    const { webhook_type, webhook_code, item_id } = webhookData;

    console.log(`Plaid Webhook: ${webhook_type} - ${webhook_code} for item ${item_id}`);

    // Handle different webhook types
    switch (webhook_type) {
      case 'TRANSACTIONS':
        await this.handleTransactionWebhook(webhookData);
        break;
      
      case 'ITEM':
        await this.handleItemWebhook(webhookData);
        break;
      
      default:
        console.log(`Unhandled webhook type: ${webhook_type}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Plaid Webhook Error:', error);
    throw error;
  }
};

/**
 * Handle transaction webhooks
 */
exports.handleTransactionWebhook = async (webhookData) => {
  const { item_id, webhook_code } = webhookData;

  // Find account with this item_id
  const account = await Finance.findOne({ plaidItemId: item_id });
  if (!account) return;

  // Sync transactions based on webhook code
  if (webhook_code === 'INITIAL_UPDATE' || webhook_code === 'HISTORICAL_UPDATE' || webhook_code === 'DEFAULT_UPDATE') {
    await this.syncTransactions(account.plaidAccessToken, null, account.userId);
  }
};

/**
 * Handle item webhooks
 */
exports.handleItemWebhook = async (webhookData) => {
  const { item_id, webhook_code, error } = webhookData;

  // Find account with this item_id
  const account = await Finance.findOne({ plaidItemId: item_id });
  if (!account) return;

  // Handle item errors
  if (webhook_code === 'ERROR') {
    await account.recordError(error?.error_message || 'Unknown error');
  }

  // Handle item login required
  if (webhook_code === 'PENDING_EXPIRATION' || webhook_code === 'USER_PERMISSION_REVOKED') {
    account.isActive = false;
    await account.save();
  }
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Map Plaid categories to our simplified categories
 * @param {Array} plaidCategories - Plaid category array
 * @returns {String} Simplified category
 */
exports.mapCategory = (plaidCategories) => {
  if (!plaidCategories || plaidCategories.length === 0) return 'other';

  const category = plaidCategories[0].toLowerCase();

  // Category mapping
  const categoryMap = {
    'food and drink': 'food',
    'restaurants': 'food',
    'groceries': 'food',
    'transportation': 'transportation',
    'travel': 'travel',
    'shops': 'shopping',
    'recreation': 'entertainment',
    'service': 'bills',
    'healthcare': 'health',
    'transfer': 'transfer',
    'payment': 'bills',
    'interest': 'income',
    'income': 'income'
  };

  for (const [key, value] of Object.entries(categoryMap)) {
    if (category.includes(key)) return value;
  }

  return 'other';
};

module.exports = exports;
