// healthRatios.js
// Service for calculating health ratios: ABSI, BRI, WHR, waist-to-height ratio

const User = require('../../models/User');
const BiometricSnapshot = require('../../models/mercury/BiometricSnapshot');
const BodyComposition = require('../../models/mercury/BodyComposition');

/**
 * Calculate all health ratios for a user
 */
exports.calculateAll = async (userId) => {
  try {
    // Get user data
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    const snapshot = await BiometricSnapshot.getLatest(userId);
    const composition = await BodyComposition.getLatest(userId);
    
    // Get required measurements
    const weight = snapshot?.weight?.value || composition?.weight || user.weight;
    const height = composition?.height || user.height;
    const waist = snapshot?.waist || composition?.circumferences?.waist;
    const hips = snapshot?.hips || composition?.circumferences?.hips;
    const age = calculateAge(user.dateOfBirth);
    const sex = user.sex || 'male';
    
    if (!weight || !height) {
      throw new Error('Insufficient data: weight and height required');
    }
    
    // Calculate all ratios
    const bmi = calculateBMI(weight, height);
    const absi = waist ? calculateABSI(waist, weight, height) : null;
    const bri = waist ? calculateBRI(waist, height) : null;
    const whr = (waist && hips) ? calculateWHR(waist, hips) : null;
    const waistToHeight = waist ? calculateWaistToHeight(waist, height) : null;
    
    // Assess overall risk
    const overallRisk = assessOverallRisk(absi, bri, whr, waistToHeight, bmi, age, sex);
    
    return {
      bmi: {
        value: bmi,
        category: categorizeBMI(bmi),
        healthy: bmi >= 18.5 && bmi < 25
      },
      absi: absi ? {
        value: absi.value,
        riskLevel: absi.risk,
        percentile: absi.percentile,
        zScore: absi.zScore
      } : null,
      bri: bri ? {
        value: bri.value,
        category: bri.category,
        riskLevel: bri.risk
      } : null,
      whr: whr ? {
        value: whr.value,
        riskLevel: whr.risk,
        category: whr.category
      } : null,
      waistToHeight: waistToHeight ? {
        value: waistToHeight.value,
        category: waistToHeight.category,
        healthy: waistToHeight.healthy
      } : null,
      overallRiskAssessment: overallRisk,
      recommendations: generateRecommendations(absi, bri, whr, waistToHeight, bmi, sex)
    };
    
  } catch (error) {
    throw new Error(`Error calculating health ratios: ${error.message}`);
  }
};

// ========================================
// RATIO CALCULATIONS
// ========================================

/**
 * Calculate BMI (Body Mass Index)
 */
function calculateBMI(weight, height) {
  const heightM = height / 100;
  return Math.round((weight / (heightM * heightM)) * 10) / 10;
}

/**
 * Calculate ABSI (A Body Shape Index)
 * Better predictor of mortality than BMI
 * Takes into account waist circumference relative to height and weight
 */
function calculateABSI(waist, weight, height) {
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  
  // ABSI formula: WC / (BMI^(2/3) * height^(1/2))
  // WC in meters
  const waistM = waist / 100;
  const absi = waistM / (Math.pow(bmi, 2/3) * Math.pow(heightM, 1/2));
  
  // Calculate z-score (standardized score)
  // These are population averages - would need age/sex specific tables for precision
  const populationMean = 0.0812;
  const populationSD = 0.0053;
  const zScore = (absi - populationMean) / populationSD;
  
  // Determine risk level based on z-score
  let risk, percentile;
  if (zScore < -0.868) {
    risk = 'very low';
    percentile = 20;
  } else if (zScore < -0.272) {
    risk = 'low';
    percentile = 40;
  } else if (zScore < 0.229) {
    risk = 'moderate';
    percentile = 60;
  } else if (zScore < 0.798) {
    risk = 'high';
    percentile = 80;
  } else {
    risk = 'very high';
    percentile = 95;
  }
  
  return {
    value: Math.round(absi * 10000) / 10000,
    zScore: Math.round(zScore * 100) / 100,
    percentile,
    risk
  };
}

/**
 * Calculate BRI (Body Roundness Index)
 * Estimates body shape and visceral fat
 */
