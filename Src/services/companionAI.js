// ============================================
// COMPANION AI SERVICE - FULLY IMPLEMENTED
// ============================================
// Complete Gemini AI integration with real business logic
// ============================================

const { GoogleGenerativeAI } = require('@google/generative-ai');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Goal = require('../models/Goal');
const RecoveryScore = require('../models/RecoveryScore');
const CorrelationPattern = require('../models/CorrelationPattern');
const CalendarEvent = require('../models/CalendarEvent');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');

/**
 * Build comprehensive user context for AI
 */
exports.buildUserContext = async (userId) => {
  try {
    const context = {
      hasWearableData: false,
      recentWorkouts: 0,
      activeGoals: 0,
      recoveryScore: null,
      recentPatterns: [],
      financialHealth: null,
      upcomingEvents: 0,
      summary: ''
    };

    // Get recent wearable data (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentWearables = await WearableData.find({ 
      userId,
      date: { $gte: sevenDaysAgo }
    }).sort({ date: -1 }).limit(7);
    
    if (recentWearables.length > 0) {
      context.hasWearableData = true;
      const latest = recentWearables[0];
      
      // Calculate averages
      const avgHRV = recentWearables.reduce((sum, w) => sum + (w.hrv || 0), 0) / recentWearables.length;
      const avgRHR = recentWearables.reduce((sum, w) => sum + (w.restingHeartRate || 0), 0) / recentWearables.length;
      const avgSleep = recentWearables.reduce((sum, w) => sum + (w.sleepDuration || 0), 0) / recentWearables.length;
      
      context.latestMetrics = {
        hrv: latest.hrv,
        rhr: latest.restingHeartRate,
        sleep: latest.sleepDuration,
        steps: latest.steps
      };
      
      context.weeklyAverages = {
        hrv: Math.round(avgHRV),
        rhr: Math.round(avgRHR),
        sleep: Math.round(avgSleep)
      };
      
      // Trend analysis
      if (recentWearables.length >= 3) {
        const recent3 = recentWearables.slice(0, 3);
        const older3 = recentWearables.slice(-3);
        
        const recentAvgHRV = recent3.reduce((sum, w) => sum + (w.hrv || 0), 0) / 3;
        const olderAvgHRV = older3.reduce((sum, w) => sum + (w.hrv || 0), 0) / 3;
        
        context.trends = {
          hrv: recentAvgHRV > olderAvgHRV + 5 ? 'improving' : recentAvgHRV < olderAvgHRV - 5 ? 'declining' : 'stable'
        };
      }
    }

    // Get recent workouts
    const workouts = await Workout.find({
      userId,
      date: { $gte: sevenDaysAgo }
    }).sort({ date: -1 });
    
    context.recentWorkouts = workouts.length;
    
    if (workouts.length > 0) {
      const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);
      const totalVolume = workouts.reduce((sum, w) => sum + (w.totalVolume || 0), 0);
      
      context.workoutStats = {
        count: workouts.length,
        totalDuration,
        avgDuration: Math.round(totalDuration / workouts.length),
        totalVolume,
        types: [...new Set(workouts.map(w => w.workoutType))]
      };
    }

    // Get active goals
    const goals = await Goal.find({
      userId,
      status: 'active'
    }).sort({ createdAt: -1 });
    
    context.activeGoals = goals.length;
    
    if (goals.length > 0) {
      context.goals = goals.map(g => ({
        name: g.name,
        progress: g.progress || 0,
        target: g.target,
        category: g.category,
        dueDate: g.dueDate,
        percentComplete: g.target > 0 ? Math.round((g.progress / g.target) * 100) : 0
      }));
      
      // Find goals close to completion
      context.goalsNearCompletion = goals.filter(g => {
        const percent = g.target > 0 ? (g.progress / g.target) * 100 : 0;
        return percent >= 80 && percent < 100;
      }).length;
    }

    // Get latest recovery score
    const recovery = await RecoveryScore.findOne({ userId })
      .sort({ date: -1 });
    
    if (recovery) {
      context.recoveryScore = recovery.score;
      context.recoveryStatus = recovery.status;
      context.trainingRecommendation = recovery.recommendation;
    }

    // Get recent patterns
    const patterns = await CorrelationPattern.find({
      userId,
      isActive: true
    })
      .sort({ 'correlation.strength': -1 })
      .limit(5);
    
    context.recentPatterns = patterns.map(p => ({
      type: p.patternType,
      strength: p.correlation.strength,
      confidence: p.correlation.confidence
    }));

    // Get upcoming calendar events
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
    const upcomingEvents = await CalendarEvent.find({
      userId,
      startTime: { $gte: new Date(), $lte: tomorrow }
    }).sort({ startTime: 1 });
    
    context.upcomingEvents = upcomingEvents.length;
    if (upcomingEvents.length > 0) {
      context.nextEvent = {
        title: upcomingEvents[0].title,
        startTime: upcomingEvents[0].startTime,
        meetingType: upcomingEvents[0].meetingType
      };
    }

    // Get financial health (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const transactions = await Transaction.find({
      userId,
      date: { $gte: thirtyDaysAgo }
    });
    
    if (transactions.length > 0) {
      const totalSpent = transactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      const totalIncome = transactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      
      context.financialHealth = {
        totalSpent,
        totalIncome,
        netCashFlow: totalIncome - totalSpent,
        transactionCount: transactions.length
      };
    }

    // Get budget status
    const budgets = await Budget.find({ userId });
    if (budgets.length > 0) {
      const overBudget = budgets.filter(b => b.spent > b.monthlyLimit).length;
      const nearLimit = budgets.filter(b => {
        const percentUsed = (b.spent / b.monthlyLimit) * 100;
        return percentUsed >= b.alertThreshold && b.spent <= b.monthlyLimit;
      }).length;
      
      context.budgetStatus = {
        total: budgets.length,
        overBudget,
        nearLimit
      };
    }

    // Build comprehensive summary
    const summaryParts = [];
    
    if (context.recoveryScore) {
      summaryParts.push(`Recovery: ${context.recoveryScore}/100 (${context.recoveryStatus})`);
    }
    
    if (context.recentWorkouts > 0) {
      summaryParts.push(`${context.recentWorkouts} workouts this week`);
    }
    
    if (context.activeGoals > 0) {
      summaryParts.push(`${context.activeGoals} active goals`);
      if (context.goalsNearCompletion > 0) {
        summaryParts.push(`${context.goalsNearCompletion} close to completion`);
      }
    }
    
    if (context.upcomingEvents > 0) {
      summaryParts.push(`${context.upcomingEvents} events today/tomorrow`);
    }
    
    if (context.budgetStatus && context.budgetStatus.overBudget > 0) {
      summaryParts.push(`⚠️ ${context.budgetStatus.overBudget} budgets exceeded`);
    }
    
    context.summary = summaryParts.join(' | ') || 'Limited data available';

    return context;

  } catch (error) {
    console.error('Build context error:', error);
    return {
      hasWearableData: false,
      recentWorkouts: 0,
      activeGoals: 0,
      summary: 'Unable to load context',
      error: error.message
    };
  }
};

