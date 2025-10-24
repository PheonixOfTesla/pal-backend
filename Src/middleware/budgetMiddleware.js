// ============================================
// BUDGET MIDDLEWARE - Complete Budget Management
// ============================================
// Checks spending limits, enforces daily caps, and requires confirmation
// ============================================

const User = require('../models/User');
const ButlerAction = require('../models/phoenix/ButlerAction');

/**
 * Main budget checking middleware
 * Validates user has sufficient budget before allowing expensive actions
 */
exports.checkBudget = async (req, res, next) => {
  try {
    // Get user with settings
    const user = await User.findById(req.user.id).select('phoenixSettings');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // If budget feature not enabled, block action
    if (!user.phoenixSettings?.callBudget?.enabled) {
      return res.status(403).json({
        success: false,
        error: 'Call/SMS budget not enabled',
        message: 'Please enable budget management in your settings before using phone or SMS features',
        action: 'enable_budget',
        setupUrl: '/api/phoenix/butler/budget'
      });
    }

    const budget = user.phoenixSettings.callBudget;
    const remaining = budget.monthlyLimit - (budget.currentSpent || 0);

    // Estimate cost based on action type
    const { actionType } = req.body;
    let estimatedCost = 0;

    switch (actionType) {
      case 'call':
        estimatedCost = 1.00; // Average phone call
        break;
      case 'sms':
        estimatedCost = 0.01; // SMS message (slightly higher estimate)
        break;
      default:
        estimatedCost = 0.10; // Default for unknown actions
    }

    // Check endpoint path if actionType not provided
    if (!actionType) {
      if (req.path.includes('/call')) {
        estimatedCost = 1.00;
      } else if (req.path.includes('/sms')) {
        estimatedCost = 0.01;
      }
    }

    // Check if sufficient budget
    if (remaining < estimatedCost) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient budget',
        message: `Not enough budget for this action. Need $${estimatedCost.toFixed(2)}, but only $${remaining.toFixed(2)} remaining`,
        remaining: remaining.toFixed(2),
        required: estimatedCost.toFixed(2),
        monthlyLimit: budget.monthlyLimit.toFixed(2),
        totalSpent: (budget.currentSpent || 0).toFixed(2),
        action: 'add_funds',
        upgradeUrl: '/api/phoenix/butler/budget'
      });
    }

    // Alert if approaching limit (within threshold)
    const threshold = budget.alertThreshold || 0.20; // Default 20%
    const percentageRemaining = remaining / budget.monthlyLimit;
    
    if (percentageRemaining < threshold) {
      res.locals.budgetWarning = {
        message: `Budget low: Only $${remaining.toFixed(2)} remaining (${(percentageRemaining * 100).toFixed(0)}%)`,
        remaining: remaining.toFixed(2),
        percentage: (percentageRemaining * 100).toFixed(0),
        monthlyLimit: budget.monthlyLimit.toFixed(2)
      };
    }

    // Attach budget info to request for use in controller
    req.budgetInfo = {
      remaining,
      estimatedCost,
      monthlyLimit: budget.monthlyLimit,
      currentSpent: budget.currentSpent || 0,
      willTriggerAlert: percentageRemaining - (estimatedCost / budget.monthlyLimit) < threshold
    };

    next();

  } catch (error) {
    console.error('Budget check middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check budget',
      message: error.message
    });
  }
};

/**
 * Require user confirmation for expensive actions
 * Use as second middleware: router.post('/call', checkBudget, requireConfirmation(1.00), controller)
 */
exports.requireConfirmation = (costThreshold = 0.50) => {
  return (req, res, next) => {
    const { estimatedCost } = req.budgetInfo || {};
    
    // Check if cost exceeds threshold AND user hasn't confirmed
    if (estimatedCost >= costThreshold && !req.body.confirmed) {
      return res.status(200).json({
        success: false,
        requiresConfirmation: true,
        message: `This action will cost approximately $${estimatedCost.toFixed(2)}. Please confirm to proceed.`,
        estimatedCost: estimatedCost.toFixed(2),
        budgetRemaining: req.budgetInfo.remaining.toFixed(2),
        action: 'confirm_and_retry',
        instructions: 'Send the same request with "confirmed: true" in the body to proceed'
      });
    }

    // User confirmed or cost below threshold
    next();
  };
};

/**
 * Check daily action limits (calls, SMS, etc.)
 */
