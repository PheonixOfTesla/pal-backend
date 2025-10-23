// Src/services/aiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const WearableData = require('../../models/mercury/WearableData');
const Workout = require('../../models/venus/Workout');
const Goal = require('../../models/mars/Goal');
const Nutrition = require('../../models/venus/Nutrition');
const Measurement = require('../../models/mercury/Measurement');
const CalendarEvent = require('../../models/earth/CalendarEvent');
const CompanionConversation = require('../../models/phoenix/CompanionConversation');

class AIService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
    this.isConfigured = !!process.env.GOOGLE_AI_API_KEY;
    
    // Model configurations for different use cases
    this.models = {
      fast: 'gemini-2.0-flash-exp',      // Quick responses
      balanced: 'gemini-1.5-pro-latest',  // General purpose
      advanced: 'gemini-2.0-pro'          // Complex analysis
    };
  }

  /**
   * Check if AI service is available
   */
  isAvailable() {
    return this.isConfigured;
  }

  /**
   * Generate comprehensive health analysis
   */
  async analyzeHealthData(userId, options = {}) {
    if (!this.isConfigured) {
      return this.getFallbackAnalysis();
    }

    try {
      // Fetch comprehensive user data
      const userData = await this.fetchUserData(userId, options.days || 30);
      
      // Build analysis prompt
      const prompt = this.buildHealthAnalysisPrompt(userData);
      
      // Get AI analysis
      const model = this.genAI.getGenerativeModel({ 
        model: this.models.balanced,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        }
      });
      
      const result = await model.generateContent(prompt);
      const analysis = result.response.text();
      
      // Structure the response
      return {
        success: true,
        analysis,
        metrics: this.extractMetrics(userData),
        recommendations: await this.generateRecommendations(userData, analysis),
        confidence: 'high',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('AI analysis error:', error);
      return this.getFallbackAnalysis(error.message);
    }
  }

  /**
   * Generate workout recommendations
   */
  async generateWorkoutPlan(userId, preferences = {}) {
    if (!this.isConfigured) {
      return this.getFallbackWorkout(preferences);
    }

    try {
      const [wearableData, recentWorkouts, goals] = await Promise.all([
        WearableData.findOne({ userId }).sort('-date'),
        Workout.find({ clientId: userId, completed: true })
          .sort('-completedAt')
          .limit(10),
        Goal.find({ clientId: userId, completed: false })
      ]);
      
      const model = this.genAI.getGenerativeModel({ 
        model: this.models.fast,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 500
        }
      });
      
      const prompt = `Create a workout plan for the next 7 days:
      
      User Recovery: ${wearableData?.recoveryScore || 'unknown'}/100
      Recent HRV: ${wearableData?.hrv || 'unknown'}ms
      Sleep Quality: ${wearableData?.sleepScore || 'unknown'}/100
      
      Recent Workouts: ${recentWorkouts.map(w => w.name).join(', ') || 'None'}
      Goals: ${goals.map(g => g.name).join(', ') || 'General fitness'}
      Preferences: ${JSON.stringify(preferences)}
      
      Provide:
      1. 7-day workout schedule with specific exercises
      2. Intensity levels based on recovery
      3. Rest day placement
      4. Progressive overload strategy
      
      Format as structured workout plan with sets, reps, and rest periods.`;
      
      const result = await model.generateContent(prompt);
      const workoutPlan = result.response.text();
      
      // Parse and structure the workout plan
      const structuredPlan = this.parseWorkoutPlan(workoutPlan);
      
      return {
        success: true,
        plan: structuredPlan,
        rawPlan: workoutPlan,
        basedOn: {
          recoveryScore: wearableData?.recoveryScore,
          hrv: wearableData?.hrv,
          recentWorkouts: recentWorkouts.length
        }
      };
    } catch (error) {
      console.error('Workout generation error:', error);
      return this.getFallbackWorkout(preferences);
    }
  }

  /**
   * Chat conversation with context
   */
  async chat(userId, message, conversationHistory = []) {
    if (!this.isConfigured) {
      return {
        success: false,
        response: "I'm currently offline but here's what I know: Focus on consistent training and recovery.",
        fallback: true
      };
    }

    try {
      // Get user context
      const context = await this.getUserContext(userId);
      
      const model = this.genAI.getGenerativeModel({ 
        model: this.models.fast,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 300
        }
      });
      
      // Build conversation with Phoenix personality
      const systemPrompt = this.getPhoenixPersonality(context);
      
      // Format conversation history
      const formattedHistory = conversationHistory
        .slice(-10) // Last 10 messages
        .map(msg => `${msg.role}: ${msg.message}`)
        .join('\n');
      
      const fullPrompt = `${systemPrompt}
      
      Conversation History:
      ${formattedHistory}
      
      User: ${message}
      
      Phoenix (respond as the AI coach, brief and actionable):`;
      
      const result = await model.generateContent(fullPrompt);
      const response = result.response.text();
      
      // Store conversation
      await CompanionConversation.create([
        { userId, role: 'user', message },
        { userId, role: 'assistant', message: response }
      ]);
      
      return {
        success: true,
        response,
        context: {
          recovery: context.recovery,
          nextWorkout: context.nextWorkout
        }
      };
    } catch (error) {
      console.error('Chat error:', error);
      return {
        success: false,
        response: "I'm having trouble connecting. Remember: consistency beats perfection.",
        error: error.message
      };
    }
  }

  /**
   * Predict health outcomes
   */
  async predictOutcomes(userId, days = 30) {
    if (!this.isConfigured) {
      return this.getFallbackPredictions();
    }

    try {
      const historicalData = await WearableData.find({
        userId,
        date: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
      }).sort('date');
      
      if (historicalData.length < 7) {
        return {
          success: false,
          message: 'Insufficient data for predictions'
        };
      }
      
      const model = this.genAI.getGenerativeModel({ 
        model: this.models.advanced,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 600
        }
      });
      
      const dataPoints = historicalData.map(d => ({
        date: d.date,
        recovery: d.recoveryScore,
        hrv: d.hrv,
        sleep: d.sleepDuration,
        steps: d.steps
      }));
      
      const prompt = `Analyze this health data trend and predict the next ${days} days:
      
      Historical Data (last 90 days):
      ${JSON.stringify(dataPoints, null, 2)}
      
      Predict:
      1. Recovery score trajectory
      2. Risk of overtraining or illness
      3. Optimal training windows
      4. Sleep quality trends
      5. Intervention recommendations
      
      Base predictions on data patterns, seasonality, and typical human physiology.
      Provide confidence levels for each prediction.`;
      
      const result = await model.generateContent(prompt);
      const predictions = result.response.text();
      
      return {
        success: true,
        predictions: this.parsePredictions(predictions),
        rawPredictions: predictions,
        basedOnDays: historicalData.length,
        confidence: this.calculatePredictionConfidence(historicalData)
      };
    } catch (error) {
      console.error('Prediction error:', error);
      return this.getFallbackPredictions();
    }
  }

  /**
   * Analyze nutrition and suggest improvements
   */
  async analyzeNutrition(userId, mealData = null) {
    if (!this.isConfigured) {
      return this.getFallbackNutritionAnalysis();
    }

    try {
      const [nutrition, wearableData, workouts] = await Promise.all([
        Nutrition.findOne({ clientId: userId }),
        WearableData.findOne({ userId }).sort('-date'),
        Workout.find({ 
          clientId: userId,
          scheduledDate: {
            $gte: new Date(),
            $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        })
      ]);
      
      const model = this.genAI.getGenerativeModel({ 
        model: this.models.balanced,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      });
      
      const prompt = `Analyze nutrition and provide recommendations:
      
      Current Plan:
      - Protein: ${nutrition?.protein?.current}/${nutrition?.protein?.target}g
      - Carbs: ${nutrition?.carbs?.current}/${nutrition?.carbs?.target}g
      - Fat: ${nutrition?.fat?.current}/${nutrition?.fat?.target}g
      - Calories: ${nutrition?.calories?.current}/${nutrition?.calories?.target}
      
      Recovery Score: ${wearableData?.recoveryScore || 'N/A'}
      Upcoming Workouts: ${workouts.length} in next 7 days
      ${mealData ? `Recent Meal: ${JSON.stringify(mealData)}` : ''}
      
      Provide:
      1. Macro balance assessment
      2. Timing recommendations
      3. Specific food suggestions
      4. Hydration guidance
      5. Supplement considerations
      
      Keep recommendations practical and actionable.`;
      
      const result = await model.generateContent(prompt);
      const analysis = result.response.text();
      
      return {
        success: true,
        analysis,
        currentAdherence: this.calculateNutritionAdherence(nutrition),
        recommendations: this.extractNutritionRecommendations(analysis)
      };
    } catch (error) {
      console.error('Nutrition analysis error:', error);
      return this.getFallbackNutritionAnalysis();
    }
  }

  /**
   * Generate injury prevention insights
   */
  async analyzeInjuryRisk(userId) {
    if (!this.isConfigured) {
      return { risk: 'unknown', recommendations: ['Maintain proper form', 'Listen to your body'] };
    }

    try {
      const [wearableData, workouts, measurements] = await Promise.all([
        WearableData.find({ userId })
          .sort('-date')
          .limit(30),
        Workout.find({ clientId: userId, completed: true })
          .sort('-completedAt')
          .limit(20),
        Measurement.find({ clientId: userId })
          .sort('-date')
          .limit(5)
      ]);
      
      const model = this.genAI.getGenerativeModel({ 
        model: this.models.advanced,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 400
        }
      });
      
      const workloadData = this.calculateWorkload(workouts);
      const recoveryTrend = this.calculateRecoveryTrend(wearableData);
      
      const prompt = `Analyze injury risk based on:
      
      Workload Pattern: ${JSON.stringify(workloadData)}
      Recovery Trend: ${recoveryTrend}
      Average HRV: ${this.calculateAverage(wearableData, 'hrv')}
      Sleep Average: ${this.calculateAverage(wearableData, 'sleepDuration')/60}h
      Recent Workouts: ${workouts.slice(0, 5).map(w => w.name).join(', ')}
      
      Assess:
      1. Overall injury risk (low/moderate/high)
      2. Specific areas of concern
      3. Contributing factors
      4. Prevention strategies
      5. Recovery protocols needed
      
      Be specific and evidence-based.`;
      
      const result = await model.generateContent(prompt);
      const riskAnalysis = result.response.text();
      
      return {
        success: true,
        analysis: riskAnalysis,
        riskLevel: this.extractRiskLevel(riskAnalysis),
        factors: this.extractRiskFactors(riskAnalysis),
        recommendations: this.extractPreventionStrategies(riskAnalysis)
      };
    } catch (error) {
      console.error('Injury risk analysis error:', error);
      return {
        success: false,
        risk: 'unknown',
        recommendations: ['Maintain proper form', 'Adequate recovery between sessions']
      };
    }
  }

  // Helper methods
  async fetchUserData(userId, days) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const [wearableData, workouts, nutrition, goals, measurements] = await Promise.all([
      WearableData.find({ userId, date: { $gte: startDate } }).sort('-date'),
      Workout.find({ clientId: userId, scheduledDate: { $gte: startDate } }),
      Nutrition.findOne({ clientId: userId }),
      Goal.find({ clientId: userId }),
      Measurement.find({ clientId: userId }).sort('-date').limit(10)
    ]);
    
    return {
      wearableData,
      workouts,
      nutrition,
      goals,
      measurements
    };
  }

  buildHealthAnalysisPrompt(userData) {
    const { wearableData, workouts, nutrition, goals } = userData;
    
    const avgRecovery = this.calculateAverage(wearableData, 'recoveryScore');
    const avgHRV = this.calculateAverage(wearableData, 'hrv');
    const avgSleep = this.calculateAverage(wearableData, 'sleepDuration');
    const completionRate = this.calculateCompletionRate(workouts);
    
    return `Analyze this comprehensive health data and provide insights:
    
    RECOVERY METRICS (${wearableData.length} days):
    - Average Recovery: ${avgRecovery}/100
    - Average HRV: ${avgHRV}ms
    - Average Sleep: ${(avgSleep/60).toFixed(1)}h
    - Latest Recovery: ${wearableData[0]?.recoveryScore || 'N/A'}
    
    TRAINING DATA:
    - Completion Rate: ${completionRate}%
    - Total Workouts: ${workouts.length}
    - Recent Pattern: ${this.getWorkoutPattern(workouts)}
    
    NUTRITION:
    - Protein Adherence: ${this.getNutritionAdherence(nutrition, 'protein')}%
    - Calorie Balance: ${nutrition?.calories?.current}/${nutrition?.calories?.target}
    
    GOALS:
    ${goals.map(g => `- ${g.name}: ${g.current}/${g.target}`).join('\n')}
    
    Provide:
    1. Overall health assessment
    2. Key patterns identified
    3. Areas of concern
    4. Optimization opportunities
    5. Specific action items for next 7 days`;
  }

  extractMetrics(userData) {
    return {
      avgRecovery: this.calculateAverage(userData.wearableData, 'recoveryScore'),
      avgHRV: this.calculateAverage(userData.wearableData, 'hrv'),
      avgSleep: this.calculateAverage(userData.wearableData, 'sleepDuration'),
      workoutCount: userData.workouts.length,
      activeGoals: userData.goals.filter(g => !g.completed).length
    };
  }

  async generateRecommendations(userData, analysis) {
    // Extract key recommendations from AI analysis
    const recommendations = [];
    
    if (analysis.toLowerCase().includes('sleep')) {
      recommendations.push({
        category: 'Recovery',
        priority: 'high',
        action: 'Optimize sleep schedule',
        detail: 'Target 8 hours consistently'
      });
    }
    
    if (analysis.toLowerCase().includes('intensity')) {
      recommendations.push({
        category: 'Training',
        priority: 'medium',
        action: 'Adjust workout intensity',
        detail: 'Based on recovery metrics'
      });
    }
    
    return recommendations;
  }

  parseWorkoutPlan(rawPlan) {
    // Parse AI-generated workout plan into structured format
    const days = [];
    const lines = rawPlan.split('\n');
    let currentDay = null;
    
    lines.forEach(line => {
      if (line.match(/day\s+\d/i)) {
        if (currentDay) days.push(currentDay);
        currentDay = {
          day: line,
          exercises: [],
          notes: ''
        };
      } else if (currentDay && line.trim()) {
        if (line.includes('x') || line.includes('sets')) {
          currentDay.exercises.push(line.trim());
        } else {
          currentDay.notes += line.trim() + ' ';
        }
      }
    });
    
    if (currentDay) days.push(currentDay);
    return days.length > 0 ? days : this.getDefaultWorkoutPlan();
  }

  getUserContext(userId) {
    return Promise.all([
      WearableData.findOne({ userId }).sort('-date'),
      Workout.findOne({ 
        clientId: userId, 
        completed: false,
        scheduledDate: { $gte: new Date() }
      }).sort('scheduledDate'),
      Goal.find({ clientId: userId, completed: false }).limit(3)
    ]).then(([wearable, nextWorkout, goals]) => ({
      recovery: wearable?.recoveryScore || null,
      hrv: wearable?.hrv || null,
      sleep: wearable?.sleepDuration || null,
      nextWorkout: nextWorkout?.name || null,
      goals: goals.map(g => g.name)
    }));
  }

  getPhoenixPersonality(context) {
    return `You are Phoenix, an elite AI performance coach. You embody:
    - JARVIS's intelligence and proactivity
    - Direct, actionable advice (no fluff)
    - Deep care for the user's wellbeing
    - Decision-making capability (not just suggestions)
    
    Current User Status:
    - Recovery: ${context.recovery || 'unknown'}/100
    - HRV: ${context.hrv || 'unknown'}ms
    - Next Workout: ${context.nextWorkout || 'none scheduled'}
    - Active Goals: ${context.goals.join(', ') || 'general fitness'}
    
    Communication Style:
    - Brief and punchy (2-3 sentences max)
    - Use exact numbers when available
    - Make decisions, don't just suggest
    - Natural, conversational tone
    - Occasionally use their achievements to motivate`;
  }

  parsePredictions(rawPredictions) {
    const predictions = {
      recovery: [],
      risks: [],
      optimalWindows: [],
      interventions: []
    };
    
    const lines = rawPredictions.split('\n');
    let currentSection = null;
    
    lines.forEach(line => {
      if (line.toLowerCase().includes('recovery')) {
        currentSection = 'recovery';
      } else if (line.toLowerCase().includes('risk')) {
        currentSection = 'risks';
      } else if (line.toLowerCase().includes('optimal') || line.toLowerCase().includes('window')) {
        currentSection = 'optimalWindows';
      } else if (line.toLowerCase().includes('intervention')) {
        currentSection = 'interventions';
      } else if (currentSection && line.trim()) {
        predictions[currentSection].push(line.trim());
      }
    });
    
    return predictions;
  }

  calculatePredictionConfidence(data) {
    const dataPoints = data.length;
    const dataCompleteness = data.filter(d => 
      d.recoveryScore && d.hrv && d.sleepDuration
    ).length / dataPoints;
    
    if (dataPoints >= 60 && dataCompleteness > 0.8) return 'high';
    if (dataPoints >= 30 && dataCompleteness > 0.6) return 'medium';
    return 'low';
  }

  calculateNutritionAdherence(nutrition) {
    if (!nutrition) return { overall: 0 };
    
    const macros = ['protein', 'carbs', 'fat', 'calories'];
    const adherence = {};
    let totalAdherence = 0;
    let count = 0;
    
    macros.forEach(macro => {
      if (nutrition[macro]?.target > 0) {
        const percentage = Math.min(
          (nutrition[macro].current / nutrition[macro].target) * 100,
          150
        );
        adherence[macro] = Math.round(percentage);
        totalAdherence += percentage;
        count++;
      }
    });
    
    adherence.overall = count > 0 ? Math.round(totalAdherence / count) : 0;
    return adherence;
  }

  extractNutritionRecommendations(analysis) {
    const recommendations = [];
    const lines = analysis.split('\n');
    
    lines.forEach(line => {
      if (line.match(/^\d+\.|^-|^•/) && line.trim().length > 10) {
        recommendations.push({
          text: line.replace(/^\d+\.|^-|^•/, '').trim(),
          priority: this.detectPriority(line)
        });
      }
    });
    
    return recommendations;
  }

  calculateWorkload(workouts) {
    const completed = workouts.filter(w => w.completed);
    const byWeek = {};
    
    completed.forEach(workout => {
      const week = this.getWeekNumber(workout.completedAt);
      if (!byWeek[week]) byWeek[week] = 0;
      byWeek[week]++;
    });
    
    return {
      total: completed.length,
      weekly: byWeek,
      average: completed.length / 4,
      trend: this.calculateWorkloadTrend(byWeek)
    };
  }

  calculateRecoveryTrend(wearableData) {
    if (wearableData.length < 3) return 'insufficient_data';
    
    const recent = wearableData.slice(0, 7);
    const older = wearableData.slice(7, 14);
    
    const recentAvg = this.calculateAverage(recent, 'recoveryScore');
    const olderAvg = this.calculateAverage(older, 'recoveryScore');
    
    if (recentAvg > olderAvg + 5) return 'improving';
    if (recentAvg < olderAvg - 5) return 'declining';
    return 'stable';
  }

  calculateAverage(data, field) {
    const values = data.map(d => d[field]).filter(v => v != null && v > 0);
    return values.length > 0 ? 
      Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  }

  calculateCompletionRate(workouts) {
    if (workouts.length === 0) return 0;
    const completed = workouts.filter(w => w.completed).length;
    return Math.round((completed / workouts.length) * 100);
  }

  getNutritionAdherence(nutrition, macro) {
    if (!nutrition || !nutrition[macro]) return 0;
    const { current, target } = nutrition[macro];
    if (target === 0) return 0;
    return Math.min(Math.round((current / target) * 100), 150);
  }

  getWorkoutPattern(workouts) {
    const recent = workouts.slice(0, 7);
    const types = recent.map(w => {
      if (w.name.toLowerCase().includes('upper')) return 'upper';
      if (w.name.toLowerCase().includes('lower')) return 'lower';
      if (w.name.toLowerCase().includes('cardio')) return 'cardio';
      return 'mixed';
    });
    
    const counts = types.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(counts)
      .map(([type, count]) => `${type}:${count}`)
      .join(', ');
  }

  extractRiskLevel(analysis) {
    const lower = analysis.toLowerCase();
    if (lower.includes('high risk') || lower.includes('critical')) return 'high';
    if (lower.includes('moderate risk') || lower.includes('caution')) return 'moderate';
    return 'low';
  }

  extractRiskFactors(analysis) {
    const factors = [];
    const lines = analysis.split('\n');
    
    lines.forEach(line => {
      if (line.toLowerCase().includes('factor') || 
          line.toLowerCase().includes('concern') ||
          line.toLowerCase().includes('issue')) {
        factors.push(line.trim());
      }
    });
    
    return factors.slice(0, 5);
  }

  extractPreventionStrategies(analysis) {
    const strategies = [];
    const lines = analysis.split('\n');
    
    lines.forEach(line => {
      if (line.toLowerCase().includes('prevent') || 
          line.toLowerCase().includes('strategy') ||
          line.toLowerCase().includes('recommend')) {
        strategies.push(line.trim());
      }
    });
    
    return strategies.slice(0, 5);
  }

  detectPriority(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical') || lower.includes('immediate')) return 'critical';
    if (lower.includes('important') || lower.includes('priority')) return 'high';
    if (lower.includes('consider') || lower.includes('optional')) return 'low';
    return 'medium';
  }

  getWeekNumber(date) {
    const d = new Date(date);
    const firstDay = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d - firstDay) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + firstDay.getDay() + 1) / 7);
  }

  calculateWorkloadTrend(weeklyData) {
    const weeks = Object.keys(weeklyData).sort((a, b) => b - a);
    if (weeks.length < 2) return 'stable';
    
    const recent = weeklyData[weeks[0]] || 0;
    const previous = weeklyData[weeks[1]] || 0;
    
    if (recent > previous * 1.3) return 'increasing';
    if (recent < previous * 0.7) return 'decreasing';
    return 'stable';
  }

  // Fallback methods when AI is not available
  getFallbackAnalysis(error = null) {
    return {
      success: false,
      analysis: 'AI analysis temporarily unavailable. Using rule-based analysis.',
      metrics: {
        status: 'fallback'
      },
      recommendations: [
        {
          category: 'General',
          priority: 'medium',
          action: 'Maintain consistent training',
          detail: 'Focus on recovery between sessions'
        }
      ],
      confidence: 'low',
      error: error,
      timestamp: new Date()
    };
  }

  getFallbackWorkout(preferences) {
    return {
      success: false,
      plan: [
        {
          day: 'Day 1 - Upper Body',
          exercises: [
            'Bench Press - 3x8-10',
            'Pull-ups - 3x8-10',
            'Overhead Press - 3x10-12'
          ],
          notes: 'Focus on form'
        },
        {
          day: 'Day 2 - Lower Body',
          exercises: [
            'Squats - 3x8-10',
            'Deadlifts - 3x5',
            'Lunges - 3x12'
          ],
          notes: 'Warm up thoroughly'
        },
        {
          day: 'Day 3 - Rest',
          exercises: [],
          notes: 'Active recovery optional'
        }
      ],
      fallback: true
    };
  }

  getFallbackPredictions() {
    return {
      success: false,
      predictions: {
        recovery: ['Unable to predict - insufficient AI access'],
        risks: ['Monitor your body signals'],
        optimalWindows: ['Morning workouts typically optimal'],
        interventions: ['Maintain consistent sleep schedule']
      },
      confidence: 'none'
    };
  }

  getFallbackNutritionAnalysis() {
    return {
      success: false,
      analysis: 'AI nutrition analysis unavailable',
      currentAdherence: { overall: 0 },
      recommendations: [
        {
          text: 'Maintain balanced macronutrient intake',
          priority: 'medium'
        },
        {
          text: 'Stay hydrated - 3L water daily',
          priority: 'high'
        }
      ]
    };
  }

  getDefaultWorkoutPlan() {
    return [
      {
        day: 'Day 1',
        exercises: ['Workout not parsed'],
        notes: 'Please check raw plan'
      }
    ];
  }
}

// Export singleton instance
module.exports = new AIService();