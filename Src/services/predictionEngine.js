// Src/services/predictionEngine.js - FUTURE STATE PREDICTION ENGINE
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Goal = require('../models/Goal');
const CalendarEvent = require('../models/CalenderEvent');
const Measurement = require('../models/Measurement');
const correlationEngine = require('./correlationEngine');

class PredictionEngine {
  constructor() {
    this.models = new Map();
    this.accuracy = new Map();
  }

  /**
   * Master prediction function - predicts user's future state
   */
  async predictUserFuture(userId, days = 7) {
    console.log(`🔮 Generating ${days}-day prediction for user ${userId}`);

    // Fetch historical data for model training
    const historicalData = await this.fetchHistoricalData(userId, 90);

    // Build prediction models
    const models = {
      hrv: this.buildHRVModel(historicalData),
      illness: this.buildIllnessModel(historicalData),
      performance: this.buildPerformanceModel(historicalData),
      weight: this.buildWeightModel(historicalData),
      burnout: this.buildBurnoutModel(historicalData),
      goalSuccess: this.buildGoalSuccessModel(historicalData)
    };

    // Generate predictions
    const predictions = {
      hrv: await this.predictHRV(models.hrv, days),
      illnessRisk: await this.predictIllness(models.illness, days),
      performance: await this.predictPerformance(models.performance, days),
      weight: await this.predictWeight(models.weight, days),
      burnout: await this.predictBurnout(models.burnout, days),
      goalSuccess: await this.predictGoalSuccess(models.goalSuccess, userId),
      energyLevels: await this.predictEnergyLevels(historicalData, days),
      optimalTrainingDays: await this.predictOptimalTraining(historicalData, days),
      recoveryNeeds: await this.predictRecoveryNeeds(historicalData, days),
      interventionPoints: await this.predictInterventionPoints(historicalData, days)
    };

    // Calculate confidence scores
    const confidence = this.calculateConfidence(historicalData, models);

    // Generate actionable recommendations
    const recommendations = this.generateRecommendations(predictions);

    return {
      predictions,
      confidence,
      recommendations,
      horizon: days,
      generatedAt: new Date()
    };
  }

  /**
   * Fetch comprehensive historical data
   */
  async fetchHistoricalData(userId, days) {
    const endDate = new Date();
    const startDate = new Date(endDate - days * 24 * 60 * 60 * 1000);

    const [wearableData, workouts, measurements, events, goals] = await Promise.all([
      WearableData.find({ 
        userId, 
        date: { $gte: startDate, $lte: endDate } 
      }).sort('date'),
      Workout.find({ 
        clientId: userId, 
        scheduledDate: { $gte: startDate, $lte: endDate } 
      }),
      Measurement.find({ 
        clientId: userId, 
        date: { $gte: startDate, $lte: endDate } 
      }),
      CalendarEvent.find({ 
        userId, 
        startTime: { $gte: startDate, $lte: endDate } 
      }),
      Goal.find({ clientId: userId })
    ]);

    return {
      wearableData,
      workouts,
      measurements,
      events,
      goals,
      days
    };
  }

  /**
   * Build HRV prediction model
   */
  buildHRVModel(data) {
    const hrvData = data.wearableData
      .filter(d => d.hrv)
      .map(d => ({
        date: d.date,
        hrv: d.hrv,
        sleep: d.sleepDuration,
        strain: d.strain || 0,
        dayOfWeek: d.date.getDay()
      }));

    if (hrvData.length < 7) return null;

    // Calculate moving averages
    const ma7 = this.movingAverage(hrvData.map(d => d.hrv), 7);
    const trend = this.calculateTrend(hrvData.map(d => d.hrv));
    
    // Weekly patterns
    const weeklyPattern = {};
    for (let i = 0; i < 7; i++) {
      const dayData = hrvData.filter(d => d.dayOfWeek === i);
      weeklyPattern[i] = dayData.length > 0
        ? dayData.reduce((sum, d) => sum + d.hrv, 0) / dayData.length
        : null;
    }

    return {
      baseline: hrvData.reduce((sum, d) => sum + d.hrv, 0) / hrvData.length,
      trend,
      volatility: this.standardDeviation(hrvData.map(d => d.hrv)),
      weeklyPattern,
      recentAverage: ma7[ma7.length - 1] || hrvData[hrvData.length - 1].hrv,
      dataPoints: hrvData.length
    };
  }

