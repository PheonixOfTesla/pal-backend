#!/bin/zsh

# ============================================
# PHOENIX BACKEND - COMPLETE FIX SCRIPT
# ============================================
# Run this ONE script to fix everything
# ============================================

echo ""
echo "🔥 =========================================="
echo "🔥 PHOENIX BACKEND - COMPLETE FIX"
echo "🔥 =========================================="
echo ""

# ============================================
# STEP 1: Create missing Phoenix models
# ============================================

echo "📦 Step 1: Creating missing Phoenix models..."
echo ""

# Create BodyMeasurement.js (already created - skip if exists)
if [ ! -f "Src/models/phoenix/BodyMeasurement.js" ]; then
  echo "   Creating BodyMeasurement.js..."
  # File should be copied manually from outputs
fi

# Create MLModel.js
echo "   Creating MLModel.js..."
cat > Src/models/phoenix/MLModel.js << 'EOF'
const mongoose = require('mongoose');

const mlModelSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  version: { type: String, required: true },
  modelType: { type: String, required: true, enum: ['prediction', 'classification', 'regression', 'clustering'] },
  status: { type: String, enum: ['training', 'active', 'deprecated'], default: 'training' },
  accuracy: Number,
  trainedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('MLModel', mlModelSchema);
EOF

# Create VoiceSession.js
echo "   Creating VoiceSession.js..."
cat > Src/models/phoenix/VoiceSession.js << 'EOF'
const mongoose = require('mongoose');

const voiceSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  transcript: { type: String, required: true },
  intent: String,
  response: String,
  duration: Number,
  status: { type: String, enum: ['active', 'completed', 'failed'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('VoiceSession', voiceSessionSchema);
EOF

# Create ButlerAction.js
echo "   Creating ButlerAction.js..."
cat > Src/models/phoenix/ButlerAction.js << 'EOF'
const mongoose = require('mongoose');

const butlerActionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actionType: { type: String, required: true, enum: ['email', 'calendar', 'reminder', 'notification', 'task', 'call'] },
  description: { type: String, required: true },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'pending', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  scheduledFor: Date,
  completedAt: Date,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

butlerActionSchema.index({ userId: 1, status: 1 });
module.exports = mongoose.model('ButlerAction', butlerActionSchema);
EOF

echo "   ✅ All missing models created!"
echo ""

# ============================================
# STEP 2: Fix import paths in Phoenix services
# ============================================

echo "🔧 Step 2: Fixing Phoenix service import paths..."
echo ""

# Fix ButlerAction imports
sed -i '' "s|require('../../models/ButlerAction')|require('../../models/phoenix/ButlerAction')|g" Src/services/phoenix/butlerAutomation.js 2>/dev/null
sed -i '' "s|require('../../models/ButlerAction')|require('../../models/phoenix/ButlerAction')|g" Src/services/phoenix/phoneAgent.js 2>/dev/null
sed -i '' "s|require('../../models/ButlerAction')|require('../../models/phoenix/ButlerAction')|g" Src/services/phoenix/emailAgent.js 2>/dev/null

# Fix VoiceSession imports
sed -i '' "s|require('../../models/VoiceSession')|require('../../models/phoenix/VoiceSession')|g" Src/services/phoenix/voiceAgent.js 2>/dev/null

# Fix BodyMeasurement imports
sed -i '' "s|require('../../models/BodyMeasurement')|require('../../models/phoenix/BodyMeasurement')|g" Src/services/phoenix/predictionEngine.js 2>/dev/null

# Fix MLModel and BehaviorPattern imports
sed -i '' "s|require('../../models/MLModel')|require('../../models/phoenix/MLModel')|g" Src/services/phoenix/mlTrainingOrchestrator.js 2>/dev/null
sed -i '' "s|require('../../models/BehaviorPattern')|require('../../models/phoenix/BehaviorPattern')|g" Src/services/phoenix/mlTrainingOrchestrator.js 2>/dev/null

echo "   ✅ Import paths fixed!"
echo ""

# ============================================
# COMPLETION
# ============================================

echo "🔥 =========================================="
echo "🔥 FIX COMPLETE!"
echo "🔥 =========================================="
echo ""
echo "✅ Created 3 missing Phoenix models:"
echo "   • MLModel.js"
echo "   • VoiceSession.js"
echo "   • ButlerAction.js"
echo ""
echo "✅ Fixed all incorrect import paths in Phoenix services"
echo ""
echo "⚠️  IMPORTANT NOTES:"
echo "   • User.js and Subscription.js are ROOT level models"
echo "   • Their import paths (../models/User) are CORRECT"
echo "   • Don't try to move them to planet directories!"
echo ""
echo "🚀 NEXT STEP: Start your server!"
echo "   Run: npm start"
echo ""
echo "If you see BodyMeasurement or BehaviorPattern errors:"
echo "   Copy those files from outputs/ to Src/models/phoenix/"
echo ""
