// Src/controllers/saturnController.js
const LegacyVision = require('../models/LegacyVision');
const QuarterlyReview = require('../models/QuarterlyReview');
const Goal = require('../models/Goal');
const WearableData = require('../models/WearableData');
const Measurement = require('../models/Measurement');

// ============================================
// LEGACY VISION MANAGEMENT
// ============================================

/**
 * Create or update legacy vision
 */
exports.createOrUpdateVision = async (req, res) => {
  try {
    const { userId } = req.params;
    const visionData = req.body;
    
    // Calculate estimated death date based on current health
    const wearableData = await WearableData.find({ userId }).sort('-date').limit(30);
    const measurements = await Measurement.find({ userId }).sort('-date').limit(1);
    
    let estimatedYearsRemaining = 78; // US average life expectancy
    
    if (wearableData.length > 0) {
      const avgHRV = wearableData.reduce((sum, d) => sum + (d.hrv || 0), 0) / wearableData.length;
      const avgSleep = wearableData.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / wearableData.length;
      
      // Adjust based on health metrics
      if (avgHRV > 70) estimatedYearsRemaining += 5;
      if (avgHRV < 40) estimatedYearsRemaining -= 3;
      if (avgSleep > 480) estimatedYearsRemaining += 2;
      if (avgSleep < 360) estimatedYearsRemaining -= 2;
    }
    
    const deathDate = new Date();
    deathDate.setFullYear(deathDate.getFullYear() + estimatedYearsRemaining);
    
    const daysRemaining = Math.floor((deathDate - new Date()) / (1000 * 60 * 60 * 24));
    
    const vision = await LegacyVision.findOneAndUpdate(
      { userId },
      {
        ...visionData,
        userId,
        deathDate,
        daysRemaining,
        lastReviewed: new Date()
      },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      data: vision,
      message: 'Legacy vision saved successfully'
    });
  } catch (error) {
    console.error('Create vision error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save vision'
    });
  }
};

/**
 * Get user's legacy vision
 */
exports.getVision = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const vision = await LegacyVision.findOne({ userId });
    
    if (!vision) {
      return res.status(404).json({
        success: false,
        message: 'No vision found. Create your 10-year vision to get started.'
      });
    }
    
    res.json({
      success: true,
      data: vision
    });
  } catch (error) {
    console.error('Get vision error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vision'
    });
  }
};

/**
 * Update specific vision field
 */
exports.updateVisionField = async (req, res) => {
  try {
    const { visionId } = req.params;
    const updates = req.body;
    
    const vision = await LegacyVision.findByIdAndUpdate(
      visionId,
      { ...updates, lastReviewed: new Date() },
      { new: true }
    );
    
    res.json({
      success: true,
      data: vision
    });
  } catch (error) {
    console.error('Update vision error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vision'
    });
  }
};

/**
 * Get life timeline visualization data
 */
exports.getTimeline = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const vision = await LegacyVision.findOne({ userId });
    const goals = await Goal.find({ clientId: userId }).sort('deadline');
    
    if (!vision) {
      return res.status(404).json({
        success: false,
        message: 'Create your vision first'
      });
    }
    
    // Build timeline events
    const timeline = [];
    
    // Current age and milestones
    const now = new Date();
    const birthYear = now.getFullYear() - 30; // Assume 30 for now, should be from profile
    
    // Add past milestones (placeholder)
    timeline.push({
      year: now.getFullYear(),
      age: 30,
      event: 'Today',
      type: 'current',
      description: 'Your current position in life'
    });
    
    // Add future goals
    goals.forEach(goal => {
      if (goal.deadline > now) {
        const year = goal.deadline.getFullYear();
        const age = year - birthYear;
        timeline.push({
          year,
          age,
          event: goal.name,
          type: 'goal',
          description: `Target: ${goal.target}`,
          status: goal.completed ? 'completed' : 'pending'
        });
      }
    });
    
    // Add 5-year markers
    for (let i = 5; i <= 50; i += 5) {
      const year = now.getFullYear() + i;
      const age = 30 + i;
      timeline.push({
        year,
        age,
        event: `${i}-Year Mark`,
        type: 'milestone',
        description: `${age} years old`
      });
    }
    
    // Add estimated end of life
    if (vision.deathDate) {
      timeline.push({
        year: vision.deathDate.getFullYear(),
        age: vision.deathDate.getFullYear() - birthYear,
        event: 'Estimated Life End',
        type: 'endpoint',
        description: `Based on current health trajectory`
      });
    }
    
    timeline.sort((a, b) => a.year - b.year);
    
    res.json({
      success: true,
      timeline,
      currentYear: now.getFullYear(),
      yearsRemaining: vision.deathDate ? 
        Math.floor((vision.deathDate - now) / (1000 * 60 * 60 * 24 * 365)) : null
    });
  } catch (error) {
    console.error('Get timeline error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate timeline'
    });
  }
};

