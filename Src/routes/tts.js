// ============================================================================
// TTS ROUTES - Text-to-Speech via OpenAI
// ============================================================================
// Proxies OpenAI TTS requests from frontend to avoid CORS issues
// ============================================================================

const express = require('express');
const router = express.Router();

// ============================================================================
// @route   POST /api/tts/generate
// @desc    Generate speech from text using OpenAI TTS
// @access  Public (or add auth middleware if needed)
// ============================================================================
router.post('/generate', async (req, res) => {
  try {
    const { text, voice = 'nova', speed = 1.0 } = req.body;
    
    // Validate input
    if (!text) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text is required' 
      });
    }

    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'TTS service not configured' 
      });
    }

    console.log(`[TTS] Generating speech: "${text.substring(0, 50)}..." with voice: ${voice}`);
    
    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',  // Use 'tts-1-hd' for higher quality (costs more)
        input: text,
        voice: voice,  // Options: alloy, echo, fable, onyx, nova, shimmer
        speed: speed   // 0.25 to 4.0
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS] OpenAI API error:', response.status, errorText);
      return res.status(response.status).json({ 
        success: false, 
        error: 'TTS generation failed',
        details: process.env.NODE_ENV === 'development' ? errorText : undefined
      });
    }
    
    // Get audio buffer
    const audioBuffer = await response.arrayBuffer();
    
    // Send audio back to client
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.byteLength,
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'X-Voice-Used': voice
    });
    
    res.send(Buffer.from(audioBuffer));
    
    console.log(`[TTS] Successfully generated ${audioBuffer.byteLength} bytes of audio`);
    
  } catch (error) {
    console.error('[TTS] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================================================
// @route   GET /api/tts/voices
// @desc    Get available TTS voices
// @access  Public
// ============================================================================
router.get('/voices', (req, res) => {
  res.json({
    success: true,
    voices: [
      { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
      { id: 'echo', name: 'Echo', description: 'British-accented, refined' },
      { id: 'fable', name: 'Fable', description: 'British-accented, storyteller' },
      { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
      { id: 'nova', name: 'Nova', description: 'Friendly and warm (recommended)' },
      { id: 'shimmer', name: 'Shimmer', description: 'Soft and gentle' }
    ]
  });
});

// ============================================================================
// @route   GET /api/tts/status
// @desc    Check TTS service status
// @access  Public
// ============================================================================
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    hasApiKey: !!process.env.OPENAI_API_KEY,
    availableModels: ['tts-1', 'tts-1-hd'],
    currentModel: 'tts-1'
  });
});

module.exports = router;
