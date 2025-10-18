// Src/controllers/venusController.js - Advanced Nutrition AI System
const Nutrition = require('../models/Nutrition');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Goal = require('../models/Goal');
const User = require('../models/User');
const CalendarEvent = require('../models/CalenderEvent');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const EventEmitter = require('events');

class VenusController extends EventEmitter {
  constructor() {
    super();
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
    this.nutritionDatabase = new Map();
    this.mealPatterns = new Map();
    this.adaptationRules = {
      recovery: {
        low: { protein: 1.2, carbs: 0.8, fat: 1.0 },
        medium: { protein: 1.0, carbs: 1.0, fat: 1.0 },
        high: { protein: 0.9, carbs: 1.2, fat: 0.9 }
      },
      training: {
        rest: { protein: 1.0, carbs: 0.7, fat: 1.1 },
        light: { protein: 1.1, carbs: 0.9, fat: 1.0 },
        intense: { protein: 1.3, carbs: 1.4, fat: 0.9 }
      }
    };
  }

  // ============================================
  // INTELLIGENT MEAL PLANNING AI
  // ============================================
  
  async generateIntelligentMealPlan(req, res) {
    try {
      const { userId } = req.params;
      const { preferences, restrictions, budget } = req.body;
      
      // Gather comprehensive user data
      const [user, currentNutrition, wearableData, upcomingWorkouts, goals, calendar] = await Promise.all([
        User.findById(userId),
        Nutrition.findOne({ clientId: userId }),
        WearableData.findOne({ userId }).sort('-date'),
        Workout.find({ 
          clientId: userId,
          scheduledDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
        }),
        Goal.find({ clientId: userId, completed: false }),
        CalendarEvent.find({
          userId,
          startTime: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
        })
      ]);
      
      // Calculate adaptive macro targets
      const macroTargets = await this.calculateAdaptiveMacros({
        user,
        currentNutrition,
        wearableData,
        upcomingWorkouts,
        goals
      });
      
      // Generate meal plan with AI
      const mealPlan = await this.generateAIMealPlan({
        macroTargets,
        preferences,
        restrictions,
        budget,
        calendar // Consider social events
      });
      
      // Optimize meal timing based on training and sleep
      const optimizedPlan = this.optimizeMealTiming(mealPlan, {
        workouts: upcomingWorkouts,
        sleepPattern: wearableData?.sleepPattern,
        calendar
      });
      
      // Create shopping list with budget optimization
      const shoppingList = await this.generateShoppingList(optimizedPlan, budget);
      
      // Save the new meal plan
      const savedPlan = await Nutrition.findOneAndUpdate(
        { clientId: userId },
        {
          protein: macroTargets.protein,
          carbs: macroTargets.carbs,
          fat: macroTargets.fat,
          calories: macroTargets.calories,
          mealPlan: optimizedPlan.meals,
          weeklyPlan: optimizedPlan.weekly,
          shoppingList,
          lastGenerated: new Date()
        },
        { upsert: true, new: true }
      );
      
      // Emit event for cross-system updates
      this.emit('nutrition.plan.generated', {
        userId,
        macroTargets,
        mealCount: optimizedPlan.meals.length
      });
      
      res.json({
        success: true,
        mealPlan: optimizedPlan,
        macroTargets,
        shoppingList,
        estimatedCost: shoppingList.totalCost,
        adaptations: {
          recoveryAdjusted: wearableData?.recoveryScore < 60,
          trainingAligned: upcomingWorkouts.length > 0,
          goalOptimized: goals.map(g => g.name)
        }
      });
      
    } catch (error) {
      console.error('Meal plan generation error:', error);
      res.status(500).json({ success: false, message: 'Failed to generate meal plan' });
    }
  }

  // ============================================
  // REAL-TIME MACRO TRACKING
  // ============================================
  
