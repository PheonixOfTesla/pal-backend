// Src/routes/venus.js - NUTRITION AI ROUTES
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const venusController = require('../controllers/venusController');

// ============================================
// VENUS - NUTRITION INTELLIGENCE PLANET
// ============================================

// Meal Planning AI
router.post('/:userId/generate-meal-plan', protect, venusController.generateMealPlan);
router.get('/:userId/meal-plan/weekly', protect, venusController.getWeeklyMealPlan);
router.post('/:userId/meal-plan/customize', protect, venusController.customizeMealPlan);
router.get('/:userId/recipe/:recipeId', protect, venusController.getRecipeDetails);

// Macro Optimization
router.get('/:userId/macro-analysis', protect, venusController.getMacroAnalysis);
router.post('/:userId/optimize-macros', protect, venusController.optimizeMacros);
router.get('/:userId/macro-timing', protect, venusController.getMacroTiming);
router.post('/:userId/adjust-for-training', protect, venusController.adjustMacrosForTraining);

// Nutritional Tracking
router.post('/:userId/log-meal', protect, venusController.logMeal);
router.post('/:userId/quick-add/:barcode', protect, venusController.quickAddByBarcode);
router.get('/:userId/daily-summary', protect, venusController.getDailySummary);
router.get('/:userId/weekly-trends', protect, venusController.getWeeklyTrends);

// Food Database & Search
router.get('/food/search', protect, venusController.searchFood);
router.get('/food/:foodId', protect, venusController.getFoodDetails);
router.post('/food/custom', protect, venusController.addCustomFood);
router.get('/food/favorites/:userId', protect, venusController.getFavoriteFoods);

// Recipe Generation AI
router.post('/:userId/generate-recipe', protect, venusController.generateRecipe);
router.post('/:userId/recipe-from-ingredients', protect, venusController.createRecipeFromIngredients);
router.get('/:userId/recipe-suggestions', protect, venusController.getRecipeSuggestions);
router.post('/:userId/recipe/save', protect, venusController.saveRecipe);

// Grocery & Shopping
router.post('/:userId/generate-grocery-list', protect, venusController.generateGroceryList);
router.get('/:userId/grocery-list/current', protect, venusController.getCurrentGroceryList);
router.post('/:userId/grocery-list/update', protect, venusController.updateGroceryList);
router.get('/:userId/meal-prep-guide', protect, venusController.getMealPrepGuide);

// Supplement Optimization
router.get('/:userId/supplement-recommendations', protect, venusController.getSupplementRecommendations);
router.post('/:userId/supplement-stack', protect, venusController.createSupplementStack);
router.get('/:userId/supplement-timing', protect, venusController.getSupplementTiming);
router.post('/:userId/log-supplements', protect, venusController.logSupplements);

// Hydration Tracking
router.get('/:userId/hydration-status', protect, venusController.getHydrationStatus);
router.post('/:userId/log-water', protect, venusController.logWaterIntake);
router.get('/:userId/hydration-recommendations', protect, venusController.getHydrationRecommendations);

// Body Composition Correlation
router.get('/:userId/nutrition-body-correlation', protect, venusController.getNutritionBodyCorrelation);
router.post('/:userId/predict-weight-change', protect, venusController.predictWeightChange);
router.get('/:userId/optimal-deficit-surplus', protect, venusController.getOptimalDeficitSurplus);

// Restaurant & Dining Out
router.get('/restaurant/search', protect, venusController.searchRestaurants);
router.get('/restaurant/:restaurantId/menu', protect, venusController.getRestaurantMenu);
router.post('/:userId/restaurant/recommendations', protect, venusController.getRestaurantRecommendations);
router.post('/:userId/analyze-menu-photo', protect, venusController.analyzeMenuPhoto);

// Dietary Restrictions & Preferences
router.post('/:userId/preferences', protect, venusController.updateDietaryPreferences);
router.get('/:userId/preferences', protect, venusController.getDietaryPreferences);
router.post('/:userId/allergies', protect, venusController.updateAllergies);
router.get('/:userId/food-alternatives', protect, venusController.getFoodAlternatives);

// AI Nutritionist Chat
router.post('/:userId/nutritionist/chat', protect, venusController.chatWithNutritionist);
router.get('/:userId/nutritionist/analysis', protect, venusController.getNutritionAnalysis);
router.post('/:userId/nutritionist/photo-analysis', protect, venusController.analyzeFoodPhoto);

// Documentation
router.get('/', (req, res) => {
  res.json({
    planet: 'Venus',
    domain: 'Nutrition Intelligence',
    description: 'AI-powered nutrition optimization and meal planning',
    features: [
      'Intelligent meal plan generation',
      'Macro optimization algorithms',
      'Recipe creation AI',
      'Barcode scanning',
      'Restaurant menu analysis',
      'Supplement recommendations',
      'Food photo analysis',
      'Grocery list automation',
      'Hydration tracking',
      'Body composition correlation'
    ],
    endpoints: {
      meal_planning: {
        POST_generate: '/:userId/generate-meal-plan',
        GET_weekly: '/:userId/meal-plan/weekly',
        POST_customize: '/:userId/meal-plan/customize'
      },
      tracking: {
        POST_log_meal: '/:userId/log-meal',
        POST_barcode: '/:userId/quick-add/:barcode',
        GET_summary: '/:userId/daily-summary'
      },
      ai_features: {
        POST_generate_recipe: '/:userId/generate-recipe',
        POST_analyze_photo: '/:userId/nutritionist/photo-analysis',
        POST_chat: '/:userId/nutritionist/chat'
      },
      optimization: {
        POST_optimize_macros: '/:userId/optimize-macros',
        GET_timing: '/:userId/macro-timing',
        GET_supplements: '/:userId/supplement-recommendations'
      }
    }
  });
});

module.exports = router;