/**
 * Generate AI response using Gemini
 */
exports.generateResponse = async (message, history, context) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    // Build comprehensive system prompt
    const systemPrompt = `You are Phoenix, an advanced AI health and performance coach with deep expertise in fitness, nutrition, recovery, and life optimization. You analyze data from wearables, workouts, goals, calendar, and finances to provide personalized, actionable insights.

Current User Context:
${JSON.stringify(context, null, 2)}

Key Instructions:
- Be conversational, supportive, and data-driven
- Reference specific metrics from the context when relevant
- Provide actionable recommendations based on the data
- Be proactive in identifying concerns (low recovery, overtraining, budget issues)
- If recovery is low (<60), recommend rest or light activity
- If workouts are frequent (5+ this week), acknowledge consistency
- If goals are near completion, provide encouragement
- Keep responses concise but informative (2-4 paragraphs max)
- Use a coaching tone that's motivating but realistic`;

    // Build conversation history for context
    const conversationHistory = history.slice(-10).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.message }]
    }));

    // Start chat with history
    const chat = model.startChat({
      history: conversationHistory,
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.8,
        topP: 0.9,
        topK: 40,
      },
    });

    // Send message with full context
    const prompt = `${systemPrompt}\n\nUser: ${message}`;
    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    
    // Generate follow-up suggestions based on context
    const suggestions = generateSuggestions(context, message);
    
    return {
      message: response.text(),
      contextUsed: {
        recoveryScore: context.recoveryScore,
        recentWorkouts: context.recentWorkouts,
        activeGoals: context.activeGoals,
        dataAvailable: context.hasWearableData
      },
      suggestions
    };

  } catch (error) {
    console.error('Generate response error:', error);
    
    // Fallback response if AI fails
    return {
      message: "I'm having trouble connecting to my AI service right now. However, based on your data: " + 
               generateFallbackResponse(context),
      contextUsed: context,
      suggestions: []
    };
  }
};

