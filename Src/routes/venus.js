// 🌟 VENUS ROUTES - Fitness & Training Intelligence
// Workouts, Nutrition, Body Measurements, Exercises, Performance
// Total Endpoints: 88
// Base Path: /api/venus

const express = require('express');
const router = express.Router();
const venusController = require('../controllers/venusController');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// All routes require authentication
router.use(protect);

// ========== WORKOUT TRACKING (8 endpoints) ==========
router.post('/workouts/start', venusController.startWorkout);
router.post('/workouts/:workoutId/exercise', venusController.logExercise);
router.post('/workouts/:id/complete', venusController.completeWorkout);
router.get('/workouts', venusController.getWorkoutHistory);
router.get('/workouts/active', venusController.getActiveWorkout);
router.get('/workouts/:id', venusController.getWorkout);
router.put('/workouts/:id', venusController.updateWorkout);
router.delete('/workouts/:id', venusController.deleteWorkout);

// ========== WORKOUT INTELLIGENCE (13 endpoints) ==========
router.post('/workouts/recommend', venusController.getWorkoutRecommendations);
router.get('/workouts/similar', venusController.getSimilarWorkouts);
router.get('/workouts/templates/library', venusController.getWorkoutTemplates);
router.post('/workouts/templates/create', venusController.createWorkoutTemplate);
router.get('/workouts/form-analysis', venusController.getFormAnalysis);
router.post('/workouts/form-check', venusController.checkForm);
router.get('/workouts/effectiveness', venusController.getWorkoutEffectiveness);
router.get('/workouts/compare', venusController.compareWorkouts);
router.get('/workouts/intensity-zones', venusController.getIntensityZones);
router.get('/workouts/volume-progression', venusController.getVolumeProgression);
router.get('/workouts/deload-planning', venusController.planDeload);
router.post('/workouts/periodization', venusController.generatePeriodization);
router.get('/workouts/optimal-window', venusController.getOptimalTrainingWindow);

// ========== QUANTUM WORKOUTS (8 endpoints) ==========
router.post('/quantum/generate', venusController.generateQuantumWorkout);
router.get('/quantum/history', venusController.getQuantumHistory);
router.get('/quantum/effectiveness', venusController.analyzeQuantumEffectiveness);
router.get('/quantum/plateau-detection', venusController.getPlateauDetection);
router.get('/quantum/settings', venusController.getQuantumSettings);
router.put('/quantum/settings', venusController.updateQuantumSettings);
router.get('/quantum/chaos-metrics', venusController.getChaosMetrics);
router.post('/quantum/regenerate-seeds', venusController.regenerateSeeds);

// ========== EXERCISE LIBRARY (6 endpoints) ==========
router.get('/exercises', venusController.getExercises);
router.get('/exercises/search', venusController.searchExercises);
router.get('/exercises/:id', venusController.getExercise);
router.get('/exercises/:id/alternatives', venusController.getExerciseAlternatives);
router.post('/exercises', venusController.createExercise);
router.post('/exercises/recommend', venusController.getExerciseRecommendations);

// ========== PROGRESSIVE OVERLOAD (4 endpoints) ==========
router.get('/progress/overload', venusController.getProgressiveOverload);
router.post('/progress/1rm', venusController.calculateOneRepMax);
router.get('/progress/standards', venusController.getStrengthStandards);
router.get('/progress/records', venusController.getPersonalRecords);

// ========== NUTRITION LOGGING (10 endpoints) ==========
router.post('/nutrition/log', venusController.logMeal);
router.get('/nutrition/logs', venusController.getNutritionLogs);
router.put('/nutrition/logs/:id', venusController.updateMeal);
router.delete('/nutrition/logs/:id', venusController.deleteMeal);
router.get('/nutrition/macros', venusController.getMacroSummary);
router.post('/nutrition/targets', venusController.setMacroTargets);
router.post('/nutrition/targets/calculate', venusController.calculateMacroTargets);
router.get('/nutrition/insights', venusController.getNutritionInsights);
router.post('/nutrition/water', venusController.trackWaterIntake);
router.get('/nutrition/water', venusController.getWaterTracking);

