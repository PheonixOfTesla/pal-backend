// ============================================
// PHOENIX CONTROLLER - AI Butler & Intelligence System
// ============================================
// Total Methods: 76
// Systems: AI Companion, Correlation Engine, Predictions, 
//          Interventions, Intelligence, Voice AI, ML Training, Butler Actions
// ============================================

const CompanionConversation = require('../models/CompanionConversation');
const CorrelationPattern = require('../models/CorrelationPattern');
const Prediction = require('../models/Prediction');
const Intervention = require('../models/Intervention');
const BehaviorPattern = require('../models/BehaviorPattern');
const User = require('../models/User');

// Services
const companionAI = require('../services/phoenix/companionAI');
const correlationEngine = require('../services/phoenix/correlationEngine');
const predictionEngine = require('../services/phoenix/predictionEngine');
const interventionEngine = require('../services/phoenix/interventionEngine');
const voiceAgent = require('../services/phoenix/voiceAgent');
const butlerAutomation = require('../services/phoenix/butlerAutomation');
const phoneAgent = require('../services/phoenix/phoneAgent');
const emailAgent = require('../services/phoenix/emailAgent');
const realtimeMonitor = require('../services/phoenix/realtimeMonitor');
const mlTrainingOrchestrator = require('../services/phoenix/mlTrainingOrchestrator');

// ========================================
// A. AI COMPANION (6 methods)
// ========================================

/**
 * @desc    Chat with Phoenix AI companion
 * @route   POST /api/phoenix/companion/chat
 * @access  Private
 */
exports.chat = async (req, res) => {
  try {
    const { message, includeContext = true } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }

    // Get conversation history
    const history = await CompanionConversation.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);

    // Build context from user's data if requested
    let context = {};
    if (includeContext) {
      context = await companionAI.buildUserContext(req.user.id);
    }

    // Generate AI response
    const response = await companionAI.generateResponse(
      message,
      history.reverse(),
      context
    );

    // Save user message
    await CompanionConversation.create({
      userId: req.user.id,
      role: 'user',
      message: message.trim(),
      context: {
        wearable: context.hasWearableData || false,
        workouts: context.recentWorkouts || 0,
        goals: context.activeGoals || 0,
        recovery: context.recoveryScore || null,
        mood: req.body.mood || null,
        timestamp: new Date()
      }
    });

    // Save assistant response
    await CompanionConversation.create({
      userId: req.user.id,
      role: 'assistant',
      message: response.message,
      context: {
        timestamp: new Date()
      }
    });

    res.status(200).json({
      success: true,
      data: {
        message: response.message,
        context: response.contextUsed,
        suggestions: response.suggestions || []
      }
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process chat message' 
    });
  }
};

/**
 * @desc    Get conversation history
 * @route   GET /api/phoenix/companion/history
 * @access  Private
 */
exports.getHistory = async (req, res) => {
  try {
    const { limit = 50, days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const history = await CompanionConversation.find({
      userId: req.user.id,
      createdAt: { $gte: startDate }
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      count: history.length,
      data: history.reverse()
    });

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve conversation history' 
    });
  }
};

/**
 * @desc    Clear conversation history
 * @route   DELETE /api/phoenix/companion/history
 * @access  Private
 */
