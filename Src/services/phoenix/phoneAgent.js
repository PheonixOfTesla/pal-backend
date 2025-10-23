// Src/services/phoenix/phoneAgent.js
// Phone calling service using Twilio API
// Handles automated phone calls for butler functionality

const twilio = require('twilio');
const ButlerAction = require('../../models/phoenix/ButlerAction');
const VoiceSession = require('../../models/phoenix/VoiceSession');

class PhoneAgent {
  constructor() {
    this.client = null;
    this.initialize();
  }

  initialize() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      console.warn('⚠️  Twilio credentials not configured. Phone features will be disabled.');
      return;
    }

    this.client = twilio(accountSid, authToken);
    console.log('✅ Twilio client initialized');
  }

  /**
   * Initiate a phone call
   * @param {Object} params - Call parameters
   * @returns {Promise<Object>} Call details
   */
  async initiateCall({ userId, phoneNumber, purpose, script, recordCall = false }) {
    try {
      if (!this.client) {
        throw new Error('Twilio not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env');
      }

      // Create butler action record
      const action = await ButlerAction.create({
        userId,
        actionType: 'call',
        description: `Call to ${phoneNumber} - ${purpose}`,
        status: 'pending',
        priority: 'medium',
        metadata: {
          phoneNumber,
          purpose,
          script,
          recordCall
        }
      });

      // Create voice session
      const voiceSession = await VoiceSession.create({
        userId,
        transcript: script || '',
        intent: purpose,
        status: 'active'
      });

      // Make the call using Twilio
      const call = await this.client.calls.create({
        url: `${process.env.API_URL}/api/phoenix/voice/twiml/${voiceSession._id}`,
        to: phoneNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
        record: recordCall,
        statusCallback: `${process.env.API_URL}/api/phoenix/voice/status/${voiceSession._id}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      // Update action with call SID
      action.status = 'in_progress';
      action.metadata.callSid = call.sid;
      await action.save();

      voiceSession.metadata = { callSid: call.sid };
      await voiceSession.save();

      return {
        actionId: action._id,
        sessionId: voiceSession._id,
        callSid: call.sid,
        status: call.status,
        to: phoneNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
        purpose
      };

    } catch (error) {
      console.error('Phone call error:', error);
      throw new Error(`Failed to initiate call: ${error.message}`);
    }
  }

  /**
   * Generate TwiML for voice interaction
   * @param {string} script - What to say
   * @returns {string} TwiML XML
   */
  generateTwiML(script) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    if (script) {
      response.say({
        voice: 'Polly.Matthew',
        language: 'en-US'
      }, script);
    }

    // Gather response with speech recognition
    const gather = response.gather({
      input: 'speech',
      action: '/api/phoenix/voice/gather',
      timeout: 5,
      speechTimeout: 'auto'
    });

    gather.say('Please provide your response.');

    return response.toString();
  }

  /**
   * Get call history for user
   * @param {string} userId - User ID
   * @param {number} days - Days of history
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Call history
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
        createdAt: call.createdAt,
        completedAt: call.completedAt,
        duration: call.metadata?.duration
      }));

    } catch (error) {
      console.error('Get call history error:', error);
      throw error;
    }
  }

  /**
   * Handle call status update from Twilio
   * @param {string} sessionId - Voice session ID
   * @param {Object} status - Call status data
   */
  async handleCallStatus(sessionId, status) {
    try {
      const session = await VoiceSession.findById(sessionId);
      if (!session) return;

      const action = await ButlerAction.findOne({
        userId: session.userId,
        'metadata.callSid': status.CallSid
      });

      if (status.CallStatus === 'completed') {
        session.status = 'completed';
        session.duration = parseInt(status.CallDuration);
        await session.save();

        if (action) {
          action.status = 'completed';
          action.completedAt = new Date();
          action.metadata.duration = parseInt(status.CallDuration);
          await action.save();
        }
      } else if (status.CallStatus === 'failed') {
        session.status = 'failed';
        await session.save();

        if (action) {
          action.status = 'failed';
          await action.save();
        }
      }

    } catch (error) {
      console.error('Handle call status error:', error);
    }
  }

  /**
   * Make a restaurant reservation call
   * @param {Object} params - Reservation details
   * @returns {Promise<Object>} Call result
   */
  async makeReservationCall({ userId, restaurantName, phoneNumber, date, time, partySize }) {
    const script = `Hello, this is calling on behalf of a customer. ` +
      `I'd like to make a reservation for ${partySize} people ` +
      `on ${date} at ${time}. ` +
      `The name for the reservation is ${await this.getUserName(userId)}. ` +
      `Can you confirm if that time is available?`;

    return this.initiateCall({
      userId,
      phoneNumber,
      purpose: `Reservation at ${restaurantName}`,
      script,
      recordCall: true
    });
  }

  /**
   * Get user's name for reservation
   * @param {string} userId
   * @returns {Promise<string>}
   */
  async getUserName(userId) {
    const User = require('../../models/User');
    const user = await User.findById(userId);
    return user?.name || 'Guest';
  }
}

module.exports = new PhoneAgent();
