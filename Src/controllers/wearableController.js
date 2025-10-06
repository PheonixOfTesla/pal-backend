const WearableData = require('../models/WearableData');
const User = require('../models/User');

// Get wearable data for a user
exports.getWearableData = async (req, res) => {
    try {
        const { userId } = req.params;
        const { startDate, endDate, provider, metric } = req.query;
        
        let query = { userId };
        
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        
        if (provider) query.provider = provider;
        
        let data = await WearableData.find(query).sort('-date').limit(100);
        
        // If specific metric requested, extract just that
        if (metric && data.length > 0) {
            data = data.map(d => ({
                date: d.date,
                value: d[metric],
                provider: d.provider
            }));
        }
        
        res.json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error('Get wearable data error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Manual entry for users without wearables
exports.manualEntry = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const wearableData = await WearableData.create({
            userId,
            provider: 'manual',
            date: req.body.date || new Date(),
            steps: req.body.steps,
            distance: req.body.distance,
            activeMinutes: req.body.activeMinutes,
            caloriesBurned: req.body.caloriesBurned,
            sleepDuration: req.body.sleepDuration,
            weight: req.body.weight,
            restingHeartRate: req.body.restingHeartRate
        });
        
        res.status(201).json({
            success: true,
            message: 'Data logged successfully',
            data: wearableData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get connection status
exports.getConnections = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        const connections = user.wearableConnections || [];
        
        // Don't send tokens to frontend
        const safeConnections = connections.map(conn => ({
            provider: conn.provider,
            connected: conn.connected,
            lastSync: conn.lastSync,
            scopes: conn.scopes
        }));
        
        res.json({
            success: true,
            connections: safeConnections
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// OAuth callback handler (generic)
exports.oauthCallback = async (req, res) => {
    try {
        const { provider } = req.params;
        const { code, state } = req.query;
        
        // Verify state to prevent CSRF
        // Exchange code for tokens
        // Store tokens in user profile
        // Trigger initial sync
        
        res.redirect('/dashboard?wearable_connected=true');
    } catch (error) {
        res.redirect('/dashboard?wearable_error=true');
    }
};

// Disconnect wearable
exports.disconnect = async (req, res) => {
    try {
        const { provider } = req.params;
        
        const user = await User.findById(req.user.id);
        
        user.wearableConnections = user.wearableConnections.filter(
            conn => conn.provider !== provider
        );
        
        await user.save();
        
        res.json({
            success: true,
            message: `${provider} disconnected successfully`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Sync data from provider
exports.syncNow = async (req, res) => {
    try {
        const { provider } = req.params;
        
        // Trigger sync job
        // This would call the appropriate provider's API
        
        res.json({
            success: true,
            message: 'Sync initiated'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get analytics/insights
exports.getInsights = async (req, res) => {
    try {
        const { userId } = req.params;
        const daysBack = parseInt(req.query.days) || 7;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        
        const data = await WearableData.find({
            userId,
            date: { $gte: startDate }
        }).sort('date');
        
        // Calculate insights
        const insights = {
            averages: {
                steps: Math.round(data.reduce((sum, d) => sum + (d.steps || 0), 0) / data.length),
                sleep: Math.round(data.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / data.length),
                activeMinutes: Math.round(data.reduce((sum, d) => sum + (d.activeMinutes || 0), 0) / data.length),
                restingHR: Math.round(data.reduce((sum, d) => sum + (d.restingHeartRate || 0), 0) / data.filter(d => d.restingHeartRate).length)
            },
            trends: {
                steps: calculateTrend(data.map(d => d.steps)),
                sleep: calculateTrend(data.map(d => d.sleepDuration)),
                recovery: calculateTrend(data.map(d => d.recoveryScore))
            },
            streaks: {
                steps: calculateStreak(data, 'steps', 10000),
                sleep: calculateStreak(data, 'sleepDuration', 420) // 7 hours
            }
        };
        
        res.json({
            success: true,
            insights,
            dataPoints: data.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Helper functions
function calculateTrend(values) {
    if (values.length < 2) return 'insufficient_data';
    
    const validValues = values.filter(v => v != null && v > 0);
    if (validValues.length < 2) return 'insufficient_data';
    
    const firstHalf = validValues.slice(0, Math.floor(validValues.length / 2));
    const secondHalf = validValues.slice(Math.floor(validValues.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (change > 5) return 'improving';
    if (change < -5) return 'declining';
    return 'stable';
}

function calculateStreak(data, field, threshold) {
    let currentStreak = 0;
    let maxStreak = 0;
    
    for (const day of data.reverse()) {
        if (day[field] >= threshold) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else {
            currentStreak = 0;
        }
    }
    
    return { current: currentStreak, max: maxStreak };
}