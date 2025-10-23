// dexaSimulator.js
// Service for simulating DEXA scan results using body measurements and wearable data

const BodyComposition = require('../models/BodyComposition');
const BiometricSnapshot = require('../models/BiometricSnapshot');
const User = require('../../models/User');

/**
 * Generate a simulated DEXA scan based on available user data
 * Uses body measurements, weight, and statistical models to estimate DEXA-quality data
 */
exports.generateScan = async (userId) => {
  try {
    // Get user data
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    // Get latest biometric snapshot
    const snapshot = await BiometricSnapshot.getLatest(userId);
    const latestComposition = await BodyComposition.getLatest(userId);
    
    // Get measurements
    const weight = snapshot?.weight?.value || latestComposition?.weight || 70;
    const height = latestComposition?.height || user.height || 170;
    const age = calculateAge(user.dateOfBirth);
    const sex = user.sex || 'male';
    
    // Calculate body fat percentage using multiple methods
    const bodyFat = calculateBodyFatPercentage(weight, height, age, sex, snapshot);
    
    // Calculate lean mass
    const fatMass = weight * (bodyFat / 100);
    const leanMass = weight - fatMass;
    
    // Estimate bone mass (typically 15% of lean mass)
    const boneMass = leanMass * 0.15;
    
    // Estimate muscle mass (typically 85% of lean mass)
    const muscleMass = leanMass * 0.85;
    
    // Calculate visceral fat
    const visceralFat = estimateVisceralFat(weight, height, bodyFat, age, sex);
    
    // Regional analysis
    const regions = calculateRegionalDistribution(weight, bodyFat, sex);
    
    // Bone density analysis
    const boneDensity = calculateBoneDensity(age, sex, weight, height);
    
    // FRAX risk assessment (10-year fracture probability)
    const fraxRisk = calculateFRAXRisk(age, sex, boneDensity, weight, height);
    
    // Generate recommendations
    const recommendations = generateRecommendations(bodyFat, visceralFat, boneDensity, age, sex);
    
    return {
      scanDate: new Date(),
      bodyFat: Math.round(bodyFat * 10) / 10,
      leanMass: Math.round(leanMass * 10) / 10,
      boneMass: Math.round(boneMass * 100) / 100,
      muscleMass: Math.round(muscleMass * 10) / 10,
      visceralFat: Math.round(visceralFat * 10) / 10,
      totalMass: weight,
      regions,
      boneDensity,
      fraxRisk,
      recommendations,
      methodology: 'Statistical estimation based on anthropometric measurements',
      confidence: calculateConfidence(snapshot, latestComposition)
    };
    
  } catch (error) {
    throw new Error(`Error generating DEXA scan: ${error.message}`);
  }
};

/**
 * Estimate visceral fat level
 */
exports.estimateVisceralFat = async (userId) => {
  try {
    const scan = await exports.generateScan(userId);
    const visceralFat = scan.visceralFat;
    
    // Visceral fat level scale (1-12)
    let level;
    if (visceralFat < 1.5) level = 1;
    else if (visceralFat < 2.5) level = 2;
    else if (visceralFat < 3.5) level = 3;
    else if (visceralFat < 4.5) level = 4;
    else if (visceralFat < 5.5) level = 5;
    else if (visceralFat < 6.5) level = 6;
    else if (visceralFat < 7.5) level = 7;
    else if (visceralFat < 8.5) level = 8;
    else if (visceralFat < 9.5) level = 9;
    else if (visceralFat < 10.5) level = 10;
    else if (visceralFat < 12) level = 11;
    else level = 12;
    
    // Risk categorization
    let riskCategory;
    if (level <= 4) riskCategory = 'normal';
    else if (level <= 8) riskCategory = 'high';
    else riskCategory = 'very high';
    
    // Health implications
    const healthImplications = [
      level > 4 && 'Increased risk of cardiovascular disease',
      level > 6 && 'Elevated risk of type 2 diabetes',
      level > 8 && 'Increased inflammation markers',
      level > 10 && 'Significantly elevated metabolic syndrome risk'
    ].filter(Boolean);
    
    // Recommendations
    const recommendations = [
      'Focus on cardiovascular exercise to reduce visceral fat',
      level > 6 && 'Consider intermittent fasting or time-restricted eating',
      level > 8 && 'Consult with a healthcare provider for metabolic screening',
      'Reduce refined carbohydrate and sugar intake',
      'Increase dietary fiber and protein intake',
      level > 4 && 'Aim for 150+ minutes of moderate exercise per week'
    ].filter(Boolean);
    
    return {
      level,
      area: visceralFat,
      riskCategory,
      healthImplications,
      recommendations
    };
    
  } catch (error) {
    throw new Error(`Error estimating visceral fat: ${error.message}`);
  }
};

