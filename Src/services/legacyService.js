/**
 * 🪐 LEGACY SERVICE
 * Helper functions for legacy planning and quarterly reviews
 * 
 * Saturn System
 */

const LegacyVision = require('../../models/LegacyVision');
const QuarterlyReview = require('../../models/QuarterlyReview');

/**
 * Get motivational message based on days remaining
 * @param {Number} daysRemaining - Days until estimated death date
 * @returns {String} Motivational message
 */
exports.getMotivationalMessage = (daysRemaining) => {
  if (daysRemaining <= 0) {
    return "Every moment is precious. Live fully today.";
  }
  
  if (daysRemaining < 365) {
    return "Time is precious. Focus on what truly matters.";
  }
  
  if (daysRemaining < 3650) { // < 10 years
    return "Make every year count. Your legacy is being written now.";
  }
  
  if (daysRemaining < 7300) { // < 20 years
    return "You have time, but not unlimited time. Act with purpose.";
  }
  
  if (daysRemaining < 14600) { // < 40 years
    return "Build the life you want to look back on with pride.";
  }
  
  return "You have the gift of time. Use it wisely.";
};

/**
 * Calculate life percentage lived
 * @param {Number} age - Current age
 * @param {Date} deathDate - Estimated death date
 * @returns {Object} Life percentage data
 */
exports.calculateLifePercentage = (age, deathDate) => {
  if (!age || !deathDate) return null;
  
  const now = new Date();
  const death = new Date(deathDate);
  const birthYear = now.getFullYear() - age;
  const lifeExpectancy = death.getFullYear() - birthYear;
  const percentageLived = ((age / lifeExpectancy) * 100).toFixed(2);
  
  return {
    percentageLived: parseFloat(percentageLived),
    percentageRemaining: parseFloat((100 - percentageLived).toFixed(2)),
    lifeExpectancy,
    visualization: generateLifeBar(parseFloat(percentageLived))
  };
};

/**
 * Generate visual life bar
 * @param {Number} percentage - Percentage of life lived
 * @returns {String} ASCII life bar
 */
