// mercuryController.js
// Mercury Controller - Health, Wearables, Biometrics, Sleep, Recovery System
// Total Methods: 38
// Base Path: /api/mercury

const WearableDevice = require('../models/mercury/WearableDevice');
const WearableData = require('../models/mercury/WearableData');
const HealthMetric = require('../models/mercury/HealthMetric');
const SleepData = require('../models/mercury/SleepData');
const RecoveryScore = require('../models/mercury/RecoveryScore');
const BiometricSnapshot = require('../models/mercury/BiometricSnapshot');
const BodyComposition = require('../models/mercury/BodyComposition');

// Services
const deviceSync = require('../services/mercury/deviceSync');
const biometricEngine = require('../services/mercury/biometricEngine');
const recoveryCalc = require('../services/mercury/recoveryCalc');
const dexaSimulator = require('../services/mercury/dexaSimulator');
const metabolicCalculator = require('../services/mercury/metabolicCalculator');
const healthRatios = require('../services/mercury/healthRatios');

// ========================================
// A. BIOMETRIC ANALYSIS (10 methods)
// ========================================

// 1. Get DEXA scan simulation
exports.getDexaScan = async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    
    // Simulate full DEXA scan using body measurements + wearable data
    const dexaScan = await dexaSimulator.generateScan(userId);
    
    res.status(200).json({
      success: true,
      data: {
        bodyFatPercentage: dexaScan.bodyFat,
        leanMass: dexaScan.leanMass,
        boneMass: dexaScan.boneMass,
        visceralFat: dexaScan.visceralFat,
        regionalAnalysis: {
          arms: dexaScan.regions.arms,
          legs: dexaScan.regions.legs,
          trunk: dexaScan.regions.trunk,
          android: dexaScan.regions.android,
          gynoid: dexaScan.regions.gynoid
        },
        tScore: dexaScan.boneDensity.tScore,
        zScore: dexaScan.boneDensity.zScore,
        fraxRisk: dexaScan.fraxRisk,
        recommendations: dexaScan.recommendations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating DEXA scan',
      error: error.message
    });
  }
};

// 2. Get comprehensive body composition
exports.getBodyComposition = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Aggregates: DEXA + measurements + calculations
    const composition = await biometricEngine.getComprehensiveComposition(userId);
    
    res.status(200).json({
      success: true,
      data: {
        dexa: composition.dexaData,
        ratios: composition.healthRatios,
        metabolic: composition.metabolicRates,
        predictions: {
          futureBodyFat: composition.predictions.bodyFat,
          leanMassGain: composition.predictions.leanMass
        },
        insights: composition.aiInsights
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving body composition',
      error: error.message
    });
  }
};

// 3. Get metabolic rate analysis
exports.getMetabolicRate = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Calculates BMR, RMR, TDEE using multiple formulas
    const metabolic = await metabolicCalculator.calculate(userId);
    
    res.status(200).json({
      success: true,
      data: {
        bmr: {
          harris: metabolic.bmr.harrisBenedict,
          mifflin: metabolic.bmr.mifflinStJeor,
          katch: metabolic.bmr.katchMcArdle
        },
        rmr: metabolic.rmr,
        tdee: {
          sedentary: metabolic.tdee.sedentary,
          light: metabolic.tdee.lightlyActive,
          moderate: metabolic.tdee.moderatelyActive,
          active: metabolic.tdee.veryActive,
          veryActive: metabolic.tdee.extraActive
        },
        recommended: metabolic.recommended,
        accuracy: metabolic.formulaComparison
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating metabolic rate',
      error: error.message
    });
  }
};

