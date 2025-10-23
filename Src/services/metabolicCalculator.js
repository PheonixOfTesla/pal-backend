// metabolicCalculator.js
// Service for calculating metabolic rates using multiple formulas

const User = require('../../models/User');
const BiometricSnapshot = require('../../models/BiometricSnapshot');
const BodyComposition = require('../../models/BodyComposition');

/**
 * Calculate metabolic rates for a user
 */
exports.calculate = async (userId) => {
  try {
    // Get user data
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    const snapshot = await BiometricSnapshot.getLatest(userId);
    const composition = await BodyComposition.getLatest(userId);
    
    // Get required data
    const weight = snapshot?.weight?.value || composition?.weight || user.weight || 70;
    const height = composition?.height || user.height || 170;
    const age = calculateAge(user.dateOfBirth);
    const sex = user.sex || 'male';
    const bodyFat = snapshot?.bodyFatPercentage || composition?.bodyFat?.percentage;
    const leanMass = composition?.leanMass?.total || (bodyFat ? weight * (1 - bodyFat/100) : null);
    
    // Calculate BMR using multiple formulas
    const bmr = {
      harrisBenedict: calculateHarrisBenedict(weight, height, age, sex),
      mifflinStJeor: calculateMifflinStJeor(weight, height, age, sex),
      katchMcArdle: leanMass ? calculateKatchMcArdle(leanMass) : null
    };
    
    // RMR is typically 95% of BMR
    const rmr = Math.round(bmr.mifflinStJeor * 0.95);
    
    // Calculate TDEE for different activity levels
    const baseTDEE = bmr.mifflinStJeor; // Use Mifflin-St Jeor as base
    const tdee = {
      sedentary: Math.round(baseTDEE * 1.2),
      lightlyActive: Math.round(baseTDEE * 1.375),
      moderatelyActive: Math.round(baseTDEE * 1.55),
      veryActive: Math.round(baseTDEE * 1.725),
      extraActive: Math.round(baseTDEE * 1.9)
    };
    
    // Recommend based on user's goals
    const recommended = await calculateRecommendedCalories(userId, tdee, user);
    
    // Compare formulas
    const formulaComparison = {
      harris: bmr.harrisBenedict,
      mifflin: bmr.mifflinStJeor,
      katch: bmr.katchMcArdle,
      difference: bmr.katchMcArdle 
        ? Math.abs(bmr.mifflinStJeor - bmr.katchMcArdle)
        : Math.abs(bmr.mifflinStJeor - bmr.harrisBenedict),
      note: bmr.katchMcArdle 
        ? 'Katch-McArdle is most accurate when body composition is known'
        : 'Mifflin-St Jeor is generally more accurate than Harris-Benedict'
    };
    
    return {
      bmr,
      rmr,
      tdee,
      recommended,
      formulaComparison,
      dataQuality: {
        hasBodyFat: !!bodyFat,
        hasLeanMass: !!leanMass,
        hasAccurateWeight: !!snapshot?.weight?.value,
        recommendedFormula: bmr.katchMcArdle ? 'katchMcArdle' : 'mifflinStJeor'
      }
    };
    
  } catch (error) {
    throw new Error(`Error calculating metabolic rate: ${error.message}`);
  }
};

/**
 * Manual calculation without requiring user profile
 */
