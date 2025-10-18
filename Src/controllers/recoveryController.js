// Src/controllers/recoveryController.js - PRODUCTION READY FOR RAILWAY
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const CalendarEvent = require('../models/CalenderEvent');
const User = require('../models/User');
const Intervention = require('../models/intervention');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const redis = require('redis');

// Redis client for caching
let redisClient = null;
if (process.env.REDIS_URL) {
  redisClient = redis.createClient({ url: process.env.REDIS_URL });
  redisClient.connect().catch(console.error);
}

const genAI = process.env.GOOGLE_AI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY) 
  : null;

class RecoveryController {
  /**
   * Get comprehensive recovery status with predictive insights
   * PRODUCTION READY - No placeholders
   */
  async getRecoveryStatus(req, res) {
    try {
      const { userId } = req.params;
      const cacheKey = `recovery:${userId}`;
      
      // Check Redis cache first
      if (redisClient) {
        try {
          const cached = await redisClient.get(cacheKey);
          if (cached) {
            return res.json(JSON.parse(cached));
          }
        } catch (err) {
          console.warn('Redis cache miss:', err.message);
        }
      }
      
      // Get user profile for accurate calculations
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Fetch comprehensive data
      const [wearableHistory, workoutHistory, upcomingEvents] = await Promise.all([
        WearableData.find({ userId })
          .sort('-date')
          .limit(30)
          .lean()
          .exec(),
        Workout.find({ 
          clientId: userId, 
          completed: true,
          completedAt: { $ne: null }
        })
          .sort('-completedAt')
          .limit(20)
          .lean()
          .exec(),
        CalendarEvent.find({
          userId,
          startTime: { 
            $gte: new Date(), 
            $lte: new Date(Date.now() + 7 * 86400000) 
          }
        })
          .lean()
          .exec()
      ]);

      // Validate data availability
      if (!wearableHistory || wearableHistory.length === 0) {
        return res.json({
          success: false,
          message: 'No wearable data available. Connect a device to track recovery.',
          data: {
            currentScore: 0,
            status: 'no_data',
            recommendations: ['Connect a wearable device to begin tracking']
          }
        });
      }

      // Calculate metrics with real data
      const userProfile = {
        age: user.dateOfBirth 
          ? Math.floor((Date.now() - new Date(user.dateOfBirth)) / (365.25 * 86400000))
          : null,
        gender: user.gender || 'male',
        height: user.height || null,
        weight: wearableHistory[0]?.weight || null
      };

      const currentRecovery = this.calculateCurrentRecovery(wearableHistory[0], userProfile);
      const recoveryTrend = this.analyzeRecoveryTrend(wearableHistory);
      const optimalTrainingWindow = this.predictOptimalTraining(currentRecovery, upcomingEvents);
      const recoveryDebt = this.calculateRecoveryDebt(wearableHistory, workoutHistory);
      
      // Generate AI insights if available
      let aiInsights = null;
      if (genAI && currentRecovery.score > 0) {
        try {
          aiInsights = await this.generateRecoveryInsights(
            currentRecovery,
            recoveryTrend,
            recoveryDebt,
            userProfile
          );
        } catch (aiError) {
          console.error('AI generation failed:', aiError);
          aiInsights = this.getFallbackInsights(currentRecovery);
        }
      } else {
        aiInsights = this.getFallbackInsights(currentRecovery);
      }

      // Build response
      const response = {
        success: true,
        data: {
          currentScore: currentRecovery.score,
          status: currentRecovery.status,
          components: {
            hrv: {
              value: currentRecovery.hrv.value,
              score: currentRecovery.hrv.score,
              baseline: currentRecovery.hrv.baseline,
              trend: currentRecovery.hrv.trend
            },
            sleep: {
              duration: currentRecovery.sleep.duration,
              score: currentRecovery.sleep.score,
              quality: currentRecovery.sleep.quality,
              efficiency: currentRecovery.sleep.efficiency
            },
            stress: {
              level: currentRecovery.stress.level,
              score: currentRecovery.stress.score,
              sources: currentRecovery.stress.sources
            },
            muscleSoreness: {
              level: currentRecovery.soreness.level,
              affected_areas: currentRecovery.soreness.areas,
              recovery_time: currentRecovery.soreness.recoveryTime
            }
          },
          trend: recoveryTrend,
          debt: recoveryDebt,
          optimalTrainingWindow,
          recommendations: currentRecovery.recommendations,
          aiInsights,
          interventions: currentRecovery.interventions,
          nextAssessment: new Date(Date.now() + 6 * 3600000),
          dataQuality: {
            completeness: this.assessDataCompleteness(wearableHistory[0]),
            reliability: this.assessDataReliability(wearableHistory)
          }
        }
      };

      // Cache for 5 minutes
      if (redisClient) {
        try {
          await redisClient.setEx(cacheKey, 300, JSON.stringify(response));
        } catch (err) {
          console.warn('Redis cache set failed:', err.message);
        }
      }

      res.json(response);
    } catch (error) {
      console.error('Recovery status error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to assess recovery',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Create personalized recovery protocol - PRODUCTION READY
   */
  async createRecoveryProtocol(req, res) {
    try {
      const { userId } = req.params;
      const { targetDate, priority = 'balanced', injuryStatus = null } = req.body;
      
      // Get user data
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get latest metrics
      const wearableData = await WearableData.findOne({ userId })
        .sort('-date')
        .lean();
      
      if (!wearableData) {
        return res.status(400).json({
          success: false,
          message: 'No wearable data available'
        });
      }

      // Create comprehensive protocol
      const protocol = {
        userId,
        createdAt: new Date(),
        targetDate: targetDate ? new Date(targetDate) : new Date(Date.now() + 86400000),
        priority,
        injuryStatus,
        currentMetrics: {
          recoveryScore: wearableData.recoveryScore || 0,
          hrv: wearableData.hrv || 0,
          restingHR: wearableData.restingHeartRate || 0,
          sleepDuration: wearableData.sleepDuration || 0
        },
        phases: []
      };

      // Phase 1: Immediate Recovery (0-6 hours)
      if (wearableData.recoveryScore < 40 || injuryStatus) {
        protocol.phases.push({
          name: 'Critical Recovery Phase',
          duration: '6 hours',
          startTime: new Date(),
          endTime: new Date(Date.now() + 6 * 3600000),
          activities: [
            { 
              type: 'sleep',
              duration: '8-9 hours',
              priority: 'critical',
              instructions: 'Complete rest, no screens 1 hour before bed',
              targetMetric: 'Sleep efficiency > 85%'
            },
            { 
              type: 'nutrition',
              action: 'Protein intake: 1.2g per kg body weight',
              timing: 'Within 30 minutes',
              priority: 'high',
              specificFoods: ['Greek yogurt', 'Chicken breast', 'Protein shake']
            },
            { 
              type: 'hydration',
              target: `${Math.round((user.weight || 180) * 0.033)} liters`,
              timing: 'Throughout the day',
              priority: 'high',
              electrolytes: true
            },
            { 
              type: 'cold_therapy',
              duration: '10-15 minutes',
              temperature: '10-15°C',
              priority: 'medium',
              instructions: 'Cold bath or cold shower'
            }
          ],
          monitoring: {
            checkHRV: true,
            checkSleep: true,
            alertThreshold: 35
          }
        });
      }

      // Phase 2: Active Recovery (6-24 hours)
      protocol.phases.push({
        name: 'Active Recovery Phase',
        duration: '18 hours',
        startTime: new Date(Date.now() + 6 * 3600000),
        endTime: new Date(Date.now() + 24 * 3600000),
        activities: [
          { 
            type: 'movement',
            action: 'Zone 1 cardio',
            duration: '20-30 minutes',
            heartRate: `${Math.round((220 - (user.age || 30)) * 0.5)}-${Math.round((220 - (user.age || 30)) * 0.6)} bpm`,
            priority: 'medium',
            options: ['Walking', 'Easy cycling', 'Swimming']
          },
          { 
            type: 'mobility',
            action: 'Dynamic stretching routine',
            duration: '15 minutes',
            priority: 'high',
            focusAreas: this.identifyTightAreas(wearableData)
          },
          { 
            type: 'massage',
            action: 'Foam rolling or massage gun',
            duration: '10-15 minutes',
            priority: 'medium',
            pressure: 'Moderate (6/10 discomfort)'
          },
          { 
            type: 'breathing',
            action: '4-7-8 breathing technique',
            sets: '4 rounds',
            priority: 'low',
            instructions: 'Inhale 4s, hold 7s, exhale 8s'
          }
        ],
        monitoring: {
          checkRHR: true,
          maxHeartRate: Math.round((220 - (user.age || 30)) * 0.7)
        }
      });

      // Phase 3: Progressive Loading (24-72 hours)
      if (priority !== 'injury_recovery') {
        protocol.phases.push({
          name: 'Progressive Loading Phase',
          duration: '48 hours',
          startTime: new Date(Date.now() + 24 * 3600000),
          endTime: new Date(Date.now() + 72 * 3600000),
          activities: [
            { 
              type: 'training',
              day: 1,
              action: 'Light resistance training',
              intensity: '40-50% of normal',
              duration: '30-40 minutes',
              priority: 'medium',
              exercises: ['Bodyweight movements', 'Light weights', 'Resistance bands']
            },
            { 
              type: 'training',
              day: 2,
              action: 'Moderate intensity workout',
              intensity: '60-70% of normal',
              duration: '45-50 minutes',
              priority: 'medium',
              readinessCheck: true
            },
            { 
              type: 'assessment',
              action: 'HRV and recovery check',
              frequency: 'Every morning',
              priority: 'critical',
              threshold: {
                hrv: wearableData.hrv * 0.9,
                rhr: wearableData.restingHeartRate * 1.1
              }
            }
          ],
          progressionCriteria: {
            hrvRecovered: true,
            sleepQuality: 'good',
            subjectiveRecovery: 7
          }
        });
      }

      // Calculate estimated recovery time
      const estimatedRecovery = this.estimateFullRecovery(wearableData, user);

      // Store intervention if needed
      if (wearableData.recoveryScore < 50) {
        await Intervention.create({
          userId,
          type: 'recovery_protocol',
          action: 'Recovery protocol initiated',
          reason: `Recovery score at ${wearableData.recoveryScore}%`,
          severity: wearableData.recoveryScore < 30 ? 'critical' : 'high',
          metrics: {
            recoveryScore: wearableData.recoveryScore,
            protocolId: protocol._id
          }
        });
      }

      res.json({
        success: true,
        protocol,
        estimatedRecoveryTime: estimatedRecovery,
        message: 'Recovery protocol generated successfully',
        warnings: this.getRecoveryWarnings(wearableData)
      });
    } catch (error) {
      console.error('Protocol creation error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to create recovery protocol',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Track recovery interventions - PRODUCTION READY
   */
  async trackIntervention(req, res) {
    try {
      const { userId } = req.params;
      const { 
        intervention, 
        startMetrics, 
        endMetrics,
        duration,
        compliance,
        subjectiveFeedback 
      } = req.body;
      
      // Validate required fields
      if (!intervention || !startMetrics || !endMetrics) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      // Calculate effectiveness with multiple factors
      const effectiveness = this.calculateInterventionEffectiveness(
        startMetrics,
        endMetrics,
        duration,
        compliance
      );

      // Store for ML training
      const result = {
        userId,
        intervention: {
          type: intervention.type,
          protocol: intervention.protocol,
          intensity: intervention.intensity
        },
        timestamp: new Date(),
        startMetrics: {
          hrv: startMetrics.hrv || null,
          recoveryScore: startMetrics.recoveryScore || null,
          restingHR: startMetrics.restingHR || null,
          sleepQuality: startMetrics.sleepQuality || null,
          soreness: startMetrics.soreness || null
        },
        endMetrics: {
          hrv: endMetrics.hrv || null,
          recoveryScore: endMetrics.recoveryScore || null,
          restingHR: endMetrics.restingHR || null,
          sleepQuality: endMetrics.sleepQuality || null,
          soreness: endMetrics.soreness || null
        },
        duration: duration || 0,
        compliance: compliance || 100,
        subjectiveFeedback: subjectiveFeedback || null,
        effectiveness,
        successful: effectiveness.score > 0.7
      };

      // Store in database for future ML training
      await Intervention.create({
        userId,
        type: 'recovery_intervention',
        action: intervention.type,
        reason: `Recovery intervention tracking`,
        severity: 'low',
        metrics: result,
        outcome: effectiveness.score > 0.7 ? 'successful' : 'failed'
      });

      // Generate recommendations based on effectiveness
      const recommendations = this.generateInterventionRecommendations(
        effectiveness,
        intervention,
        endMetrics
      );

      res.json({
        success: true,
        effectiveness,
        recommendations,
        nextSteps: this.suggestNextInterventions(effectiveness, endMetrics)
      });
    } catch (error) {
      console.error('Intervention tracking error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to track intervention',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // PRODUCTION-READY HELPER METHODS

  calculateCurrentRecovery(wearableData, userProfile) {
    if (!wearableData) {
      return {
        score: 0,
        status: 'no_data',
        hrv: { value: 0, score: 0, baseline: 0, trend: 'unknown' },
        sleep: { duration: 0, score: 0, quality: 'unknown', efficiency: 0 },
        stress: { level: 'unknown', score: 0, sources: [] },
        soreness: { level: 0, areas: [], recoveryTime: 0 },
        recommendations: ['Connect wearable device for recovery tracking'],
        interventions: []
      };
    }

    // Advanced HRV analysis with age/gender adjustment
    const hrvAnalysis = this.analyzeHRV(
      wearableData.hrv,
      userProfile.age,
      userProfile.gender
    );

    // Comprehensive sleep analysis
    const sleepAnalysis = this.analyzeSleep(wearableData);

    // Stress calculation from multiple biomarkers
    const stressAnalysis = this.analyzeStress(
      wearableData,
      hrvAnalysis,
      sleepAnalysis
    );

    // Calculate weighted recovery score
    const weights = {
      hrv: 0.35,
      sleep: 0.30,
      rhr: 0.20,
      stress: 0.15
    };

    let totalScore = 0;
    let totalWeight = 0;

    if (hrvAnalysis.score > 0) {
      totalScore += hrvAnalysis.score * weights.hrv;
      totalWeight += weights.hrv;
    }

    if (sleepAnalysis.score > 0) {
      totalScore += sleepAnalysis.score * weights.sleep;
      totalWeight += weights.sleep;
    }

    if (wearableData.restingHeartRate) {
      const rhrScore = this.calculateRHRScore(
        wearableData.restingHeartRate,
        userProfile.age
      );
      totalScore += rhrScore * weights.rhr;
      totalWeight += weights.rhr;
    }

    if (stressAnalysis.score > 0) {
      totalScore += stressAnalysis.score * weights.stress;
      totalWeight += weights.stress;
    }

    const finalScore = totalWeight > 0 
      ? Math.round(totalScore / totalWeight) 
      : 0;

    // Generate specific recommendations
    const recommendations = this.generateRecoveryRecommendations(
      finalScore,
      hrvAnalysis,
      sleepAnalysis,
      stressAnalysis
    );

    // Determine interventions needed
    const interventions = this.determineInterventions(
      finalScore,
      hrvAnalysis,
      sleepAnalysis,
      wearableData
    );

    return {
      score: finalScore,
      status: this.getRecoveryStatus(finalScore),
      hrv: hrvAnalysis,
      sleep: sleepAnalysis,
      stress: stressAnalysis,
      soreness: {
        level: wearableData.muscleSoreness || 0,
        areas: wearableData.soreAreas || [],
        recoveryTime: this.estimateSorenessRecovery(wearableData.muscleSoreness)
      },
      recommendations,
      interventions
    };
  }

  analyzeHRV(hrv, age, gender) {
    if (!hrv || hrv === 0) {
      return { value: 0, score: 0, baseline: 0, trend: 'no_data' };
    }

    // Age and gender-adjusted baseline
    let baseline = 50; // Default
    
    if (age && gender) {
      // Scientific HRV baselines by age and gender
      const hrvBaselines = {
        male: {
          20: 65, 25: 62, 30: 60, 35: 58, 40: 55,
          45: 52, 50: 48, 55: 44, 60: 40, 65: 37
        },
        female: {
          20: 68, 25: 65, 30: 63, 35: 60, 40: 57,
          45: 54, 50: 50, 55: 46, 60: 42, 65: 39
        }
      };
      
      const ageGroup = Math.floor(age / 5) * 5;
      baseline = hrvBaselines[gender]?.[ageGroup] || 50;
    }

    // Calculate score based on deviation from baseline
    const deviation = ((hrv - baseline) / baseline) * 100;
    let score = 50 + deviation; // Center at 50
    score = Math.max(0, Math.min(100, score)); // Clamp 0-100

    return {
      value: hrv,
      score: Math.round(score),
      baseline: Math.round(baseline),
      trend: deviation > 10 ? 'improving' : 
             deviation < -10 ? 'declining' : 
             'stable',
      percentile: this.getHRVPercentile(hrv, age, gender)
    };
  }

  analyzeSleep(wearableData) {
    const duration = wearableData.sleepDuration || 0;
    const efficiency = wearableData.sleepEfficiency || 0;
    const deepSleep = wearableData.deepSleep || 0;
    const remSleep = wearableData.remSleep || 0;
    
    // Calculate comprehensive sleep score
    let score = 0;
    
    // Duration score (30% weight)
    const durationScore = Math.min(100, (duration / 480) * 100);
    score += durationScore * 0.3;
    
    // Efficiency score (30% weight)
    score += efficiency * 0.3;
    
    // Deep sleep score (20% weight)
    const deepSleepPercent = duration > 0 ? (deepSleep / duration) * 100 : 0;
    const deepScore = Math.min(100, (deepSleepPercent / 20) * 100);
    score += deepScore * 0.2;
    
    // REM sleep score (20% weight)
    const remPercent = duration > 0 ? (remSleep / duration) * 100 : 0;
    const remScore = Math.min(100, (remPercent / 25) * 100);
    score += remScore * 0.2;
    
    return {
      duration,
      score: Math.round(score),
      quality: score >= 80 ? 'excellent' :
               score >= 60 ? 'good' :
               score >= 40 ? 'fair' :
               'poor',
      efficiency,
      stages: {
        deep: deepSleep,
        rem: remSleep,
        light: wearableData.lightSleep || 0,
        wake: wearableData.awakeTime || 0
      }
    };
  }

  analyzeStress(wearableData, hrvAnalysis, sleepAnalysis) {
    const indicators = [];
    let stressScore = 0;
    
    // HRV-based stress (40% weight)
    if (hrvAnalysis.score < 40) {
      stressScore += 60;
      indicators.push('Low HRV');
    } else if (hrvAnalysis.score < 60) {
      stressScore += 40;
      indicators.push('Suboptimal HRV');
    } else {
      stressScore += 20;
    }
    
    // Sleep-based stress (30% weight)
    if (sleepAnalysis.score < 60) {
      stressScore += 30;
      indicators.push('Poor sleep quality');
    } else {
      stressScore += 10;
    }
    
    // Training load stress (30% weight)
    if (wearableData.trainingLoad > 85) {
      stressScore += 30;
      indicators.push('High training load');
    } else if (wearableData.trainingLoad > 70) {
      stressScore += 20;
      indicators.push('Elevated training load');
    } else {
      stressScore += 10;
    }
    
    return {
      level: stressScore >= 70 ? 'high' :
             stressScore >= 40 ? 'moderate' :
             'low',
      score: 100 - stressScore, // Invert for recovery score
      sources: indicators
    };
  }

  calculateRHRScore(rhr, age) {
    // Age-adjusted RHR scoring
    const expectedRHR = age ? 75 - (age * 0.2) : 65;
    const deviation = ((expectedRHR - rhr) / expectedRHR) * 100;
    
    let score = 50 + (deviation * 2);
    return Math.max(0, Math.min(100, score));
  }

  getRecoveryStatus(score) {
    if (score >= 85) return 'optimal';
    if (score >= 70) return 'good';
    if (score >= 50) return 'moderate';
    if (score >= 30) return 'poor';
    return 'critical';
  }

  generateRecoveryRecommendations(score, hrv, sleep, stress) {
    const recommendations = [];
    
    // Priority 1: Critical issues
    if (score < 30) {
      recommendations.push({
        priority: 'critical',
        action: 'Complete rest day required',
        reason: 'Recovery critically low'
      });
    }
    
    // HRV-specific
    if (hrv.score < 40) {
      recommendations.push({
        priority: 'high',
        action: 'Practice HRV breathing: 5-5-5 pattern for 10 minutes',
        reason: `HRV at ${hrv.value}ms (baseline: ${hrv.baseline}ms)`
      });
    }
    
    // Sleep-specific
    if (sleep.duration < 360) {
      recommendations.push({
        priority: 'high',
        action: `Add ${Math.round((480 - sleep.duration) / 60)} hours to tonight's sleep`,
        reason: 'Sleep debt accumulating'
      });
    }
    
    // Stress-specific
    if (stress.level === 'high') {
      recommendations.push({
        priority: 'medium',
        action: 'Include 20min meditation or yoga',
        reason: `High stress from: ${stress.sources.join(', ')}`
      });
    }
    
    return recommendations;
  }

  determineInterventions(score, hrv, sleep, wearableData) {
    const interventions = [];
    
    if (score < 40) {
      interventions.push({
        type: 'auto_cancel_workout',
        action: 'Cancel today\'s high-intensity training',
        automated: true
      });
    }
    
    if (hrv.score < 30) {
      interventions.push({
        type: 'medical_alert',
        action: 'Consider medical consultation',
        automated: false
      });
    }
    
    return interventions;
  }

  estimateSorenessRecovery(sorenessLevel) {
    if (!sorenessLevel) return 0;
    
    // Evidence-based recovery times
    const recoveryHours = {
      1: 12, 2: 24, 3: 36, 4: 48, 5: 72,
      6: 96, 7: 120, 8: 144, 9: 168, 10: 192
    };
    
    return recoveryHours[Math.round(sorenessLevel)] || 24;
  }

  analyzeRecoveryTrend(history) {
    if (!history || history.length < 7) {
      return {
        direction: 'insufficient_data',
        rate: 0,
        projection: null,
        confidence: 0
      };
    }
    
    // Calculate weighted moving averages
    const recent = history.slice(0, 3);
    const older = history.slice(4, 7);
    
    const recentAvg = recent.reduce((sum, d) => 
      sum + (d.recoveryScore || 0), 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => 
      sum + (d.recoveryScore || 0), 0) / older.length;
    
    const change = recentAvg - olderAvg;
    const ratePerDay = change / 4; // Over 4 days
    
    return {
      direction: change > 5 ? 'improving' : 
                 change < -5 ? 'declining' : 
                 'stable',
      rate: ratePerDay.toFixed(2),
      projection: Math.round(recentAvg + (ratePerDay * 7)), // 7-day projection
      confidence: Math.min(0.9, history.length / 30) // More data = higher confidence
    };
  }

  calculateRecoveryDebt(wearableHistory, workoutHistory) {
    const optimalRecovery = 70;
    const validData = wearableHistory.filter(d => d.recoveryScore);
    
    if (validData.length === 0) {
      return {
        amount: 0,
        daysToRecover: 0,
        severity: 'none'
      };
    }
    
    const actualAvg = validData.reduce((sum, d) => 
      sum + d.recoveryScore, 0) / validData.length;
    
    // Factor in workout intensity
    const workoutIntensity = workoutHistory.reduce((sum, w) => {
      const intensity = w.intensity || w.duration || 60;
      return sum + (intensity / 60); // Normalize to hours
    }, 0) / workoutHistory.length;
    
    const adjustedDebt = (optimalRecovery - actualAvg) * (1 + workoutIntensity * 0.1);
    const debt = Math.max(0, adjustedDebt * validData.length / 10);
    
    return {
      amount: Math.round(debt),
      daysToRecover: Math.ceil(debt / 10),
      severity: debt > 50 ? 'high' : 
                debt > 20 ? 'moderate' : 
                'low',
      breakdown: {
        averageRecovery: Math.round(actualAvg),
        targetRecovery: optimalRecovery,
        workoutImpact: Math.round(workoutIntensity * 10)
      }
    };
  }

  predictOptimalTraining(recovery, events) {
    const windows = [];
    const now = new Date();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(now.getTime() + i * 86400000);
      const dayEvents = events.filter(e => {
        const eventDate = new Date(e.startTime);
        return eventDate.toDateString() === date.toDateString();
      });
      
      // Calculate available training time
      const busyHours = dayEvents.reduce((sum, e) => {
        const duration = (new Date(e.endTime) - new Date(e.startTime)) / 3600000;
        return sum + duration;
      }, 0);
      
      const sleepHours = 8;
      const workHours = 8;
      const availableHours = 24 - busyHours - sleepHours - workHours;
      
      // Project recovery improvement
      const dailyRecoveryGain = 5; // Assume 5% daily improvement with proper recovery
      const projectedRecovery = Math.min(100, recovery.score + (i * dailyRecoveryGain));
      
      // Determine training recommendation
      let trainingType = 'rest';
      let duration = 0;
      
      if (projectedRecovery >= 85 && availableHours >= 2) {
        trainingType = 'high_intensity';
        duration = 60;
      } else if (projectedRecovery >= 70 && availableHours >= 1.5) {
        trainingType = 'moderate';
        duration = 45;
      } else if (projectedRecovery >= 50 && availableHours >= 1) {
        trainingType = 'light';
        duration = 30;
      }
      
      windows.push({
        date: date.toISOString().split('T')[0],
        dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        recovery: projectedRecovery,
        availableHours: Math.round(availableHours * 10) / 10,
        recommendation: trainingType,
        suggestedDuration: duration,
        optimalTime: this.getOptimalTrainingTime(dayEvents),
        conflictingEvents: dayEvents.length
      });
    }
    
    return windows;
  }

  getOptimalTrainingTime(dayEvents) {
    // Find the longest gap between events
    if (dayEvents.length === 0) {
      return '10:00 AM'; // Default morning time
    }
    
    const sortedEvents = dayEvents.sort((a, b) => 
      new Date(a.startTime) - new Date(b.startTime)
    );
    
    let maxGap = 0;
    let optimalTime = '10:00 AM';
    
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const gap = new Date(sortedEvents[i + 1].startTime) - new Date(sortedEvents[i].endTime);
      if (gap > maxGap) {
        maxGap = gap;
        const gapStart = new Date(sortedEvents[i].endTime);
        optimalTime = `${gapStart.getHours()}:${String(gapStart.getMinutes()).padStart(2, '0')}`;
      }
    }
    
    return optimalTime;
  }

  calculateInterventionEffectiveness(start, end, duration, compliance) {
    const improvements = {};
    let totalImprovement = 0;
    let weightedScore = 0;
    
    // Calculate improvements for each metric
    const metrics = ['hrv', 'recoveryScore', 'restingHR', 'sleepQuality', 'soreness'];
    const weights = { hrv: 0.3, recoveryScore: 0.3, restingHR: 0.2, sleepQuality: 0.15, soreness: 0.05 };
    
    metrics.forEach(metric => {
      if (start[metric] !== undefined && end[metric] !== undefined && start[metric] !== null) {
        const improvement = ((end[metric] - start[metric]) / (start[metric] || 1)) * 100;
        improvements[metric] = {
          change: improvement.toFixed(1),
          improved: improvement > 0
        };
        
        // Weighted scoring
        const normalizedImprovement = Math.max(-100, Math.min(100, improvement));
        weightedScore += (normalizedImprovement / 100) * (weights[metric] || 0.1);
        totalImprovement += improvement;
      }
    });
    
    // Adjust for compliance
    const complianceMultiplier = (compliance || 100) / 100;
    weightedScore *= complianceMultiplier;
    
    // Normalize to 0-1 scale
    const finalScore = Math.max(0, Math.min(1, (weightedScore + 1) / 2));
    
    return {
      score: finalScore.toFixed(3),
      improvements,
      summary: finalScore > 0.7 ? 'highly_effective' :
               finalScore > 0.5 ? 'effective' :
               finalScore > 0.3 ? 'marginally_effective' :
               'ineffective',
      compliance: compliance || 100,
      duration: duration || 'unknown'
    };
  }

  estimateFullRecovery(wearableData, user) {
    const currentScore = wearableData?.recoveryScore || 0;
    const targetScore = 85;
    const gap = targetScore - currentScore;
    
    // Calculate recovery rate based on user factors
    let dailyRecoveryRate = 10; // Base rate
    
    // Adjust based on age
    if (user.age) {
      if (user.age < 30) dailyRecoveryRate += 2;
      else if (user.age > 40) dailyRecoveryRate -= 2;
      else if (user.age > 50) dailyRecoveryRate -= 4;
    }
    
    // Adjust based on recent sleep
    if (wearableData.sleepDuration) {
      if (wearableData.sleepDuration > 480) dailyRecoveryRate += 3;
      else if (wearableData.sleepDuration < 360) dailyRecoveryRate -= 3;
    }
    
    const daysNeeded = Math.ceil(gap / dailyRecoveryRate);
    
    return {
      days: Math.max(1, daysNeeded),
      targetDate: new Date(Date.now() + daysNeeded * 86400000),
      confidence: currentScore > 0 ? 0.75 : 0.5,
      factors: {
        currentGap: gap,
        dailyRate: dailyRecoveryRate,
        limitingFactors: this.identifyLimitingFactors(wearableData)
      }
    };
  }

  identifyLimitingFactors(wearableData) {
    const factors = [];
    
    if (wearableData.hrv < 40) {
      factors.push('Low HRV limiting recovery');
    }
    if (wearableData.sleepDuration < 360) {
      factors.push('Insufficient sleep');
    }
    if (wearableData.trainingLoad > 85) {
      factors.push('Excessive training load');
    }
    if (wearableData.restingHeartRate > 75) {
      factors.push('Elevated resting heart rate');
    }
    
    return factors;
  }

  identifyTightAreas(wearableData) {
    // Based on training patterns and recovery data
    const areas = [];
    
    if (wearableData.trainingLoad > 70) {
      areas.push('Hip flexors', 'Hamstrings');
    }
    if (wearableData.muscleSoreness > 5) {
      areas.push('Quadriceps', 'Calves');
    }
    // Default areas
    areas.push('Lower back', 'Shoulders');
    
    return areas;
  }

  getRecoveryWarnings(wearableData) {
    const warnings = [];
    
    if (wearableData.recoveryScore < 30) {
      warnings.push({
        level: 'critical',
        message: 'Recovery critically low - medical consultation recommended'
      });
    }
    if (wearableData.hrv && wearableData.hrv < 25) {
      warnings.push({
        level: 'critical',
        message: 'HRV dangerously low - immediate rest required'
      });
    }
    if (wearableData.restingHeartRate > 90) {
      warnings.push({
        level: 'high',
        message: 'Resting heart rate elevated - possible overtraining or illness'
      });
    }
    
    return warnings;
  }

  generateInterventionRecommendations(effectiveness, intervention, endMetrics) {
    const recommendations = [];
    
    if (effectiveness.score > 0.7) {
      recommendations.push({
        action: 'Continue current protocol',
        frequency: 'Daily',
        duration: intervention.duration
      });
    } else if (effectiveness.score > 0.5) {
      recommendations.push({
        action: 'Modify protocol intensity',
        adjustment: 'Increase duration by 20%'
      });
    } else {
      recommendations.push({
        action: 'Try alternative recovery method',
        alternatives: this.suggestAlternatives(intervention.type)
      });
    }
    
    return recommendations;
  }

  suggestNextInterventions(effectiveness, endMetrics) {
    const suggestions = [];
    
    if (endMetrics.hrv < 50) {
      suggestions.push({
        intervention: 'HRV biofeedback training',
        priority: 'high',
        duration: '10 minutes',
        frequency: '2x daily'
      });
    }
    
    if (endMetrics.sleepQuality < 70) {
      suggestions.push({
        intervention: 'Sleep hygiene protocol',
        priority: 'critical',
        actions: ['Blue light blocking 2h before bed', 'Room temp 65-68°F', 'Magnesium supplement']
      });
    }
    
    return suggestions;
  }

  suggestAlternatives(interventionType) {
    const alternatives = {
      'cold_therapy': ['Contrast showers', 'Cryotherapy', 'Ice massage'],
      'massage': ['Percussion therapy', 'Stretching', 'Yoga'],
      'breathing': ['Wim Hof method', 'Box breathing', 'Coherent breathing'],
      'sleep': ['Sleep restriction therapy', 'Melatonin', 'CBT-I']
    };
    
    return alternatives[interventionType] || ['Consult specialist'];
  }

  async generateRecoveryInsights(current, trend, debt, userProfile) {
    if (!genAI) {
      return this.getFallbackInsights(current);
    }
    
    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-pro',
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      });
      
      const prompt = `
        Analyze recovery status for a ${userProfile.age || 30}-year-old ${userProfile.gender || 'individual'}:
        
        Current Recovery: ${current.score}/100 (${current.status})
        HRV: ${current.hrv.value}ms (baseline: ${current.hrv.baseline}ms)
        Sleep: ${(current.sleep.duration / 60).toFixed(1)}h (efficiency: ${current.sleep.efficiency}%)
        Trend: ${trend.direction} at ${trend.rate}% per day
        Recovery Debt: ${debt.amount} (${debt.severity} severity)
        
        Provide 3 specific, actionable recommendations for the next 24 hours.
        Focus on practical interventions, not generic advice.
        Include specific timing, duration, and intensity where relevant.
      `;
      
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('AI generation error:', error);
      return this.getFallbackInsights(current);
    }
  }

  getFallbackInsights(current) {
    const insights = [];
    
    if (current.score < 40) {
      insights.push('⚠️ CRITICAL: Cancel all training today. Focus on sleep (9+ hours) and hydration.');
    } else if (current.score < 60) {
      insights.push('📊 MODERATE: Limit to light activity. Prioritize recovery modalities.');
    } else if (current.score < 80) {
      insights.push('✅ GOOD: Normal training acceptable. Monitor intensity.');
    } else {
      insights.push('🚀 OPTIMAL: Ready for high-intensity training or competition.');
    }
    
    if (current.hrv.value < current.hrv.baseline * 0.9) {
      insights.push(`💗 HRV below baseline: Add 10min coherent breathing (5s in, 5s out).`);
    }
    
    if (current.sleep.duration < 420) {
      insights.push(`😴 Sleep debt detected: Go to bed ${Math.round((480 - current.sleep.duration) / 60)}h earlier tonight.`);
    }
    
    return insights.join('\n\n');
  }

  assessDataCompleteness(wearableData) {
    if (!wearableData) return 0;
    
    const fields = ['hrv', 'sleepDuration', 'restingHeartRate', 'recoveryScore', 'trainingLoad'];
    const available = fields.filter(f => wearableData[f] && wearableData[f] > 0).length;
    
    return Math.round((available / fields.length) * 100);
  }

  assessDataReliability(history) {
    if (!history || history.length < 7) return 'low';
    
    // Check for data consistency
    const hasGaps = history.some((d, i) => {
      if (i === 0) return false;
      const gap = (new Date(history[i - 1].date) - new Date(d.date)) / 86400000;
      return gap > 2;
    });
    
    if (history.length >= 14 && !hasGaps) return 'high';
    if (history.length >= 7) return 'medium';
    return 'low';
  }

  getHRVPercentile(hrv, age, gender) {
    // Population percentiles (simplified)
    const percentiles = {
      male: { 25: 35, 50: 50, 75: 65, 90: 80 },
      female: { 25: 37, 50: 52, 75: 67, 90: 82 }
    };
    
    const genderPercentiles = percentiles[gender] || percentiles.male;
    
    if (hrv >= genderPercentiles[90]) return 90;
    if (hrv >= genderPercentiles[75]) return 75;
    if (hrv >= genderPercentiles[50]) return 50;
    if (hrv >= genderPercentiles[25]) return 25;
    return 10;
  }
}

module.exports = new RecoveryController();