// ========== AI MEAL PLANNING (8 endpoints) ==========
router.post('/nutrition/meal-plan/generate', venusController.generateMealPlan);
router.post('/nutrition/photo-analyze', upload.single('image'), venusController.analyzeFoodPhoto);
router.post('/nutrition/barcode-scan', venusController.scanBarcode);
router.post('/nutrition/recipe-suggest', venusController.getRecipeSuggestions);
router.get('/nutrition/meal-prep', venusController.getMealPrepPlans);
router.post('/nutrition/meal-prep/plan', venusController.createMealPrepPlan);
router.get('/nutrition/restaurants', venusController.analyzeRestaurant);
router.post('/nutrition/restaurants/analyze', venusController.getRestaurantRecommendations);

// ========== SUPPLEMENT TRACKING (4 endpoints) ==========
router.post('/supplements/log', venusController.logSupplement);
router.get('/supplements', venusController.getSupplementLog);
router.get('/supplements/interactions', venusController.checkSupplementInteractions);
router.post('/supplements/stack-builder', venusController.buildSupplementStack);

// ========== BODY MEASUREMENTS (9 endpoints) ==========
router.post('/body/measurements', venusController.logBodyMeasurement);
router.get('/body/measurements', venusController.getBodyMeasurements);
router.get('/body/composition', venusController.getBodyCompositionAnalysis);
router.post('/body/photos', upload.single('photo'), venusController.uploadProgressPhoto);
router.get('/body/photos', venusController.getProgressPhotos);
router.get('/body/photos/compare', venusController.compareProgressPhotos);
router.get('/body/recomp-analysis', venusController.getRecompAnalysis);
router.get('/body/muscle-symmetry', venusController.getMuscleSymmetry);
router.get('/body/fat-distribution', venusController.getFatDistribution);

// ========== PERFORMANCE TESTING (7 endpoints) ==========
router.post('/performance/tests', venusController.createPerformanceTest);
router.post('/performance/tests/:id/results', venusController.recordTestResults);
router.get('/performance/tests', venusController.getPerformanceTests);
router.get('/performance/benchmarks', venusController.getPerformanceBenchmarks);
router.get('/performance/standards', venusController.getStrengthStandardsDetailed);
router.get('/performance/percentile', venusController.getPerformancePercentile);
router.get('/performance/predictions', venusController.getPerformancePredictions);

// ========== SOCIAL FEATURES (6 endpoints) ==========
router.get('/social/feed', venusController.getSocialFeed);
router.post('/social/share', venusController.shareWorkout);
router.get('/social/challenges', venusController.getChallenges);
router.post('/social/challenges/join', venusController.joinChallenge);
router.get('/social/friends', venusController.getFriends);
router.post('/social/friends/add', venusController.addFriend);

// ========== INJURY RISK & PREVENTION (5 endpoints) ==========
router.get('/injury-risk/assessment', venusController.getInjuryRiskAssessment);
router.get('/injury-risk/history', venusController.getInjuryHistory);
router.post('/injury-risk/report', venusController.reportInjury);
router.get('/injury-risk/prevention', venusController.getPreventionProtocols);
router.get('/injury-risk/rehab-protocols', venusController.getRehabProtocols);

module.exports = router;

// ========== ENDPOINT SUMMARY ==========
// Total: 88 endpoints
// 
// Workout Tracking: 8 endpoints
// Workout Intelligence: 13 endpoints
// Quantum Workouts: 8 endpoints
// Exercise Library: 6 endpoints
// Progressive Overload: 4 endpoints
// Nutrition Logging: 10 endpoints
// AI Meal Planning: 8 endpoints
// Supplement Tracking: 4 endpoints
// Body Measurements: 9 endpoints
// Performance Testing: 7 endpoints
// Social Features: 6 endpoints
// Injury Risk & Prevention: 5 endpoints
// 
// ✅ 100% Feature Parity with Blueprint
