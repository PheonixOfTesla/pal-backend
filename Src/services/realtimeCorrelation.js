// Src/services/realtimeCorrelation.js
const WebSocket = require('ws');
const CorrelationPattern = require('../models/CorrelationPattern');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Transaction = require('../models/Transaction');
const CalendarEvent = require('../models/CalenderEvent');

class RealtimeCorrelationService {
  constructor(wss) {
    this.wss = wss;
    this.activeStreams = new Map();
    this.correlationBuffer = new Map();
    this.processingQueue = [];
    this.isProcessing = false;
  }

  /**
   * Start real-time correlation monitoring for a user
   */
  startMonitoring(userId, ws) {
    console.log(`🔍 Starting real-time correlation monitoring for user ${userId}`);
    
    // Store WebSocket connection
    this.activeStreams.set(userId, ws);
    
    // Initialize correlation buffer for user
    if (!this.correlationBuffer.has(userId)) {
      this.correlationBuffer.set(userId, {
        wearable: [],
        workout: [],
        finance: [],
        calendar: [],
        lastProcessed: Date.now()
      });
    }
    
    // Send initial patterns
    this.sendExistingPatterns(userId, ws);
    
    // Start monitoring
    this.monitorUser(userId);
  }

  /**
   * Stop monitoring for a user
   */
  stopMonitoring(userId) {
    console.log(`🛑 Stopping correlation monitoring for user ${userId}`);
    this.activeStreams.delete(userId);
    this.correlationBuffer.delete(userId);
  }

  /**
   * Process incoming data point
   */
  async processDataPoint(userId, dataType, data) {
    const buffer = this.correlationBuffer.get(userId);
    if (!buffer) return;
    
    // Add to appropriate buffer
    buffer[dataType].push({
      timestamp: Date.now(),
      data
    });
    
    // Keep buffer size manageable (last 100 points)
    if (buffer[dataType].length > 100) {
      buffer[dataType].shift();
    }
    
    // Check if enough time has passed for correlation analysis
    const timeSinceLastProcess = Date.now() - buffer.lastProcessed;
    if (timeSinceLastProcess > 60000) { // Process every minute
      this.queueCorrelationAnalysis(userId);
    }
    
    // Check for immediate patterns
    await this.checkImmediatePatterns(userId, dataType, data);
  }

  /**
   * Queue correlation analysis
   */
  queueCorrelationAnalysis(userId) {
    if (!this.processingQueue.includes(userId)) {
      this.processingQueue.push(userId);
    }
    
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process correlation queue
   */
  async processQueue() {
    this.isProcessing = true;
    
    while (this.processingQueue.length > 0) {
      const userId = this.processingQueue.shift();
      await this.runCorrelationAnalysis(userId);
    }
    
    this.isProcessing = false;
  }

  /**
   * Run correlation analysis for a user
   */
  async runCorrelationAnalysis(userId) {
    const buffer = this.correlationBuffer.get(userId);
    if (!buffer) return;
    
    console.log(`🔄 Running correlation analysis for user ${userId}`);
    
    const correlations = [];
    
    // Analyze cross-domain correlations
    if (buffer.wearable.length >= 5 && buffer.workout.length >= 3) {
      const workoutRecovery = await this.analyzeWorkoutRecovery(buffer.wearable, buffer.workout);
      if (workoutRecovery) correlations.push(workoutRecovery);
    }
    
    if (buffer.wearable.length >= 5 && buffer.finance.length >= 3) {
      const stressSpending = await this.analyzeStressSpending(buffer.wearable, buffer.finance);
      if (stressSpending) correlations.push(stressSpending);
    }
    
    if (buffer.calendar.length >= 3 && buffer.wearable.length >= 5) {
      const calendarRecovery = await this.analyzeCalendarRecovery(buffer.calendar, buffer.wearable);
      if (calendarRecovery) correlations.push(calendarRecovery);
    }
    
    // Store significant correlations
    for (const correlation of correlations) {
      if (correlation.strength > 0.5 && correlation.confidence > 70) {
        await this.storePattern(userId, correlation);
        await this.notifyCorrelation(userId, correlation);
      }
    }
    
    buffer.lastProcessed = Date.now();
  }

  /**
   * Analyze workout-recovery correlation
   */
  async analyzeWorkoutRecovery(wearableData, workoutData) {
    // Extract relevant metrics
    const recoveryScores = wearableData
      .filter(w => w.data.recoveryScore)
      .map(w => ({ time: w.timestamp, value: w.data.recoveryScore }));
    
    const workoutIntensities = workoutData
      .map(w => ({ time: w.timestamp, value: w.data.intensity || 50 }));
    
    if (recoveryScores.length < 3 || workoutIntensities.length < 2) return null;
    
    // Calculate correlation
    const correlation = this.calculateCorrelation(
      workoutIntensities.map(w => w.value),
      recoveryScores.slice(-workoutIntensities.length).map(r => r.value)
    );
    
    return {
      type: 'workout_recovery',
      primaryMetric: 'workout_intensity',
      secondaryMetric: 'recovery_score',
      strength: correlation.coefficient,
      confidence: correlation.confidence,
      lag: 24, // 24 hours typical lag
      insight: correlation.coefficient < -0.5 
        ? 'High intensity workouts significantly impact next-day recovery'
        : 'Workout intensity has moderate impact on recovery'
    };
  }

  /**
   * Analyze stress-spending correlation
   */
  async analyzeStressSpending(wearableData, financeData) {
    const hrvData = wearableData
      .filter(w => w.data.hrv)
      .map(w => ({ time: w.timestamp, value: w.data.hrv }));
    
    const spendingData = financeData
      .map(f => ({ time: f.timestamp, value: f.data.amount || 0 }));
    
    if (hrvData.length < 3 || spendingData.length < 2) return null;
    
    // Lower HRV = Higher stress
    const stressLevels = hrvData.map(h => ({ 
      time: h.time, 
      value: Math.max(0, 100 - h.value) 
    }));
    
    const correlation = this.calculateCorrelation(
      stressLevels.map(s => s.value),
      spendingData.map(s => s.value)
    );
    
    return {
      type: 'stress_spending',
      primaryMetric: 'stress_level',
      secondaryMetric: 'spending_amount',
      strength: correlation.coefficient,
      confidence: correlation.confidence,
      lag: 0, // Immediate effect
      insight: correlation.coefficient > 0.5
        ? 'Stress strongly correlates with increased spending'
        : 'Moderate stress-spending relationship detected'
    };
  }

  /**
   * Analyze calendar-recovery correlation
   */
  async analyzeCalendarRecovery(calendarData, wearableData) {
    const meetingLoad = calendarData.map(c => ({
      time: c.timestamp,
      value: c.data.meetingCount || 0
    }));
    
    const recoveryData = wearableData
      .filter(w => w.data.recoveryScore)
      .map(w => ({ time: w.timestamp, value: w.data.recoveryScore }));
    
    if (meetingLoad.length < 2 || recoveryData.length < 3) return null;
    
    const correlation = this.calculateCorrelation(
      meetingLoad.map(m => m.value),
      recoveryData.slice(-meetingLoad.length).map(r => r.value)
    );
    
    return {
      type: 'calendar_recovery',
      primaryMetric: 'meeting_load',
      secondaryMetric: 'recovery_score',
      strength: correlation.coefficient,
      confidence: correlation.confidence,
      lag: 0,
      insight: correlation.coefficient < -0.3
        ? 'High meeting load impacts recovery'
        : 'Meeting schedule has minimal impact on recovery'
    };
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) {
      return { coefficient: 0, confidence: 0 };
    }
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
    const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (denominator === 0) return { coefficient: 0, confidence: 0 };
    
    const coefficient = numerator / denominator;
    
    // Calculate confidence based on sample size and correlation strength
    const confidence = Math.min(100, (n / 30) * 100 * Math.abs(coefficient));
    
    return { coefficient, confidence: Math.round(confidence) };
  }

