// Nutrition Calculator Service
// BMR, TDEE, and macro target calculations

/**
 * Calculate macro targets based on user data and goals
 */
exports.calculateTargets = async (data) => {
  try {
    const {
      goal,           // 'cut', 'maintain', 'bulk'
      bodyWeight,     // in lbs or kg
      height,         // in cm
      age,
      sex,            // 'male' or 'female'
      activityLevel,  // 'sedentary', 'light', 'moderate', 'active', 'very_active'
      bodyFat,        // optional, percentage
      unit = 'imperial' // 'imperial' or 'metric'
    } = data;

    // Convert to metric if needed
    let weightKg = bodyWeight;
    let heightCm = height;
    
    if (unit === 'imperial') {
      weightKg = bodyWeight * 0.453592; // lbs to kg
      heightCm = height * 2.54; // inches to cm
    }

    // Calculate BMR using multiple formulas
    const bmr = calculateBMR(weightKg, heightCm, age, sex, bodyFat);
    
    // Calculate TDEE
    const tdee = calculateTDEE(bmr, activityLevel);
    
    // Adjust calories based on goal
    let targetCalories = tdee;
    let adjustment = 0;
    
    switch (goal) {
      case 'cut':
        adjustment = -500; // 500 calorie deficit
        targetCalories = tdee - 500;
        break;
      case 'bulk':
        adjustment = 300; // 300 calorie surplus (lean bulk)
        targetCalories = tdee + 300;
        break;
      case 'maintain':
      default:
        targetCalories = tdee;
        break;
    }

    // Calculate macros
    const macros = calculateMacros(targetCalories, goal, weightKg, bodyFat);

    return {
      targets: {
        calories: Math.round(targetCalories),
        protein: Math.round(macros.protein),
        carbs: Math.round(macros.carbs),
        fat: Math.round(macros.fat)
      },
      breakdown: {
        bmr: Math.round(bmr.average),
        tdee: Math.round(tdee),
        adjustment,
        proteinPerLb: (macros.protein / (weightKg * 2.20462)).toFixed(1)
      },
      reasoning: [
        `BMR: ${Math.round(bmr.average)} calories (${bmr.method})`,
        `TDEE: ${Math.round(tdee)} calories (${activityLevel} activity)`,
        `Goal: ${goal} (${adjustment >= 0 ? '+' : ''}${adjustment} cal adjustment)`,
        `Protein: ${macros.proteinRatio}% (${macros.protein}g)`,
        `Carbs: ${macros.carbRatio}% (${macros.carbs}g)`,
        `Fat: ${macros.fatRatio}% (${macros.fat}g)`
      ],
      formulas: {
        harrisBenedict: Math.round(bmr.harrisBenedict),
        mifflinStJeor: Math.round(bmr.mifflinStJeor),
        katchMcArdle: bodyFat ? Math.round(bmr.katchMcArdle) : null
      }
    };

  } catch (error) {
    console.error('Macro calculation error:', error);
    throw error;
  }
};

/**
 * Calculate BMR using multiple formulas
 */
function calculateBMR(weightKg, heightCm, age, sex, bodyFat = null) {
  // Harris-Benedict Equation
  let harrisBenedict;
  if (sex === 'male') {
    harrisBenedict = 88.362 + (13.397 * weightKg) + (4.799 * heightCm) - (5.677 * age);
  } else {
    harrisBenedict = 447.593 + (9.247 * weightKg) + (3.098 * heightCm) - (4.330 * age);
  }

  // Mifflin-St Jeor Equation (more accurate for modern populations)
  let mifflinStJeor;
  if (sex === 'male') {
    mifflinStJeor = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
  } else {
    mifflinStJeor = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
  }

  // Katch-McArdle (requires body fat percentage)
  let katchMcArdle = null;
  if (bodyFat !== null && bodyFat > 0) {
    const leanMassKg = weightKg * (1 - bodyFat / 100);
    katchMcArdle = 370 + (21.6 * leanMassKg);
  }

  // Use Mifflin-St Jeor as primary, or Katch-McArdle if body fat available
  const primaryBMR = katchMcArdle || mifflinStJeor;
  const method = katchMcArdle ? 'Katch-McArdle' : 'Mifflin-St Jeor';

  return {
    harrisBenedict,
    mifflinStJeor,
    katchMcArdle,
    average: primaryBMR,
    method
  };
}

/**
 * Calculate TDEE based on activity level
 */
function calculateTDEE(bmr, activityLevel) {
  const multipliers = {
    sedentary: 1.2,      // Little to no exercise
    light: 1.375,        // Light exercise 1-3 days/week
    moderate: 1.55,      // Moderate exercise 3-5 days/week
    active: 1.725,       // Heavy exercise 6-7 days/week
    very_active: 1.9     // Very heavy exercise, physical job
  };

  const multiplier = multipliers[activityLevel] || multipliers.moderate;
  return bmr.average * multiplier;
}

/**
 * Calculate macro distribution based on goal
 */
