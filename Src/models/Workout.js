const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Exercise name is required'],
        trim: true
    },
    sets: {
        type: Number,
        required: [true, 'Number of sets is required'],
        min: [1, 'Sets must be at least 1'],
        max: [20, 'Sets cannot exceed 20']
    },
    reps: {
        type: String,
        required: [true, 'Reps are required'],
        trim: true,
        validate: {
            validator: function(v) {
                return /^(\d+(-\d+)?|[\d\s]+(s|sec|seconds|min|minutes)?)$/i.test(v);
            },
            message: 'Reps must be a number, range (8-12), or time (30s)'
        }
    },
    weight: {
        type: Number,
        default: 0,
        min: [0, 'Weight cannot be negative']
    },
    holdTime: {
        type: Number,
        default: 0,
        min: [0, 'Hold time cannot be negative'],
        max: [600, 'Hold time cannot exceed 10 minutes']
    },
    notes: {
        type: String,
        maxlength: [500, 'Notes cannot exceed 500 characters'],
        trim: true
    },
    grouping: {
        type: String,
        enum: ['none', 'superset', 'triset'],
        default: 'none'
    },
    groupId: String,
    groupType: String,
    youtubeLink: String
});

const workoutSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Workout name is required'],
        trim: true,
        maxlength: [100, 'Workout name cannot exceed 100 characters']
    },
    clientId: {  // <-- CHANGED from 'client' to 'clientId'
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Client is required']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Creator is required']
    },
    assignedBy: {  // <-- ADD THIS FIELD to match other models
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    scheduledDate: {
        type: Date,
        validate: {
            validator: function(v) {
                return !v || v instanceof Date;
            },
            message: 'Invalid scheduled date'
        }
    },
    exercises: {
        type: [exerciseSchema],
        validate: {
            validator: function(v) {
                return v && v.length > 0;
            },
            message: 'At least one exercise is required'
        }
    },
    youtubeLink: {
        type: String,
        default: '',
        trim: true,
        validate: {
            validator: function(v) {
                if (!v || v === '') return true;
                return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\/.+/.test(v);
            },
            message: 'Please enter a valid YouTube or Vimeo URL'
        }
    },
    completed: {
        type: Boolean,
        default: false
    },
    completedAt: {
        type: Date,
        validate: {
            validator: function(v) {
                if (this.completed && !v) return false;
                return true;
            },
            message: 'Completed date is required when workout is marked as complete'
        }
    },
    moodFeedback: {
        type: Number,
        min: [1, 'Mood must be at least 1'],
        max: [5, 'Mood cannot exceed 5']
    },
    notes: {
        type: String,
        maxlength: [1000, 'Notes cannot exceed 1000 characters'],
        trim: true
    },
    duration: {
        type: Number,
        min: [0, 'Duration cannot be negative'],
        max: [480, 'Duration cannot exceed 8 hours']
    },
    averagePainLevel: {
        type: Number,
        min: [0, 'Pain level cannot be negative'],
        max: [10, 'Pain level cannot exceed 10']
    },
    sessionData: [{
        exercise: String,
        set: Number,
        reps: Number,
        weight: Number,
        difficulty: {
            type: Number,
            min: 1,
            max: 5
        },
        painLevel: {
            type: Number,
            min: 0,
            max: 10
        },
        notes: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    repeatWeekly: {
        type: Boolean,
        default: false
    },
    parentWorkout: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workout'
    }
}, {
    timestamps: true
});

// Update indexes to use clientId
workoutSchema.index({ clientId: 1, scheduledDate: -1 });  // <-- CHANGED
workoutSchema.index({ clientId: 1, completed: 1 });       // <-- CHANGED
workoutSchema.index({ createdBy: 1 });
workoutSchema.index({ clientId: 1, createdAt: -1 });      // <-- CHANGED

// Rest of the schema stays the same...
workoutSchema.virtual('exerciseCount').get(function() {
    return this.exercises ? this.exercises.length : 0;
});

workoutSchema.virtual('totalVolume').get(function() {
    if (!this.exercises) return 0;
    return this.exercises.reduce((total, exercise) => {
        let repCount = 0;
        if (exercise.reps) {
            const repsStr = exercise.reps.toString();
            if (repsStr.includes('-')) {
                const [min, max] = repsStr.split('-').map(Number);
                repCount = (min + max) / 2;
            } else {
                repCount = parseInt(repsStr) || 0;
            }
        }
        return total + (exercise.sets * repCount * exercise.weight);
    }, 0);
});

workoutSchema.methods.markComplete = function(moodFeedback, notes, duration) {
    this.completed = true;
    this.completedAt = new Date();
    if (moodFeedback) this.moodFeedback = moodFeedback;
    if (notes) this.notes = notes;
    if (duration) this.duration = duration;
    return this.save();
};

workoutSchema.methods.cloneForDate = function(newDate) {
    const cloned = this.toObject();
    delete cloned._id;
    delete cloned.createdAt;
    delete cloned.updatedAt;
    cloned.scheduledDate = newDate;
    cloned.completed = false;
    cloned.completedAt = undefined;
    cloned.moodFeedback = undefined;
    cloned.sessionData = [];
    cloned.parentWorkout = this._id;
    return cloned;
};

workoutSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Workout', workoutSchema);