// 4. Calculate metabolic rate (manual input)
exports.calculateMetabolic = async (req, res) => {
  try {
    const { weight, height, age, activityLevel, bodyFat, sex } = req.body;
    
    // Manual calculation without requiring user profile
    const results = await metabolicCalculator.manualCalculate({
      weight,
      height,
      age,
      activityLevel,
      bodyFat,
      sex
    });
    
    res.status(200).json({
      success: true,
      data: {
        bmr: results.bmr,
        tdee: results.tdee,
        recommendations: results.recommendations
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error calculating metabolic rate',
      error: error.message
    });
  }
};

// 5. Get health ratios
exports.getHealthRatios = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Calculates: ABSI, BRI, WHR, waist-to-height ratio
    const ratios = await healthRatios.calculateAll(userId);
    
    res.status(200).json({
      success: true,
      data: {
        absi: {
          value: ratios.absi.value,
          risk: ratios.absi.riskLevel,
          percentile: ratios.absi.percentile
        },
        bri: {
          value: ratios.bri.value,
          category: ratios.bri.category
        },
        whr: {
          value: ratios.whr.value,
          risk: ratios.whr.riskLevel
        },
        waistToHeight: {
          value: ratios.waistToHeight.value,
          category: ratios.waistToHeight.category
        },
        overallRisk: ratios.overallRiskAssessment
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating health ratios',
      error: error.message
    });
  }
};

// 6. Get visceral fat assessment
exports.getVisceralFat = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Estimates visceral fat from waist circumference + body fat
    const visceralFat = await dexaSimulator.estimateVisceralFat(userId);
    
    res.status(200).json({
      success: true,
      data: {
        level: visceralFat.level,
        risk: visceralFat.riskCategory,
        healthImpact: visceralFat.healthImplications,
        recommendations: visceralFat.recommendations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error assessing visceral fat',
      error: error.message
    });
  }
};

// 7. Get bone density analysis
exports.getBoneDensity = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Part of DEXA simulation
    const boneDensity = await dexaSimulator.boneDensityAnalysis(userId);
    
    res.status(200).json({
      success: true,
      data: {
        tScore: boneDensity.tScore,
        zScore: boneDensity.zScore,
        fraxRisk: boneDensity.fraxRisk,
        osteoporosisRisk: boneDensity.osteoporosisRisk,
        recommendations: boneDensity.recommendations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error analyzing bone density',
      error: error.message
    });
  }
};

// 8. Get hydration intelligence
exports.getHydration = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Tracks water intake + calculates needs based on activity
    const hydration = await biometricEngine.analyzeHydration(userId);
    
    res.status(200).json({
      success: true,
      data: {
        status: hydration.status,
        todayIntake: hydration.intakeMl,
        dailyGoal: hydration.goalMl,
        recommendations: hydration.recommendations,
        alerts: hydration.alerts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error analyzing hydration',
      error: error.message
    });
  }
};

// 9. Get biometric trends
exports.getBiometricTrends = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30, metrics = 'bodyFat,leanMass,weight' } = req.query;
    const metricsArray = metrics.split(',');
    
    // Time-series analysis of body composition changes
    const trends = await biometricEngine.analyzeTrends(userId, parseInt(days), metricsArray);
    
    res.status(200).json({
      success: true,
      data: {
        trends: trends.timeSeriesData,
        predictions: trends.futurePredictions,
        insights: trends.aiGeneratedInsights,
        alerts: trends.significantChanges
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error analyzing biometric trends',
      error: error.message
    });
  }
};

// 10. Get biometric correlations
exports.getBiometricCorrelations = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Correlation matrix between all biometric metrics
    const correlations = await biometricEngine.calculateCorrelations(userId);
    
    res.status(200).json({
      success: true,
      data: {
        correlations: correlations.matrix,
        strongestCorrelations: correlations.topCorrelations,
        insights: correlations.insights
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating biometric correlations',
      error: error.message
    });
  }
};

// ========================================
// B. WEARABLE DEVICE MANAGEMENT (6 methods)
// ========================================

