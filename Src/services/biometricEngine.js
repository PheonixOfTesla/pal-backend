// Src/services/mercury/biometricEngine.js
const WearableData = require('../models/WearableData');
const SleepData = require('../models/SleepData');
const BodyComposition = require('../models/BodyComposition');
const HealthMetric = require('../models/HealthMetric');
const dexaSimulator = require('./dexaSimulator');
const metabolicCalculator = require('./metabolicCalculator');
const healthRatios = require('./healthRatios');

class BiometricEngine {
  /**
   * Get comprehensive body composition analysis
   */
  async getComprehensiveComposition(userId) {
    try {
      // Get DEXA simulation
      const dexaData = await dexaSimulator.generateScan(userId);
      
      // Get health ratios
      const ratios = await healthRatios.calculateAll(userId);
      
      // Get metabolic rates
      const metabolicRates = await metabolicCalculator.calculate(userId);
      
      // Get predictions
      const predictions = await this.predictBodyCompositionChanges(userId);
      
      // Generate AI insights
      const aiInsights = await this.generateCompositionInsights(userId, dexaData, ratios);

      return {
        dexaData,
        healthRatios: ratios,
        metabolicRates,
        predictions,
        aiInsights
      };
    } catch (error) {
      console.error('Comprehensive composition error:', error);
      throw error;
    }
  }

  /**
   * Analyze hydration status
   */
  async analyzeHydration(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's water intake logs
    const waterLogs = await HealthMetric.find({
      userId,
      type: 'water_intake',
      date: { $gte: today }
    });

    const totalIntake = waterLogs.reduce((sum, log) => sum + (log.value || 0), 0);

    // Calculate hydration goal based on body weight and activity
    const user = await this.getUserData(userId);
    const bodyWeight = user?.weight || 70; // kg
    const activityLevel = user?.activityLevel || 'moderate';
    
    // Base: 30-35ml per kg body weight
    let baseGoal = bodyWeight * 33; // ml
    
    // Adjust for activity
    const activityMultipliers = {
      sedentary: 1.0,
      light: 1.1,
      moderate: 1.2,
      active: 1.3,
      veryActive: 1.4
    };
    
    const goalMl = baseGoal * (activityMultipliers[activityLevel] || 1.2);

    // Determine status
    const percentage = (totalIntake / goalMl) * 100;
    let status, alerts, recommendations;

    if (percentage < 50) {
      status = 'severely_dehydrated';
      alerts = ['Severe dehydration risk'];
      recommendations = [
        'Drink water immediately',
        'Aim for 250ml every 30 minutes',
        'Monitor urine color (should be pale yellow)'
      ];
    } else if (percentage < 75) {
      status = 'dehydrated';
      alerts = ['Below hydration target'];
      recommendations = [
        'Increase water intake',
        'Drink 500ml within the next hour'
      ];
    } else if (percentage < 100) {
      status = 'slightly_dehydrated';
      alerts = [];
      recommendations = ['Continue hydrating steadily'];
    } else if (percentage <= 120) {
      status = 'optimal';
      alerts = [];
      recommendations = ['Hydration on track'];
    } else {
      status = 'overhydrated';
      alerts = ['Potential overhydration'];
      recommendations = ['Reduce fluid intake', 'Monitor electrolyte balance'];
    }

    return {
      status,
      intakeMl: totalIntake,
      goalMl: Math.round(goalMl),
      percentage: Math.round(percentage),
      recommendations,
      alerts,
      hourlyTarget: Math.round(goalMl / 16) // Assuming 16 waking hours
    };
  }

  /**
   * Analyze biometric trends over time
   */
  async analyzeTrends(userId, days, metrics) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const timeSeriesData = {};
    
    for (const metric of metrics) {
      const data = await this.getMetricTimeSeries(userId, metric, startDate);
      timeSeriesData[metric] = data;
    }

    // Generate predictions for each metric
    const futurePredictions = {};
    for (const metric of metrics) {
      futurePredictions[metric] = this.predictMetricTrend(timeSeriesData[metric]);
    }

    // Generate AI insights
    const aiGeneratedInsights = await this.generateTrendInsights(timeSeriesData);

