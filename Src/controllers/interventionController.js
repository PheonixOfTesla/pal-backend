// Src/controllers/interventionController.js
const Intervention = require('../models/Intervention');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Goal = require('../models/Goal');
const CalendarEvent = require('../models/CalendarEvent');

const INTERVENTION_RULES = {
  recovery_critical: { threshold: 30, action: 'cancel_workout', severity: 'high' },
  hrv_low: { threshold: 40, action: 'rest_day', severity: 'medium' },
  overtraining: { threshold: 90, action: 'reduce_load', severity: 'high' },
  sleep_debt: { threshold: 360, action: 'extend_sleep', severity: 'medium' },
  goal_risk: { threshold: 0.5, action: 'adjust_goal', severity: 'low' }
};

exports.analyzeAndIntervene = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [wearable, workouts, goals, events] = await Promise.all([
      WearableData.findOne({ userId }).sort('-date').lean(),
      Workout.find({ clientId: userId, scheduledDate: { $gte: new Date() } }).sort('scheduledDate').limit(5).lean(),
      Goal.find({ clientId: userId, completed: false }).lean(),
      CalendarEvent.find({ userId, startTime: { $gte: new Date() } }).sort('startTime').limit(10).lean()
    ]);
    
    const interventions = [];
    
    // Critical recovery intervention
    if (wearable?.recoveryScore < INTERVENTION_RULES.recovery_critical.threshold) {
      const canceledWorkouts = await Workout.updateMany(
        { clientId: userId, scheduledDate: { $gte: new Date(), $lte: new Date(Date.now() + 86400000) }, completed: false },
        { $set: { notes: 'AUTO-CANCELED: Recovery score critically low', isActive: false } }
      );
      
      interventions.push({
        type: 'recovery_critical',
        action: 'Canceled next workout',
        reason: `Recovery at ${wearable.recoveryScore}/100`,
        severity: 'high',
        affectedWorkouts: canceledWorkouts.modifiedCount
      });
    }
    
    // HRV intervention
    if (wearable?.hrv && wearable.hrv < INTERVENTION_RULES.hrv_low.threshold) {
      interventions.push({
        type: 'hrv_low',
        action: 'Recommend rest day',
        reason: `HRV at ${wearable.hrv}ms (optimal: 60+)`,
        severity: 'medium'
      });
    }
    
    // Overtraining intervention
    if (wearable?.trainingLoad > INTERVENTION_RULES.overtraining.threshold) {
      const nextWorkout = workouts[0];
      if (nextWorkout) {
        await Workout.findByIdAndUpdate(nextWorkout._id, {
          $set: { notes: 'AI: Reduce intensity by 20% - training load high' }
        });
        
        interventions.push({
          type: 'overtraining',
          action: 'Reduced workout intensity',
          reason: `Training load at ${wearable.trainingLoad}/100`,
          severity: 'high'
        });
      }
    }
    
    // Sleep debt intervention
    if (wearable?.sleepDuration < INTERVENTION_RULES.sleep_debt.threshold) {
      interventions.push({
        type: 'sleep_debt',
        action: 'Block evening meetings',
        reason: `Sleep at ${Math.round(wearable.sleepDuration / 60)}h (need 7h+)`,
        severity: 'medium'
      });
    }
    
    // Goal risk intervention
    for (const goal of goals) {
      const progress = (goal.current - goal.startingValue) / (goal.target - goal.startingValue);
      const timeProgress = (Date.now() - new Date(goal.createdAt)) / (new Date(goal.deadline) - new Date(goal.createdAt));
      
      if (timeProgress > 0.5 && progress < 0.3) {
        interventions.push({
          type: 'goal_risk',
          action: 'Goal needs attention',
          reason: `${goal.name}: ${Math.round(progress * 100)}% complete but ${Math.round(timeProgress * 100)}% time elapsed`,
          severity: 'low',
          goalId: goal._id
        });
      }
    }
    
    // Store all interventions
    if (interventions.length > 0) {
      await Intervention.create(interventions.map(i => ({ userId, ...i, timestamp: new Date() })));
    }
    
    res.json({ success: true, interventions, summary: `${interventions.length} interventions triggered` });
  } catch (error) {
    console.error('Intervention error:', error);
    res.status(500).json({ success: false, message: 'Intervention analysis failed' });
  }
};

exports.getInterventionHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30 } = req.query;
    
    const interventions = await Intervention.find({
      userId,
      timestamp: { $gte: new Date(Date.now() - days * 86400000) }
    }).sort('-timestamp').lean();
    
    const stats = {
      total: interventions.length,
      bySeverity: {
        high: interventions.filter(i => i.severity === 'high').length,
        medium: interventions.filter(i => i.severity === 'medium').length,
        low: interventions.filter(i => i.severity === 'low').length
      },
      byType: interventions.reduce((acc, i) => {
        acc[i.type] = (acc[i.type] || 0) + 1;
        return acc;
      }, {})
    };
    
    res.json({ success: true, interventions, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch intervention history' });
  }
};

exports.simulateIntervention = async (req, res) => {
  try {
    const { userId } = req.params;
    const { scenario } = req.body;
    
    // Dry-run mode - show what WOULD happen
    const simulation = {
      scenario,
      potentialInterventions: []
    };
    
    if (scenario === 'recovery_crash') {
      simulation.potentialInterventions.push({
        action: 'Cancel next 2 workouts',
        reason: 'Recovery score projected to drop below 30',
        affectedDays: 2
      });
    }
    
    res.json({ success: true, simulation });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Simulation failed' });
  }
};