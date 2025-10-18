// Src/controllers/workoutController.js - Production Workout Controller
// FILE MODIFICATION #5: Add new methods for workout logging

const Workout = require('../models/Workout');
const Exercise = require('../models/Exercise');
const WearableData = require('../models/WearableData');
const WorkoutTemplate = require('../models/WorkoutTemplate');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// ========================================
// LOG WORKOUT (NEW METHOD)
// ========================================

exports.logWorkout = async (req, res) => {
    try {
        const { name, type, exercises, duration, notes, mood } = req.body;
        const userId = req.user._id;

        // Create workout
        const workout = await Workout.create({
            user: userId,
            name: name || 'Workout',
            type: type || 'strength',
            duration: duration || 0,
            exercises: exercises || [],
            notes: notes || '',
            mood: mood || 'good',
            completedAt: new Date()
        });

        // Calculate total volume
        let totalVolume = 0;
        if (exercises && exercises.length > 0) {
            exercises.forEach(ex => {
                if (ex.sets && ex.reps && ex.weight) {
                    totalVolume += ex.sets * ex.reps * ex.weight;
                }
            });
        }

        workout.totalVolume = totalVolume;
        await workout.save();

        // Get latest recovery score for AI analysis
        const latestWearable = await WearableData.findOne({ user: userId })
            .sort({ timestamp: -1 })
            .select('recoveryScore hrv');

        // Generate AI feedback if Gemini is available
        let aiFeedback = null;
        if (genAI && latestWearable) {
            try {
                const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
                const prompt = `
                    User completed workout: ${name}
                    Type: ${type}
                    Duration: ${duration} minutes
                    Total Volume: ${totalVolume} lbs
                    Mood: ${mood}
                    Recovery Score: ${latestWearable.recoveryScore || 'N/A'}%
                    HRV: ${latestWearable.hrv || 'N/A'} ms
                    
                    Provide brief performance feedback (2-3 sentences) considering their recovery.
                `;
                
                const result = await model.generateContent(prompt);
                aiFeedback = result.response.text();
            } catch (error) {
                console.error('AI feedback generation failed:', error);
            }
        }

        res.json({
            success: true,
            message: 'Workout logged successfully',
            data: workout,
            aiFeedback: aiFeedback
        });

    } catch (error) {
        console.error('Log workout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to log workout',
            error: error.message
        });
    }
};

// ========================================
// GET RECENT WORKOUTS (NEW METHOD)
// ========================================

exports.getRecentWorkouts = async (req, res) => {
    try {
        const userId = req.user._id;
        const limit = parseInt(req.query.limit) || 10;

        const workouts = await Workout.find({ user: userId })
            .sort({ completedAt: -1 })
            .limit(limit)
            .select('name type duration exercises completedAt mood totalVolume');

        // Calculate stats
        const stats = {
            totalWorkouts: await Workout.countDocuments({ user: userId }),
            thisWeek: await Workout.countDocuments({
                user: userId,
                completedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }),
            avgDuration: 0,
            totalVolume: 0
        };

        if (workouts.length > 0) {
            stats.avgDuration = Math.round(
                workouts.reduce((sum, w) => sum + (w.duration || 0), 0) / workouts.length
            );
            stats.totalVolume = workouts.reduce((sum, w) => sum + (w.totalVolume || 0), 0);
        }

        res.json({
            success: true,
            data: workouts,
            stats: stats
        });

    } catch (error) {
        console.error('Get recent workouts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch workouts',
            error: error.message
        });
    }
};

// ========================================
// GET LAST WORKOUT OF TYPE (NEW METHOD)
// ========================================

exports.getLastWorkout = async (req, res) => {
    try {
        const userId = req.user._id;
        const { type } = req.params;

        const workout = await Workout.findOne({ 
            user: userId,
            type: type 
        })
            .sort({ completedAt: -1 })
            .select('name type duration exercises completedAt totalVolume');

        if (!workout) {
            return res.json({
                success: true,
                data: null,
                message: `No ${type} workouts found`
            });
        }

        res.json({
            success: true,
            data: workout
        });

    } catch (error) {
        console.error('Get last workout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch last workout',
            error: error.message
        });
    }
};