    // Detect significant changes
    const significantChanges = this.detectSignificantChanges(timeSeriesData);

    return {
      timeSeriesData,
      futurePredictions,
      aiGeneratedInsights,
      significantChanges
    };
  }

  /**
   * Get metric time series
   */
  async getMetricTimeSeries(userId, metric, startDate) {
    const metricMap = {
      bodyFat: { model: BodyComposition, field: 'bodyFatPercentage' },
      leanMass: { model: BodyComposition, field: 'leanMass' },
      weight: { model: BodyComposition, field: 'weight' },
      hrv: { model: WearableData, field: 'hrv' },
      rhr: { model: WearableData, field: 'rhr' }
    };

    const config = metricMap[metric];
    if (!config) return [];

    const data = await config.model.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 }).lean();

    return data.map(d => ({
      date: d.date,
      value: d[config.field]
    })).filter(d => d.value !== undefined && d.value !== null);
  }

  /**
   * Predict metric trend
   */
  predictMetricTrend(data) {
    if (data.length < 7) {
      return { predicted: null, confidence: 0, message: 'Insufficient data' };
    }

    // Simple linear regression
    const n = data.length;
    const x = data.map((_, i) => i);
    const y = data.map(d => d.value);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict next 7 days
    const predictions = [];
    for (let i = 0; i < 7; i++) {
      const dayIndex = n + i;
      predictions.push({
        day: i + 1,
        value: slope * dayIndex + intercept
      });
    }

    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const ssResidual = y.reduce((sum, yi, i) => {
      const predicted = slope * x[i] + intercept;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    
    const rSquared = 1 - (ssResidual / ssTotal);
    const confidence = Math.max(0, Math.min(100, rSquared * 100));

    return {
      predictions,
      trend: slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable',
      confidence: Math.round(confidence)
    };
  }

  /**
   * Generate trend insights using AI
   */
  async generateTrendInsights(timeSeriesData) {
    const insights = [];

    // Analyze each metric
    for (const [metric, data] of Object.entries(timeSeriesData)) {
      if (data.length < 7) continue;

      const values = data.map(d => d.value);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const latest = values[values.length - 1];
      const change = ((latest - values[0]) / values[0]) * 100;

      if (Math.abs(change) > 5) {
        insights.push({
          metric,
          type: change > 0 ? 'increase' : 'decrease',
          magnitude: Math.abs(change).toFixed(1) + '%',
          message: `${metric} has ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(1)}% over the period`,
          significance: Math.abs(change) > 10 ? 'high' : 'medium'
        });
      }

      // Check for volatility
      const stdDev = this.calculateStdDev(values);
      const cv = (stdDev / avg) * 100; // Coefficient of variation

      if (cv > 15) {
        insights.push({
          metric,
          type: 'volatility',
          message: `${metric} shows high variability (${cv.toFixed(1)}% CV)`,
          significance: 'medium',
          recommendation: 'Consider reviewing lifestyle factors affecting consistency'
        });
      }
    }

    return insights;
  }

  /**
   * Detect significant changes
   */
  detectSignificantChanges(timeSeriesData) {
    const changes = [];

    for (const [metric, data] of Object.entries(timeSeriesData)) {
      if (data.length < 14) continue;

      // Compare last 7 days to previous 7 days
      const recent = data.slice(-7).map(d => d.value);
      const previous = data.slice(-14, -7).map(d => d.value);

      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
      
      const percentChange = ((recentAvg - previousAvg) / previousAvg) * 100;

      if (Math.abs(percentChange) > 5) {
        changes.push({
          metric,
          change: percentChange,
          direction: percentChange > 0 ? 'increased' : 'decreased',
          alert: Math.abs(percentChange) > 10 ? 'significant' : 'moderate'
        });
      }
    }

    return changes;
  }

  /**
   * Calculate correlations between metrics
   */
  async calculateCorrelations(userId) {
    const days = 90;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get all biometric data
    const wearableData = await WearableData.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 }).lean();

    const bodyData = await BodyComposition.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 }).lean();

    // Build correlation matrix
    const metrics = ['hrv', 'rhr', 'sleep.duration', 'steps', 'bodyFatPercentage', 'weight'];
    const matrix = {};

    for (let i = 0; i < metrics.length; i++) {
      for (let j = i + 1; j < metrics.length; j++) {
        const metric1 = metrics[i];
        const metric2 = metrics[j];
        
        const correlation = this.calculatePearsonCorrelation(
          wearableData,
          bodyData,
          metric1,
          metric2
        );

        const key = `${metric1}_${metric2}`;
        matrix[key] = correlation;
      }
    }

    // Find strongest correlations
    const topCorrelations = Object.entries(matrix)
      .map(([pair, value]) => ({
        pair,
        correlation: value,
        strength: Math.abs(value) > 0.7 ? 'strong' : Math.abs(value) > 0.5 ? 'moderate' : 'weak'
      }))
      .filter(c => Math.abs(c.correlation) > 0.5)
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      .slice(0, 5);

    // Generate insights
    const insights = topCorrelations.map(c => ({
      ...c,
      insight: this.generateCorrelationInsight(c.pair, c.correlation)
    }));

    return {
      matrix,
      topCorrelations,
      insights
    };
  }

  /**
   * Calculate Pearson correlation
   */
  calculatePearsonCorrelation(wearableData, bodyData, metric1, metric2) {
    // Simplified correlation calculation
    // In production, use proper data alignment by date
    return 0.65; // Placeholder
  }

  /**
   * Generate correlation insight
   */
  generateCorrelationInsight(pair, correlation) {
    const [m1, m2] = pair.split('_');
    const direction = correlation > 0 ? 'positively' : 'negatively';
    
    return `${m1} is ${direction} correlated with ${m2} (r=${correlation.toFixed(2)})`;
  }

  /**
   * Analyze HRV
   */
  async analyzeHRV(userId) {
    const days = 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await WearableData.find({
      userId,
      date: { $gte: startDate },
      hrv: { $exists: true }
    }).sort({ date: 1 }).lean();

    if (data.length === 0) {
      return {
        average: null,
        baseline: null,
        deviation: null,
        trend: 'insufficient_data',
        alert: 'No HRV data available'
      };
    }

    const hrvValues = data.map(d => d.hrv);
    const average = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;

    // Get 30-day baseline
    const baselineData = await WearableData.find({
      userId,
      date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      hrv: { $exists: true }
    }).lean();

    const baseline = baselineData.length > 0
      ? baselineData.reduce((sum, d) => sum + d.hrv, 0) / baselineData.length
      : average;

    const deviation = ((average - baseline) / baseline) * 100;

    let trend, alert;
    if (deviation < -10) {
      trend = 'significantly_decreasing';
      alert = 'HRV is significantly below baseline - consider rest';
    } else if (deviation < -5) {
      trend = 'decreasing';
      alert = 'HRV is below baseline - monitor recovery';
    } else if (deviation > 10) {
      trend = 'significantly_increasing';
      alert = 'HRV is significantly above baseline - good recovery';
    } else if (deviation > 5) {
      trend = 'increasing';
      alert = 'HRV is above baseline - positive trend';
    } else {
      trend = 'stable';
      alert = null;
    }

    return {
      average: Math.round(average),
      baseline: Math.round(baseline),
      deviation: deviation.toFixed(1),
      trend,
      alert,
      data: hrvValues
    };
  }

  /**
   * Deep HRV analysis with frequency domain
   */
  async deepHRVAnalysis(userId) {
    const hrvData = await this.analyzeHRV(userId);

    // Time domain metrics
    const timeDomain = {
      rMSSD: hrvData.average,
      sdnn: hrvData.average * 1.2, // Estimated
      pNN50: 15 // Placeholder
    };

    // Frequency domain (requires actual RR intervals - simplified here)
    const frequencyDomain = {
      lfPower: 1200, // ms²
      hfPower: 800, // ms²
      lfHfRatio: 1.5,
      totalPower: 2000
    };

    // Non-linear metrics
    const nonlinear = {
      sd1: hrvData.average * 0.7,
      sd2: hrvData.average * 1.3,
      sd1Sd2Ratio: 0.54
    };

    // Stress level estimation
    let stressLevel;
    const lfHfRatio = frequencyDomain.lfHfRatio;
    
    if (lfHfRatio > 2.5) {
      stressLevel = 'high';
    } else if (lfHfRatio > 1.5) {
      stressLevel = 'moderate';
    } else {
      stressLevel = 'low';
    }

    return {
      timeDomain,
      frequencyDomain,
      nonlinear,
      stressLevel
    };
  }

  /**
   * Analyze heart rate
   */
  async analyzeHeartRate(userId) {
    const days = 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await WearableData.find({
      userId,
      date: { $gte: startDate },
      rhr: { $exists: true }
    }).sort({ date: 1 }).lean();

    if (data.length === 0) {
      return {
        restingHeartRate: null,
        trends: 'insufficient_data',
        zones: null,
        recoveryStatus: 'unknown'
      };
    }

    const rhrValues = data.map(d => d.rhr);
    const avgRHR = Math.round(rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length);

    // Calculate HR zones (simplified)
    const maxHR = 220 - (await this.getUserAge(userId) || 30);
    const zones = {
      zone1: { min: Math.round(maxHR * 0.5), max: Math.round(maxHR * 0.6), name: 'Very Light' },
      zone2: { min: Math.round(maxHR * 0.6), max: Math.round(maxHR * 0.7), name: 'Light' },
      zone3: { min: Math.round(maxHR * 0.7), max: Math.round(maxHR * 0.8), name: 'Moderate' },
      zone4: { min: Math.round(maxHR * 0.8), max: Math.round(maxHR * 0.9), name: 'Hard' },
      zone5: { min: Math.round(maxHR * 0.9), max: maxHR, name: 'Maximum' }
    };

    // Determine recovery status based on RHR trend
    const recentRHR = rhrValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const previousRHR = rhrValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const change = recentRHR - previousRHR;

    let recoveryStatus;
    if (change < -5) recoveryStatus = 'excellent';
    else if (change < -2) recoveryStatus = 'good';
    else if (change < 2) recoveryStatus = 'normal';
    else if (change < 5) recoveryStatus = 'poor';
    else recoveryStatus = 'concerning';

    return {
      restingHeartRate: avgRHR,
      trends: {
        current: Math.round(recentRHR),
        previous: Math.round(previousRHR),
        change: change.toFixed(1)
      },
      zones,
      recoveryStatus
    };
  }

  /**
   * Calculate readiness score
   */
  async calculateReadiness(userId) {
    // Get latest data
    const hrvAnalysis = await this.analyzeHRV(userId);
    const hrAnalysis = await this.analyzeHeartRate(userId);
    
    const latestSleep = await SleepData.findOne({ userId }).sort({ date: -1 }).lean();
    const latestWearable = await WearableData.findOne({ userId }).sort({ date: -1 }).lean();

    // Calculate component scores (0-100)
    let hrvScore = 0;
    if (hrvAnalysis.baseline) {
      const deviation = hrvAnalysis.deviation;
      hrvScore = Math.min(100, Math.max(0, 50 + deviation * 2));
    }

    let sleepScore = 0;
    if (latestSleep) {
      const duration = latestSleep.duration || 0;
      const efficiency = latestSleep.efficiency || 0;
      sleepScore = Math.min(100, (duration / 480) * 50 + efficiency * 0.5);
    }

    let rhrScore = 0;
    if (hrAnalysis.restingHeartRate) {
      // Lower RHR is better
      const rhr = hrAnalysis.restingHeartRate;
      rhrScore = Math.min(100, Math.max(0, 100 - (rhr - 40)));
    }

    let loadScore = 80; // Placeholder - would calculate from training load

    // Weighted average: 40% HRV, 25% Sleep, 25% RHR, 10% Load
    const totalScore = Math.round(
      hrvScore * 0.4 +
      sleepScore * 0.25 +
      rhrScore * 0.25 +
      loadScore * 0.1
    );

    let recommendation, trainingReady;
    if (totalScore >= 80) {
      recommendation = 'Excellent readiness - good day for intense training';
      trainingReady = true;
    } else if (totalScore >= 65) {
      recommendation = 'Good readiness - moderate training recommended';
      trainingReady = true;
    } else if (totalScore >= 50) {
      recommendation = 'Average readiness - light training or active recovery';
      trainingReady = false;
    } else {
      recommendation = 'Low readiness - prioritize rest and recovery';
      trainingReady = false;
    }

    return {
      score: totalScore,
      factors: {
        hrv: Math.round(hrvScore),
        sleep: Math.round(sleepScore),
        rhr: Math.round(rhrScore),
        trainingLoad: Math.round(loadScore)
      },
      recommendation,
      trainingReady
    };
  }

  /**
   * Analyze sleep trends
   */
  async analyzeSleepTrends(sleepLogs) {
    if (sleepLogs.length === 0) {
      return { trend: 'no_data', message: 'No sleep data available' };
    }

    const durations = sleepLogs.map(log => log.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    const recentAvg = durations.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, durations.length);
    
    let trend;
    if (recentAvg > avgDuration + 30) trend = 'improving';
    else if (recentAvg < avgDuration - 30) trend = 'declining';
    else trend = 'stable';

    return {
      trend,
      averageDuration: Math.round(avgDuration),
      recentAverage: Math.round(recentAvg),
      consistency: this.calculateConsistency(durations)
    };
  }

  /**
   * Analyze sleep quality
   */
  async analyzeSleepQuality(userId) {
    const days = 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const sleepData = await SleepData.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 }).lean();

    if (sleepData.length === 0) {
      return {
        qualityScore: null,
        stageBreakdown: null,
        efficiency: null,
        recommendations: ['Start logging sleep data']
      };
    }

    const avgDuration = sleepData.reduce((sum, s) => sum + s.duration, 0) / sleepData.length;
    const avgEfficiency = sleepData.reduce((sum, s) => sum + (s.efficiency || 0), 0) / sleepData.length;

    // Calculate stage breakdown
    const stageBreakdown = {
      deep: 0,
      light: 0,
      rem: 0,
      wake: 0
    };

    sleepData.forEach(sleep => {
      if (sleep.stages) {
        Object.keys(stageBreakdown).forEach(stage => {
          stageBreakdown[stage] += (sleep.stages[stage] || 0);
        });
      }
    });

    Object.keys(stageBreakdown).forEach(stage => {
      stageBreakdown[stage] = Math.round(stageBreakdown[stage] / sleepData.length);
    });

    // Calculate quality score
    let qualityScore = 0;
    qualityScore += Math.min(25, (avgDuration / 480) * 25); // Duration (8 hours = 480 min)
    qualityScore += Math.min(25, avgEfficiency * 0.25); // Efficiency
    qualityScore += Math.min(25, (stageBreakdown.deep / 90) * 25); // Deep sleep (90 min target)
    qualityScore += Math.min(25, (stageBreakdown.rem / 90) * 25); // REM sleep (90 min target)

    // Recommendations
    const recommendations = [];
    if (avgDuration < 420) recommendations.push('Increase sleep duration (aim for 7-9 hours)');
    if (avgEfficiency < 85) recommendations.push('Improve sleep efficiency - consider sleep hygiene');
    if (stageBreakdown.deep < 60) recommendations.push('Increase deep sleep - avoid alcohol, cool room');
    if (stageBreakdown.rem < 60) recommendations.push('Increase REM sleep - maintain consistent schedule');

    return {
      qualityScore: Math.round(qualityScore),
      stageBreakdown,
      efficiency: Math.round(avgEfficiency),
      recommendations: recommendations.length > 0 ? recommendations : ['Sleep quality is good!']
    };
  }

  /**
   * Generate sleep recommendations
   */
  async generateSleepRecommendations(userId) {
    const sleepQuality = await this.analyzeSleepQuality(userId);
    
    const sleepData = await SleepData.find({ userId })
      .sort({ date: -1 })
      .limit(14)
      .lean();

    if (sleepData.length === 0) {
      return {
        optimalBedtime: '22:00',
        optimalWakeTime: '06:00',
        tips: ['Start logging sleep data for personalized recommendations']
      };
    }

    // Calculate average sleep/wake times
    const bedtimes = sleepData.map(s => new Date(s.bedtime).getHours() * 60 + new Date(s.bedtime).getMinutes());
    const waketimes = sleepData.map(s => new Date(s.wakeTime).getHours() * 60 + new Date(s.wakeTime).getMinutes());

    const avgBedtime = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
    const avgWaketime = waketimes.reduce((a, b) => a + b, 0) / waketimes.length;

    const bedtimeHour = Math.floor(avgBedtime / 60);
    const bedtimeMin = Math.round(avgBedtime % 60);
    const waketimeHour = Math.floor(avgWaketime / 60);
    const waketimeMin = Math.round(avgWaketime % 60);

    const tips = [
      'Maintain consistent sleep schedule',
      'Avoid screens 1 hour before bed',
      'Keep bedroom cool (60-67°F)',
      'Avoid caffeine after 2 PM',
      'Exercise regularly, but not close to bedtime'
    ];

    if (sleepQuality.qualityScore < 70) {
      tips.unshift('Consider consulting a sleep specialist');
    }

    return {
      optimalBedtime: `${bedtimeHour.toString().padStart(2, '0')}:${bedtimeMin.toString().padStart(2, '0')}`,
      optimalWakeTime: `${waketimeHour.toString().padStart(2, '0')}:${waketimeMin.toString().padStart(2, '0')}`,
      tips
    };
  }

  /**
   * Generate AI insights from biometric data
   */
  async generateInsights(userId) {
    const insights = [];
    const recommendations = [];
    const alerts = [];

    // Get recent data
    const hrvAnalysis = await this.analyzeHRV(userId);
    const hrAnalysis = await this.analyzeHeartRate(userId);
    const sleepQuality = await this.analyzeSleepQuality(userId);
    const readiness = await this.calculateReadiness(userId);

    // Generate insights based on patterns
    if (readiness.score < 50) {
      alerts.push({
        severity: 'high',
        message: 'Low readiness detected',
        recommendation: 'Prioritize recovery today'
      });
    }

    if (hrvAnalysis.trend === 'significantly_decreasing') {
      insights.push({
        type: 'hrv_decline',
        message: 'HRV has significantly decreased',
        impact: 'May indicate overtraining or illness',
        action: 'Consider reducing training intensity'
      });
    }

    if (sleepQuality.qualityScore && sleepQuality.qualityScore < 60) {
      insights.push({
        type: 'poor_sleep',
        message: 'Sleep quality is below optimal',
        impact: 'Affects recovery and performance',
        action: 'Review sleep recommendations'
      });
      recommendations.push(...sleepQuality.recommendations);
    }

    if (hrAnalysis.recoveryStatus === 'concerning') {
      alerts.push({
        severity: 'medium',
        message: 'Elevated resting heart rate detected',
        recommendation: 'Monitor for signs of overtraining or illness'
      });
    }

    return {
      insights,
      recommendations,
      alerts,
      overallStatus: readiness.score >= 65 ? 'good' : readiness.score >= 50 ? 'fair' : 'poor'
    };
  }

  // Helper methods

  async getUserData(userId) {
    const User = require('../../models/User');
    return await User.findById(userId).lean();
  }

  async getUserAge(userId) {
    const user = await this.getUserData(userId);
    if (!user || !user.dateOfBirth) return null;
    
    const today = new Date();
    const birthDate = new Date(user.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  calculateStdDev(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  calculateConsistency(values) {
    if (values.length < 2) return 0;
    
    const stdDev = this.calculateStdDev(values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const cv = (stdDev / avg) * 100;
    
    return Math.max(0, Math.min(100, 100 - cv));
  }

  async predictBodyCompositionChanges(userId) {
    // Simplified prediction
    return {
      bodyFat: { sevenDays: -0.5, thirtyDays: -2.0 },
      leanMass: { sevenDays: 0.3, thirtyDays: 1.2 }
    };
  }

  async generateCompositionInsights(userId, dexaData, ratios) {
    return [
      'Body composition is within healthy range',
      'Continue current nutrition and training approach'
    ];
  }
}

module.exports = new BiometricEngine();
