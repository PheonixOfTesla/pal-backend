// Src/services/patternLearningService.js - AUTOMATED PATTERN DETECTION
const cron = require('node-cron');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Goal = require('../models/Goal');
const Transaction = require('../models/Transaction');
const CalendarEvent = require('../models/CalenderEvent');
const User = require('../models/User');
const CorrelationPattern = require('../models/CorrelationPattern');
const mlTrainingService = require('./mlTrainingService');

class PatternLearningService {
  constructor() {
    this.isRunning = false;
    this.patterns = new Map();
    this.correlationThreshold = 0.7; // Minimum correlation strength
    this.minSampleSize = 30; // Minimum data points for pattern
  }

  /**
   * Start pattern learning cron jobs
   */
  start() {
    if (this.isRunning) {
      console.warn('⚠️ Pattern learning already running');
      return;
    }

    this.isRunning = true;
    console.log('🧠 Starting Pattern Learning Service...');

    // Run pattern detection every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      console.log('\n🔍 === PATTERN DETECTION SCAN ===');
      console.log('⏰ Time:', new Date().toLocaleString());
      await this.detectAllPatterns();
    });

    // Run ML training once daily at 3 AM
    cron.schedule('0 3 * * *', async () => {
      console.log('\n🤖 === ML MODEL TRAINING ===');
      console.log('⏰ Time:', new Date().toLocaleString());
      await mlTrainingService.trainAllModels();
    });

    // Initial pattern detection after 1 minute
    setTimeout(() => {
      console.log('🚀 Running initial pattern detection...');
      this.detectAllPatterns();
    }, 60000);

    console.log('✅ Pattern Learning Service started');
  }

  /**
   * Main pattern detection pipeline
   */
  async detectAllPatterns() {
    try {
      const startTime = Date.now();
      const users = await User.find({ isActive: true }).select('_id').lean();
      
      console.log(`📊 Analyzing patterns for ${users.length} users...`);
      
      let totalPatterns = 0;
      const discoveredPatterns = [];

      for (const user of users) {
        const patterns = await this.detectUserPatterns(user._id);
        totalPatterns += patterns.length;
        
        if (patterns.length > 0) {
          discoveredPatterns.push({
            userId: user._id,
            patterns: patterns
          });
        }
      }

      // Store significant patterns
      await this.storeSignificantPatterns(discoveredPatterns);

      // Cross-user pattern analysis
      const globalPatterns = await this.detectGlobalPatterns();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n📈 Pattern Detection Results:`);
      console.log(`   Users analyzed: ${users.length}`);
      console.log(`   Patterns found: ${totalPatterns}`);
      console.log(`   Global patterns: ${globalPatterns.length}`);
      console.log(`   Duration: ${duration}s`);
      console.log('✅ === PATTERN DETECTION COMPLETE ===\n');
      
      return { totalPatterns, globalPatterns };
    } catch (error) {
      console.error('❌ Pattern detection error:', error);
      throw error;
    }
  }

  /**
   * Detect patterns for a specific user
   */
  async detectUserPatterns(userId) {
    const patterns = [];
    
    // Get user's data for last 60 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 60);

    const [wearableData, workouts, goals, transactions, events] = await Promise.all([
      WearableData.find({ userId, date: { $gte: startDate, $lte: endDate } }).sort('date').lean(),
      Workout.find({ clientId: userId, scheduledDate: { $gte: startDate, $lte: endDate } }).lean(),
      Goal.find({ clientId: userId }).lean(),
      Transaction.find({ userId, date: { $gte: startDate, $lte: endDate } }).lean(),
      CalendarEvent.find({ userId, startTime: { $gte: startDate, $lte: endDate } }).lean()
    ]);

    // Skip if insufficient data
    if (wearableData.length < this.minSampleSize) {
      return patterns;
    }

    // Pattern 1: Sleep-Recovery Correlation
    const sleepRecoveryPattern = this.analyzeSleepRecoveryPattern(wearableData);
    if (sleepRecoveryPattern) patterns.push(sleepRecoveryPattern);

    // Pattern 2: Workout-Performance Pattern
    const workoutPattern = this.analyzeWorkoutPattern(wearableData, workouts);
    if (workoutPattern) patterns.push(workoutPattern);

    // Pattern 3: Stress-Spending Pattern
    const stressSpendingPattern = this.analyzeStressSpendingPattern(wearableData, transactions);
    if (stressSpendingPattern) patterns.push(stressSpendingPattern);

    // Pattern 4: Meeting-Energy Pattern
    const meetingEnergyPattern = this.analyzeMeetingEnergyPattern(wearableData, events);
    if (meetingEnergyPattern) patterns.push(meetingEnergyPattern);

    // Pattern 5: Goal Progress Pattern
    const goalPattern = this.analyzeGoalProgressPattern(goals, workouts);
    if (goalPattern) patterns.push(goalPattern);

    // Pattern 6: Weekly Rhythm Pattern
    const weeklyPattern = this.analyzeWeeklyRhythmPattern(wearableData);
    if (weeklyPattern) patterns.push(weeklyPattern);

    // Pattern 7: Recovery Predictor Pattern
    const recoveryPredictor = this.analyzeRecoveryPredictors(wearableData);
    if (recoveryPredictor) patterns.push(recoveryPredictor);

    return patterns;
  }

  /**
   * Analyze sleep-recovery correlation
   */
  analyzeSleepRecoveryPattern(wearableData) {
    const validData = wearableData.filter(d => 
      d.sleepDuration && d.recoveryScore && d.sleepDuration > 0
    );

    if (validData.length < this.minSampleSize) return null;

    // Calculate correlation
    const sleepHours = validData.map(d => d.sleepDuration / 60);
    const recoveryScores = validData.map(d => d.recoveryScore);
    
    const correlation = this.calculateCorrelation(sleepHours, recoveryScores);
    
    if (Math.abs(correlation) < this.correlationThreshold) return null;

    // Find optimal sleep duration
    const sleepBuckets = {};
    validData.forEach(d => {
      const hours = Math.round(d.sleepDuration / 60);
      if (!sleepBuckets[hours]) sleepBuckets[hours] = [];
      sleepBuckets[hours].push(d.recoveryScore);
    });

    let optimalSleep = 0;
    let maxRecovery = 0;
    Object.entries(sleepBuckets).forEach(([hours, scores]) => {
      const avgRecovery = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avgRecovery > maxRecovery) {
        maxRecovery = avgRecovery;
        optimalSleep = parseInt(hours);
      }
    });

    return {
      type: 'sleep_recovery',
      strength: Math.abs(correlation),
      insight: `Optimal sleep duration: ${optimalSleep} hours for ${maxRecovery.toFixed(0)}% recovery`,
      recommendation: `Target ${optimalSleep} hours of sleep for best recovery`,
      data: {
        correlation,
        optimalSleep,
        averageRecoveryAtOptimal: maxRecovery,
        sampleSize: validData.length
      }
    };
  }

  /**
   * Analyze workout performance patterns
   */
  analyzeWorkoutPattern(wearableData, workouts) {
    const completedWorkouts = workouts.filter(w => w.completed);
    if (completedWorkouts.length < 10) return null;

    const workoutPerformance = [];
    
    completedWorkouts.forEach(workout => {
      const workoutDate = workout.scheduledDate.toISOString().split('T')[0];
      const wearableDay = wearableData.find(d => 
        d.date.toISOString().split('T')[0] === workoutDate
      );

      if (wearableDay && wearableDay.recoveryScore) {
        workoutPerformance.push({
          recovery: wearableDay.recoveryScore,
          mood: workout.moodFeedback || 3,
          duration: workout.duration || 0,
          hrv: wearableDay.hrv || 0
        });
      }
    });

    if (workoutPerformance.length < 10) return null;

    // Find recovery threshold for good workouts
    const goodWorkouts = workoutPerformance.filter(w => w.mood >= 4);
    const avgRecoveryForGoodWorkouts = goodWorkouts.length > 0
      ? goodWorkouts.reduce((sum, w) => sum + w.recovery, 0) / goodWorkouts.length
      : 0;

    // Find best time of day
    const timePerformance = {};
    completedWorkouts.forEach(workout => {
      const hour = workout.scheduledDate.getHours();
      const timeBlock = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
      
      if (!timePerformance[timeBlock]) timePerformance[timeBlock] = [];
      if (workout.moodFeedback) {
        timePerformance[timeBlock].push(workout.moodFeedback);
      }
    });

    let bestTime = 'morning';
    let bestScore = 0;
    Object.entries(timePerformance).forEach(([time, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg > bestScore) {
        bestScore = avg;
        bestTime = time;
      }
    });

    return {
      type: 'workout_performance',
      strength: 0.85,
      insight: `Best workouts when recovery >${avgRecoveryForGoodWorkouts.toFixed(0)}%, optimal time: ${bestTime}`,
      recommendation: `Schedule high-intensity workouts in the ${bestTime} when recovery exceeds ${avgRecoveryForGoodWorkouts.toFixed(0)}%`,
      data: {
        optimalRecoveryThreshold: avgRecoveryForGoodWorkouts,
        bestTimeOfDay: bestTime,
        performanceScore: bestScore,
        sampleSize: workoutPerformance.length
      }
    };
  }

  /**
   * Analyze stress-spending correlation
   */
  analyzeStressSpendingPattern(wearableData, transactions) {
    if (transactions.length < 20) return null;

    const correlations = [];
    
    transactions.forEach(transaction => {
      const txDate = transaction.date.toISOString().split('T')[0];
      const wearableDay = wearableData.find(d => 
        d.date.toISOString().split('T')[0] === txDate
      );

      if (wearableDay && wearableDay.hrv) {
        correlations.push({
          hrv: wearableDay.hrv,
          amount: transaction.amount,
          category: transaction.category,
          isImpulse: wearableDay.hrv < 40 && transaction.amount > 50
        });
      }
    });

    if (correlations.length < 15) return null;

    // Calculate stress spending threshold
    const impulseTransactions = correlations.filter(c => c.isImpulse);
    const avgImpulseAmount = impulseTransactions.length > 0
      ? impulseTransactions.reduce((sum, t) => sum + t.amount, 0) / impulseTransactions.length
      : 0;

    const hrvValues = correlations.map(c => c.hrv);
    const amounts = correlations.map(c => c.amount);
    const correlation = this.calculateCorrelation(hrvValues, amounts);

    if (Math.abs(correlation) < 0.5) return null;

    return {
      type: 'stress_spending',
      strength: Math.abs(correlation),
      insight: `Spending increases ${Math.abs(correlation * 100).toFixed(0)}% when stressed (low HRV)`,
      recommendation: 'Enable spending alerts when HRV drops below 40ms',
      data: {
        correlation,
        impulseSpendingAvg: avgImpulseAmount,
        impulseCount: impulseTransactions.length,
        hrvThreshold: 40
      }
    };
  }

  /**
   * Analyze meeting-energy correlation
   */
  analyzeMeetingEnergyPattern(wearableData, events) {
    if (events.length < 20) return null;

    const meetingDays = {};
    
    events.forEach(event => {
      const eventDate = event.startTime.toISOString().split('T')[0];
      if (!meetingDays[eventDate]) meetingDays[eventDate] = 0;
      meetingDays[eventDate]++;
    });

    const energyByMeetingLoad = [];
    
    Object.entries(meetingDays).forEach(([date, count]) => {
      const wearableDay = wearableData.find(d => 
        d.date.toISOString().split('T')[0] === date
      );

      if (wearableDay && wearableDay.recoveryScore) {
        energyByMeetingLoad.push({
          meetings: count,
          recovery: wearableDay.recoveryScore,
          steps: wearableDay.steps || 0
        });
      }
    });

    if (energyByMeetingLoad.length < 10) return null;

    // Find meeting threshold
    const highMeetingDays = energyByMeetingLoad.filter(d => d.meetings >= 4);
    const avgRecoveryHighMeetings = highMeetingDays.length > 0
      ? highMeetingDays.reduce((sum, d) => sum + d.recovery, 0) / highMeetingDays.length
      : 0;

    const lowMeetingDays = energyByMeetingLoad.filter(d => d.meetings <= 2);
    const avgRecoveryLowMeetings = lowMeetingDays.length > 0
      ? lowMeetingDays.reduce((sum, d) => sum + d.recovery, 0) / lowMeetingDays.length
      : 0;

    const recoveryDrop = avgRecoveryLowMeetings - avgRecoveryHighMeetings;

    if (Math.abs(recoveryDrop) < 10) return null;

    return {
      type: 'meeting_energy',
      strength: Math.min(Math.abs(recoveryDrop) / 30, 1),
      insight: `Recovery drops ${recoveryDrop.toFixed(0)}% on days with 4+ meetings`,
      recommendation: 'Limit meetings to 3 per day for optimal energy',
      data: {
        optimalMeetingCount: 3,
        recoveryDropPerMeeting: recoveryDrop / 2,
        highMeetingRecovery: avgRecoveryHighMeetings,
        lowMeetingRecovery: avgRecoveryLowMeetings
      }
    };
  }

  /**
   * Analyze goal progress patterns
   */
  analyzeGoalProgressPattern(goals, workouts) {
    const activeGoals = goals.filter(g => !g.completed);
    if (activeGoals.length === 0) return null;

    const progressPatterns = activeGoals.map(goal => {
      const progressRate = goal.progressHistory && goal.progressHistory.length > 1
        ? (goal.current - goal.startingValue) / goal.progressHistory.length
        : 0;
      
      const daysActive = Math.ceil((new Date() - goal.createdAt) / (1000 * 60 * 60 * 24));
      const daysRemaining = goal.deadline 
        ? Math.ceil((goal.deadline - new Date()) / (1000 * 60 * 60 * 24))
        : 90;

      const onTrack = progressRate > 0 && 
        (goal.current - goal.startingValue) / (goal.target - goal.startingValue) >= 
        daysActive / (daysActive + daysRemaining);

      return {
        goal: goal.name,
        progressRate,
        onTrack,
        daysRemaining,
        percentComplete: ((goal.current - goal.startingValue) / (goal.target - goal.startingValue) * 100) || 0
      };
    });

    const onTrackGoals = progressPatterns.filter(p => p.onTrack);
    const atRiskGoals = progressPatterns.filter(p => !p.onTrack && p.daysRemaining > 0);

    if (atRiskGoals.length === 0) return null;

    return {
      type: 'goal_progress',
      strength: 0.9,
      insight: `${atRiskGoals.length} goal(s) at risk, ${onTrackGoals.length} on track`,
      recommendation: atRiskGoals[0] 
        ? `Focus on "${atRiskGoals[0].goal}" - only ${atRiskGoals[0].percentComplete.toFixed(0)}% complete`
        : 'All goals on track',
      data: {
        onTrackCount: onTrackGoals.length,
        atRiskCount: atRiskGoals.length,
        mostAtRisk: atRiskGoals[0],
        averageCompletion: progressPatterns.reduce((sum, p) => sum + p.percentComplete, 0) / progressPatterns.length
      }
    };
  }

  /**
   * Analyze weekly rhythm patterns
   */
  analyzeWeeklyRhythmPattern(wearableData) {
    if (wearableData.length < 28) return null; // Need at least 4 weeks

    const dayPatterns = {
      0: [], // Sunday
      1: [], // Monday
      2: [], // Tuesday
      3: [], // Wednesday
      4: [], // Thursday
      5: [], // Friday
      6: []  // Saturday
    };

    wearableData.forEach(data => {
      const dayOfWeek = data.date.getDay();
      if (data.recoveryScore) {
        dayPatterns[dayOfWeek].push({
          recovery: data.recoveryScore,
          sleep: data.sleepDuration || 0,
          steps: data.steps || 0
        });
      }
    });

    // Find best and worst days
    let bestDay = { day: 0, recovery: 0 };
    let worstDay = { day: 0, recovery: 100 };

    Object.entries(dayPatterns).forEach(([day, data]) => {
      if (data.length > 0) {
        const avgRecovery = data.reduce((sum, d) => sum + d.recovery, 0) / data.length;
        if (avgRecovery > bestDay.recovery) {
          bestDay = { day: parseInt(day), recovery: avgRecovery };
        }
        if (avgRecovery < worstDay.recovery) {
          worstDay = { day: parseInt(day), recovery: avgRecovery };
        }
      }
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
      type: 'weekly_rhythm',
      strength: 0.8,
      insight: `Best recovery on ${dayNames[bestDay.day]} (${bestDay.recovery.toFixed(0)}%), worst on ${dayNames[worstDay.day]} (${worstDay.recovery.toFixed(0)}%)`,
      recommendation: `Schedule important activities on ${dayNames[bestDay.day]}, recovery on ${dayNames[worstDay.day]}`,
      data: {
        bestDay: dayNames[bestDay.day],
        bestDayRecovery: bestDay.recovery,
        worstDay: dayNames[worstDay.day],
        worstDayRecovery: worstDay.recovery,
        weeklyPattern: Object.entries(dayPatterns).map(([day, data]) => ({
          day: dayNames[day],
          avgRecovery: data.length > 0 
            ? data.reduce((sum, d) => sum + d.recovery, 0) / data.length 
            : 0
        }))
      }
    };
  }

  /**
   * Analyze recovery predictors
   */
  analyzeRecoveryPredictors(wearableData) {
    const dataWithNext = [];
    
    for (let i = 0; i < wearableData.length - 1; i++) {
      const current = wearableData[i];
      const next = wearableData[i + 1];
      
      if (current.sleepDuration && current.hrv && next.recoveryScore) {
        dataWithNext.push({
          sleep: current.sleepDuration,
          hrv: current.hrv,
          steps: current.steps || 0,
          nextRecovery: next.recoveryScore
        });
      }
    }

    if (dataWithNext.length < 20) return null;

    // Find strongest predictor
    const sleepCorr = this.calculateCorrelation(
      dataWithNext.map(d => d.sleep),
      dataWithNext.map(d => d.nextRecovery)
    );
    
    const hrvCorr = this.calculateCorrelation(
      dataWithNext.map(d => d.hrv),
      dataWithNext.map(d => d.nextRecovery)
    );
    
    const stepsCorr = this.calculateCorrelation(
      dataWithNext.map(d => d.steps),
      dataWithNext.map(d => d.nextRecovery)
    );

    const predictors = [
      { name: 'Sleep', correlation: sleepCorr },
      { name: 'HRV', correlation: hrvCorr },
      { name: 'Steps', correlation: stepsCorr }
    ];

    predictors.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    const strongest = predictors[0];

    if (Math.abs(strongest.correlation) < 0.5) return null;

    return {
      type: 'recovery_predictor',
      strength: Math.abs(strongest.correlation),
      insight: `${strongest.name} is strongest predictor of next-day recovery (${(Math.abs(strongest.correlation) * 100).toFixed(0)}% correlation)`,
      recommendation: `Optimize ${strongest.name.toLowerCase()} for better recovery tomorrow`,
      data: {
        predictors: predictors.map(p => ({
          factor: p.name,
          correlation: p.correlation,
          strength: Math.abs(p.correlation)
        })),
        strongestPredictor: strongest.name
      }
    };
  }

  /**
   * Detect patterns across all users (global patterns)
   */
  async detectGlobalPatterns() {
    const patterns = [];
    
    // Aggregate data across all users
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const [allWearableData, allWorkouts] = await Promise.all([
      WearableData.find({ date: { $gte: startDate, $lte: endDate } }).lean(),
      Workout.find({ scheduledDate: { $gte: startDate, $lte: endDate }, completed: true }).lean()
    ]);

    // Global pattern 1: Day of week trends
    const dayOfWeekPattern = this.analyzeGlobalDayPattern(allWearableData);
    if (dayOfWeekPattern) patterns.push(dayOfWeekPattern);

    // Global pattern 2: Seasonal trends
    const seasonalPattern = this.analyzeSeasonalPattern(allWearableData);
    if (seasonalPattern) patterns.push(seasonalPattern);

    // Global pattern 3: Workout timing trends
    const workoutTimingPattern = this.analyzeGlobalWorkoutTiming(allWorkouts);
    if (workoutTimingPattern) patterns.push(workoutTimingPattern);

    return patterns;
  }

  /**
   * Analyze global day of week patterns
   */
  analyzeGlobalDayPattern(wearableData) {
    const dayStats = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (let i = 0; i < 7; i++) {
      dayStats[i] = {
        recovery: [],
        sleep: [],
        activity: []
      };
    }

    wearableData.forEach(data => {
      const day = data.date.getDay();
      if (data.recoveryScore) dayStats[day].recovery.push(data.recoveryScore);
      if (data.sleepDuration) dayStats[day].sleep.push(data.sleepDuration);
      if (data.steps) dayStats[day].activity.push(data.steps);
    });

    const dayAverages = Object.entries(dayStats).map(([day, stats]) => ({
      day: dayNames[parseInt(day)],
      avgRecovery: stats.recovery.length > 0 
        ? stats.recovery.reduce((a, b) => a + b, 0) / stats.recovery.length 
        : 0,
      avgSleep: stats.sleep.length > 0 
        ? stats.sleep.reduce((a, b) => a + b, 0) / stats.sleep.length / 60 
        : 0,
      avgSteps: stats.activity.length > 0 
        ? stats.activity.reduce((a, b) => a + b, 0) / stats.activity.length 
        : 0
    }));

    // Find patterns
    const mondayEffect = dayAverages[1].avgRecovery < dayAverages[0].avgRecovery - 5;
    const weekendRecovery = (dayAverages[0].avgRecovery + dayAverages[6].avgRecovery) / 2;
    const weekdayRecovery = (dayAverages[1].avgRecovery + dayAverages[2].avgRecovery + 
                             dayAverages[3].avgRecovery + dayAverages[4].avgRecovery + 
                             dayAverages[5].avgRecovery) / 5;

    return {
      type: 'global_weekly',
      insight: mondayEffect 
        ? 'Monday shows 5%+ recovery drop across all users (Monday syndrome)'
        : `Weekend recovery ${(weekendRecovery - weekdayRecovery).toFixed(0)}% higher than weekdays`,
      data: {
        dayAverages,
        mondayEffect,
        weekendBoost: weekendRecovery - weekdayRecovery
      }
    };
  }

  /**
   * Analyze seasonal patterns
   */
  analyzeSeasonalPattern(wearableData) {
    const currentMonth = new Date().getMonth();
    const season = currentMonth >= 2 && currentMonth <= 4 ? 'spring' :
                   currentMonth >= 5 && currentMonth <= 7 ? 'summer' :
                   currentMonth >= 8 && currentMonth <= 10 ? 'fall' : 'winter';

    const avgMetrics = {
      recovery: wearableData.filter(d => d.recoveryScore).reduce((sum, d) => sum + d.recoveryScore, 0) / 
                wearableData.filter(d => d.recoveryScore).length || 0,
      sleep: wearableData.filter(d => d.sleepDuration).reduce((sum, d) => sum + d.sleepDuration, 0) / 
             wearableData.filter(d => d.sleepDuration).length || 0
    };

    return {
      type: 'seasonal',
      insight: `Current ${season} averages: ${avgMetrics.recovery.toFixed(0)}% recovery, ${(avgMetrics.sleep / 60).toFixed(1)}h sleep`,
      data: {
        season,
        metrics: avgMetrics
      }
    };
  }

  /**
   * Analyze global workout timing
   */
  analyzeGlobalWorkoutTiming(workouts) {
    const timingStats = {
      morning: [], // 5-11
      afternoon: [], // 12-16
      evening: [] // 17-22
    };

    workouts.forEach(workout => {
      const hour = workout.scheduledDate.getHours();
      const period = hour >= 5 && hour < 12 ? 'morning' :
                     hour >= 12 && hour < 17 ? 'afternoon' : 'evening';
      
      if (workout.moodFeedback) {
        timingStats[period].push(workout.moodFeedback);
      }
    });

    const avgByTime = Object.entries(timingStats).map(([time, moods]) => ({
      time,
      avgMood: moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : 0,
      count: moods.length
    }));

    avgByTime.sort((a, b) => b.avgMood - a.avgMood);

    return {
      type: 'global_workout_timing',
      insight: `Best workout satisfaction in ${avgByTime[0].time} (${avgByTime[0].avgMood.toFixed(1)}/5 rating)`,
      data: {
        timingPreferences: avgByTime,
        optimalTime: avgByTime[0].time
      }
    };
  }

  /**
   * Store significant patterns to database
   */
  async storeSignificantPatterns(discoveredPatterns) {
    const patternsToStore = [];
    
    for (const userPatterns of discoveredPatterns) {
      for (const pattern of userPatterns.patterns) {
        if (pattern.strength >= this.correlationThreshold) {
          patternsToStore.push({
            userId: userPatterns.userId,
            type: pattern.type,
            strength: pattern.strength,
            insight: pattern.insight,
            recommendation: pattern.recommendation,
            data: pattern.data,
            discoveredAt: new Date(),
            isActive: true
          });
        }
      }
    }

    if (patternsToStore.length > 0) {
      // Mark old patterns as inactive
      await CorrelationPattern.updateMany(
        { isActive: true },
        { isActive: false }
      );

      // Store new patterns
      await CorrelationPattern.insertMany(patternsToStore);
      console.log(`💾 Stored ${patternsToStore.length} significant patterns`);
    }
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return 0;
    
    return numerator / denominator;
  }

  /**
   * Get active patterns for a user
   */
  async getUserPatterns(userId) {
    return await CorrelationPattern.find({
      userId,
      isActive: true,
      strength: { $gte: this.correlationThreshold }
    }).sort('-strength').limit(10);
  }

  /**
   * Get pattern statistics
   */
  async getPatternStats() {
    const [totalPatterns, activePatterns, userCount] = await Promise.all([
      CorrelationPattern.countDocuments(),
      CorrelationPattern.countDocuments({ isActive: true }),
      CorrelationPattern.distinct('userId').then(users => users.length)
    ]);

    const typeDistribution = await CorrelationPattern.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return {
      totalPatterns,
      activePatterns,
      usersWithPatterns: userCount,
      typeDistribution,
      lastDetection: await CorrelationPattern.findOne().sort('-discoveredAt').select('discoveredAt')
    };
  }
}

// Add the CorrelationPattern model if it doesn't exist
const mongoose = require('mongoose');

const correlationPatternSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, index: true },
  strength: { type: Number, required: true, min: 0, max: 1 },
  insight: { type: String, required: true },
  recommendation: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  discoveredAt: { type: Date, default: Date.now, index: true },
  isActive: { type: Boolean, default: true, index: true },
  usedInInterventions: { type: Number, default: 0 },
  successRate: { type: Number, default: 0 }
}, { timestamps: true });

correlationPatternSchema.index({ userId: 1, type: 1, isActive: 1 });
correlationPatternSchema.index({ strength: -1 });

const CorrelationPattern = mongoose.models.CorrelationPattern || 
  mongoose.model('CorrelationPattern', correlationPatternSchema);

module.exports = new PatternLearningService();