// ========================================
// GET WORKOUT SUGGESTION (NEW METHOD)
// ========================================

exports.getWorkoutSuggestion = async (req, res) => {
    try {
        const userId = req.user._id;
        const { type } = req.params;

        // Get latest recovery data
        const latestWearable = await WearableData.findOne({ user: userId })
            .sort({ timestamp: -1 })
            .select('recoveryScore hrv sleepDuration');

        // Get recent workouts
        const recentWorkouts = await Workout.find({ user: userId, type: type })
            .sort({ completedAt: -1 })
            .limit(3)
            .select('name exercises totalVolume completedAt');

        // Generate AI suggestion if available
        let suggestion = null;
        if (genAI && latestWearable) {
            try {
                const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
                const prompt = `
                    User wants a ${type} workout suggestion.
                    
                    Recovery Score: ${latestWearable.recoveryScore || 'N/A'}%
                    HRV: ${latestWearable.hrv || 'N/A'} ms
                    Sleep: ${latestWearable.sleepDuration ? (latestWearable.sleepDuration / 60).toFixed(1) : 'N/A'} hours
                    
                    Recent workouts:
                    ${recentWorkouts.map((w, i) => `${i + 1}. ${w.name} - ${Math.round((Date.now() - w.completedAt) / (1000 * 60 * 60 * 24))} days ago`).join('\n')}
                    
                    Based on recovery, suggest a specific ${type} workout with exercises, sets, reps.
                    Be concise (5-8 exercises). Consider progressive overload.
                `;
                
                const result = await model.generateContent(prompt);
                suggestion = result.response.text();
            } catch (error) {
                console.error('AI suggestion failed:', error);
            }
        }

        // Fallback: Get template
        if (!suggestion) {
            const template = await WorkoutTemplate.findOne({ type: type });
            suggestion = template ? template.description : `${type} workout - customize based on your goals`;
        }

        res.json({
            success: true,
            data: {
                type: type,
                recoveryScore: latestWearable?.recoveryScore || 0,
                recommendation: suggestion,
                recentWorkouts: recentWorkouts
            }
        });

    } catch (error) {
        console.error('Get workout suggestion error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate suggestion',
            error: error.message
        });
    }
};

// ========================================
// GET WORKOUT TEMPLATES (NEW METHOD)
// ========================================

exports.getTemplates = async (req, res) => {
    try {
        const templates = await WorkoutTemplate.find({ isActive: true })
            .select('name type description exercises difficulty');

        res.json({
            success: true,
            data: templates
        });

    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch templates',
            error: error.message
        });
    }
};

// ========================================
// EXISTING METHODS (Keep these)
// ========================================

exports.getWorkoutsByClient = async (req, res) => {
    try {
        const { clientId } = req.params;
        const workouts = await Workout.find({ user: clientId })
            .sort({ completedAt: -1 })
            .populate('exercises');

        res.json({
            success: true,
            data: workouts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.createWorkout = async (req, res) => {
    try {
        const workout = await Workout.create({
            ...req.body,
            user: req.body.clientId
        });

        res.json({
            success: true,
            data: workout
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateWorkout = async (req, res) => {
    try {
        const workout = await Workout.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!workout) {
            return res.status(404).json({
                success: false,
                message: 'Workout not found'
            });
        }

        res.json({
            success: true,
            data: workout
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteWorkout = async (req, res) => {
    try {
        const workout = await Workout.findByIdAndDelete(req.params.id);

        if (!workout) {
            return res.status(404).json({
                success: false,
                message: 'Workout not found'
            });
        }

        res.json({
            success: true,
            message: 'Workout deleted'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
