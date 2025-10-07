const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  
  // Roles
  roles: {
    type: [String],
    enum: ['client', 'specialist', 'admin', 'owner', 'engineer'],
    default: ['client'],
    set: function(roles) {
      if (typeof roles === 'string') {
        return [roles];
      }
      return roles;
    }
  },
  
  // Island-Genesis: Gym Association
  gymId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gym',
    index: true
  },
  
  // Multi-Gym Access (for specialists working at multiple locations)
  additionalGymIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gym'
  }],
  
  // Client-Specialist Relationships
  specialistIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  clientIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Password Reset
  resetPasswordCode: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  
  // Profile
  phone: {
    type: String,
    sparse: true
  },
  dateOfBirth: {
    type: Date
  },
  height: {
    type: Number // in inches
  },
  
  // Wearable Connections
  wearableConnections: [{
    provider: {
      type: String,
      enum: ['fitbit', 'apple', 'garmin', 'whoop', 'oura', 'polar']
    },
    connected: {
      type: Boolean,
      default: false
    },
    accessToken: String,
    refreshToken: String,
    lastSync: Date,
    scopes: [String]
  }],
  
  // Timestamps
  lastLogin: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ gymId: 1, roles: 1 });
userSchema.index({ specialistIds: 1 });
userSchema.index({ clientIds: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user has access to a specific gym
userSchema.methods.hasAccessToGym = function(gymId) {
  const gymIdStr = gymId.toString();
  
  // Primary gym
  if (this.gymId && this.gymId.toString() === gymIdStr) {
    return true;
  }
  
  // Additional gyms (for specialists)
  if (this.additionalGymIds && this.additionalGymIds.length > 0) {
    return this.additionalGymIds.some(id => id.toString() === gymIdStr);
  }
  
  // Engineers and platform owners can access all gyms
  if (this.roles.includes('engineer') || this.roles.includes('owner')) {
    return true;
  }
  
  return false;
};

// Get all gyms user has access to
userSchema.methods.getAccessibleGymIds = function() {
  const gymIds = [];
  
  if (this.gymId) {
    gymIds.push(this.gymId);
  }
  
  if (this.additionalGymIds && this.additionalGymIds.length > 0) {
    gymIds.push(...this.additionalGymIds);
  }
  
  return gymIds;
};

// Check if user is platform admin
userSchema.methods.isPlatformAdmin = function() {
  return this.roles.includes('engineer') || this.roles.includes('owner');
};

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordCode;
  delete obj.resetPasswordExpires;
  delete obj.wearableConnections; // Don't expose tokens
  return obj;
};

module.exports = mongoose.model('User', userSchema);