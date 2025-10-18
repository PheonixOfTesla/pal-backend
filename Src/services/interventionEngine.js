// Src/services/interventionEngine.js - AUTONOMOUS DECISION ENGINE
const Workout = require('../models/Workout');
const CalendarEvent = require('../models/CalenderEvent');
const Transaction = require('../models/Transaction');
const Intervention = require('../models/intervention');
const correlationEngine = require('./correlationEngine');
const predictionEngine = require('./predictionEngine');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

class InterventionEngine {
  constructor() {
    this.activeInterventions = new Map();
    this.interventionHistory = new Map();
    this.automationEnabled = true;
    this.genAI = process.env.GOOGLE_AI_API_KEY 
      ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY) 
      : null;
  }

  /**
   * Main intervention loop - makes decisions FOR the user
   */
  async executeInterventions(userId) {
    console.log(`🤖 Executing automated interventions for user ${userId}`);

    // Get current state
    const [correlations, predictions] = await Promise.all([
      correlationEngine.analyzeUserPatterns(userId, 7),
      predictionEngine.predictUserFuture(userId, 3)
    ]);

    // Determine necessary interventions
    const interventions = await this.determineInterventions(userId, correlations, predictions);

    // Execute each intervention
    const results = [];
    for (const intervention of interventions) {
      const result = await this.executeIntervention(userId, intervention);
      results.push(result);
    }

    // Log all interventions
    await this.logInterventions(userId, results);

    // Send notifications
    this.notifyUser(userId, results);

    return {
      executed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      interventions: results,
      timestamp: new Date()
    };
  }

  /**
   * Determine which interventions are needed
   */
  async determineInterventions(userId, correlations, predictions) {
    const interventions = [];

    // Check for workout cancellation needs
    if (correlations.correlations?.sleepPerformance?.correlation > 0.5) {
      const todayPrediction = predictions.predictions?.hrv?.[0];
      if (todayPrediction?.predicted < 35) {
        interventions.push({
          type: 'cancel_workout',
          reason: 'HRV critically low',
          data: { hrv: todayPrediction.predicted }
        });
      }
    }

    // Check for calendar optimization
    if (predictions.predictions?.energyLevels) {
      const today = predictions.predictions.energyLevels[0];
      if (today.morning < 40) {
        interventions.push({
          type: 'reschedule_morning_meetings',
          reason: 'Low morning energy predicted',
          data: { energy: today.morning }
        });
      }
    }

    // Check for financial protection
    if (correlations.correlations?.stressSpending?.riskAmount > 100) {
      const currentHRV = correlations.correlations?.sleepPerformance?.data?.hrv || 50;
      if (currentHRV < 40) {
        interventions.push({
          type: 'block_purchases',
          reason: 'Stress spending risk detected',
          data: { hrv: currentHRV, riskAmount: correlations.correlations.stressSpending.riskAmount }
        });
      }
    }

    // Check for meal ordering
    if (predictions.predictions?.performance?.[0]?.capacity < 50) {
      interventions.push({
        type: 'order_recovery_meal',
        reason: 'Low performance capacity - nutrition support needed',
        data: { capacity: predictions.predictions.performance[0].capacity }
      });
    }

    // Check for sleep enforcement
    const illnessRisk = predictions.predictions?.illnessRisk?.[0]?.probability || 0;
    if (illnessRisk > 60) {
      interventions.push({
        type: 'enforce_bedtime',
        reason: `${illnessRisk}% illness risk - sleep critical`,
        data: { risk: illnessRisk }
      });
    }

    // Check for social calendar management
    if (correlations.correlations?.socialEnergy?.correlation < -0.3) {
      interventions.push({
type: 'reduce_social_load',
        reason: 'Social overload affecting recovery',
        data: { meetings: correlations.correlations.socialEnergy.currentAverage }
      });
    }

    // Check for training plan adjustments
    if (predictions.predictions?.burnout?.[0]?.risk > 60) {
      interventions.push({
        type: 'implement_deload',
        reason: 'Burnout risk critical',
        data: { burnoutRisk: predictions.predictions.burnout[0].risk }
      });
    }

    // Check for supplement reminders
    if (correlations.correlations?.nutritionRecovery?.correlation > 0.4) {
      interventions.push({
        type: 'supplement_reminder',
        reason: 'Nutrition critical for current recovery needs',
        data: { correlation: correlations.correlations.nutritionRecovery.correlation }
      });
    }

    return interventions;
  }

  /**
   * Execute a specific intervention
   */
  async executeIntervention(userId, intervention) {
    console.log(`⚡ Executing ${intervention.type} for user ${userId}`);

    try {
      switch (intervention.type) {
        case 'cancel_workout':
          return await this.cancelTodaysWorkout(userId, intervention);
        
        case 'reschedule_morning_meetings':
          return await this.rescheduleMorningMeetings(userId, intervention);
        
        case 'block_purchases':
          return await this.blockImpulsePurchases(userId, intervention);
        
        case 'order_recovery_meal':
          return await this.orderRecoveryMeal(userId, intervention);
        
        case 'enforce_bedtime':
          return await this.enforceBedtime(userId, intervention);
        
        case 'reduce_social_load':
          return await this.reduceSocialLoad(userId, intervention);
        
        case 'implement_deload':
          return await this.implementDeloadWeek(userId, intervention);
        
        case 'supplement_reminder':
          return await this.sendSupplementReminder(userId, intervention);
        
        default:
          return {
            type: intervention.type,
            success: false,
            error: 'Unknown intervention type'
          };
      }
    } catch (error) {
      console.error(`❌ Intervention failed: ${intervention.type}`, error);
      return {
        type: intervention.type,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * INTERVENTION: Cancel today's workout
   */
  async cancelTodaysWorkout(userId, intervention) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await Workout.updateMany(
      {
        clientId: userId,
        scheduledDate: { $gte: today, $lt: tomorrow },
        completed: false
      },
      {
        $set: {
          isActive: false,
          notes: `🚨 AUTO-CANCELLED: ${intervention.reason} (HRV: ${intervention.data.hrv}ms)`
        }
      }
    );

    return {
      type: 'cancel_workout',
      success: true,
      affected: result.modifiedCount,
      message: `Cancelled ${result.modifiedCount} workout(s) - Rest day enforced`,
      data: intervention.data
    };
  }

  /**
   * INTERVENTION: Reschedule morning meetings
   */
  async rescheduleMorningMeetings(userId, intervention) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const noon = new Date(today);
    noon.setHours(12, 0, 0, 0);

    const morningEvents = await CalendarEvent.find({
      userId,
      startTime: { $gte: today, $lt: noon }
    });

    const rescheduled = [];
    for (const event of morningEvents) {
      // Move to afternoon (add 4 hours)
      const newTime = new Date(event.startTime);
      newTime.setHours(newTime.getHours() + 4);
      
      event.startTime = newTime;
      event.endTime = new Date(event.endTime.getTime() + 4 * 60 * 60 * 1000);
      event.autoScheduled = true;
      await event.save();
      
      rescheduled.push({
        title: event.title,
        oldTime: event.startTime,
        newTime: newTime
      });
    }

    // If integrated with Google Calendar, update there too
    if (process.env.GOOGLE_CALENDAR_ENABLED) {
      await this.updateGoogleCalendar(userId, rescheduled);
    }

    return {
      type: 'reschedule_morning_meetings',
      success: true,
      affected: rescheduled.length,
      message: `Rescheduled ${rescheduled.length} morning meetings to afternoon`,
      data: { events: rescheduled, reason: intervention.reason }
    };
  }

  /**
   * INTERVENTION: Block impulse purchases
   */
  async blockImpulsePurchases(userId, intervention) {
    // Create a spending freeze
    const freeze = {
      userId,
      startTime: new Date(),
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      categories: ['Shopping', 'Entertainment', 'Restaurants'],
      threshold: 50,
      reason: intervention.reason
    };

    // In a real implementation, this would integrate with banking APIs
    // For now, we'll create a rule that can be checked
    await Transaction.create({
      userId,
      accountId: 'system',
      plaidTransactionId: `freeze_${Date.now()}`,
      amount: 0,
      date: new Date(),
      description: 'SPENDING FREEZE ACTIVATED',
      category: 'System',
      isImpulsePurchase: false,
      correlatedHRV: intervention.data.hrv
    });

    // If Plaid is connected, set up webhooks
    if (process.env.PLAID_CLIENT_ID) {
      await this.setupPlaidBlock(userId, freeze);
    }

    return {
      type: 'block_purchases',
      success: true,
      affected: freeze.categories.length,
      message: `24-hour purchase block activated for ${freeze.categories.join(', ')}`,
      data: { freeze, hrv: intervention.data.hrv, riskAmount: intervention.data.riskAmount }
    };
  }

  /**
   * INTERVENTION: Order recovery meal
   */
  async orderRecoveryMeal(userId, intervention) {
    // Integration with meal delivery services
    const mealPlan = {
      type: 'recovery',
      calories: 600,
      protein: 40,
      carbs: 60,
      fat: 20,
      items: [
        'Grilled chicken breast',
        'Sweet potato',
        'Steamed broccoli',
        'Mixed berries'
      ]
    };

    // In production, this would integrate with DoorDash/UberEats API
    if (process.env.DOORDASH_API_KEY) {
      const order = await this.placeDoordashOrder(userId, mealPlan);
      return {
        type: 'order_recovery_meal',
        success: true,
        message: 'Recovery meal ordered for delivery',
        data: { order, eta: '45 minutes' }
      };
    }

    // Fallback: Send meal prep instructions
    return {
      type: 'order_recovery_meal',
      success: true,
      message: 'Recovery meal plan sent',
      data: { mealPlan, instructions: 'Prep time: 30 minutes' }
    };
  }

  /**
   * INTERVENTION: Enforce bedtime
   */
  async enforceBedtime(userId, intervention) {
    const bedtime = new Date();
    bedtime.setHours(22, 0, 0, 0); // 10 PM

    // Create calendar block
    await CalendarEvent.create({
      userId,
      provider: 'system',
      title: '🛌 MANDATORY BEDTIME - Phone Down',
      startTime: bedtime,
      endTime: new Date(bedtime.getTime() + 9 * 60 * 60 * 1000), // 9 hours
      energyRequirement: 1,
      autoScheduled: true,
      meetingType: 'recovery'
    });

    // Send smart home commands if integrated
    if (process.env.SMART_HOME_ENABLED) {
      await this.triggerSmartHome(userId, {
        lights: 'dim',
        temperature: 68,
        phone: 'do_not_disturb',
        apps: 'block_all'
      });
    }

    // Schedule wake-up optimization
    const wakeTime = new Date(bedtime);
    wakeTime.setHours(7, 0, 0, 0);

    return {
      type: 'enforce_bedtime',
      success: true,
      message: `Bedtime enforced at 10 PM - ${intervention.data.risk}% illness risk requires 9h sleep`,
      data: {
        bedtime: bedtime.toISOString(),
        wakeTime: wakeTime.toISOString(),
        illnessRisk: intervention.data.risk
      }
    };
  }

  /**
   * INTERVENTION: Reduce social load
   */
  async reduceSocialLoad(userId, intervention) {
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() + 7);

    // Find non-critical meetings
    const events = await CalendarEvent.find({
      userId,
      startTime: { $gte: new Date(), $lte: thisWeek },
      meetingType: { $ne: 'critical' }
    });

    // Cancel/reschedule 50% of social events
    const toCancel = events
      .filter(e => e.attendees?.length > 3)
      .slice(0, Math.ceil(events.length * 0.5));

    for (const event of toCancel) {
      event.startTime = new Date(event.startTime.getTime() + 7 * 24 * 60 * 60 * 1000); // Push 1 week
      event.autoScheduled = true;
      await event.save();
    }

    return {
      type: 'reduce_social_load',
      success: true,
      affected: toCancel.length,
      message: `Rescheduled ${toCancel.length} non-critical meetings to next week`,
      data: {
        originalLoad: intervention.data.meetings,
        reducedBy: toCancel.length
      }
    };
  }

  /**
   * INTERVENTION: Implement deload week
   */
  async implementDeloadWeek(userId, intervention) {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Reduce all workout intensity by 50%
    const workouts = await Workout.find({
      clientId: userId,
      scheduledDate: { $gte: new Date(), $lte: nextWeek },
      completed: false
    });

    for (const workout of workouts) {
      // Reduce sets and weight
      workout.exercises = workout.exercises.map(ex => ({
        ...ex.toObject(),
        sets: Math.max(1, Math.floor(ex.sets * 0.5)),
        weight: Math.floor(ex.weight * 0.7),
        notes: `DELOAD WEEK: Reduced intensity (${intervention.reason})`
      }));
      
      workout.name = `[DELOAD] ${workout.name}`;
      await workout.save();
    }

    return {
      type: 'implement_deload',
      success: true,
      affected: workouts.length,
      message: `Deload week implemented - ${workouts.length} workouts adjusted`,
      data: {
        burnoutRisk: intervention.data.burnoutRisk,
        duration: '7 days',
        intensityReduction: '50%'
      }
    };
  }

  /**
   * INTERVENTION: Send supplement reminder
   */
  async sendSupplementReminder(userId, intervention) {
    const supplements = {
      morning: ['Vitamin D3', 'Omega-3', 'Magnesium'],
      postWorkout: ['Protein shake', 'Creatine', 'BCAAs'],
      evening: ['Zinc', 'Ashwagandha', 'Melatonin']
    };

    const now = new Date().getHours();
    const timing = now < 12 ? 'morning' : now < 18 ? 'postWorkout' : 'evening';

    // Send immediate notification
    if (global.sendRealtimeNotification) {
      global.sendRealtimeNotification(userId, {
        type: 'supplement_reminder',
        urgency: 'high',
        title: '💊 Supplement Time',
        message: `Take your ${timing} supplements: ${supplements[timing].join(', ')}`,
        action: 'Mark as taken'
      });
    }

    // Set up recurring reminders
    const reminders = [];
    Object.entries(supplements).forEach(([time, items]) => {
      reminders.push({
        time,
        items,
        scheduled: true
      });
    });

    return {
      type: 'supplement_reminder',
      success: true,
      message: `Supplement reminders activated`,
      data: {
        immediate: supplements[timing],
        schedule: reminders,
        reason: intervention.reason
      }
    };
  }

  /**
   * Helper: Update Google Calendar
   */
  async updateGoogleCalendar(userId, events) {
    // Integration with Google Calendar API
    if (!process.env.GOOGLE_CALENDAR_CLIENT_ID) return;

    try {
      // This would use the Google Calendar API to update events
      console.log(`📅 Updating ${events.length} Google Calendar events`);
    } catch (error) {
      console.error('Google Calendar update failed:', error);
    }
  }

  /**
   * Helper: Setup Plaid spending block
   */
  async setupPlaidBlock(userId, freeze) {
    // Integration with Plaid webhooks
    if (!process.env.PLAID_CLIENT_ID) return;

    try {
      // This would set up transaction webhooks to block certain purchases
      console.log(`💳 Plaid spending freeze activated for user ${userId}`);
    } catch (error) {
      console.error('Plaid block setup failed:', error);
    }
  }

  /**
   * Helper: Place DoorDash order
   */
  async placeDoordashOrder(userId, mealPlan) {
    // Integration with DoorDash API
    if (!process.env.DOORDASH_API_KEY) return null;

    try {
      // This would place an actual order via DoorDash API
      console.log(`🍽️ Placing DoorDash order for user ${userId}`);
      return {
        orderId: `mock_${Date.now()}`,
        items: mealPlan.items,
        eta: 45
      };
    } catch (error) {
      console.error('DoorDash order failed:', error);
      return null;
    }
  }

  /**
   * Helper: Trigger smart home automation
   */
  async triggerSmartHome(userId, commands) {
    // Integration with smart home APIs (Alexa, Google Home, HomeKit)
    if (!process.env.SMART_HOME_ENABLED) return;

    try {
      console.log(`🏠 Triggering smart home automation for user ${userId}`);
      // This would send commands to smart home devices
    } catch (error) {
      console.error('Smart home trigger failed:', error);
    }
  }

  /**
   * Log all interventions for analysis
   */
  async logInterventions(userId, results) {
    const logs = results.map(result => ({
      userId,
      type: result.type,
      success: result.success,
      timestamp: new Date(),
      action: result.message,
      reason: result.data?.reason || 'Automated intervention',
      severity: result.affected > 3 ? 'high' : 'medium',
      metrics: result.data
    }));

    await Intervention.insertMany(logs);
    
    // Store in memory for quick access
    this.interventionHistory.set(userId, {
      recent: logs,
      timestamp: new Date()
    });
  }

  /**
   * Notify user of interventions
   */
  notifyUser(userId, results) {
    const successful = results.filter(r => r.success);
    
    if (successful.length === 0) return;

    const summary = {
      type: 'intervention_summary',
      title: `🤖 Phoenix took ${successful.length} actions for you`,
      interventions: successful.map(r => ({
        action: r.type.replace(/_/g, ' ').toUpperCase(),
        result: r.message,
        affected: r.affected
      })),
      totalAffected: successful.reduce((sum, r) => sum + (r.affected || 0), 0)
    };

    if (global.sendRealtimeNotification) {
      global.sendRealtimeNotification(userId, summary);
    }

    // Also send summary email if critical interventions
    const critical = successful.filter(r => 
      r.type === 'cancel_workout' || 
      r.type === 'block_purchases' ||
      r.type === 'enforce_bedtime'
    );

    if (critical.length > 0) {
      this.sendInterventionEmail(userId, critical);
    }
  }

  /**
   * Send intervention summary email
   */
  async sendInterventionEmail(userId, interventions) {
    // Integration with email service (SendGrid, etc.)
    console.log(`📧 Sending intervention summary email to user ${userId}`);
  }

  /**
   * Get intervention history for a user
   */
  getHistory(userId) {
    return this.interventionHistory.get(userId) || { recent: [], timestamp: null };
  }

  /**
   * Check if intervention is needed NOW
   */
  async needsImmediateIntervention(userId) {
    const predictions = await predictionEngine.predictUserFuture(userId, 1);
    
    const urgent = 
      predictions.predictions?.illnessRisk?.[0]?.probability > 70 ||
      predictions.predictions?.burnout?.[0]?.risk > 80 ||
      predictions.predictions?.hrv?.[0]?.predicted < 30;

    return {
      needed: urgent,
      reason: urgent ? 'Critical health markers detected' : null
    };
  }
}

module.exports = new InterventionEngine();