/**
 * Generate follow-up suggestions
 */
function generateSuggestions(context, userMessage) {
  const suggestions = [];
  
  // Recovery-based suggestions
  if (context.recoveryScore !== null) {
    if (context.recoveryScore < 60) {
      suggestions.push("What recovery protocols should I do today?");
      suggestions.push("Show me my recovery trends");
    } else if (context.recoveryScore > 80) {
      suggestions.push("What's a good workout for today?");
      suggestions.push("Can I do high-intensity training?");
    }
  }
  
  // Goal-based suggestions
  if (context.goalsNearCompletion > 0) {
    suggestions.push("Which goals am I close to completing?");
  }
  
  if (context.activeGoals === 0) {
    suggestions.push("Help me set a new fitness goal");
  }
  
  // Pattern-based suggestions
  if (context.recentPatterns.length > 0) {
    suggestions.push("What patterns have you found in my data?");
  }
  
  // Calendar suggestions
  if (context.upcomingEvents > 0) {
    suggestions.push("Optimize my schedule for today");
  }
  
  // Budget suggestions
  if (context.budgetStatus && context.budgetStatus.overBudget > 0) {
    suggestions.push("Show me my budget status");
  }
  
  return suggestions.slice(0, 3); // Return top 3
}

/**
 * Generate fallback response if AI unavailable
 */
function generateFallbackResponse(context) {
  const parts = [];
  
  if (context.recoveryScore !== null) {
    if (context.recoveryScore < 60) {
      parts.push(`Your recovery is low (${context.recoveryScore}/100). Consider taking it easy today.`);
    } else if (context.recoveryScore > 80) {
      parts.push(`Your recovery is excellent (${context.recoveryScore}/100) - great day for training!`);
    }
  }
  
  if (context.recentWorkouts > 5) {
    parts.push(`You've been very consistent with ${context.recentWorkouts} workouts this week.`);
  }
  
  if (context.goalsNearCompletion > 0) {
    parts.push(`You have ${context.goalsNearCompletion} goal(s) near completion!`);
  }
  
  return parts.join(' ') || 'Keep up the great work!';
}

/**
 * Get intelligence dashboard
 */