exports.manualCalculate = async (data) => {
  try {
    const { weight, height, age, activityLevel, bodyFat, sex } = data;
    
    if (!weight || !height || !age || !sex) {
      throw new Error('Missing required fields: weight, height, age, sex');
    }
    
    // Calculate BMR
    const bmr = {
      harrisBenedict: calculateHarrisBenedict(weight, height, age, sex),
      mifflinStJeor: calculateMifflinStJeor(weight, height, age, sex)
    };
    
    // If body fat provided, calculate Katch-McArdle
    if (bodyFat) {
      const leanMass = weight * (1 - bodyFat/100);
      bmr.katchMcArdle = calculateKatchMcArdle(leanMass);
    }
    
    // Select best BMR
    const bestBMR = bmr.katchMcArdle || bmr.mifflinStJeor;
    
    // Calculate TDEE
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      veryActive: 1.9
    };
    
    const multiplier = activityMultipliers[activityLevel] || 1.55;
    const tdee = Math.round(bestBMR * multiplier);
    
    // Generate recommendations
    const recommendations = generateManualRecommendations(bestBMR, tdee, bodyFat, sex);
    
    return {
      bmr: Math.round(bestBMR),
      tdee,
      recommendations
    };
    
  } catch (error) {
    throw new Error(`Error in manual calculation: ${error.message}`);
  }
};

// ========================================
// BMR CALCULATION FORMULAS
// ========================================

/**
 * Harris-Benedict Equation (Revised 1984)
 * One of the oldest and most widely used formulas
 */
function calculateHarrisBenedict(weight, height, age, sex) {
  if (sex === 'male') {
    return Math.round(88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age));
  } else {
    return Math.round(447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age));
  }
}

/**
 * Mifflin-St Jeor Equation (1990)
 * Generally considered more accurate than Harris-Benedict
 */
function calculateMifflinStJeor(weight, height, age, sex) {
  const base = (10 * weight) + (6.25 * height) - (5 * age);
  
  if (sex === 'male') {
    return Math.round(base + 5);
  } else {
    return Math.round(base - 161);
  }
}

/**
 * Katch-McArdle Formula
 * Most accurate when body composition is known
 * Based on lean body mass
 */
function calculateKatchMcArdle(leanMass) {
  return Math.round(370 + (21.6 * leanMass));
}

/**
 * Cunningham Formula
 * Alternative to Katch-McArdle, very similar
 */
