/**
 * MARS CONTROLLER - Goals, Habits, Milestones, Progress Tracking
 * 
 * Phoenix Backend - Planetary System Architecture
 * File: Src/controllers/marsController.js
 * Route: Src/routes/mars.js
 * Base Path: /api/mars
 * Total Methods: 18
 * 
 * CONSOLIDATES:
 * - goalController.js (expanded from 10 to 18 methods)
 * 
 * MODELS USED:
 * - Goal
 * - Habit
 * - Milestone
 * - GoalProgress
 * - MotivationalIntervention
 * 
 * SERVICES USED:
 * - goalTracker.js - Goal management
 * - smartGoalGenerator.js - AI goal creation
 * - motivationEngine.js - Motivational features
 */

const asyncHandler = require('express-async-handler');
const Goal = require('../models/mars/Goal');
// Note: Habits and Milestones are embedded in Goal model
// Services may need to be created if they don't exist yet
const goalTracker = require('../services/mars/goalTracker');
const smartGoalGenerator = require('../services/mars/smartGoalGenerator');
const motivationEngine = require('../services/mars/motivationEngine');

// ========================================
// A. GOAL MANAGEMENT (6 methods)
// ========================================

/**
 * @desc    Create a new goal
 * @route   POST /api/mars/goals
 * @access  Private
 */
exports.createGoal = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    category,
    type,
    targetValue,
    currentValue,
    unit,
    targetDate,
    priority,
    milestones,
    habits,
    tags
  } = req.body;

  // Create goal
  const goal = await Goal.create({
    userId: req.user.id,
    title,
    description,
    category,
    type,
    targetValue,
    currentValue: currentValue || 0,
    unit,
    startDate: Date.now(),
    targetDate,
    priority: priority || 'medium',
    status: 'active',
    milestones: milestones || [],
    habits: habits || [],
    tags: tags || [],
    progress: 0
  });

  // Auto-generate milestones if not provided
  if (!milestones || milestones.length === 0) {
    const autoMilestones = await goalTracker.generateMilestones(goal);
    goal.milestones = autoMilestones;
    await goal.save();
  }

  res.status(201).json({
    success: true,
    data: goal,
    message: 'Goal created successfully'
  });
});

/**
 * @desc    Get all goals for user
 * @route   GET /api/mars/goals
 * @access  Private
 */
exports.getGoals = asyncHandler(async (req, res) => {
  const { status, category, type, priority } = req.query;

  // Build query
  const query = { userId: req.user.id };
  
  if (status) query.status = status;
  if (category) query.category = category;
  if (type) query.type = type;
  if (priority) query.priority = priority;

  // Fetch goals
  const goals = await Goal.find(query).sort('-createdAt');

  // Calculate stats
  const stats = {
    total: await Goal.countDocuments({ userId: req.user.id }),
    active: await Goal.countDocuments({ userId: req.user.id, status: 'active' }),
    completed: await Goal.countDocuments({ userId: req.user.id, status: 'completed' }),
    paused: await Goal.countDocuments({ userId: req.user.id, status: 'paused' })
  };

  res.status(200).json({
    success: true,
    count: goals.length,
    stats,
    data: goals
  });
});

/**
 * @desc    Get single goal by ID
 * @route   GET /api/mars/goals/:id
 * @access  Private
 */
exports.getGoal = asyncHandler(async (req, res) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to access this goal');
  }

  // Get insights using virtual fields and calculations
  const insights = {
    daysRemaining: goal.daysRemaining,
    progressRate: goal.progressRate,
    milestonesCompleted: goal.milestones.filter(m => m.completed).length,
    totalMilestones: goal.milestones.length
  };

  res.status(200).json({
    success: true,
    data: {
      goal,
      insights
    }
  });
});

/**
 * @desc    Update goal
 * @route   PUT /api/mars/goals/:id
 * @access  Private
 */
exports.updateGoal = asyncHandler(async (req, res) => {
  let goal = await Goal.findById(req.params.id);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to update this goal');
  }

  // Update goal
  goal = await Goal.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: goal
  });
});

/**
 * @desc    Delete goal
 * @route   DELETE /api/mars/goals/:id
 * @access  Private
 */
exports.deleteGoal = asyncHandler(async (req, res) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to delete this goal');
  }

  await goal.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Complete goal
 * @route   POST /api/mars/goals/:id/complete
 * @access  Private
 */
exports.completeGoal = asyncHandler(async (req, res) => {
  const { reflection, achievements } = req.body;

  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to complete this goal');
  }

  // Mark as completed
  goal.status = 'completed';
  goal.progress = 100;
  goal.currentValue = goal.targetValue;
  await goal.save();

  // Generate celebration message
  const celebration = await motivationEngine.generateCelebration(goal);

  res.status(200).json({
    success: true,
    data: goal,
    celebration
  });
});

