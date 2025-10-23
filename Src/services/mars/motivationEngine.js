/**
 * MOTIVATION ENGINE SERVICE
 * 
 * Mars System - Motivational Interventions
 * File: Src/services/mars/motivationEngine.js
 * 
 * Generates personalized motivational messages and interventions
 */

const Goal = require('../models/Goal');
const User = require('../models/User');

/**
 * Generate celebration message when goal is completed
 * @param {Object} goal - Completed goal document
 * @returns {Object} Celebration message
 */
const generateCelebration = async (goal) => {
  const completionTime = goal.createdAt 
    ? Math.ceil((Date.now() - new Date(goal.createdAt)) / (1000 * 60 * 60 * 24))
    : 0;

  const messages = [
    `🎉 Incredible! You crushed "${goal.title}" in ${completionTime} days!`,
    `🏆 Victory! ${goal.title} is COMPLETE! You're unstoppable!`,
    `⭐ Amazing work! You just proved you can achieve anything you set your mind to!`,
    `🚀 Goal destroyed! ${goal.title} - DONE. What's next, champion?`,
    `💪 You did it! "${goal.title}" conquered. Time to celebrate this win!`
  ];

  const message = messages[Math.floor(Math.random() * messages.length)];

  const achievements = [
    'Demonstrated commitment and consistency',
    'Overcame challenges and stayed focused',
    'Proved your capability to achieve difficult goals',
    'Built momentum for future success'
  ];

  const suggestions = [
    'Set a new, more ambitious goal',
    'Take a moment to reflect on what you learned',
    'Celebrate this win - you earned it!',
    'Share your success with someone who inspired you'
  ];

  return {
    message,
    achievements,
    suggestions,
    motivationType: 'celebration',
    intensity: 'high'
  };
};

/**
 * Generate habit motivation message
 * @param {Object} habit - Habit document or object
 * @param {Object} goal - Parent goal document
 * @returns {Object} Motivation message
 */
const generateHabitMotivation = async (habit, goal) => {
  const streak = habit.streak || 0;

  let message, encouragement, tips;

  if (streak === 0) {
    // Streak broken or just starting
    message = `🔥 Starting fresh with "${habit.title}"! Today is day 1 of your new streak.`;
    encouragement = "Every expert was once a beginner. You've got this!";
    tips = [
      'Set a specific time for this habit',
      'Link it to an existing routine',
      'Start small - consistency beats intensity'
    ];
  } else if (streak === 1) {
    message = `✨ Day 1 complete! "${habit.title}" is becoming a part of your routine.`;
    encouragement = "The first step is always the hardest. Keep going!";
    tips = [
      'Do it again tomorrow at the same time',
      'Tell someone about your new habit',
      'Prepare everything you need tonight'
    ];
  } else if (streak < 7) {
    message = `🔥 ${streak} day streak! "${habit.title}" is building momentum!`;
    encouragement = "You're in the critical formation phase. Don't break the chain!";
    tips = [
      'Track your streak visually',
      'Reward yourself after 7 days',
      'Notice how you feel when you complete it'
    ];
  } else if (streak < 21) {
    message = `💪 ${streak} days strong! "${habit.title}" is becoming automatic!`;
    encouragement = "You're past the hardest part. The habit is forming!";
    tips = [
      'Increase the difficulty slightly',
      'Stack another micro-habit onto this one',
      'Share your progress with accountability partner'
    ];
  } else if (streak < 66) {
    message = `🚀 ${streak} day streak! "${habit.title}" is part of who you are now!`;
    encouragement = "Research shows 66 days forms a habit. You're almost there!";
    tips = [
      'Reflect on how far you\'ve come',
      'Plan for obstacles that could break your streak',
      'Consider adding a related habit'
    ];
  } else {
    message = `🏆 ${streak} days! "${habit.title}" is MASTERED! You're an inspiration!`;
    encouragement = "This is legendary consistency. You've proven you can do anything!";
    tips = [
      'Help someone else build this habit',
      'Document your process for future reference',
      'Set an even bigger challenge'
    ];
  }

  return {
    message,
    encouragement,
    tips,
    streak,
    milestone: getStreakMilestone(streak)
  };
};

/**
 * Get streak milestone
 */
const getStreakMilestone = (streak) => {
  if (streak === 1) return 'First Day! 🌱';
  if (streak === 3) return '3-Day Streak! 🔥';
  if (streak === 7) return 'One Week! ⭐';
  if (streak === 14) return 'Two Weeks! 💪';
  if (streak === 21) return 'Habit Forming! 🚀';
  if (streak === 30) return 'One Month! 🏆';
  if (streak === 66) return 'Habit Mastered! 👑';
  if (streak === 100) return 'Century Club! 💯';
  return null;
};

/**
 * Get motivational interventions for user
 * @param {String} userId - User ID
 * @returns {Object} Interventions data
 */
