// ============================================================================
// WHISPER SPEECH-TO-TEXT ROUTE - Add to your backend
// ============================================================================
// File: Src/routes/whisper.js
// This uses OpenAI Whisper API for accurate speech recognition
// ============================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');

// Setup multer for audio file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB max
    }
});

// ============================================================================
// @route   POST /api/whisper/transcribe
// @desc    Transcribe audio to text using OpenAI Whisper
// @access  Public
// ============================================================================
router.post('/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided'
            });
        }

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'OpenAI API key not configured'
            });
        }

        console.log(`[Whisper] Transcribing audio: ${req.file.size} bytes`);

        // Create FormData for OpenAI API
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: 'audio.webm',
            contentType: req.file.mimetype
        });
        formData.append('model', 'whisper-1');
        
        // Optional: Add language hint for better accuracy
        if (req.body.language) {
            formData.append('language', req.body.language);
        }

        // Optional: Add prompt for context
        if (req.body.prompt) {
            formData.append('prompt', req.body.prompt);
        }

        // Call OpenAI Whisper API
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Whisper] API error:', response.status, error);
            return res.status(response.status).json({
                success: false,
                error: 'Whisper transcription failed',
                details: process.env.NODE_ENV === 'development' ? error : undefined
            });
        }

        const data = await response.json();

        console.log(`[Whisper] ✅ Transcribed: "${data.text}"`);

        res.json({
            success: true,
            text: data.text,
            language: data.language || 'en'
        });

    } catch (error) {
        console.error('[Whisper] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Transcription failed',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================================================
// @route   GET /api/whisper/status
// @desc    Check Whisper service status
// @access  Public
// ============================================================================
router.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'operational',
        hasApiKey: !!process.env.OPENAI_API_KEY,
        model: 'whisper-1',
        supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
        maxFileSize: '25MB'
    });
});

module.exports = router;