// 11. Connect wearable device
exports.connectDevice = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;
    
    // Initiates OAuth2/OAuth1 flow with PKCE support
    const authFlow = await deviceSync.initiateConnection(userId, provider);
    
    res.status(200).json({
      success: true,
      authUrl: authFlow.authorizationUrl,
      state: authFlow.state
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error connecting to ${req.params.provider}`,
      error: error.message
    });
  }
};

// 12. Exchange OAuth code
exports.exchangeToken = async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state } = req.body;
    const userId = req.user.id;
    
    // Exchanges OAuth code for access token
    const device = await deviceSync.exchangeToken(userId, provider, code, state);
    
    res.status(200).json({
      success: true,
      device: device,
      connected: true
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error exchanging token',
      error: error.message
    });
  }
};

// 13. Get all connected devices
exports.getDevices = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const devices = await WearableDevice.find({ userId, isActive: true });
    
    res.status(200).json({
      success: true,
      devices: devices.map(device => ({
        provider: device.provider,
        lastSync: device.lastSync,
        status: device.status,
        connectedAt: device.connectedAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving devices',
      error: error.message
    });
  }
};

// 14. Disconnect device
exports.disconnectDevice = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;
    
    // Disconnects device and revokes OAuth token
    await deviceSync.disconnectDevice(userId, provider);
    
    res.status(200).json({
      success: true,
      message: `${provider} disconnected successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error disconnecting device',
      error: error.message
    });
  }
};

// 15. Manual sync device
exports.syncDevice = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;
    
    // Manually triggers device sync (last 7 days)
    const syncResult = await deviceSync.manualSync(userId, provider);
    
    res.status(200).json({
      success: true,
      recordsAdded: syncResult.recordsAdded,
      lastSync: syncResult.lastSync
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error syncing device',
      error: error.message
    });
  }
};

// 16. Webhook handler
exports.handleWebhook = async (req, res) => {
  try {
    const { provider } = req.params;
    
    // Handles real-time webhooks from Fitbit, Polar
    // Signature verification in controller
    const verified = await deviceSync.verifyWebhookSignature(provider, req);
    
    if (!verified) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
    
    await deviceSync.processWebhook(provider, req.body);
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error processing webhook',
      error: error.message
    });
  }
};

// ========================================
// C. WEARABLE DATA & FUSION (4 methods)
// ========================================

// 17. Get unified wearable data
exports.getWearableData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7, metrics = 'hrv,sleep,steps,rhr' } = req.query;
    const metricsArray = metrics.split(',');
    
    // Returns unified data from all connected devices
    // Multi-device data fusion with conflict resolution
    const data = await deviceSync.getUnifiedData(userId, parseInt(days), metricsArray);
    
    res.status(200).json({
      success: true,
      data: data.fusedData,
      sources: data.sources,
      fusionMethod: data.fusionMethod
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving wearable data',
      error: error.message
    });
  }
};

// 18. Get raw data from specific provider
exports.getRawData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider, days = 3 } = req.query;
    
    const rawData = await WearableData.find({
      userId,
      provider,
      date: { $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) }
    }).sort({ date: -1 });
    
    res.status(200).json({
      success: true,
      provider: provider,
      data: rawData,
      lastSync: rawData[0]?.syncedAt
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving raw data',
      error: error.message
    });
  }
};

// 19. Manual data entry
exports.manualDataEntry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, hrv, rhr, sleep, steps, calories } = req.body;
    
    // Manual data entry for users without wearables
    const data = await WearableData.create({
      userId,
      date,
      hrv,
      rhr,
      sleep,
      steps,
      calories,
      provider: 'manual',
      isManual: true
    });
    
    res.status(201).json({
      success: true,
      data: data
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating manual entry',
      error: error.message
    });
  }
};

// 20. Get AI insights
exports.getInsights = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // AI-generated insights from wearable data
    // Uses Google Gemini to analyze patterns
    const insights = await biometricEngine.generateInsights(userId);
    
    res.status(200).json({
      success: true,
      insights: insights.insights,
      recommendations: insights.recommendations,
      alerts: insights.alerts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating insights',
      error: error.message
    });
  }
};