/**
 * Bone density analysis
 */
exports.boneDensityAnalysis = async (userId) => {
  try {
    const scan = await exports.generateScan(userId);
    const boneDensity = scan.boneDensity;
    
    // Osteoporosis risk
    let osteoporosisRisk;
    if (boneDensity.tScore >= -1.0) osteoporosisRisk = 'normal';
    else if (boneDensity.tScore >= -2.5) osteoporosisRisk = 'osteopenia';
    else osteoporosisRisk = 'osteoporosis';
    
    // Recommendations based on bone density
    const recommendations = [
      boneDensity.tScore < -1.0 && 'Increase calcium intake (1000-1200mg daily)',
      boneDensity.tScore < -1.0 && 'Ensure adequate vitamin D levels (2000-4000 IU daily)',
      boneDensity.tScore < -2.5 && 'Consult with physician about bone density medication',
      'Engage in weight-bearing exercises (walking, resistance training)',
      boneDensity.tScore < -1.5 && 'Consider DEXA scan for accurate assessment',
      'Limit alcohol consumption and avoid smoking'
    ].filter(Boolean);
    
    return {
      tScore: boneDensity.tScore,
      zScore: boneDensity.zScore,
      fraxRisk: scan.fraxRisk,
      osteoporosisRisk,
      recommendations
    };
    
  } catch (error) {
    throw new Error(`Error analyzing bone density: ${error.message}`);
  }
};

// ========================================
// HELPER FUNCTIONS
// ========================================

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return 30; // Default
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function calculateBodyFatPercentage(weight, height, age, sex, snapshot) {
  // If we have actual measurements, use those
  if (snapshot?.bodyFatPercentage) return snapshot.bodyFatPercentage;
  
  // Otherwise, estimate using BMI-based formula
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  
  // Deurenberg formula
  let bodyFat;
  if (sex === 'male') {
    bodyFat = (1.20 * bmi) + (0.23 * age) - 16.2;
  } else {
    bodyFat = (1.20 * bmi) + (0.23 * age) - 5.4;
  }
  
  // Clamp to reasonable ranges
  return Math.max(5, Math.min(50, bodyFat));
}

function estimateVisceralFat(weight, height, bodyFat, age, sex) {
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  
  // Visceral fat estimation formula
  let visceralFat;
  if (sex === 'male') {
    visceralFat = (bmi - 25) * 0.8 + (age - 30) * 0.05 + (bodyFat - 20) * 0.3;
  } else {
    visceralFat = (bmi - 25) * 0.7 + (age - 30) * 0.06 + (bodyFat - 28) * 0.25;
  }
  
  // Clamp to 0-15 range (kg)
  return Math.max(0, Math.min(15, visceralFat));
}

function calculateRegionalDistribution(weight, bodyFat, sex) {
  const fatMass = weight * (bodyFat / 100);
  const leanMass = weight - fatMass;
  
  // Regional distribution varies by sex
  const distribution = sex === 'male' ? {
    android: 0.35, // Men store more fat in upper body
    gynoid: 0.15,
    arms: 0.15,
    legs: 0.20,
    trunk: 0.15
  } : {
    android: 0.20, // Women store more fat in lower body
    gynoid: 0.30,
    arms: 0.12,
    legs: 0.25,
    trunk: 0.13
  };
  
  return {
    android: {
      fatMass: Math.round(fatMass * distribution.android * 10) / 10,
      leanMass: Math.round(leanMass * 0.25 * 10) / 10,
      fatPercentage: Math.round(bodyFat * 1.2 * 10) / 10
    },
    gynoid: {
      fatMass: Math.round(fatMass * distribution.gynoid * 10) / 10,
      leanMass: Math.round(leanMass * 0.30 * 10) / 10,
      fatPercentage: Math.round(bodyFat * 1.1 * 10) / 10
    },
    arms: {
      fatMass: Math.round(fatMass * distribution.arms * 10) / 10,
      leanMass: Math.round(leanMass * 0.15 * 10) / 10
    },
    legs: {
      fatMass: Math.round(fatMass * distribution.legs * 10) / 10,
      leanMass: Math.round(leanMass * 0.40 * 10) / 10
    },
    trunk: {
      fatMass: Math.round(fatMass * distribution.trunk * 10) / 10,
      leanMass: Math.round(leanMass * 0.35 * 10) / 10
    }
  };
}

