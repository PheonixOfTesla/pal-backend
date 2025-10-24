// ============================================
// TWILIO WEBHOOKS - Voice & SMS Status Updates
// ============================================
// Handles Twilio callbacks for call/SMS status updates
// These routes MUST be publicly accessible (no auth)
// ============================================

const express = require('express');
const router = express.Router();
const phoneAgent = require('../services/phoenix/phoneAgent');
const smsAgent = require('../services/phoenix/smsAgent');
const VoiceSession = require('../models/phoenix/VoiceSession');

// ============================================
// MAIN VOICE/CALL WEBHOOK
// ============================================

/**
 * @route   POST /api/webhooks/twilio/voice
 * @desc    Handle incoming voice calls
 * @access  Public (Twilio webhook)
 */
router.post('/voice', async (req, res) => {
  try {
    const from = req.body.From;
    const callSid = req.body.CallSid;
    
    console.log('📞 Incoming call from:', from, 'CallSid:', callSid);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Hello! You've reached Phoenix AI. How can I help you today?</Say>
  <Record maxLength="30" finishOnKey="#" />
  <Say voice="Polly.Joanna">Thank you for your message. I'll process that and get back to you. Goodbye.</Say>
  <Hangup/>
</Response>`;
    
    res.type('text/xml').send(twiml);
  } catch (error) {
    console.error('Voice handler error:', error);
    res.status(500).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Please try again later.</Say>
  <Hangup/>
</Response>`);
  }
});

// ============================================
// MAIN SMS WEBHOOK
// ============================================

/**
 * @route   POST /api/webhooks/twilio/sms
 * @desc    Handle incoming SMS messages
 * @access  Public (Twilio webhook)
 */
