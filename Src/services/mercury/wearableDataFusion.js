// Src/services/wearableDataFusion.js - Multi-Device Data Fusion Engine
const WearableData = require('../models/WearableData');
const User = require('../models/User');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class WearableDataFusionService {
  constructor() {
    this.genAI = process.env.GOOGLE_AI_API_KEY 
      ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY) 
      : null;
    
    // Device priority for different metrics
    this.metricPriorities = {
      hrv: ['whoop', 'oura', 'fitbit', 'garmin', 'polar'],
      sleep: ['oura', 'whoop', 'fitbit', 'garmin', 'polar'],
      recovery: ['whoop', 'oura', 'garmin', 'fitbit', 'polar'],
      activity: ['garmin', 'fitbit', 'polar', 'whoop', 'oura'],
      heartRate: ['garmin', 'polar', 'fitbit', 'whoop', 'oura'],
      temperature: ['oura', 'fitbit', 'garmin'],
      spo2: ['garmin', 'fitbit', 'oura'],
      stress: ['garmin', 'fitbit', 'oura', 'whoop']
    };

    // Confidence weights for each provider
    this.providerWeights = {
      whoop: { hrv: 0.95, recovery: 0.95, sleep: 0.85, strain: 0.90 },
      oura: { hrv: 0.90, sleep: 0.95, temperature: 0.95, readiness: 0.90 },
      fitbit: { steps: 0.95, calories: 0.90, sleep: 0.80, heartRate: 0.85 },
      garmin: { activity: 0.95, vo2max: 0.90, stress: 0.85, training: 0.90 },
      polar: { heartRate: 0.95, training: 0.90, recovery: 0.85 }
    };
  }

  /**
   * Main fusion function - combines data from all connected devices
   */
  async fuseDataForUser(userId, date = new Date()) {
    console.log(`🔄 Starting data fusion for user ${userId}`);
    
    try {
      // Get user's connected devices
      const user = await User.findById(userId);
      if (!user || !user.wearableConnections) {
        throw new Error('No wearable connections found');
      }

      const activeProviders = user.wearableConnections
        .filter(conn => conn.connected)
        .map(conn => conn.provider);

      if (activeProviders.length === 0) {
        throw new Error('No active wearable connections');
      }

      // Fetch data from all providers for the date
      const dateStr = date.toISOString().split('T')[0];
      const allData = await WearableData.find({
        userId,
        date: {
          $gte: new Date(dateStr),
          $lt: new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000)
        }
      }).lean();

      if (allData.length === 0) {
        console.log('No data to fuse for this date');
        return null;
      }

      // Group data by provider
      const dataByProvider = {};
      allData.forEach(data => {
        dataByProvider[data.provider] = data;
      });

      // Perform fusion
      const fusedData = await this.performFusion(dataByProvider, activeProviders);
      
      // Detect and resolve conflicts
      const conflicts = await this.detectConflicts(dataByProvider);
      if (conflicts.length > 0) {
        fusedData.conflicts = await this.resolveConflicts(conflicts, dataByProvider);
      }

      // Calculate unified scores
      fusedData.unifiedScores = await this.calculateUnifiedScores(fusedData);

      // Generate AI insights if available
      if (this.genAI) {
        fusedData.aiInsights = await this.generateAIInsights(fusedData, dataByProvider);
      }

      // Store fused data
      const fusedRecord = await WearableData.findOneAndUpdate(
        { userId, date: new Date(dateStr), provider: 'fused' },
        {
          $set: {
            ...fusedData,
            sources: activeProviders,
            fusionTimestamp: new Date(),
            dataQuality: this.assessDataQuality(fusedData, activeProviders)
          }
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Data fusion complete for ${activeProviders.length} devices`);
      return fusedRecord;

    } catch (error) {
      console.error('❌ Data fusion error:', error);
      throw error;
    }
  }

  /**
   * Core fusion algorithm
   */
  async performFusion(dataByProvider, activeProviders) {
    const fusedData = {
      // Activity metrics
      steps: 0,
      distance: 0,
      caloriesBurned: 0,
      activeMinutes: 0,
      floors: 0,
      
      // Heart metrics
      restingHeartRate: 0,
      averageHeartRate: 0,
      maxHeartRate: 0,
      hrv: 0,
      heartRateZones: [],
      
      // Sleep metrics
      sleepDuration: 0,
      deepSleep: 0,
      lightSleep: 0,
      remSleep: 0,
      awakeTime: 0,
      sleepScore: 0,
      sleepEfficiency: 0,
      
      // Recovery metrics
      recoveryScore: 0,
      strain: 0,
      trainingLoad: 0,
      readinessScore: 0,
      
      // Body metrics
      temperature: null,
      spo2Avg: null,
      respiratoryRate: null,
      
      // Advanced metrics
      vo2Max: null,
      stressScore: null,
      bodyBattery: null
    };

    // Fuse each metric using weighted average based on device priority
    for (const [metric, value] of Object.entries(fusedData)) {
      fusedData[metric] = await this.fuseMetric(metric, dataByProvider, activeProviders);
    }

    // Special handling for complex metrics
    fusedData.heartRateZones = this.fuseHeartRateZones(dataByProvider);
    fusedData.sleepStages = this.fuseSleepStages(dataByProvider);
    
    return fusedData;
  }

  /**
   * Fuse a single metric across devices
   */
  async fuseMetric(metricName, dataByProvider, activeProviders) {
    const values = [];
    const weights = [];
    
    // Determine which category this metric belongs to
    let metricCategory = 'general';
    for (const [category, metrics] of Object.entries({
      activity: ['steps', 'distance', 'caloriesBurned', 'activeMinutes', 'floors'],
      heart: ['restingHeartRate', 'averageHeartRate', 'maxHeartRate', 'hrv'],
      sleep: ['sleepDuration', 'deepSleep', 'lightSleep', 'remSleep', 'sleepScore'],
      recovery: ['recoveryScore', 'strain', 'trainingLoad', 'readinessScore']
    })) {
      if (metrics.includes(metricName)) {
        metricCategory = category;
        break;
      }
    }

    // Get priority order for this metric
    const priorityOrder = this.metricPriorities[metricCategory] || activeProviders;

    // Collect values from each provider
    for (const provider of priorityOrder) {
      if (!dataByProvider[provider]) continue;
      
      const data = dataByProvider[provider];
      let value = data[metricName];
      
      if (value !== undefined && value !== null && value !== 0) {
        // Apply provider-specific weight
        const weight = this.getProviderWeight(provider, metricCategory);
        values.push(value);
        weights.push(weight);
      }
    }

    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];

    // Calculate weighted average
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (let i = 0; i < values.length; i++) {
      weightedSum += values[i] * weights[i];
      totalWeight += weights[i];
    }

    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Get provider weight for a specific metric
   */
  getProviderWeight(provider, metricCategory) {
    const providerConfig = this.providerWeights[provider];
    if (!providerConfig) return 0.5;
    
    // Map category to specific weight
    const categoryWeightMap = {
      activity: providerConfig.activity || providerConfig.steps || 0.7,
      heart: providerConfig.heartRate || providerConfig.hrv || 0.7,
      sleep: providerConfig.sleep || 0.7,
      recovery: providerConfig.recovery || providerConfig.readiness || 0.7
    };
    
    return categoryWeightMap[metricCategory] || 0.7;
  }

  /**
   * Detect conflicts between devices
   */
  async detectConflicts(dataByProvider) {
    const conflicts = [];
    const providers = Object.keys(dataByProvider);
    
    if (providers.length < 2) return conflicts;
    
    // Check for significant discrepancies
    const metricsToCheck = ['steps', 'sleepDuration', 'hrv', 'caloriesBurned'];
    
    for (const metric of metricsToCheck) {
      const values = {};
      
      for (const provider of providers) {
        if (dataByProvider[provider][metric]) {
          values[provider] = dataByProvider[provider][metric];
        }
      }
      
      if (Object.keys(values).length >= 2) {
        const valueArray = Object.values(values);
        const max = Math.max(...valueArray);
        const min = Math.min(...valueArray);
        const variance = (max - min) / max;
        
        // Flag if variance > 30%
        if (variance > 0.3) {
          conflicts.push({
            metric,
            variance: Math.round(variance * 100),
            values,
            severity: variance > 0.5 ? 'high' : 'medium'
          });
        }
      }
    }
    
    return conflicts;
  }

  /**
   * Resolve conflicts using AI and heuristics
   */
  async resolveConflicts(conflicts, dataByProvider) {
    const resolutions = [];
    
    for (const conflict of conflicts) {
      let resolution = {
        metric: conflict.metric,
        originalValues: conflict.values,
        resolvedValue: 0,
        method: 'weighted_average',
        confidence: 0
      };
      
      // Use device-specific rules
      if (conflict.metric === 'steps') {
        // For steps, typically trust Fitbit or Garmin
        if (conflict.values.fitbit) {
          resolution.resolvedValue = conflict.values.fitbit;
          resolution.method = 'trusted_device';
          resolution.confidence = 0.9;
        } else if (conflict.values.garmin) {
          resolution.resolvedValue = conflict.values.garmin;
          resolution.method = 'trusted_device';
          resolution.confidence = 0.9;
        }
      } else if (conflict.metric === 'hrv') {
        // For HRV, trust Whoop or Oura
        if (conflict.values.whoop) {
          resolution.resolvedValue = conflict.values.whoop;
          resolution.method = 'specialist_device';
          resolution.confidence = 0.95;
        } else if (conflict.values.oura) {
          resolution.resolvedValue = conflict.values.oura;
          resolution.method = 'specialist_device';
          resolution.confidence = 0.9;
        }
      }
      
      // Fallback to weighted average if no specific rule
      if (resolution.resolvedValue === 0) {
        const values = Object.values(conflict.values);
        resolution.resolvedValue = Math.round(
          values.reduce((a, b) => a + b) / values.length
        );
        resolution.confidence = 0.7;
      }
      
      resolutions.push(resolution);
    }
    
    return resolutions;
  }

  /**
   * Fuse heart rate zones from multiple devices
   */
  fuseHeartRateZones(dataByProvider) {
    const allZones = [];
    
    for (const [provider, data] of Object.entries(dataByProvider)) {
      if (data.heartRateZones && Array.isArray(data.heartRateZones)) {
        data.heartRateZones.forEach(zone => {
          allZones.push({
            ...zone,
            source: provider
          });
        });
      }
    }
    
    if (allZones.length === 0) return [];
    
    // Consolidate zones by name
    const consolidatedZones = {};
    
    allZones.forEach(zone => {
      if (!consolidatedZones[zone.name]) {
        consolidatedZones[zone.name] = {
          name: zone.name,
          minutes: 0,
          caloriesOut: 0,
          min: zone.min || 0,
          max: zone.max || 0,
          sources: []
        };
      }
      
      consolidatedZones[zone.name].minutes += zone.minutes || 0;
      consolidatedZones[zone.name].caloriesOut += zone.caloriesOut || 0;
      consolidatedZones[zone.name].sources.push(zone.source);
    });
    
    // Average the minutes if multiple sources
    Object.values(consolidatedZones).forEach(zone => {
      if (zone.sources.length > 1) {
        zone.minutes = Math.round(zone.minutes / zone.sources.length);
        zone.caloriesOut = Math.round(zone.caloriesOut / zone.sources.length);
      }
    });
    
    return Object.values(consolidatedZones);
  }

  /**
   * Fuse sleep stages from multiple devices
   */
  fuseSleepStages(dataByProvider) {
    const stages = {
      deep: [],
      light: [],
      rem: [],
      awake: []
    };
    
    // Collect all stage data
    for (const [provider, data] of Object.entries(dataByProvider)) {
      if (data.deepSleep) stages.deep.push(data.deepSleep);
      if (data.lightSleep) stages.light.push(data.lightSleep);
      if (data.remSleep) stages.rem.push(data.remSleep);
      if (data.awakeTime) stages.awake.push(data.awakeTime);
    }
    
    // Calculate averages
    const fusedStages = {};
    for (const [stage, values] of Object.entries(stages)) {
      if (values.length > 0) {
        fusedStages[stage] = Math.round(
          values.reduce((a, b) => a + b) / values.length
        );
      } else {
        fusedStages[stage] = 0;
      }
    }
    
    return fusedStages;
  }

  /**
   * Calculate unified health scores
   */
  async calculateUnifiedScores(fusedData) {
    const scores = {
      overall: 0,
      recovery: 0,
      readiness: 0,
      activity: 0,
      sleep: 0,
      stress: 0
    };
    
    // Recovery Score (HRV, RHR, Sleep)
    if (fusedData.hrv || fusedData.restingHeartRate || fusedData.sleepScore) {
      let recoveryScore = 0;
      let weights = 0;
      
      if (fusedData.hrv) {
        recoveryScore += Math.min(fusedData.hrv / 80 * 100, 100) * 0.4;
        weights += 0.4;
      }
      
      if (fusedData.restingHeartRate) {
        const rhrScore = Math.max(0, 100 - (fusedData.restingHeartRate - 40) * 2);
        recoveryScore += rhrScore * 0.3;
        weights += 0.3;
      }
      
      if (fusedData.sleepScore) {
        recoveryScore += fusedData.sleepScore * 0.3;
        weights += 0.3;
      }
      
      scores.recovery = weights > 0 ? Math.round(recoveryScore / weights) : 0;
    }
    
    // Activity Score
    if (fusedData.steps || fusedData.activeMinutes) {
      let activityScore = 0;
      
      if (fusedData.steps) {
        activityScore += Math.min(fusedData.steps / 10000 * 100, 100) * 0.5;
      }
      
      if (fusedData.activeMinutes) {
        activityScore += Math.min(fusedData.activeMinutes / 30 * 100, 100) * 0.5;
      }
      
      scores.activity = Math.round(activityScore);
    }
    
    // Sleep Score
    if (fusedData.sleepDuration) {
      const optimalSleep = 480; // 8 hours
      scores.sleep = Math.round(Math.min(fusedData.sleepDuration / optimalSleep * 100, 100));
    }
    
    // Readiness Score (combination)
    scores.readiness = Math.round(
      (scores.recovery * 0.5) +
      (scores.sleep * 0.3) +
      (scores.activity * 0.2)
    );
    
    // Overall Score
    scores.overall = Math.round(
      (scores.recovery * 0.35) +
      (scores.readiness * 0.25) +
      (scores.activity * 0.20) +
      (scores.sleep * 0.20)
    );
    
    return scores;
  }

  /**
   * Generate AI insights from fused data
   */
  async generateAIInsights(fusedData, dataByProvider) {
    if (!this.genAI) return null;
    
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      });
      
      const prompt = `Analyze this multi-device wearable data fusion and provide insights:

Fused Data Summary:
- HRV: ${fusedData.hrv}ms
- Resting HR: ${fusedData.restingHeartRate}bpm
- Sleep: ${(fusedData.sleepDuration / 60).toFixed(1)}h
- Deep Sleep: ${fusedData.deepSleep}min
- Recovery Score: ${fusedData.recoveryScore}%
- Steps: ${fusedData.steps}
- Active Minutes: ${fusedData.activeMinutes}

Devices Used: ${Object.keys(dataByProvider).join(', ')}

Provide:
1. One key insight about data consistency
2. One actionable recommendation
3. Any concerning patterns

Keep response under 100 words, be specific.`;
      
      const result = await model.generateContent(prompt);
      return result.response.text();
      
    } catch (error) {
      console.error('AI insights generation failed:', error);
      return null;
    }
  }

  /**
   * Assess overall data quality
   */
  assessDataQuality(fusedData, activeProviders) {
    const quality = {
      score: 0,
      completeness: 0,
      consistency: 0,
      deviceCoverage: 0,
      confidence: 'low'
    };
    
    // Check completeness
    const essentialMetrics = ['steps', 'sleepDuration', 'restingHeartRate'];
    const availableEssentials = essentialMetrics.filter(m => fusedData[m] && fusedData[m] > 0);
    quality.completeness = Math.round((availableEssentials.length / essentialMetrics.length) * 100);
    
    // Device coverage
    quality.deviceCoverage = Math.min(activeProviders.length * 25, 100);
    
    // Calculate overall score
    quality.score = Math.round(
      (quality.completeness * 0.6) +
      (quality.deviceCoverage * 0.4)
    );
    
    // Determine confidence
    if (quality.score >= 80) quality.confidence = 'high';
    else if (quality.score >= 60) quality.confidence = 'medium';
    else quality.confidence = 'low';
    
    return quality;
  }

  /**
   * Real-time fusion when new data arrives
   */
  async handleRealtimeUpdate(userId, provider, newData) {
    console.log(`⚡ Real-time fusion triggered for ${provider}`);
    
    // Store the new data
    await WearableData.findOneAndUpdate(
      { 
        userId, 
        provider, 
        date: new Date(new Date().toISOString().split('T')[0])
      },
      { $set: newData },
      { upsert: true }
    );
    
    // Trigger fusion
    const fusedData = await this.fuseDataForUser(userId, new Date());
    
    // Send real-time notification
    if (global.sendRealtimeNotification) {
      global.sendRealtimeNotification(userId, {
        type: 'data_fusion_complete',
        provider,
        fusedMetrics: {
          recoveryScore: fusedData.unifiedScores?.recovery,
          readinessScore: fusedData.unifiedScores?.readiness,
          overallScore: fusedData.unifiedScores?.overall
        }
      });
    }
    
    return fusedData;
  }
}

module.exports = new WearableDataFusionService();