exports.getIntelligenceDashboard = async (userId) => {
  try {
    const context = await this.buildUserContext(userId);
    
    // Get patterns
    const patterns = await CorrelationPattern.find({
      userId,
      isActive: true
    })
      .sort({ 'correlation.strength': -1 })
      .limit(5);

    // Get recovery trend (last 14 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const recoveryScores = await RecoveryScore.find({ 
      userId,
      date: { $gte: fourteenDaysAgo }
    }).sort({ date: 1 });

    // Calculate recovery trend
    let recoveryTrend = 'stable';
    if (recoveryScores.length >= 7) {
      const recent = recoveryScores.slice(-3);
      const older = recoveryScores.slice(0, 3);
      
      const recentAvg = recent.reduce((sum, r) => sum + r.score, 0) / 3;
      const olderAvg = older.reduce((sum, r) => sum + r.score, 0) / 3;
      
      if (recentAvg > olderAvg + 5) recoveryTrend = 'improving';
      else if (recentAvg < olderAvg - 5) recoveryTrend = 'declining';
    }

    // Get workout frequency trend
    const workouts = await Workout.find({
      userId,
      date: { $gte: fourteenDaysAgo }
    });
    
    const week1 = workouts.filter(w => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return w.date >= weekAgo;
    }).length;
    
    const week2 = workouts.length - week1;
    
    const workoutTrend = week1 > week2 ? 'increasing' : week1 < week2 ? 'decreasing' : 'stable';

    const dashboard = {
      overview: {
        recoveryScore: context.recoveryScore,
        recoveryStatus: context.recoveryStatus,
        weeklyWorkouts: context.recentWorkouts,
        activeGoals: context.activeGoals,
        goalsNearCompletion: context.goalsNearCompletion
      },
      trends: {
        recovery: recoveryTrend,
        workouts: workoutTrend,
        hrvTrend: context.trends?.hrv || 'unknown'
      },
      patterns: patterns.map(p => ({
        type: p.patternType,
        strength: p.correlation.strength,
        confidence: p.correlation.confidence,
        description: describePattern(p)
      })),
      recoveryHistory: recoveryScores.map(r => ({
        date: r.date,
        score: r.score,
        status: r.status
      })),
      insights: await this.generateQuickInsights(userId, context),
      alerts: generateAlerts(context, recoveryTrend)
    };

    return dashboard;

  } catch (error) {
    console.error('Get dashboard error:', error);
    throw error;
  }
};

/**
 * Describe pattern in human-readable format
 */
function describePattern(pattern) {
  const descriptions = {
    'workout_recovery': 'Your workout intensity affects next-day recovery',
    'sleep_performance': 'Sleep quality strongly correlates with performance',
    'stress_spending': 'Stress levels influence spending patterns',
    'nutrition_energy': 'Diet quality impacts energy levels',
    'calendar_recovery': 'Meeting load affects recovery',
    'goal_motivation': 'Goal progress influences motivation'
  };
  return descriptions[pattern.patternType] || `${pattern.patternType} pattern detected`;
}

/**
 * Generate alerts based on context
 */
function generateAlerts(context, recoveryTrend) {
  const alerts = [];
  
  // Recovery alerts
  if (context.recoveryScore !== null) {
    if (context.recoveryScore < 50) {
      alerts.push({
        type: 'warning',
        category: 'recovery',
        message: 'Low recovery detected - consider taking a rest day',
        priority: 'high'
      });
    }
    
    if (recoveryTrend === 'declining') {
      alerts.push({
        type: 'warning',
        category: 'recovery',
        message: 'Recovery trending downward - watch for overtraining',
        priority: 'medium'
      });
    }
  }
  
  // Workout alerts
  if (context.recentWorkouts > 6) {
    alerts.push({
      type: 'info',
      category: 'training',
      message: 'High training frequency - ensure adequate recovery',
      priority: 'medium'
    });
  } else if (context.recentWorkouts === 0) {
    alerts.push({
      type: 'info',
      category: 'training',
      message: 'No workouts this week - time to get moving!',
      priority: 'low'
    });
  }
  
  // Budget alerts
  if (context.budgetStatus && context.budgetStatus.overBudget > 0) {
    alerts.push({
      type: 'warning',
      category: 'finance',
      message: `${context.budgetStatus.overBudget} budget(s) exceeded`,
      priority: 'high'
    });
  }
  
  // Goal alerts
  if (context.goalsNearCompletion > 0) {
    alerts.push({
      type: 'success',
      category: 'goals',
      message: `${context.goalsNearCompletion} goal(s) almost complete!`,
      priority: 'medium'
    });
  }
  
  return alerts;
}

