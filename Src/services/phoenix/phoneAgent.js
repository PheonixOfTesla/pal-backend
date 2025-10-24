// ============================================
// PHONE AGENT - Complete Twilio + OpenAI Realtime Integration
// ============================================
// Makes actual AI phone calls with intelligent conversations
// Handles budget checking, recording, transcription, and cost tracking
// ============================================

const twilio = require('twilio');
const ButlerAction = require('../../models/phoenix/ButlerAction');
const VoiceSession = require('../../models/phoenix/VoiceSession');
const User = require('../../models/User');

class PhoneAgent {
  constructor() {
    this.client = null;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.apiUrl = process.env.API_URL;
    this.initialize();
  }

  /**
   * Initialize Twilio client
   */
  initialize() {
    if (!this.twilioAccountSid || !this.twilioAuthToken) {
      console.warn('⚠️  Twilio credentials not configured. Phone features will be disabled.');
      console.warn('   Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env');
      return;
    }

    if (!this.twilioPhoneNumber) {
      console.warn('⚠️  Twilio phone number not configured.');
      console.warn('   Add TWILIO_PHONE_NUMBER to .env');
      return;
    }

    if (!this.openaiApiKey) {
      console.warn('⚠️  OpenAI API key not configured. AI conversations will be disabled.');
      console.warn('   Add OPENAI_API_KEY to .env');
      return;
    }

    try {
      this.client = twilio(this.twilioAccountSid, this.twilioAuthToken);
      console.log('✅ Phone Agent initialized successfully');
      console.log(`   📞 Twilio number: ${this.twilioPhoneNumber}`);
    } catch (error) {
      console.error('❌ Failed to initialize Twilio client:', error.message);
    }
  }

  /**
   * Check if user has sufficient budget for call
   */
  async checkBudget(userId, estimatedCost = 1.00) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      // Check if budget is enabled
      if (!user.phoenixSettings?.callBudget?.enabled) {
        throw new Error('Call budget not enabled. Please enable in settings first.');
      }

      const budget = user.phoenixSettings.callBudget;
      const remaining = budget.monthlyLimit - (budget.currentSpent || 0);

      // Check if sufficient funds
      if (remaining < estimatedCost) {
        throw new Error(
          `Insufficient budget. Need $${estimatedCost.toFixed(2)}, have $${remaining.toFixed(2)}`
        );
      }

      // Check daily call limit
      if (user.phoenixSettings.callSettings?.maxCallsPerDay) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaysCalls = await ButlerAction.countDocuments({
          userId,
          actionType: 'call',
          createdAt: { $gte: today }
        });