// ========================================
// B. AI GOAL GENERATION (3 methods)
// ========================================

/**
 * @desc    Generate SMART goal from vague input
 * @route   POST /api/mars/goals/generate-smart
 * @access  Private
 */
exports.generateSmartGoal = asyncHandler(async (req, res) => {
  const { generalGoal, domain } = req.body;

  if (!generalGoal) {
    res.status(400);
    throw new Error('Please provide a general goal');
  }

  // Use AI to convert to SMART goal
  const smartGoal = await smartGoalGenerator.generate(req.user.id, {
    generalGoal,
    domain
  });

  res.status(200).json({
    success: true,
    data: smartGoal
  });
});

/**
 * @desc    Get personalized goal suggestions
 * @route   POST /api/mars/goals/suggest
 * @access  Private
 */
exports.getGoalSuggestions = asyncHandler(async (req, res) => {
  const { domain } = req.body;

  // Generate AI-powered suggestions based on user data
  const suggestions = await smartGoalGenerator.suggest(req.user.id, domain);

  res.status(200).json({
    success: true,
    data: suggestions
  });
});

/**
 * @desc    Get goal templates
 * @route   GET /api/mars/goals/templates
 * @access  Private
 */
exports.getGoalTemplates = asyncHandler(async (req, res) => {
  const { category, difficulty } = req.query;

  // Fetch templates
  const templates = await smartGoalGenerator.getTemplates({
    category,
    difficulty
  });

  res.status(200).json({
    success: true,
    count: templates.length,
    data: templates
  });
});

// ========================================
// C. PROGRESS TRACKING (4 methods)
// ========================================

/**
 * @desc    Log progress update
 * @route   POST /api/mars/goals/:id/progress
 * @access  Private
 */
exports.logProgress = asyncHandler(async (req, res) => {
  const { value, notes, date } = req.body;

  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to update this goal');
  }

  // Update current value
  goal.currentValue = value;
  
  // Calculate percentage complete (handled by pre-save hook in model)
  const percentComplete = goal.targetValue > 0 
    ? ((value / goal.targetValue) * 100).toFixed(2) 
    : 0;
  
  goal.progress = percentComplete;
  
  // Check if goal is completed (handled by pre-save hook)
  if (percentComplete >= 100) {
    goal.status = 'completed';
  }

  await goal.save();

  // Calculate trend using goalTracker service
  const trend = await goalTracker.calculateTrend(goal._id);

  res.status(200).json({
    success: true,
    data: {
      goal,
      percentComplete,
      trend,
      notes
    }
  });
});

/**
 * @desc    Get progress history
 * @route   GET /api/mars/goals/:id/progress
 * @access  Private
 */
exports.getProgress = asyncHandler(async (req, res) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to access this goal');
  }

  // Calculate trend using virtual fields and services
  const trend = await goalTracker.calculateTrend(goal._id);

  // Calculate projected completion
  const projectedCompletion = await goalTracker.projectCompletion(goal._id);

  res.status(200).json({
    success: true,
    data: {
      currentValue: goal.currentValue,
      targetValue: goal.targetValue,
      progress: goal.progress,
      status: goal.status,
      daysRemaining: goal.daysRemaining,
      progressRate: goal.progressRate,
      trend,
      projectedCompletion
    }
  });
});

/**
 * @desc    Get progress velocity
 * @route   GET /api/mars/progress/velocity
 * @access  Private
 */
exports.getProgressVelocity = asyncHandler(async (req, res) => {
  const { goalId } = req.query;

  if (!goalId) {
    res.status(400);
    throw new Error('Please provide a goalId');
  }

  const goal = await Goal.findById(goalId);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to access this goal');
  }

  // Calculate velocity
  const velocity = await goalTracker.calculateVelocity(goalId);

  res.status(200).json({
    success: true,
    data: velocity
  });
});

/**
 * @desc    Get progress predictions
 * @route   GET /api/mars/progress/predictions
 * @access  Private
 */
exports.getProgressPredictions = asyncHandler(async (req, res) => {
  const { goalId } = req.query;

  if (!goalId) {
    res.status(400);
    throw new Error('Please provide a goalId');
  }

  const goal = await Goal.findById(goalId);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to access this goal');
  }

  // Use prediction engine (from Phoenix services)
  const predictionEngine = require('../services/phoenix/predictionEngine');
  const predictions = await predictionEngine.predictGoalSuccess(goalId);

  res.status(200).json({
    success: true,
    data: predictions
  });
});

// ========================================
// D. MILESTONES (2 methods)
// ========================================

/**
 * @desc    Create milestone for goal
 * @route   POST /api/mars/goals/:id/milestones
 * @access  Private
 */