/**
 * Run comprehensive analysis
 */
exports.runComprehensiveAnalysis = async (userId, scope, depth) => {
  try {
    const context = await this.buildUserContext(userId);
    
    const analysis = {
      timestamp: new Date(),
      scope,
      depth,
      findings: [],
      recommendations: [],
      score: 0
    };

    // Health analysis
    if (scope === 'all' || scope === 'health') {
      if (context.recoveryScore) {
        analysis.findings.push({
          category: 'health',
          metric: 'recovery',
          value: context.recoveryScore,
          status: context.recoveryScore >= 70 ? 'good' : context.recoveryScore >= 50 ? 'moderate' : 'poor',
          insight: `Current recovery score: ${context.recoveryScore}/100`
        });
        
        if (context.recoveryScore < 60) {
          analysis.recommendations.push({
            category: 'health',
            priority: 'high',
            text: 'Prioritize recovery: Get 8+ hours sleep, reduce training intensity'
          });
        }
      }
      
      if (context.hasWearableData && context.weeklyAverages) {
        analysis.findings.push({
          category: 'health',
          metric: 'hrv',
          value: context.weeklyAverages.hrv,
          trend: context.trends?.hrv || 'stable',
          insight: `Average HRV: ${context.weeklyAverages.hrv}ms (${context.trends?.hrv || 'stable'})`
        });
      }
    }

    // Fitness analysis
    if (scope === 'all' || scope === 'fitness') {
      if (context.workoutStats) {
        analysis.findings.push({
          category: 'fitness',
          metric: 'workout_frequency',
          value: context.recentWorkouts,
          status: context.recentWorkouts >= 3 ? 'good' : 'needs_improvement',
          insight: `${context.recentWorkouts} workouts this week`
        });
        
        if (context.recentWorkouts < 3) {
          analysis.recommendations.push({
            category: 'fitness',
            priority: 'medium',
            text: 'Increase workout frequency to 3-5 sessions per week'
          });
        } else if (context.recentWorkouts > 6 && context.recoveryScore < 70) {
          analysis.recommendations.push({
            category: 'fitness',
            priority: 'high',
            text: 'High training volume with low recovery - consider deload week'
          });
        }
      }
    }

    // Goals analysis
    if (scope === 'all' || scope === 'goals') {
      if (context.activeGoals > 0) {
        analysis.findings.push({
          category: 'goals',
          metric: 'active_goals',
          value: context.activeGoals,
          status: 'tracking',
          insight: `${context.activeGoals} active goals, ${context.goalsNearCompletion || 0} near completion`
        });
        
        if (context.goalsNearCompletion > 0) {
          analysis.recommendations.push({
            category: 'goals',
            priority: 'medium',
            text: `Focus on completing ${context.goalsNearCompletion} goal(s) that are close to finish`
          });
        }
      } else {
        analysis.recommendations.push({
          category: 'goals',
          priority: 'low',
          text: 'Set SMART goals to stay motivated and track progress'
        });
      }
    }

    // Calculate overall score (0-100)
    let scoreComponents = [];
    
    if (context.recoveryScore) scoreComponents.push(context.recoveryScore);
    if (context.recentWorkouts) scoreComponents.push(Math.min(context.recentWorkouts * 15, 100));
    if (context.activeGoals) scoreComponents.push(Math.min(context.activeGoals * 20, 100));
    
    if (scoreComponents.length > 0) {
      analysis.score = Math.round(
        scoreComponents.reduce((sum, s) => sum + s, 0) / scoreComponents.length
      );
    }

    return analysis;

  } catch (error) {
    console.error('Comprehensive analysis error:', error);
    throw error;
  }
};

/**
 * Generate AI insights
 */
