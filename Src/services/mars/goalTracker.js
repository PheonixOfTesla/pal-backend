/**
 * GOAL TRACKER SERVICE
 * 
 * Mars System - Goal Management Logic
 * File: Src/services/mars/goalTracker.js
 * 
 * Handles goal progress calculations, trends, velocity, and bottleneck analysis
 */

const Goal = require('../../models/mars/Goal');

/**
 * Generate milestones for a goal
 * @param {Object} goal - Goal document
 * @returns {Array} Array of milestone objects
 */
const generateMilestones = async (goal) => {
  if (!goal.targetValue || !goal.targetDate) {
    return [];
  }

  const milestones = [];
  const totalValue = goal.targetValue - goal.currentValue;
  const milestoneCount = 4; // 25%, 50%, 75%, 100%

  for (let i = 1; i <= milestoneCount; i++) {
    const percentage = (i / milestoneCount) * 100;
    const targetValue = goal.currentValue + (totalValue * (i / milestoneCount));
    
    milestones.push({
      title: `${percentage}% Complete`,
      targetValue: Math.round(targetValue),
      completed: false
    });
  }

  return milestones;
};

/**
 * Calculate goal trend
 * @param {String} goalId - Goal ID
 * @returns {String} Trend status
 */
const calculateTrend = async (goalId) => {
  const goal = await Goal.findById(goalId);
  
  if (!goal || !goal.targetDate) {
    return 'unknown';
  }

  const now = new Date();
  const startDate = goal.startDate || goal.createdAt;
  const targetDate = new Date(goal.targetDate);
  
  // Calculate time elapsed and remaining
  const totalTime = targetDate - startDate;
  const timeElapsed = now - startDate;
  const timeRemaining = targetDate - now;
  
  // Calculate expected vs actual progress
  const expectedProgress = (timeElapsed / totalTime) * 100;
  const actualProgress = goal.progress || 0;
  
  // Determine trend
  if (actualProgress >= expectedProgress + 10) {
    return 'ahead';
  } else if (actualProgress <= expectedProgress - 10) {
    return 'behind';
  } else {
    return 'on-track';
  }
};

/**
 * Project goal completion date
 * @param {String} goalId - Goal ID
 * @returns {Object} Projection data
 */
const projectCompletion = async (goalId) => {
  const goal = await Goal.findById(goalId);
  
  if (!goal) {
    throw new Error('Goal not found');
  }

  const now = new Date();
  const startDate = goal.startDate || goal.createdAt;
  const progressRate = goal.progressRate || 0;
  
  if (progressRate <= 0) {
    return {
      estimatedDate: null,
      daysRemaining: null,
      onTrack: false,
      message: 'No progress detected yet'
    };
  }

  // Calculate days needed to complete
  const progressRemaining = 100 - (goal.progress || 0);
  const daysNeeded = Math.ceil(progressRemaining / progressRate);
  
  // Calculate estimated completion date
  const estimatedDate = new Date(now);
  estimatedDate.setDate(estimatedDate.getDate() + daysNeeded);
  
  // Check if on track
  const onTrack = goal.targetDate ? estimatedDate <= new Date(goal.targetDate) : true;
  
  return {
    estimatedDate,
    daysRemaining: daysNeeded,
    onTrack,
    message: onTrack 
      ? 'You are on track to meet your goal!' 
      : 'You may need to increase your pace to meet your deadline.'
  };
};

/**
 * Calculate progress velocity
 * @param {String} goalId - Goal ID
 * @returns {Object} Velocity data
 */
const calculateVelocity = async (goalId) => {
  const goal = await Goal.findById(goalId);
  
  if (!goal) {
    throw new Error('Goal not found');
  }

  const now = new Date();
  const startDate = goal.startDate || goal.createdAt;
  const daysElapsed = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
  
  // Calculate velocity
  const progressMade = goal.progress || 0;
  const dailyVelocity = progressMade / daysElapsed;
  const weeklyVelocity = dailyVelocity * 7;
  
  // Determine trend
  let trend = 'steady';
  if (dailyVelocity > 2) trend = 'accelerating';
  if (dailyVelocity < 0.5) trend = 'decelerating';
  
  // Forecast completion
  const progressRemaining = 100 - progressMade;
  const daysToCompletion = dailyVelocity > 0 
    ? Math.ceil(progressRemaining / dailyVelocity) 
    : null;
  
  return {
    dailyVelocity: dailyVelocity.toFixed(2),
    weeklyVelocity: weeklyVelocity.toFixed(2),
    trend,
    forecast: daysToCompletion 
      ? `${daysToCompletion} days to completion at current pace` 
      : 'Unable to forecast completion',
    recommendation: dailyVelocity < 1 
      ? 'Consider increasing your daily progress to stay on track' 
      : 'Great pace! Keep it up!'
  };
};

