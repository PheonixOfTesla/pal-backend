// Src/controllers/mealController.js
const Nutrition = require('../models/Nutrition');
const User = require('../models/User');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

/**
 * Log a meal
 * POST /api/meals/:userId/log
 */
exports.logMeal = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      mealType, // breakfast, lunch, dinner, snack
      foods,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sugar,
      sodium,
      timestamp,
      photo,
      notes
    } = req.body;
    
    // Get or create nutrition plan
    let nutrition = await Nutrition.findOne({ clientId: userId });
    
    if (!nutrition) {
      nutrition = await Nutrition.create({
        clientId: userId,
        assignedBy: req.user.id,
        protein: { target: 150, current: 0 },
        carbs: { target: 200, current: 0 },
        fat: { target: 60, current: 0 },
        calories: { target: 2000, current: 0 }
      });
    }
    
    // Create meal entry
    const mealEntry = {
      date: timestamp || new Date(),
      mealType,
      foods: foods || [],
      calories: calories || 0,
      protein: protein || 0,
      carbs: carbs || 0,
      fat: fat || 0,
      fiber: fiber || 0,
      sugar: sugar || 0,
      sodium: sodium || 0,
      photo,
      notes
    };
    
    // Add to daily logs
    if (!nutrition.dailyLogs) nutrition.dailyLogs = [];
    nutrition.dailyLogs.push(mealEntry);
    
    // Update daily totals
    const today = new Date().toDateString();
    const todaysMeals = nutrition.dailyLogs.filter(log => 
      new Date(log.date).toDateString() === today
    );
    
    const todaysTotals = todaysMeals.reduce((totals, meal) => ({
      calories: totals.calories + (meal.calories || 0),
      protein: totals.protein + (meal.protein || 0),
      carbs: totals.carbs + (meal.carbs || 0),
      fat: totals.fat + (meal.fat || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    
    nutrition.calories.current = todaysTotals.calories;
    nutrition.protein.current = todaysTotals.protein;
    nutrition.carbs.current = todaysTotals.carbs;
    nutrition.fat.current = todaysTotals.fat;
    
    await nutrition.save();
    
    // Calculate adherence
    const adherence = calculateAdherence(nutrition);
    
    res.json({
      success: true,
      data: {
        meal: mealEntry,
        dailyTotals: todaysTotals,
        targets: {
          calories: nutrition.calories.target,
          protein: nutrition.protein.target,
          carbs: nutrition.carbs.target,
          fat: nutrition.fat.target
        },
        adherence,
        remaining: {
          calories: Math.max(0, nutrition.calories.target - todaysTotals.calories),
          protein: Math.max(0, nutrition.protein.target - todaysTotals.protein),
          carbs: Math.max(0, nutrition.carbs.target - todaysTotals.carbs),
          fat: Math.max(0, nutrition.fat.target - todaysTotals.fat)
        }
      }
    });
  } catch (error) {
    console.error('Log meal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log meal'
    });
  }
};

/**
 * Get meal history
 * GET /api/meals/:userId/history
 */
exports.getMealHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 7 } = req.query;
    
    const nutrition = await Nutrition.findOne({ clientId: userId });
    
    if (!nutrition || !nutrition.dailyLogs) {
      return res.json({
        success: true,
        data: {
          meals: [],
          summary: {},
          message: 'No meal history found'
        }
      });
    }
    
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentMeals = nutrition.dailyLogs
      .filter(log => new Date(log.date) >= startDate)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Group by day
    const mealsByDay = {};
    recentMeals.forEach(meal => {
      const day = new Date(meal.date).toDateString();
      if (!mealsByDay[day]) {
        mealsByDay[day] = {
          date: day,
          meals: [],
          totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }
        };
      }
      mealsByDay[day].meals.push(meal);
      mealsByDay[day].totals.calories += meal.calories || 0;
      mealsByDay[day].totals.protein += meal.protein || 0;
      mealsByDay[day].totals.carbs += meal.carbs || 0;
      mealsByDay[day].totals.fat += meal.fat || 0;
    });
    
    // Calculate averages
    const daysWithMeals = Object.keys(mealsByDay).length;
    const averages = daysWithMeals > 0 ? {
      calories: Object.values(mealsByDay).reduce((sum, day) => sum + day.totals.calories, 0) / daysWithMeals,
      protein: Object.values(mealsByDay).reduce((sum, day) => sum + day.totals.protein, 0) / daysWithMeals,
      carbs: Object.values(mealsByDay).reduce((sum, day) => sum + day.totals.carbs, 0) / daysWithMeals,
      fat: Object.values(mealsByDay).reduce((sum, day) => sum + day.totals.fat, 0) / daysWithMeals
    } : { calories: 0, protein: 0, carbs: 0, fat: 0 };
    
    res.json({
      success: true,
      data: {
        mealsByDay,
        totalMeals: recentMeals.length,
        averages,
        targets: {
          calories: nutrition.calories.target,
          protein: nutrition.protein.target,
          carbs: nutrition.carbs.target,
          fat: nutrition.fat.target
        }
      }
    });
  } catch (error) {
    console.error('Get meal history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meal history'
    });
  }
};

