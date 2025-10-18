// Src/routes/mercury.js - FITNESS INTELLIGENCE ROUTES
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const mercuryController = require('../controllers/mercuryController');

// ============================================
// MERCURY - FITNESS INTELLIGENCE PLANET
// ============================================

// Workout Intelligence
router.get('/:userId/workout-intelligence', protect, mercuryController.getWorkoutIntelligence);
router.post('/:userId/generate-workout', protect, mercuryController.generateAIWorkout);
router.get('/:userId/workout-recommendations', protect, mercuryController.getWorkoutRecommendations);
router.post('/:userId/analyze-form', protect, mercuryController.analyzeExerciseForm);

// Performance Analytics
router.get('/:userId/performance-metrics', protect, mercuryController.getPerformanceMetrics);
router.get('/:userId/strength-progression', protect, mercuryController.getStrengthProgression);
router.get('/:userId/volume-analysis', protect, mercuryController.getVolumeAnalysis);
router.get('/:userId/recovery-needs', protect, mercuryController.getRecoveryNeeds);

// Exercise Optimization
router.post('/:userId/optimize-exercise/:exerciseId', protect, mercuryController.optimizeExercise);
router.get('/:userId/exercise-alternatives/:exerciseId', protect, mercuryController.getExerciseAlternatives);
router.post('/:userId/muscle-imbalance-check', protect, mercuryController.checkMuscleImbalances);

// Progressive Overload Management
router.get('/:userId/overload-recommendations', protect, mercuryController.getOverloadRecommendations);
router.post('/:userId/auto-progress', protect, mercuryController.autoProgressWeights);
router.get('/:userId/deload-schedule', protect, mercuryController.getDeloadSchedule);

// Injury Prevention
router.post('/:userId/injury-risk-assessment', protect, mercuryController.assessInjuryRisk);
router.get('/:userId/mobility-recommendations', protect, mercuryController.getMobilityRecommendations);
router.get('/:userId/warmup-routine/:workoutId', protect, mercuryController.generateWarmupRoutine);

// AI Coaching
router.post('/:userId/ai-coach/chat', protect, mercuryController.chatWithAICoach);
router.get('/:userId/ai-coach/daily-brief', protect, mercuryController.getDailyCoachingBrief);
router.post('/:userId/ai-coach/form-check', protect, mercuryController.submitFormVideo);

// Workout Patterns Analysis
router.get('/:userId/patterns/consistency', protect, mercuryController.getConsistencyPatterns);
router.get('/:userId/patterns/peak-performance', protect, mercuryController.getPeakPerformanceTimes);
router.get('/:userId/patterns/fatigue', protect, mercuryController.getFatiguePatterns);

// Integration with Wearables
router.post('/:userId/correlate-workout-recovery', protect, mercuryController.correlateWorkoutRecovery);
router.get('/:userId/optimal-training-window', protect, mercuryController.getOptimalTrainingWindow);
router.post('/:userId/auto-adjust-intensity', protect, mercuryController.autoAdjustIntensity);

// Periodization
router.post('/:userId/create-mesocycle', protect, checkRole(['specialist', 'admin']), mercuryController.createMesocycle);
router.get('/:userId/current-phase', protect, mercuryController.getCurrentTrainingPhase);
router.post('/:userId/phase-transition', protect, mercuryController.transitionPhase);

// Documentation
router.get('/', (req, res) => {
  res.json({
    planet: 'Mercury',
    domain: 'Fitness Intelligence',
    description: 'AI-powered workout optimization and performance analytics',
    features: [
      'Intelligent workout generation',
      'Real-time form analysis',
      'Progressive overload automation',
      'Injury risk assessment',
      'Performance pattern recognition',
      'Recovery-based intensity adjustment',
      'Periodization management',
      'AI coaching interface'
    ],
    endpoints: {
      intelligence: {
        GET_workout_intelligence: '/:userId/workout-intelligence',
        POST_generate_workout: '/:userId/generate-workout',
        GET_recommendations: '/:userId/workout-recommendations'
      },
      analytics: {
        GET_performance: '/:userId/performance-metrics',
        GET_strength: '/:userId/strength-progression',
        GET_volume: '/:userId/volume-analysis'
      },
      optimization: {
        POST_optimize: '/:userId/optimize-exercise/:exerciseId',
        GET_alternatives: '/:userId/exercise-alternatives/:exerciseId',
        POST_imbalance: '/:userId/muscle-imbalance-check'
      },
      ai_coach: {
        POST_chat: '/:userId/ai-coach/chat',
        GET_daily_brief: '/:userId/ai-coach/daily-brief',
        POST_form_check: '/:userId/ai-coach/form-check'
      }
    }
  });
});

module.exports = router;