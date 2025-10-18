// Src/routes/mars.js - GOAL ACHIEVEMENT ENGINE ROUTES
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const marsController = require('../controllers/marsController');

// ============================================
// MARS - GOAL ACHIEVEMENT ENGINE
// ============================================

// Goal Intelligence
router.post('/:userId/goals/generate', protect, marsController.generateSmartGoals);
router.get('/:userId/goals/analysis', protect, marsController.analyzeGoalProgress);
router.post('/:userId/goals/optimize', protect, marsController.optimizeGoals);
router.get('/:userId/goals/conflicts', protect, marsController.detectGoalConflicts);

// Milestone Management
router.post('/:userId/goals/:goalId/milestones', protect, marsController.createMilestones);
router.get('/:userId/goals/:goalId/milestones', protect, marsController.getMilestones);
router.put('/:userId/milestones/:milestoneId', protect, marsController.updateMilestone);
router.post('/:userId/milestones/:milestoneId/complete', protect, marsController.completeMilestone);

// Progress Tracking
router.get('/:userId/progress/dashboard', protect, marsController.getProgressDashboard);
router.get('/:userId/progress/velocity', protect, marsController.getProgressVelocity);
router.get('/:userId/progress/predictions', protect, marsController.getPredictedOutcomes);
router.post('/:userId/progress/log', protect, marsController.logProgress);

// Habit Formation
router.post('/:userId/habits/create', protect, marsController.createHabit);
router.get('/:userId/habits', protect, marsController.getHabits);
router.post('/:userId/habits/:habitId/check', protect, marsController.checkHabit);
router.get('/:userId/habits/streaks', protect, marsController.getHabitStreaks);
router.get('/:userId/habits/analysis', protect, marsController.analyzeHabitPatterns);

// Motivation System
router.get('/:userId/motivation/score', protect, marsController.getMotivationScore);
router.post('/:userId/motivation/boost', protect, marsController.triggerMotivationalBoost);
router.get('/:userId/achievements', protect, marsController.getAchievements);
router.get('/:userId/achievements/upcoming', protect, marsController.getUpcomingAchievements);

// Goal Correlation
router.get('/:userId/correlations/health-goals', protect, marsController.correlateHealthWithGoals);
router.get('/:userId/correlations/performance', protect, marsController.correlatePerformanceMetrics);
router.get('/:userId/correlations/obstacles', protect, marsController.identifyObstacles);
router.post('/:userId/correlations/analyze', protect, marsController.runCorrelationAnalysis);

// Accountability Features
router.post('/:userId/accountability/partner', protect, marsController.addAccountabilityPartner);
router.get('/:userId/accountability/partners', protect, marsController.getAccountabilityPartners);
router.post('/:userId/accountability/check-in', protect, marsController.submitCheckIn);
router.get('/:userId/accountability/reminders', protect, marsController.getReminders);

// Goal Templates
router.get('/templates', protect, marsController.getGoalTemplates);
router.get('/templates/:category', protect, marsController.getTemplatesByCategory);
router.post('/:userId/goals/from-template', protect, marsController.createFromTemplate);
router.post('/templates/custom', protect, checkRole(['specialist', 'admin']), marsController.createTemplate);

// Gamification
router.get('/:userId/gamification/level', protect, marsController.getUserLevel);
router.get('/:userId/gamification/points', protect, marsController.getPoints);
router.get('/:userId/gamification/badges', protect, marsController.getBadges);
router.get('/:userId/gamification/leaderboard', protect, marsController.getLeaderboard);
router.post('/:userId/gamification/challenge/:challengeId', protect, marsController.joinChallenge);

// AI Goal Coach
router.post('/:userId/coach/chat', protect, marsController.chatWithGoalCoach);
router.get('/:userId/coach/recommendations', protect, marsController.getCoachRecommendations);
router.post('/:userId/coach/review', protect, marsController.requestGoalReview);
router.get('/:userId/coach/insights', protect, marsController.getCoachInsights);

// Goal Sharing & Social
router.post('/:userId/goals/:goalId/share', protect, marsController.shareGoal);
router.get('/:userId/social/feed', protect, marsController.getSocialFeed);
router.post('/:userId/social/support/:goalId', protect, marsController.sendSupport);
router.get('/:userId/social/supporters', protect, marsController.getSupporters);

// Analytics & Reports
router.get('/:userId/reports/weekly', protect, marsController.getWeeklyReport);
router.get('/:userId/reports/monthly', protect, marsController.getMonthlyReport);
router.get('/:userId/reports/year-review', protect, marsController.getYearReview);
router.post('/:userId/reports/custom', protect, marsController.generateCustomReport);

// Documentation
router.get('/', (req, res) => {
  res.json({
    planet: 'Mars',
    domain: 'Goal Achievement Engine',
    description: 'Intelligent goal setting, tracking, and achievement system',
    features: [
      'Smart goal generation',
      'Milestone tracking',
      'Habit formation',
      'Progress predictions',
      'Motivation scoring',
      'Accountability partners',
      'Gamification system',
      'Goal correlation analysis',
      'AI goal coaching',
      'Social support network'
    ],
    endpoints: {
      goals: {
        POST_generate: '/:userId/goals/generate',
        GET_analysis: '/:userId/goals/analysis',
        POST_optimize: '/:userId/goals/optimize'
      },
      habits: {
        POST_create: '/:userId/habits/create',
        GET_all: '/:userId/habits',
        POST_check: '/:userId/habits/:habitId/check',
        GET_streaks: '/:userId/habits/streaks'
      },
      progress: {
        GET_dashboard: '/:userId/progress/dashboard',
        GET_velocity: '/:userId/progress/velocity',
        GET_predictions: '/:userId/progress/predictions'
      },
      gamification: {
        GET_level: '/:userId/gamification/level',
        GET_badges: '/:userId/gamification/badges',
        GET_leaderboard: '/:userId/gamification/leaderboard'
      },
      ai_coach: {
        POST_chat: '/:userId/coach/chat',
        GET_recommendations: '/:userId/coach/recommendations',
        GET_insights: '/:userId/coach/insights'
      }
    }
  });
});

module.exports = router;