// ========================================
// D. HRV & HEART RATE (4 methods)
// ========================================

// 21. Get HRV analysis
exports.getHRV = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Returns 7-day HRV trends and analysis
    const hrv = await biometricEngine.analyzeHRV(userId);
    
    res.status(200).json({
      success: true,
      data: {
        average: hrv.average,
        baseline: hrv.baseline,
        deviation: hrv.deviation,
        trend: hrv.trend,
        alert: hrv.alert
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error analyzing HRV',
      error: error.message
    });
  }
};

// 22. Get deep HRV analysis
exports.getDeepHRVAnalysis = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Deep HRV analysis with frequency domain
    const deepHRV = await biometricEngine.deepHRVAnalysis(userId);
    
    res.status(200).json({
      success: true,
      data: {
        timeDomain: deepHRV.timeDomain,
        frequencyDomain: deepHRV.frequencyDomain,
        nonlinear: deepHRV.nonlinear,
        stress: deepHRV.stressLevel
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error performing deep HRV analysis',
      error: error.message
    });
  }
};

// 23. Get heart rate analysis
exports.getHeartRate = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Returns resting heart rate trends
    const heartRate = await biometricEngine.analyzeHeartRate(userId);
    
    res.status(200).json({
      success: true,
      data: {
        rhr: heartRate.restingHeartRate,
        trends: heartRate.trends,
        zones: heartRate.zones,
        recovery: heartRate.recoveryStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error analyzing heart rate',
      error: error.message
    });
  }
};

// 24. Get readiness score
exports.getReadinessScore = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Daily readiness score (0-100)
    // Formula: 40% HRV + 25% sleep + 25% RHR + 10% load
    const readiness = await biometricEngine.calculateReadiness(userId);
    
    res.status(200).json({
      success: true,
      data: {
        score: readiness.score,
        factors: readiness.factors,
        recommendation: readiness.recommendation,
        trainingReady: readiness.trainingReady
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating readiness score',
      error: error.message
    });
  }
};

// ========================================
// E. SLEEP ANALYSIS (3 methods)
// ========================================

// 25. Get sleep data
exports.getSleep = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;
    
    const sleepLogs = await SleepData.find({
      userId,
      date: { $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) }
    }).sort({ date: -1 });
    
    const average = sleepLogs.reduce((sum, log) => sum + log.duration, 0) / sleepLogs.length;
    
    res.status(200).json({
      success: true,
      sleepLogs: sleepLogs,
      average: average,
      trends: await biometricEngine.analyzeSleepTrends(sleepLogs)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving sleep data',
      error: error.message
    });
  }
};

// 26. Get sleep analysis
exports.getSleepAnalysis = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Deep sleep quality analysis
    const analysis = await biometricEngine.analyzeSleepQuality(userId);
    
    res.status(200).json({
      success: true,
      data: {
        quality: analysis.qualityScore,
        stages: analysis.stageBreakdown,
        efficiency: analysis.efficiency,
        recommendations: analysis.recommendations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error analyzing sleep',
      error: error.message
    });
  }
};

// 27. Get sleep recommendations
exports.getSleepRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Personalized sleep optimization advice
    const recommendations = await biometricEngine.generateSleepRecommendations(userId);
    
    res.status(200).json({
      success: true,
      data: {
        bedtime: recommendations.optimalBedtime,
        wakeTime: recommendations.optimalWakeTime,
        tips: recommendations.tips
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating sleep recommendations',
      error: error.message
    });
  }
};

// ========================================
// F. RECOVERY SCORING (11 methods)
// ========================================

// 28. Get latest recovery score
exports.getLatestRecovery = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Today's comprehensive recovery score
    const recovery = await recoveryCalc.calculateRecoveryScore(userId);
    
    res.status(200).json({
      success: true,
      data: {
        score: recovery.score,
        components: recovery.components,
        recommendation: recovery.recommendation,
        trainingLoad: recovery.trainingLoad
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating recovery score',
      error: error.message
    });
  }
};

