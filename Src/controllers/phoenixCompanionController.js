// Src/controllers/phoenixCompanionController.js - Phoenix AI Companion
// FILE MODIFICATION #7: Add workout/nutrition context to AI responses

const { GoogleGenerativeAI } = require('@google/generative-ai');
const CompanionConversation = require('../models/CompanionConversation');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Nutrition = require('../models/Nutrition');
const Goal = require('../models/Goal');
const CalendarEvent = require('../models/CalendarEvent');
const Intervention = require('../models/Intervention');

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// ========================================
// CHAT WITH PHOENIX (ENHANCED WITH FULL CONTEXT)
// ========================================

exports.chat = async (req, res) => {
    try {
        const { message, context = {} } = req.body;
        const userId = req.user._id;
        const userName = req.user.name;

        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        if (!genAI) {
            return res.status(503).json({
                success: false,
                message: 'AI service not configured'
            });
        }

        // ========================================
        // GATHER COMPREHENSIVE USER CONTEXT
        // ========================================

        // 1. Latest wearable data (Mercury)
        const latestWearable = await WearableData.findOne({ user: userId })
            .sort({ timestamp: -1 })
            .select('hrv heartRate sleepDuration steps recoveryScore timestamp');

        // 2. Recent workouts (Venus)
        const recentWorkouts = await Workout.find({ user: userId })
            .sort({ completedAt: -1 })
            .limit(5)
            .select('name type duration exercises completedAt mood totalVolume');

        // 3. Today's nutrition (Venus)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayNutrition = await Nutrition.aggregate([
            {
                $match: {
                    user: userId,
                    timestamp: { $gte: todayStart }
                }
            },
            {
                $group: {
                    _id: null,
                    totalCalories: { $sum: '$calories' },
                    totalProtein: { $sum: '$protein' },
                    totalCarbs: { $sum: '$carbs' },
                    totalFat: { $sum: '$fat' },
                    meals: { $push: { name: '$name', calories: '$calories' } }
                }
            }
        ]);

        // 4. Active goals (Mars)
        const activeGoals = await Goal.find({ 
            user: userId,
            status: 'active'
        })
            .select('title type target current progress deadline')
            .limit(5);

        // 5. Today's calendar (Earth)
        const todayEvents = await CalendarEvent.find({
            user: userId,
            startTime: {
                $gte: todayStart,
                $lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
            }
        })
            .select('title startTime endTime')
            .sort({ startTime: 1 });

        // 6. Active interventions
        const activeInterventions = await Intervention.find({
            user: userId,
            status: 'active',
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
            .select('type reason action severity')
            .limit(3);

        // 7. Recent conversation history
        const conversationHistory = await CompanionConversation.find({ user: userId })
            .sort({ timestamp: -1 })
            .limit(10)
            .select('message response timestamp');

        // ========================================
        // BUILD COMPREHENSIVE SYSTEM PROMPT
        // ========================================

        const systemPrompt = `
You are Phoenix, an elite AI life coach and JARVIS-style companion for ${userName}.

PERSONALITY: Direct, intelligent, caring but honest. You don't sugarcoat. You intervene proactively.

CURRENT DATE: ${new Date().toLocaleDateString()}

====================
USER HEALTH DATA (MERCURY)
====================
${latestWearable ? `
HRV: ${latestWearable.hrv || 'N/A'} ms
Heart Rate: ${latestWearable.heartRate || 'N/A'} bpm
Sleep: ${latestWearable.sleepDuration ? (latestWearable.sleepDuration / 60).toFixed(1) : 'N/A'} hours
Steps: ${latestWearable.steps || 0}
Recovery Score: ${latestWearable.recoveryScore || 'N/A'}%
Last Sync: ${latestWearable.timestamp ? new Date(latestWearable.timestamp).toLocaleString() : 'N/A'}
` : 'No wearable data synced yet.'}

====================
RECENT WORKOUTS (VENUS)
====================
${recentWorkouts.length > 0 ? recentWorkouts.map((w, i) => {
    const daysAgo = Math.round((Date.now() - w.completedAt) / (1000 * 60 * 60 * 24));
    return `${i + 1}. ${w.name || 'Workout'} (${w.type}) - ${daysAgo} days ago
   Duration: ${w.duration || 0} min
   Volume: ${w.totalVolume || 0} lbs
   Mood: ${w.mood || 'N/A'}`;
}).join('\n') : 'No workouts logged recently.'}

====================
TODAY'S NUTRITION (VENUS)
====================
${todayNutrition.length > 0 ? `
Calories: ${todayNutrition[0].totalCalories || 0}
Protein: ${todayNutrition[0].totalProtein || 0}g
Carbs: ${todayNutrition[0].totalCarbs || 0}g
Fat: ${todayNutrition[0].totalFat || 0}g
Meals: ${todayNutrition[0].meals.length}
` : 'No meals logged today.'}

====================
ACTIVE GOALS (MARS)
====================
${activeGoals.length > 0 ? activeGoals.map((g, i) => `
${i + 1}. ${g.title} (${g.type})
   Progress: ${g.current || 0}/${g.target} (${g.progress || 0}%)
   Deadline: ${g.deadline ? new Date(g.deadline).toLocaleDateString() : 'No deadline'}
`).join('') : 'No active goals set.'}

====================
TODAY'S SCHEDULE (EARTH)
====================
${todayEvents.length > 0 ? todayEvents.map((e, i) => `
${i + 1}. ${e.title}
   ${new Date(e.startTime).toLocaleTimeString()} - ${new Date(e.endTime).toLocaleTimeString()}
`).join('') : 'No events scheduled today.'}

====================
ACTIVE INTERVENTIONS
====================
${activeInterventions.length > 0 ? activeInterventions.map((i, idx) => `
${idx + 1}. ${i.type.toUpperCase()}: ${i.reason}
   Action: ${i.action}
   Severity: ${i.severity}
`).join('') : 'No active interventions.'}

====================
CONVERSATION HISTORY (last 5 messages)
====================
${conversationHistory.slice(0, 5).reverse().map(c => `
User: ${c.message}
Phoenix: ${c.response}
`).join('\n')}

====================
USER MESSAGE
====================
${message}

====================
INSTRUCTIONS
====================
Respond to ${userName}'s message using ALL the context above.
- Reference specific data points (HRV, workouts, nutrition, goals)
- Be direct and actionable
- If they ask about workouts, reference recent training volume and recovery
- If they ask about nutrition, give specific macro recommendations
- If they ask about schedule, optimize around energy and recovery
- If recovery is low, be protective and recommend rest
- Use their name occasionally
- Keep responses 2-4 sentences unless they ask for detailed analysis
- NO emojis, just facts and recommendations
        `;

        // ========================================
        // GENERATE AI RESPONSE
        // ========================================

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
        const result = await model.generateContent(systemPrompt);
        const response = result.response.text();

        // ========================================
        // STORE CONVERSATION
        // ========================================

        await CompanionConversation.create({
            user: userId,
            message: message,
            response: response,
            context: {
                hrv: latestWearable?.hrv,
                recovery: latestWearable?.recoveryScore,
                lastWorkout: recentWorkouts[0]?.name,
                todayCalories: todayNutrition[0]?.totalCalories,
                activeGoalsCount: activeGoals.length
            },
            timestamp: new Date()
        });

        res.json({
            success: true,
            response: response,
            contextUsed: {
                wearableData: !!latestWearable,
                workouts: recentWorkouts.length,
                nutrition: todayNutrition.length > 0,
                goals: activeGoals.length,
                events: todayEvents.length,
                interventions: activeInterventions.length
            }
        });

    } catch (error) {
        console.error('Phoenix chat error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process message',
            error: error.message
        });
    }
};