exports.generateInsights = async (userId, category, days) => {
  try {
    const context = await this.buildUserContext(userId);
    
    // Use Gemini to generate insights
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Based on this user's health and fitness data, generate 3-5 actionable insights for the ${category || 'overall'} category:

User Data:
${JSON.stringify(context, null, 2)}

Generate insights that are:
1. Specific and data-driven
2. Actionable (user can do something about it)
3. Prioritized (most important first)
4. Relevant to current state

Format: Return a numbered list of insights.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse insights from response
    const insights = text
      .split('\n')
      .filter(line => line.trim().match(/^\d+\./))
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(line => line.length > 0);
    
    return {
      insights: insights.length > 0 ? insights : [
        'Maintain consistent workout schedule',
        'Monitor recovery scores daily',
        'Set specific, measurable goals'
      ],
      generatedAt: new Date(),
      category: category || 'overall',
      dataQuality: context.hasWearableData ? 'high' : 'limited'
    };

  } catch (error) {
    console.error('Generate insights error:', error);
    
    // Fallback insights
    return {
      insights: await this.generateQuickInsights(userId, await this.buildUserContext(userId)),
      generatedAt: new Date(),
      category: category || 'overall',
      dataQuality: 'limited',
      error: 'AI service unavailable'
    };
  }
};

/**
 * Process natural language query
 */
