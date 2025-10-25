// ============================================================================
// WHISPER ROUTE - USING AXIOS (Actually Works with FormData)
// ============================================================================
// Problem: Node.js fetch() + form-data package = broken
// Solution: Use axios which properly handles multipart/form-data
// ============================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

// File upload configuration
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: (req, file, cb) => {
        const allowed = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/ogg'];
        if (allowed.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
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

        console.log(`[Whisper] Processing ${(req.file.size / 1024).toFixed(2)} KB (${req.file.mimetype})`);

        // Determine proper file extension based on mime type
        let extension = 'webm';
        if (req.file.mimetype.includes('mp4')) extension = 'mp4';
        else if (req.file.mimetype.includes('wav')) extension = 'wav';
        else if (req.file.mimetype.includes('mp3') || req.file.mimetype.includes('mpeg')) extension = 'mp3';
        else if (req.file.mimetype.includes('ogg')) extension = 'ogg';

        // Create FormData - this works properly with axios
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: `audio.${extension}`,
            contentType: req.file.mimetype
        });
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');

        console.log(`[Whisper] Sending to OpenAI with extension: ${extension}`);

        // Use axios instead of fetch - it properly handles FormData
        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    ...formData.getHeaders()
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            }
        );

        const text = response.data.text?.trim() || '';
        const time = Date.now() - startTime;

        console.log(`[Whisper] ✅ "${text}" (${time}ms)`);

        res.json({
            success: true,
            text: text,
            language: 'en',
            processingTime: time
        });

    } catch (error) {
        console.error('[Whisper] Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Transcription failed',
            message: error.response?.data?.error || error.message
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