/**
 * Get personalized meal suggestions
 * GET /api/meals/:userId/suggestions
 */
exports.getMealSuggestions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { mealType = 'lunch' } = req.query;
    
    // Get user's nutrition plan and recent activity
    const [nutrition, todaysWorkout, wearableData] = await Promise.all([
      Nutrition.findOne({ clientId: userId }),
      Workout.findOne({
        clientId: userId,
        scheduledDate: {
          $gte: new Date().setHours(0, 0, 0, 0),
          $lte: new Date().setHours(23, 59, 59, 999)
        }
      }),
      WearableData.findOne({ userId }).sort('-date')
    ]);
    
    // Calculate what's needed
    const todaysTotals = nutrition ? {
      calories: nutrition.calories.current || 0,
      protein: nutrition.protein.current || 0,
      carbs: nutrition.carbs.current || 0,
      fat: nutrition.fat.current || 0
    } : { calories: 0, protein: 0, carbs: 0, fat: 0 };
    
    const remaining = nutrition ? {
      calories: Math.max(0, nutrition.calories.target - todaysTotals.calories),
      protein: Math.max(0, nutrition.protein.target - todaysTotals.protein),
      carbs: Math.max(0, nutrition.carbs.target - todaysTotals.carbs),
      fat: Math.max(0, nutrition.fat.target - todaysTotals.fat)
    } : { calories: 600, protein: 30, carbs: 60, fat: 20 };
    
    // Adjust for workout
    const hasWorkout = todaysWorkout && !todaysWorkout.completed;
    const postWorkout = todaysWorkout && todaysWorkout.completed;
    
    // Generate suggestions based on context
    const suggestions = generateMealSuggestions(
      mealType,
      remaining,
      hasWorkout,
      postWorkout,
      wearableData
    );
    
    // Generate AI-powered custom suggestion if available
    let aiSuggestion = null;
    if (process.env.GOOGLE_AI_API_KEY) {
      aiSuggestion = await generateAIMealSuggestion(
        mealType,
        remaining,
        hasWorkout,
        postWorkout,
        nutrition?.mealPlan
      );
    }
    
    res.json({
      success: true,
      data: {
        mealType,
        context: {
          hasWorkout,
          postWorkout,
          recoveryScore: wearableData?.recoveryScore || null
        },
        remaining,
        suggestions,
        aiSuggestion
      }
    });
  } catch (error) {
    console.error('Get meal suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate meal suggestions'
    });
  }
};

/**
 * Analyze meal photo with AI
 * POST /api/meals/:userId/analyze-photo
 */
exports.analyzePhoto = async (req, res) => {
  try {
    const { userId } = req.params;
    const { photo } = req.body; // Base64 encoded image
    
    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(501).json({
        success: false,
        message: 'Photo analysis not configured'
      });
    }
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp'
    });
    
    const prompt = `Analyze this meal photo and estimate:
    1. Food items present
    2. Approximate calories
    3. Protein (g)
    4. Carbs (g)
    5. Fat (g)
    6. Meal quality score (1-10)
    
    Respond in JSON format with these exact fields: 
    foods[], calories, protein, carbs, fat, quality, notes`;
    
    try {
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: photo,
            mimeType: 'image/jpeg'
          }
        }
      ]);
      
      const response = result.response.text();
      const analysis = JSON.parse(response.replace(/```json\n?|\n?```/g, ''));
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (aiError) {
      console.error('AI photo analysis error:', aiError);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze photo',
        fallback: {
          foods: ['Unable to analyze'],
          calories: 500,
          protein: 25,
          carbs: 50,
          fat: 20,
          quality: 5,
          notes: 'Manual entry recommended'
        }
      });
    }
  } catch (error) {
    console.error('Analyze photo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process photo'
    });
  }
};

/**
 * Get meal plan
 * GET /api/meals/:userId/plan
 */
exports.getMealPlan = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const nutrition = await Nutrition.findOne({ clientId: userId });
    
    if (!nutrition || !nutrition.mealPlan) {
      return res.json({
        success: true,
        data: {
          mealPlan: {
            breakfast: 'Not set - add your typical breakfast',
            lunch: 'Not set - add your typical lunch',
            dinner: 'Not set - add your typical dinner',
            snacks: 'Not set - add your typical snacks'
          },
          message: 'No meal plan configured'
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        mealPlan: nutrition.mealPlan,
        macroTargets: {
          protein: nutrition.protein.target,
          carbs: nutrition.carbs.target,
          fat: nutrition.fat.target,
          calories: nutrition.calories.target
        },
        lastUpdated: nutrition.updatedAt
      }
    });
  } catch (error) {
    console.error('Get meal plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meal plan'
    });
  }
};

/**
 * Update meal plan
 * PUT /api/meals/:userId/plan
 */