/**
 * Create quarterly review
 */
exports.createQuarterlyReview = async (req, res) => {
  try {
    const { userId } = req.params;
    const reviewData = req.body;
    
    const now = new Date();
    const quarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    
    const review = await QuarterlyReview.create({
      userId,
      quarter,
      date: now,
      ...reviewData
    });
    
    res.json({
      success: true,
      data: review,
      message: 'Quarterly review saved'
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save review'
    });
  }
};

/**
 * Get quarterly reviews
 */
exports.getQuarterlyReviews = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const reviews = await QuarterlyReview.find({ userId }).sort('-date');
    
    res.json({
      success: true,
      count: reviews.length,
      data: reviews
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

/**
 * Calculate 10-year trajectory forecast
 */
exports.calculateTrajectory = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get current data
    const [vision, goals, wearableData, measurements] = await Promise.all([
      LegacyVision.findOne({ userId }),
      Goal.find({ clientId: userId }),
      WearableData.find({ userId }).sort('-date').limit(90),
      Measurement.find({ clientId: userId }).sort('-date').limit(10)
    ]);
    
    // Calculate health trajectory
    const avgHRV = wearableData.reduce((sum, d) => sum + (d.hrv || 0), 0) / wearableData.length;
    const avgSleep = wearableData.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / wearableData.length;
    
    const healthScore = ((avgHRV / 80) * 40) + ((avgSleep / 480) * 60);
    
    // Calculate goal completion rate
    const completedGoals = goals.filter(g => g.completed).length;
    const goalCompletionRate = goals.length > 0 ? (completedGoals / goals.length) * 100 : 0;
    
    // Project 10 years ahead
    const projections = {
      health: {
        current: Math.round(healthScore),
        year5: Math.round(healthScore * 0.95), // Assume slight decline
        year10: Math.round(healthScore * 0.9),
        trajectory: healthScore >= 70 ? 'excellent' : healthScore >= 50 ? 'good' : 'needs_improvement'
      },
      goals: {
        currentCompletionRate: Math.round(goalCompletionRate),
        projectedGoalsInNext10Years: Math.round(goals.length * 10 * (goalCompletionRate / 100)),
        trajectory: goalCompletionRate >= 70 ? 'on_track' : 'needs_focus'
      },
      longevity: {
        estimatedYearsRemaining: vision ? Math.floor((vision.deathDate - new Date()) / (1000 * 60 * 60 * 24 * 365)) : null,
        healthAdjustment: avgHRV > 70 ? '+5 years' : avgHRV < 40 ? '-3 years' : '0 years'
      }
    };
    
    // Generate insights
    const insights = [];
    
    if (projections.health.current < 60) {
      insights.push({
        area: 'Health',
        message: 'Current trajectory shows declining health',
        recommendation: 'Prioritize sleep optimization and stress reduction',
        impact: 'Could gain 5-10 years of quality life'
      });
    }
    
    if (projections.goals.currentCompletionRate < 50) {
      insights.push({
        area: 'Goals',
        message: 'Goal completion rate below 50%',
        recommendation: 'Review and streamline goals, focus on top 3 priorities',
        impact: 'Could 2x achievement rate in next 2 years'
      });
    }
    
    res.json({
      success: true,
      projections,
      insights
    });
  } catch (error) {
    console.error('Calculate trajectory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate trajectory'
    });
  }
};