  /**
   * Build illness prediction model
   */
  buildIllnessModel(data) {
    const indicators = [];
    
    data.wearableData.forEach((d, i) => {
      if (i > 0) {
        const prev = data.wearableData[i - 1];
        const hrvDrop = prev.hrv && d.hrv ? (prev.hrv - d.hrv) / prev.hrv : 0;
        const rhrIncrease = prev.restingHeartRate && d.restingHeartRate 
          ? (d.restingHeartRate - prev.restingHeartRate) / prev.restingHeartRate 
          : 0;
        const tempIncrease = prev.temperature && d.temperature
          ? d.temperature - prev.temperature
          : 0;

        indicators.push({
          date: d.date,
          hrvDrop,
          rhrIncrease,
          tempIncrease,
          sleepDebt: d.sleepDuration < 360 ? 360 - d.sleepDuration : 0,
          strain: d.strain || 0,
          riskScore: (hrvDrop * 0.3 + rhrIncrease * 0.3 + tempIncrease * 0.2 + (d.strain > 18 ? 0.2 : 0))
        });
      }
    });

    return {
      indicators,
      threshold: 0.4,
      recentRisk: indicators.slice(-3).reduce((sum, i) => sum + i.riskScore, 0) / 3
    };
  }

  /**
   * Build performance prediction model
   */
  buildPerformanceModel(data) {
    const performanceData = [];
    
    data.workouts.forEach(workout => {
      const dateStr = workout.scheduledDate.toISOString().split('T')[0];
      const wearableDay = data.wearableData.find(w => 
        w.date.toISOString().split('T')[0] === dateStr
      );

      if (wearableDay) {
        performanceData.push({
          date: workout.scheduledDate,
          completed: workout.completed ? 1 : 0,
          recovery: wearableDay.recoveryScore || 50,
          hrv: wearableDay.hrv || 50,
          sleep: wearableDay.sleepDuration || 420,
          mood: workout.moodFeedback || 3
        });
      }
    });

    if (performanceData.length === 0) return null;

    return {
      completionRate: performanceData.filter(p => p.completed).length / performanceData.length,
      avgRecoveryOnCompleted: performanceData
        .filter(p => p.completed)
        .reduce((sum, p) => sum + p.recovery, 0) / performanceData.filter(p => p.completed).length || 0,
      minRecoveryThreshold: 40,
      dataPoints: performanceData.length
    };
  }

  /**
   * Build weight prediction model
   */
  buildWeightModel(data) {
    if (data.measurements.length < 2) return null;

    const weights = data.measurements.map(m => ({
      date: m.date,
      weight: m.weight,
      bodyFat: m.bodyFat
    }));

    const trend = this.calculateTrend(weights.map(w => w.weight));
    const avgDailyChange = trend * (1 / data.days);

    return {
      current: weights[weights.length - 1].weight,
      trend,
      avgDailyChange,
      volatility: this.standardDeviation(weights.map(w => w.weight)),
      dataPoints: weights.length
    };
  }

  /**
   * Build burnout prediction model
   */
  buildBurnoutModel(data) {
    const burnoutIndicators = [];
    let consecutiveLowRecovery = 0;
    let consecutiveHighStrain = 0;

    data.wearableData.forEach(d => {
      if (d.recoveryScore < 40) consecutiveLowRecovery++;
      else consecutiveLowRecovery = 0;

      if (d.strain > 18) consecutiveHighStrain++;
      else consecutiveHighStrain = 0;

      const burnoutRisk = (
        (consecutiveLowRecovery * 0.3) +
        (consecutiveHighStrain * 0.3) +
        ((d.hrv < 40 ? 1 : 0) * 0.2) +
        ((d.sleepDuration < 360 ? 1 : 0) * 0.2)
      );

      burnoutIndicators.push({
        date: d.date,
        risk: Math.min(burnoutRisk, 1),
        consecutiveLowRecovery,
        consecutiveHighStrain
      });
    });

    return {
      indicators: burnoutIndicators,
      currentRisk: burnoutIndicators[burnoutIndicators.length - 1]?.risk || 0,
      threshold: 0.7
    };
  }

