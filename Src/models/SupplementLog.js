const mongoose = require('mongoose');

const supplementLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  supplements: [{
    name: {
      type: String,
      required: true
    },
    brand: String,
    dosage: {
      amount: Number,
      unit: String  // mg, g, IU, mcg, capsules
    },
    time: String,   // e.g., "Morning", "Post-workout", "8:00 AM"
    category: {
      type: String,
      enum: [
        'protein',
        'creatine',
        'pre-workout',
        'post-workout',
        'vitamin',
        'mineral',
        'amino-acid',
        'fat-burner',
        'recovery',
        'sleep-aid',
        'nootropic',
        'joint-support',
        'other'
      ]
    },
    purpose: String,  // Why taking it
    withFood: Boolean,
    cost: Number,
    taken: {
      type: Boolean,
      default: true  // Whether actually taken that day
    }
  }],
  stack: {
    name: String,     // E.g., "Morning Stack", "Pre-Workout Stack"
    totalCost: Number
  },
  adherence: {
    type: Number,
    min: 0,
    max: 100,
    default: 100  // Percentage of supplements taken as planned
  },
  notes: String,
  effectivenessRating: {
    type: Number,
    min: 1,
    max: 10  // User's subjective rating
  },
  sideEffects: [String]
}, {
  timestamps: true
});

// Compound indexes
supplementLogSchema.index({ userId: 1, date: -1 });

// Virtual for daily cost
supplementLogSchema.virtual('dailyCost').get(function() {
  if (!this.supplements || this.supplements.length === 0) return 0;
  return this.supplements.reduce((total, supp) => total + (supp.cost || 0), 0);
});

// Calculate adherence percentage
supplementLogSchema.methods.calculateAdherence = function() {
  if (!this.supplements || this.supplements.length === 0) return 100;
  
  const taken = this.supplements.filter(s => s.taken).length;
  const total = this.supplements.length;
  
  return Math.round((taken / total) * 100);
};

// Pre-save hook to calculate adherence
supplementLogSchema.pre('save', function(next) {
  this.adherence = this.calculateAdherence();
  next();
});

// Static method to get supplement history
supplementLogSchema.statics.getSupplementHistory = async function(userId, supplementName, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await this.find({
    userId,
    date: { $gte: startDate },
    'supplements.name': supplementName
  }).sort({ date: -1 });
};

// Static method to check for interactions
supplementLogSchema.statics.checkInteractions = function(supplements) {
  // Known interactions database (simplified)
  const interactions = {
    'caffeine': {
      warning: ['creatine', 'fat-burner'],
      message: 'May reduce creatine absorption or cause overstimulation'
    },
    'iron': {
      warning: ['calcium', 'zinc'],
      message: 'May reduce absorption of other minerals'
    },
    'vitamin-d': {
      synergy: ['calcium', 'magnesium'],
      message: 'Works better together for bone health'
    }
  };

  const warnings = [];
  const synergies = [];

  supplements.forEach((supp1, i) => {
    const suppName = supp1.name.toLowerCase();
    if (interactions[suppName]) {
      supplements.forEach((supp2, j) => {
        if (i !== j) {
          const supp2Name = supp2.name.toLowerCase();
          
          if (interactions[suppName].warning?.includes(supp2Name)) {
            warnings.push({
              supplements: [supp1.name, supp2.name],
              message: interactions[suppName].message
            });
          }
          
          if (interactions[suppName].synergy?.includes(supp2Name)) {
            synergies.push({
              supplements: [supp1.name, supp2.name],
              message: interactions[suppName].message
            });
          }
        }
      });
    }
  });

  return { warnings, synergies };
};

// Static method to get adherence stats
supplementLogSchema.statics.getAdherenceStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const logs = await this.find({
    userId,
    date: { $gte: startDate }
  });

  if (logs.length === 0) return { average: 0, daysLogged: 0 };

  const totalAdherence = logs.reduce((sum, log) => sum + log.adherence, 0);
  const average = Math.round(totalAdherence / logs.length);

  return {
    average,
    daysLogged: logs.length,
    totalDays: days
  };
};

module.exports = mongoose.model('SupplementLog', supplementLogSchema);