function calculateBoneDensity(age, sex, weight, height) {
  // T-score: comparison to young adult peak bone mass
  // Z-score: comparison to age-matched population
  
  // Simplified estimation (would need actual DEXA for accuracy)
  let baseT = 0;
  
  // Age factor
  if (age > 50) baseT -= (age - 50) * 0.03;
  if (age > 70) baseT -= (age - 70) * 0.05;
  
  // Sex factor
  if (sex === 'female') baseT -= 0.3;
  
  // Weight factor (lower weight = lower bone density)
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  if (bmi < 20) baseT -= (20 - bmi) * 0.1;
  
  const tScore = Math.round(baseT * 10) / 10;
  const zScore = Math.round((tScore + 0.5) * 10) / 10; // Simplified z-score
  
  return {
    tScore,
    zScore,
    spine: tScore - 0.1,
    femur: tScore + 0.05,
    total: tScore
  };
}

function calculateFRAXRisk(age, sex, boneDensity, weight, height) {
  // Simplified FRAX calculation
  // Real FRAX requires more inputs (fracture history, medications, etc.)
  
  let majorRisk = 0;
  let hipRisk = 0;
  
  // Age factor
  if (age > 50) majorRisk += (age - 50) * 0.3;
  if (age > 50) hipRisk += (age - 50) * 0.15;
  
  // Bone density factor
  if (boneDensity.tScore < -1) {
    majorRisk += Math.abs(boneDensity.tScore) * 2;
    hipRisk += Math.abs(boneDensity.tScore) * 1.5;
  }
  
  // Sex factor
  if (sex === 'female') {
    majorRisk += 2;
    hipRisk += 1;
  }
  
  // BMI factor
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  if (bmi < 20) {
    majorRisk += 2;
    hipRisk += 1.5;
  }
  
  return {
    majorFracture: Math.min(40, Math.max(0, Math.round(majorRisk * 10) / 10)),
    hipFracture: Math.min(20, Math.max(0, Math.round(hipRisk * 10) / 10))
  };
}

function generateRecommendations(bodyFat, visceralFat, boneDensity, age, sex) {
  const recommendations = [];
  
  // Body fat recommendations
  const optimalBodyFat = sex === 'male' ? { min: 10, max: 20 } : { min: 18, max: 28 };
  if (bodyFat > optimalBodyFat.max) {
    recommendations.push({
      category: 'body_composition',
      priority: 'high',
      message: `Body fat is above optimal range. Consider cardio and strength training to reduce body fat.`
    });
  }
  
  // Visceral fat recommendations
  if (visceralFat > 4) {
    recommendations.push({
      category: 'visceral_fat',
      priority: 'high',
      message: 'Visceral fat is elevated. Focus on diet quality and regular cardiovascular exercise.'
    });
  }
  
  // Bone density recommendations
  if (boneDensity.tScore < -1.0) {
    recommendations.push({
      category: 'bone_health',
      priority: boneDensity.tScore < -2.5 ? 'critical' : 'medium',
      message: 'Bone density is below optimal. Increase calcium, vitamin D, and weight-bearing exercise.'
    });
  }
  
  // Age-specific recommendations
  if (age > 40) {
    recommendations.push({
      category: 'general',
      priority: 'low',
      message: 'Consider annual DEXA scans to track bone density and body composition changes.'
    });
  }
  
  return recommendations;
}

function calculateConfidence(snapshot, composition) {
  let confidence = 50; // Base confidence
  
  if (snapshot?.weight?.value) confidence += 10;
  if (snapshot?.bodyFatPercentage) confidence += 20;
  if (snapshot?.waist) confidence += 10;
  if (composition?.circumferences) confidence += 10;
  
  return Math.min(100, confidence);
}

module.exports = exports;