function generateLifeBar(percentage) {
  const filled = Math.round(percentage / 2); // 50 chars max
  const empty = 50 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${percentage}%`;
}

/**
 * Generate insights by comparing two quarterly reviews
 * @param {Object} review1 - First quarterly review
 * @param {Object} review2 - Second quarterly review
 * @returns {Array} Array of insight strings
 */
exports.generateComparisonInsights = (review1, review2) => {
  const insights = [];
  
  // Overall satisfaction comparison
  const satisfactionDiff = review2.overallSatisfaction - review1.overallSatisfaction;
  if (satisfactionDiff > 2) {
    insights.push(`🎉 Significant improvement in overall satisfaction (+${satisfactionDiff} points)`);
  } else if (satisfactionDiff < -2) {
    insights.push(`⚠️ Notable decline in overall satisfaction (${satisfactionDiff} points)`);
  } else if (Math.abs(satisfactionDiff) <= 0.5) {
    insights.push(`➡️ Overall satisfaction remained stable`);
  }
  
  // Life area analysis
  const areas = Object.keys(review1.lifeAreaScores);
  let biggestImprovement = { area: null, diff: -Infinity };
  let biggestDecline = { area: null, diff: Infinity };
  
  areas.forEach(area => {
    const diff = review2.lifeAreaScores[area] - review1.lifeAreaScores[area];
    if (diff > biggestImprovement.diff) {
      biggestImprovement = { area, diff };
    }
    if (diff < biggestDecline.diff) {
      biggestDecline = { area, diff };
    }
  });
  
  if (biggestImprovement.diff > 0) {
    insights.push(`📈 Biggest improvement: ${biggestImprovement.area} (+${biggestImprovement.diff})`);
  }
  
  if (biggestDecline.diff < 0) {
    insights.push(`📉 Area needing attention: ${biggestDecline.area} (${biggestDecline.diff})`);
  }
  
  // Wins comparison
  if (review2.winsThisQuarter.length > review1.winsThisQuarter.length) {
    insights.push(`✨ More wins this quarter (${review2.winsThisQuarter.length} vs ${review1.winsThisQuarter.length})`);
  }
  
  // Gratitude comparison
  if (review2.gratefulFor.length > review1.gratefulFor.length) {
    insights.push(`🙏 More gratitude expressed this quarter`);
  }
  
  return insights;
};

/**
 * Calculate legacy goal urgency score
 * @param {Object} goal - Legacy goal object
 * @returns {Number} Urgency score (0-100)
 */
exports.calculateGoalUrgency = (goal) => {
  let urgency = 0;
  
  // Importance factor (0-50 points)
  urgency += goal.importance * 10;
  
  // Progress factor (inverse - less progress = more urgent)
  urgency += (100 - goal.progress) * 0.3;
  
  // Deadline factor
  if (goal.deadline) {
    const daysUntilDeadline = Math.floor((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntilDeadline < 0) {
      urgency += 20; // Overdue
    } else if (daysUntilDeadline < 90) {
      urgency += 15; // Very soon
    } else if (daysUntilDeadline < 365) {
      urgency += 10; // This year
    }
  }
  
  return Math.min(100, Math.round(urgency));
};

/**
 * Generate legacy vision suggestions based on life areas
 * @param {Array} lifeAreas - Array of life area objects
 * @returns {Array} Array of suggestion strings
 */
exports.generateVisionSuggestions = (lifeAreas) => {
  const suggestions = [];
  
  lifeAreas.forEach(area => {
    const gap = area.targetScore - area.currentScore;
    
    if (gap > 3) {
      suggestions.push({
        area: area.area,
        severity: 'high',
        message: `${area.area} needs significant focus (${gap} point gap)`,
        recommendations: getAreaRecommendations(area.area, gap)
      });
    } else if (gap > 1) {
      suggestions.push({
        area: area.area,
        severity: 'medium',
        message: `${area.area} has room for improvement`,
        recommendations: getAreaRecommendations(area.area, gap)
      });
    } else if (area.currentScore >= area.targetScore) {
      suggestions.push({
        area: area.area,
        severity: 'positive',
        message: `${area.area} is on track! Keep up the great work.`,
        recommendations: [`Maintain current habits in ${area.area}`]
      });
    }
  });
  
  return suggestions;
};

/**
 * Get area-specific recommendations
 * @param {String} area - Life area
 * @param {Number} gap - Score gap
 * @returns {Array} Array of recommendations
 */
function getAreaRecommendations(area, gap) {
  const recommendations = {
    health: [
      'Schedule regular health checkups',
      'Establish consistent exercise routine',
      'Optimize sleep and recovery',
      'Focus on nutrition and hydration'
    ],
    wealth: [
      'Review and optimize budget',
      'Increase savings rate',
      'Explore additional income streams',
      'Invest in financial education'
    ],
    relationships: [
      'Schedule quality time with loved ones',
      'Practice active listening',
      'Express gratitude regularly',
      'Resolve pending conflicts'
    ],
    career: [
      'Set clear career goals',
      'Develop key skills',
      'Seek mentorship',
      'Build professional network'
    ],
    impact: [
      'Define your mission',
      'Start volunteering or mentoring',
      'Share your knowledge',
      'Support causes you believe in'
    ],
    learning: [
      'Set learning goals',
      'Read regularly',
      'Take courses or workshops',
      'Apply new knowledge practically'
    ],
    recreation: [
      'Schedule regular leisure time',
      'Try new hobbies',
      'Plan adventures or travel',
      'Practice work-life balance'
    ]
  };
  
  return recommendations[area] || ['Focus on intentional improvement'];
}

/**
 * Calculate life balance score
 * @param {Object} lifeAreaScores - Life area scores object
 * @returns {Object} Balance analysis
 */
exports.calculateLifeBalance = (lifeAreaScores) => {
  if (!lifeAreaScores) return null;
  
  const scores = Object.values(lifeAreaScores);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
  // Calculate standard deviation
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  
  // Balance score (lower std dev = more balanced)
  const balanceScore = Math.max(0, 100 - (stdDev * 15));
  
  let balanceLevel;
  if (balanceScore >= 80) balanceLevel = 'excellent';
  else if (balanceScore >= 60) balanceLevel = 'good';
  else if (balanceScore >= 40) balanceLevel = 'moderate';
  else balanceLevel = 'needs improvement';
  
  return {
    balanceScore: Math.round(balanceScore),
    balanceLevel,
    standardDeviation: stdDev.toFixed(2),
    average: average.toFixed(1),
    recommendation: balanceScore < 60 
      ? 'Focus on bringing underperforming areas up to match your strengths'
      : 'Good balance! Continue maintaining all areas'
  };
};

/**
 * Generate quarterly review prompts
 * @returns {Object} Review prompts
 */
exports.getQuarterlyReviewPrompts = () => {
  return {
    wins: [
      'What are you most proud of this quarter?',
      'What goals did you achieve?',
      'What unexpected positive outcomes occurred?',
      'Who did you help or positively impact?'
    ],
    lessons: [
      'What were your biggest challenges?',
      'What did you learn about yourself?',
      'What would you do differently?',
      'What patterns did you notice?'
    ],
    improvement: [
      'What areas need more attention?',
      'What habits should you develop?',
      'What should you stop doing?',
      'What resources or support do you need?'
    ],
    focus: [
      'What are your top 3 priorities next quarter?',
      'What big goals do you want to achieve?',
      'What new skills do you want to develop?',
      'How will you measure success?'
    ],
    gratitude: [
      'Who are you grateful for?',
      'What opportunities are you thankful for?',
      'What positive changes occurred?',
      'What do you appreciate about your current situation?'
    ]
  };
};

/**
 * Analyze vision-reality gap
 * @param {Object} vision - Legacy vision
 * @param {Object} latestReview - Latest quarterly review
 * @returns {Object} Gap analysis
 */
exports.analyzeVisionRealityGap = (vision, latestReview) => {
  if (!vision || !latestReview) return null;
  
  const gaps = [];
  
  // Compare life areas if both have them
  if (vision.lifeAreas && latestReview.lifeAreaScores) {
    vision.lifeAreas.forEach(visionArea => {
      const reviewScore = latestReview.lifeAreaScores[visionArea.area];
      if (reviewScore !== undefined) {
        const gap = visionArea.targetScore - reviewScore;
        if (gap > 0) {
          gaps.push({
            area: visionArea.area,
            target: visionArea.targetScore,
            current: reviewScore,
            gap,
            percentageOfTarget: ((reviewScore / visionArea.targetScore) * 100).toFixed(1)
          });
        }
      }
    });
  }
  
  // Sort by gap size (largest first)
  gaps.sort((a, b) => b.gap - a.gap);
  
  return {
    gaps,
    biggestGap: gaps[0] || null,
    averageGap: gaps.length > 0 
      ? (gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length).toFixed(1)
      : 0,
    areasOnTrack: vision.lifeAreas.filter(a => {
      const reviewScore = latestReview.lifeAreaScores[a.area];
      return reviewScore >= a.targetScore;
    }).map(a => a.area)
  };
};

module.exports = exports;
