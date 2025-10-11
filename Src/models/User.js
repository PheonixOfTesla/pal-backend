// Src/models/User.js - FIXED VERSION WITH AUTO-CREATION
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
    required: function() {
      return this.isNew;
    },
    validate: {
      validator: function(v) {
        return !v || v.length >= 6;
      },
      message: 'Password must be at least 6 characters long'
    }
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
  
  // Multi-Gym Access
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
    type: Number
  },
  
  // ✅ FIXED: Wearable Connections with DEFAULT VALUE
  wearableConnections: {
    type: [{
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
      expiresAt: Date,
      externalUserId: String,
      lastSync: Date,
      scopes: [String]
    }],
    default: [] // ✅ THIS FIXES THE 404 ERROR
  },
  
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

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ gymId: 1, roles: 1 });
userSchema.index({ specialistIds: 1 });
userSchema.index({ clientIds: 1 });

// ✅ ENHANCED: Ensure wearableConnections exists on save
userSchema.pre('save', async function(next) {
  // Hash password if modified
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }
  
  // ✅ ENSURE wearableConnections is initialized
  if (!this.wearableConnections) {
    this.wearableConnections = [];
  }
  
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check gym access
userSchema.methods.hasAccessToGym = function(gymId) {
  const gymIdStr = gymId.toString();
  
  if (this.gymId && this.gymId.toString() === gymIdStr) {
    return true;
  }
  
  if (this.additionalGymIds && this.additionalGymIds.length > 0) {
    return this.additionalGymIds.some(id => id.toString() === gymIdStr);
  }
  
  if (this.roles.includes('engineer') || this.roles.includes('owner')) {
    return true;
  }
  
  return false;
};

// Get accessible gym IDs
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

// Check platform admin
userSchema.methods.isPlatformAdmin = function() {
  return this.roles.includes('engineer') || this.roles.includes('owner');
};

// ✅ FIXED: Ensure wearableConnections is always an array in JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordCode;
  delete obj.resetPasswordExpires;
  
  // ✅ Ensure wearableConnections exists
  if (!obj.wearableConnections) {
    obj.wearableConnections = [];
  }
  
  // Don't expose tokens in regular JSON
  obj.wearableConnections = obj.wearableConnections.map(conn => ({
    provider: conn.provider,
    connected: conn.connected,
    lastSync: conn.lastSync
  }));
  
  return obj;
};

module.exports = mongoose.model('User', userSchema);
