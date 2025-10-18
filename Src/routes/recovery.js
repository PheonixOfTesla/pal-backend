// Src/routes/recovery.js - RECOVERY OPTIMIZATION ROUTES
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const recoveryController = require('../controllers/recoveryController');

// ============================================
// RECOVERY OPTIMIZATION SYSTEM
// ============================================

// Recovery Scoring
router.get('/:userId/score/current', protect, recoveryController.getCurrentRecoveryScore);
router.get('/:userId/score/history', protect, recoveryController.getRecoveryHistory);
router.get('/:userId/score/trends', protect, recoveryController.getRecoveryTrends);
router.post('/:userId/score/calculate', protect, recoveryController.calculateRecoveryScore);

// Sleep Optimization
router.get('/:userId/sleep/analysis', protect, recoveryController.getSleepAnalysis);
router.get('/:userId/sleep/quality', protect, recoveryController.getSleepQuality);
router.get('/:userId/sleep/recommendations', protect, recoveryController.getSleepRecommendations);
router.post('/:userId/sleep/optimize-schedule', protect, recoveryController.optimizeSleepSchedule);
router.get('/:userId/sleep/debt', protect, recoveryController.calculateSleepDebt);

// HRV Management
router.get('/:userId/hrv/current', protect, recoveryController.getCurrentHRV);
router.get('/:userId/hrv/baseline', protect, recoveryController.getHRVBaseline);
router.get('/:userId/hrv/trends', protect, recoveryController.getHRVTrends);
router.post('/:userId/hrv/interpret', protect, recoveryController.interpretHRV);
router.get('/:userId/hrv/recommendations', protect, recoveryController.getHRVRecommendations);

// Stress Management
router.get('/:userId/stress/level', protect, recoveryController.getStressLevel);
router.get('/:userId/stress/sources', protect, recoveryController.identifyStressSources);
router.post('/:userId/stress/intervention', protect, recoveryController.triggerStressIntervention);
router.get('/:userId/stress/techniques', protect, recoveryController.getStressTechniques);
router.post('/:userId/stress/log', protect, recoveryController.logStressEvent);

// Recovery Protocols
router.get('/:userId/protocols/active', protect, recoveryController.getActiveProtocols);
router.post('/:userId/protocols/generate', protect, recoveryController.generateRecoveryProtocol);
router.get('/:userId/protocols/library', protect, recoveryController.getProtocolLibrary);
router.post('/:userId/protocols/:protocolId/start', protect, recoveryController.startProtocol);
router.post('/:userId/protocols/:protocolId/complete', protect, recoveryController.completeProtocol);

// Injury Prevention & Management
router.post('/:userId/injury/report', protect, recoveryController.reportInjury);
router.get('/:userId/injury/active', protect, recoveryController.getActiveInjuries);
router.get('/:userId/injury/prevention', protect, recoveryController.getInjuryPreventionPlan);
router.post('/:userId/injury/:injuryId/update', protect, recoveryController.updateInjuryStatus);
router.get('/:userId/injury/risk-assessment', protect, recoveryController.assessInjuryRisk);

// Recovery Activities
router.get('/:userId/activities/recommended', protect, recoveryController.getRecommendedActivities);
router.post('/:userId/activities/log', protect, recoveryController.logRecoveryActivity);
router.get('/:userId/activities/history', protect, recoveryController.getActivityHistory);
router.get('/:userId/activities/effectiveness', protect, recoveryController.analyzeActivityEffectiveness);

// Nutrition for Recovery
router.get('/:userId/nutrition/recovery-foods', protect, recoveryController.getRecoveryFoods);
router.get('/:userId/nutrition/timing', protect, recoveryController.getRecoveryNutritionTiming);
router.post('/:userId/nutrition/recovery-meal', protect, recoveryController.generateRecoveryMeal);
router.get('/:userId/nutrition/supplements', protect, recoveryController.getRecoverySupplements);

// Breathing & Meditation
router.get('/:userId/breathing/exercises', protect, recoveryController.getBreathingExercises);
router.post('/:userId/breathing/session', protect, recoveryController.startBreathingSession);
router.get('/:userId/meditation/programs', protect, recoveryController.getMeditationPrograms);
router.post('/:userId/meditation/log', protect, recoveryController.logMeditation);

// Recovery Devices Integration
router.get('/:userId/devices/recommendations', protect, recoveryController.getDeviceRecommendations);
router.post('/:userId/devices/percussive/session', protect, recoveryController.logPercussiveSession);
router.post('/:userId/devices/compression/session', protect, recoveryController.logCompressionSession);
router.post('/:userId/devices/cold-therapy/session', protect, recoveryController.logColdTherapy);

// Recovery Score Predictions
router.get('/:userId/predictions/tomorrow', protect, recoveryController.predictTomorrowRecovery);
router.get('/:userId/predictions/weekly', protect, recoveryController.predictWeeklyRecovery);
router.post('/:userId/predictions/simulate', protect, recoveryController.simulateRecoveryScenario);

// Recovery Reports
router.get('/:userId/reports/daily', protect, recoveryController.getDailyRecoveryReport);
router.get('/:userId/reports/weekly', protect, recoveryController.getWeeklyRecoveryReport);
router.get('/:userId/reports/insights', protect, recoveryController.getRecoveryInsights);
router.post('/:userId/reports/export', protect, recoveryController.exportRecoveryData);

// Documentation
router.get('/', (req, res) => {
  res.json({
    system: 'Recovery Optimization',
    description: 'Comprehensive recovery tracking and optimization system',
    features: [
      'Recovery scoring algorithms',
      'Sleep optimization',
      'HRV management',
      'Stress tracking',
      'Injury prevention',
      'Recovery protocols',
      'Breathing exercises',
      'Meditation programs',
      'Recovery device integration',
      'Predictive analytics'
    ],
    endpoints: {
      scoring: {
        GET_current: '/:userId/score/current',
        GET_history: '/:userId/score/history',
        GET_trends: '/:userId/score/trends'
      },
      sleep: {
        GET_analysis: '/:userId/sleep/analysis',
        GET_quality: '/:userId/sleep/quality',
        POST_optimize: '/:userId/sleep/optimize-schedule'
      },
      hrv: {
        GET_current: '/:userId/hrv/current',
        GET_baseline: '/:userId/hrv/baseline',
        GET_trends: '/:userId/hrv/trends'
      },
      protocols: {
        POST_generate: '/:userId/protocols/generate',
        GET_library: '/:userId/protocols/library',
        POST_start: '/:userId/protocols/:protocolId/start'
      }
    }
  });
});

module.exports = router;