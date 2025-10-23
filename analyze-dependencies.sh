#!/bin/zsh

# ============================================
# PHOENIX BACKEND - COMPLETE DEPENDENCY ANALYZER
# ============================================
# Analyzes all files to determine:
# - What each service imports
# - What each controller imports
# - Missing files
# - Incorrect import paths
# ============================================

OUTPUT_FILE="COMPLETE_DEPENDENCY_ANALYSIS.txt"

echo "🔍 PHOENIX BACKEND - COMPLETE DEPENDENCY ANALYSIS" > $OUTPUT_FILE
echo "Generated: $(date)" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# ============================================
# ANALYZE CONTROLLERS
# ============================================

echo "📊 CONTROLLER ANALYSIS" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

for controller in Src/controllers/*.js; do
  if [ -f "$controller" ]; then
    filename=$(basename "$controller")
    echo "📄 $filename" >> $OUTPUT_FILE
    echo "   Location: $controller" >> $OUTPUT_FILE
    echo "   IMPORTS:" >> $OUTPUT_FILE
    
    # Extract all require statements
    grep -n "require(" "$controller" | grep -v "^//" | grep -v "^\s*//" | while read line; do
      echo "      $line" >> $OUTPUT_FILE
    done
    
    echo "" >> $OUTPUT_FILE
  fi
done

# ============================================
# ANALYZE SERVICES BY PLANET
# ============================================

echo "" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "📊 SERVICE ANALYSIS (BY PLANET)" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

for planet in earth jupiter mars mercury phoenix saturn venus; do
  if [ -d "Src/services/$planet" ]; then
    echo "🪐 $planet SERVICES" >> $OUTPUT_FILE
    echo "-------------------------------------------" >> $OUTPUT_FILE
    
    for service in Src/services/$planet/*.js; do
      if [ -f "$service" ]; then
        filename=$(basename "$service")
        echo "" >> $OUTPUT_FILE
        echo "   📄 $filename" >> $OUTPUT_FILE
        echo "      Location: $service" >> $OUTPUT_FILE
        echo "      IMPORTS:" >> $OUTPUT_FILE
        
        # Extract model imports
        echo "      → Models:" >> $OUTPUT_FILE
        grep "require.*models" "$service" | grep -v "^//" | grep -v "^\s*//" | while read line; do
          echo "         $line" >> $OUTPUT_FILE
        done
        
        # Extract service imports
        echo "      → Services:" >> $OUTPUT_FILE
        grep "require.*services" "$service" | grep -v "^//" | grep -v "^\s*//" | while read line; do
          echo "         $line" >> $OUTPUT_FILE
        done
        
        echo "" >> $OUTPUT_FILE
      fi
    done
    echo "" >> $OUTPUT_FILE
  fi
done

# ============================================
# ANALYZE ROUTES
# ============================================

echo "" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "📊 ROUTE ANALYSIS" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

for route in Src/routes/*.js; do
  if [ -f "$route" ]; then
    filename=$(basename "$route")
    echo "📄 $filename" >> $OUTPUT_FILE
    echo "   Location: $route" >> $OUTPUT_FILE
    echo "   IMPORTS:" >> $OUTPUT_FILE
    
    grep -n "require(" "$route" | grep -v "^//" | grep -v "^\s*//" | while read line; do
      echo "      $line" >> $OUTPUT_FILE
    done
    
    echo "" >> $OUTPUT_FILE
  fi
done

# ============================================
# CHECK FOR MISSING FILES
# ============================================

echo "" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "❌ MISSING FILES DETECTION" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

