#!/bin/zsh

echo "🔧 Fixing Controller Import Paths..."

# Controllers should use ../models/ (only one level up)
# Add planet subdirectories to model imports

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/CalendarEvent')|require('../models/earth/CalendarEvent')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/CalenderEvent')|require('../models/earth/CalendarEvent')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/EnergyPattern')|require('../models/earth/EnergyPattern')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/BankAccount')|require('../models/jupiter/BankAccount')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Budget')|require('../models/jupiter/Budget')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Finance')|require('../models/jupiter/Finance')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Transaction')|require('../models/jupiter/Transaction')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/HealthBlockchain')|require('../models/jupiter/HealthBlockchain')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Goal')|require('../models/mars/Goal')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/WearableDevice')|require('../models/mercury/WearableDevice')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/WearableData')|require('../models/mercury/WearableData')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/HealthMetric')|require('../models/mercury/HealthMetric')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/SleepData')|require('../models/mercury/SleepData')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/RecoveryScore')|require('../models/mercury/RecoveryScore')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/BiometricSnapshot')|require('../models/mercury/BiometricSnapshot')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/BodyComposition')|require('../models/mercury/BodyComposition')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Measurement')|require('../models/mercury/Measurement')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/CompanionConversation')|require('../models/phoenix/CompanionConversation')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/CorrelationPattern')|require('../models/phoenix/CorrelationPattern')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Prediction')|require('../models/phoenix/Prediction')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Intervention')|require('../models/phoenix/Intervention')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/UserBehavior')|require('../models/phoenix/UserBehavior')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/LegacyVision')|require('../models/saturn/LegacyVision')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/QuarterlyReview')|require('../models/saturn/QuarterlyReview')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Workout')|require('../models/venus/Workout')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Exercise')|require('../models/venus/Exercise')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Nutrition')|require('../models/venus/Nutrition')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/SupplementLog')|require('../models/venus/SupplementLog')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/WorkoutTemplate')|require('../models/venus/WorkoutTemplate')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/Challenge')|require('../models/venus/Challenge')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/SocialPost')|require('../models/venus/SocialPost')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/PerformanceTest')|require('../models/venus/PerformanceTest')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../models/InjuryLog')|require('../models/venus/InjuryLog')|g" {} \;

# Fix service imports in controllers (add planet subdirectories)
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/calendarSync')|require('../services/earth/calendarSync')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/energyOptimizer')|require('../services/earth/energyOptimizer')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/plaidService')|require('../services/jupiter/plaidService')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/blockchainHealth')|require('../services/jupiter/blockchainHealth')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/goalTracker')|require('../services/mars/goalTracker')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/motivationEngine')|require('../services/mars/motivationEngine')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/progressEngine')|require('../services/mars/progressEngine')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/smartGoalGenerator')|require('../services/mars/smartGoalGenerator')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/deviceSync')|require('../services/mercury/deviceSync')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/biometricEngine')|require('../services/mercury/biometricEngine')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/recoveryCalc')|require('../services/mercury/recoveryCalc')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/dexaSimulator')|require('../services/mercury/dexaSimulator')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/metabolicCalculator')|require('../services/mercury/metabolicCalculator')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/healthRatios')|require('../services/mercury/healthRatios')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/legacyService')|require('../services/saturn/legacyService')|g" {} \;

find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/workoutIntelligence')|require('../services/venus/workoutIntelligence')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/nutritionCalc')|require('../services/venus/nutritionCalc')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/mealPlanningAI')|require('../services/venus/mealPlanningAI')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/injuryRiskAssessor')|require('../services/venus/injuryRiskAssessor')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/socialFeatures')|require('../services/venus/socialFeatures')|g" {} \;
find Src/controllers -name "*.js" -type f -exec sed -i '' "s|require('../services/quantumWorkouts')|require('../services/venus/quantumWorkouts')|g" {} \;

echo "✅ All controller imports fixed!"