  async trackMacrosRealtime(req, res) {
    try {
      const { userId } = req.params;
      const { mealData, photo, barcode } = req.body;
      
      let nutritionData;
      
      // Process based on input type
      if (photo) {
        nutritionData = await this.analyzePhotoNutrition(photo);
      } else if (barcode) {
        nutritionData = await this.lookupBarcode(barcode);
      } else {
        nutritionData = await this.processManualEntry(mealData);
      }
      
      // Get current daily totals
      const nutrition = await Nutrition.findOne({ clientId: userId });
      if (!nutrition) {
        return res.status(404).json({ success: false, message: 'Nutrition plan not found' });
      }
      
      // Update current values
      nutrition.protein.current += nutritionData.protein;
      nutrition.carbs.current += nutritionData.carbs;
      nutrition.fat.current += nutritionData.fat;
      nutrition.calories.current += nutritionData.calories;
      
      // Add to daily log
      nutrition.dailyLogs.push({
        ...nutritionData,
        timestamp: new Date(),
        mealType: this.determineMealType()
      });
      
      await nutrition.save();
      
      // Calculate remaining macros for the day
      const remaining = {
        protein: Math.max(0, nutrition.protein.target - nutrition.protein.current),
        carbs: Math.max(0, nutrition.carbs.target - nutrition.carbs.current),
        fat: Math.max(0, nutrition.fat.target - nutrition.fat.current),
        calories: Math.max(0, nutrition.calories.target - nutrition.calories.current)
      };
      
      // Generate smart suggestions for remaining meals
      const suggestions = await this.generateMealSuggestions(remaining, new Date().getHours());
      
      // Check for macro imbalances
      const warnings = this.checkMacroImbalances(nutrition);
      
      // Send real-time notification
      if (global.sendRealtimeNotification) {
        global.sendRealtimeNotification(userId, {
          type: 'nutrition_update',
          current: {
            protein: nutrition.protein.current,
            carbs: nutrition.carbs.current,
            fat: nutrition.fat.current,
            calories: nutrition.calories.current
          },
          remaining,
          percentComplete: Math.round((nutrition.calories.current / nutrition.calories.target) * 100)
        });
      }
      
      res.json({
        success: true,
        tracked: nutritionData,
        current: {
          protein: nutrition.protein.current,
          carbs: nutrition.carbs.current,
          fat: nutrition.fat.current,
          calories: nutrition.calories.current
        },
        remaining,
        suggestions,
        warnings
      });
      
    } catch (error) {
      console.error('Macro tracking error:', error);
      res.status(500).json({ success: false, message: 'Failed to track macros' });
    }
  }

  // ============================================
  // WORKOUT-NUTRITION SYNCHRONIZATION
  // ============================================
  
  async syncNutritionWithWorkout(req, res) {
    try {
      const { userId } = req.params;
      const { workoutId } = req.body;
      
      // Get workout details
      const workout = await Workout.findById(workoutId);
      if (!workout) {
        return res.status(404).json({ success: false, message: 'Workout not found' });
      }
      
      // Calculate workout energy expenditure
      const energyExpended = this.calculateWorkoutEnergy(workout);
      
      // Get current nutrition plan
      const nutrition = await Nutrition.findOne({ clientId: userId });
      
      // Adjust macros for workout
      const adjustedMacros = this.adjustMacrosForWorkout({
        baseline: nutrition,
        energyExpended,
        workoutType: this.classifyWorkout(workout),
        timing: workout.scheduledDate
      });
      
      // Generate pre/post workout nutrition
      const workoutNutrition = await this.generateWorkoutNutrition({
        workoutType: this.classifyWorkout(workout),
        intensity: this.calculateWorkoutIntensity(workout),
        duration: workout.duration || 60,
        adjustedMacros
      });
      
      // Update nutrition plan
      nutrition.workoutAdjustments = nutrition.workoutAdjustments || [];
      nutrition.workoutAdjustments.push({
        workoutId,
        date: workout.scheduledDate,
        adjustedMacros,
        preWorkout: workoutNutrition.pre,
        postWorkout: workoutNutrition.post,
        energyExpended
      });
      
      await nutrition.save();
      
      // Emit event for system-wide coordination
      this.emit('nutrition.workout.synced', {
        userId,
        workoutId,
        energyExpended,
        macroAdjustment: adjustedMacros
      });
      
      res.json({
        success: true,
        adjustedMacros,
        workoutNutrition,
        energyExpended,
        recommendations: {
          preWorkout: workoutNutrition.pre,
          duringWorkout: workoutNutrition.during,
          postWorkout: workoutNutrition.post
        }
      });
      
    } catch (error) {
      console.error('Workout nutrition sync error:', error);
      res.status(500).json({ success: false, message: 'Failed to sync nutrition' });
    }
  }

  // ============================================
  // SUPPLEMENT OPTIMIZATION
  // ============================================
  