const getInterventions = async (userId) => {
  const goals = await Goal.find({ 
    userId, 
    status: 'active' 
  }).sort('-createdAt');

  const interventions = [];
  const upcoming = [];
  const history = [];

  for (const goal of goals) {
    // Check for stagnant goals
    if (goal.progress < 10 && isOlderThan(goal.createdAt, 14)) {
      interventions.push({
        type: 'stagnant_goal',
        goalId: goal._id,
        title: goal.title,
        message: `"${goal.title}" hasn't made much progress. Let's break it down!`,
        action: 'Break into smaller milestones',
        priority: 'high',
        createdAt: new Date()
      });
    }

    // Check for approaching deadlines
    if (goal.targetDate && isWithinDays(goal.targetDate, 7) && goal.progress < 90) {
      interventions.push({
        type: 'deadline_approaching',
        goalId: goal._id,
        title: goal.title,
        message: `"${goal.title}" deadline is in ${getDaysUntil(goal.targetDate)} days!`,
        action: 'Increase daily progress',
        priority: 'critical',
        createdAt: new Date()
      });
    }

    // Check for broken habit streaks
    for (const habit of goal.habits) {
      if (habit.streak === 0 && habit.lastCompleted && isOlderThan(habit.lastCompleted, 3)) {
        interventions.push({
          type: 'broken_streak',
          goalId: goal._id,
          habitTitle: habit.title,
          message: `Your "${habit.title}" streak was broken. Restart today!`,
          action: 'Log habit completion',
          priority: 'medium',
          createdAt: new Date()
        });
      }
    }

    // Schedule upcoming encouragement
    if (goal.progress >= 25 && goal.progress < 30) {
      upcoming.push({
        type: 'milestone_approaching',
        goalId: goal._id,
        title: goal.title,
        message: `You're approaching 30% completion on "${goal.title}"!`,
        scheduledFor: getNextMotivationDate()
      });
    }
  }

  return {
    interventions: interventions.sort((a, b) => 
      priorityWeight(b.priority) - priorityWeight(a.priority)
    ),
    upcoming,
    history: [] // Could store past interventions in database
  };
};

/**
 * Generate motivation boost
 * @param {String} userId - User ID
 * @param {Object} data - { goalId, reason }
 * @returns {Object} Motivation boost
 */
const generateBoost = async (userId, data) => {
  const { goalId, reason } = data;

  let goal;
  if (goalId) {
    goal = await Goal.findById(goalId);
    if (!goal || goal.userId.toString() !== userId) {
      throw new Error('Goal not found');
    }
  }

  let message, action, resources;

  switch (reason) {
    case 'struggling':
      message = goal 
        ? `I see you're working hard on "${goal.title}". Remember, struggle is growth in disguise. Every challenge you face is making you stronger.`
        : "Struggling is a sign you're pushing your limits. That's where real growth happens. Take it one day at a time.";
      
      action = 'Break your goal into the smallest possible next step';
      resources = [
        'Consider finding an accountability partner',
        'Review and adjust your approach',
        'Take a short break and come back refreshed'
      ];
      break;

    case 'celebrating':
      message = goal
        ? `🎉 You're making amazing progress on "${goal.title}"! ${goal.progress}% complete - that's incredible dedication!`
        : "🎉 Time to celebrate your wins! Recognizing progress fuels more progress. You're doing great!";
      
      action = 'Take a moment to feel proud of how far you\'ve come';
      resources = [
        'Share your win with someone who matters',
        'Reflect on what strategies worked best',
        'Set your sights on the next milestone'
      ];
      break;

    case 'milestone':
      message = goal
        ? `🏆 Milestone achieved on "${goal.title}"! You just proved you can do this. Keep that momentum going!`
        : "🏆 Milestone reached! This is proof of your commitment and capability. What's your next target?";
      
      action = 'Update your goal progress and plan the next milestone';
      resources = [
        'Review what got you here',
        'Adjust your strategy if needed',
        'Set a reward for the next milestone'
      ];
      break;

    default:
      message = "You've got this! Every small step forward is progress. Stay consistent and trust the process.";
      action = 'Focus on today\'s actions';
      resources = [
        'Review your goals',
        'Track your progress',
        'Stay committed to your plan'
      ];
  }

  return {
    message,
    action,
    resources,
    timestamp: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  };
};

// Helper functions

const isOlderThan = (date, days) => {
  const daysSince = (Date.now() - new Date(date)) / (1000 * 60 * 60 * 24);
  return daysSince > days;
};

const isWithinDays = (date, days) => {
  const daysUntil = (new Date(date) - Date.now()) / (1000 * 60 * 60 * 24);
  return daysUntil <= days && daysUntil >= 0;
};

const getDaysUntil = (date) => {
  return Math.ceil((new Date(date) - Date.now()) / (1000 * 60 * 60 * 24));
};

const getNextMotivationDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return date;
};

const priorityWeight = (priority) => {
  const weights = { critical: 4, high: 3, medium: 2, low: 1 };
  return weights[priority] || 0;
};

module.exports = {
  generateCelebration,
  generateHabitMotivation,
  getInterventions,
  generateBoost
};