function calculateBRI(waist, height) {
  const waistM = waist / 100;
  const heightM = height / 100;
  
  // BRI formula: 364.2 - 365.5 * sqrt(1 - ((WC / (2π))^2 / (0.5 * height)^2))
  const bri = 364.2 - 365.5 * Math.sqrt(
    1 - (Math.pow(waistM / (2 * Math.PI), 2) / Math.pow(0.5 * heightM, 2))
  );
  
  // Categorize BRI
  let category, risk;
  if (bri < 3.41) {
    category = 'lean';
    risk = 'low';
  } else if (bri < 4.45) {
    category = 'healthy';
    risk = 'low';
  } else if (bri < 5.46) {
    category = 'overweight';
    risk = 'moderate';
  } else if (bri < 6.91) {
    category = 'obese';
    risk = 'high';
  } else {
    category = 'very obese';
    risk = 'very high';
  }
  
  return {
    value: Math.round(bri * 100) / 100,
    category,
    risk
  };
}

/**
 * Calculate WHR (Waist-to-Hip Ratio)
 * Predictor of cardiovascular disease risk
 */
function calculateWHR(waist, hips) {
  const whr = waist / hips;
  
  return {
    value: Math.round(whr * 100) / 100
  };
}

/**
 * Categorize WHR risk based on sex
 */
function categorizeWHR(whr, sex) {
  let risk, category;
  
  if (sex === 'male') {
    if (whr < 0.90) {
      risk = 'low';
      category = 'healthy';
    } else if (whr < 0.95) {
      risk = 'moderate';
      category = 'borderline';
    } else {
      risk = 'high';
      category = 'at risk';
    }
  } else {
    if (whr < 0.80) {
      risk = 'low';
      category = 'healthy';
    } else if (whr < 0.85) {
      risk = 'moderate';
      category = 'borderline';
    } else {
      risk = 'high';
      category = 'at risk';
    }
  }
  
  return { risk, category };
}

/**
 * Calculate Waist-to-Height Ratio
 * Simple predictor of metabolic syndrome
 */
function calculateWaistToHeight(waist, height) {
  const ratio = waist / height;
  
  // Category based on ratio
  let category, healthy;
  if (ratio < 0.40) {
    category = 'underweight';
    healthy = false;
  } else if (ratio < 0.50) {
    category = 'healthy';
    healthy = true;
  } else if (ratio < 0.60) {
    category = 'overweight';
    healthy = false;
  } else {
    category = 'obese';
    healthy = false;
  }
  
  return {
    value: Math.round(ratio * 100) / 100,
    category,
    healthy
  };
}

/**
 * Calculate BAI (Body Adiposity Index)
 * Alternative to BMI, uses hip circumference and height
 */
exports.calculateBAI = (hips, height) => {
  const heightM = height / 100;
  // BAI = (hip circumference) / (height^1.5) - 18
  const bai = (hips / Math.pow(heightM, 1.5)) - 18;
  
  return Math.round(bai * 10) / 10;
};

/**
 * Calculate Conicity Index
 * Measures body fat distribution
 */
exports.calculateConicity = (waist, weight, height) => {
  const waistM = waist / 100;
  const heightM = height / 100;
  
  // CI = waist / (0.109 * sqrt(weight / height))
  const ci = waistM / (0.109 * Math.sqrt(weight / heightM));
  
  return Math.round(ci * 100) / 100;
};

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

function categorizeBMI(bmi) {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  if (bmi < 35) return 'obese class I';
  if (bmi < 40) return 'obese class II';
  return 'obese class III';
}

function assessOverallRisk(absi, bri, whr, waistToHeight, bmi, age, sex) {
  let riskScore = 0;
  let factors = 0;
  
  // ABSI risk
  if (absi) {
    factors++;
    if (absi.risk === 'very low') riskScore += 0;
    else if (absi.risk === 'low') riskScore += 1;
    else if (absi.risk === 'moderate') riskScore += 2;
    else if (absi.risk === 'high') riskScore += 3;
    else if (absi.risk === 'very high') riskScore += 4;
  }
  
  // BRI risk
  if (bri) {
    factors++;
    if (bri.risk === 'low') riskScore += 0;
    else if (bri.risk === 'moderate') riskScore += 2;
    else if (bri.risk === 'high') riskScore += 3;
    else if (bri.risk === 'very high') riskScore += 4;
  }
  
  // WHR risk
  if (whr) {
    factors++;
    const whrCat = categorizeWHR(whr.value, sex);
    if (whrCat.risk === 'low') riskScore += 0;
    else if (whrCat.risk === 'moderate') riskScore += 2;
    else if (whrCat.risk === 'high') riskScore += 4;
  }
  
  // Waist-to-height risk
  if (waistToHeight) {
    factors++;
    if (waistToHeight.healthy) riskScore += 0;
    else riskScore += 2;
  }
  
  // BMI risk
  if (bmi) {
    factors++;
    if (bmi >= 18.5 && bmi < 25) riskScore += 0;
    else if (bmi < 18.5 || (bmi >= 25 && bmi < 30)) riskScore += 1;
    else if (bmi >= 30 && bmi < 35) riskScore += 2;
    else riskScore += 3;
  }
  
  // Calculate average risk
  const avgRisk = factors > 0 ? riskScore / factors : 0;
  
  // Categorize overall risk
  let overallRisk;
  if (avgRisk < 1) overallRisk = 'low';
  else if (avgRisk < 2) overallRisk = 'moderate';
  else if (avgRisk < 3) overallRisk = 'high';
  else overallRisk = 'very high';
  
  return {
    level: overallRisk,
    score: Math.round(avgRisk * 10) / 10,
    maxScore: 4,
    factorsEvaluated: factors,
    ageAdjustedRisk: age > 50 ? 'increased' : 'normal'
  };
}

