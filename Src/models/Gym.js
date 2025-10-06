const mongoose = require('mongoose');

const gymSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Gym name is required'],
        trim: true,
        unique: true
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    description: {
        type: String,
        maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    address: {
        street: String,
        city: String,
        state: String,
        zip: String,
        country: { type: String, default: 'USA' }
    },
    contact: {
        phone: String,
        email: String,
        website: String
    },
    hours: {
        monday: { open: String, close: String },
        tuesday: { open: String, close: String },
        wednesday: { open: String, close: String },
        thursday: { open: String, close: String },
        friday: { open: String, close: String },
        saturday: { open: String, close: String },
        sunday: { open: String, close: String }
    },
    amenities: [String],
    staff: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        role: {
            type: String,
            enum: ['instructor', 'manager', 'receptionist']
        },
        hireDate: Date
    }],
    tier: {
        type: String,
        enum: ['SOLO', 'TEAM', 'ENTERPRISE'],
        default: 'SOLO'
    },
    maxSpecialists: {
        type: Number,
        default: 1
    },
    subscription: {
        status: {
            type: String,
            enum: ['trial', 'active', 'cancelled', 'expired'],
            default: 'trial'
        },
        startDate: {
            type: Date,
            default: Date.now
        },
        endDate: Date,
        stripeSubscriptionId: String
    },
    setupProgress: {
        profile: { type: Boolean, default: false },
        team: { type: Boolean, default: false },
        client: { type: Boolean, default: false },
        workout: { type: Boolean, default: false },
        explore: { type: Boolean, default: false }
    },
    settings: {
        currency: { type: String, default: 'USD' },
        timezone: { type: String, default: 'America/New_York' },
        bookingBuffer: { type: Number, default: 0 }, // minutes before class starts to block booking
        cancellationPolicy: {
            hours: { type: Number, default: 24 },
            refundPercentage: { type: Number, default: 100 }
        }
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Calculate setup completion percentage
gymSchema.virtual('setupPercentage').get(function() {
    const steps = Object.values(this.setupProgress);
    const completed = steps.filter(Boolean).length;
    return Math.round((completed / steps.length) * 100);
});

// Check if trial is active
gymSchema.virtual('isTrialActive').get(function() {
    if (this.subscription.status !== 'trial') return false;
    const trialDays = 7;
    const trialEnd = new Date(this.subscription.startDate);
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    return new Date() < trialEnd;
});

gymSchema.set('toJSON', { virtuals: true });
gymSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Gym', gymSchema);