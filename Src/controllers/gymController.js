const Gym = require('../models/Gym');
const User = require('../models/User');

// Create new gym
exports.createGym = async (req, res) => {
    try {
        const gymData = {
            ...req.body,
            ownerId: req.user.id
        };
        
        const gym = await Gym.create(gymData);
        
        res.status(201).json({
            success: true,
            message: 'Gym created successfully',
            data: gym
        });
    } catch (error) {
        console.error('Create gym error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get gym by ID
exports.getGymById = async (req, res) => {
    try {
        const gym = await Gym.findById(req.params.id)
            .populate('ownerId', 'name email')
            .populate('staff.userId', 'name email');
        
        if (!gym) {
            return res.status(404).json({
                success: false,
                message: 'Gym not found'
            });
        }
        
        res.json({
            success: true,
            data: gym
        });
    } catch (error) {
        console.error('Get gym error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Update gym
exports.updateGym = async (req, res) => {
    try {
        const gym = await Gym.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        
        if (!gym) {
            return res.status(404).json({
                success: false,
                message: 'Gym not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Gym updated successfully',
            data: gym
        });
    } catch (error) {
        console.error('Update gym error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get gym progress
exports.getGymProgress = async (req, res) => {
    try {
        const gym = await Gym.findById(req.params.id);
        
        if (!gym) {
            return res.status(404).json({
                success: false,
                message: 'Gym not found'
            });
        }
        
        res.json({
            success: true,
            data: {
                setupProgress: gym.setupProgress,
                percentage: gym.setupPercentage,
                isTrialActive: gym.isTrialActive
            }
        });
    } catch (error) {
        console.error('Get gym progress error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Update setup progress
exports.updateSetupProgress = async (req, res) => {
    try {
        const { step } = req.body;
        
        const gym = await Gym.findById(req.params.id);
        
        if (!gym) {
            return res.status(404).json({
                success: false,
                message: 'Gym not found'
            });
        }
        
        if (gym.setupProgress[step] !== undefined) {
            gym.setupProgress[step] = true;
            await gym.save();
        }
        
        res.json({
            success: true,
            data: {
                setupProgress: gym.setupProgress,
                percentage: gym.setupPercentage
            }
        });
    } catch (error) {
        console.error('Update setup progress error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};