function generateRecommendations(absi, bri, whr, waistToHeight, bmi, sex) {
  const recommendations = [];
  
  // ABSI recommendations
  if (absi && (absi.risk === 'high' || absi.risk === 'very high')) {
    recommendations.push({
      category: 'body_shape',
      priority: 'high',
      message: 'Your body shape index indicates increased health risk. Focus on reducing waist circumference through cardio and core exercises.'
    });
  }
  
  // BRI recommendations
  if (bri && (bri.risk === 'high' || bri.risk === 'very high')) {
    recommendations.push({
      category: 'visceral_fat',
      priority: 'high',
      message: 'Body roundness index suggests elevated visceral fat. Prioritize cardiovascular exercise and reduce refined carbohydrates.'
    });
  }
  
  // WHR recommendations
  if (whr) {
    const whrCat = categorizeWHR(whr.value, sex);
    if (whrCat.risk === 'high') {
      recommendations.push({
        category: 'fat_distribution',
        priority: 'high',
        message: 'Waist-to-hip ratio indicates central obesity. This pattern increases cardiovascular disease risk. Focus on overall fat loss.'
      });
    }
  }
  
  // Waist-to-height recommendations
  if (waistToHeight && !waistToHeight.healthy) {
    recommendations.push({
      category: 'waist_circumference',
      priority: 'medium',
      message: 'Keep your waist circumference below half your height. Current ratio suggests increased metabolic risk.'
    });
  }
  
  // BMI recommendations
  if (bmi >= 25 && bmi < 30) {
    recommendations.push({
      category: 'weight',
      priority: 'medium',
      message: 'BMI indicates overweight. Consider a calorie deficit and increased physical activity.'
    });
  } else if (bmi >= 30) {
    recommendations.push({
      category: 'weight',
      priority: 'high',
      message: 'BMI indicates obesity. Consult with a healthcare provider for a comprehensive weight management plan.'
    });
  }
  
  // General recommendations if any risk factors present
  if (recommendations.length > 0) {
    recommendations.push({
      category: 'general',
      priority: 'medium',
      message: 'Regular monitoring of these metrics can help track progress and adjust interventions.'
    });
  } else {
    recommendations.push({
      category: 'general',
      priority: 'low',
      message: 'Your body composition metrics are within healthy ranges. Maintain current lifestyle habits.'
    });
  }
  
  return recommendations;
}

/**
 * Calculate ideal body weight using multiple formulas
 */
exports.calculateIdealWeight = (height, sex) => {
  const heightCm = height;
  const heightInches = heightCm / 2.54;
  
  // Devine formula (1974)
  let devine;
  if (sex === 'male') {
    devine = 50 + 2.3 * (heightInches - 60);
  } else {
    devine = 45.5 + 2.3 * (heightInches - 60);
  }
  
  // Robinson formula (1983)
  let robinson;
  if (sex === 'male') {
    robinson = 52 + 1.9 * (heightInches - 60);
  } else {
    robinson = 49 + 1.7 * (heightInches - 60);
  }
  
  // Miller formula (1983)
  let miller;
  if (sex === 'male') {
    miller = 56.2 + 1.41 * (heightInches - 60);
  } else {
    miller = 53.1 + 1.36 * (heightInches - 60);
  }
  
  // Hamwi formula (1964)
  let hamwi;
  if (sex === 'male') {
    hamwi = 48 + 2.7 * (heightInches - 60);
  } else {
    hamwi = 45.5 + 2.2 * (heightInches - 60);
  }
  
  // Average of all formulas
  const average = (devine + robinson + miller + hamwi) / 4;
  
  return {
    devine: Math.round(devine * 10) / 10,
    robinson: Math.round(robinson * 10) / 10,
    miller: Math.round(miller * 10) / 10,
    hamwi: Math.round(hamwi * 10) / 10,
    average: Math.round(average * 10) / 10,
    range: {
      min: Math.round((average - 5) * 10) / 10,
      max: Math.round((average + 5) * 10) / 10
    }
  };
};

module.exports = exports;
