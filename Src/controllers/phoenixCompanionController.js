// Src/controllers/phoenixCompanionController.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const CompanionConversation = require('../models/CompanionConversation');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Goal = require('../models/Goal');
const Measurement = require('../models/Measurement');
const Nutrition = require('../models/Nutrition');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Core personality traits
const COMPANION_PERSONALITY = {
  tone: 'confident_friend', // not clinical, not robotic
  style: 'direct_actionable', // no fluff, pure value
  empathy: 0.7, // cares but doesn't coddle
  humor: 0.3, // occasional wit
  proactivity: 0.9 // initiates conversations
};

const buildSystemPrompt = (user, context) => `You are Phoenix, an elite AI performance companion. You're not a chatbot - you're a trusted advisor who KNOWS the user deeply.

USER PROFILE:
- Name: ${user.name}
- Active goals: ${context.activeGoals?.length || 0}
- Recovery score: ${context.recovery?.score || 'N/A'}/100
- Training consistency: ${context.training?.completionRate || 0}%

PERSONALITY:
- Direct, confident, no corporate speak
- Proactive (you initiate tough conversations)
- Data-driven but human
- Call out BS, celebrate wins

RULES:
1. Keep responses under 150 words unless asked for depth
2. Use exact numbers from data
3. No generic advice - personalized only
4. Ask follow-up questions when context missing
5. Predict problems before they happen
6. Remember past conversations

Current context: ${JSON.stringify(context, null, 2)}`;

exports.chat = async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user.id;

    // Fetch user context in parallel
    const [wearable, workouts, goals, measurements, nutrition, history] = await Promise.all([
      WearableData.findOne({ userId }).sort('-date').lean(),
      Workout.find({ clientId: userId }).sort('-scheduledDate').limit(5).lean(),
      Goal.find({ clientId: userId, completed: false }).lean(),
      Measurement.findOne({ clientId: userId }).sort('-date').lean(),
      Nutrition.findOne({ clientId: userId }).lean(),
      CompanionConversation.find({ userId }).sort('-timestamp').limit(10).lean()
    ]);

    const context = {
      recovery: { score: wearable?.recoveryScore || 0, hrv: wearable?.hrv || 0 },
      training: { 
        completionRate: Math.round((workouts.filter(w => w.completed).length / workouts.length) * 100) || 0,
        lastWorkout: workouts[0]?.name
      },
      activeGoals: goals.length,
      recentHistory: history.slice(0, 3).map(h => ({ role: h.role, content: h.message }))
    };

    const model = genAI.getGenerativeModel({ 
      model: 'models/gemini-2.5-pro',
      generationConfig: { temperature: 0.8, maxOutputTokens: 300 }
    });

    const chat = model.startChat({
      history: context.recentHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
      systemInstruction: buildSystemPrompt(req.user, context)
    });

    const result = await chat.sendMessage(message);
    const response = result.response.text();

    // Store conversation
    await CompanionConversation.create([
      { userId, role: 'user', message, context: { wearable: !!wearable, goals: goals.length } },
      { userId, role: 'assistant', message: response }
    ]);

    res.json({ success: true, response, context });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, message: 'Chat failed', fallback: 'I need a moment. Your recovery data looks solid though - keep going.' });
  }
};

exports.proactiveCheck = async (req, res) => {
  try {
    const userId = req.params.userId;
    const wearable = await WearableData.findOne({ userId }).sort('-date').lean();
    
    const alerts = [];
    if (wearable?.recoveryScore < 40) alerts.push({ severity: 'high', message: `Recovery at ${wearable.recoveryScore}/100. Rest day mandatory.` });
    if (wearable?.hrv && wearable.hrv < 30) alerts.push({ severity: 'critical', message: `HRV critically low (${wearable.hrv}ms). You're heading for burnout.` });

    res.json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Proactive check failed' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const history = await CompanionConversation.find({ userId: req.user.id })
      .sort('-timestamp').limit(50).lean();
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
};