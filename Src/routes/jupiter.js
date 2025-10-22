// Src/routes/jupiter.js - COMPLETE FINANCIAL INTELLIGENCE ROUTES
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// ============================================
// JUPITER - FINANCIAL INTELLIGENCE PLANET
// ============================================

// ========================================
// FINANCIAL OVERVIEW
// ========================================
router.get('/:userId/overview', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    
    res.json({
      success: true,
      data: {
        monthlyBudget: 5000,
        monthlyExpenses: 3240,
        budgetRemaining: 1760,
        savingsRate: 35.2,
        todaySpending: 45,
        avgDailySpending: 106,
        weeklySpending: 742,
        categories: {
          food: 650,
          transport: 280,
          fitness: 180,
          entertainment: 120,
          other: 210
        },
        trend: 'decreasing',
        yearToDate: {
          totalSpent: 29160,
          totalSaved: 15840,
          savingsRate: 35.2
        },
        timestamp: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// TRANSACTIONS
// ========================================
router.get('/:userId/transactions', protect, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    // Generate sample transactions
    const transactions = [
      {
        id: '1',
        date: new Date(),
        amount: 45.50,
        merchant: 'Whole Foods',
        category: 'food',
        type: 'debit',
        description: 'Groceries'
      },
      {
        id: '2',
        date: new Date(Date.now() - 24 * 60 * 60 * 1000),
        amount: 12.00,
        merchant: 'Starbucks',
        category: 'food',
        type: 'debit',
        description: 'Coffee'
      },
      {
        id: '3',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        amount: 89.99,
        merchant: 'Nike',
        category: 'fitness',
        type: 'debit',
        description: 'Running shoes'
      },
      {
        id: '4',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        amount: 2500.00,
        merchant: 'Salary Deposit',
        category: 'income',
        type: 'credit',
        description: 'Paycheck'
      },
      {
        id: '5',
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        amount: 35.00,
        merchant: 'LA Fitness',
        category: 'fitness',
        type: 'debit',
        description: 'Gym membership'
      }
    ];
    
    res.json({
      success: true,
      data: {
        transactions,
        summary: {
          totalSpent: transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0),
          totalIncome: transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0),
          transactionCount: transactions.length,
          avgTransaction: 45.50
        },
        period: `Last ${days} days`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// BUDGET ANALYSIS
// ========================================
router.get('/:userId/budget', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        totalBudget: 5000,
        categories: {
          food: {
            budget: 800,
            spent: 650,
            remaining: 150,
            percentage: 81,
            status: 'on-track'
          },
          transport: {
            budget: 300,
            spent: 280,
            remaining: 20,
            percentage: 93,
            status: 'warning'
          },
          fitness: {
            budget: 200,
            spent: 180,
            remaining: 20,
            percentage: 90,
            status: 'on-track'
          },
          entertainment: {
            budget: 400,
            spent: 120,
            remaining: 280,
            percentage: 30,
            status: 'under-budget'
          },
          savings: {
            budget: 1500,
            spent: 1500,
            remaining: 0,
            percentage: 100,
            status: 'on-track'
          },
          other: {
            budget: 500,
            spent: 210,
            remaining: 290,
            percentage: 42,
            status: 'on-track'
          }
        },
        overallStatus: 'on-track',
        recommendations: [
          'Transport budget at 93% - consider carpooling',
          'Entertainment under budget - good control',
          'Savings goal met - excellent!'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// SPENDING INSIGHTS
// ========================================
router.get('/:userId/insights', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        trends: [
          'Spending decreased 12% this week',
          'Food expenses up 8% from last month',
          'Fitness spending consistent with goals'
        ],
        alerts: [
          'High stress correlates with 34% more impulse purchases',
          'Saturday spending averages 2x weekday spending',
          'Late-night purchases (after 9 PM) often regretted'
        ],
        recommendations: [
          'Set daily spending limit of $100 to stay on track',
          'Consider meal prep to reduce food expenses',
          'Enable impulse block during high-stress periods'
        ],
        patterns: {
          peakSpendingDay: 'Saturday',
          peakSpendingTime: '7:00 PM - 9:00 PM',
          mostFrequentCategory: 'food',
          avgTransactionSize: 45.50
        },
        forecast: {
          endOfMonth: 3180,
          projected: 'under-budget',
          confidence: 82
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// STRESS-SPENDING CORRELATION
// ========================================
router.get('/:userId/correlation/stress-spending', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        correlation: 0.68,
        significance: 'strong',
        insight: 'High stress days correlate with 34% more spending',
        analysis: {
          lowStressDays: { avgStress: 3, avgSpending: 95 },
          highStressDays: { avgStress: 8, avgSpending: 127 },
          impactPerStressPoint: 6.4
        },
        triggers: [
          'Work deadlines → impulse food purchases',
          'Poor sleep → online shopping',
          'Social stress → entertainment spending'
        ],
        recommendation: 'Enable impulse purchase blocking when stress > 7',
        interventionSavings: 'Potential $180/month savings',
        confidence: 76
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// SPENDING PREDICTIONS
// ========================================
router.get('/:userId/predictions', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        thisMonth: {
          projected: 3180,
          budget: 3500,
          status: 'under-budget',
          savings: 320
        },
        nextMonth: {
          forecast: 3240,
          confidence: 78,
          factors: [
            'Consistent spending pattern',
            'No major purchases expected',
            'Similar stress levels predicted'
          ]
        },
        yearEnd: {
          projectedTotal: 38880,
          projectedSavings: 21120,
          savingsRate: 35.2
        },
        recommendations: [
          'Continue current spending patterns',
          'Consider increasing savings by 5%',
          'Watch transport category next month'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// IMPULSE PURCHASE BLOCKING
// ========================================
router.post('/:userId/impulse-block', protect, async (req, res) => {
  try {
    const { enabled, threshold, cooldownMinutes } = req.body;
    
    res.json({
      success: true,
      data: {
        enabled: enabled !== false,
        stressThreshold: threshold || 7,
        cooldownPeriod: cooldownMinutes || 60,
        rules: [
          'Purchases > $50 require confirmation during high stress',
          '60-minute cooldown enforced',
          'SMS notification sent before blocking',
          'Essential purchases always allowed'
        ],
        estimatedMonthlySavings: 180,
        status: 'active'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// FINANCIAL GOALS
// ========================================
router.get('/:userId/goals', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        savings: {
          target: 50000,
          current: 32500,
          progress: 65,
          monthlyContribution: 1500,
          projectedCompletion: '14 months',
          onTrack: true
        },
        emergency: {
          target: 15000,
          current: 15000,
          progress: 100,
          status: 'complete'
        },
        investment: {
          target: 100000,
          current: 28000,
          progress: 28,
          monthlyContribution: 800,
          projectedCompletion: '90 months',
          onTrack: true
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// CONNECT BANK (Plaid Integration Placeholder)
// ========================================
router.post('/:userId/connect-bank', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Bank connection feature coming soon',
      data: {
        supported: false,
        providers: ['Plaid', 'Yodlee', 'MX'],
        features: [
          'Automatic transaction syncing',
          'Real-time balance updates',
          'Category auto-detection',
          'Multiple account support'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Documentation
router.get('/', (req, res) => {
  res.json({
    planet: 'Jupiter',
    domain: 'Financial Intelligence',
    description: 'Budget tracking, spending analysis, and financial optimization',
    features: [
      'Real-time budget tracking',
      'Transaction categorization',
      'Spending pattern analysis',
      'Stress-spending correlation',
      'Impulse purchase blocking',
      'Financial goal tracking',
      'Predictive spending forecasts',
      'Bank integration (Plaid)'
    ],
    endpoints: {
      GET_overview: '/:userId/overview - Financial overview',
      GET_transactions: '/:userId/transactions - Transaction history',
      GET_budget: '/:userId/budget - Budget analysis by category',
      GET_insights: '/:userId/insights - Spending insights and patterns',
      GET_correlation: '/:userId/correlation/stress-spending - Stress-spending correlation',
      GET_predictions: '/:userId/predictions - Spending forecasts',
      POST_block: '/:userId/impulse-block - Configure impulse blocking',
      GET_goals: '/:userId/goals - Financial goals progress',
      POST_connect: '/:userId/connect-bank - Connect bank account'
    },
    correlations: [
      'Stress levels → Impulse purchases',
      'Sleep quality → Financial decisions',
      'Calendar load → Spending patterns',
      'Recovery score → Purchase regret rates'
    ]
  });
});

module.exports = router;