  async optimizeSupplements(req, res) {
    try {
      const { userId } = req.params;
      const { currentSupplements = [], budget = 100 } = req.body;
      
      // Get user data for analysis
      const [user, nutrition, wearableData, goals, workouts] = await Promise.all([
        User.findById(userId),
        Nutrition.findOne({ clientId: userId }),
        WearableData.find({ userId }).sort('-date').limit(30),
        Goal.find({ clientId: userId, completed: false }),
        Workout.find({ clientId: userId }).sort('-scheduledDate').limit(30)
      ]);
      
      // Analyze deficiencies and needs
      const analysis = {
        nutritionalGaps: this.analyzeNutritionalGaps(nutrition),
        recoveryNeeds: this.analyzeRecoveryNeeds(wearableData),
        performanceGoals: this.analyzePerformanceGoals(goals),
        trainingIntensity: this.analyzeTrainingIntensity(workouts)
      };
      
      // Generate supplement recommendations
      const recommendations = await this.generateSupplementPlan({
        analysis,
        currentSupplements,
        budget,
        userProfile: user
      });
      
      // Prioritize by impact and cost-effectiveness
      const prioritized = this.prioritizeSupplements(recommendations, {
        budget,
        goals: goals.map(g => g.name),
        currentIssues: analysis
      });
      
      // Generate timing protocol
      const timingProtocol = this.generateSupplementTiming(prioritized, {
        workoutSchedule: this.extractWorkoutSchedule(workouts),
        sleepPattern: this.extractSleepPattern(wearableData)
      });
      
      // Calculate expected outcomes
      const expectedOutcomes = await this.predictSupplementOutcomes(prioritized, analysis);
      
      res.json({
        success: true,
        recommendations: prioritized,
        timingProtocol,
        expectedOutcomes,
        monthlyBudget: prioritized.reduce((sum, s) => sum + s.monthlyCost, 0),
        analysis
      });
      
    } catch (error) {
      console.error('Supplement optimization error:', error);
      res.status(500).json({ success: false, message: 'Failed to optimize supplements' });
    }
  }

  // ============================================
  // HYDRATION INTELLIGENCE
  // ============================================
  