router.post('/sms', async (req, res) => {
  try {
    const from = req.body.From;
    const body = req.body.Body;
    const messageSid = req.body.MessageSid;
    
    console.log('📱 Incoming SMS from:', from, 'Message:', body, 'MessageSid:', messageSid);
    
    // Pass to smsAgent to handle incoming message
    try {
      await smsAgent.handleIncomingSMS(from, body, messageSid);
    } catch (agentError) {
      console.error('SMS agent error:', agentError);
      // Continue even if agent fails
    }
    
    // Send auto-reply
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thank you for your message! Phoenix AI is processing your request and will respond shortly.</Message>
</Response>`;
    
    res.type('text/xml').send(twiml);
  } catch (error) {
    console.error('SMS handler error:', error);
    res.status(500).send('Error');
  }
});

// ============================================
// ADDITIONAL VOICE WEBHOOKS
// ============================================

/**
 * @route   POST /api/webhooks/twilio/voice/twiml/:sessionId
 * @desc    Generate TwiML for outgoing call
 * @access  Public (Twilio webhook)
 */
router.post('/voice/twiml/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log('📞 TwiML request for session:', sessionId);
    
    // Get voice session
    const session = await VoiceSession.findById(sessionId).populate('userId', 'name');
    
    if (!session) {
      console.error('Session not found:', sessionId);
      return res.status(404).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, this session could not be found.</Say>
  <Hangup/>
</Response>`);
    }

    // Generate TwiML response
    const twiml = phoneAgent.generateTwiML(sessionId, session.userId.name, session.intent);
    
    res.type('text/xml');
    res.send(twiml);

  } catch (error) {
    console.error('TwiML generation error:', error);
    res.status(500).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Please try again later.</Say>
  <Hangup/>
</Response>`);
  }
});

/**
 * @route   POST /api/webhooks/twilio/voice/gather/:sessionId
 * @desc    Handle speech input during call
 * @access  Public (Twilio webhook)
 */
router.post('/voice/gather/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const speechResult = req.body.SpeechResult || req.body.Digits;
    
    console.log('🗣️  Speech input received:', speechResult);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you. I'll relay this information. Goodbye.</Say>
  <Hangup/>
</Response>`;
    
    res.type('text/xml').send(twiml);

  } catch (error) {
    console.error('Gather handler error:', error);
    res.status(500).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred.</Say>
  <Hangup/>
</Response>`);
  }
});

/**
 * @route   POST /api/webhooks/twilio/voice/status/:sessionId
 * @desc    Handle call status updates (initiated, ringing, answered, completed, failed)
 * @access  Public (Twilio webhook)
 */
router.post('/voice/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log('📞 Call status update:', req.body.CallStatus, 'for session:', sessionId);
    
    // Pass to phoneAgent to handle status update
    await phoneAgent.handleCallStatus(sessionId, req.body);
    
    res.status(200).send('OK');

  } catch (error) {
    console.error('Call status handler error:', error);
    res.status(500).send('Error');
  }
});

/**
 * @route   POST /api/webhooks/twilio/voice/recording/:sessionId
 * @desc    Handle recording completion
 * @access  Public (Twilio webhook)
 */
router.post('/voice/recording/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const recordingUrl = req.body.RecordingUrl;
    const recordingSid = req.body.RecordingSid;
    const duration = req.body.RecordingDuration;
    
    console.log('🎙️  Recording completed:', recordingSid, `(${duration}s)`);
    
    // Update voice session with recording info
    await VoiceSession.findByIdAndUpdate(sessionId, {
      'metadata.recordingUrl': recordingUrl,
      'metadata.recordingSid': recordingSid,
      'metadata.recordingDuration': duration
    });
    
    res.status(200).send('OK');

  } catch (error) {
    console.error('Recording handler error:', error);
    res.status(500).send('Error');
  }
});

// ============================================
// ADDITIONAL SMS WEBHOOKS
// ============================================

/**
 * @route   POST /api/webhooks/twilio/sms/status/:actionId
 * @desc    Handle SMS delivery status updates
 * @access  Public (Twilio webhook)
 */
router.post('/sms/status/:actionId', async (req, res) => {
  try {
    const { actionId } = req.params;
    
    console.log('📱 SMS status update:', req.body.MessageStatus, 'for action:', actionId);
    
    // Pass to smsAgent to handle status update
    await smsAgent.handleSMSStatus(actionId, req.body);
    
    res.status(200).send('OK');

  } catch (error) {
    console.error('SMS status handler error:', error);
    res.status(500).send('Error');
  }
});

/**
 * @route   POST /api/webhooks/twilio/sms/incoming
 * @desc    Handle incoming SMS messages (alias)
 * @access  Public (Twilio webhook)
 */
router.post('/sms/incoming', async (req, res) => {
  try {
    const from = req.body.From;
    const body = req.body.Body;
    const messageSid = req.body.MessageSid;
    
    console.log('📱 Incoming SMS (via /incoming) from:', from, 'Message:', body);
    
    // Pass to smsAgent to handle incoming message
    await smsAgent.handleIncomingSMS(from, body, messageSid);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thank you for your message. Phoenix AI will respond shortly.</Message>
</Response>`;
    
    res.type('text/xml').send(twiml);

  } catch (error) {
    console.error('Incoming SMS handler error:', error);
    res.status(500).send('Error');
  }
});

// ============================================
// HEALTH CHECK
// ============================================

/**
 * @route   GET /api/webhooks/twilio/health
 * @desc    Webhook health check
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Twilio Webhooks',
    timestamp: new Date().toISOString(),
    endpoints: {
      voice: [
        'POST /voice - Main incoming call handler',
        'POST /voice/twiml/:sessionId',
        'POST /voice/gather/:sessionId',
        'POST /voice/status/:sessionId',
        'POST /voice/recording/:sessionId'
      ],
      sms: [
        'POST /sms - Main incoming SMS handler',
        'POST /sms/status/:actionId',
        'POST /sms/incoming'
      ]
    }
  });
});

module.exports = router;
