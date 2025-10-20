// Src/routes/voice.js - OpenAI TTS Integration
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const CompanionConversation = require('../models/CompanionConversation');

/**
 * @route   POST /api/voice/speak
 * @desc    Convert text to speech using OpenAI TTS HD
 * @access  Private
 */
router.post('/speak', auth, async (req, res) => {
  try {
    const { text, voice = 'nova', speed = 1.0 } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (text.length > 4096) {
      return res.status(400).json({ error: 'Text too long (max 4096 characters)' });
    }

    // Validate voice option
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (!validVoices.includes(voice)) {
      return res.status(400).json({ 
        error: 'Invalid voice',
        validVoices 
      });
    }

    // Validate speed
    if (speed < 0.25 || speed > 4.0) {
      return res.status(400).json({ error: 'Speed must be between 0.25 and 4.0' });
    }

    console.log(`[TTS] Generating speech for user ${req.user.id}: ${text.substring(0, 50)}...`);

    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1-hd', // High quality voice
        input: text,
        voice: voice,
        speed: speed
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[TTS] OpenAI API Error:', error);
      return res.status(response.status).json({ 
        error: 'Failed to generate speech',
        details: error 
      });
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Log usage for tracking
    console.log(`[TTS] Generated ${audioBuffer.byteLength} bytes, ~${text.length} chars, voice: ${voice}`);

    // Send audio back as MP3
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.byteLength,
      'Cache-Control': 'no-cache'
    });
    
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('[TTS] Error:', error);
    res.status(500).json({ 
      error: 'Failed to generate speech',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/voice/voices
 * @desc    Get available TTS voices with samples
 * @access  Public
 */
router.get('/voices', (req, res) => {
  const voices = [
    {
      id: 'alloy',
      name: 'Alloy',
      description: 'Neutral and balanced',
      gender: 'neutral',
      recommended: false
    },
    {
      id: 'echo',
      name: 'Echo',
      description: 'Male, calm and soothing',
      gender: 'male',
      recommended: false
    },
    {
      id: 'fable',
      name: 'Fable',
      description: 'British accent, warm (JARVIS-like)',
      gender: 'male',
      recommended: true
    },
    {
      id: 'onyx',
      name: 'Onyx',
      description: 'Deep male voice, authoritative',
      gender: 'male',
      recommended: false
    },
    {
      id: 'nova',
      name: 'Nova',
      description: 'Female, energetic and friendly',
      gender: 'female',
      recommended: true
    },
    {
      id: 'shimmer',
      name: 'Shimmer',
      description: 'Female, soft and gentle',
      gender: 'female',
      recommended: false
    }
  ];

  res.json({
    voices,
    sampleText: 'Hello, I am Phoenix, your AI companion.',
    defaultVoice: 'nova',
    pricing: {
      model: 'tts-1-hd',
      costPer1MChars: 30,
      currency: 'USD'
    }
  });
});

/**
 * @route   GET /api/voice/status
 * @desc    Check if voice service is available
 * @access  Public
 */
router.get('/status', (req, res) => {
  try {
    const isConfigured = !!process.env.OPENAI_API_KEY;

    res.json({
      available: isConfigured,
      service: 'OpenAI TTS HD',
      features: [
        'Natural human-like voices',
        '6 voice options',
        'Adjustable speed (0.25x - 4.0x)',
        'High-quality audio (HD)',
        'Multiple languages supported'
      ],
      pricing: {
        model: 'tts-1-hd',
        costPer1MChars: 30,
        estimatedCostPerResponse: 0.0075 // ~250 chars avg
      }
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

    res.json({
      totalConversations,
      last30Days: recentConversations,
      averagePerDay: messagesPerDay[0]?.avgPerDay || 0,
      estimatedCost: {
        last30Days: (recentConversations * 0.0075).toFixed(4), // ~250 chars per response
        perMessage: 0.0075,
        currency: 'USD',
        note: 'Based on ~250 characters per response with TTS-1-HD'
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
 * @desc    Get cost estimates for TTS usage
 * @access  Public
 */
router.get('/cost-estimate', (req, res) => {
  const avgCharsPerResponse = 250;
  const costPer1MChars = 30; // USD
  const costPerChar = costPer1MChars / 1000000;
  const costPerResponse = avgCharsPerResponse * costPerChar;

  const scenarios = [
    {
      usage: '10 responses/day',
      daily: (10 * costPerResponse).toFixed(4),
      monthly: (10 * costPerResponse * 30).toFixed(2),
      description: 'Light user - quick check-ins'
    },
    {
      usage: '30 responses/day',
      daily: (30 * costPerResponse).toFixed(4),
      monthly: (30 * costPerResponse * 30).toFixed(2),
      description: 'Regular user - daily conversations'
    },
    {
      usage: '100 responses/day',
      daily: (100 * costPerResponse).toFixed(4),
      monthly: (100 * costPerResponse * 30).toFixed(2),
      description: 'Heavy user - extended usage'
    }
  ];

  res.json({
    model: 'tts-1-hd',
    baseCosts: {
      per1MChars: costPer1MChars,
      perChar: costPerChar,
      perResponse: costPerResponse,
      avgResponseLength: avgCharsPerResponse
    },
    scenarios,
    tips: [
      'TTS charges by character count, not audio length',
      'Shorter responses = lower costs',
      'HD quality (tts-1-hd) costs 2x standard but sounds much better',
      'Average cost per response: less than $0.01'
    ]
  });
});

module.exports = router;