  /**
   * Check for immediate patterns
   */
  async checkImmediatePatterns(userId, dataType, data) {
    const patterns = await CorrelationPattern.getPatternsReadyToTrigger(userId);
    
    for (const pattern of patterns) {
      const trigger = pattern.shouldTrigger(data);
      if (trigger.shouldTrigger) {
        await this.triggerIntervention(userId, pattern, trigger);
      }
    }
  }

  /**
   * Store discovered pattern
   */
  async storePattern(userId, correlation) {
    const existingPattern = await CorrelationPattern.findOne({
      userId,
      patternType: correlation.type,
      'correlation.strength': { $gte: correlation.strength - 0.1, $lte: correlation.strength + 0.1 }
    });
    
    if (existingPattern) {
      // Update existing pattern
      existingPattern.correlation.strength = 
        (existingPattern.correlation.strength + correlation.strength) / 2;
      existingPattern.correlation.confidence = 
        Math.max(existingPattern.correlation.confidence, correlation.confidence);
      existingPattern.correlation.sampleSize++;
      await existingPattern.save();
    } else {
      // Create new pattern
      await CorrelationPattern.create({
        userId,
        patternType: correlation.type,
        primaryMetric: {
          name: correlation.primaryMetric,
          source: this.getMetricSource(correlation.primaryMetric)
        },
        secondaryMetric: {
          name: correlation.secondaryMetric,
          source: this.getMetricSource(correlation.secondaryMetric)
        },
        correlation: {
          strength: correlation.strength,
          confidence: correlation.confidence,
          sampleSize: 1
        },
        timeRelationship: {
          lag: correlation.lag || 0
        },
        insights: {
          description: correlation.insight
        }
      });
    }
  }

  /**
   * Get metric source
   */
  getMetricSource(metricName) {
    const sourceMap = {
      workout_intensity: 'workout',
      recovery_score: 'wearable',
      stress_level: 'wearable',
      hrv: 'wearable',
      spending_amount: 'finance',
      meeting_load: 'calendar'
    };
    return sourceMap[metricName] || 'unknown';
  }

  /**
   * Trigger intervention based on pattern
   */
  async triggerIntervention(userId, pattern, trigger) {
    console.log(`🚨 Triggering intervention for user ${userId}: ${pattern.patternType}`);
    
    const ws = this.activeStreams.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'correlation_intervention',
        pattern: pattern.patternType,
        trigger: trigger.trigger,
        action: trigger.trigger.action,
        severity: trigger.trigger.severity,
        timestamp: new Date()
      }));
    }
    
    // Record outcome for pattern learning
    await pattern.recordOutcome(
      trigger.value,
      trigger.value, // Will be updated with actual later
      null // Intervention ID if created
    );
  }

  /**
   * Send existing patterns to user
   */
  async sendExistingPatterns(userId, ws) {
    const patterns = await CorrelationPattern.getStrongestPatterns(userId);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'correlation_patterns',
        patterns: patterns.map(p => ({
          type: p.patternType,
          strength: p.correlation.strength,
          confidence: p.correlation.confidence,
          insight: p.insights.description
        })),
        timestamp: new Date()
      }));
    }
  }

  /**
   * Notify about new correlation
   */
  async notifyCorrelation(userId, correlation) {
    const ws = this.activeStreams.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'new_correlation',
        correlation: {
          type: correlation.type,
          strength: correlation.strength,
          confidence: correlation.confidence,
          insight: correlation.insight
        },
        timestamp: new Date()
      }));
    }
  }
}

module.exports = RealtimeCorrelationService;