// 29. Get recovery history
exports.getRecoveryHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;
    
    const scores = await RecoveryScore.find({
      userId,
      date: { $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) }
    }).sort({ date: -1 });
    
    const average = scores.reduce((sum, score) => sum + score.score, 0) / scores.length;
    
    res.status(200).json({
      success: true,
      scores: scores,
      average: average,
      trend: await recoveryCalc.analyzeTrend(scores)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving recovery history',
      error: error.message
    });
  }
};

// 30. Force recalculate recovery
exports.recalculateRecovery = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const recovery = await recoveryCalc.forceRecalculate(userId);
    
    res.status(200).json({
      success: true,
      score: recovery.score,
      recalculated: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error recalculating recovery',
      error: error.message
    });
  }
};

// 31. Get recovery trends
exports.getRecoveryTrends = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 7-day rolling average and trend analysis
    const trends = await recoveryCalc.getTrends(userId);
    
    res.status(200).json({
      success: true,
      data: {
        average: trends.rollingAverage,
        trend: trends.trend,
        alert: trends.alert,
        recommendation: trends.recommendation
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error analyzing recovery trends',
      error: error.message
    });
  }
};

// 32. Get recovery prediction
exports.getRecoveryPrediction = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // ML-based prediction of tomorrow's recovery
    const prediction = await recoveryCalc.predictRecovery(userId);
    
    res.status(200).json({
      success: true,
      data: {
        predictedScore: prediction.score,
        confidence: prediction.confidence,
        factors: prediction.factors
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error predicting recovery',
      error: error.message
    });
  }
};

// 33. Get recovery protocols
exports.getRecoveryProtocols = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Recovery protocol recommendations
    const protocols = await recoveryCalc.generateProtocols(userId);
    
    res.status(200).json({
      success: true,
      data: {
        protocols: protocols.recommendations,
        effectiveness: protocols.effectiveness
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating recovery protocols',
      error: error.message
    });
  }
};

// 34. Get recovery debt
exports.getRecoveryDebt = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Recovery debt calculation
    const debt = await recoveryCalc.calculateDebt(userId);
    
    res.status(200).json({
      success: true,
      data: {
        debt: debt.score,
        daysToRecover: debt.daysToRecover,
        recommendations: debt.recommendations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating recovery debt',
      error: error.message
    });
  }
};

// 35. Assess overtraining risk
exports.getOvertrainingRisk = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const risk = await recoveryCalc.assessOvertrainingRisk(userId);
    
    res.status(200).json({
      success: true,
      data: {
        riskLevel: risk.level,
        indicators: risk.indicators,
        recommendations: risk.recommendations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error assessing overtraining risk',
      error: error.message
    });
  }
};

// 36. Assess training load
exports.getTrainingLoad = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;
    
    const load = await recoveryCalc.calculateTrainingLoad(userId, parseInt(days));
    
    res.status(200).json({
      success: true,
      data: {
        acuteLoad: load.acute,
        chronicLoad: load.chronic,
        ratio: load.ratio,
        status: load.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating training load',
      error: error.message
    });
  }
};

// 37. Get recovery insights
exports.getRecoveryInsights = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const insights = await recoveryCalc.generateInsights(userId);
    
    res.status(200).json({
      success: true,
      insights: insights.insights,
      recommendations: insights.recommendations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating recovery insights',
      error: error.message
    });
  }
};

// 38. Get recovery dashboard
exports.getRecoveryDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const dashboard = await recoveryCalc.getDashboard(userId);
    
    res.status(200).json({
      success: true,
      data: {
        currentScore: dashboard.currentScore,
        trends: dashboard.trends,
        trainingLoad: dashboard.trainingLoad,
        recommendations: dashboard.recommendations,
        insights: dashboard.insights
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error loading recovery dashboard',
      error: error.message
    });
  }
};

module.exports = exports;
