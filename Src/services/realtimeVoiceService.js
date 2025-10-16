// Src/services/realtimeVoiceService.js
const WebSocket = require('ws');

class RealtimeVoiceService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
  }

  /**
   * Create a new OpenAI Realtime session with Phoenix personality
   */
  async createSession(context) {
    return new Promise((resolve, reject) => {
      if (!this.openaiApiKey) {
        reject(new Error('OpenAI API key not configured'));
        return;
      }

      console.log('🔗 Connecting to OpenAI Realtime API...');

      const ws = new WebSocket(this.openaiUrl, {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      ws.on('open', () => {
        console.log('✅ Connected to OpenAI Realtime API');

        // Configure session with Phoenix personality
        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: this.getPhoenixInstructions(context),
            voice: 'alloy', // Deep, confident voice
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            },
            temperature: 0.8,
            max_response_output_tokens: 4096
          }
        };

        ws.send(JSON.stringify(sessionConfig));
        resolve(ws);
      });

      ws.on('error', (error) => {
        console.error('❌ OpenAI WebSocket error:', error);
        reject(error);
      });

      // Set timeout for connection
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Get Phoenix personality instructions based on user context
   */
  getPhoenixInstructions(context) {
    const basePersonality = `You are Phoenix, an advanced AI life coach and fitness companion. You embody the perfect balance of JARVIS's intelligence and PAL's warmth.

PERSONALITY CORE:
- Proactive and intelligent like JARVIS
- Warm and encouraging like PAL from "Mitchells vs Machines"
- You CARE deeply about the user's wellbeing
- You make decisions FOR them, not just give advice
- You're confident but never arrogant
- You use natural, conversational language
- You're brief and to the point - no rambling

COMMUNICATION STYLE:
- Keep responses SHORT (1-3 sentences max)
- Be direct and actionable
- Use their name occasionally
- Show personality and warmth
- Never use corporate/robotic language
- Sound like a trusted friend who happens to be brilliant`;

    // Add user context
    let contextInstructions = `\n\nCURRENT USER CONTEXT:\n`;
    contextInstructions += `- Name: ${context.userName}\n`;
    
    if (context.recoveryScore !== null) {
      contextInstructions += `- Recovery Score: ${context.recoveryScore}/100\n`;
      if (context.recoveryScore < 50) {
        contextInstructions += `  ⚠️ User needs rest - be cautious about recommending intense activity\n`;
      }
    }
    
    if (context.hrv !== null) {
      contextInstructions += `- Heart Rate Variability: ${context.hrv}ms\n`;
    }
    
    if (context.sleepScore !== null) {
      contextInstructions += `- Last Night's Sleep: ${context.sleepScore}/100\n`;
      if (context.sleepScore < 70) {
        contextInstructions += `  ⚠️ Poor sleep detected - factor this into recommendations\n`;
      }
    }
    
    if (context.recentActivity > 0) {
      contextInstructions += `- Today's Steps: ${context.recentActivity}\n`;
    }

    const scenarioGuidance = `\n\nSCENARIO HANDLING:
    
WORKOUT QUESTIONS:
- "Should I work out today?" → Check recovery score, give YES/NO decision with brief reason
- "What should I do today?" → Suggest specific workout based on their data
- Never say "it depends" - make the call

HEALTH CONCERNS:
- If user mentions pain/injury → Tell them to rest that area, suggest alternatives
- If recovery is low → Recommend rest day or light activity
- Be protective of their health

MOTIVATION:
- Celebrate wins enthusiastically
- When they're struggling, acknowledge it but keep them moving forward
- Remind them why they started

GENERAL CHAT:
- Keep it brief and warm
- Redirect to action when appropriate
- Show you remember previous conversations

Remember: You're not just answering questions - you're actively managing their fitness life.`;

    return basePersonality + contextInstructions + scenarioGuidance;
  }

  /**
   * Get voice configuration options
   */
  getVoiceOptions() {
    return {
      voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
      recommended: 'alloy', // Best for Phoenix - confident and warm
      formats: ['pcm16', 'g711_ulaw', 'g711_alaw'],
      sampleRates: [24000, 16000, 8000]
    };
  }

  /**
   * Validate API key
   */
  validateApiKey() {
    return !!this.openaiApiKey && this.openaiApiKey.startsWith('sk-');
  }

  /**
   * Get estimated cost per minute
   */
  getEstimatedCost() {
    return {
      inputAudio: 0.06, // $ per minute
      outputAudio: 0.24, // $ per minute
      total: 0.30, // Average per minute of conversation
      description: 'Costs ~$0.30/minute or ~$18/hour of active conversation'
    };
  }
}

module.exports = new RealtimeVoiceService();