exports.processNaturalLanguageQuery = async (userId, query) => {
  try {
    const context = await this.buildUserContext(userId);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `You are Phoenix, an AI health coach. Answer this user's question based on their data.

User Data:
${JSON.stringify(context, null, 2)}

User Question: ${query}

Provide a helpful, data-driven answer in 2-3 paragraphs. Reference specific metrics when relevant.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return {
      query,
      answer: response.text(),
      contextUsed: {
        hasData: context.hasWearableData,
        dataPoints: {
          recovery: context.recoveryScore !== null,
          workouts: context.recentWorkouts > 0,
          goals: context.activeGoals > 0
        }
      },
      confidence: context.hasWearableData ? 'high' : 'medium'
    };

  } catch (error) {
    console.error('NL query error:', error);
    throw error;
  }
};

/**
 * Generate daily summary
 */
exports.generateDailySummary = async (userId, date) => {
  try {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get day's workouts
    const workouts = await Workout.find({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    // Get day's recovery
    const recovery = await RecoveryScore.findOne({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    // Get day's wearable data
    const wearable = await WearableData.findOne({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    // Get day's calendar events
    const events = await CalendarEvent.find({
      userId,
      startTime: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ startTime: 1 });

    const summary = {
      date: targetDate,
      recovery: recovery ? {
        score: recovery.score,
        status: recovery.status
      } : null,
      workouts: {
        count: workouts.length,
        types: workouts.map(w => w.workoutType),
        totalDuration: workouts.reduce((sum, w) => sum + (w.duration || 0), 0),
        totalVolume: workouts.reduce((sum, w) => sum + (w.totalVolume || 0), 0)
      },
      health: wearable ? {
        steps: wearable.steps,
        hrv: wearable.hrv,
        rhr: wearable.restingHeartRate,
        sleep: wearable.sleepDuration
      } : null,
      calendar: {
        eventsCount: events.length,
        totalMeetingTime: events.reduce((sum, e) => {
          const duration = (e.endTime - e.startTime) / (1000 * 60); // minutes
          return sum + duration;
        }, 0)
      },
      highlights: [],
      recommendations: []
    };

    // Generate highlights
    if (workouts.length > 0) {
      summary.highlights.push(`Completed ${workouts.length} workout(s)`);
    }
    if (recovery && recovery.score >= 80) {
      summary.highlights.push('Excellent recovery');
    }
    if (wearable && wearable.steps >= 10000) {
      summary.highlights.push('Hit 10K+ steps');
    }

    // Generate recommendations
    if (workouts.length === 0 && recovery && recovery.score >= 70) {
      summary.recommendations.push('Good recovery - consider training today');
    }
    if (recovery && recovery.score < 60) {
      summary.recommendations.push('Low recovery - prioritize rest');
    }

    return summary;

  } catch (error) {
    console.error('Generate summary error:', error);
    throw error;
  }
};

/**
 * Perform deep dive analysis
 */
exports.performDeepDive = async (userId, topic, timeframe) => {
  try {
    const context = await this.buildUserContext(userId);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Perform a deep dive analysis on "${topic}" for this user over ${timeframe}.

User Context:
${JSON.stringify(context, null, 2)}

Provide:
1. KEY FINDINGS (3-5 specific observations from the data)
2. TRENDS (what's improving, declining, or stable)
3. CORRELATIONS (relationships between different metrics)
4. ACTIONABLE RECOMMENDATIONS (specific steps to take)

Be specific, data-driven, and actionable.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return {
      topic,
      timeframe,
      analysis: response.text(),
      generatedAt: new Date(),
      dataQuality: context.hasWearableData ? 'comprehensive' : 'limited'
    };

  } catch (error) {
    console.error('Deep dive error:', error);
    throw error;
  }
};

/**
 * Generate recommendations
 */
exports.generateRecommendations = async (userId, category, limit) => {
  try {
    const context = await this.buildUserContext(userId);
    const recommendations = [];

    // Recovery-based recommendations
    if (context.recoveryScore !== null) {
      if (context.recoveryScore < 60) {
        recommendations.push({
          category: 'recovery',
          priority: 'high',
          title: 'Prioritize Recovery',
          description: `Your recovery is low (${context.recoveryScore}/100). Consider rest day or light activity.`,
          action: 'rest',
          impact: 'high'
        });
      } else if (context.recoveryScore > 85) {
        recommendations.push({
          category: 'training',
          priority: 'medium',
          title: 'Optimal Training Window',
          description: `Excellent recovery (${context.recoveryScore}/100) - great day for high-intensity training.`,
          action: 'train_hard',
          impact: 'high'
        });
      }
    }

    // Workout frequency recommendations
    if (context.recentWorkouts < 3) {
      recommendations.push({
        category: 'fitness',
        priority: 'medium',
        title: 'Increase Training Frequency',
        description: `Only ${context.recentWorkouts} workout(s) this week. Aim for 3-5 sessions.`,
        action: 'schedule_workout',
        impact: 'medium'
      });
    } else if (context.recentWorkouts > 6 && context.recoveryScore < 70) {
      recommendations.push({
        category: 'recovery',
        priority: 'high',
        title: 'Risk of Overtraining',
        description: `High volume (${context.recentWorkouts} workouts) with low recovery. Consider deload.`,
        action: 'reduce_volume',
        impact: 'high'
      });
    }

    // Goal recommendations
    if (context.activeGoals === 0) {
      recommendations.push({
        category: 'goals',
        priority: 'low',
        title: 'Set New Goals',
        description: 'Setting SMART goals can increase motivation and progress tracking.',
        action: 'create_goal',
        impact: 'medium'
      });
    } else if (context.goalsNearCompletion > 0) {
      recommendations.push({
        category: 'goals',
        priority: 'medium',
        title: 'Complete Your Goals',
        description: `${context.goalsNearCompletion} goal(s) are 80%+ complete. Push to finish!`,
        action: 'complete_goals',
        impact: 'medium'
      });
    }

    // HRV trend recommendations
    if (context.trends?.hrv === 'declining') {
      recommendations.push({
        category: 'health',
        priority: 'high',
        title: 'Declining HRV Detected',
        description: 'HRV trending down may indicate accumulated fatigue or stress.',
        action: 'monitor_stress',
        impact: 'high'
      });
    }

    // Budget recommendations
    if (context.budgetStatus && context.budgetStatus.overBudget > 0) {
      recommendations.push({
        category: 'finance',
        priority: 'high',
        title: 'Budget Exceeded',
        description: `${context.budgetStatus.overBudget} budget category(s) exceeded this month.`,
        action: 'review_spending',
        impact: 'high'
      });
    }

    // Calendar recommendations
    if (context.upcomingEvents > 5) {
      recommendations.push({
        category: 'productivity',
        priority: 'medium',
        title: 'High Meeting Load',
        description: `${context.upcomingEvents} upcoming events. Protect focus time.`,
        action: 'optimize_calendar',
        impact: 'medium'
      });
    }

    // Filter by category if specified
    let filtered = recommendations;
    if (category && category !== 'all') {
      filtered = recommendations.filter(r => r.category === category);
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return filtered.slice(0, limit);

  } catch (error) {
    console.error('Generate recommendations error:', error);
    return [];
  }
};

/**
 * Auto-optimize settings
 */
exports.autoOptimizeSettings = async (userId, targets) => {
  try {
    const context = await this.buildUserContext(userId);
    
    const optimizations = {
      applied: [],
      recommendations: [],
      score: 0
    };

    // Recovery-based optimization
    if (context.recoveryScore < 70) {
      optimizations.recommendations.push({
        setting: 'workout_intensity',
        currentValue: 'normal',
        recommendedValue: 'reduced',
        reason: `Low recovery (${context.recoveryScore}/100)`,
        impact: 'Reduce injury risk, improve recovery'
      });
    }

    // Volume optimization
    if (context.recentWorkouts > 6) {
      optimizations.recommendations.push({
        setting: 'weekly_volume',
        currentValue: context.recentWorkouts,
        recommendedValue: '4-5',
        reason: 'High training frequency detected',
        impact: 'Better recovery, reduced overtraining risk'
      });
    }

    // Sleep optimization
    if (context.weeklyAverages && context.weeklyAverages.sleep < 7 * 60) {
      optimizations.recommendations.push({
        setting: 'sleep_target',
        currentValue: `${Math.round(context.weeklyAverages.sleep / 60)} hours`,
        recommendedValue: '8 hours',
        reason: 'Below optimal sleep duration',
        impact: 'Improved recovery, better performance'
      });
    }

    // Calculate optimization score
    const issues = optimizations.recommendations.length;
    optimizations.score = Math.max(0, 100 - (issues * 20));

    return optimizations;

  } catch (error) {
    console.error('Auto-optimize error:', error);
    throw error;
  }
};

/**
 * Generate quick insights (helper)
 */
exports.generateQuickInsights = async (userId, context) => {
  const insights = [];

  // Recovery insights
  if (context.recoveryScore !== null) {
    if (context.recoveryScore > 80) {
      insights.push('Your recovery is excellent - great day for intense training!');
    } else if (context.recoveryScore < 60) {
      insights.push('Recovery is low - consider active recovery or rest.');
    } else {
      insights.push('Moderate recovery - good for moderate intensity training.');
    }
  }

  // Workout consistency insights
  if (context.recentWorkouts >= 5) {
    insights.push(`Excellent consistency with ${context.recentWorkouts} workouts this week!`);
  } else if (context.recentWorkouts === 0) {
    insights.push('Time to get moving - schedule a workout today!');
  }

  // Goal insights
  if (context.goalsNearCompletion > 0) {
    insights.push(`${context.goalsNearCompletion} goal(s) are almost complete - keep pushing!`);
  }

  // HRV insights
  if (context.trends?.hrv === 'improving') {
    insights.push('HRV is improving - sign of good adaptation!');
  } else if (context.trends?.hrv === 'declining') {
    insights.push('HRV declining - watch for fatigue accumulation.');
  }

  // Pattern insights
  if (context.recentPatterns.length > 0) {
    const strongPattern = context.recentPatterns[0];
    if (strongPattern.strength > 0.7) {
      insights.push(`Strong pattern detected: ${strongPattern.type}`);
    }
  }

  // Financial insights
  if (context.budgetStatus && context.budgetStatus.nearLimit > 0) {
    insights.push(`${context.budgetStatus.nearLimit} budget(s) approaching limit.`);
  }

  return insights.slice(0, 5); // Return top 5 insights
};

module.exports = exports;