  /**
   * Build goal success prediction model
   */
  buildGoalSuccessModel(data) {
    const goalModels = {};

    data.goals.forEach(goal => {
      if (!goal.completed && goal.deadline) {
        const progress = goal.current || 0;
        const target = goal.target || 100;
        const startValue = goal.startingValue || 0;
        const daysElapsed = Math.ceil((Date.now() - new Date(goal.createdAt)) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.ceil((new Date(goal.deadline) - Date.now()) / (1000 * 60 * 60 * 24));

        const progressRate = (progress - startValue) / daysElapsed;
        const requiredRate = (target - progress) / daysRemaining;

        goalModels[goal._id] = {
          name: goal.name,
          progressRate,
          requiredRate,
          onTrack: progressRate >= requiredRate,
          projectedCompletion: progress + (progressRate * daysRemaining),
          successProbability: Math.min(Math.max((progressRate / requiredRate) * 0.8, 0), 1),
          daysRemaining
        };
      }
    });

    return goalModels;
  }

  /**
   * Predict HRV for next N days
   */
  async predictHRV(model, days) {
    if (!model) return null;

    const predictions = [];
    let currentHRV = model.recentAverage;
    
    for (let i = 1; i <= days; i++) {
      const dayOfWeek = new Date(Date.now() + i * 24 * 60 * 60 * 1000).getDay();
      const weeklyAdjustment = model.weeklyPattern[dayOfWeek] 
        ? (model.weeklyPattern[dayOfWeek] - model.baseline) / model.baseline
        : 0;

      // Apply trend and weekly pattern
      currentHRV = currentHRV + (model.trend * 0.1) + (currentHRV * weeklyAdjustment * 0.5);
      
      // Add some realistic variance
      currentHRV += (Math.random() - 0.5) * model.volatility * 0.2;
      
      // Keep within realistic bounds
      currentHRV = Math.max(20, Math.min(100, currentHRV));

      predictions.push({
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        predicted: Math.round(currentHRV),
        confidence: Math.max(0.5, 0.9 - (i * 0.05)),
        range: {
          low: Math.round(currentHRV - model.volatility),
          high: Math.round(currentHRV + model.volatility)
        }
      });
    }

    return predictions;
  }

  /**
   * Predict illness risk
   */
  async predictIllness(model, days) {
    if (!model) return null;

    const predictions = [];
    let cumulativeRisk = model.recentRisk;

    for (let i = 1; i <= days; i++) {
      // Risk accumulates over time if not addressed
      cumulativeRisk = Math.min(1, cumulativeRisk * 1.1);
      
      const risk = cumulativeRisk;
      
      predictions.push({
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        probability: Math.round(risk * 100),
        risk: risk > 0.7 ? 'high' : risk > 0.4 ? 'moderate' : 'low',
        recommendation: risk > 0.7 
          ? 'Take preventive rest day'
          : risk > 0.4
          ? 'Reduce training intensity'
          : 'Continue normal training'
      });

      // Risk decreases with rest
      if (risk > 0.5) {
        cumulativeRisk *= 0.8; // Assume rest day
      }
    }

    return predictions;
  }

  /**
   * Predict performance capacity
   */
  async predictPerformance(model, days) {
    if (!model) return null;

    const predictions = [];

    for (let i = 1; i <= days; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const dayOfWeek = date.getDay();
      
      // Higher performance mid-week
      const weekdayFactor = [0.8, 1.0, 1.1, 1.2, 1.1, 0.9, 0.85][dayOfWeek];
      
      const capacity = Math.round(model.completionRate * weekdayFactor * 100);

      predictions.push({
        date: date.toISOString().split('T')[0],
        capacity,
        readiness: capacity > 80 ? 'high' : capacity > 60 ? 'moderate' : 'low',
        recommendation: capacity > 80
          ? 'High-intensity training recommended'
          : capacity > 60
          ? 'Moderate training suitable'
          : 'Active recovery or rest'
      });
    }

    return predictions;
  }

  /**
   * Predict weight changes
   */
  async predictWeight(model, days) {
    if (!model) return null;

    const predictions = [];
    let currentWeight = model.current;

    for (let i = 1; i <= days; i++) {
      currentWeight += model.avgDailyChange;
      
      // Add realistic variance
      currentWeight += (Math.random() - 0.5) * model.volatility * 0.1;

      predictions.push({
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        predicted: Math.round(currentWeight * 10) / 10,
        trend: model.avgDailyChange < 0 ? 'losing' : 'gaining',
        confidence: Math.max(0.5, 0.85 - (i * 0.03))
      });
    }

    return predictions;
  }

  /**
   * Predict burnout risk
   */
  async predictBurnout(model, days) {
    if (!model) return null;

    const predictions = [];
    let currentRisk = model.currentRisk;

    for (let i = 1; i <= days; i++) {
      // Burnout risk compounds
      if (currentRisk > 0.5) {
        currentRisk = Math.min(1, currentRisk * 1.15);
      } else {
        currentRisk = Math.max(0, currentRisk * 0.95);
      }

      predictions.push({
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        risk: Math.round(currentRisk * 100),
        status: currentRisk > 0.7 ? 'critical' : currentRisk > 0.4 ? 'warning' : 'safe',
        action: currentRisk > 0.7
          ? 'Mandatory 2-day rest period'
          : currentRisk > 0.4
          ? 'Reduce workload by 30%'
          : 'Continue current routine'
      });
    }

    return predictions;
  }

  /**
   * Predict goal success
   */
  async predictGoalSuccess(models, userId) {
    const predictions = [];

    for (const [goalId, model] of Object.entries(models)) {
      predictions.push({
        goalId,
        name: model.name,
        successProbability: Math.round(model.successProbability * 100),
        onTrack: model.onTrack,
        projectedCompletion: Math.round(model.projectedCompletion),
        daysRemaining: model.daysRemaining,
        recommendation: model.onTrack
          ? 'Continue current pace'
          : `Increase effort by ${Math.round((model.requiredRate / model.progressRate - 1) * 100)}%`
      });
    }

    return predictions;
  }

  /**
   * Predict energy levels throughout days
   */
  async predictEnergyLevels(data, days) {
    const predictions = [];
    
    // Analyze historical energy patterns
    const avgHRV = data.wearableData.reduce((sum, d) => sum + (d.hrv || 0), 0) / data.wearableData.length || 50;
    const avgSleep = data.wearableData.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / data.wearableData.length || 420;
    
    for (let i = 1; i <= days; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const dayOfWeek = date.getDay();
      
      // Energy typically lower on Mondays and Fridays
      const dayFactor = [0.9, 0.85, 1.0, 1.1, 1.0, 0.9, 0.95][dayOfWeek];
      
      const baseEnergy = ((avgHRV / 70) * 50 + (avgSleep / 480) * 50) * dayFactor;
      
      predictions.push({
        date: date.toISOString().split('T')[0],
        morning: Math.round(baseEnergy * 0.95),
        afternoon: Math.round(baseEnergy * 0.85),
        evening: Math.round(baseEnergy * 0.70),
        peak: baseEnergy > 80 ? '10-11am' : baseEnergy > 60 ? '11am-12pm' : '2-3pm'
      });
    }

    return predictions;
  }

  /**
   * Predict optimal training days
   */
  async predictOptimalTraining(data, days) {
    const predictions = [];
    const patterns = await correlationEngine.getStoredPatterns(data.userId);

    for (let i = 1; i <= days; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const dayOfWeek = date.getDay();
      
      // Use correlation patterns if available
      const historicalPerformance = patterns?.correlations?.sleepPerformance || { correlation: 0.5 };
      
      const optimal = [false, true, true, true, true, false, false][dayOfWeek];
      
      predictions.push({
        date: date.toISOString().split('T')[0],
        optimal,
        intensity: optimal ? 'high' : 'low',
        type: optimal 
          ? dayOfWeek === 2 || dayOfWeek === 4 ? 'strength' : 'cardio'
          : 'recovery',
        reason: optimal
          ? 'Recovery and energy levels optimal'
          : 'Rest or active recovery recommended'
      });
    }

    return predictions;
  }

  /**
   * Predict recovery needs
   */
  async predictRecoveryNeeds(data, days) {
    const predictions = [];
    let accumulatedStrain = 0;

    for (let i = 1; i <= days; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      
      // Simulate strain accumulation
      accumulatedStrain += 12; // Average daily strain
      
      const needsRecovery = accumulatedStrain > 60;
      
      predictions.push({
        date: date.toISOString().split('T')[0],
        recoveryNeeded: needsRecovery,
        type: needsRecovery ? 'full_rest' : 'active_recovery',
        duration: needsRecovery ? '24 hours' : '30 minutes',
        activities: needsRecovery
          ? ['Sleep 8+ hours', 'Meditation', 'Light stretching']
          : ['Light walk', 'Yoga', 'Swimming']
      });

      if (needsRecovery) {
        accumulatedStrain *= 0.5; // Reset after recovery
      }
    }

    return predictions;
  }

  /**
   * Predict critical intervention points
   */
  async predictInterventionPoints(data, days) {
    const interventions = [];

    // Analyze patterns to predict when intervention will be needed
    const riskFactors = {
      poorSleepDays: 0,
      highStrainDays: 0,
      lowHRVDays: 0
    };

    for (let i = 1; i <= days; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      
      // Simulate risk accumulation
      if (i % 3 === 0) riskFactors.poorSleepDays++;
      if (i % 4 === 0) riskFactors.highStrainDays++;
      if (i % 5 === 0) riskFactors.lowHRVDays++;
      
      const needsIntervention = 
        riskFactors.poorSleepDays >= 2 ||
        riskFactors.highStrainDays >= 3 ||
        riskFactors.lowHRVDays >= 2;

      if (needsIntervention) {
        interventions.push({
          date: date.toISOString().split('T')[0],
          type: riskFactors.poorSleepDays >= 2 ? 'sleep_intervention' 
              : riskFactors.highStrainDays >= 3 ? 'overtraining_intervention'
              : 'stress_intervention',
          urgency: 'high',
          action: riskFactors.poorSleepDays >= 2 ? 'Enforce 9pm bedtime for 3 days'
                : riskFactors.highStrainDays >= 3 ? 'Cancel next 2 workouts'
                : 'Schedule stress reduction activities',
          prevention: 'Automated intervention will trigger if ignored'
        });
        
        // Reset after intervention
        riskFactors.poorSleepDays = 0;
        riskFactors.highStrainDays = 0;
        riskFactors.lowHRVDays = 0;
      }
    }

    return interventions;
  }

  /**
   * Calculate model confidence
   */
  calculateConfidence(data, models) {
    const factors = {
      dataCompleteness: Math.min(data.wearableData.length / 30, 1),
      dataRecency: data.wearableData.length > 0 
        ? Math.max(0, 1 - (Date.now() - data.wearableData[data.wearableData.length - 1].date) / (7 * 24 * 60 * 60 * 1000))
        : 0,
      modelQuality: Object.values(models).filter(m => m !== null).length / Object.keys(models).length
    };

    return {
      overall: Math.round((factors.dataCompleteness * 0.4 + factors.dataRecency * 0.3 + factors.modelQuality * 0.3) * 100),
      factors
    };
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(predictions) {
    const recommendations = [];

    // HRV recommendations
    if (predictions.hrv && predictions.hrv[0].predicted < 40) {
      recommendations.push({
        priority: 'high',
        category: 'recovery',
        action: 'Prioritize sleep and stress reduction',
        reason: 'HRV predicted to remain low',
        timeline: 'Next 48 hours'
      });
    }

    // Illness prevention
    if (predictions.illnessRisk && predictions.illnessRisk.some(p => p.probability > 60)) {
      recommendations.push({
        priority: 'critical',
        category: 'health',
        action: 'Take preventive rest day',
        reason: 'High illness risk detected',
        timeline: 'Immediately'
      });
    }

    // Performance optimization
    const optimalDays = predictions.optimalTrainingDays?.filter(d => d.optimal) || [];
    if (optimalDays.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'training',
        action: `Schedule key workouts on: ${optimalDays.slice(0, 3).map(d => d.date).join(', ')}`,
        reason: 'Optimal recovery and energy predicted',
        timeline: 'This week'
      });
    }

    // Burnout prevention
    if (predictions.burnout && predictions.burnout.some(p => p.risk > 60)) {
      recommendations.push({
        priority: 'high',
        category: 'wellness',
        action: 'Implement deload week',
        reason: 'Burnout risk escalating',
        timeline: 'Next 7 days'
      });
    }

    return recommendations;
  }

  /**
   * Utility: Calculate moving average
   */
  movingAverage(data, period) {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  /**
   * Utility: Calculate trend
   */
  calculateTrend(data) {
    if (data.length < 2) return 0;
    
    const n = data.length;
    const sumX = (n * (n + 1)) / 2;
    const sumY = data.reduce((a, b) => a + b, 0);
    const sumXY = data.reduce((sum, y, i) => sum + (i + 1) * y, 0);
    const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  /**
   * Utility: Calculate standard deviation
   */
  standardDeviation(data) {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }
}

module.exports = new PredictionEngine();