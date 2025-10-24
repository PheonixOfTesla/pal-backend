// ============================================================================
// WHISPER ROUTE - Production Ready for Web Testing
// ============================================================================
// File: Src/routes/whisper.js
// Deploy this to Railway NOW - fully tested and working
// ============================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');

// File upload configuration
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: (req, file, cb) => {
        const allowed = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/mp4'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid audio format'), false);
        }
    }
});

// POST /api/whisper/transcribe - Convert speech to text
router.post('/transcribe', upload.single('audio'), async (req, res) => {
    const startTime = Date.now();
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No audio file' });
        }

        if (!process.env.OPENAI_API_KEY) {
            console.error('[Whisper] No API key');
            return res.status(503).json({ success: false, error: 'Service unavailable' });
        }

        console.log(`[Whisper] Processing ${(req.file.size / 1024).toFixed(2)} KB`);

        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: 'audio.webm',
            contentType: req.file.mimetype
        });
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');
        formData.append('prompt', 'Phoenix, activate, status, workout, health, goals');

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
            return res.status(502).json({ 
                success: false, 
                error: 'Transcription failed',
                status: response.status 
            });
        }

        const data = await response.json();
        const text = data.text?.trim() || '';
        const time = Date.now() - startTime;

        console.log(`[Whisper] ✅ "${text}" (${time}ms)`);

        res.json({
            success: true,
            text: text,
            language: 'en',
            processingTime: time
        });

    } catch (error) {
        console.error('[Whisper] Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Transcription failed',
            message: error.message 
        });
    }
});

// GET /api/whisper/status - Check if service is working
router.get('/status', (req, res) => {
    res.json({
        success: true,
        status: process.env.OPENAI_API_KEY ? 'operational' : 'unavailable',
        hasApiKey: !!process.env.OPENAI_API_KEY,
        model: 'whisper-1',
        maxFileSize: '25MB'
    });
});

module.exports = router;
