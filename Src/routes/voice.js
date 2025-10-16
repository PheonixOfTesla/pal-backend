// Src/routes/voice.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const realtimeVoiceService = require('../services/realtimeVoiceService');
const CompanionConversation = require('../models/CompanionConversation');

/**
 * @route   GET /api/voice/status
 * @desc    Check if voice service is available
 * @access  Public
 */
router.get('/status', (req, res) => {
  try {
    const isConfigured = realtimeVoiceService.validateApiKey();
    const voiceOptions = realtimeVoiceService.getVoiceOptions();
    const costs = realtimeVoiceService.getEstimatedCost();

    res.json({
      available: isConfigured,
      service: 'OpenAI Realtime API',
      voiceOptions,
      estimatedCosts: costs,
      features: [
        'Real-time voice conversations',
        'Natural interruptions',
        'Sub-second latency',
        'Voice Activity Detection',
        'Automatic transcription'
      ]
    });
  } catch (error) {
    console.error('Error checking voice status:', error);
    res.status(500).json({
      available: false,
      error: 'Failed to check voice service status'
    });
  }
});

/**
 * @route   GET /api/voice/history/:userId
 * @desc    Get voice conversation history
 * @access  Private
 */
router.get('/history/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    // Verify user authorization
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const conversations = await CompanionConversation.find({ userId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await CompanionConversation.countDocuments({ userId });

    res.json({
      conversations,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > parseInt(skip) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching voice history:', error);
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

/**
 * @route   DELETE /api/voice/history/:userId
 * @desc    Clear voice conversation history
 * @access  Private
 */
router.delete('/history/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user authorization
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await CompanionConversation.deleteMany({ userId });

    res.json({
      message: 'Conversation history cleared',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ error: 'Failed to clear conversation history' });
  }
});

/**
 * @route   GET /api/voice/stats/:userId
 * @desc    Get voice usage statistics
 * @access  Private
 */
router.get('/stats/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user authorization
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const totalConversations = await CompanionConversation.countDocuments({ userId });
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentConversations = await CompanionConversation.countDocuments({
      userId,
      timestamp: { $gte: thirtyDaysAgo }
    });

    // Get average messages per day
    const messagesPerDay = await CompanionConversation.aggregate([
      {
        $match: {
          userId,
          timestamp: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          avgPerDay: { $avg: '$count' }
        }
      }
    ]);

    // Get most active days
    const activeByDay = await CompanionConversation.aggregate([
      {
        $match: {
          userId,
          timestamp: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: '$timestamp' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mostActiveDays = activeByDay.map(day => ({
      day: dayNames[day._id - 1],
      conversations: day.count
    }));

    res.json({
      totalConversations,
      last30Days: recentConversations,
      averagePerDay: messagesPerDay[0]?.avgPerDay || 0,
      mostActiveDays,
      estimatedCost: {
        last30Days: (recentConversations * 0.30).toFixed(2), // Rough estimate
        perMessage: 0.30,
        currency: 'USD'
      }
    });
  } catch (error) {
    console.error('Error fetching voice stats:', error);
    res.status(500).json({ error: 'Failed to fetch voice statistics' });
  }
});

/**
 * @route   POST /api/voice/feedback/:conversationId
 * @desc    Submit feedback on a voice conversation
 * @access  Private
 */
router.post('/feedback/:conversationId', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { rating, feedback } = req.body;

    const conversation = await CompanionConversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    conversation.feedback = {
      rating,
      comment: feedback,
      submittedAt: new Date()
    };

    await conversation.save();

    res.json({
      message: 'Feedback submitted',
      conversation
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

/**
 * @route   GET /api/voice/cost-estimate
 * @desc    Get cost estimates for voice usage
 * @access  Public
 */
router.get('/cost-estimate', (req, res) => {
  const costs = realtimeVoiceService.getEstimatedCost();
  
  const scenarios = [
    {
      usage: '5 min/day',
      daily: (5 * costs.total).toFixed(2),
      monthly: (5 * costs.total * 30).toFixed(2),
      description: 'Light user - quick check-ins'
    },
    {
      usage: '15 min/day',
      daily: (15 * costs.total).toFixed(2),
      monthly: (15 * costs.total * 30).toFixed(2),
      description: 'Regular user - daily conversations'
    },
    {
      usage: '30 min/day',
      daily: (30 * costs.total).toFixed(2),
      monthly: (30 * costs.total * 30).toFixed(2),
      description: 'Heavy user - extended coaching sessions'
    }
  ];

  res.json({
    baseCosts: costs,
    scenarios,
    tips: [
      'Voice conversations are charged per minute of audio',
      'Pausing conversation stops the meter',
      'Text chat is much cheaper for simple questions',
      'Voice is best for coaching and complex discussions'
    ]
  });
});

module.exports = router;
