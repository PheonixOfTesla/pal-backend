// ============================================================================
// TTS ROUTE - Production Ready for Web Testing
// ============================================================================
// File: Src/routes/tts.js
// Deploy this to Railway NOW - fully tested and working
// ============================================================================

const express = require('express');
const router = express.Router();

// Simple in-memory cache
const cache = new Map();
const crypto = require('crypto');

function getCacheKey(text, voice, speed) {
    return crypto.createHash('md5').update(`${text}:${voice}:${speed}`).digest('hex');
}

// POST /api/tts/generate - Convert text to speech
router.post('/generate', async (req, res) => {
    const startTime = Date.now();
    
    try {
        let { text, voice = 'nova', speed = 1.0, model = 'tts-1' } = req.body;

        // Validate
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ success: false, error: 'Text required' });
        }
        if (text.length > 4000) {
            return res.status(400).json({ success: false, error: 'Text too long (max 4000 chars)' });
        }
        if (!['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(voice)) {
            return res.status(400).json({ success: false, error: 'Invalid voice' });
        }
        if (speed < 0.25 || speed > 4.0) {
            return res.status(400).json({ success: false, error: 'Speed must be 0.25-4.0' });
        }

        if (!process.env.OPENAI_API_KEY) {
            console.error('[TTS] No API key');
            return res.status(503).json({ success: false, error: 'Service unavailable' });
        }

        text = text.trim().substring(0, 4000);
        console.log(`[TTS] "${text.substring(0, 50)}..." voice:${voice}`);

        // Check cache
        const cacheKey = getCacheKey(text, voice, speed);
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            console.log(`[TTS] ✅ Cache hit (${Date.now() - startTime}ms)`);
            res.set({
                'Content-Type': 'audio/mpeg',
                'X-Cache': 'HIT',
                'Cache-Control': 'public, max-age=3600'
            });
            return res.send(cached);
        }

        // Call OpenAI
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model, input: text, voice, speed })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[TTS] API error:', response.status, error);
            return res.status(502).json({ 
                success: false, 
                error: 'TTS failed',
                status: response.status 
            });
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        const time = Date.now() - startTime;

        // Cache it (limit cache size)
        if (cache.size > 100) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        cache.set(cacheKey, audioBuffer);

        console.log(`[TTS] ✅ ${(audioBuffer.length / 1024).toFixed(2)} KB (${time}ms)`);

        res.set({
            'Content-Type': 'audio/mpeg',
            'X-Cache': 'MISS',
            'X-Voice': voice,
            'Cache-Control': 'public, max-age=3600'
        });
        res.send(audioBuffer);

    } catch (error) {
        console.error('[TTS] Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'TTS failed',
            message: error.message 
        });
    }
});

// GET /api/tts/voices - Get available voices
router.get('/voices', (req, res) => {
    res.json({
        success: true,
        voices: [
            { id: 'alloy', name: 'Alloy', description: 'Neutral' },
            { id: 'echo', name: 'Echo', description: 'British male' },
            { id: 'fable', name: 'Fable', description: 'British storyteller' },
            { id: 'onyx', name: 'Onyx', description: 'Deep male' },
            { id: 'nova', name: 'Nova', description: 'Warm female (recommended)' },
            { id: 'shimmer', name: 'Shimmer', description: 'Gentle female' }
        ]
    });
});

// GET /api/tts/status - Check if service is working
router.get('/status', (req, res) => {
    res.json({
        success: true,
        status: process.env.OPENAI_API_KEY ? 'operational' : 'unavailable',
        hasApiKey: !!process.env.OPENAI_API_KEY,
        cacheSize: cache.size,
        model: 'tts-1'
    });
});

module.exports = router;
