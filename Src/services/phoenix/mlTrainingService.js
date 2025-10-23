// Src/services/mlTrainingService.js - CONTINUOUS ML MODEL TRAINING
const tf = require('@tensorflow/tfjs-node');
const WearableData = require('../../models/mercury/WearableData');
const Workout = require('../../models/venus/Workout');
const Goal = require('../../models/mars/Goal');
const Measurement = require('../../models/mercury/Measurement');
const Intervention = require('../../models/phoenix/Intervention');
const fs = require('fs').promises;
const path = require('path');

class MLTrainingService {
  constructor() {
    this.models = {
      recovery: null,
      performance: null,
      goalSuccess: null,
      intervention: null
    };
    this.modelPath = path.join(__dirname, '../../ml-models');
    this.isTraining = false;
    this.lastTrainingTime = null;
  }

  /**
   * Initialize and load existing models
   */
  async initialize() {
    console.log('🤖 Initializing ML Training Service...');
    
    // Create model directory if it doesn't exist
    try {
      await fs.mkdir(this.modelPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create model directory:', error);
    }

    // Load existing models
    await this.loadModels();
    
    console.log('✅ ML Training Service initialized');
  }

  /**
   * Load pre-trained models from disk
   */
  async loadModels() {
    const modelTypes = Object.keys(this.models);
    
    for (const modelType of modelTypes) {
      const modelPath = path.join(this.modelPath, modelType);
      try {
        const modelExists = await this.checkModelExists(modelPath);
        if (modelExists) {
          this.models[modelType] = await tf.loadLayersModel(`file://${modelPath}/model.json`);
          console.log(`✅ Loaded ${modelType} model`);
        } else {
          console.log(`⚠️ No existing ${modelType} model found - will create on first training`);
        }
      } catch (error) {
        console.error(`Failed to load ${modelType} model:`, error.message);
      }
    }
  }

  /**
   * Check if model exists on disk
   */
  async checkModelExists(modelPath) {
    try {
      await fs.access(path.join(modelPath, 'model.json'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Main training pipeline - runs all model training
   */
  async trainAllModels() {
    if (this.isTraining) {
      console.log('⚠️ Training already in progress, skipping...');
      return;
    }

    this.isTraining = true;
    const startTime = Date.now();
    console.log('\n🎯 === ML MODEL TRAINING STARTED ===');
    console.log('⏰ Time:', new Date().toLocaleString());

    try {
      const results = {
        recovery: await this.trainRecoveryModel(),
        performance: await this.trainPerformanceModel(),
        goalSuccess: await this.trainGoalSuccessModel(),
        intervention: await this.trainInterventionModel()
      };

      this.lastTrainingTime = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log('\n📊 Training Results:');
      Object.entries(results).forEach(([model, result]) => {
        if (result.success) {
          console.log(`✅ ${model}: Loss=${result.loss?.toFixed(4)}, Accuracy=${result.accuracy?.toFixed(2)}%`);
        } else {
          console.log(`❌ ${model}: ${result.error}`);
        }
      });
      
      console.log(`\n✅ === ML TRAINING COMPLETE (${duration}s) ===\n`);
      
      return results;
    } catch (error) {
      console.error('❌ Training pipeline error:', error);
      throw error;
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Train recovery prediction model
   */
  async trainRecoveryModel() {
    try {
      console.log('🔄 Training recovery model...');
      
      // Fetch training data (last 90 days)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      
      const wearableData = await WearableData.find({
        date: { $gte: startDate },
        recoveryScore: { $exists: true, $ne: null }
      }).lean();

      if (wearableData.length < 100) {
        return { success: false, error: 'Insufficient data for training' };
      }

      // Prepare features and labels
      const features = [];
      const labels = [];

      wearableData.forEach(data => {
        // Features: [hrv, restingHR, sleepDuration, sleepEfficiency, steps, activeMinutes]
        if (data.hrv && data.restingHeartRate && data.sleepDuration) {
          features.push([
            data.hrv / 100, // Normalize HRV
            data.restingHeartRate / 100, // Normalize RHR
            data.sleepDuration / 600, // Normalize sleep (10h max)
            (data.sleepEfficiency || 80) / 100, // Normalize efficiency
            Math.min(data.steps / 20000, 1), // Normalize steps
            Math.min(data.activeMinutes / 120, 1) // Normalize active minutes
          ]);
          
          // Label: recovery score (0-100)
          labels.push(data.recoveryScore / 100);
        }
      });

      if (features.length < 50) {
        return { success: false, error: 'Insufficient valid samples' };
      }

      // Convert to tensors
      const xs = tf.tensor2d(features);
      const ys = tf.tensor2d(labels, [labels.length, 1]);

      // Create or use existing model
      let model = this.models.recovery;
      if (!model) {
        model = this.createRecoveryModel();
      }

      // Train model
      const history = await model.fit(xs, ys, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              console.log(`  Epoch ${epoch}: loss=${logs.loss.toFixed(4)}`);
            }
          }
        }
      });

      // Save model
      const modelPath = path.join(this.modelPath, 'recovery');
      await fs.mkdir(modelPath, { recursive: true });
      await model.save(`file://${modelPath}`);
      
      this.models.recovery = model;

      // Cleanup tensors
      xs.dispose();
      ys.dispose();

      const finalLoss = history.history.loss[history.history.loss.length - 1];
      const accuracy = (1 - finalLoss) * 100;

      return { 
        success: true, 
        loss: finalLoss,
        accuracy,
        samplesUsed: features.length
      };
    } catch (error) {
      console.error('Recovery model training error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Train performance prediction model
   */
  async trainPerformanceModel() {
    try {
      console.log('🔄 Training performance model...');
      
      // Fetch workout and wearable data
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      
      const [workouts, wearableData] = await Promise.all([
        Workout.find({
          scheduledDate: { $gte: startDate },
          completed: true
        }).lean(),
        WearableData.find({
          date: { $gte: startDate }
        }).lean()
      ]);

      if (workouts.length < 50) {
        return { success: false, error: 'Insufficient workout data' };
      }

      // Create wearable data map for quick lookup
      const wearableMap = new Map();
      wearableData.forEach(d => {
        const key = `${d.userId}_${d.date.toISOString().split('T')[0]}`;
        wearableMap.set(key, d);
      });

      // Prepare training data
      const features = [];
      const labels = [];

      workouts.forEach(workout => {
        const workoutDate = workout.scheduledDate.toISOString().split('T')[0];
        const wearableKey = `${workout.clientId}_${workoutDate}`;
        const wearable = wearableMap.get(wearableKey);

        if (wearable && wearable.recoveryScore !== undefined) {
          // Features: [recoveryScore, sleepHours, hrv, previousWorkouts, restDays]
          const prevWorkouts = workouts.filter(w => 
            w.clientId === workout.clientId &&
            w.scheduledDate < workout.scheduledDate &&
            w.scheduledDate > new Date(workout.scheduledDate - 7 * 24 * 60 * 60 * 1000)
          ).length;

          features.push([
            wearable.recoveryScore / 100,
            Math.min(wearable.sleepDuration / 600, 1),
            wearable.hrv ? wearable.hrv / 100 : 0.5,
            prevWorkouts / 7, // Normalize to weekly
            workout.duration ? Math.min(workout.duration / 120, 1) : 0.5
          ]);

          // Label: Performance (based on mood feedback and completion)
          const performance = workout.moodFeedback ? (workout.moodFeedback / 5) : 0.6;
          labels.push(performance);
        }
      });

      if (features.length < 30) {
        return { success: false, error: 'Insufficient valid samples' };
      }

      // Convert to tensors
      const xs = tf.tensor2d(features);
      const ys = tf.tensor2d(labels, [labels.length, 1]);

      // Create or use existing model
      let model = this.models.performance;
      if (!model) {
        model = this.createPerformanceModel();
      }

      // Train
      const history = await model.fit(xs, ys, {
        epochs: 40,
        batchSize: 16,
        validationSplit: 0.2,
        shuffle: true
      });

      // Save model
      const modelPath = path.join(this.modelPath, 'performance');
      await fs.mkdir(modelPath, { recursive: true });
      await model.save(`file://${modelPath}`);
      
      this.models.performance = model;

      // Cleanup
      xs.dispose();
      ys.dispose();

      const finalLoss = history.history.loss[history.history.loss.length - 1];
      
      return { 
        success: true, 
        loss: finalLoss,
        accuracy: (1 - finalLoss) * 100,
        samplesUsed: features.length
      };
    } catch (error) {
      console.error('Performance model training error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Train goal success prediction model
   */
  async trainGoalSuccessModel() {
    try {
      console.log('🔄 Training goal success model...');
      
      // Fetch completed and failed goals
      const goals = await Goal.find({
        $or: [
          { completed: true },
          { deadline: { $lt: new Date() } }
        ]
      }).lean();

      if (goals.length < 50) {
        return { success: false, error: 'Insufficient goal data' };
      }

      const features = [];
      const labels = [];

      goals.forEach(goal => {
        if (goal.progressHistory && goal.progressHistory.length > 0) {
          const duration = (goal.deadline - goal.createdAt) / (1000 * 60 * 60 * 24); // Days
          const progressRate = goal.progressHistory.length > 1 
            ? (goal.progressHistory[goal.progressHistory.length - 1].value - goal.progressHistory[0].value) / goal.progressHistory.length
            : 0;
          
          // Features: [initialProgress, durationDays, updateFrequency, progressRate, isHabit]
          features.push([
            (goal.startingValue / goal.target) || 0,
            Math.min(duration / 365, 1), // Normalize to 1 year max
            goal.progressHistory.length / duration, // Updates per day
            Math.abs(progressRate),
            goal.isHabit ? 1 : 0
          ]);
          
          // Label: Success (1) or Failure (0)
          labels.push(goal.completed ? 1 : 0);
        }
      });

      if (features.length < 30) {
        return { success: false, error: 'Insufficient valid samples' };
      }

      // Convert to tensors
      const xs = tf.tensor2d(features);
      const ys = tf.tensor2d(labels, [labels.length, 1]);

      // Create or use existing model
      let model = this.models.goalSuccess;
      if (!model) {
        model = this.createGoalModel();
      }

      // Train with binary crossentropy for classification
      model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });

      const history = await model.fit(xs, ys, {
        epochs: 50,
        batchSize: 16,
        validationSplit: 0.2,
        shuffle: true
      });

      // Save model
      const modelPath = path.join(this.modelPath, 'goalSuccess');
      await fs.mkdir(modelPath, { recursive: true });
      await model.save(`file://${modelPath}`);
      
      this.models.goalSuccess = model;

      // Cleanup
      xs.dispose();
      ys.dispose();

      const finalAccuracy = history.history.acc[history.history.acc.length - 1];
      
      return { 
        success: true, 
        loss: history.history.loss[history.history.loss.length - 1],
        accuracy: finalAccuracy * 100,
        samplesUsed: features.length
      };
    } catch (error) {
      console.error('Goal model training error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Train intervention effectiveness model
   */
  async trainInterventionModel() {
    try {
      console.log('🔄 Training intervention model...');
      
      // Fetch intervention history with outcomes
      const interventions = await Intervention.find({
        outcome: { $exists: true }
      }).lean();

      if (interventions.length < 30) {
        return { success: false, error: 'Insufficient intervention data' };
      }

      const features = [];
      const labels = [];

      for (const intervention of interventions) {
        // Get wearable data before and after intervention
        const beforeData = await WearableData.findOne({
          userId: intervention.userId,
          date: { $lte: intervention.timestamp }
        }).sort('-date').lean();

        const afterData = await WearableData.findOne({
          userId: intervention.userId,
          date: { $gte: new Date(intervention.timestamp.getTime() + 24 * 60 * 60 * 1000) }
        }).sort('date').lean();

        if (beforeData && afterData) {
          // Features: [severity, beforeRecovery, beforeHRV, type, timeOfDay]
          const severityMap = { low: 0.25, medium: 0.5, high: 0.75, critical: 1 };
          const typeMap = {
            recovery_critical: 1,
            hrv_low: 2,
            overtraining: 3,
            sleep_debt: 4,
            goal_risk: 5,
            calendar_overload: 6
          };

          features.push([
            severityMap[intervention.severity] || 0.5,
            (beforeData.recoveryScore || 50) / 100,
            (beforeData.hrv || 50) / 100,
            (typeMap[intervention.type] || 0) / 6,
            intervention.timestamp.getHours() / 24
          ]);

          // Label: Effectiveness (1 if accepted and improved, 0 otherwise)
          const improved = afterData.recoveryScore > beforeData.recoveryScore ||
                          afterData.hrv > beforeData.hrv;
          const effective = intervention.outcome === 'accepted' && improved ? 1 : 0;
          labels.push(effective);
        }
      }

      if (features.length < 20) {
        return { success: false, error: 'Insufficient valid samples' };
      }

      // Convert to tensors
      const xs = tf.tensor2d(features);
      const ys = tf.tensor2d(labels, [labels.length, 1]);

      // Create or use existing model
      let model = this.models.intervention;
      if (!model) {
        model = this.createInterventionModel();
      }

      // Train
      model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });

      const history = await model.fit(xs, ys, {
        epochs: 40,
        batchSize: 8,
        validationSplit: 0.2,
        shuffle: true
      });

      // Save model
      const modelPath = path.join(this.modelPath, 'intervention');
      await fs.mkdir(modelPath, { recursive: true });
      await model.save(`file://${modelPath}`);
      
      this.models.intervention = model;

      // Cleanup
      xs.dispose();
      ys.dispose();

      const finalAccuracy = history.history.acc[history.history.acc.length - 1];
      
      return { 
        success: true, 
        loss: history.history.loss[history.history.loss.length - 1],
        accuracy: finalAccuracy * 100,
        samplesUsed: features.length
      };
    } catch (error) {
      console.error('Intervention model training error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create recovery prediction model architecture
   */
  createRecoveryModel() {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [6], units: 12, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 8, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mse']
    });

    return model;
  }

  /**
   * Create performance model architecture
   */
  createPerformanceModel() {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [5], units: 10, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 6, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mse']
    });

    return model;
  }

  /**
   * Create goal success model architecture
   */
  createGoalModel() {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [5], units: 10, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 6, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });

    return model;
  }

  /**
   * Create intervention model architecture
   */
  createInterventionModel() {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [5], units: 10, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 6, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });

    return model;
  }

  /**
   * Make predictions using trained models
   */
  async predict(modelType, features) {
    const model = this.models[modelType];
    if (!model) {
      throw new Error(`Model ${modelType} not loaded`);
    }

    const input = tf.tensor2d([features]);
    const prediction = await model.predict(input).data();
    input.dispose();

    return prediction[0];
  }

  /**
   * Get model performance metrics
   */
  getModelStats() {
    const stats = {};
    
    Object.keys(this.models).forEach(modelType => {
      stats[modelType] = {
        loaded: this.models[modelType] !== null,
        lastTrained: this.lastTrainingTime
      };
    });

    return {
      models: stats,
      isTraining: this.isTraining,
      lastTrainingTime: this.lastTrainingTime
    };
  }
}

module.exports = new MLTrainingService();