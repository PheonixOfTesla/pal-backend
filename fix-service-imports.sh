#!/bin/bash

# ========================================
# SERVICE IMPORT PATH FIX SCRIPT
# Automatically fixes all require() paths in service files
# ========================================

echo "🔧 Starting Service Import Path Fix..."
echo ""

# Navigate to services directory
cd Src/services

# ========================================
# FIX PATTERN 1: ../models/ → ../../models/
# (For root-level models like User, Subscription)
# ========================================
echo "📝 Fixing root model imports (User, Subscription)..."

find . -name "*.js" -type f -exec sed -i "s|require('../models/User')|require('../../models/User')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Subscription')|require('../../models/Subscription')|g" {} \;

echo "✅ Root model imports fixed"
echo ""

# ========================================
# FIX PATTERN 2: ../models/{Model} → ../../models/{planet}/{Model}
# (For subdirectory models)
# ========================================
echo "📝 Fixing subdirectory model imports..."

# EARTH models
find . -name "*.js" -type f -exec sed -i "s|require('../models/CalendarEvent')|require('../../models/earth/CalendarEvent')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/EnergyPattern')|require('../../models/earth/EnergyPattern')|g" {} \;

# JUPITER models
find . -name "*.js" -type f -exec sed -i "s|require('../models/BankAccount')|require('../../models/jupiter/BankAccount')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Budget')|require('../../models/jupiter/Budget')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Finance')|require('../../models/jupiter/Finance')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Transaction')|require('../../models/jupiter/Transaction')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/HealthBlockchain')|require('../../models/jupiter/HealthBlockchain')|g" {} \;

# MARS models
find . -name "*.js" -type f -exec sed -i "s|require('../models/Goal')|require('../../models/mars/Goal')|g" {} \;

# MERCURY models
find . -name "*.js" -type f -exec sed -i "s|require('../models/WearableDevice')|require('../../models/mercury/WearableDevice')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/WearableData')|require('../../models/mercury/WearableData')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/HealthMetric')|require('../../models/mercury/HealthMetric')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/SleepData')|require('../../models/mercury/SleepData')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/RecoveryScore')|require('../../models/mercury/RecoveryScore')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/BiometricSnapshot')|require('../../models/mercury/BiometricSnapshot')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/BodyComposition')|require('../../models/mercury/BodyComposition')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Measurement')|require('../../models/mercury/Measurement')|g" {} \;

# PHOENIX models
find . -name "*.js" -type f -exec sed -i "s|require('../models/CompanionConversation')|require('../../models/phoenix/CompanionConversation')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/CorrelationPattern')|require('../../models/phoenix/CorrelationPattern')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Prediction')|require('../../models/phoenix/Prediction')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Intervention')|require('../../models/phoenix/Intervention')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/UserBehavior')|require('../../models/phoenix/UserBehavior')|g" {} \;

# SATURN models
find . -name "*.js" -type f -exec sed -i "s|require('../models/LegacyVision')|require('../../models/saturn/LegacyVision')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/QuarterlyReview')|require('../../models/saturn/QuarterlyReview')|g" {} \;

# VENUS models
find . -name "*.js" -type f -exec sed -i "s|require('../models/Workout')|require('../../models/venus/Workout')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Exercise')|require('../../models/venus/Exercise')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Nutrition')|require('../../models/venus/Nutrition')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/SupplementLog')|require('../../models/venus/SupplementLog')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/WorkoutTemplate')|require('../../models/venus/WorkoutTemplate')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/Challenge')|require('../../models/venus/Challenge')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/SocialPost')|require('../../models/venus/SocialPost')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/PerformanceTest')|require('../../models/venus/PerformanceTest')|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|require('../models/InjuryLog')|require('../../models/venus/InjuryLog')|g" {} \;

echo "✅ Subdirectory model imports fixed"
echo ""

# ========================================
# BONUS: Fix any lingering ../../models/ that should be ../../models/{planet}/
# This catches edge cases
# ========================================
echo "📝 Checking for any remaining incorrect patterns..."

# This will show files that still have potential issues
grep -r "require('../../models/[A-Z]" . 2>/dev/null | grep -v "User\|Subscription" | grep -v "earth/\|jupiter/\|mars/\|mercury/\|phoenix/\|saturn/\|venus/" || echo "✅ No lingering issues found"

echo ""
echo "========================================="
echo "✅ SERVICE IMPORT PATH FIX COMPLETE!"
echo "========================================="
echo ""
echo "📊 Summary:"
echo "   - Fixed all ../models/ → ../../models/"
echo "   - Fixed all model paths to include planet subdirectories"
echo "   - Services can now correctly import from subdirectory structure"
echo ""
echo "🚀 Next Steps:"
echo "   1. Review changes: git diff"
echo "   2. Test your app: npm start"
echo "   3. Commit changes: git add . && git commit -m 'Fix service import paths for subdirectory structure'"
echo ""