/**
 * Analyze goal bottlenecks
 * @param {String} goalId - Goal ID
 * @returns {Object} Bottleneck analysis
 */
const analyzeBottlenecks = async (goalId) => {
  const goal = await Goal.findById(goalId);
  
  if (!goal) {
    throw new Error('Goal not found');
  }

  const bottlenecks = [];
  const recommendations = [];
  
  // Check for stalled progress
  if (goal.progress < 10 && goal.createdAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
    bottlenecks.push({
      issue: 'Low initial progress',
      impact: 'high',
      solution: 'Break down the goal into smaller, actionable steps'
    });
    recommendations.push('Start with just one small action today');
  }
  
  // Check for incomplete milestones
  const incompleteMilestones = goal.milestones.filter(m => !m.completed);
  if (incompleteMilestones.length > 0) {
    bottlenecks.push({
      issue: `${incompleteMilestones.length} milestones pending`,
      impact: 'medium',
      solution: 'Focus on completing the next milestone'
    });
    recommendations.push(`Next milestone: ${incompleteMilestones[0].title}`);
  }
  
  // Check for broken habit streaks
  const brokenHabits = goal.habits.filter(h => h.streak === 0);
  if (brokenHabits.length > 0) {
    bottlenecks.push({
      issue: 'Habit streaks broken',
      impact: 'high',
      solution: 'Restart habit tracking with accountability'
    });
    recommendations.push('Set daily reminders for habit completion');
  }
  
  // Check for approaching deadline with low progress
  if (goal.targetDate) {
    const daysUntilDeadline = Math.ceil((new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntilDeadline < 30 && goal.progress < 50) {
      bottlenecks.push({
        issue: 'Deadline approaching with low progress',
        impact: 'critical',
        solution: 'Consider adjusting timeline or increasing effort'
      });
      recommendations.push('Review and adjust your action plan');
    }
  }
  
  // If no bottlenecks found
  if (bottlenecks.length === 0) {
    return {
      bottlenecks: [],
      recommendations: ['Keep up the great work!'],
      interventions: []
    };
  }
  
  return {
    bottlenecks,
    recommendations,
    interventions: bottlenecks.filter(b => b.impact === 'critical' || b.impact === 'high')
  };
};

/**
 * Get goal insights
 * @param {String} goalId - Goal ID
 * @returns {Object} Comprehensive insights
 */
const getGoalInsights = async (goalId) => {
  const goal = await Goal.findById(goalId);
  
  if (!goal) {
    throw new Error('Goal not found');
  }

  const trend = await calculateTrend(goalId);
  const velocity = await calculateVelocity(goalId);
  const projection = await projectCompletion(goalId);
  const bottlenecks = await analyzeBottlenecks(goalId);

  return {
    trend,
    velocity,
    projection,
    bottlenecks: bottlenecks.bottlenecks,
    recommendations: bottlenecks.recommendations,
    summary: generateInsightSummary(trend, velocity, projection)
  };
};

/**
 * Generate insight summary
 * @param {String} trend - Trend status
 * @param {Object} velocity - Velocity data
 * @param {Object} projection - Projection data
 * @returns {String} Summary message
 */
const generateInsightSummary = (trend, velocity, projection) => {
  if (trend === 'ahead') {
    return `Great progress! You're ahead of schedule with a ${velocity.weeklyVelocity}% weekly velocity.`;
  } else if (trend === 'behind') {
    return `You're falling behind. Consider increasing your pace to ${velocity.weeklyVelocity * 1.5}% per week.`;
  } else {
    return `You're on track! ${projection.daysRemaining} days remaining at current pace.`;
  }
};

module.exports = {
  generateMilestones,
  calculateTrend,
  projectCompletion,
  calculateVelocity,
  analyzeBottlenecks,
  getGoalInsights
};