exports.clearHistory = async (req, res) => {
  try {
    const { olderThan } = req.query;

    let query = { userId: req.user.id };
    
    if (olderThan) {
      const date = new Date();
      date.setDate(date.getDate() - parseInt(olderThan));
      query.createdAt = { $lt: date };
    }

    const result = await CompanionConversation.deleteMany(query);

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} conversations`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear conversation history' 
    });
  }
};

/**
 * @desc    Get current context
 * @route   GET /api/phoenix/companion/context
 * @access  Private
 */
exports.getContext = async (req, res) => {
  try {
    const context = await companionAI.buildUserContext(req.user.id);

    res.status(200).json({
      success: true,
      data: context
    });

  } catch (error) {
    console.error('Get context error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve context' 
    });
  }
};

/**
 * @desc    Get companion personality settings
 * @route   GET /api/phoenix/companion/personality
 * @access  Private
 */
exports.getPersonality = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('phoenixPersonality');

    const personality = user.phoenixPersonality || {
      style: 'professional', // professional, casual, motivational, humorous
      formality: 'balanced', // formal, balanced, casual
      verbosity: 'concise', // brief, concise, detailed
      tone: 'supportive', // supportive, direct, challenging
      proactivity: 'medium' // low, medium, high
    };

    res.status(200).json({
      success: true,
      data: personality
    });

  } catch (error) {
    console.error('Get personality error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve personality settings' 
    });
  }
};

/**
 * @desc    Update companion personality settings
 * @route   PUT /api/phoenix/companion/personality
 * @access  Private
 */
exports.updatePersonality = async (req, res) => {
  try {
    const { style, formality, verbosity, tone, proactivity } = req.body;

    const personality = {};
    if (style) personality.style = style;
    if (formality) personality.formality = formality;
    if (verbosity) personality.verbosity = verbosity;
    if (tone) personality.tone = tone;
    if (proactivity) personality.proactivity = proactivity;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { phoenixPersonality: personality },
      { new: true }
    ).select('phoenixPersonality');

    res.status(200).json({
      success: true,
      data: user.phoenixPersonality
    });

  } catch (error) {
    console.error('Update personality error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update personality settings' 
    });
  }
};

// ========================================
// B. CORRELATION ENGINE (6 methods)
// ========================================

/**
 * @desc    Get all discovered patterns
 * @route   GET /api/phoenix/patterns
 * @access  Private
 */
exports.getPatterns = async (req, res) => {
  try {
    const { type, active = 'true' } = req.query;

    const query = { userId: req.user.id };
    if (type) query.patternType = type;
    if (active === 'true') query.isActive = true;

    const patterns = await CorrelationPattern.find(query)
      .sort({ 'correlation.strength': -1 });

    res.status(200).json({
      success: true,
      count: patterns.length,
      data: patterns
    });

  } catch (error) {
    console.error('Get patterns error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve patterns' 
    });
  }
};

/**
 * @desc    Trigger pattern analysis
 * @route   POST /api/phoenix/patterns/analyze
 * @access  Private
 */
exports.analyzePatterns = async (req, res) => {
  try {
    const { domains = ['all'], minConfidence = 70 } = req.body;

    // Trigger correlation analysis
    const analysis = await correlationEngine.analyzeUser(
      req.user.id,
      domains,
      minConfidence
    );

    res.status(200).json({
      success: true,
      data: {
        patternsFound: analysis.patterns.length,
        patterns: analysis.patterns,
        insights: analysis.insights,
        recommendations: analysis.recommendations
      }
    });

  } catch (error) {
    console.error('Analyze patterns error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze patterns' 
    });
  }
};

/**
 * @desc    Get real-time pattern monitoring
 * @route   GET /api/phoenix/patterns/realtime
 * @access  Private
 */
exports.getRealtimePatterns = async (req, res) => {
  try {
    const realtimeData = await realtimeMonitor.getCurrentPatterns(req.user.id);

    res.status(200).json({
      success: true,
      data: realtimeData
    });

  } catch (error) {
    console.error('Get realtime patterns error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve real-time patterns' 
    });
  }
};

/**
 * @desc    Validate a pattern
 * @route   PUT /api/phoenix/patterns/:id/validate
 * @access  Private
 */
exports.validatePattern = async (req, res) => {
  try {
    const { isValid, feedback } = req.body;

    const pattern = await CorrelationPattern.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!pattern) {
      return res.status(404).json({ 
        success: false, 
        error: 'Pattern not found' 
      });
    }

    pattern.isActive = isValid;
    pattern.lastValidated = new Date();
    if (feedback) {
      pattern.userFeedback = feedback;
    }

    await pattern.save();

    res.status(200).json({
      success: true,
      data: pattern
    });

  } catch (error) {
    console.error('Validate pattern error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to validate pattern' 
    });
  }
};

/**
 * @desc    Delete a pattern
 * @route   DELETE /api/phoenix/patterns/:id
 * @access  Private
 */
exports.deletePattern = async (req, res) => {
  try {
    const pattern = await CorrelationPattern.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!pattern) {
      return res.status(404).json({ 
        success: false, 
        error: 'Pattern not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Pattern deleted successfully'
    });

  } catch (error) {
    console.error('Delete pattern error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete pattern' 
    });
  }
};

/**
 * @desc    Get AI-generated insights
 * @route   GET /api/phoenix/insights
 * @access  Private
 */
exports.getInsights = async (req, res) => {
  try {
    const insights = await correlationEngine.generateInsights(req.user.id);

    res.status(200).json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve insights' 
    });
  }
};

// ========================================
// C. PREDICTION ENGINE (10 methods)
// ========================================

/**
 * @desc    Get all predictions
 * @route   GET /api/phoenix/predictions
 * @access  Private
 */
exports.getPredictions = async (req, res) => {
  try {
    const { type, status } = req.query;

    const query = { userId: req.user.id };
    if (type) query.predictionType = type;
    if (status) query.status = status;

    const predictions = await Prediction.find(query)
      .sort({ predictionDate: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      count: predictions.length,
      data: predictions
    });

  } catch (error) {
    console.error('Get predictions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve predictions' 
    });
  }
};

/**
 * @desc    Get active predictions
 * @route   GET /api/phoenix/predictions/active
 * @access  Private
 */
exports.getActivePredictions = async (req, res) => {
  try {
    const predictions = await Prediction.find({
      userId: req.user.id,
      status: 'active',
      predictionDate: { $gte: new Date() }
    }).sort({ predictionDate: 1 });

    res.status(200).json({
      success: true,
      count: predictions.length,
      data: predictions
    });

  } catch (error) {
    console.error('Get active predictions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve active predictions' 
    });
  }
};

/**
 * @desc    Get prediction by ID
 * @route   GET /api/phoenix/predictions/:id
 * @access  Private
 */
exports.getPredictionById = async (req, res) => {
  try {
    const prediction = await Prediction.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!prediction) {
      return res.status(404).json({ 
        success: false, 
        error: 'Prediction not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: prediction
    });

  } catch (error) {
    console.error('Get prediction error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve prediction' 
    });
  }
};

/**
 * @desc    Request a specific prediction
 * @route   POST /api/phoenix/predictions/request/:type
 * @access  Private
 */
exports.requestPrediction = async (req, res) => {
  try {
    const { type } = req.params;
    const { horizon = 7, confidence = 70 } = req.body;

    const validTypes = [
      'illness', 'injury', 'performance', 'recovery', 
      'goal_success', 'energy', 'burnout', 'weight_change'
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid prediction type' 
      });
    }

    const prediction = await predictionEngine.generatePrediction(
      req.user.id,
      type,
      horizon,
      confidence
    );

    res.status(201).json({
      success: true,
      data: prediction
    });

  } catch (error) {
    console.error('Request prediction error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate prediction' 
    });
  }
};

/**
 * @desc    Record prediction outcome
 * @route   PUT /api/phoenix/predictions/:id/outcome
 * @access  Private
 */
exports.recordOutcome = async (req, res) => {
  try {
    const { actualValue, notes } = req.body;

    const prediction = await Prediction.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!prediction) {
      return res.status(404).json({ 
        success: false, 
        error: 'Prediction not found' 
      });
    }

    prediction.actualValue = actualValue;
    prediction.status = 'completed';
    prediction.accuracy = predictionEngine.calculateAccuracy(
      prediction.predictedValue,
      actualValue
    );
    if (notes) prediction.notes = notes;

    await prediction.save();

    // Update ML model with feedback
    await mlTrainingOrchestrator.recordPredictionFeedback(
      prediction._id,
      prediction.accuracy
    );

    res.status(200).json({
      success: true,
      data: prediction
    });

  } catch (error) {
    console.error('Record outcome error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to record outcome' 
    });
  }
};

/**
 * @desc    Get prediction accuracy stats
 * @route   GET /api/phoenix/predictions/accuracy
 * @access  Private
 */
exports.getPredictionAccuracy = async (req, res) => {
  try {
    const { type, days = 90 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const query = {
      userId: req.user.id,
      status: 'completed',
      createdAt: { $gte: startDate }
    };
    if (type) query.predictionType = type;

    const predictions = await Prediction.find(query);

    const stats = predictionEngine.calculateAccuracyStats(predictions);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get accuracy error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve accuracy stats' 
    });
  }
};

/**
 * @desc    Get forecast for next 7-30 days
 * @route   GET /api/phoenix/predictions/forecast
 * @access  Private
 */
exports.getForecast = async (req, res) => {
  try {
    const { metrics = 'recovery,energy,performance', days = 7 } = req.query;

    const forecast = await predictionEngine.generateForecast(
      req.user.id,
      metrics.split(','),
      parseInt(days)
    );

    res.status(200).json({
      success: true,
      data: forecast
    });

  } catch (error) {
    console.error('Get forecast error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate forecast' 
    });
  }
};

/**
 * @desc    Get optimal performance window
 * @route   GET /api/phoenix/predictions/optimal-window
 * @access  Private
 */
exports.getOptimalWindow = async (req, res) => {
  try {
    const { activity = 'workout', days = 7 } = req.query;

    const window = await predictionEngine.findOptimalWindow(
      req.user.id,
      activity,
      parseInt(days)
    );

    res.status(200).json({
      success: true,
      data: window
    });

  } catch (error) {
    console.error('Get optimal window error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to find optimal window' 
    });
  }
};

/**
 * @desc    Get burnout risk assessment
 * @route   GET /api/phoenix/predictions/burnout-risk
 * @access  Private
 */
exports.getBurnoutRisk = async (req, res) => {
  try {
    const risk = await predictionEngine.assessBurnoutRisk(req.user.id);

    res.status(200).json({
      success: true,
      data: risk
    });

  } catch (error) {
    console.error('Get burnout risk error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to assess burnout risk' 
    });
  }
};

/**
 * @desc    Get weight change prediction
 * @route   GET /api/phoenix/predictions/weight-change
 * @access  Private
 */
exports.getWeightPrediction = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const prediction = await predictionEngine.predictWeightChange(
      req.user.id,
      parseInt(days)
    );

    res.status(200).json({
      success: true,
      data: prediction
    });

  } catch (error) {
    console.error('Get weight prediction error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to predict weight change' 
    });
  }
};

// ========================================
// D. INTERVENTION ENGINE (9 methods)
// ========================================

/**
 * @desc    Get all interventions
 * @route   GET /api/phoenix/interventions
 * @access  Private
 */
exports.getInterventions = async (req, res) => {
  try {
    const { type, status, days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const query = { 
      userId: req.user.id,
      createdAt: { $gte: startDate }
    };
    if (type) query.interventionType = type;
    if (status) query.status = status;

    const interventions = await Intervention.find(query)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: interventions.length,
      data: interventions
    });

  } catch (error) {
    console.error('Get interventions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve interventions' 
    });
  }
};

/**
 * @desc    Get active interventions
 * @route   GET /api/phoenix/interventions/active
 * @access  Private
 */
exports.getActiveInterventions = async (req, res) => {
  try {
    const interventions = await Intervention.find({
      userId: req.user.id,
      status: 'active'
    }).sort({ severity: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: interventions.length,
      data: interventions
    });

  } catch (error) {
    console.error('Get active interventions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve active interventions' 
    });
  }
};

/**
 * @desc    Get pending interventions
 * @route   GET /api/phoenix/interventions/pending
 * @access  Private
 */
exports.getPendingInterventions = async (req, res) => {
  try {
    const interventions = await Intervention.find({
      userId: req.user.id,
      status: 'pending'
    }).sort({ severity: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: interventions.length,
      data: interventions
    });

  } catch (error) {
    console.error('Get pending interventions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve pending interventions' 
    });
  }
};

/**
 * @desc    Acknowledge intervention
 * @route   POST /api/phoenix/interventions/:id/acknowledge
 * @access  Private
 */
exports.acknowledgeIntervention = async (req, res) => {
  try {
    const { response = 'acknowledged' } = req.body;

    const intervention = await Intervention.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!intervention) {
      return res.status(404).json({ 
        success: false, 
        error: 'Intervention not found' 
      });
    }

    intervention.status = 'acknowledged';
    intervention.userResponse = response;
    intervention.acknowledgedAt = new Date();

    await intervention.save();

    res.status(200).json({
      success: true,
      data: intervention
    });

  } catch (error) {
    console.error('Acknowledge intervention error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to acknowledge intervention' 
    });
  }
};

/**
 * @desc    Record intervention outcome
 * @route   PUT /api/phoenix/interventions/:id/outcome
 * @access  Private
 */
exports.recordInterventionOutcome = async (req, res) => {
  try {
    const { successful, notes, metrics } = req.body;

    const intervention = await Intervention.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!intervention) {
      return res.status(404).json({ 
        success: false, 
        error: 'Intervention not found' 
      });
    }

    intervention.status = 'completed';
    intervention.successful = successful;
    intervention.completedAt = new Date();
    if (notes) intervention.outcomeNotes = notes;
    if (metrics) intervention.outcomeMetrics = metrics;

    await intervention.save();

    // Update ML model
    await mlTrainingOrchestrator.recordInterventionOutcome(
      intervention._id,
      successful
    );

    res.status(200).json({
      success: true,
      data: intervention
    });

  } catch (error) {
    console.error('Record outcome error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to record outcome' 
    });
  }
};

/**
 * @desc    Get intervention statistics
 * @route   GET /api/phoenix/interventions/stats
 * @access  Private
 */
exports.getInterventionStats = async (req, res) => {
  try {
    const { days = 90 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const interventions = await Intervention.find({
      userId: req.user.id,
      createdAt: { $gte: startDate }
    });

    const stats = interventionEngine.calculateStats(interventions);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve statistics' 
    });
  }
};

/**
 * @desc    Get intervention history
 * @route   GET /api/phoenix/interventions/history
 * @access  Private
 */
exports.getInterventionHistory = async (req, res) => {
  try {
    const { type, days = 90, limit = 100 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const query = {
      userId: req.user.id,
      createdAt: { $gte: startDate }
    };
    if (type) query.interventionType = type;

    const history = await Intervention.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve history' 
    });
  }
};

/**
 * @desc    Configure intervention settings
 * @route   POST /api/phoenix/interventions/settings
 * @access  Private
 */
exports.configureInterventionSettings = async (req, res) => {
  try {
    const { 
      enabled = true, 
      autoExecute = false,
      severityThreshold = 'medium',
      notificationPreferences = {}
    } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        interventionSettings: {
          enabled,
          autoExecute,
          severityThreshold,
          notificationPreferences
        }
      },
      { new: true }
    ).select('interventionSettings');

    res.status(200).json({
      success: true,
      data: user.interventionSettings
    });

  } catch (error) {
    console.error('Configure settings error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to configure settings' 
    });
  }
};

/**
 * @desc    Request manual intervention
 * @route   POST /api/phoenix/interventions/request
 * @access  Private
 */
exports.requestManualIntervention = async (req, res) => {
  try {
    const { type, reason, priority = 'medium' } = req.body;

    if (!type || !reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'Type and reason are required' 
      });
    }

    const intervention = await interventionEngine.createManualIntervention(
      req.user.id,
      type,
      reason,
      priority
    );

    res.status(201).json({
      success: true,
      data: intervention
    });

  } catch (error) {
    console.error('Request intervention error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to request intervention' 
    });
  }
};

// ========================================
// E. INTELLIGENCE ENGINE (8 methods)
// ========================================

/**
 * @desc    Get intelligence dashboard
 * @route   GET /api/phoenix/intelligence
 * @access  Private
 */
exports.getIntelligence = async (req, res) => {
  try {
    const intelligence = await companionAI.getIntelligenceDashboard(req.user.id);

    res.status(200).json({
      success: true,
      data: intelligence
    });

  } catch (error) {
    console.error('Get intelligence error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve intelligence data' 
    });
  }
};

/**
 * @desc    Trigger comprehensive analysis
 * @route   POST /api/phoenix/intelligence/analyze
 * @access  Private
 */
exports.triggerAnalysis = async (req, res) => {
  try {
    const { scope = 'all', depth = 'standard' } = req.body;

    const analysis = await companionAI.runComprehensiveAnalysis(
      req.user.id,
      scope,
      depth
    );

    res.status(200).json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Trigger analysis error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to run analysis' 
    });
  }
};

/**
 * @desc    Get AI insights
 * @route   GET /api/phoenix/intelligence/insights
 * @access  Private
 */
exports.getAIInsights = async (req, res) => {
  try {
    const { category, days = 7 } = req.query;

    const insights = await companionAI.generateInsights(
      req.user.id,
      category,
      parseInt(days)
    );

    res.status(200).json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('Get AI insights error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate insights' 
    });
  }
};

/**
 * @desc    Natural language query
 * @route   POST /api/phoenix/intelligence/query
 * @access  Private
 */
exports.naturalLanguageQuery = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query is required' 
      });
    }

    const response = await companionAI.processNaturalLanguageQuery(
      req.user.id,
      query.trim()
    );

    res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Natural language query error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process query' 
    });
  }
};

/**
 * @desc    Get daily summary
 * @route   GET /api/phoenix/intelligence/summary
 * @access  Private
 */
exports.getDailySummary = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();

    const summary = await companionAI.generateDailySummary(
      req.user.id,
      targetDate
    );

    res.status(200).json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Get daily summary error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate daily summary' 
    });
  }
};

/**
 * @desc    Get deep dive analysis
 * @route   POST /api/phoenix/intelligence/deep-dive
 * @access  Private
 */
exports.getDeepDive = async (req, res) => {
  try {
    const { topic, timeframe = '30d' } = req.body;

    if (!topic) {
      return res.status(400).json({ 
        success: false, 
        error: 'Topic is required' 
      });
    }

    const deepDive = await companionAI.performDeepDive(
      req.user.id,
      topic,
      timeframe
    );

    res.status(200).json({
      success: true,
      data: deepDive
    });

  } catch (error) {
    console.error('Deep dive error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to perform deep dive' 
    });
  }
};

/**
 * @desc    Get personalized recommendations
 * @route   GET /api/phoenix/intelligence/recommendations
 * @access  Private
 */
exports.getRecommendations = async (req, res) => {
  try {
    const { category = 'all', limit = 10 } = req.query;

    const recommendations = await companionAI.generateRecommendations(
      req.user.id,
      category,
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      count: recommendations.length,
      data: recommendations
    });

  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate recommendations' 
    });
  }
};

/**
 * @desc    Auto-optimize user settings
 * @route   POST /api/phoenix/intelligence/auto-optimize
 * @access  Private
 */
exports.autoOptimize = async (req, res) => {
  try {
    const { targets = [] } = req.body;

    const optimizations = await companionAI.autoOptimizeSettings(
      req.user.id,
      targets
    );

    res.status(200).json({
      success: true,
      data: optimizations
    });

  } catch (error) {
    console.error('Auto-optimize error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to auto-optimize' 
    });
  }
};

// ========================================
// F. VOICE AI (4 methods)
// ========================================

/**
 * @desc    Create voice session
 * @route   POST /api/phoenix/voice/session
 * @access  Private
 */
exports.createVoiceSession = async (req, res) => {
  try {
    const session = await voiceAgent.createSession(req.user.id);

    res.status(201).json({
      success: true,
      data: session
    });

  } catch (error) {
    console.error('Create voice session error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create voice session' 
    });
  }
};

/**
 * @desc    End voice session
 * @route   DELETE /api/phoenix/voice/session
 * @access  Private
 */
exports.endVoiceSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    await voiceAgent.endSession(sessionId, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Voice session ended'
    });

  } catch (error) {
    console.error('End voice session error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to end voice session' 
    });
  }
};

/**
 * @desc    Get transcriptions
 * @route   GET /api/phoenix/voice/transcriptions
 * @access  Private
 */
exports.getTranscriptions = async (req, res) => {
  try {
    const { days = 7, limit = 50 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const transcriptions = await voiceAgent.getTranscriptions(
      req.user.id,
      startDate,
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      count: transcriptions.length,
      data: transcriptions
    });

  } catch (error) {
    console.error('Get transcriptions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve transcriptions' 
    });
  }
};

/**
 * @desc    Get voice history
 * @route   GET /api/phoenix/voice/history
 * @access  Private
 */
exports.getVoiceHistory = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const history = await voiceAgent.getSessionHistory(
      req.user.id,
      startDate
    );

    res.status(200).json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('Get voice history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve voice history' 
    });
  }
};

// ========================================
// G. ML & LEARNING (7 methods)
// ========================================

/**
 * @desc    Train ML model
 * @route   POST /api/phoenix/ml/train
 * @access  Private
 */
exports.trainModel = async (req, res) => {
  try {
    const { modelType, config = {} } = req.body;

    const validTypes = ['recovery', 'performance', 'illness', 'injury', 'energy'];
    
    if (!modelType || !validTypes.includes(modelType)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid model type is required' 
      });
    }

    const training = await mlTrainingOrchestrator.startTraining(
      req.user.id,
      modelType,
      config
    );

    res.status(202).json({
      success: true,
      message: 'Training started',
      data: training
    });

  } catch (error) {
    console.error('Train model error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start training' 
    });
  }
};

/**
 * @desc    Get user's ML models
 * @route   GET /api/phoenix/ml/models
 * @access  Private
 */
exports.getModels = async (req, res) => {
  try {
    const models = await mlTrainingOrchestrator.getUserModels(req.user.id);

    res.status(200).json({
      success: true,
      count: models.length,
      data: models
    });

  } catch (error) {
    console.error('Get models error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve models' 
    });
  }
};

/**
 * @desc    Get training status
 * @route   GET /api/phoenix/ml/training-status
 * @access  Private
 */
exports.getTrainingStatus = async (req, res) => {
  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Job ID is required' 
      });
    }

    const status = await mlTrainingOrchestrator.getTrainingStatus(jobId);

    res.status(200).json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Get training status error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve training status' 
    });
  }
};

/**
 * @desc    Track behavior
 * @route   POST /api/phoenix/behavior/track
 * @access  Private
 */
exports.trackBehavior = async (req, res) => {
  try {
    const { 
      behaviorType, 
      context = {}, 
      metadata = {} 
    } = req.body;

    if (!behaviorType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Behavior type is required' 
      });
    }

    const behavior = await BehaviorPattern.create({
      userId: req.user.id,
      behaviorType,
      context,
      metadata,
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      data: behavior
    });

  } catch (error) {
    console.error('Track behavior error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to track behavior' 
    });
  }
};

/**
 * @desc    Get behavior patterns
 * @route   GET /api/phoenix/behavior/patterns
 * @access  Private
 */
exports.getBehaviorPatterns = async (req, res) => {
  try {
    const { type, days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const query = {
      userId: req.user.id,
      timestamp: { $gte: startDate }
    };
    if (type) query.behaviorType = type;

    const patterns = await BehaviorPattern.find(query)
      .sort({ timestamp: -1 });

    // Analyze patterns
    const analysis = await mlTrainingOrchestrator.analyzeBehaviorPatterns(patterns);

    res.status(200).json({
      success: true,
      count: patterns.length,
      data: {
        patterns,
        analysis
      }
    });

  } catch (error) {
    console.error('Get behavior patterns error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve behavior patterns' 
    });
  }
};

/**
 * @desc    Get behavior insights
 * @route   GET /api/phoenix/behavior/insights
 * @access  Private
 */
exports.getBehaviorInsights = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const insights = await mlTrainingOrchestrator.generateBehaviorInsights(
      req.user.id,
      parseInt(days)
    );

    res.status(200).json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('Get behavior insights error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate insights' 
    });
  }
};

/**
 * @desc    Get behavior by type
 * @route   GET /api/phoenix/behavior/:type
 * @access  Private
 */
exports.getBehaviorByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { days = 30, limit = 100 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const behaviors = await BehaviorPattern.find({
      userId: req.user.id,
      behaviorType: type,
      timestamp: { $gte: startDate }
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      count: behaviors.length,
      data: behaviors
    });

  } catch (error) {
    console.error('Get behavior by type error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve behaviors' 
    });
  }
};

// ========================================
// H. BUTLER ACTIONS (26 methods)
// ========================================

// --------- Reservations ---------

/**
 * @desc    Make restaurant reservation
 * @route   POST /api/phoenix/butler/reservation
 * @access  Private
 */
exports.makeReservation = async (req, res) => {
  try {
    const { 
      restaurantName, 
      date, 
      time, 
      partySize, 
      preferences = {} 
    } = req.body;

    if (!restaurantName || !date || !time || !partySize) {
      return res.status(400).json({ 
        success: false, 
        error: 'Restaurant name, date, time, and party size are required' 
      });
    }

    const reservation = await butlerAutomation.makeReservation({
      userId: req.user.id,
      restaurantName,
      date,
      time,
      partySize,
      preferences
    });

    res.status(201).json({
      success: true,
      data: reservation
    });

  } catch (error) {
    console.error('Make reservation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to make reservation' 
    });
  }
};

/**
 * @desc    Get reservations
 * @route   GET /api/phoenix/butler/reservations
 * @access  Private
 */
exports.getReservations = async (req, res) => {
  try {
    const { status = 'all', upcoming = 'true' } = req.query;

    const reservations = await butlerAutomation.getReservations(
      req.user.id,
      status,
      upcoming === 'true'
    );

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations
    });

  } catch (error) {
    console.error('Get reservations error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve reservations' 
    });
  }
};

// --------- Food Ordering ---------

/**
 * @desc    Order food
 * @route   POST /api/phoenix/butler/food
 * @access  Private
 */
exports.orderFood = async (req, res) => {
  try {
    const { 
      restaurant, 
      items, 
      deliveryAddress, 
      deliveryTime,
      preferences = {} 
    } = req.body;

    if (!restaurant || !items || !items.length) {
      return res.status(400).json({ 
        success: false, 
        error: 'Restaurant and items are required' 
      });
    }

    const order = await butlerAutomation.orderFood({
      userId: req.user.id,
      restaurant,
      items,
      deliveryAddress,
      deliveryTime,
      preferences
    });

    res.status(201).json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Order food error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to order food' 
    });
  }
};

/**
 * @desc    Get food order history
 * @route   GET /api/phoenix/butler/food/history
 * @access  Private
 */
exports.getFoodHistory = async (req, res) => {
  try {
    const { days = 90, limit = 50 } = req.query;

    const history = await butlerAutomation.getFoodOrderHistory(
      req.user.id,
      parseInt(days),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    console.error('Get food history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve food history' 
    });
  }
};

/**
 * @desc    Reorder previous food order
 * @route   POST /api/phoenix/butler/food/reorder
 * @access  Private
 */
exports.reorderFood = async (req, res) => {
  try {
    const { orderId, modifications = {} } = req.body;

    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Order ID is required' 
      });
    }

    const order = await butlerAutomation.reorderFood(
      req.user.id,
      orderId,
      modifications
    );

    res.status(201).json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Reorder food error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reorder food' 
    });
  }
};

// --------- Rides ---------

/**
 * @desc    Book ride
 * @route   POST /api/phoenix/butler/ride
 * @access  Private
 */
exports.bookRide = async (req, res) => {
  try {
    const { 
      pickup, 
      destination, 
      rideType = 'standard',
      scheduledTime 
    } = req.body;

    if (!pickup || !destination) {
      return res.status(400).json({ 
        success: false, 
        error: 'Pickup and destination are required' 
      });
    }

    const ride = await butlerAutomation.bookRide({
      userId: req.user.id,
      pickup,
      destination,
      rideType,
      scheduledTime
    });

    res.status(201).json({
      success: true,
      data: ride
    });

  } catch (error) {
    console.error('Book ride error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to book ride' 
    });
  }
};

/**
 * @desc    Get ride history
 * @route   GET /api/phoenix/butler/rides
 * @access  Private
 */
exports.getRideHistory = async (req, res) => {
  try {
    const { days = 90, limit = 50 } = req.query;

    const history = await butlerAutomation.getRideHistory(
      req.user.id,
      parseInt(days),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    console.error('Get ride history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve ride history' 
    });
  }
};

// --------- Phone Calls ---------

/**
 * @desc    Make phone call
 * @route   POST /api/phoenix/butler/call
 * @access  Private
 */
exports.makePhoneCall = async (req, res) => {
  try {
    const { 
      phoneNumber, 
      purpose, 
      script,
      recordCall = false 
    } = req.body;

    if (!phoneNumber || !purpose) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number and purpose are required' 
      });
    }

    const call = await phoneAgent.initiateCall({
      userId: req.user.id,
      phoneNumber,
      purpose,
      script,
      recordCall
    });

    res.status(201).json({
      success: true,
      data: call
    });

  } catch (error) {
    console.error('Make phone call error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to initiate call' 
    });
  }
};

/**
 * @desc    Get call history
 * @route   GET /api/phoenix/butler/calls
 * @access  Private
 */
exports.getCallHistory = async (req, res) => {
  try {
    const { days = 90, limit = 50 } = req.query;

    const history = await phoneAgent.getCallHistory(
      req.user.id,
      parseInt(days),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve call history' 
    });
  }
};

// --------- Email ---------

/**
 * @desc    Send email
 * @route   POST /api/phoenix/butler/email
 * @access  Private
 */
exports.sendEmail = async (req, res) => {
  try {
    const { 
      to, 
      subject, 
      body, 
      cc = [],
      bcc = [],
      attachments = [] 
    } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'Recipient, subject, and body are required' 
      });
    }

    const email = await emailAgent.sendEmail({
      userId: req.user.id,
      to,
      subject,
      body,
      cc,
      bcc,
      attachments
    });

    res.status(201).json({
      success: true,
      data: email
    });

  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to send email' 
    });
  }
};

/**
 * @desc    Get email history
 * @route   GET /api/phoenix/butler/emails
 * @access  Private
 */
exports.getEmailHistory = async (req, res) => {
  try {
    const { days = 90, limit = 50, type = 'sent' } = req.query;

    const history = await emailAgent.getEmailHistory(
      req.user.id,
      parseInt(days),
      parseInt(limit),
      type
    );

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    console.error('Get email history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve email history' 
    });
  }
};

/**
 * @desc    Reply to email
 * @route   POST /api/phoenix/butler/email/reply
 * @access  Private
 */
exports.replyToEmail = async (req, res) => {
  try {
    const { emailId, body, includeOriginal = true } = req.body;

    if (!emailId || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email ID and body are required' 
      });
    }

    const reply = await emailAgent.replyToEmail({
      userId: req.user.id,
      emailId,
      body,
      includeOriginal
    });

    res.status(201).json({
      success: true,
      data: reply
    });

  } catch (error) {
    console.error('Reply to email error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reply to email' 
    });
  }
};

// --------- Calendar ---------

/**
 * @desc    Manage calendar event
 * @route   POST /api/phoenix/butler/calendar
 * @access  Private
 */
exports.manageCalendar = async (req, res) => {
  try {
    const { 
      action, // create, update, delete, reschedule
      eventData 
    } = req.body;

    if (!action || !eventData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Action and event data are required' 
      });
    }

    const result = await butlerAutomation.manageCalendarEvent(
      req.user.id,
      action,
      eventData
    );

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Manage calendar error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to manage calendar event' 
    });
  }
};

/**
 * @desc    Optimize calendar
 * @route   POST /api/phoenix/butler/calendar/optimize
 * @access  Private
 */
exports.optimizeCalendar = async (req, res) => {
  try {
    const { 
      timeframe = 'week',
      priorities = [],
      constraints = {} 
    } = req.body;

    const optimization = await butlerAutomation.optimizeCalendar(
      req.user.id,
      timeframe,
      priorities,
      constraints
    );

    res.status(200).json({
      success: true,
      data: optimization
    });

  } catch (error) {
    console.error('Optimize calendar error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to optimize calendar' 
    });
  }
};

// --------- Web Automation ---------

/**
 * @desc    Search web
 * @route   POST /api/phoenix/butler/search
 * @access  Private
 */
exports.searchWeb = async (req, res) => {
  try {
    const { query, filters = {} } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query is required' 
      });
    }

    const results = await butlerAutomation.searchWeb(
      query.trim(),
      filters
    );

    res.status(200).json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Search web error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search web' 
    });
  }
};

/**
 * @desc    Perform web task
 * @route   POST /api/phoenix/butler/web-task
 * @access  Private
 */
exports.performWebTask = async (req, res) => {
  try {
    const { 
      taskType, 
      url, 
      instructions,
      options = {} 
    } = req.body;

    if (!taskType || !url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Task type and URL are required' 
      });
    }

    const result = await butlerAutomation.performWebTask({
      userId: req.user.id,
      taskType,
      url,
      instructions,
      options
    });

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Perform web task error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to perform web task' 
    });
  }
};

// --------- Summarization ---------

/**
 * @desc    Summarize content
 * @route   POST /api/phoenix/butler/summarize
 * @access  Private
 */
exports.summarizeContent = async (req, res) => {
  try {
    const { 
      content, 
      url, 
      format = 'standard',
      length = 'medium' 
    } = req.body;

    if (!content && !url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Content or URL is required' 
      });
    }

    const summary = await butlerAutomation.summarizeContent({
      userId: req.user.id,
      content,
      url,
      format,
      length
    });

    res.status(200).json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Summarize content error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to summarize content' 
    });
  }
};

/**
 * @desc    Batch summarize multiple items
 * @route   POST /api/phoenix/butler/summarize/batch
 * @access  Private
 */
exports.batchSummarize = async (req, res) => {
  try {
    const { items = [], format = 'standard' } = req.body;

    if (!items.length) {
      return res.status(400).json({ 
        success: false, 
        error: 'Items array is required' 
      });
    }

    const summaries = await butlerAutomation.batchSummarize(
      req.user.id,
      items,
      format
    );

    res.status(200).json({
      success: true,
      count: summaries.length,
      data: summaries
    });

  } catch (error) {
    console.error('Batch summarize error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to batch summarize' 
    });
  }
};

// --------- Task Automation ---------

/**
 * @desc    Create automation
 * @route   POST /api/phoenix/butler/automate
 * @access  Private
 */
exports.createAutomation = async (req, res) => {
  try {
    const { 
      name, 
      trigger, 
      actions = [],
      conditions = [],
      enabled = true 
    } = req.body;

    if (!name || !trigger || !actions.length) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name, trigger, and actions are required' 
      });
    }

    const automation = await butlerAutomation.createAutomation({
      userId: req.user.id,
      name,
      trigger,
      actions,
      conditions,
      enabled
    });

    res.status(201).json({
      success: true,
      data: automation
    });

  } catch (error) {
    console.error('Create automation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create automation' 
    });
  }
};

/**
 * @desc    Get automations
 * @route   GET /api/phoenix/butler/automations
 * @access  Private
 */
exports.getAutomations = async (req, res) => {
  try {
    const { enabled } = req.query;

    const query = { userId: req.user.id };
    if (enabled !== undefined) {
      query.enabled = enabled === 'true';
    }

    const automations = await butlerAutomation.getAutomations(query);

    res.status(200).json({
      success: true,
      count: automations.length,
      data: automations
    });

  } catch (error) {
    console.error('Get automations error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve automations' 
    });
  }
};

/**
 * @desc    Delete automation
 * @route   DELETE /api/phoenix/butler/automations/:id
 * @access  Private
 */
exports.deleteAutomation = async (req, res) => {
  try {
    await butlerAutomation.deleteAutomation(req.user.id, req.params.id);

    res.status(200).json({
      success: true,
      message: 'Automation deleted successfully'
    });

  } catch (error) {
    console.error('Delete automation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete automation' 
    });
  }
};

// ========================================
// Export all methods
// ========================================

module.exports = exports;