exports.updateMealPlan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { breakfast, lunch, dinner, snacks } = req.body;
    
    let nutrition = await Nutrition.findOne({ clientId: userId });
    
    if (!nutrition) {
      nutrition = await Nutrition.create({
        clientId: userId,
        assignedBy: req.user.id,
        protein: { target: 150, current: 0 },
        carbs: { target: 200, current: 0 },
        fat: { target: 60, current: 0 },
        calories: { target: 2000, current: 0 }
      });
    }
    
    if (breakfast !== undefined) nutrition.mealPlan.breakfast = breakfast;
    if (lunch !== undefined) nutrition.mealPlan.lunch = lunch;
    if (dinner !== undefined) nutrition.mealPlan.dinner = dinner;
    if (snacks !== undefined) nutrition.mealPlan.snacks = snacks;
    
    nutrition.updatedAt = new Date();
    await nutrition.save();
    
    res.json({
      success: true,
      data: {
        mealPlan: nutrition.mealPlan,
        message: 'Meal plan updated successfully'
      }
    });
  } catch (error) {
    console.error('Update meal plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update meal plan'
    });
  }
};

// Helper functions
function calculateAdherence(nutrition) {
  const targets = {
    calories: nutrition.calories.target,
    protein: nutrition.protein.target,
    carbs: nutrition.carbs.target,
    fat: nutrition.fat.target
  };
  
  const current = {
    calories: nutrition.calories.current,
    protein: nutrition.protein.current,
    carbs: nutrition.carbs.current,
    fat: nutrition.fat.current
  };
  
  const adherence = {};
  
  Object.keys(targets).forEach(key => {
    if (targets[key] > 0) {
      const percentage = Math.min((current[key] / targets[key]) * 100, 150);
      adherence[key] = {
        percentage: Math.round(percentage),
        status: percentage < 80 ? 'low' : percentage > 120 ? 'high' : 'good'
      };
    }
  });
  
  const overall = Object.values(adherence)
    .reduce((sum, a) => sum + a.percentage, 0) / Object.keys(adherence).length;
  
  adherence.overall = {
    percentage: Math.round(overall),
    status: overall < 80 ? 'needs_improvement' : overall > 110 ? 'adjust_portions' : 'excellent'
  };
  
  return adherence;
}

function generateMealSuggestions(mealType, remaining, hasWorkout, postWorkout, wearableData) {
  const suggestions = [];
  
  // Post-workout specific
  if (postWorkout) {
    suggestions.push({
      name: 'Recovery Shake',
      description: 'Whey protein, banana, spinach, almond milk',
      macros: { calories: 320, protein: 30, carbs: 35, fat: 8 },
      timing: 'Within 30 minutes post-workout',
      benefits: 'Optimal recovery and muscle synthesis'
    });
  }
  
  // Pre-workout specific
  if (hasWorkout && mealType === 'snack') {
    suggestions.push({
      name: 'Pre-Workout Fuel',
      description: 'Apple with almond butter',
      macros: { calories: 200, protein: 6, carbs: 25, fat: 10 },
      timing: '30-60 minutes before workout',
      benefits: 'Quick energy without digestive stress'
    });
  }
  
  // General suggestions based on remaining macros
  if (remaining.protein > 25) {
    suggestions.push({
      name: 'High-Protein Option',
      description: 'Grilled chicken breast with quinoa and vegetables',
      macros: { calories: 420, protein: 38, carbs: 35, fat: 12 },
      benefits: 'Helps meet protein target'
    });
  }
  
  if (remaining.carbs > 40 && mealType === 'breakfast') {
    suggestions.push({
      name: 'Energizing Breakfast',
      description: 'Oatmeal with berries, honey, and Greek yogurt',
      macros: { calories: 380, protein: 18, carbs: 55, fat: 10 },
      benefits: 'Sustained energy for the morning'
    });
  }
  
  // Low recovery adjustment
  if (wearableData?.recoveryScore < 50) {
    suggestions.push({
      name: 'Anti-Inflammatory Bowl',
      description: 'Salmon, sweet potato, and leafy greens',
      macros: { calories: 450, protein: 32, carbs: 40, fat: 18 },
      benefits: 'Supports recovery with omega-3s'
    });
  }
  
  return suggestions;
}

async function generateAIMealSuggestion(mealType, remaining, hasWorkout, postWorkout, existingPlan) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 200
      }
    });
    
    const prompt = `Create a specific ${mealType} suggestion:
    Remaining macros needed: ${remaining.calories} cal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat
    Context: ${postWorkout ? 'Post-workout recovery needed' : hasWorkout ? 'Pre-workout fuel needed' : 'Regular meal'}
    ${existingPlan ? `User typically eats: ${existingPlan[mealType]}` : ''}
    
    Provide ONE specific meal with exact ingredients and portions. Keep it practical and easy to prepare.`;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('AI meal suggestion error:', error);
    return null;
  }
}

module.exports = exports;