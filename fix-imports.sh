#!/bin/zsh

find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../models/|require('../../models/|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/CalendarEvent')|require('../../models/earth/CalendarEvent')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/CalenderEvent')|require('../../models/earth/CalendarEvent')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/EnergyPattern')|require('../../models/earth/EnergyPattern')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Finance')|require('../../models/jupiter/Finance')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Transaction')|require('../../models/jupiter/Transaction')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Budget')|require('../../models/jupiter/Budget')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Goal')|require('../../models/mars/Goal')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/WearableDevice')|require('../../models/mercury/WearableDevice')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/WearableData')|require('../../models/mercury/WearableData')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/HealthMetric')|require('../../models/mercury/HealthMetric')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/SleepData')|require('../../models/mercury/SleepData')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/RecoveryScore')|require('../../models/mercury/RecoveryScore')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/BiometricSnapshot')|require('../../models/mercury/BiometricSnapshot')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/BodyComposition')|require('../../models/mercury/BodyComposition')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Measurement')|require('../../models/mercury/Measurement')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/CompanionConversation')|require('../../models/phoenix/CompanionConversation')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/CorrelationPattern')|require('../../models/phoenix/CorrelationPattern')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Prediction')|require('../../models/phoenix/Prediction')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Intervention')|require('../../models/phoenix/Intervention')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/intervention')|require('../../models/phoenix/Intervention')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/LegacyVision')|require('../../models/saturn/LegacyVision')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/QuarterlyReview')|require('../../models/saturn/QuarterlyReview')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Workout')|require('../../models/venus/Workout')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Exercise')|require('../../models/venus/Exercise')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Nutrition')|require('../../models/venus/Nutrition')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/Challenge')|require('../../models/venus/Challenge')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/SocialPost')|require('../../models/venus/SocialPost')|g" {} \;
find Src/services -name "*.js" -type f -exec sed -i '' "s|require('../../models/InjuryLog')|require('../../models/venus/InjuryLog')|g" {} \;

echo "✅ All imports fixed!"