exports.checkDailyLimit = (actionType, defaultLimit = 50) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id).select('phoenixSettings');
      
      // Get daily limit from settings or use default
      const dailyLimit = user.phoenixSettings?.callSettings?.maxCallsPerDay || 
                        user.phoenixSettings?.smsSettings?.maxSMSPerDay || 
                        defaultLimit;

      // Count today's actions
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todaysActions = await ButlerAction.countDocuments({
        userId: req.user.id,
        actionType,
        createdAt: { $gte: today }
      });

      // Check if limit reached
      if (todaysActions >= dailyLimit) {
        return res.status(429).json({
          success: false,
          error: 'Daily limit reached',
          message: `You've reached your daily limit of ${dailyLimit} ${actionType}s. Try again tomorrow.`,
          dailyLimit,
          used: todaysActions,
          resetsAt: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
        });
      }

      // Attach limit info to request
      req.limitInfo = {
        dailyLimit,
        used: todaysActions,
        remaining: dailyLimit - todaysActions
      };

      next();

    } catch (error) {
      console.error('Daily limit check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check daily limit',
        message: error.message
      });
    }
  };
};

/**
 * Track action for analytics and billing
 */
exports.trackAction = async (req, res, next) => {
  // Store original json function
  const originalJson = res.json.bind(res);

  // Override json function to track after response
  res.json = function(data) {
    // Send response first
    originalJson(data);

    // Track action asynchronously (don't block response)
    if (data.success && req.budgetInfo) {
      setImmediate(async () => {
        try {
          // Log action for analytics
          console.log(`📊 Action tracked: ${req.path} - Cost: $${req.budgetInfo.estimatedCost.toFixed(4)}`);
          
          // You could save to analytics database here
          // await Analytics.create({ ... });
          
        } catch (error) {
          console.error('Action tracking error:', error);
        }
      });
    }
  };

  next();
};

/**
 * Middleware to attach budget summary to response
 * Useful for endpoints that want to show budget info
 */
exports.attachBudgetInfo = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('phoenixSettings');
    
    if (user?.phoenixSettings?.callBudget) {
      const budget = user.phoenixSettings.callBudget;
      const remaining = budget.monthlyLimit - (budget.currentSpent || 0);
      
      // Attach to response locals
      res.locals.budget = {
        enabled: budget.enabled,
        monthlyLimit: budget.monthlyLimit,
        currentSpent: budget.currentSpent || 0,
        remaining,
        percentageUsed: ((budget.currentSpent || 0) / budget.monthlyLimit * 100).toFixed(1),
        resetDate: budget.resetDate
      };
    }

    next();

  } catch (error) {
    console.error('Attach budget info error:', error);
    // Don't block request if this fails
    next();
  }
};

/**
 * Validate budget settings before updating
 */
exports.validateBudgetSettings = (req, res, next) => {
  const { monthlyLimit, alertThreshold, autoRecharge } = req.body;

  // Validate monthly limit
  if (monthlyLimit !== undefined) {
    if (typeof monthlyLimit !== 'number' || monthlyLimit < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid monthly limit',
        message: 'Monthly limit must be a positive number'
      });
    }
    
    if (monthlyLimit > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Monthly limit too high',
        message: 'Monthly limit cannot exceed $1000 for safety. Contact support for higher limits.'
      });
    }
  }

  // Validate alert threshold
  if (alertThreshold !== undefined) {
    if (typeof alertThreshold !== 'number' || alertThreshold < 0 || alertThreshold > 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid alert threshold',
        message: 'Alert threshold must be between 0 and 1 (e.g., 0.20 for 20%)'
      });
    }
  }

  // Validate auto-recharge settings
  if (autoRecharge) {
    if (autoRecharge.amount && (typeof autoRecharge.amount !== 'number' || autoRecharge.amount < 5)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid auto-recharge amount',
        message: 'Auto-recharge amount must be at least $5'
      });
    }
    
    if (autoRecharge.trigger && (typeof autoRecharge.trigger !== 'number' || autoRecharge.trigger < 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid auto-recharge trigger',
        message: 'Auto-recharge trigger must be a positive number'
      });
    }
  }

  next();
};

/**
 * Reset monthly budget (run this as a cron job monthly)
 */
exports.resetMonthlyBudgets = async () => {
  try {
    const now = new Date();
    
    // Find all users with budgets that need resetting
    const result = await User.updateMany(
      {
        'phoenixSettings.callBudget.enabled': true,
        'phoenixSettings.callBudget.resetDate': { $lte: now }
      },
      {
        $set: {
          'phoenixSettings.callBudget.currentSpent': 0,
          'phoenixSettings.callBudget.resetDate': new Date(now.setMonth(now.getMonth() + 1))
        }
      }
    );

    console.log(`✅ Reset budgets for ${result.modifiedCount} users`);
    return result;

  } catch (error) {
    console.error('Reset monthly budgets error:', error);
    throw error;
  }
};