/**
 * Check value alignment
 */
exports.checkAlignment = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const vision = await LegacyVision.findOne({ userId });
    const goals = await Goal.find({ clientId: userId });
    
    if (!vision) {
      return res.status(404).json({
        success: false,
        message: 'Define your core values first'
      });
    }
    
    // Calculate alignment scores for each life area
    const alignmentScores = [];
    
    if (vision.lifeAreas && vision.lifeAreas.length > 0) {
      for (const area of vision.lifeAreas) {
        const areaGoals = goals.filter(g => 
          g.name.toLowerCase().includes(area.area.toLowerCase())
        );
        
        const score = area.currentScore || 0;
        const target = area.targetScore || 10;
        const progress = (score / target) * 100;
        
        alignmentScores.push({
          area: area.area,
          currentScore: score,
          targetScore: target,
          progress: Math.round(progress),
          onTrack: progress >= 70,
          activeGoals: areaGoals.length,
          recommendation: progress < 70 ? 
            `Create ${3 - areaGoals.length} more goals for ${area.area}` : 
            'Keep up the excellent progress'
        });
      }
    }
    
    // Calculate overall alignment
    const overallAlignment = alignmentScores.length > 0 ?
      alignmentScores.reduce((sum, a) => sum + a.progress, 0) / alignmentScores.length :
      0;
    
    res.json({
      success: true,
      overallAlignment: Math.round(overallAlignment),
      alignmentScores,
      summary: overallAlignment >= 70 ? 
        'Your actions align well with your values' :
        'Focus needed to align actions with values'
    });
  } catch (error) {
    console.error('Check alignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check alignment'
    });
  }
};

/**
 * Get life wheel data
 */
exports.getLifeWheel = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const vision = await LegacyVision.findOne({ userId });
    
    if (!vision || !vision.lifeAreas) {
      // Return default life wheel
      return res.json({
        success: true,
        data: {
          health: 5,
          wealth: 5,
          relationships: 5,
          career: 5,
          personal_growth: 5,
          recreation: 5
        },
        message: 'Default life wheel - update your vision to customize'
      });
    }
    
    // Build life wheel from vision
    const lifeWheel = {};
    vision.lifeAreas.forEach(area => {
      lifeWheel[area.area.toLowerCase().replace(/ /g, '_')] = area.currentScore;
    });
    
    res.json({
      success: true,
      data: lifeWheel
    });
  } catch (error) {
    console.error('Get life wheel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch life wheel'
    });
  }
};

/**
 * Calculate mortality awareness
 */
exports.getMortalityData = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const vision = await LegacyVision.findOne({ userId });
    
    if (!vision) {
      return res.status(404).json({
        success: false,
        message: 'Create your vision to see mortality data'
      });
    }
    
    const now = new Date();
    const daysRemaining = vision.daysRemaining || 0;
    const weeksRemaining = Math.floor(daysRemaining / 7);
    const yearsRemaining = Math.floor(daysRemaining / 365);
    
    // Calculate life lived
    const estimatedLifespan = 78 * 365; // Average US lifespan in days
    const daysLived = estimatedLifespan - daysRemaining;
    const lifeLivedPercent = (daysLived / estimatedLifespan) * 100;
    
    res.json({
      success: true,
      data: {
        daysRemaining,
        weeksRemaining,
        yearsRemaining,
        lifeLivedPercent: Math.round(lifeLivedPercent),
        estimatedDeathDate: vision.deathDate,
        message: `You have approximately ${yearsRemaining} years remaining. Make them count.`
      }
    });
  } catch (error) {
    console.error('Get mortality data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate mortality data'
    });
  }
};

module.exports = exports;