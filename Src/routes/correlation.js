// Src/routes/correlation.js - CROSS-DOMAIN PATTERN DETECTION ROUTES
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const correlationController = require('../controllers/correlationController');

// ============================================
// CORRELATION ENGINE - THE $10M ALGORITHM
// ============================================

// Pattern Detection
router.post('/:userId/patterns/detect', protect, correlationController.detectPatterns);
router.get('/:userId/patterns/all', protect, correlationController.getAllPatterns);
router.get('/:userId/patterns/:patternId', protect, correlationController.getPatternDetails);
router.post('/:userId/patterns/real-time', protect, correlationController.startRealtimeDetection);
router.delete('/:userId/patterns/real-time', protect, correlationController.stopRealtimeDetection);

// Cross-Domain Correlations
router.get('/:userId/correlations/sleep-performance', protect, correlationController.correlateSleepPerformance);
router.get('/:userId/correlations/nutrition-recovery', protect, correlationController.correlateNutritionRecovery);
router.get('/:userId/correlations/stress-injury', protect, correlationController.correlateStressInjury);
router.get('/:userId/correlations/calendar-energy', protect, correlationController.correlateCalendarEnergy);
router.get('/:userId/correlations/spending-stress', protect, correlationController.correlateSpendingStress);
router.get('/:userId/correlations/weather-performance', protect, correlationController.correlateWeatherPerformance);

// Machine Learning Models
router.post('/:userId/ml/train', protect, checkRole(['admin']), correlationController.trainUserModel);
router.get('/:userId/ml/status', protect, correlationController.getModelStatus);
router.post('/:userId/ml/predict', protect, correlationController.runPrediction);
router.get('/:userId/ml/accuracy', protect, correlationController.getModelAccuracy);
router.post('/:userId/ml/retrain', protect, checkRole(['admin']), correlationController.retrainModel);

// Intervention Triggers
router.get('/:userId/triggers/active', protect, correlationController.getActiveTriggers);
router.post('/:userId/triggers/create', protect, correlationController.createTrigger);
router.put('/:userId/triggers/:triggerId', protect, correlationController.updateTrigger);
router.delete('/:userId/triggers/:triggerId', protect, correlationController.deleteTrigger);
router.get('/:userId/triggers/history', protect, correlationController.getTriggerHistory);

// Pattern Learning
router.post('/:userId/learn/behavior', protect, correlationController.learnBehaviorPattern);
router.post('/:userId/learn/preference', protect, correlationController.learnPreferencePattern);
router.get('/:userId/learn/suggestions', protect, correlationController.getLearnedSuggestions);
router.post('/:userId/learn/feedback', protect, correlationController.provideFeedback);

// Correlation Matrix
router.get('/:userId/matrix/full', protect, correlationController.getFullMatrix);
router.get('/:userId/matrix/significant', protect, correlationController.getSignificantCorrelations);
router.post('/:userId/matrix/custom', protect, correlationController.buildCustomMatrix);
router.get('/:userId/matrix/visualize', protect, correlationController.getVisualizationData);

// Anomaly Detection
router.get('/:userId/anomalies/current', protect, correlationController.getCurrentAnomalies);
router.get('/:userId/anomalies/history', protect, correlationController.getAnomalyHistory);
router.post('/:userId/anomalies/investigate', protect, correlationController.investigateAnomaly);
router.post('/:userId/anomalies/dismiss', protect, correlationController.dismissAnomaly);

// Causality Analysis
router.post('/:userId/causality/analyze', protect, correlationController.analyzeCausality);
router.get('/:userId/causality/chains', protect, correlationController.getCausalityChains);
router.get('/:userId/causality/root-causes', protect, correlationController.findRootCauses);
router.post('/:userId/causality/test-hypothesis', protect, correlationController.testHypothesis);

// Time Series Analysis
router.get('/:userId/timeseries/:metric', protect, correlationController.getTimeSeriesData);
router.post('/:userId/timeseries/forecast', protect, correlationController.forecastTimeSeries);
router.get('/:userId/timeseries/seasonality', protect, correlationController.detectSeasonality);
router.get('/:userId/timeseries/cycles', protect, correlationController.detectCycles);

// Pattern Marketplace (Share/Import Patterns)
router.get('/marketplace/browse', protect, correlationController.browsePatterns);
router.post('/marketplace/publish', protect, correlationController.publishPattern);
router.post('/marketplace/import/:patternId', protect, correlationController.importPattern);
router.get('/marketplace/trending', protect, correlationController.getTrendingPatterns);

// Correlation Insights
router.get('/:userId/insights/daily', protect, correlationController.getDailyInsights);
router.get('/:userId/insights/discoveries', protect, correlationController.getNewDiscoveries);
router.get('/:userId/insights/actionable', protect, correlationController.getActionableInsights);
router.post('/:userId/insights/deep-dive', protect, correlationController.runDeepAnalysis);

// System Intelligence
router.get('/system/patterns/global', protect, checkRole(['admin']), correlationController.getGlobalPatterns);
router.get('/system/patterns/demographics', protect, checkRole(['admin']), correlationController.getDemographicPatterns);
router.post('/system/patterns/research', protect, checkRole(['admin']), correlationController.conductResearch);

// WebSocket Endpoints for Real-time
router.ws('/:userId/stream', protect, correlationController.streamCorrelations);

// Documentation
router.get('/', (req, res) => {
  res.json({
    system: 'Correlation Engine',
    value: '$10M Patent-Pending Algorithm',
    description: 'Cross-domain pattern detection and intervention system',
    features: [
      'Real-time pattern detection across 6 planetary systems',
      'Machine learning correlation matrix',
      'Automated intervention triggers',
      'Causality chain analysis',
      'Anomaly detection',
      'Behavioral pattern learning',
      'Time series forecasting',
      'Pattern marketplace',
      'WebSocket real-time streaming'
    ],
    correlations: {
      health_performance: [
        'sleep-performance',
        'nutrition-recovery',
        'hrv-training-load',
        'stress-injury-risk'
      ],
      lifestyle_wellness: [
        'calendar-energy',
        'spending-stress',
        'weather-mood',
        'social-motivation'
      ],
      predictive: [
        'illness-prediction',
        'burnout-forecast',
        'injury-prevention',
        'goal-achievement-probability'
      ]
    },
    endpoints: {
      patterns: {
        POST_detect: '/:userId/patterns/detect',
        GET_all: '/:userId/patterns/all',
        POST_realtime: '/:userId/patterns/real-time'
      },
      ml_models: {
        POST_train: '/:userId/ml/train',
        POST_predict: '/:userId/ml/predict',
        GET_accuracy: '/:userId/ml/accuracy'
      },
      correlations: {
        GET_sleep_performance: '/:userId/correlations/sleep-performance',
        GET_nutrition_recovery: '/:userId/correlations/nutrition-recovery',
        GET_matrix: '/:userId/matrix/full'
      },
      insights: {
        GET_daily: '/:userId/insights/daily',
        GET_discoveries: '/:userId/insights/discoveries',
        POST_deep_dive: '/:userId/insights/deep-dive'
      }
    },
    websocket: {
      endpoint: '/api/correlation/:userId/stream',
      events: [
        'pattern_detected',
        'anomaly_found',
        'intervention_triggered',
        'correlation_update'
      ]
    }
  });
});

module.exports = router;