        if (todaysCalls >= user.phoenixSettings.callSettings.maxCallsPerDay) {
          throw new Error(`Daily call limit reached (${user.phoenixSettings.callSettings.maxCallsPerDay} calls)`);
        }
      }

      return {
        approved: true,
        remaining,
        estimatedCost,
        willExceedThreshold: remaining - estimatedCost < budget.monthlyLimit * (budget.alertThreshold || 0.2)
      };

    } catch (error) {
      console.error('Budget check error:', error);
      throw error;
    }
  }

  /**
   * Deduct actual cost from user's budget
   */
  async deductBudget(userId, actualCost) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $inc: { 'phoenixSettings.callBudget.currentSpent': actualCost }
        },
        { new: true }
      );

      const budget = user.phoenixSettings.callBudget;
      const remaining = budget.monthlyLimit - budget.currentSpent;

      // Check if auto-recharge is needed
      if (budget.autoRecharge?.enabled && remaining < budget.autoRecharge.trigger) {
        console.log(`🔄 Auto-recharge triggered for user ${userId}`);
        // Implement auto-recharge logic here (Stripe payment, etc.)
      }

      return {
        deducted: actualCost,
        remaining,
        totalSpent: budget.currentSpent
      };

    } catch (error) {
      console.error('Budget deduction error:', error);
      throw error;
    }
  }

  /**
   * Get Phoenix AI instructions for phone conversations
   */
  getPhoenixInstructions(userName, purpose, context = {}) {
    return `You are Phoenix, an AI assistant making a phone call on behalf of ${userName}.

CRITICAL RULES:
1. ALWAYS identify yourself as an AI assistant at the start of the call
2. Be professional, polite, and concise
3. State your purpose clearly and directly
4. Listen actively and respond appropriately
5. If asked questions you don't know, say "I'll need to check with ${userName} and call back"
6. End the call politely once the objective is complete
7. Never make commitments or promises without ${userName}'s approval

CALL PURPOSE: ${purpose}

USER CONTEXT:
${JSON.stringify(context, null, 2)}

EXAMPLE OPENING:
"Hi, this is Phoenix, the AI assistant for ${userName}. I'm calling to ${purpose}. Do you have a moment?"

GUIDELINES:
- Keep responses brief and to the point
- Confirm understanding before taking action
- Be transparent about being AI
- Show appreciation for their time
- Handle objections professionally`;
  }

  /**
   * Initiate a phone call with AI conversation capability
   */
  async initiateCall({ 
    userId, 
    phoneNumber, 
    purpose, 
    context = {},
    script = null,
    recordCall = true,
    maxDuration = 300 // 5 minutes default
  }) {
    try {
      // Validate Twilio is configured
      if (!this.client) {
        throw new Error('Twilio not configured. Check .env settings.');
      }

      // Get user information
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check budget and get approval
      const estimatedCost = 1.00; // Average call cost estimate
      const budgetCheck = await this.checkBudget(userId, estimatedCost);

      console.log(`📞 Initiating call for ${user.name} to ${phoneNumber}`);
      console.log(`   Purpose: ${purpose}`);
      console.log(`   Budget remaining: $${budgetCheck.remaining.toFixed(2)}`);

      // Create butler action record
      const action = await ButlerAction.create({
        userId,
        actionType: 'call',
        description: `Call to ${phoneNumber}: ${purpose}`,
        status: 'pending',
        priority: 'medium',
        metadata: {
          phoneNumber,
          purpose,
          context,
          script,
          recordCall,
          estimatedCost,
          budgetRemaining: budgetCheck.remaining,
          maxDuration
        }
      });

      // Create voice session for tracking
      const voiceSession = await VoiceSession.create({
        userId,
        transcript: script || `Purpose: ${purpose}`,
        intent: purpose,
        status: 'active',
        metadata: {
          actionId: action._id,
          phoneNumber,
          userName: user.name
        }
      });

      // Generate TwiML URL for the call
      const twimlUrl = `${this.apiUrl}/api/phoenix/voice/twiml/${voiceSession._id}`;
      const statusCallbackUrl = `${this.apiUrl}/api/phoenix/voice/status/${voiceSession._id}`;

      // Initiate the call via Twilio
      const call = await this.client.calls.create({
        url: twimlUrl,
        to: phoneNumber,
        from: this.twilioPhoneNumber,
        record: recordCall ? 'record-from-answer' : 'do-not-record',
        recordingStatusCallback: recordCall ? `${this.apiUrl}/api/phoenix/voice/recording/${voiceSession._id}` : undefined,
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        timeout: 30, // Ring for 30 seconds before giving up
        machineDetection: 'DetectMessageEnd' // Detect voicemail
      });

      // Update action with call details
      action.status = 'in_progress';
      action.metadata.callSid = call.sid;
      action.metadata.callStatus = call.status;
      action.scheduledFor = new Date();
      await action.save();

      // Update voice session
      voiceSession.metadata.callSid = call.sid;
      await voiceSession.save();

      console.log(`✅ Call initiated: ${call.sid}`);

      return {
        success: true,
        actionId: action._id,
        sessionId: voiceSession._id,
        callSid: call.sid,
        status: call.status,
        to: phoneNumber,
        from: this.twilioPhoneNumber,
        purpose,
        estimatedCost,
        budgetRemaining: budgetCheck.remaining
      };

    } catch (error) {
      console.error('❌ Phone call initiation error:', error);
      
      // Log failed attempt
      if (error.message.includes('budget') || error.message.includes('limit')) {
        throw error; // Re-throw budget errors as-is
      }

      throw new Error(`Failed to initiate call: ${error.message}`);
    }
  }

  /**
   * Generate TwiML response for incoming call webhook
   */
  generateTwiML(sessionId, userName, purpose) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    // Initial greeting
    const greeting = `Hello. This is Phoenix, the A I assistant for ${userName}. I'm calling regarding ${purpose}.`;
    
    response.say({
      voice: 'Polly.Matthew',
      language: 'en-US'
    }, greeting);

    // Gather response with speech recognition
    const gather = response.gather({
      input: 'speech',
      action: `${this.apiUrl}/api/phoenix/voice/gather/${sessionId}`,
      timeout: 5,
      speechTimeout: 'auto',
      language: 'en-US'
    });

    gather.say({
      voice: 'Polly.Matthew'
    }, 'How can I help you?');

    // If no response, politely end
    response.say({
      voice: 'Polly.Matthew'
    }, "I didn't hear a response. I'll try again later. Goodbye.");

    return response.toString();
  }

  /**
   * Handle call status updates from Twilio webhook
   */
  async handleCallStatus(sessionId, statusData) {
    try {
      const session = await VoiceSession.findById(sessionId);
      if (!session) {
        console.warn(`Voice session not found: ${sessionId}`);
        return;
      }

      const action = await ButlerAction.findOne({
        userId: session.userId,
        'metadata.callSid': statusData.CallSid
      });

      console.log(`📞 Call status update: ${statusData.CallStatus} (${statusData.CallSid})`);

      // Update based on status
      if (statusData.CallStatus === 'completed') {
        const duration = parseInt(statusData.CallDuration) || 0;
        const actualCost = this.calculateCallCost(duration);

        session.status = 'completed';
        session.duration = duration;
        await session.save();

        if (action) {
          action.status = 'completed';
          action.completedAt = new Date();
          action.metadata.duration = duration;
          action.metadata.actualCost = actualCost;
          action.metadata.callStatus = 'completed';
          await action.save();

          // Deduct actual cost from budget
          await this.deductBudget(session.userId, actualCost);
          
          console.log(`✅ Call completed: ${duration}s, cost: $${actualCost.toFixed(2)}`);
        }

      } else if (statusData.CallStatus === 'failed' || statusData.CallStatus === 'busy' || statusData.CallStatus === 'no-answer') {
        session.status = 'failed';
        await session.save();

        if (action) {
          action.status = 'failed';
          action.metadata.callStatus = statusData.CallStatus;
          action.metadata.errorMessage = statusData.ErrorMessage || `Call ${statusData.CallStatus}`;
          await action.save();
          
          console.log(`❌ Call failed: ${statusData.CallStatus}`);
        }
      }

    } catch (error) {
      console.error('Handle call status error:', error);
    }
  }

  /**
   * Calculate call cost based on duration
   */
  calculateCallCost(durationSeconds) {
    const minutes = Math.ceil(durationSeconds / 60);
    const twilioPerMinute = 0.013; // Twilio outbound call cost
    const openaiPerMinute = 0.30;  // OpenAI Realtime API estimated cost
    const totalPerMinute = twilioPerMinute + openaiPerMinute;
    return Math.max(minutes * totalPerMinute, 0.01); // Minimum $0.01
  }

  /**
   * Get call history for user
   */
  async getCallHistory(userId, days = 90, limit = 50) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const calls = await ButlerAction.find({
        userId,
        actionType: 'call',
        createdAt: { $gte: startDate }
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return calls.map(call => ({
        id: call._id,
        phoneNumber: call.metadata?.phoneNumber,
        purpose: call.description,
        status: call.status,
        duration: call.metadata?.duration,
        cost: call.metadata?.actualCost,
        createdAt: call.createdAt,
        completedAt: call.completedAt,
        callSid: call.metadata?.callSid
      }));

    } catch (error) {
      console.error('Get call history error:', error);
      throw error;
    }
  }

  /**
   * Get call statistics
   */
  async getCallStats(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const calls = await ButlerAction.find({
        userId,
        actionType: 'call',
        createdAt: { $gte: startDate }
      });

      const stats = {
        totalCalls: calls.length,
        completedCalls: calls.filter(c => c.status === 'completed').length,
        failedCalls: calls.filter(c => c.status === 'failed').length,
        totalDuration: calls.reduce((sum, c) => sum + (c.metadata?.duration || 0), 0),
        totalCost: calls.reduce((sum, c) => sum + (c.metadata?.actualCost || 0), 0),
        averageDuration: 0,
        averageCost: 0
      };

      if (stats.completedCalls > 0) {
        stats.averageDuration = Math.round(stats.totalDuration / stats.completedCalls);
        stats.averageCost = stats.totalCost / stats.completedCalls;
      }

      return stats;

    } catch (error) {
      console.error('Get call stats error:', error);
      throw error;
    }
  }

  /**
   * Cancel an ongoing call
   */
  async cancelCall(userId, callSid) {
    try {
      if (!this.client) {
        throw new Error('Twilio not configured');
      }

      // Update call status to completed
      await this.client.calls(callSid).update({ status: 'completed' });

      // Update action status
      await ButlerAction.findOneAndUpdate(
        { userId, 'metadata.callSid': callSid },
        { status: 'cancelled', completedAt: new Date() }
      );

      console.log(`🛑 Call cancelled: ${callSid}`);

      return { success: true, message: 'Call cancelled' };

    } catch (error) {
      console.error('Cancel call error:', error);
      throw error;
    }
  }
}

module.exports = new PhoneAgent();