  async trackHydrationIntelligently(req, res) {
    try {
      const { userId } = req.params;
      const { amount, type = 'water' } = req.body;
      
      // Get current context
      const [wearableData, workout, weather, nutrition] = await Promise.all([
        WearableData.findOne({ userId }).sort('-date'),
        Workout.findOne({ 
          clientId: userId,
          scheduledDate: { 
            $gte: new Date().setHours(0,0,0,0),
            $lte: new Date().setHours(23,59,59,999)
          }
        }),
        this.getLocalWeather(userId),
        Nutrition.findOne({ clientId: userId })
      ]);
      
      // Calculate dynamic hydration needs
      const hydrationNeeds = this.calculateHydrationNeeds({
        baselineWeight: 75, // Should come from user profile
        activityLevel: workout ? 'high' : 'moderate',
        temperature: weather?.temperature || 20,
        humidity: weather?.humidity || 50,
        sweatRate: wearableData?.sweatRate,
        caffeineIntake: this.calculateCaffeineIntake(nutrition?.dailyLogs)
      });
      
      // Update hydration tracking
      if (!nutrition.hydration) {
        nutrition.hydration = {
          target: hydrationNeeds.daily,
          current: 0,
          logs: []
        };
      }
      
      nutrition.hydration.current += amount;
      nutrition.hydration.logs.push({
        amount,
        type,
        timestamp: new Date()
      });
      
      await nutrition.save();
      
      // Calculate hydration status
      const hydrationStatus = {
        current: nutrition.hydration.current,
        target: hydrationNeeds.daily,
        percentage: Math.round((nutrition.hydration.current / hydrationNeeds.daily) * 100),
        remaining: Math.max(0, hydrationNeeds.daily - nutrition.hydration.current),
        optimalIntakeRate: hydrationNeeds.hourlyRate
      };
      
      // Generate reminders
      const reminders = this.generateHydrationReminders(hydrationStatus, {
        workout,
        currentHour: new Date().getHours()
      });
      
      res.json({
        success: true,
        hydrationStatus,
        reminders,
        recommendations: {
          beforeWorkout: workout ? hydrationNeeds.preWorkout : null,
          duringWorkout: workout ? hydrationNeeds.duringWorkout : null,
          afterWorkout: workout ? hydrationNeeds.postWorkout : null
        }
      });
      
    } catch (error) {
      console.error('Hydration tracking error:', error);
      res.status(500).json({ success: false, message: 'Failed to track hydration' });
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================
  
  async calculateAdaptiveMacros({ user, currentNutrition, wearableData, upcomingWorkouts, goals }) {
    // Base calculation from user stats
    const weight = user.weight || 75; // kg
    const activityLevel = this.calculateActivityLevel(upcomingWorkouts);
    
    let protein = weight * 2.0; // g/kg for active individuals
    let carbs = weight * 4.0;
    let fat = weight * 1.0;
    
    // Adjust for recovery status
    if (wearableData?.recoveryScore < 50) {
      protein *= this.adaptationRules.recovery.low.protein;
      carbs *= this.adaptationRules.recovery.low.carbs;
      fat *= this.adaptationRules.recovery.low.fat;
    }
    
    // Adjust for training intensity
    const trainingIntensity = this.assessTrainingIntensity(upcomingWorkouts);
    protein *= this.adaptationRules.training[trainingIntensity].protein;
    carbs *= this.adaptationRules.training[trainingIntensity].carbs;
    fat *= this.adaptationRules.training[trainingIntensity].fat;
    
    // Goal-specific adjustments
    goals.forEach(goal => {
      if (goal.name.toLowerCase().includes('weight loss')) {
        carbs *= 0.8;
        fat *= 0.9;
      } else if (goal.name.toLowerCase().includes('muscle')) {
        protein *= 1.2;
        carbs *= 1.1;
      }
    });
    
    const calories = (protein * 4) + (carbs * 4) + (fat * 9);
    
    return {
      protein: { target: Math.round(protein), current: 0 },
      carbs: { target: Math.round(carbs), current: 0 },
      fat: { target: Math.round(fat), current: 0 },
      calories: { target: Math.round(calories), current: 0 }
    };
  }
  
  async generateAIMealPlan({ macroTargets, preferences, restrictions, budget, calendar }) {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const prompt = `Generate a detailed 7-day meal plan with these requirements:
    
    MACRO TARGETS (daily):
    - Protein: ${macroTargets.protein.target}g
    - Carbs: ${macroTargets.carbs.target}g
    - Fat: ${macroTargets.fat.target}g
    - Calories: ${macroTargets.calories.target}
    
    PREFERENCES: ${JSON.stringify(preferences)}
    RESTRICTIONS: ${JSON.stringify(restrictions)}
    BUDGET: $${budget}/week
    
    Consider these calendar events: ${calendar.map(e => `${e.title} at ${e.startTime}`).join(', ')}
    
    Provide specific meals with:
    1. Exact portions and measurements
    2. Prep time
    3. Macro breakdown
    4. Cost estimate
    5. Meal prep tips
    
    Format as JSON with structure: { weekly: [...], meals: {...}, prep: {...} }`;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    try {
      return JSON.parse(response);
    } catch {
      // Fallback to rule-based generation
      return this.generateRuleBasedMealPlan(macroTargets, preferences, restrictions);
    }
  }
  
  optimizeMealTiming(mealPlan, { workouts, sleepPattern, calendar }) {
    const optimized = { ...mealPlan };
    
    // Adjust meal timing around workouts
    workouts.forEach(workout => {
      const workoutHour = new Date(workout.scheduledDate).getHours();
      
      // Pre-workout meal 2-3 hours before
      optimized.preworkout = {
        time: workoutHour - 2.5,
        meal: 'High carb, moderate protein, low fat',
        macros: { carbs: 40, protein: 20, fat: 10 }
      };
      
      // Post-workout meal within 1 hour
      optimized.postworkout = {
        time: workoutHour + 1,
        meal: 'High protein, high carb, low fat',
        macros: { carbs: 50, protein: 40, fat: 15 }
      };
    });
    
    return optimized;
  }
  
  calculateWorkoutEnergy(workout) {
    let totalEnergy = 0;
    
    workout.exercises.forEach(exercise => {
      const sets = exercise.sets || 3;
      const reps = parseInt(exercise.reps) || 10;
      const weight = exercise.weight || 0;
      
      // Simplified energy calculation (kcal)
      const energy = (sets * reps * weight * 0.05) + (workout.duration * 5);
      totalEnergy += energy;
    });
    
    return Math.round(totalEnergy);
  }
  
  classifyWorkout(workout) {
    const exercises = workout.exercises || [];
    const hasCardio = exercises.some(e => e.type === 'cardio');
    const hasStrength = exercises.some(e => e.weight > 0);
    
    if (hasCardio && !hasStrength) return 'cardio';
    if (hasStrength && !hasCardio) return 'strength';
    if (hasCardio && hasStrength) return 'hybrid';
    return 'general';
  }
  
  determineMealType() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 10) return 'breakfast';
    if (hour >= 10 && hour < 12) return 'morning_snack';
    if (hour >= 12 && hour < 15) return 'lunch';
    if (hour >= 15 && hour < 17) return 'afternoon_snack';
    if (hour >= 17 && hour < 20) return 'dinner';
    return 'evening_snack';
  }
}

// Export singleton instance and methods
const venusController = new VenusController();

module.exports = {
  generateIntelligentMealPlan: (req, res) => venusController.generateIntelligentMealPlan(req, res),
  trackMacrosRealtime: (req, res) => venusController.trackMacrosRealtime(req, res),
  syncNutritionWithWorkout: (req, res) => venusController.syncNutritionWithWorkout(req, res),
  optimizeSupplements: (req, res) => venusController.optimizeSupplements(req, res),
  trackHydrationIntelligently: (req, res) => venusController.trackHydrationIntelligently(req, res),
  venusEventEmitter: venusController
};