echo "Checking for commonly required but missing models..." >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# List of models that are commonly imported
COMMON_MODELS=(
  "User"
  "Subscription"
  "earth/CalendarEvent"
  "earth/EnergyPattern"
  "jupiter/Finance"
  "jupiter/Transaction"
  "jupiter/Budget"
  "jupiter/BankAccount"
  "mars/Goal"
  "mercury/WearableDevice"
  "mercury/WearableData"
  "mercury/HealthMetric"
  "mercury/SleepData"
  "mercury/RecoveryScore"
  "mercury/BiometricSnapshot"
  "mercury/BodyComposition"
  "mercury/Measurement"
  "phoenix/CompanionConversation"
  "phoenix/CorrelationPattern"
  "phoenix/Prediction"
  "phoenix/Intervention"
  "phoenix/BehaviorPattern"
  "phoenix/UserBehavior"
  "phoenix/BodyMeasurement"
  "phoenix/MLModel"
  "phoenix/VoiceSession"
  "phoenix/ButlerAction"
  "saturn/LegacyVision"
  "saturn/QuarterlyReview"
  "venus/Workout"
  "venus/Exercise"
  "venus/Nutrition"
  "venus/Challenge"
  "venus/SocialPost"
  "venus/InjuryLog"
)

for model in "${COMMON_MODELS[@]}"; do
  if [[ "$model" == *"/"* ]]; then
    # Has subdirectory
    planet=$(echo "$model" | cut -d'/' -f1)
    filename=$(echo "$model" | cut -d'/' -f2)
    filepath="Src/models/$planet/$filename.js"
  else
    # Root level model
    filepath="Src/models/$model.js"
  fi
  
  if [ ! -f "$filepath" ]; then
    echo "❌ MISSING: $filepath" >> $OUTPUT_FILE
  fi
done

# ============================================
# DETECT INCORRECT IMPORT PATTERNS
# ============================================

echo "" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "⚠️  INCORRECT IMPORT PATTERNS" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

echo "Checking for imports missing planet subdirectories..." >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# Check services (should use ../../models/planet/)
echo "🔍 Services with incorrect imports:" >> $OUTPUT_FILE
find Src/services -name "*.js" -type f -exec grep -l "require('../../models/[A-Z]" {} \; | while read file; do
  echo "   ❌ $file" >> $OUTPUT_FILE
  grep "require('../../models/[A-Z]" "$file" | while read line; do
    echo "      $line" >> $OUTPUT_FILE
  done
done

echo "" >> $OUTPUT_FILE

# Check controllers (should use ../models/planet/)
echo "🔍 Controllers with incorrect imports:" >> $OUTPUT_FILE
find Src/controllers -name "*.js" -type f -exec grep -l "require('../models/[A-Z]" {} \; | while read file; do
  echo "   ❌ $file" >> $OUTPUT_FILE
  grep "require('../models/[A-Z]" "$file" | while read line; do
    echo "      $line" >> $OUTPUT_FILE
  done
done

# ============================================
# SUMMARY STATISTICS
# ============================================

echo "" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "📊 SUMMARY STATISTICS" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

echo "Controllers found: $(find Src/controllers -name "*.js" -type f | wc -l | tr -d ' ')" >> $OUTPUT_FILE
echo "Routes found: $(find Src/routes -name "*.js" -type f | wc -l | tr -d ' ')" >> $OUTPUT_FILE
echo "Services found: $(find Src/services -name "*.js" -type f | wc -l | tr -d ' ')" >> $OUTPUT_FILE
echo "Models found: $(find Src/models -name "*.js" -type f | wc -l | tr -d ' ')" >> $OUTPUT_FILE

echo "" >> $OUTPUT_FILE
echo "Services by planet:" >> $OUTPUT_FILE
for planet in earth jupiter mars mercury phoenix saturn venus; do
  count=$(find Src/services/$planet -name "*.js" -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "   $planet: $count" >> $OUTPUT_FILE
done

echo "" >> $OUTPUT_FILE
echo "Models by planet:" >> $OUTPUT_FILE
for planet in earth jupiter mars mercury phoenix saturn venus; do
  count=$(find Src/models/$planet -name "*.js" -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "   $planet: $count" >> $OUTPUT_FILE
done

# ============================================
# DONE
# ============================================

echo "" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "✅ ANALYSIS COMPLETE" >> $OUTPUT_FILE
echo "============================================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE
echo "Output saved to: $OUTPUT_FILE" >> $OUTPUT_FILE

echo ""
echo "✅ Analysis complete!"
echo "📄 Results saved to: $OUTPUT_FILE"
echo ""
echo "Review the file to see:"
echo "   - What each service/controller imports"
echo "   - Missing files"
echo "   - Incorrect import paths"
echo ""