// ========================================
// GET CHAT HISTORY
// ========================================

exports.getHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const limit = parseInt(req.query.limit) || 20;

        const history = await CompanionConversation.find({ user: userId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .select('message response timestamp context');

        res.json({
            success: true,
            data: history
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ========================================
// PROACTIVE CHECK
// ========================================

exports.proactiveCheck = async (req, res) => {
    try {
        const userId = req.user._id;

        // Check for intervention triggers
        const latestWearable = await WearableData.findOne({ user: userId })
            .sort({ timestamp: -1 });

        if (!latestWearable) {
            return res.json({
                success: true,
                intervention: null,
                message: 'No wearable data available'
            });
        }

        // Check if intervention needed
        let interventionNeeded = false;
        let reason = '';
        let action = '';

        if (latestWearable.recoveryScore < 40) {
            interventionNeeded = true;
            reason = `Recovery critically low at ${latestWearable.recoveryScore}%`;
            action = 'Skip today\'s workout. Prioritize rest and recovery.';
        } else if (latestWearable.hrv < 30) {
            interventionNeeded = true;
            reason = `HRV extremely low at ${latestWearable.hrv}ms`;
            action = 'High stress detected. Cancel non-essential activities.';
        }

        if (interventionNeeded) {
            const intervention = await Intervention.create({
                user: userId,
                type: 'recovery_alert',
                reason: reason,
                action: action,
                severity: 'high',
                status: 'active'
            });

            return res.json({
                success: true,
                intervention: intervention,
                message: 'Intervention triggered'
            });
        }

        res.json({
            success: true,
            intervention: null,
            message: 'All systems normal'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