exports.createMilestone = asyncHandler(async (req, res) => {
  const { title, targetValue, targetDate } = req.body;

  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to modify this goal');
  }

  // Add milestone to embedded array
  goal.milestones.push({
    title,
    targetValue,
    targetDate,
    completed: false
  });

  await goal.save();

  res.status(201).json({
    success: true,
    data: goal.milestones
  });
});

/**
 * @desc    Complete milestone
 * @route   POST /api/mars/milestones/:id/complete
 * @access  Private
 */
exports.completeMilestone = asyncHandler(async (req, res) => {
  const milestoneId = req.params.id;

  // Find goal containing this milestone
  const goal = await Goal.findOne({
    userId: req.user.id,
    'milestones._id': milestoneId
  });

  if (!goal) {
    res.status(404);
    throw new Error('Milestone not found');
  }

  // Find and update milestone
  const milestone = goal.milestones.id(milestoneId);
  milestone.completed = true;
  milestone.completedAt = Date.now();

  await goal.save();

  // Find next incomplete milestone
  const nextMilestone = goal.milestones.find(m => !m.completed);

  res.status(200).json({
    success: true,
    data: {
      milestone,
      nextMilestone
    }
  });
});

// ========================================
// E. HABITS (2 methods)
// ========================================

/**
 * @desc    Create habit
 * @route   POST /api/mars/habits
 * @access  Private
 */
exports.createHabit = asyncHandler(async (req, res) => {
  const { title, frequency, linkedGoalId } = req.body;

  if (!linkedGoalId) {
    res.status(400);
    throw new Error('linkedGoalId is required to attach habit to a goal');
  }

  const goal = await Goal.findById(linkedGoalId);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to modify this goal');
  }

  // Add habit to embedded array
  goal.habits.push({
    title,
    frequency,
    streak: 0,
    lastCompleted: null
  });

  await goal.save();

  res.status(201).json({
    success: true,
    data: goal.habits
  });
});

/**
 * @desc    Log habit completion
 * @route   POST /api/mars/habits/:id/log
 * @access  Private
 */
exports.logHabit = asyncHandler(async (req, res) => {
  const { completed, date } = req.body;
  const habitId = req.params.id;

  // Find goal containing this habit
  const goal = await Goal.findOne({
    userId: req.user.id,
    'habits._id': habitId
  });

  if (!goal) {
    res.status(404);
    throw new Error('Habit not found');
  }

  // Find habit
  const habit = goal.habits.id(habitId);

  // Update streak
  const logDate = date ? new Date(date) : new Date();
  habit.lastCompleted = logDate;

  if (completed) {
    habit.streak = (habit.streak || 0) + 1;
  } else {
    habit.streak = 0;
  }

  await goal.save();

  // Generate motivational message
  const motivation = await motivationEngine.generateHabitMotivation(habit, goal);

  res.status(200).json({
    success: true,
    data: {
      habit,
      streak: habit.streak,
      motivation
    }
  });
});

// ========================================
// F. ANALYTICS & BOTTLENECKS (1 method)
// ========================================

/**
 * @desc    Get bottleneck analysis
 * @route   GET /api/mars/progress/bottlenecks
 * @access  Private
 */
exports.getBottlenecks = asyncHandler(async (req, res) => {
  const { goalId } = req.query;

  if (!goalId) {
    res.status(400);
    throw new Error('Please provide a goalId');
  }

  const goal = await Goal.findById(goalId);

  if (!goal) {
    res.status(404);
    throw new Error('Goal not found');
  }

  // Verify ownership
  if (goal.userId.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to access this goal');
  }

  // Analyze bottlenecks
  const bottlenecks = await goalTracker.analyzeBottlenecks(goalId);

  res.status(200).json({
    success: true,
    data: bottlenecks
  });
});

// ========================================
// G. MOTIVATIONAL SYSTEMS (2 methods)
// ========================================

/**
 * @desc    Get motivational interventions
 * @route   GET /api/mars/motivation/interventions
 * @access  Private
 */
exports.getMotivationalInterventions = asyncHandler(async (req, res) => {
  // Get interventions
  const interventions = await motivationEngine.getInterventions(req.user.id);

  res.status(200).json({
    success: true,
    data: interventions
  });
});

/**
 * @desc    Trigger motivation boost
 * @route   POST /api/mars/motivation/boost
 * @access  Private
 */
exports.triggerMotivationBoost = asyncHandler(async (req, res) => {
  const { goalId, reason } = req.body;

  // Generate motivational boost
  const boost = await motivationEngine.generateBoost(req.user.id, {
    goalId,
    reason
  });

  res.status(200).json({
    success: true,
    data: boost
  });
});

module.exports = exports;
