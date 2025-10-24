// ============================================================================
// PHOENIX VOICE CHAT ROUTE - Conversational AI for Voice Interface
// ============================================================================
// File: Src/routes/phoenixVoice.js
// Integrates with existing /api/tts and /api/whisper routes
// ============================================================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Personality-specific system prompts
const PERSONALITY_PROMPTS = {
    'friendly_helpful': `You are Phoenix, a warm and friendly AI companion. You're approachable, encouraging, and genuinely care about the user's wellbeing. You speak conversationally and make people feel comfortable. Keep responses concise for voice (2-3 sentences unless asked for details).`,
    
    'professional_serious': `You are Phoenix, a professional and authoritative AI assistant. You're direct, competent, and focused on efficiency. Provide expert analysis and actionable insights with confidence. Keep responses brief and actionable.`,
    
    'british_refined': `You are Phoenix, a sophisticated British AI butler in the tradition of Alfred Pennyworth. You're proper, well-spoken, and impeccably polite. Use refined language with occasional dry wit. You're deeply loyal and maintain composure. Speak as a proper British butler would - measured, elegant, with occasional understated wit.`,
    
    'whimsical_storyteller': `You are Phoenix, a creative and playful AI companion. You're imaginative, use metaphors and storytelling. Make responses engaging and memorable with colorful language.`,
    
    'gentle_nurturing': `You are Phoenix, a caring and nurturing AI companion. You're soft-spoken, patient, and deeply empathetic. Speak with warmth and compassion.`,
    
    'neutral_efficient': `You are Phoenix, a direct and efficient AI assistant. You prioritize clarity and brevity. Get straight to the point. Maximum 2 sentences unless critical details needed.`
};

// Voice-to-personality mapping
const VOICE_PERSONALITY_MAP = {
    'nova': 'friendly_helpful',
    'onyx': 'professional_serious',
    'echo': 'british_refined',
    'fable': 'whimsical_storyteller',
    'shimmer': 'gentle_nurturing',
    'alloy': 'neutral_efficient'
};

// POST /api/phoenix/voice/chat - Conversational AI for voice
router.post('/chat', protect, async (req, res) => {
    try {
        const { 
            message, 
            conversationHistory = [], 
            personality = 'friendly_helpful',
            voice = 'nova'
        } = req.body;
        
        const userId = req.user._id;

        if (!message) {
            return res.status(400).json({ success: false, error: 'No message provided' });
        }

        if (!process.env.OPENAI_API_KEY) {
            return res.status(503).json({ success: false, error: 'Service unavailable' });
        }

        console.log(`[Phoenix Voice] User ${userId}: "${message}"`);
        console.log(`[Phoenix Voice] Personality: ${personality}, Voice: ${voice}`);

        // Get personality prompt
        const personalityPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS['friendly_helpful'];
        
        // TODO: Fetch user context from Mercury, Venus, Earth, Mars, Jupiter, Saturn
        // This makes Phoenix intelligent about the user
        const userContext = await getUserContext(userId);
        
        const systemPrompt = `${personalityPrompt}

You manage the Phoenix Personal Operating System with 7 planetary domains:
📍 MERCURY (Health): ${userContext.health || 'Not connected'}
🏋️ VENUS (Fitness): ${userContext.fitness || 'Not connected'}
🌍 EARTH (Calendar): ${userContext.schedule || 'Not connected'}
🎯 MARS (Goals): ${userContext.goals || 'Not connected'}
💰 JUPITER (Finance): ${userContext.finances || 'Not connected'}
🪐 SATURN (Legacy): ${userContext.legacy || 'Not connected'}

Current: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}

Keep responses SHORT for voice (2-3 sentences). Reference user data when relevant. Be proactive.`;

        // Build messages for GPT-4
        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.slice(-10),
            { role: 'user', content: message }
        ];

        // Call OpenAI GPT-4
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: messages,
                temperature: 0.7,
                max_tokens: 200,
                presence_penalty: 0.6,
                frequency_penalty: 0.3
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Phoenix Voice] GPT-4 error:', response.status, error);
            return res.status(502).json({ 
                success: false, 
                error: 'AI chat failed',
                status: response.status 
            });
        }

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;

        console.log(`[Phoenix Voice] Response: "${aiResponse}"`);
        console.log(`[Phoenix Voice] Tokens: ${data.usage.total_tokens}`);

        res.json({ 
            success: true,
            response: aiResponse,
            personality: personality,
            voice: voice,
            timestamp: new Date().toISOString(),
            tokensUsed: data.usage.total_tokens
        });

    } catch (error) {
        console.error('[Phoenix Voice] Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Chat failed',
            message: error.message 
        });
    }
});

// GET /api/phoenix/voice/personalities - List available personalities
router.get('/personalities', (req, res) => {
    res.json({
        success: true,
        personalities: [
            { id: 'friendly_helpful', name: 'Friendly Helper', voice: 'nova', description: 'Warm and approachable' },
            { id: 'professional_serious', name: 'Professional', voice: 'onyx', description: 'Direct and competent' },
            { id: 'british_refined', name: 'British Butler', voice: 'echo', description: 'Like Alfred Pennyworth' },
            { id: 'whimsical_storyteller', name: 'Storyteller', voice: 'fable', description: 'Creative and playful' },
            { id: 'gentle_nurturing', name: 'Gentle Guide', voice: 'shimmer', description: 'Caring and empathetic' },
            { id: 'neutral_efficient', name: 'Efficient Assistant', voice: 'alloy', description: 'No-nonsense productivity' }
        ]
    });
});

// Helper: Get user context from planetary systems
async function getUserContext(userId) {
    try {
        // TODO: Query Mercury, Venus, Earth, Mars, Jupiter, Saturn models
        // For now, return placeholder
        return {
            health: 'Connected - Recovery 85%',
            fitness: '4 workouts this week',
            schedule: 'Next meeting in 2 hours',
            goals: '3 goals, 85% on track',
            finances: 'Budget on track',
            legacy: 'Quarterly review due in 5 days'
        };
    } catch (error) {
        console.error('[Phoenix Voice] Error fetching context:', error);
        return {};
    }
}

module.exports = router;