function calculateMacros(calories, goal, weightKg, bodyFat = null) {
  let proteinRatio, carbRatio, fatRatio;

  // Protein: 0.8-1g per lb of bodyweight (or lean mass if body fat known)
  let targetWeightKg = weightKg;
  if (bodyFat !== null && bodyFat > 0) {
    targetWeightKg = weightKg * (1 - bodyFat / 100); // Use lean mass
  }
  
  const proteinGrams = targetWeightKg * 2.2; // ~1g per lb

  switch (goal) {
    case 'cut':
      // Higher protein to preserve muscle, lower carbs
      proteinRatio = 35;
      fatRatio = 25;
      carbRatio = 40;
      break;
      
    case 'bulk':
      // Moderate protein, higher carbs for energy
      proteinRatio = 25;
      fatRatio = 25;
      carbRatio = 50;
      break;
      
    case 'maintain':
    default:
      // Balanced
      proteinRatio = 30;
      fatRatio = 25;
      carbRatio = 45;
      break;
  }

  // Calculate grams from ratios
  const proteinCals = calories * (proteinRatio / 100);
  const fatCals = calories * (fatRatio / 100);
  const carbCals = calories * (carbRatio / 100);

  return {
    protein: proteinCals / 4,  // 4 calories per gram
    carbs: carbCals / 4,       // 4 calories per gram
    fat: fatCals / 9,          // 9 calories per gram
    proteinRatio,
    carbRatio,
    fatRatio
  };
}

/**
 * Calculate daily water intake recommendation
 */
exports.calculateWaterIntake = (weightKg, activityLevel = 'moderate', climate = 'normal') {
  // Base: 35ml per kg of body weight
  let waterMl = weightKg * 35;

  // Adjust for activity
  const activityAdjustment = {
    sedentary: 0,
    light: 500,
    moderate: 750,
    active: 1000,
    very_active: 1500
  };
  waterMl += activityAdjustment[activityLevel] || activityAdjustment.moderate;

  // Adjust for climate
  if (climate === 'hot') {
    waterMl *= 1.2;
  }

  return {
    daily: Math.round(waterMl),
    cups: Math.round(waterMl / 237), // Convert to cups (1 cup = 237ml)
    liters: (waterMl / 1000).toFixed(1)
  };
};

/**
 * Estimate calorie burn for activities
 */
exports.estimateCalorieBurn = (activityType, durationMinutes, weightKg) => {
  // MET values (Metabolic Equivalent of Task)
  const metValues = {
    walking_slow: 2.5,
    walking_fast: 4.0,
    jogging: 7.0,
    running: 9.8,
    cycling_leisure: 6.8,
    cycling_vigorous: 10.0,
    swimming: 8.0,
    strength_training: 5.0,
    hiit: 8.0,
    yoga: 2.5,
    basketball: 6.5,
    soccer: 7.0
  };

  const met = metValues[activityType] || 5.0;
  
  // Calories = MET × weight(kg) × duration(hours)
  const calories = met * weightKg * (durationMinutes / 60);

  return {
    calories: Math.round(calories),
    met,
    duration: durationMinutes
  };
};

/**
 * Analyze macro balance
 */
exports.analyzeMacroBalance = (actual, targets) => {
  const analysis = {
    protein: {
      actual: actual.protein,
      target: targets.protein,
      difference: actual.protein - targets.protein,
      percentage: ((actual.protein / targets.protein) * 100).toFixed(1),
      status: 'on-track'
    },
    carbs: {
      actual: actual.carbs,
      target: targets.carbs,
      difference: actual.carbs - targets.carbs,
      percentage: ((actual.carbs / targets.carbs) * 100).toFixed(1),
      status: 'on-track'
    },
    fat: {
      actual: actual.fat,
      target: targets.fat,
      difference: actual.fat - targets.fat,
      percentage: ((actual.fat / targets.fat) * 100).toFixed(1),
      status: 'on-track'
    },
    calories: {
      actual: actual.calories,
      target: targets.calories,
      difference: actual.calories - targets.calories,
      percentage: ((actual.calories / targets.calories) * 100).toFixed(1),
      status: 'on-track'
    }
  };

  // Determine status for each macro
  ['protein', 'carbs', 'fat', 'calories'].forEach(macro => {
    const pct = parseFloat(analysis[macro].percentage);
    if (pct < 85) {
      analysis[macro].status = 'under';
    } else if (pct > 115) {
      analysis[macro].status = 'over';
    }
  });

  // Overall assessment
  const allOnTrack = Object.values(analysis).every(m => m.status === 'on-track');
  
  return {
    ...analysis,
    overall: allOnTrack ? 'excellent' : 'needs-adjustment',
    recommendations: generateMacroRecommendations(analysis)
  };
};

/**
 * Generate recommendations based on macro analysis
 */
function generateMacroRecommendations(analysis) {
  const recommendations = [];

  if (analysis.protein.status === 'under') {
    recommendations.push('Increase protein intake - add protein shake or lean meat');
  } else if (analysis.protein.status === 'over') {
    recommendations.push('Protein intake is high - consider reducing portion sizes');
  }

  if (analysis.carbs.status === 'under') {
    recommendations.push('Add complex carbs - rice, oats, or sweet potato');
  } else if (analysis.carbs.status === 'over') {
    recommendations.push('Reduce carb portions or choose lower-carb alternatives');
  }

  if (analysis.fat.status === 'under') {
    recommendations.push('Include healthy fats - nuts, avocado, or olive oil');
  } else if (analysis.fat.status === 'over') {
    recommendations.push('Watch fat intake - use cooking spray and lean proteins');
  }

  if (recommendations.length === 0) {
    recommendations.push('Macros are well-balanced - keep up the good work!');
  }

  return recommendations;
}

module.exports = exports;
