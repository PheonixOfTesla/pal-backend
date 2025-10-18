// Src/models/WorkoutTemplate.js - NEW FILE
// Workout Templates for AI Suggestions

const mongoose = require('mongoose');

const WorkoutTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        required: true,
        enum: ['strength', 'cardio', 'flexibility', 'sports', 'hybrid'],
        default: 'strength'
    },
    description: {
        type: String,
        required: true
    },
    difficulty: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'intermediate'
    },
    exercises: [{
        name: String,
        sets: Number,
        reps: Number,
        weight: String, // "bodyweight", "50%1RM", "moderate", etc.
        rest: Number, // seconds
        notes: String
    }],
    targetMuscles: [String],
    estimatedDuration: {
        type: Number, // minutes
        default: 60
    },
    recommendedRecoveryScore: {
        type: Number, // minimum recovery score recommended
        default: 60
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: String,
        default: 'system'
    }
}, {
    timestamps: true
});

// Index for fast lookups
WorkoutTemplateSchema.index({ type: 1, difficulty: 1, isActive: 1 });

// Static method to get template by recovery score
WorkoutTemplateSchema.statics.getByRecoveryScore = async function(type, recoveryScore) {
    let difficulty = 'beginner';
    
    if (recoveryScore >= 80) {
        difficulty = 'advanced';
    } else if (recoveryScore >= 60) {
        difficulty = 'intermediate';
    }
    
    return await this.findOne({
        type: type,
        difficulty: difficulty,
        isActive: true
    });
};

// Instance method to format for display
WorkoutTemplateSchema.methods.formatForDisplay = function() {
    return {
        name: this.name,
        type: this.type,
        difficulty: this.difficulty,
        duration: this.estimatedDuration,
        exercises: this.exercises.map(ex => ({
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            rest: ex.rest
        }))
    };
};

module.exports = mongoose.model('WorkoutTemplate', WorkoutTemplateSchema);