function calculateCunningham(leanMass) {
  return Math.round(500 + (22 * leanMass));
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return 30;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

async function calculateRecommendedCalories(userId, tdee, user) {
  try {
    // Try to get user's goal
    const Goal = require('../../models/Goal');
    const activeGoals = await Goal.find({ 
      userId, 
      status: 'active',
      type: { $in: ['weight_loss', 'weight_gain', 'muscle_gain', 'fat_loss', 'maintenance'] }
    });
    
    let recommendation = {
      maintenance: tdee.moderatelyActive,
      deficit: Math.round(tdee.moderatelyActive - 500),
      surplus: Math.round(tdee.moderatelyActive + 300)
    };
    
    if (activeGoals.length > 0) {
      const goal = activeGoals[0];
      
      if (goal.type === 'weight_loss' || goal.type === 'fat_loss') {
        recommendation.recommended = recommendation.deficit;
        recommendation.goal = 'fat loss';
        recommendation.description = '500 calorie deficit for sustainable fat loss (~1 lb/week)';
      } else if (goal.type === 'weight_gain' || goal.type === 'muscle_gain') {
        recommendation.recommended = recommendation.surplus;
        recommendation.goal = 'muscle gain';
        recommendation.description = '300 calorie surplus for lean muscle gain';
      } else {
        recommendation.recommended = recommendation.maintenance;
        recommendation.goal = 'maintenance';
        recommendation.description = 'Maintenance calories to maintain current weight';
      }
    } else {
      recommendation.recommended = recommendation.maintenance;
      recommendation.goal = 'maintenance';
      recommendation.description = 'Maintenance calories - adjust based on your goals';
    }
    
    // Macro recommendations
    const protein = Math.round(recommendation.recommended * 0.30 / 4); // 30% protein, 4 cal/g
    const carbs = Math.round(recommendation.recommended * 0.40 / 4); // 40% carbs, 4 cal/g
    const fats = Math.round(recommendation.recommended * 0.30 / 9); // 30% fats, 9 cal/g
    
    recommendation.macros = {
      protein: `${protein}g`,
      carbs: `${carbs}g`,
      fats: `${fats}g`
    };
    
    return recommendation;
    
  } catch (error) {
    // If can't get goals, return default recommendation
    return {
      maintenance: tdee.moderatelyActive,
      deficit: Math.round(tdee.moderatelyActive - 500),
      surplus: Math.round(tdee.moderatelyActive + 300),
      recommended: tdee.moderatelyActive,
      goal: 'unknown',
      description: 'Set goals to get personalized calorie recommendations'
    };
  }
}

function generateManualRecommendations(bmr, tdee, bodyFat, sex) {
  const recommendations = [];
  
  // Protein recommendations
  const proteinGrams = Math.round(tdee * 0.30 / 4);
  recommendations.push({
    category: 'protein',
    message: `Aim for ${proteinGrams}g protein per day (30% of calories)`
  });
  
  // Body composition recommendations
  if (bodyFat) {
    const optimalBodyFat = sex === 'male' ? { min: 10, max: 20 } : { min: 18, max: 28 };
    
    if (bodyFat > optimalBodyFat.max) {
      const deficit = Math.round(tdee - 500);
      recommendations.push({
        category: 'calories',
        message: `For fat loss, aim for ${deficit} calories/day (500 calorie deficit)`
      });
    } else if (bodyFat < optimalBodyFat.min) {
      const surplus = Math.round(tdee + 300);
      recommendations.push({
        category: 'calories',
        message: `For muscle gain, aim for ${surplus} calories/day (300 calorie surplus)`
      });
    } else {
      recommendations.push({
        category: 'calories',
        message: `Maintain at ${tdee} calories/day to preserve current composition`
      });
    }
  }
  
  // General recommendations
  recommendations.push({
    category: 'hydration',
    message: 'Drink at least 2.5-3 liters of water per day'
  });
  
  recommendations.push({
    category: 'meal_timing',
    message: 'Distribute calories across 3-5 meals for optimal energy and satiety'
  });
  
  return recommendations;
}

/**
 * Calculate daily calorie burn from activity
 */
exports.calculateActivityCalories = (activityLevel, bmr) => {
  const multipliers = {
    sedentary: 0.2,      // BMR * 1.2
    light: 0.375,        // BMR * 1.375
    moderate: 0.55,      // BMR * 1.55
    active: 0.725,       // BMR * 1.725
    veryActive: 0.9      // BMR * 1.9
  };
  
  const multiplier = multipliers[activityLevel] || 0.55;
  return Math.round(bmr * multiplier);
};

/**
 * Calculate calories burned during specific exercise
 */
exports.calculateExerciseCalories = (weight, met, durationMinutes) => {
  // MET = Metabolic Equivalent of Task
  // Calories = MET * weight(kg) * duration(hours)
  const hours = durationMinutes / 60;
  return Math.round(met * weight * hours);
};

/**
 * Estimate weight change timeline
 */
exports.estimateWeightChangeTimeline = (currentWeight, targetWeight, dailyCalories, tdee) => {
  const weightDifference = targetWeight - currentWeight;
  const dailyDeficit = tdee - dailyCalories;
  
  // 7700 calories = 1 kg (3500 cal = 1 lb)
  const caloriesPerKg = 7700;
  const totalCaloriesNeeded = Math.abs(weightDifference) * caloriesPerKg;
  const daysNeeded = Math.round(totalCaloriesNeeded / Math.abs(dailyDeficit));
  
  return {
    currentWeight,
    targetWeight,
    difference: weightDifference,
    dailyDeficit,
    estimatedDays: daysNeeded,
    estimatedWeeks: Math.round(daysNeeded / 7),
    weeklyRate: Math.round((Math.abs(weightDifference) / (daysNeeded / 7)) * 10) / 10,
    targetDate: new Date(Date.now() + daysNeeded * 24 * 60 * 60 * 1000)
  };
};

module.exports = exports;
