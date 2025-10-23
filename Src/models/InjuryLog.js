const mongoose = require('mongoose');

const injuryLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  bodyPart: {
    type: String,
    required: true,
    enum: [
      'shoulder',
      'elbow',
      'wrist',
      'hand',
      'neck',
      'upper-back',
      'lower-back',
      'hip',
      'knee',
      'ankle',
      'foot',
      'chest',
      'abdomen',
      'groin',
      'hamstring',
      'quad',
      'calf',
      'other'
    ]
  },
  specificArea: String,  // E.g., "Right rotator cuff", "Left ACL"
  injuryType: {
    type: String,
    enum: [
      'strain',
      'sprain',
      'tear',
      'fracture',
      'tendonitis',
      'bursitis',
      'stress-fracture',
      'overuse',
      'acute',
      'chronic',
      'other'
    ]
  },
  severity: {
    type: String,
    enum: ['minor', 'moderate', 'severe', 'critical'],
    required: true,
    default: 'moderate'
  },
  painLevel: {
    current: {
      type: Number,
      min: 0,
      max: 10,
      required: true
    },
    initial: {
      type: Number,
      min: 0,
      max: 10
    },
    history: [{
      date: Date,
      level: Number,
      notes: String
    }]
  },
  description: {
    type: String,
    required: true
  },
  cause: {
    type: String,
    enum: [
      'overtraining',
      'poor-form',
      'insufficient-warmup',
      'accident',
      'overuse',
      'insufficient-recovery',
      'previous-injury',
      'unknown',
      'other'
    ]
  },
  causeDescription: String,
  relatedWorkout: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workout'
  },
  relatedExercise: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise'
  },
  dateOccurred: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  dateReported: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'recovering', 'healed', 'chronic'],
    default: 'active'
  },
  recoveryDate: Date,
  estimatedRecoveryTime: {
    value: Number,
    unit: {
      type: String,
      enum: ['days', 'weeks', 'months']
    }
  },
  treatment: {
    medical: {
      seen: Boolean,
      provider: String,
      diagnosis: String,
      medications: [String],
      procedures: [String]
    },
    therapy: {
      physical: Boolean,
      massage: Boolean,
      chiropractic: Boolean,
      other: String
    },
    selfCare: [{
      type: String,
      enum: ['rest', 'ice', 'compression', 'elevation', 'stretching', 'foam-rolling', 'other']
    }]
  },
  modifications: [{
    exerciseToAvoid: String,
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise'
    },
    alternative: String,
    restrictions: String  // E.g., "No overhead pressing"
  }],
  rehabProtocol: {
    phases: [{
      phase: Number,
      name: String,  // E.g., "Acute", "Strength Building", "Return to Sport"
      duration: String,
      exercises: [String],
      goals: [String],
      completed: Boolean
    }],
    currentPhase: Number
  },
  progressNotes: [{
    date: {
      type: Date,
      default: Date.now
    },
    painLevel: Number,
    rangeOfMotion: String,  // E.g., "50% of normal", "Full ROM"
    strength: String,        // E.g., "Weak", "Improving", "Normal"
    functionalAbility: String,
    notes: String
  }],
  preventionLearnings: [String],  // What user learned to prevent future
  recurrence: {
    isPreviousInjury: Boolean,
    previousInjuryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InjuryLog'
    },
    recurrenceCount: Number
  },
  impact: {
    missedWorkouts: Number,
    modifiedWorkouts: Number,
    daysOffTraining: Number,
    mentalImpact: {
      type: String,
      enum: ['none', 'mild', 'moderate', 'severe']
    }
  },
  photos: [String],  // URLs to injury photos for tracking
  tags: [String],
  notes: String
}, {
  timestamps: true
});

// Compound indexes
injuryLogSchema.index({ userId: 1, status: 1 });
injuryLogSchema.index({ userId: 1, bodyPart: 1 });
injuryLogSchema.index({ userId: 1, dateOccurred: -1 });

// Virtual for injury duration
injuryLogSchema.virtual('duration').get(function() {
  const end = this.recoveryDate || new Date();
  const start = this.dateOccurred;
  const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  return days;
});

// Virtual for recovery percentage
injuryLogSchema.virtual('recoveryPercentage').get(function() {
  if (this.status === 'healed') return 100;
  if (this.status === 'chronic') return 50;
  
  if (this.painLevel.initial && this.painLevel.current) {
    const improvement = ((this.painLevel.initial - this.painLevel.current) / this.painLevel.initial) * 100;
    return Math.max(0, Math.min(100, Math.round(improvement)));
  }
  
  return 0;
});

// Method to add progress note
injuryLogSchema.methods.addProgressNote = function(progressData) {
  this.progressNotes.push({
    date: new Date(),
    ...progressData
  });
  
  // Update current pain level
  if (progressData.painLevel !== undefined) {
    this.painLevel.history.push({
      date: new Date(),
      level: progressData.painLevel,
      notes: progressData.notes
    });
    this.painLevel.current = progressData.painLevel;
  }
  
  return this.save();
};

// Method to mark as healed
injuryLogSchema.methods.markAsHealed = function() {
  this.status = 'healed';
  this.recoveryDate = new Date();
  this.painLevel.current = 0;
  return this.save();
};

// Method to calculate risk score for re-injury
injuryLogSchema.methods.calculateReinjuryRisk = function() {
  let risk = 0;
  
  // Recurrence history
  if (this.recurrence.isPreviousInjury) {
    risk += 30;
  }
  if (this.recurrence.recurrenceCount > 1) {
    risk += 20;
  }
  
  // Recovery quality
  if (this.duration < 7 && this.severity !== 'minor') {
    risk += 25; // Rushed recovery
  }
  
  // Current pain
  if (this.painLevel.current > 3) {
    risk += 20;
  }
  
  // Status
  if (this.status === 'chronic') {
    risk += 30;
  }
  
  return Math.min(100, risk);
};

// Static method to get injury patterns
injuryLogSchema.statics.getInjuryPatterns = async function(userId) {
  const injuries = await this.find({ userId }).sort({ dateOccurred: -1 });
  
  // Count by body part
  const bodyPartCounts = {};
  const causeCounts = {};
  
  injuries.forEach(injury => {
    bodyPartCounts[injury.bodyPart] = (bodyPartCounts[injury.bodyPart] || 0) + 1;
    if (injury.cause) {
      causeCounts[injury.cause] = (causeCounts[injury.cause] || 0) + 1;
    }
  });
  
  return {
    totalInjuries: injuries.length,
    activeInjuries: injuries.filter(i => i.status === 'active').length,
    recurrentInjuries: injuries.filter(i => i.recurrence.isPreviousInjury).length,
    mostCommonBodyPart: Object.keys(bodyPartCounts).reduce((a, b) => 
      bodyPartCounts[a] > bodyPartCounts[b] ? a : b, null
    ),
    mostCommonCause: Object.keys(causeCounts).reduce((a, b) => 
      causeCounts[a] > causeCounts[b] ? a : b, null
    ),
    bodyPartDistribution: bodyPartCounts,
    causeDistribution: causeCounts,
    averageRecoveryTime: injuries
      .filter(i => i.recoveryDate)
      .reduce((sum, i) => sum + i.duration, 0) / injuries.filter(i => i.recoveryDate).length || 0
  };
};

// Static method to get active injuries
injuryLogSchema.statics.getActiveInjuries = async function(userId) {
  return await this.find({
    userId,
    status: { $in: ['active', 'recovering'] }
  }).sort({ dateOccurred: -1 });
};

module.exports = mongoose.model('InjuryLog', injuryLogSchema);
