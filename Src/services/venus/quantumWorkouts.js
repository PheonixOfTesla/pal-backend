// Src/services/quantumWorkouts.js - Quantum-Randomized Training for Plateau Prevention
const crypto = require('crypto');
const Exercise = require('../../models/venus/Exercise');
const Workout = require('../../models/venus/Workout');
const WearableData = require('../../models/mercury/WearableData');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class QuantumWorkoutService {
  constructor() {
    this.genAI = process.env.GOOGLE_AI_API_KEY 
      ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY) 
      : null;
    
    // Chaos theory parameters
    this.chaosParameters = {
      lyapunovExponent: 0.347, // Sensitive dependence on initial conditions
      bifurcationPoint: 3.57, // Where system becomes chaotic
      strangeAttractor: 2.502, // Pattern emergence threshold
      entropyLevel: 0.618 // Golden ratio for optimal randomness
    };
    
    // Quantum-inspired randomness seeds
    this.quantumSeeds = this.initializeQuantumSeeds();
    
    // Exercise variation patterns
    this.variationPatterns = {
      mechanical: ['tempo', 'pause', 'explosive', 'slow-negative', 'partial', '1.5-reps'],
      angular: ['wide-grip', 'close-grip', 'neutral', 'pronated', 'supinated', 'mixed'],
      planar: ['incline', 'decline', 'flat', 'vertical', 'horizontal', 'diagonal'],
      stability: ['stable', 'unstable', 'unilateral', 'alternating', 'isometric', 'dynamic'],
      intensity: ['heavy', 'moderate', 'light', 'dropset', 'pyramid', 'cluster']
    };
    
    // Neural adaptation windows
    this.adaptationWindows = {
      strength: 21, // days
      hypertrophy: 28,
      endurance: 14,
      power: 10,
      neurological: 7
    };
    
    // Pattern history to prevent repetition
    this.patternHistory = new Map();
  }

  /**
   * Initialize quantum-inspired random seeds
   */
  initializeQuantumSeeds() {
    const seeds = [];
    for (let i = 0; i < 100; i++) {
      // Simulate quantum randomness with crypto + timestamp entropy
      const quantumNoise = crypto.randomBytes(32);
      const timeEntropy = Date.now() % 1000;
      const seed = parseInt(quantumNoise.toString('hex').slice(0, 8), 16) ^ timeEntropy;
      seeds.push(seed);
    }
    return seeds;
  }

  /**
   * Generate quantum-randomized workout
   */
  async generateQuantumWorkout(userId, targetMuscles, workoutType = 'auto') {
    console.log(`🎲 Generating quantum workout for user ${userId}`);
    
    try {
      // Get user's recent data for adaptation analysis
      const userData = await this.getUserAdaptationData(userId);
      
      // Detect if user is plateauing
      const plateauRisk = this.detectPlateauRisk(userData);
      
      // Generate chaos-influenced parameters
      const chaosParams = this.generateChaosParameters(userData, plateauRisk);
      
      // Select exercises using quantum randomization
      const exercises = await this.selectQuantumExercises(
        targetMuscles,
        userData.recentExercises,
        chaosParams
      );
      
      // Apply variation patterns
      const variedExercises = this.applyVariationPatterns(exercises, chaosParams);
      
      // Generate set/rep schemes with chaos theory
      const programmingScheme = this.generateChaoticProgramming(
        variedExercises,
        userData,
        chaosParams
      );
      
      // Create the workout
      const workout = {
        name: await this.generateWorkoutName(targetMuscles, chaosParams),
        clientId: userId,
        scheduledDate: new Date(),
        exercises: programmingScheme,
        quantumSeed: this.getCurrentQuantumSeed(),
        chaosLevel: chaosParams.chaosLevel,
        plateauBreakProtocol: plateauRisk > 0.7,
        variationScore: chaosParams.variationScore,
        notes: this.generateWorkoutNotes(chaosParams, plateauRisk)
      };
      
      // Store pattern to prevent repetition
      await this.storePatternHistory(userId, workout);
      
      // Get AI insights if available
      if (this.genAI && userData.wearableData) {
        workout.aiOptimization = await this.generateAIOptimization(
          workout,
          userData,
          chaosParams
        );
      }
      
      console.log(`✅ Quantum workout generated with chaos level ${chaosParams.chaosLevel}`);
      return workout;
      
    } catch (error) {
      console.error('❌ Quantum workout generation failed:', error);
      throw error;
    }
  }

  /**
   * Get user's adaptation data
   */
  async getUserAdaptationData(userId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [workouts, wearableData] = await Promise.all([
      Workout.find({
        clientId: userId,
        completedAt: { $gte: thirtyDaysAgo }
      }).sort('-completedAt').lean(),
      
      WearableData.find({
        userId,
        date: { $gte: thirtyDaysAgo }
      }).sort('-date').limit(7).lean()
    ]);
    
    // Extract recent exercises to avoid repetition
    const recentExercises = new Set();
    workouts.forEach(w => {
      w.exercises?.forEach(e => recentExercises.add(e.name));
    });
    
    // Calculate performance trends
    const performanceTrend = this.calculatePerformanceTrend(workouts);
    
    return {
      workouts,
      wearableData,
      recentExercises: Array.from(recentExercises),
      performanceTrend,
      workoutCount: workouts.length,
      avgRecovery: this.calculateAverageRecovery(wearableData)
    };
  }

  /**
   * Detect plateau risk using pattern analysis
   */
  detectPlateauRisk(userData) {
    let riskScore = 0;
    
    // Check performance trend stagnation
    if (userData.performanceTrend) {
      const { strength, volume, frequency } = userData.performanceTrend;
      
      // No strength gains in 2+ weeks
      if (strength.weeksWithoutProgress >= 2) riskScore += 0.3;
      
      // Volume hasn't changed in 3+ weeks
      if (volume.weeksStagnant >= 3) riskScore += 0.25;
      
      // Same frequency pattern for 4+ weeks
      if (frequency.weeksUnchanged >= 4) riskScore += 0.2;
    }
    
    // Check exercise variety
    const uniqueExercises = userData.recentExercises.length;
    if (uniqueExercises < 10) riskScore += 0.15;
    if (uniqueExercises < 5) riskScore += 0.25;
    
    // Check recovery patterns
    if (userData.avgRecovery > 85) {
      // Too well recovered might mean insufficient stimulus
      riskScore += 0.1;
    }
    
    return Math.min(riskScore, 1);
  }

  /**
   * Generate chaos parameters based on user state
   */
  generateChaosParameters(userData, plateauRisk) {
    const baseEntropy = this.chaosParameters.entropyLevel;
    
    // Increase chaos when plateau risk is high
    const chaosMultiplier = 1 + (plateauRisk * this.chaosParameters.bifurcationPoint);
    
    // Calculate variation needs
    const variationScore = this.calculateVariationScore(userData, plateauRisk);
    
    // Generate Lorenz attractor coordinates for exercise selection
    const lorenzCoords = this.calculateLorenzAttractor(
      userData.workoutCount,
      chaosMultiplier
    );
    
    return {
      chaosLevel: Math.min(plateauRisk * chaosMultiplier, 1),
      variationScore,
      entropy: baseEntropy * chaosMultiplier,
      lorenzX: lorenzCoords.x,
      lorenzY: lorenzCoords.y,
      lorenzZ: lorenzCoords.z,
      bifurcation: plateauRisk > 0.5,
      quantumFluctuation: this.getQuantumFluctuation()
    };
  }

  /**
   * Select exercises using quantum randomization
   */
  async selectQuantumExercises(targetMuscles, recentExercises, chaosParams) {
    // Get all possible exercises for target muscles
    const availableExercises = await Exercise.find({
      muscleCategory: { $in: targetMuscles },
      isPublic: true
    }).lean();
    
    if (availableExercises.length === 0) {
      throw new Error('No exercises available for selected muscles');
    }
    
    // Filter out recent exercises based on chaos level
    const recentThreshold = Math.floor(10 * (1 - chaosParams.chaosLevel));
    const filtered = availableExercises.filter(e => {
      const daysAgo = recentExercises.indexOf(e.name);
      return daysAgo === -1 || daysAgo > recentThreshold;
    });
    
    // Use quantum selection algorithm
    const selected = [];
    const numExercises = this.calculateOptimalExerciseCount(chaosParams);
    
    for (let i = 0; i < numExercises; i++) {
      const quantumIndex = this.quantumSelect(
        filtered.length,
        chaosParams.lorenzX + i
      );
      
      const exercise = filtered[quantumIndex];
      if (exercise && !selected.find(s => s.name === exercise.name)) {
        selected.push(exercise);
      }
    }
    
    // Add chaos exercises if high plateau risk
    if (chaosParams.bifurcation) {
      const chaosExercise = this.selectChaosExercise(targetMuscles[0]);
      if (chaosExercise) selected.push(chaosExercise);
    }
    
    return selected;
  }

  /**
   * Apply variation patterns to exercises
   */
  applyVariationPatterns(exercises, chaosParams) {
    return exercises.map(exercise => {
      const variations = [];
      
      // Select variation patterns based on chaos level
      const numVariations = Math.floor(1 + chaosParams.variationScore * 3);
      
      for (const [type, options] of Object.entries(this.variationPatterns)) {
        if (this.quantumBool(chaosParams.entropy)) {
          const variation = options[this.quantumSelect(options.length, chaosParams.lorenzY)];
          variations.push({ type, variation });
        }
        
        if (variations.length >= numVariations) break;
      }
      
      return {
        ...exercise,
        variations,
        chaosModified: variations.length > 0,
        complexityScore: variations.length / 5
      };
    });
  }

  /**
   * Generate chaotic programming (sets/reps/weight)
   */
  generateChaoticProgramming(exercises, userData, chaosParams) {
    return exercises.map((exercise, index) => {
      // Base programming
      let sets, reps, intensity;
      
      // Use chaos to determine programming style
      const style = this.selectProgrammingStyle(chaosParams, userData.avgRecovery);
      
      switch(style) {
        case 'wave':
          sets = 3 + this.quantumSelect(3, chaosParams.lorenzZ);
          reps = this.generateWaveReps(sets, chaosParams);
          intensity = this.generateWaveIntensity(sets, chaosParams);
          break;
          
        case 'cluster':
          sets = 4 + this.quantumSelect(2, chaosParams.lorenzX);
          reps = this.generateClusterReps(chaosParams);
          intensity = 85 + this.quantumSelect(10, chaosParams.lorenzY);
          break;
          
        case 'pyramid':
          sets = 4 + this.quantumSelect(2, chaosParams.lorenzZ);
          reps = this.generatePyramidReps(sets, chaosParams);
          intensity = this.generatePyramidIntensity(sets, chaosParams);
          break;
          
        case 'chaos':
          sets = 3 + this.quantumSelect(4, Date.now());
          reps = this.generateChaosReps(sets, chaosParams);
          intensity = this.generateChaosIntensity(chaosParams);
          break;
          
        default:
          sets = 3 + this.quantumSelect(2, index);
          reps = `${8 + this.quantumSelect(4, chaosParams.lorenzX)}`;
          intensity = 70 + this.quantumSelect(15, chaosParams.lorenzY);
      }
      
      // Apply variations to the programming
      const tempo = this.generateTempo(chaosParams);
      const rest = this.generateRestPeriod(intensity, chaosParams);
      
      return {
        name: exercise.name,
        sets,
        reps,
        intensity: `${intensity}%`,
        tempo,
        rest: `${rest}s`,
        variations: exercise.variations,
        technique: this.selectTechnique(exercise, chaosParams),
        notes: this.generateExerciseNotes(exercise, style, chaosParams)
      };
    });
  }

  /**
   * Calculate Lorenz attractor for chaos theory application
   */
  calculateLorenzAttractor(iterations, chaos) {
    let x = 0.1, y = 0, z = 0;
    const dt = 0.01;
    const sigma = 10 * chaos;
    const rho = 28;
    const beta = 8/3;
    
    for (let i = 0; i < iterations; i++) {
      const dx = sigma * (y - x) * dt;
      const dy = (x * (rho - z) - y) * dt;
      const dz = (x * y - beta * z) * dt;
      
      x += dx;
      y += dy;
      z += dz;
    }
    
    return {
      x: Math.abs(x) % 100,
      y: Math.abs(y) % 100,
      z: Math.abs(z) % 100
    };
  }

  /**
   * Quantum selection algorithm
   */
  quantumSelect(max, seed) {
    const quantumSeed = this.quantumSeeds[Math.abs(seed) % this.quantumSeeds.length];
    const random = (quantumSeed * 9301 + 49297) % 233280;
    return Math.floor((random / 233280) * max);
  }

  /**
   * Quantum boolean decision
   */
  quantumBool(probability) {
    const quantum = crypto.randomBytes(1)[0] / 255;
    return quantum < probability;
  }

  /**
   * Get current quantum seed
   */
  getCurrentQuantumSeed() {
    const index = Date.now() % this.quantumSeeds.length;
    return this.quantumSeeds[index];
  }

  /**
   * Get quantum fluctuation value
   */
  getQuantumFluctuation() {
    const bytes = crypto.randomBytes(4);
    return bytes.readUInt32BE(0) / 0xffffffff;
  }

  /**
   * Generate workout name using AI or patterns
   */
  async generateWorkoutName(targetMuscles, chaosParams) {
    const prefixes = ['Quantum', 'Chaos', 'Neural', 'Adaptive', 'Dynamic', 'Fractal'];
    const suffixes = ['Protocol', 'System', 'Matrix', 'Sequence', 'Pattern', 'Wave'];
    
    const prefix = prefixes[this.quantumSelect(prefixes.length, chaosParams.lorenzX)];
    const suffix = suffixes[this.quantumSelect(suffixes.length, chaosParams.lorenzY)];
    
    const muscleString = targetMuscles.join(' & ');
    
    if (chaosParams.bifurcation) {
      return `${prefix} ${muscleString} Bifurcation ${suffix}`;
    }
    
    return `${prefix} ${muscleString} ${suffix}`;
  }

  /**
   * Calculate optimal exercise count based on chaos
   */
  calculateOptimalExerciseCount(chaosParams) {
    const base = 4;
    const chaosModifier = Math.floor(chaosParams.chaosLevel * 3);
    const quantum = this.quantumSelect(3, chaosParams.lorenzZ);
    
    return Math.min(Math.max(base + chaosModifier - quantum, 3), 8);
  }

  /**
   * Select chaos exercise (unusual movement pattern)
   */
  selectChaosExercise(muscle) {
    const chaosExercises = {
      chest: { name: 'Chaos Push-Up', description: 'Random tempo each rep' },
      back: { name: 'Pendulum Row', description: 'Swinging momentum rows' },
      legs: { name: 'Quantum Squat', description: 'Random pause positions' },
      shoulders: { name: 'Fractal Press', description: 'Changing angles each rep' },
      arms: { name: 'Bifurcation Curl', description: 'Alternating grip each rep' }
    };
    
    return chaosExercises[muscle.toLowerCase()] || null;
  }

  /**
   * Select programming style based on chaos
   */
  selectProgrammingStyle(chaosParams, recovery) {
    const styles = ['wave', 'cluster', 'pyramid', 'chaos', 'standard'];
    const weights = [
      chaosParams.chaosLevel * 0.3,
      chaosParams.variationScore * 0.25,
      (1 - chaosParams.chaosLevel) * 0.2,
      chaosParams.bifurcation ? 0.4 : 0.1,
      0.15
    ];
    
    const random = this.getQuantumFluctuation();
    let cumulative = 0;
    
    for (let i = 0; i < styles.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        return styles[i];
      }
    }
    
    return 'standard';
  }

  /**
   * Generate wave loading reps
   */
  generateWaveReps(sets, chaosParams) {
    const waves = [];
    for (let i = 0; i < sets; i++) {
      const base = 3 + this.quantumSelect(5, chaosParams.lorenzX + i);
      waves.push(base);
    }
    return waves.join(',');
  }

  /**
   * Generate cluster reps
   */
  generateClusterReps(chaosParams) {
    const clusters = [];
    const numClusters = 3 + this.quantumSelect(2, chaosParams.lorenzY);
    
    for (let i = 0; i < numClusters; i++) {
      clusters.push(2 + this.quantumSelect(2, chaosParams.lorenzZ + i));
    }
    
    return clusters.join('+');
  }

  /**
   * Generate pyramid reps
   */
  generatePyramidReps(sets, chaosParams) {
    const reps = [];
    const peak = Math.floor(sets / 2);
    
    for (let i = 0; i < sets; i++) {
      if (i <= peak) {
        reps.push(12 - i * 2);
      } else {
        reps.push(6 + (i - peak) * 2);
      }
    }
    
    return reps.join(',');
  }

  /**
   * Generate chaos reps
   */
  generateChaosReps(sets, chaosParams) {
    const reps = [];
    
    for (let i = 0; i < sets; i++) {
      const chaosRep = 5 + this.quantumSelect(10, 
        chaosParams.lorenzX * chaosParams.lorenzY * (i + 1)
      );
      reps.push(chaosRep);
    }
    
    return reps.join(',');
  }

  /**
   * Generate wave intensity
   */
  generateWaveIntensity(sets, chaosParams) {
    const base = 70 + this.quantumSelect(15, chaosParams.lorenzZ);
    return Array(sets).fill(base).map((b, i) => 
      b + Math.sin(i * Math.PI / sets) * 10
    ).map(Math.round);
  }

  /**
   * Generate pyramid intensity
   */
  generatePyramidIntensity(sets, chaosParams) {
    const start = 65 + this.quantumSelect(10, chaosParams.lorenzX);
    const peak = 85 + this.quantumSelect(10, chaosParams.lorenzY);
    
    const intensities = [];
    const peakSet = Math.floor(sets / 2);
    
    for (let i = 0; i < sets; i++) {
      if (i <= peakSet) {
        const progress = i / peakSet;
        intensities.push(Math.round(start + (peak - start) * progress));
      } else {
        const progress = (i - peakSet) / (sets - peakSet - 1);
        intensities.push(Math.round(peak - (peak - start) * progress));
      }
    }
    
    return intensities;
  }

  /**
   * Generate chaos intensity
   */
  generateChaosIntensity(chaosParams) {
    const base = 50 + this.quantumSelect(30, chaosParams.quantumFluctuation * 1000);
    const variation = this.quantumSelect(20, chaosParams.lorenzX);
    return base + variation;
  }

  /**
   * Generate tempo prescription
   */
  generateTempo(chaosParams) {
    if (!this.quantumBool(chaosParams.variationScore)) {
      return null;
    }
    
    const eccentric = 2 + this.quantumSelect(4, chaosParams.lorenzX);
    const pause = this.quantumSelect(3, chaosParams.lorenzY);
    const concentric = this.quantumBool(0.3) ? 'X' : (1 + this.quantumSelect(2, chaosParams.lorenzZ));
    const top = this.quantumSelect(2, chaosParams.quantumFluctuation * 100);
    
    return `${eccentric}${pause}${concentric}${top}`;
  }

  /**
   * Generate rest period
   */
  generateRestPeriod(intensity, chaosParams) {
    const baseRest = intensity > 85 ? 180 : intensity > 70 ? 120 : 90;
    const chaosModifier = this.quantumSelect(60, chaosParams.lorenzZ) - 30;
    return Math.max(30, baseRest + chaosModifier);
  }

  /**
   * Select technique modification
   */
  selectTechnique(exercise, chaosParams) {
    const techniques = [
      'standard',
      'rest-pause',
      'drop-set',
      'mechanical-drop',
      'iso-hold',
      'partial-reps',
      '21s'
    ];
    
    if (!this.quantumBool(chaosParams.variationScore * 0.5)) {
      return 'standard';
    }
    
    return techniques[this.quantumSelect(techniques.length, chaosParams.lorenzY)];
  }

  /**
   * Helper functions
   */
  
  calculatePerformanceTrend(workouts) {
    // Analyze strength, volume, and frequency trends
    const trend = {
      strength: { weeksWithoutProgress: 0 },
      volume: { weeksStagnant: 0 },
      frequency: { weeksUnchanged: 0 }
    };
    
    // Simplified trend calculation
    if (workouts.length < 4) return trend;
    
    // Check if weights have increased
    const recentWeights = [];
    workouts.slice(0, 4).forEach(w => {
      w.exercises?.forEach(e => {
        if (e.weight) recentWeights.push(e.weight);
      });
    });
    
    if (recentWeights.length > 0) {
      const avgRecent = recentWeights.reduce((a, b) => a + b) / recentWeights.length;
      const olderWeights = [];
      
      workouts.slice(4, 8).forEach(w => {
        w.exercises?.forEach(e => {
          if (e.weight) olderWeights.push(e.weight);
        });
      });
      
      if (olderWeights.length > 0) {
        const avgOlder = olderWeights.reduce((a, b) => a + b) / olderWeights.length;
        if (avgRecent <= avgOlder) {
          trend.strength.weeksWithoutProgress = 2;
        }
      }
    }
    
    return trend;
  }
  
  calculateAverageRecovery(wearableData) {
    if (!wearableData || wearableData.length === 0) return 70;
    
    const recoveries = wearableData
      .filter(d => d.recoveryScore)
      .map(d => d.recoveryScore);
    
    if (recoveries.length === 0) return 70;
    
    return Math.round(recoveries.reduce((a, b) => a + b) / recoveries.length);
  }
  
  calculateVariationScore(userData, plateauRisk) {
    const base = 0.3;
    const plateauBonus = plateauRisk * 0.4;
    const stagnationBonus = userData.performanceTrend?.strength?.weeksWithoutProgress 
      ? 0.2 : 0;
    const lowVarietyBonus = userData.recentExercises.length < 10 ? 0.1 : 0;
    
    return Math.min(base + plateauBonus + stagnationBonus + lowVarietyBonus, 1);
  }
  
  generateExerciseNotes(exercise, style, chaosParams) {
    const notes = [];
    
    if (chaosParams.bifurcation) {
      notes.push('⚡ Plateau-breaking protocol active');
    }
    
    if (style === 'chaos') {
      notes.push('🎲 Randomized rep scheme - follow instinct');
    }
    
    if (exercise.variations?.length > 2) {
      notes.push('🔄 Multiple variations - prevents adaptation');
    }
    
    if (chaosParams.chaosLevel > 0.7) {
      notes.push('🌀 High chaos - embrace the unpredictability');
    }
    
    return notes.join('. ');
  }
  
  generateWorkoutNotes(chaosParams, plateauRisk) {
    const notes = [];
    
    notes.push(`Quantum seed: ${this.getCurrentQuantumSeed()}`);
    notes.push(`Chaos level: ${(chaosParams.chaosLevel * 100).toFixed(0)}%`);
    notes.push(`Plateau risk: ${(plateauRisk * 100).toFixed(0)}%`);
    
    if (plateauRisk > 0.7) {
      notes.push('⚠️ HIGH PLATEAU RISK - Maximum variation applied');
    }
    
    if (chaosParams.bifurcation) {
      notes.push('🔀 Bifurcation point reached - system entering chaos');
    }
    
    return notes.join(' | ');
  }
  
  async storePatternHistory(userId, workout) {
    const pattern = {
      exercises: workout.exercises.map(e => e.name).sort().join(','),
      style: workout.exercises[0]?.style || 'standard',
      timestamp: Date.now()
    };
    
    const key = `${userId}:patterns`;
    let history = this.patternHistory.get(key) || [];
    
    // Keep only last 20 patterns
    history = [pattern, ...history].slice(0, 20);
    this.patternHistory.set(key, history);
  }
  
  async generateAIOptimization(workout, userData, chaosParams) {
    if (!this.genAI) return null;
    
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 200
        }
      });
      
      const prompt = `Analyze this quantum-generated workout and provide optimization:

Workout: ${workout.name}
Exercises: ${workout.exercises.length}
Chaos Level: ${(chaosParams.chaosLevel * 100).toFixed(0)}%
Plateau Risk: ${(chaosParams.plateauRisk * 100).toFixed(0)}%
User Recovery: ${userData.avgRecovery}%

Provide ONE specific adjustment to maximize adaptation while preventing overtraining.
Keep response under 50 words.`;
      
      const result = await model.generateContent(prompt);
      return result.response.text();
      
    } catch (error) {
      console.error('AI optimization failed:', error);
      return null;
    }
  }
}

// Export singleton instance
module.exports = new QuantumWorkoutService();