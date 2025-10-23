/**
 * MARS ROUTES - Goals, Habits, Milestones, Progress Tracking
 * 
 * Phoenix Backend - Planetary System Architecture
 * File: Src/routes/mars.js
 * Base Path: /api/mars
 * Total Endpoints: 18
 * 
 * Controller: marsController.js
 * Middleware: protect (JWT auth) on all routes
 */

const express = require('express');
const router = express.Router();
const marsController = require('../controllers/marsController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// ========================================
// GOAL MANAGEMENT (6 endpoints)
// ========================================

/**
 * @route   POST /api/mars/goals
 * @desc    Create a new goal
 * @access  Private
 * @body    { title, description, category, type, targetValue, currentValue, unit, targetDate, priority, milestones, habits }
 */
router.post('/goals', marsController.createGoal);

/**
 * @route   GET /api/mars/goals
 * @desc    Get all goals for user
 * @access  Private
 * @query   ?status=active&category=fitness&type=fitness&priority=high
 */
router.get('/goals', marsController.getGoals);

/**
 * @route   GET /api/mars/goals/:id
 * @desc    Get single goal by ID
 * @access  Private
 */
router.get('/goals/:id', marsController.getGoal);

/**
 * @route   PUT /api/mars/goals/:id
 * @desc    Update goal
 * @access  Private
 * @body    Goal fields to update
 */
router.put('/goals/:id', marsController.updateGoal);

/**
 * @route   DELETE /api/mars/goals/:id
 * @desc    Delete goal
 * @access  Private
 */
router.delete('/goals/:id', marsController.deleteGoal);

/**
 * @route   POST /api/mars/goals/:id/complete
 * @desc    Complete goal
 * @access  Private
 * @body    { reflection?, achievements? }
 */
router.post('/goals/:id/complete', marsController.completeGoal);

// ========================================
// AI GOAL GENERATION (3 endpoints)
// ========================================

/**
 * @route   POST /api/mars/goals/generate-smart
 * @desc    Generate SMART goal from vague input
 * @access  Private
 * @body    { generalGoal: "get stronger", domain: 'fitness' }
 */
router.post('/goals/generate-smart', marsController.generateSmartGoal);

/**
 * @route   POST /api/mars/goals/suggest
 * @desc    Get personalized goal suggestions
 * @access  Private
 * @body    { domain?: 'health' | 'fitness' | 'financial' | 'career' }
 */
router.post('/goals/suggest', marsController.getGoalSuggestions);

/**
 * @route   GET /api/mars/goals/templates
 * @desc    Get goal templates
 * @access  Private
 * @query   ?category=fitness&difficulty=intermediate
 */
router.get('/goals/templates', marsController.getGoalTemplates);

// ========================================
// PROGRESS TRACKING (4 endpoints)
// ========================================

/**
 * @route   POST /api/mars/goals/:id/progress
 * @desc    Log progress update
 * @access  Private
 * @body    { value, notes?, date? }
 */
router.post('/goals/:id/progress', marsController.logProgress);

/**
 * @route   GET /api/mars/goals/:id/progress
 * @desc    Get progress history for goal
 * @access  Private
 */
router.get('/goals/:id/progress', marsController.getProgress);

/**
 * @route   GET /api/mars/progress/velocity
 * @desc    Get progress velocity
 * @access  Private
 * @query   ?goalId=:id
 */
router.get('/progress/velocity', marsController.getProgressVelocity);

/**
 * @route   GET /api/mars/progress/predictions
 * @desc    Get progress predictions (ML-based)
 * @access  Private
 * @query   ?goalId=:id
 */
router.get('/progress/predictions', marsController.getProgressPredictions);

/**
 * @route   GET /api/mars/progress/bottlenecks
 * @desc    Get bottleneck analysis
 * @access  Private
 * @query   ?goalId=:id
 */
router.get('/progress/bottlenecks', marsController.getBottlenecks);

// ========================================
// MILESTONES (2 endpoints)
// ========================================

/**
 * @route   POST /api/mars/goals/:id/milestones
 * @desc    Create milestone for goal
 * @access  Private
 * @body    { title, targetDate, value }
 */
router.post('/goals/:id/milestones', marsController.createMilestone);

/**
 * @route   POST /api/mars/milestones/:id/complete
 * @desc    Complete milestone
 * @access  Private
 */
router.post('/milestones/:id/complete', marsController.completeMilestone);

// ========================================
// HABITS (2 endpoints)
// ========================================

/**
 * @route   POST /api/mars/habits
 * @desc    Create habit
 * @access  Private
 * @body    { name, frequency, linkedGoalId? }
 */
router.post('/habits', marsController.createHabit);

/**
 * @route   POST /api/mars/habits/:id/log
 * @desc    Log habit completion
 * @access  Private
 * @body    { completed: boolean, date? }
 */
router.post('/habits/:id/log', marsController.logHabit);

// ========================================
// MOTIVATIONAL SYSTEMS (2 endpoints)
// ========================================

/**
 * @route   GET /api/mars/motivation/interventions
 * @desc    Get motivational interventions
 * @access  Private
 */
router.get('/motivation/interventions', marsController.getMotivationalInterventions);

/**
 * @route   POST /api/mars/motivation/boost
 * @desc    Trigger motivation boost
 * @access  Private
 * @body    { goalId?, reason: 'struggling' | 'celebrating' | 'milestone' }
 */
router.post('/motivation/boost', marsController.triggerMotivationBoost);

module.exports = router;
