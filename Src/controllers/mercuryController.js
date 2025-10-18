// Src/controllers/mercuryController.js - Complete Fitness Intelligence System
const Workout = require('../models/Workout');
const Exercise = require('../models/Exercise');
const WearableData = require('../models/WearableData');
const User = require('../models/User');
const Goal = require('../models/Goal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const EventEmitter = require('events');

class MercuryController extends EventEmitter {
  constructor() {
    super();
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
    this.correlationPatterns = new Map();
    this.injuryRiskThresholds = {
      volume: { weekly: 1.5, daily: 1.3 },
      intensity: { max: 0.95, sustained: 0.85 },
      fatigue: { acute: 7, chronic: 5 }
    };
  }

  // ============================================
  // REAL-TIME WORKOUT TRACKING WITH FORM ANALYSIS
  // ============================================
  
  async trackWorkoutRealtime(req, res) {
    try {
      const { userId, workoutId, exerciseIndex, setData } = req.body;
      
      // Get current workout and wearable data
      const [workout, wearableData] = await Promise.all([
        Workout.findById(workoutId),
        WearableData.findOne({ userId }).sort('-date')
      ]);
      
      if (!workout) {
        return res.status(404).json({ success: false, message: 'Workout not found' });
      }
      
      // Real-time form analysis based on set performance
      const formAnalysis = await this.analyzeForm(setData, wearableData);
      
      // Update workout with real-time data
      if (!workout.exercises[exerciseIndex].actualSets) {
        workout.exercises[exerciseIndex].actualSets = [];
      }
      
      workout.exercises[exerciseIndex].actualSets.push({
        ...setData,
        formScore: formAnalysis.score,
        powerOutput: formAnalysis.powerOutput,
        velocityLoss: formAnalysis.velocityLoss,
        timestamp: new Date()
      });
      
      // Check for injury risk in real-time
      const injuryRisk = await this.assessInjuryRisk(userId, workout, setData, wearableData);
      
      if (injuryRisk.level === 'high') {
        // Auto-modify remaining sets
        workout.exercises[exerciseIndex].sets = Math.max(
          workout.exercises[exerciseIndex].actualSets.length + 1,
          workout.exercises[exerciseIndex].sets - 2
        );
        workout.exercises[exerciseIndex].notes = `⚠️ INJURY RISK: ${injuryRisk.reason}`;
      }
      
      await workout.save();
      
      // Emit real-time events
      this.emit('workout.set.completed', {
        userId,
        workoutId,
        exerciseIndex,
        setData,
        formAnalysis,
        injuryRisk
      });
      
      // Send WebSocket notification
      if (global.sendRealtimeNotification) {
        global.sendRealtimeNotification(userId, {
          type: 'workout_update',
          exerciseName: workout.exercises[exerciseIndex].name,
          setNumber: workout.exercises[exerciseIndex].actualSets.length,
          formScore: formAnalysis.score,
          injuryRisk: injuryRisk.level,
          message: formAnalysis.feedback
        });
      }
      
      res.json({
        success: true,
        formAnalysis,
        injuryRisk,
        recommendation: formAnalysis.recommendation,
        modifiedWorkout: injuryRisk.level === 'high'
      });
      
    } catch (error) {
      console.error('Real-time tracking error:', error);
      res.status(500).json({ success: false, message: 'Tracking failed' });
    }
  }

  // ============================================
  // EXERCISE RECOMMENDATION AI
  // ============================================
  
  async recommendExercises(req, res) {
    try {
      const { userId } = req.params;
      const { targetMuscles, equipment, timeAvailable } = req.body;
      
      // Get user's training history and recovery status
      const [workoutHistory, wearableData, injuries, goals] = await Promise.all([
        Workout.find({ clientId: userId, completed: true })
          .sort('-completedAt')
          .limit(30),
        WearableData.findOne({ userId }).sort('-date'),
        this.getUserInjuryHistory(userId),
        Goal.find({ clientId: userId, completed: false })
      ]);
      
      // Analyze muscle group frequency
      const muscleFrequency = this.analyzeMuscleFrequency(workoutHistory);
      
      // Generate AI recommendations
      const recommendations = await this.generateAIRecommendations({
        targetMuscles,
        equipment,
        timeAvailable,
        recoveryScore: wearableData?.recoveryScore || 50,
        muscleFrequency,
        injuries,
        goals
      });
      
      // Score and rank exercises
      const scoredExercises = await this.scoreExercises(recommendations, {
        userLevel: this.calculateUserLevel(workoutHistory),
        recovery: wearableData?.recoveryScore || 50,
        recentWork: muscleFrequency
      });
      
      // Create optimal workout structure
      const workoutPlan = this.structureWorkout(scoredExercises, timeAvailable);
      
      res.json({
        success: true,
        recommendations: workoutPlan,
        reasoning: {
          recoveryAdjusted: wearableData?.recoveryScore < 60,
          injuryConsiderations: injuries.length > 0,
          goalAligned: goals.map(g => g.name),
          muscleBalance: this.assessMuscleBalance(muscleFrequency)
        }
      });
      
    } catch (error) {
      console.error('Exercise recommendation error:', error);
      res.status(500).json({ success: false, message: 'Recommendation failed' });
    }
  }

  // ============================================
  // PROGRESSIVE OVERLOAD AUTOMATION
  // ============================================
  
  async automateProgressiveOverload(req, res) {
    try {
      const { userId } = req.params;
      
      // Get last 8 weeks of workout data
      const eightWeeksAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
      const workouts = await Workout.find({
        clientId: userId,
        completed: true,
        completedAt: { $gte: eightWeeksAgo }
      }).sort('completedAt');
      
      if (workouts.length < 4) {
        return res.json({
          success: false,
          message: 'Insufficient training history for progression analysis'
        });
      }
      
      // Analyze progression patterns
      const progressionAnalysis = this.analyzeProgression(workouts);
      
      // Generate next workout with automated progression
      const nextWorkout = await this.generateProgressedWorkout(
        workouts[workouts.length - 1],
        progressionAnalysis
      );
      
      // Apply recovery-based modifications
      const wearableData = await WearableData.findOne({ userId }).sort('-date');
      if (wearableData?.recoveryScore < 60) {
        nextWorkout.exercises = this.adjustForRecovery(
          nextWorkout.exercises,
          wearableData.recoveryScore
        );
      }
      
      // Save the new workout
      const savedWorkout = await Workout.create({
        ...nextWorkout,
        clientId: userId,
        createdBy: userId,
        assignedBy: userId,
        notes: `🤖 AI-Generated Progressive Overload - Week ${progressionAnalysis.currentWeek}`
      });
      
      res.json({
        success: true,
        workout: savedWorkout,
        progression: {
          volumeIncrease: `${progressionAnalysis.volumeChange}%`,
          intensityIncrease: `${progressionAnalysis.intensityChange}%`,
          currentPhase: progressionAnalysis.phase,
          recommendation: progressionAnalysis.recommendation
        }
      });
      
    } catch (error) {
      console.error('Progressive overload error:', error);
      res.status(500).json({ success: false, message: 'Progression failed' });
    }
  }

  // ============================================
  // INJURY PREVENTION ALGORITHMS
  // ============================================
  
  async assessInjuryRisk(userId, workout, currentSet, wearableData) {
    const riskFactors = [];
    let riskScore = 0;
    
    // 1. Check form degradation
    if (currentSet.velocityLoss > 30) {
      riskScore += 25;
      riskFactors.push('Significant velocity loss detected');
    }
    
    // 2. Check volume spike
    const weeklyVolume = await this.calculateWeeklyVolume(userId);
    const lastWeekVolume = await this.calculateWeeklyVolume(userId, 1);
    const volumeIncrease = ((weeklyVolume - lastWeekVolume) / lastWeekVolume) * 100;
    
    if (volumeIncrease > 50) {
      riskScore += 30;
      riskFactors.push(`Volume spike: ${volumeIncrease.toFixed(0)}% increase`);
    }
    
    // 3. Check recovery status
    if (wearableData) {
      if (wearableData.recoveryScore < 30) {
        riskScore += 35;
        riskFactors.push('Critical recovery state');
      } else if (wearableData.hrv < 40) {
        riskScore += 20;
        riskFactors.push('Low HRV indicates high stress');
      }
    }
    
    // 4. Check training frequency
    const recentWorkouts = await Workout.countDocuments({
      clientId: userId,
      completed: true,
      completedAt: { $gte: new Date(Date.now() - 72 * 60 * 60 * 1000) }
    });
    
    if (recentWorkouts > 5) {
      riskScore += 20;
      riskFactors.push('High training frequency without adequate rest');
    }
    
    return {
      score: riskScore,
      level: riskScore >= 60 ? 'high' : riskScore >= 40 ? 'medium' : 'low',
      factors: riskFactors,
      reason: riskFactors[0] || 'Normal risk levels',
      recommendation: this.getInjuryPreventionRecommendation(riskScore)
    };
  }

  // ============================================
  // WORKOUT EFFECTIVENESS SCORING
  // ============================================
  
  async scoreWorkoutEffectiveness(req, res) {
    try {
      const { workoutId } = req.params;
      
      const workout = await Workout.findById(workoutId);
      if (!workout || !workout.completed) {
        return res.status(400).json({
          success: false,
          message: 'Workout not found or not completed'
        });
      }
      
      // Multi-factor effectiveness analysis
      const scores = {
        execution: this.scoreExecution(workout),
        intensity: this.scoreIntensity(workout),
        volume: this.scoreVolume(workout),
        progression: await this.scoreProgression(workout),
        recovery: await this.scoreRecoveryImpact(workout)
      };
      
      const overallScore = Object.values(scores).reduce((a, b) => a + b) / 5;
      
      // Generate insights
      const insights = await this.generateWorkoutInsights(workout, scores);
      
      // Update workout with effectiveness data
      workout.effectivenessScore = overallScore;
      workout.effectivenessBreakdown = scores;
      await workout.save();
      
      res.json({
        success: true,
        overallScore: Math.round(overallScore),
        breakdown: scores,
        insights,
        recommendations: this.getEffectivenessRecommendations(scores)
      });
      
    } catch (error) {
      console.error('Workout scoring error:', error);
      res.status(500).json({ success: false, message: 'Scoring failed' });
    }
  }

  // ============================================
  // SOCIAL COMPARISON ENGINE
  // ============================================
  
  async compareSocialPerformance(req, res) {
    try {
      const { userId } = req.params;
      const { exerciseName, anonymize = true } = req.body;
      
      // Get user's performance
      const userWorkouts = await Workout.find({
        clientId: userId,
        completed: true,
        'exercises.name': exerciseName
      }).sort('-completedAt').limit(10);
      
      if (userWorkouts.length === 0) {
        return res.json({
          success: false,
          message: 'No data for this exercise'
        });
      }
      
      // Calculate user's metrics
      const userMetrics = this.calculatePerformanceMetrics(userWorkouts, exerciseName);
      
      // Get comparison group (similar users)
      const comparisonGroup = await this.getSimilarUsers(userId);
      
      // Get group performance data
      const groupPerformance = await this.getGroupPerformance(
        comparisonGroup,
        exerciseName
      );
      
      // Calculate percentiles and rankings
      const comparison = {
        userMetrics,
        groupAverage: groupPerformance.average,
        percentile: this.calculatePercentile(userMetrics, groupPerformance.all),
        ranking: this.calculateRanking(userMetrics, groupPerformance.all),
        totalUsers: groupPerformance.all.length,
        improvement: this.calculateImprovementRate(userWorkouts, exerciseName)
      };
      
      // Generate motivational insights
      const insights = await this.generateSocialInsights(comparison);
      
      res.json({
        success: true,
        comparison,
        insights,
        anonymizedLeaderboard: anonymize ? 
          this.getAnonymizedLeaderboard(groupPerformance.all) : null
      });
      
    } catch (error) {
      console.error('Social comparison error:', error);
      res.status(500).json({ success: false, message: 'Comparison failed' });
    }
  }

  // ============================================
  // VIRTUAL COACHING PERSONALITY
  // ============================================
  
  async getVirtualCoachingAdvice(req, res) {
    try {
      const { userId } = req.params;
      const { context = 'general' } = req.body;
      
      // Gather comprehensive user data
      const [userData, recentWorkouts, wearableData, goals] = await Promise.all([
        User.findById(userId),
        Workout.find({ clientId: userId }).sort('-completedAt').limit(5),
        WearableData.findOne({ userId }).sort('-date'),
        Goal.find({ clientId: userId, completed: false })
      ]);
      
      // Build coaching personality context
      const coachingStyle = this.determineCoachingStyle(userData, recentWorkouts);
      
      // Generate AI coaching advice
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      
      const prompt = `You are an elite virtual fitness coach with personality style: ${coachingStyle}.
      
      User Context:
      - Recent completion rate: ${this.calculateCompletionRate(recentWorkouts)}%
      - Recovery score: ${wearableData?.recoveryScore || 'unknown'}
      - Current goals: ${goals.map(g => g.name).join(', ')}
      - Specific context: ${context}
      
      Provide personalized, motivating coaching advice that:
      1. Addresses their current situation
      2. Uses their preferred coaching style
      3. Gives specific, actionable guidance
      4. Maintains consistent personality
      
      Keep response under 150 words, direct and impactful.`;
      
      const result = await model.generateContent(prompt);
      const advice = result.response.text();
      
      // Store coaching interaction
      await this.storeCoachingInteraction(userId, context, advice);
      
      res.json({
        success: true,
        advice,
        coachingStyle,
        context: {
          mood: this.assessUserMood(recentWorkouts),
          energy: wearableData?.recoveryScore || 50,
          consistency: this.calculateCompletionRate(recentWorkouts)
        }
      });
      
    } catch (error) {
      console.error('Virtual coaching error:', error);
      res.status(500).json({ success: false, message: 'Coaching failed' });
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================
  
  analyzeForm(setData, wearableData) {
    const { reps, weight, duration } = setData;
    
    // Calculate velocity (simplified)
    const velocity = duration > 0 ? reps / (duration / 1000) : 1;
    const expectedVelocity = 0.5; // reps per second baseline
    const velocityLoss = ((expectedVelocity - velocity) / expectedVelocity) * 100;
    
    // Calculate power output
    const powerOutput = weight * reps * velocity;
    
    // Form score calculation
    let formScore = 100;
    if (velocityLoss > 20) formScore -= 20;
    if (velocityLoss > 40) formScore -= 30;
    if (wearableData?.heartRate > 180) formScore -= 10;
    
    return {
      score: Math.max(0, formScore),
      powerOutput: Math.round(powerOutput),
      velocityLoss: Math.round(velocityLoss),
      feedback: formScore >= 80 ? 'Excellent form maintained' :
                formScore >= 60 ? 'Form degrading - focus on control' :
                'Poor form detected - reduce weight or rest',
      recommendation: velocityLoss > 30 ? 'Consider ending set' : 'Continue with focus'
    };
  }

  calculateWeeklyVolume(userId, weeksAgo = 0) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (7 * (weeksAgo + 1)));
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - (7 * weeksAgo));
    
    return Workout.aggregate([
      {
        $match: {
          clientId: userId,
          completed: true,
          completedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $unwind: '$exercises'
      },
      {
        $group: {
          _id: null,
          totalVolume: {
            $sum: {
              $multiply: ['$exercises.sets', '$exercises.reps', '$exercises.weight']
            }
          }
        }
      }
    ]).then(result => result[0]?.totalVolume || 0);
  }

  getInjuryPreventionRecommendation(riskScore) {
    if (riskScore >= 60) {
      return 'STOP current session. Schedule recovery day. Consider massage or stretching.';
    } else if (riskScore >= 40) {
      return 'Reduce intensity by 30%. Focus on form. Add mobility work.';
    } else {
      return 'Continue with normal training. Monitor form closely.';
    }
  }

  analyzeMuscleFrequency(workoutHistory) {
    const frequency = {};
    
    workoutHistory.forEach(workout => {
      workout.exercises.forEach(exercise => {
        const muscle = exercise.muscleGroup || 'unknown';
        frequency[muscle] = (frequency[muscle] || 0) + 1;
      });
    });
    
    return frequency;
  }

  calculateUserLevel(workoutHistory) {
    const totalWorkouts = workoutHistory.length;
    const avgVolume = workoutHistory.reduce((sum, w) => {
      return sum + w.exercises.reduce((eSum, e) => {
        return eSum + (e.sets * e.reps * e.weight);
      }, 0);
    }, 0) / totalWorkouts;
    
    if (avgVolume > 50000) return 'advanced';
    if (avgVolume > 20000) return 'intermediate';
    return 'beginner';
  }

  determineCoachingStyle(userData, recentWorkouts) {
    const completionRate = this.calculateCompletionRate(recentWorkouts);
    
    if (completionRate < 50) {
      return 'supportive_encouraging';
    } else if (completionRate > 80) {
      return 'challenging_pushy';
    } else {
      return 'balanced_motivational';
    }
  }

  calculateCompletionRate(workouts) {
    if (workouts.length === 0) return 0;
    const completed = workouts.filter(w => w.completed).length;
    return Math.round((completed / workouts.length) * 100);
  }
}

// Export singleton instance and methods
const mercuryController = new MercuryController();

module.exports = {
  trackWorkoutRealtime: (req, res) => mercuryController.trackWorkoutRealtime(req, res),
  recommendExercises: (req, res) => mercuryController.recommendExercises(req, res),
  automateProgressiveOverload: (req, res) => mercuryController.automateProgressiveOverload(req, res),
  scoreWorkoutEffectiveness: (req, res) => mercuryController.scoreWorkoutEffectiveness(req, res),
  compareSocialPerformance: (req, res) => mercuryController.compareSocialPerformance(req, res),
  getVirtualCoachingAdvice: (req, res) => mercuryController.getVirtualCoachingAdvice(req, res),
  mercuryEventEmitter: mercuryController
};