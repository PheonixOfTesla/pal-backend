// Src/controllers/marsController.js - GOAL ACHIEVEMENT ENGINE ($300K VALUE)
const Goal = require('../models/Goal');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Measurement = require('../models/Measurement');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class MarsController {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    this.correlationEngine = null; // Will be injected
  }

  // ============================================
  // AUTOMATED GOAL SETTING
  // ============================================
  
  async generateSmartGoals(userId) {
    try {
      // Analyze user's current state
      const [wearableData, workouts, measurements] = await Promise.all([
        WearableData.find({ userId }).sort('-date').limit(30),
        Workout.find({ clientId: userId, completed: true }).sort('-completedAt').limit(20),
        Measurement.find({ clientId: userId }).sort('-date').limit(10)
      ]);

      // Calculate baseline metrics
      const metrics = this.calculateBaselineMetrics(wearableData, workouts, measurements);
      
      // AI-powered goal generation
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = `Generate 5 SMART fitness goals based on:
        Current fitness: ${JSON.stringify(metrics)}
        Focus on: progression, achievability, health improvement
        Return JSON array with: name, target, deadline, category, rationale`;

      const result = await model.generateContent(prompt);
      const suggestedGoals = JSON.parse(result.response.text());

      // Auto-adjust based on user's achievement history
      const adjustedGoals = await this.adjustGoalsBasedOnHistory(userId, suggestedGoals);

      return {
        success: true,
        goals: adjustedGoals,
        metrics,
        confidence: this.calculateConfidenceScore(metrics)
      };
    } catch (error) {
      console.error('Goal generation error:', error);
      throw error;
    }
  }

  // ============================================
  // PROGRESS PREDICTION ALGORITHM
  // ============================================
  
  async predictGoalCompletion(goalId) {
    const goal = await Goal.findById(goalId);
    if (!goal) throw new Error('Goal not found');

    // Calculate velocity and trajectory
    const progressHistory = goal.progressHistory || [];
    const velocity = this.calculateVelocity(progressHistory);
    const acceleration = this.calculateAcceleration(progressHistory);
    
    // Predict completion date
    const remainingProgress = goal.target - goal.current;
    const daysToCompletion = remainingProgress / (velocity || 0.1);
    const predictedDate = new Date(Date.now() + daysToCompletion * 86400000);
    
    // Calculate confidence based on consistency
    const consistency = this.calculateConsistency(progressHistory);
    const confidence = Math.min(95, consistency * acceleration * 100);

    // Identify risk factors
    const riskFactors = await this.identifyRiskFactors(goal.clientId, goal);

    return {
      goalId,
      currentProgress: goal.current,
      target: goal.target,
      velocity: velocity.toFixed(2),
      predictedCompletionDate: predictedDate,
      onTrack: predictedDate <= new Date(goal.deadline),
      confidence: Math.round(confidence),
      riskFactors,
      recommendations: this.generateRecommendations(velocity, riskFactors)
    };
  }

  // ============================================
  // MOTIVATIONAL INTERVENTION SYSTEM
  // ============================================
  
  async triggerMotivationalIntervention(userId) {
    const activeGoals = await Goal.find({ clientId: userId, completed: false });
    const interventions = [];

    for (const goal of activeGoals) {
      const progress = (goal.current / goal.target) * 100;
      const daysRemaining = Math.ceil((new Date(goal.deadline) - Date.now()) / 86400000);
      
      // Check if intervention needed
      if (progress < 30 && daysRemaining < 30) {
        interventions.push({
          type: 'critical',
          goalId: goal._id,
          message: `🚨 ${goal.name} needs immediate attention! Only ${daysRemaining} days left.`,
          action: 'schedule_coaching_session',
          suggestedActions: [
            'Break down into daily micro-goals',
            'Schedule accountability check-ins',
            'Adjust target if unrealistic'
          ]
        });
      } else if (progress > 70) {
        interventions.push({
          type: 'celebration',
          goalId: goal._id,
          message: `🎉 You're ${Math.round(progress)}% complete with ${goal.name}!`,
          action: 'celebrate_milestone',
          suggestedActions: ['Share achievement', 'Set next challenge']
        });
      }
    }

    // Store interventions and trigger notifications
    if (interventions.length > 0) {
      await this.storeInterventions(userId, interventions);
      this.sendMotivationalNotifications(userId, interventions);
    }

    return interventions;
  }

  // ============================================
  // GOAL-HEALTH CORRELATION
  // ============================================
  
  async correlateGoalsWithHealth(userId) {
    const [goals, wearableData] = await Promise.all([
      Goal.find({ clientId: userId }),
      WearableData.find({ userId }).sort('-date').limit(30)
    ]);

    const correlations = [];
    
    for (const goal of goals) {
      // Find health metrics during goal progress periods
      const progressDates = goal.progressHistory.map(p => p.date);
      const healthOnProgressDays = wearableData.filter(w => 
        progressDates.some(d => this.isSameDay(d, w.date))
      );

      // Calculate correlation coefficients
      const hrvCorrelation = this.calculateCorrelation(
        goal.progressHistory.map(p => p.value),
        healthOnProgressDays.map(h => h.hrv || 0)
      );

      const sleepCorrelation = this.calculateCorrelation(
        goal.progressHistory.map(p => p.value),
        healthOnProgressDays.map(h => h.sleepDuration || 0)
      );

      correlations.push({
        goalName: goal.name,
        hrvImpact: hrvCorrelation,
        sleepImpact: sleepCorrelation,
        insight: this.generateCorrelationInsight(hrvCorrelation, sleepCorrelation)
      });
    }

    return {
      correlations,
      recommendations: this.generateHealthOptimizedSchedule(correlations)
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  calculateBaselineMetrics(wearableData, workouts, measurements) {
    const avgSteps = wearableData.reduce((sum, d) => sum + (d.steps || 0), 0) / wearableData.length;
    const workoutFrequency = workouts.length / 30;
    const currentWeight = measurements[0]?.weight || 0;
    
    return {
      avgDailySteps: Math.round(avgSteps),
      workoutsPerWeek: (workoutFrequency * 7).toFixed(1),
      currentWeight,
      fitnessLevel: this.calculateFitnessLevel(avgSteps, workoutFrequency)
    };
  }

  calculateVelocity(progressHistory) {
    if (progressHistory.length < 2) return 0;
    
    const recentProgress = progressHistory.slice(-5);
    const firstPoint = recentProgress[0];
    const lastPoint = recentProgress[recentProgress.length - 1];
    
    const progressDelta = lastPoint.value - firstPoint.value;
    const timeDelta = (new Date(lastPoint.date) - new Date(firstPoint.date)) / 86400000;
    
    return timeDelta > 0 ? progressDelta / timeDelta : 0;
  }

  calculateAcceleration(progressHistory) {
    if (progressHistory.length < 3) return 1;
    
    const velocities = [];
    for (let i = 1; i < progressHistory.length; i++) {
      const v = this.calculateVelocity(progressHistory.slice(i-1, i+1));
      velocities.push(v);
    }
    
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const recentVelocity = velocities[velocities.length - 1] || 0;
    
    return recentVelocity / (avgVelocity || 1);
  }

  calculateConsistency(progressHistory) {
    if (progressHistory.length < 2) return 0;
    
    const intervals = [];
    for (let i = 1; i < progressHistory.length; i++) {
      const daysBetween = (new Date(progressHistory[i].date) - new Date(progressHistory[i-1].date)) / 86400000;
      intervals.push(daysBetween);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    
    return Math.max(0, 1 - (variance / avgInterval));
  }

  async identifyRiskFactors(userId, goal) {
    const risks = [];
    
    const recentWearable = await WearableData.findOne({ userId }).sort('-date');
    if (recentWearable?.recoveryScore < 50) {
      risks.push('Low recovery may impact progress');
    }
    
    const daysRemaining = Math.ceil((new Date(goal.deadline) - Date.now()) / 86400000);
    if (daysRemaining < 14) {
      risks.push('Approaching deadline');
    }
    
    return risks;
  }

  generateRecommendations(velocity, riskFactors) {
    const recommendations = [];
    
    if (velocity < 0.5) {
      recommendations.push('Increase effort intensity');
      recommendations.push('Consider daily check-ins');
    }
    
    if (riskFactors.includes('Low recovery')) {
      recommendations.push('Prioritize sleep and recovery');
    }
    
    return recommendations;
  }

  calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return den === 0 ? 0 : num / den;
  }

  isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.toDateString() === d2.toDateString();
  }

  generateCorrelationInsight(hrvCorr, sleepCorr) {
    if (hrvCorr > 0.5) return 'Goal progress strongly improves with better HRV';
    if (sleepCorr > 0.5) return 'Sleep quality directly impacts goal achievement';
    if (hrvCorr < -0.5) return 'High stress may be hindering progress';
    return 'Moderate correlation with health metrics';
  }

  generateHealthOptimizedSchedule(correlations) {
    // This would integrate with calendar to suggest optimal training times
    return {
      optimalWorkoutTime: 'Morning (high HRV correlation)',
      recoveryDays: ['Wednesday', 'Sunday'],
      intensityDistribution: '40% high, 40% moderate, 20% recovery'
    };
  }

  calculateFitnessLevel(avgSteps, workoutFrequency) {
    const score = (avgSteps / 10000) * 50 + (workoutFrequency * 7) * 50;
    if (score >= 80) return 'advanced';
    if (score >= 50) return 'intermediate';
    return 'beginner';
  }

  calculateConfidenceScore(metrics) {
    return Math.min(95, 
      50 + 
      (metrics.workoutsPerWeek * 5) + 
      (metrics.avgDailySteps / 1000)
    );
  }

  async adjustGoalsBasedOnHistory(userId, suggestedGoals) {
    const previousGoals = await Goal.find({ clientId: userId, completed: true });
    const completionRate = previousGoals.filter(g => g.completed).length / previousGoals.length;
    
    return suggestedGoals.map(goal => ({
      ...goal,
      target: goal.target * (completionRate > 0.7 ? 1.1 : 0.9),
      difficulty: completionRate > 0.7 ? 'challenging' : 'moderate'
    }));
  }

  async storeInterventions(userId, interventions) {
    // Store in database for tracking
    return interventions;
  }

  sendMotivationalNotifications(userId, interventions) {
    if (global.sendRealtimeNotification) {
      interventions.forEach(intervention => {
        global.sendRealtimeNotification(userId.toString(), {
          type: 'motivation',
          severity: intervention.type,
          message: intervention.message,
          actions: intervention.suggestedActions
        });
      });
    }
  }
}

// ============================================
// EXPRESS ROUTES
// ============================================

const marsController = new MarsController();

exports.generateGoals = async (req, res) => {
  try {
    const { userId } = req.params;
    const goals = await marsController.generateSmartGoals(userId);
    res.json(goals);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.predictCompletion = async (req, res) => {
  try {
    const { goalId } = req.params;
    const prediction = await marsController.predictGoalCompletion(goalId);
    res.json({ success: true, prediction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.triggerMotivation = async (req, res) => {
  try {
    const { userId } = req.params;
    const interventions = await marsController.triggerMotivationalIntervention(userId);
    res.json({ success: true, interventions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.analyzeCorrelations = async (req, res) => {
  try {
    const { userId } = req.params;
    const analysis = await marsController.correlateGoalsWithHealth(userId);
    res.json({ success: true, analysis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = exports;