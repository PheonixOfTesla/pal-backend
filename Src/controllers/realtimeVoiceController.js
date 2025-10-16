// Src/controllers/realtimeVoiceController.js
const WebSocket = require('ws');
const realtimeVoiceService = require('../services/realtimeVoiceService');
const CompanionConversation = require('../models/CompanionConversation');
const WearableData = require('../models/WearableData');
const User = require('../models/User');

class RealtimeVoiceController {
  constructor() {
    this.activeSessions = new Map(); // userId -> session data
  }

  /**
   * Initialize WebSocket connection for voice chat
   */
  async handleConnection(ws, req) {
    const userId = req.user?.id || req.query.userId;
    
    if (!userId) {
      ws.close(1008, 'Unauthorized - No user ID');
      return;
    }

    console.log(`🎤 Voice session started for user: ${userId}`);

    try {
      // Get user data for context
      const user = await User.findById(userId);
      if (!user) {
        ws.close(1008, 'User not found');
        return;
      }

      // Get latest health data for Phoenix context
      const latestData = await WearableData.findOne({ userId })
        .sort({ timestamp: -1 })
        .limit(1);

      // Create session
      const session = {
        userId,
        user,
        clientWs: ws,
        openaiWs: null,
        startTime: Date.now(),
        conversationId: null,
        context: {
          userName: user.name,
          recoveryScore: latestData?.recoveryScore || null,
          hrv: latestData?.hrv || null,
          sleepScore: latestData?.sleepScore || null,
          recentActivity: latestData?.steps || 0
        }
      };

      // Connect to OpenAI Realtime API
      const openaiWs = await realtimeVoiceService.createSession(session.context);
      session.openaiWs = openaiWs;
      
      this.activeSessions.set(userId, session);

      // Setup message handlers
      this.setupClientHandlers(ws, session);
      this.setupOpenAIHandlers(openaiWs, session);

      // Send ready signal to client
      ws.send(JSON.stringify({
        type: 'session_ready',
        message: 'Phoenix is listening...'
      }));

    } catch (error) {
      console.error('❌ Error starting voice session:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to start voice session'
      }));
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Setup handlers for client WebSocket messages
   */
  setupClientHandlers(clientWs, session) {
    clientWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data);

        switch (message.type) {
          case 'audio':
            // Forward audio to OpenAI
            if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
              session.openaiWs.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: message.audio // Base64 encoded audio
              }));
            }
            break;

          case 'audio_end':
            // Signal end of user speech
            if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
              session.openaiWs.send(JSON.stringify({
                type: 'input_audio_buffer.commit'
              }));
              session.openaiWs.send(JSON.stringify({
                type: 'response.create'
              }));
            }
            break;

          case 'interrupt':
            // User interrupted Phoenix
            if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
              session.openaiWs.send(JSON.stringify({
                type: 'response.cancel'
              }));
            }
            break;

          case 'ping':
            clientWs.send(JSON.stringify({ type: 'pong' }));
            break;

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error handling client message:', error);
      }
    });

    clientWs.on('close', () => {
      console.log(`🔇 Voice session ended for user: ${session.userId}`);
      this.cleanupSession(session);
    });

    clientWs.on('error', (error) => {
      console.error('Client WebSocket error:', error);
      this.cleanupSession(session);
    });
  }

  /**
   * Setup handlers for OpenAI WebSocket messages
   */
  setupOpenAIHandlers(openaiWs, session) {
    openaiWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data);

        switch (message.type) {
          case 'session.created':
            console.log('✅ OpenAI session created:', message.session.id);
            session.conversationId = message.session.id;
            break;

          case 'response.audio.delta':
            // Forward audio chunks to client
            if (session.clientWs.readyState === WebSocket.OPEN) {
              session.clientWs.send(JSON.stringify({
                type: 'audio',
                audio: message.delta // Base64 audio chunk
              }));
            }
            break;

          case 'response.audio.done':
            // Audio response complete
            if (session.clientWs.readyState === WebSocket.OPEN) {
              session.clientWs.send(JSON.stringify({
                type: 'audio_end'
              }));
            }
            break;

          case 'response.text.delta':
            // Transcript of what Phoenix is saying
            if (session.clientWs.readyState === WebSocket.OPEN) {
              session.clientWs.send(JSON.stringify({
                type: 'transcript',
                text: message.delta,
                role: 'assistant'
              }));
            }
            break;

          case 'conversation.item.input_audio_transcription.completed':
            // User's speech transcribed
            const userTranscript = message.transcript;
            if (session.clientWs.readyState === WebSocket.OPEN) {
              session.clientWs.send(JSON.stringify({
                type: 'transcript',
                text: userTranscript,
                role: 'user'
              }));
            }
            // Save to database
            await this.saveConversation(session, userTranscript, 'user');
            break;

          case 'response.done':
            // Phoenix finished speaking
            const assistantTranscript = message.response?.output?.[0]?.content?.[0]?.transcript;
            if (assistantTranscript) {
              await this.saveConversation(session, assistantTranscript, 'assistant');
            }
            break;

          case 'error':
            console.error('OpenAI error:', message.error);
            if (session.clientWs.readyState === WebSocket.OPEN) {
              session.clientWs.send(JSON.stringify({
                type: 'error',
                message: 'Phoenix encountered an error'
              }));
            }
            break;

          default:
            // Log other message types for debugging
            console.log('OpenAI message:', message.type);
        }
      } catch (error) {
        console.error('Error handling OpenAI message:', error);
      }
    });

    openaiWs.on('close', () => {
      console.log('OpenAI WebSocket closed');
      if (session.clientWs.readyState === WebSocket.OPEN) {
        session.clientWs.close(1000, 'OpenAI connection closed');
      }
    });

    openaiWs.on('error', (error) => {
      console.error('OpenAI WebSocket error:', error);
      if (session.clientWs.readyState === WebSocket.OPEN) {
        session.clientWs.send(JSON.stringify({
          type: 'error',
          message: 'Connection to Phoenix failed'
        }));
      }
    });
  }

  /**
   * Save conversation to database
   */
  async saveConversation(session, message, role) {
    try {
      await CompanionConversation.create({
        userId: session.userId,
        message,
        role,
        timestamp: new Date(),
        conversationId: session.conversationId
      });
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }

  /**
   * Cleanup session
   */
  cleanupSession(session) {
    if (session.openaiWs) {
      session.openaiWs.close();
    }
    if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
      session.clientWs.close();
    }
    this.activeSessions.delete(session.userId);
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount() {
    return this.activeSessions.size;
  }

  /**
   * Get session by user ID
   */
  getSession(userId) {
    return this.activeSessions.get(userId);
  }
}

module.exports = new RealtimeVoiceController();
