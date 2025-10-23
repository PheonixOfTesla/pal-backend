// Src/services/mercury/recoveryCalc.js
const RecoveryScore = require('../models/RecoveryScore');
const WearableData = require('../models/WearableData');
const SleepData = require('../models/SleepData');
const Workout = require('../models/Workout');

class RecoveryCalculator {
  /**
   * Calculate comprehensive recovery score
   */
  async calculateRecoveryScore(userId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get today's data
      const wearableData = await WearableData.findOne({
        userId,
        date: today
      }).lean();

      const sleepData = await SleepData.findOne({
        userId,
        date: today
      }).lean();

      if (!wearableData && !sleepData) {
        throw new Error('No data available for today');
      }

      // Calculate component scores
      const hrvScore = this.calculateHRVScore(wearableData);
      const rhrScore = this.calculateRHRScore(wearableData);
      const sleepScore = this.calculateSleepScore(sleepData);
      const loadScore = await this.calculateLoadScore(userId);

      // Weighted recovery score
      // 35% HRV, 25% Sleep, 20% RHR, 20% Training Load
      const totalScore = Math.round(
        hrvScore * 0.35 +
        sleepScore * 0.25 +
        rhrScore * 0.20 +
        loadScore * 0.20
      );

      // Determine recovery status
      let status, recommendation, trainingLoad;
      
      if (totalScore >= 85) {
        status = 'optimal';
        recommendation = 'Full recovery - excellent day for intense training';
        trainingLoad = 'high_intensity';
      } else if (totalScore >= 70) {
        status = 'good';
        recommendation = 'Good recovery - suitable for moderate to high intensity';
        trainingLoad = 'moderate_to_high';
      } else if (totalScore >= 55) {
        status = 'fair';
        recommendation = 'Fair recovery - keep intensity moderate';
        trainingLoad = 'moderate';
      } else if (totalScore >= 40) {
        status = 'low';
        recommendation = 'Low recovery - light training or active recovery recommended';
        trainingLoad = 'light';
      } else {
        status = 'very_low';
        recommendation = 'Very low recovery - rest day strongly recommended';
        trainingLoad = 'rest';
      }

      // Save recovery score
      await RecoveryScore.findOneAndUpdate(
        { userId, date: today },
        {
          userId,
          date: today,
          score: totalScore,
          totalScore,
          components: {
            hrv: Math.round(hrvScore),
            rhr: Math.round(rhrScore),
            sleep: Math.round(sleepScore),
            trainingLoad: Math.round(loadScore)
          },
          status,
          recommendation
        },
        { upsert: true, new: true }
      );

      return {
        score: totalScore,
        components: {
          hrv: Math.round(hrvScore),
          rhr: Math.round(rhrScore),
          sleep: Math.round(sleepScore),
          trainingLoad: Math.round(loadScore)
        },
        recommendation,
        trainingLoad,
        status
      };
    } catch (error) {
      console.error('Recovery calculation error:', error);
      throw error;
    }
  }

  /**
   * Calculate HRV component score
   */
  calculateHRVScore(wearableData) {
    if (!wearableData || !wearableData.hrv) return 50;

    const hrv = wearableData.hrv;
    
    // Baseline HRV scoring (adjust based on individual baseline)
    // Higher HRV = better recovery
    let score;
    if (hrv >= 80) score = 100;
    else if (hrv >= 60) score = 85;
    else if (hrv >= 40) score = 70;
    else if (hrv >= 25) score = 50;
    else if (hrv >= 15) score = 30;
    else score = 15;

    return score;
  }

  /**
   * Calculate RHR component score
   */
  calculateRHRScore(wearableData) {
    if (!wearableData || !wearableData.rhr) return 50;

    const rhr = wearableData.rhr;
    
    // Lower RHR = better recovery
    // Typical range: 40-100 bpm
    let score;
    if (rhr <= 50) score = 100;
    else if (rhr <= 55) score = 90;
    else if (rhr <= 60) score = 80;
    else if (rhr <= 65) score = 70;
    else if (rhr <= 70) score = 60;
    else if (rhr <= 75) score = 50;
    else if (rhr <= 80) score = 40;
    else score = 20;

    return score;
  }

  /**
   * Calculate sleep component score
   */
  calculateSleepScore(sleepData) {
    if (!sleepData) return 50;

    let score = 0;

    // Duration score (0-40 points)
    const duration = sleepData.duration || 0;
    if (duration >= 480) score += 40; // 8+ hours
    else if (duration >= 420) score += 35; // 7-8 hours
    else if (duration >= 360) score += 25; // 6-7 hours
    else if (duration >= 300) score += 15; // 5-6 hours
    else score += 5;

    // Efficiency score (0-30 points)
    const efficiency = sleepData.efficiency || 0;
    if (efficiency >= 90) score += 30;
    else if (efficiency >= 85) score += 25;
    else if (efficiency >= 80) score += 20;
    else if (efficiency >= 75) score += 15;
    else score += 5;

    // Deep sleep score (0-30 points)
    const deepSleep = sleepData.stages?.deep || 0;
    if (deepSleep >= 90) score += 30;
    else if (deepSleep >= 75) score += 25;
    else if (deepSleep >= 60) score += 20;
    else if (deepSleep >= 45) score += 15;
    else score += 5;

    return Math.min(100, score);
  }

  /**
   * Calculate training load component score
   */
  async calculateLoadScore(userId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

    // Get recent workouts
    const recentWorkouts = await Workout.find({
      userId,
      date: { $gte: sevenDaysAgo },
      status: 'completed'
    }).lean();

    const chronicWorkouts = await Workout.find({
      userId,
      date: { $gte: twentyEightDaysAgo },
      status: 'completed'
    }).lean();

    // Calculate acute load (last 7 days)
    const acuteLoad = this.calculateTotalLoad(recentWorkouts);
    
    // Calculate chronic load (last 28 days average)
    const chronicLoad = this.calculateTotalLoad(chronicWorkouts) / 4;

    // Acute:Chronic ratio
    const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : 1;

    // Optimal ratio is 0.8-1.3
    let score;
    if (ratio < 0.5) score = 70; // Under-trained
    else if (ratio <= 0.8) score = 85; // Fresh
    else if (ratio <= 1.0) score = 100; // Optimal
    else if (ratio <= 1.3) score = 85; // Good
    else if (ratio <= 1.5) score = 65; // Approaching overload
    else if (ratio <= 2.0) score = 45; // Overloaded
    else score = 25; // Severely overloaded

    return score;
  }

  /**
   * Calculate total training load
   */
  calculateTotalLoad(workouts) {
    return workouts.reduce((total, workout) => {
      const duration = workout.duration || 60;
      const intensity = workout.averageRPE || 7;
      const load = (duration * intensity) / 10; // Simplified load calculation
      return total + load;
    }, 0);
  }

  /**
   * Analyze recovery trend
   */
  async analyzeTrend(scores) {
    if (scores.length < 3) {
      return {
        trend: 'insufficient_data',
        direction: 'stable',
        message: 'Need more data points for trend analysis'
      };
    }

    const recentScores = scores.slice(-7).map(s => s.score || s.totalScore);
    const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    
    // Simple linear regression for trend
    const n = recentScores.length;
    const x = recentScores.map((_, i) => i);
    const y = recentScores;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    let trend, direction;
    if (slope > 1) {
      trend = 'improving';
      direction = 'up';
    } else if (slope < -1) {
      trend = 'declining';
      direction = 'down';
    } else {
      trend = 'stable';
      direction = 'stable';
    }

    return {
      trend,
      direction,
      average: Math.round(avg),
      slope: slope.toFixed(2),
      message: `Recovery is ${trend} with average score of ${Math.round(avg)}`
    };
  }

  /**
   * Force recalculate recovery for today
   */
  async forceRecalculate(userId) {
    // Delete today's score and recalculate
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    await RecoveryScore.deleteOne({ userId, date: today });
    
    return await this.calculateRecoveryScore(userId);
  }

  /**
   * Get recovery trends (last 7 days)
   */
  async getTrends(userId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const scores = await RecoveryScore.find({
      userId,
      date: { $gte: sevenDaysAgo }
    }).sort({ date: 1 }).lean();

    if (scores.length === 0) {
      return {
        rollingAverage: null,
        trend: 'no_data',
        alert: 'No recovery data available',
        recommendation: 'Start tracking recovery metrics'
      };
    }

    const values = scores.map(s => s.totalScore);
    const rollingAverage = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

    const trendAnalysis = await this.analyzeTrend(scores);

    let alert = null;
    let recommendation;

    if (rollingAverage < 50) {
      alert = 'Low recovery detected';
      recommendation = 'Consider taking additional rest days';
    } else if (trendAnalysis.trend === 'declining') {
      alert = 'Recovery declining';
      recommendation = 'Monitor training load and sleep quality';
    } else if (rollingAverage >= 80) {
      recommendation = 'Excellent recovery - maintain current routine';
    } else {
      recommendation = 'Continue current recovery practices';
    }

    return {
      rollingAverage,
      trend: trendAnalysis.trend,
      alert,
      recommendation,
      scores: values
    };
  }

  /**
   * Predict tomorrow's recovery
   */
  async predictRecovery(userId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const historicalScores = await RecoveryScore.find({
      userId,
      date: { $gte: thirtyDaysAgo }
    }).sort({ date: 1 }).lean();

    if (historicalScores.length < 7) {
      return {
        score: null,
        confidence: 0,
        factors: ['Insufficient historical data'],
        message: 'Need more recovery data for prediction'
      };
    }

    // Simple prediction based on recent trend
    const recentScores = historicalScores.slice(-7).map(s => s.totalScore);
    const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    
    // Calculate trend
    const trendAnalysis = await this.analyzeTrend(historicalScores);
    const slope = parseFloat(trendAnalysis.slope);
    
    // Predict tomorrow's score
    const predictedScore = Math.max(0, Math.min(100, Math.round(avg + slope)));

    // Confidence based on consistency
    const stdDev = this.calculateStdDev(recentScores);
    const consistency = Math.max(0, 100 - stdDev * 2);

    const factors = [];
    if (trendAnalysis.trend === 'improving') factors.push('Positive trend');
    if (trendAnalysis.trend === 'declining') factors.push('Negative trend');
    if (avg > 70) factors.push('Good baseline recovery');
    if (avg < 50) factors.push('Low baseline recovery');

    return {
      score: predictedScore,
      confidence: Math.round(consistency),
      factors,
      trend: trendAnalysis.trend
    };
  }

  /**
   * Generate recovery protocols
   */
  async generateProtocols(userId) {
    const latestScore = await RecoveryScore.findOne({ userId })
      .sort({ date: -1 })
      .lean();

    if (!latestScore) {
      return {
        recommendations: ['Start tracking recovery metrics'],
        effectiveness: null
      };
    }

    const score = latestScore.totalScore;
    const recommendations = [];

    if (score < 50) {
      recommendations.push({
        protocol: 'Extended Rest',
        duration: '2-3 days',
        activities: ['Complete rest', 'Light stretching', 'Meditation'],
        priority: 'high'
      });
      recommendations.push({
        protocol: 'Sleep Optimization',
        duration: 'Ongoing',
        activities: ['Aim for 9+ hours', 'No screens 2 hours before bed', 'Cool, dark room'],
        priority: 'high'
      });
      recommendations.push({
        protocol: 'Nutrition Focus',
        duration: 'Ongoing',
        activities: ['Increase protein intake', 'Anti-inflammatory foods', 'Proper hydration'],
        priority: 'medium'
      });
    } else if (score < 70) {
      recommendations.push({
        protocol: 'Active Recovery',
        duration: '1-2 days',
        activities: ['Light yoga', 'Walking', 'Foam rolling'],
        priority: 'medium'
      });
      recommendations.push({
        protocol: 'Sleep Maintenance',
        duration: 'Ongoing',
        activities: ['Aim for 8 hours', 'Consistent schedule'],
        priority: 'medium'
      });
    } else {
      recommendations.push({
        protocol: 'Maintenance',
        duration: 'Ongoing',
        activities: ['Continue current routine', 'Monitor for changes'],
        priority: 'low'
      });
    }

    return {
      recommendations,
      effectiveness: 'High - based on current recovery status'
    };
  }

  /**
   * Calculate recovery debt
   */
  async calculateDebt(userId) {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    
    const scores = await RecoveryScore.find({
      userId,
      date: { $gte: fourteenDaysAgo }
    }).sort({ date: 1 }).lean();

    if (scores.length === 0) {
      return {
        score: 0,
        daysToRecover: 0,
        recommendations: ['Start tracking recovery']
      };
    }

    // Calculate deficit from optimal (80)
    const optimalScore = 80;
    const deficits = scores.map(s => Math.max(0, optimalScore - s.totalScore));
    const totalDebt = deficits.reduce((a, b) => a + b, 0);
    const avgDebt = totalDebt / scores.length;

    // Estimate days to recover (simplified)
    const daysToRecover = Math.ceil(avgDebt / 5);

    const recommendations = [];
    if (avgDebt > 20) {
      recommendations.push('Significant recovery debt detected');
      recommendations.push('Reduce training volume by 30-50%');
      recommendations.push('Prioritize sleep and nutrition');
      recommendations.push(`Estimated ${daysToRecover} days to full recovery`);
    } else if (avgDebt > 10) {
      recommendations.push('Moderate recovery debt');
      recommendations.push('Add 1-2 rest days this week');
      recommendations.push('Focus on recovery protocols');
    } else {
      recommendations.push('Recovery debt is minimal');
      recommendations.push('Continue current approach');
    }

    return {
      score: Math.round(avgDebt),
      daysToRecover,
      recommendations
    };
  }

  /**
   * Assess overtraining risk
   */
  async assessOvertrainingRisk(userId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const scores = await RecoveryScore.find({
      userId,
      date: { $gte: thirtyDaysAgo }
    }).sort({ date: 1 }).lean();

    if (scores.length < 14) {
      return {
        level: 'unknown',
        indicators: ['Insufficient data'],
        recommendations: ['Track recovery for at least 2 weeks']
      };
    }

    const indicators = [];
    let riskLevel = 'low';

    // Check 1: Sustained low recovery
    const recentScores = scores.slice(-14).map(s => s.totalScore);
    const avgRecent = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    
    if (avgRecent < 50) {
      indicators.push('Chronically low recovery scores');
      riskLevel = 'high';
    } else if (avgRecent < 60) {
      indicators.push('Below-average recovery');
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    // Check 2: Declining trend
    const trendAnalysis = await this.analyzeTrend(scores);
    if (trendAnalysis.trend === 'declining') {
      indicators.push('Declining recovery trend');
      if (riskLevel === 'low') riskLevel = 'medium';
      else if (riskLevel === 'medium') riskLevel = 'high';
    }

    // Check 3: High training load
    const loadScore = await this.calculateLoadScore(userId);
    if (loadScore < 50) {
      indicators.push('Excessive training load');
      if (riskLevel === 'low') riskLevel = 'medium';
      else if (riskLevel === 'medium') riskLevel = 'high';
    }

    // Check 4: Poor sleep consistency
    const sleepData = await SleepData.find({
      userId,
      date: { $gte: thirtyDaysAgo }
    }).lean();

    if (sleepData.length > 0) {
      const sleepDurations = sleepData.map(s => s.duration);
      const avgSleep = sleepDurations.reduce((a, b) => a + b, 0) / sleepDurations.length;
      
      if (avgSleep < 360) { // Less than 6 hours
        indicators.push('Insufficient sleep duration');
        if (riskLevel === 'low') riskLevel = 'medium';
      }
    }

    const recommendations = [];
    if (riskLevel === 'high') {
      recommendations.push('HIGH RISK: Immediate action required');
      recommendations.push('Take 5-7 days of complete rest');
      recommendations.push('Consult with coach or healthcare provider');
      recommendations.push('Focus on sleep, nutrition, and stress management');
    } else if (riskLevel === 'medium') {
      recommendations.push('MEDIUM RISK: Adjust training');
      recommendations.push('Reduce training volume by 30%');
      recommendations.push('Add 1-2 extra rest days per week');
      recommendations.push('Monitor recovery closely');
    } else {
      recommendations.push('LOW RISK: Continue monitoring');
      recommendations.push('Maintain current training and recovery balance');
    }

    return {
      level: riskLevel,
      indicators: indicators.length > 0 ? indicators : ['No significant indicators'],
      recommendations
    };
  }

  /**
   * Calculate training load (acute and chronic)
   */
  async calculateTrainingLoad(userId, days) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

    const recentWorkouts = await Workout.find({
      userId,
      date: { $gte: startDate },
      status: 'completed'
    }).lean();

    const chronicWorkouts = await Workout.find({
      userId,
      date: { $gte: twentyEightDaysAgo },
      status: 'completed'
    }).lean();

    const acuteLoad = this.calculateTotalLoad(recentWorkouts);
    const chronicLoad = this.calculateTotalLoad(chronicWorkouts) / 4;

    const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : 1;

    let status;
    if (ratio < 0.8) status = 'fresh';
    else if (ratio <= 1.3) status = 'optimal';
    else if (ratio <= 1.5) status = 'high';
    else status = 'overload';

    return {
      acute: Math.round(acuteLoad),
      chronic: Math.round(chronicLoad),
      ratio: ratio.toFixed(2),
      status
    };
  }

  /**
   * Generate recovery insights
   */
  async generateInsights(userId) {
    const latestScore = await RecoveryScore.findOne({ userId })
      .sort({ date: -1 })
      .lean();

    const trends = await this.getTrends(userId);
    const overtrainingRisk = await this.assessOvertrainingRisk(userId);

    const insights = [];
    const recommendations = [];

    if (latestScore) {
      insights.push({
        type: 'current_status',
        message: `Current recovery score: ${latestScore.totalScore}/100`,
        status: latestScore.status
      });
    }

    if (trends.trend === 'improving') {
      insights.push({
        type: 'trend',
        message: 'Recovery is improving',
        positive: true
      });
    } else if (trends.trend === 'declining') {
      insights.push({
        type: 'trend',
        message: 'Recovery is declining - attention needed',
        positive: false
      });
      recommendations.push('Address declining recovery trend');
    }

    if (overtrainingRisk.level === 'high') {
      insights.push({
        type: 'risk',
        message: 'High overtraining risk detected',
        severity: 'high'
      });
      recommendations.push(...overtrainingRisk.recommendations);
    }

    return {
      insights,
      recommendations: recommendations.length > 0 ? recommendations : ['Recovery management looks good']
    };
  }

  /**
   * Get recovery dashboard data
   */
  async getDashboard(userId) {
    const currentScore = await this.calculateRecoveryScore(userId).catch(() => null);
    const trends = await this.getTrends(userId);
    const trainingLoad = await this.calculateTrainingLoad(userId, 7);
    const protocols = await this.generateProtocols(userId);
    const insights = await this.generateInsights(userId);

    return {
      currentScore: currentScore?.score || null,
      trends,
      trainingLoad,
      recommendations: protocols.recommendations,
      insights: insights.insights
    };
  }

  // Helper methods

  calculateStdDev(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

module.exports = new RecoveryCalculator();
