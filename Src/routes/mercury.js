// mercury.js
// Mercury Routes - Health, Wearables, Biometrics, Sleep, Recovery
// Base Path: /api/mercury
// Total Endpoints: 38

const express = require('express');
const router = express.Router();
const mercuryController = require('../controllers/mercuryController');
const { protect } = require('../middleware/auth');

// ========================================
// BIOMETRIC ANALYSIS (10 endpoints)
// ========================================

// DEXA scan simulation
router.get('/biometrics/dexa', protect, mercuryController.getDexaScan);

// Comprehensive body composition
router.get('/biometrics/composition', protect, mercuryController.getBodyComposition);

// Metabolic rate analysis
router.get('/biometrics/metabolic', protect, mercuryController.getMetabolicRate);
router.post('/biometrics/metabolic/calculate', protect, mercuryController.calculateMetabolic);

// Health ratios and assessments
router.get('/biometrics/ratios', protect, mercuryController.getHealthRatios);
router.get('/biometrics/visceral-fat', protect, mercuryController.getVisceralFat);
router.get('/biometrics/bone-density', protect, mercuryController.getBoneDensity);
router.get('/biometrics/hydration', protect, mercuryController.getHydration);

// Trends and correlations
router.get('/biometrics/trends', protect, mercuryController.getBiometricTrends);
router.get('/biometrics/correlations', protect, mercuryController.getBiometricCorrelations);

// ========================================
// WEARABLE DEVICE MANAGEMENT (6 endpoints)
// ========================================

// Device connection and management
router.post('/devices/:provider/connect', protect, mercuryController.connectDevice);
router.post('/devices/:provider/exchange', protect, mercuryController.exchangeToken);
router.get('/devices', protect, mercuryController.getDevices);
router.delete('/devices/:provider', protect, mercuryController.disconnectDevice);
router.post('/devices/:provider/sync', protect, mercuryController.syncDevice);

// Webhook handler (no auth - signature verified in controller)
router.post('/webhook/:provider', mercuryController.handleWebhook);

// ========================================
// WEARABLE DATA & FUSION (4 endpoints)
// ========================================

// Data retrieval
router.get('/data', protect, mercuryController.getWearableData);
router.get('/data/raw', protect, mercuryController.getRawData);
router.post('/data/manual', protect, mercuryController.manualDataEntry);

// AI insights
router.get('/insights', protect, mercuryController.getInsights);

// ========================================
// HRV & HEART RATE (4 endpoints)
// ========================================

// HRV analysis
router.get('/biometrics/hrv', protect, mercuryController.getHRV);
router.get('/biometrics/hrv/deep-analysis', protect, mercuryController.getDeepHRVAnalysis);

// Heart rate analysis
router.get('/biometrics/heart-rate', protect, mercuryController.getHeartRate);

// Readiness score
router.get('/biometrics/readiness', protect, mercuryController.getReadinessScore);

// ========================================
// SLEEP ANALYSIS (3 endpoints)
// ========================================

// Sleep data and analysis
router.get('/sleep', protect, mercuryController.getSleep);
router.get('/sleep/analysis', protect, mercuryController.getSleepAnalysis);
router.get('/sleep/recommendations', protect, mercuryController.getSleepRecommendations);

// ========================================
// RECOVERY SCORING (11 endpoints)
// ========================================

// Recovery scores
router.get('/recovery/latest', protect, mercuryController.getLatestRecovery);
router.get('/recovery/history', protect, mercuryController.getRecoveryHistory);
router.post('/recovery/calculate', protect, mercuryController.recalculateRecovery);
router.get('/recovery/trends', protect, mercuryController.getRecoveryTrends);

// Recovery prediction and protocols
router.get('/recovery/prediction', protect, mercuryController.getRecoveryPrediction);
router.get('/recovery/protocols', protect, mercuryController.getRecoveryProtocols);
router.get('/recovery/debt', protect, mercuryController.getRecoveryDebt);

// Training load and risk assessment
router.get('/recovery/overtraining-risk', protect, mercuryController.getOvertrainingRisk);
router.get('/recovery/training-load', protect, mercuryController.getTrainingLoad);

// Recovery insights and dashboard
router.get('/recovery/insights', protect, mercuryController.getRecoveryInsights);
router.get('/recovery/dashboard', protect, mercuryController.getRecoveryDashboard);

module.exports = router;
