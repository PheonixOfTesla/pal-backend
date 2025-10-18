// Src/routes/biometric.js - BIOMETRIC ANALYSIS ROUTES
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const biometricController = require('../controllers/biometricController');

// ============================================
// BIOMETRIC ANALYSIS ENGINE
// ============================================

// Heart Rate Analysis
router.get('/:userId/heart-rate/current', protect, biometricController.getCurrentHeartRate);
router.get('/:userId/heart-rate/zones', protect, biometricController.getHeartRateZones);
router.get('/:userId/heart-rate/variability', protect, biometricController.getHRVAnalysis);
router.get('/:userId/heart-rate/trends', protect, biometricController.getHeartRateTrends);
router.post('/:userId/heart-rate/analyze-workout', protect, biometricController.analyzeWorkoutHR);

// Body Composition
router.get('/:userId/body-composition/current', protect, biometricController.getCurrentBodyComposition);
router.get('/:userId/body-composition/history', protect, biometricController.getBodyCompositionHistory);
router.post('/:userId/body-composition/dexa', protect, biometricController.uploadDEXAScan);
router.post('/:userId/body-composition/calculate', protect, biometricController.calculateBodyComposition);
router.get('/:userId/body-composition/predictions', protect, biometricController.predictBodyChanges);

// Metabolic Analysis
router.get('/:userId/metabolic/rmr', protect, biometricController.getRestingMetabolicRate);
router.get('/:userId/metabolic/tdee', protect, biometricController.getTotalDailyEnergyExpenditure);
router.post('/:userId/metabolic/vo2max', protect, biometricController.calculateVO2Max);
router.get('/:userId/metabolic/efficiency', protect, biometricController.getMetabolicEfficiency);
router.get('/:userId/metabolic/adaptation', protect, biometricController.analyzeMetabolicAdaptation);

// Blood Biomarkers
router.post('/:userId/biomarkers/upload', protect, biometricController.uploadBloodWork);
router.get('/:userId/biomarkers/latest', protect, biometricController.getLatestBiomarkers);
router.get('/:userId/biomarkers/trends', protect, biometricController.getBiomarkerTrends);
router.get('/:userId/biomarkers/recommendations', protect, biometricController.getBiomarkerRecommendations);
router.post('/:userId/biomarkers/interpret', protect, biometricController.interpretBiomarkers);

// Breathing Metrics
router.get('/:userId/breathing/rate', protect, biometricController.getBreathingRate);
router.get('/:userId/breathing/patterns', protect, biometricController.getBreathingPatterns);
router.post('/:userId/breathing/analyze', protect, biometricController.analyzeBreathing);
router.get('/:userId/breathing/vo2-correlation', protect, biometricController.correlateBreathingVO2);

// Temperature Tracking
router.post('/:userId/temperature/log', protect, biometricController.logTemperature);
router.get('/:userId/temperature/baseline', protect, biometricController.getTemperatureBaseline);
router.get('/:userId/temperature/variations', protect, biometricController.getTemperatureVariations);
router.post('/:userId/temperature/fever-detection', protect, biometricController.detectFever);

// Blood Pressure
router.post('/:userId/blood-pressure/log', protect, biometricController.logBloodPressure);
router.get('/:userId/blood-pressure/history', protect, biometricController.getBloodPressureHistory);
router.get('/:userId/blood-pressure/analysis', protect, biometricController.analyzeBloodPressure);
router.get('/:userId/blood-pressure/risk', protect, biometricController.assessCardiovascularRisk);

// Glucose Monitoring
router.post('/:userId/glucose/log', protect, biometricController.logGlucose);
router.get('/:userId/glucose/patterns', protect, biometricController.getGlucosePatterns);
router.get('/:userId/glucose/meal-response', protect, biometricController.analyzeMealResponse);
router.post('/:userId/glucose/cgm-sync', protect, biometricController.syncCGMData);

// Hydration Status
router.get('/:userId/hydration/status', protect, biometricController.getHydrationStatus);
router.post('/:userId/hydration/urine-color', protect, biometricController.logUrineColor);
router.get('/:userId/hydration/sweat-rate', protect, biometricController.calculateSweatRate);
router.get('/:userId/hydration/recommendations', protect, biometricController.getHydrationRecommendations);

// Movement Analysis
router.post('/:userId/movement/gait', protect, biometricController.analyzeGait);
router.get('/:userId/movement/asymmetries', protect, biometricController.detectAsymmetries);
router.get('/:userId/movement/flexibility', protect, biometricController.assessFlexibility);
router.post('/:userId/movement/posture', protect, biometricController.analyzePosture);

// Muscle Activation
router.post('/:userId/muscle/emg', protect, biometricController.uploadEMGData);
router.get('/:userId/muscle/activation-patterns', protect, biometricController.getActivationPatterns);
router.get('/:userId/muscle/imbalances', protect, biometricController.detectMuscleImbalances);
router.get('/:userId/muscle/fatigue', protect, biometricController.assessMuscleFatigue);

// Biometric Correlations
router.get('/:userId/correlations/all', protect, biometricController.getAllCorrelations);
router.post('/:userId/correlations/custom', protect, biometricController.runCustomCorrelation);
router.get('/:userId/correlations/performance', protect, biometricController.correlateWithPerformance);
router.get('/:userId/correlations/health-markers', protect, biometricController.correlateHealthMarkers);

// AI Analysis
router.post('/:userId/ai/comprehensive-analysis', protect, biometricController.runComprehensiveAnalysis);
router.get('/:userId/ai/health-score', protect, biometricController.calculateHealthScore);
router.get('/:userId/ai/predictions', protect, biometricController.getPredictiveInsights);
router.post('/:userId/ai/anomaly-detection', protect, biometricController.detectAnomalies);

// Documentation
router.get('/', (req, res) => {
  res.json({
    system: 'Biometric Analysis Engine',
    description: 'Comprehensive biometric data analysis and health monitoring',
    features: [
      'Heart rate variability analysis',
      'Body composition tracking',
      'Metabolic rate calculations',
      'Blood biomarker interpretation',
      'Breathing pattern analysis',
      'Temperature monitoring',
      'Blood pressure tracking',
      'Glucose pattern analysis',
      'Movement and gait analysis',
      'Muscle activation patterns',
      'Cross-metric correlations',
      'AI-powered health scoring'
    ],
    endpoints: {
      heart_rate: {
        GET_current: '/:userId/heart-rate/current',
        GET_zones: '/:userId/heart-rate/zones',
        GET_hrv: '/:userId/heart-rate/variability'
      },
      body_composition: {
        GET_current: '/:userId/body-composition/current',
        POST_dexa: '/:userId/body-composition/dexa',
        GET_predictions: '/:userId/body-composition/predictions'
      },
      metabolic: {
        GET_rmr: '/:userId/metabolic/rmr',
        GET_tdee: '/:userId/metabolic/tdee',
        POST_vo2max: '/:userId/metabolic/vo2max'
      },
      ai_analysis: {
        POST_comprehensive: '/:userId/ai/comprehensive-analysis',
        GET_health_score: '/:userId/ai/health-score',
        GET_predictions: '/:userId/ai/predictions'
      }
    }
  });
});

module.exports = router;