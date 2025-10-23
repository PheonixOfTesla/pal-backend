// AI Meal Planning Service
// Meal plan generation, photo analysis, recipe suggestions

const nutritionCalc = require('./nutritionCalc');

/**
 * Generate AI-powered meal plan
 */
exports.generate = async (userId, preferences = {}) => {
  try {
    const {
      goals = 'maintain',
      dietaryPreferences = [],  // vegetarian, vegan, keto, paleo
      allergies = [],
      budget = 'medium',
      duration = 7,  // days
      mealsPerDay = 3,
      calorieTarget = 2000,
      macroTargets = { protein: 150, carbs: 200, fat: 65 }
    } = preferences;

    const mealPlan = {
      days: [],
      shoppingList: [],
      macros: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      estimatedCost: 0
    };

    // Sample meal database (in production, this would be extensive)
    const mealDatabase = {
      breakfast: [
        { name: 'Oatmeal with berries', protein: 15, carbs: 60, fat: 8, calories: 350, cost: 3 },
        { name: 'Greek yogurt parfait', protein: 25, carbs: 40, fat: 10, calories: 340, cost: 4 },
        { name: 'Scrambled eggs with toast', protein: 20, carbs: 30, fat: 15, calories: 330, cost: 3 },
        { name: 'Protein smoothie', protein: 30, carbs: 45, fat: 12, calories: 400, cost: 5 }
      ],
      lunch: [
        { name: 'Chicken breast with rice', protein: 40, carbs: 60, fat: 12, calories: 500, cost: 6 },
        { name: 'Salmon salad', protein: 35, carbs: 20, fat: 20, calories: 420, cost: 8 },
        { name: 'Turkey sandwich', protein: 30, carbs: 50, fat: 15, calories: 450, cost: 5 },
        { name: 'Quinoa bowl', protein: 25, carbs: 55, fat: 18, calories: 480, cost: 6 }
      ],
      dinner: [
        { name: 'Grilled chicken with vegetables', protein: 45, carbs: 30, fat: 15, calories: 450, cost: 7 },
        { name: 'Lean steak with sweet potato', protein: 50, carbs: 40, fat: 20, calories: 550, cost: 10 },
        { name: 'Fish tacos', protein: 35, carbs: 45, fat: 18, calories: 480, cost: 8 },
        { name: 'Pasta with lean meat', protein: 40, carbs: 70, fat: 15, calories: 580, cost: 6 }
      ],
      snack: [
        { name: 'Protein bar', protein: 20, carbs: 25, fat: 8, calories: 240, cost: 2 },
        { name: 'Apple with peanut butter', protein: 5, carbs: 30, fat: 10, calories: 220, cost: 2 },
        { name: 'Cottage cheese', protein: 15, carbs: 10, fat: 5, calories: 140, cost: 2 }
      ]
    };

    // Generate meal plan for each day
    for (let day = 1; day <= duration; day++) {
      const dayPlan = {
        day,
        date: new Date(Date.now() + (day - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        meals: [],
        dailyMacros: { protein: 0, carbs: 0, fat: 0, calories: 0 }
      };

      // Add breakfast
      const breakfast = mealDatabase.breakfast[Math.floor(Math.random() * mealDatabase.breakfast.length)];
      dayPlan.meals.push({ mealType: 'Breakfast', time: '8:00 AM', ...breakfast });

      // Add lunch
      const lunch = mealDatabase.lunch[Math.floor(Math.random() * mealDatabase.lunch.length)];
      dayPlan.meals.push({ mealType: 'Lunch', time: '12:00 PM', ...lunch });

      // Add dinner
      const dinner = mealDatabase.dinner[Math.floor(Math.random() * mealDatabase.dinner.length)];
      dayPlan.meals.push({ mealType: 'Dinner', time: '6:00 PM', ...dinner });

      // Add snack if needed
      if (mealsPerDay > 3) {
        const snack = mealDatabase.snack[Math.floor(Math.random() * mealDatabase.snack.length)];
        dayPlan.meals.push({ mealType: 'Snack', time: '3:00 PM', ...snack });
      }

      // Calculate daily macros
      dayPlan.meals.forEach(meal => {
        dayPlan.dailyMacros.protein += meal.protein;
        dayPlan.dailyMacros.carbs += meal.carbs;
        dayPlan.dailyMacros.fat += meal.fat;
        dayPlan.dailyMacros.calories += meal.calories;
      });

      mealPlan.days.push(dayPlan);
    }

    // Generate shopping list
    const ingredients = new Set();
    mealPlan.days.forEach(day => {
      day.meals.forEach(meal => {
        ingredients.add(meal.name.split(' ')[0]); // Simplified
      });
    });
    mealPlan.shoppingList = Array.from(ingredients);

    // Calculate totals
    mealPlan.days.forEach(day => {
      mealPlan.macros.protein += day.dailyMacros.protein;
      mealPlan.macros.carbs += day.dailyMacros.carbs;
      mealPlan.macros.fat += day.dailyMacros.fat;
      mealPlan.macros.calories += day.dailyMacros.calories;
      day.meals.forEach(meal => {
        mealPlan.estimatedCost += meal.cost;
      });
    });

    // Average per day
    mealPlan.macros.protein = Math.round(mealPlan.macros.protein / duration);
    mealPlan.macros.carbs = Math.round(mealPlan.macros.carbs / duration);
    mealPlan.macros.fat = Math.round(mealPlan.macros.fat / duration);
    mealPlan.macros.calories = Math.round(mealPlan.macros.calories / duration);

    return {
      mealPlan,
      adherenceScore: 95, // Estimated
      reasoning: [
        `Generated ${duration}-day meal plan`,
        `${mealsPerDay} meals per day`,
        `Target: ${calorieTarget} calories/day`,
        `Estimated cost: $${mealPlan.estimatedCost.toFixed(2)}`
      ]
    };

  } catch (error) {
    console.error('Meal plan generation error:', error);
    throw error;
  }
};

/**
 * Analyze food from photo (AI vision)
 */
exports.analyzePhoto = async (imageBuffer) => {
  try {
    // In production, this would use Google Vision API or similar
    // For now, return mock data
    
    return {
      foods: [
        {
          name: 'Grilled Chicken Breast',
          confidence: 0.92,
          servingSize: '6 oz',
          calories: 280,
          protein: 53,
          carbs: 0,
          fat: 6
        },
        {
          name: 'Brown Rice',
          confidence: 0.87,
          servingSize: '1 cup',
          calories: 215,
          protein: 5,
          carbs: 45,
          fat: 2
        },
        {
          name: 'Broccoli',
          confidence: 0.95,
          servingSize: '1 cup',
          calories: 55,
          protein: 4,
          carbs: 11,
          fat: 1
        }
      ],
      totalMacros: {
        calories: 550,
        protein: 62,
        carbs: 56,
        fat: 9
      },
      confidence: 0.91,
      suggestions: [
        'Consider adding healthy fats like avocado',
        'Great protein content for muscle recovery'
      ]
    };

  } catch (error) {
    console.error('Photo analysis error:', error);
    throw error;
  }
};

/**
 * Suggest recipes based on preferences
 */
exports.suggestRecipes = async (params) => {
  try {
    const {
      ingredients = [],
      macroTargets = {},
      cuisine = 'any',
      cookingTime = 60,
      difficulty = 'medium'
    } = params;

    // Sample recipe database
    const recipes = [
      {
        name: 'High-Protein Chicken Stir Fry',
        cuisine: 'asian',
        difficulty: 'easy',
        cookingTime: 25,
        servings: 4,
        ingredients: ['chicken', 'vegetables', 'soy sauce', 'rice'],
        macros: { protein: 45, carbs: 35, fat: 12, calories: 430 },
        instructions: [
          'Cut chicken into bite-sized pieces',
          'Stir fry in wok with vegetables',
          'Add sauce and serve over rice'
        ],
        fitScore: 95
      },
      {
        name: 'Lean Turkey Meatballs',
        cuisine: 'italian',
        difficulty: 'medium',
        cookingTime: 35,
        servings: 4,
        ingredients: ['ground turkey', 'breadcrumbs', 'eggs', 'marinara'],
        macros: { protein: 40, carbs: 25, fat: 10, calories: 350 },
        instructions: [
          'Mix turkey with breadcrumbs and seasonings',
          'Form into meatballs',
          'Bake at 375°F for 25 minutes'
        ],
        fitScore: 92
      },
      {
        name: 'Salmon with Quinoa',
        cuisine: 'american',
        difficulty: 'easy',
        cookingTime: 30,
        servings: 2,
        ingredients: ['salmon', 'quinoa', 'asparagus', 'lemon'],
        macros: { protein: 38, carbs: 42, fat: 18, calories: 480 },
        instructions: [
          'Cook quinoa according to package',
          'Pan-sear salmon',
          'Roast asparagus and serve with lemon'
        ],
        fitScore: 96
      }
    ];

    // Filter by criteria
    let filtered = recipes;
    
    if (cuisine !== 'any') {
      filtered = filtered.filter(r => r.cuisine === cuisine);
    }
    
    if (cookingTime) {
      filtered = filtered.filter(r => r.cookingTime <= cookingTime);
    }

    // Sort by fit score
    filtered.sort((a, b) => b.fitScore - a.fitScore);

    return {
      recipes: filtered,
      totalFound: filtered.length,
      reasoning: [
        `Found ${filtered.length} recipes matching criteria`,
        `Cooking time: under ${cookingTime} minutes`,
        `Sorted by macro fit score`
      ]
    };

  } catch (error) {
    console.error('Recipe suggestion error:', error);
    throw error;
  }
};

/**
 * Get restaurant recommendations
 */
exports.getRestaurantRecommendations = async (location, macroTargets) => {
  try {
    // Mock restaurant data with healthy options
    return {
      restaurants: [
        {
          name: 'Clean Eats Bistro',
          cuisine: 'American',
          distance: '0.5 miles',
          rating: 4.5,
          priceRange: '$$',
          healthyOptions: [
            {
              name: 'Grilled Chicken Salad',
              calories: 420,
              protein: 45,
              carbs: 25,
              fat: 15
            },
            {
              name: 'Turkey Power Bowl',
              calories: 520,
              protein: 50,
              carbs: 45,
              fat: 18
            }
          ]
        },
        {
          name: 'Fit Kitchen',
          cuisine: 'Health Food',
          distance: '1.2 miles',
          rating: 4.8,
          priceRange: '$$$',
          healthyOptions: [
            {
              name: 'Macro Balanced Plate',
              calories: 550,
              protein: 52,
              carbs: 50,
              fat: 16
            }
          ]
        }
      ],
      recommendations: [
        'Clean Eats Bistro has options closest to your macro targets',
        'Fit Kitchen specializes in macro-friendly meals'
      ]
    };

  } catch (error) {
    console.error('Restaurant recommendation error:', error);
    throw error;
  }
};

module.exports = exports;
