// Src/models/WearableDevice.js
// Model for storing connected wearable device information
const mongoose = require('mongoose');

const wearableDeviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['fitbit', 'oura', 'whoop', 'garmin', 'polar', 'apple_health'],
    index: true
  },
  deviceId: {
    type: String,
    required: true
  },
  deviceName: {
    type: String
  },
  deviceType: {
    type: String // e.g., 'tracker', 'watch', 'ring'
  },
  connected: {
    type: Boolean,
    default: true,
    index: true
  },
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String
  },
  tokenExpiry: {
    type: Date
  },
  lastSync: {
    type: Date,
    default: Date.now,
    index: true
  },
  syncEnabled: {
    type: Boolean,
    default: true
  },
  scopes: [{
    type: String
  }],
  webhookEnabled: {
    type: Boolean,
    default: false
  },
  webhookSubscriptionId: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  disconnectedAt: {
    type: Date
  },
  disconnectedReason: {
    type: String
  }
}, {
  timestamps: true
});

// Compound index for user + provider (each user can only have one device per provider)
wearableDeviceSchema.index({ userId: 1, provider: 1 }, { unique: true });

// Index for finding active devices
wearableDeviceSchema.index({ userId: 1, connected: true });

// Methods
wearableDeviceSchema.methods.disconnect = function(reason) {
  this.connected = false;
  this.disconnectedAt = new Date();
  this.disconnectedReason = reason;
  return this.save();
};

wearableDeviceSchema.methods.updateLastSync = function() {
  this.lastSync = new Date();
  return this.save();
};

wearableDeviceSchema.methods.isTokenExpired = function() {
  if (!this.tokenExpiry) return false;
  return new Date() > this.tokenExpiry;
};

// Static methods
wearableDeviceSchema.statics.findByUserAndProvider = function(userId, provider) {
  return this.findOne({ userId, provider });
};

wearableDeviceSchema.statics.findActiveDevices = function(userId) {
  return this.find({ userId, connected: true });
};

wearableDeviceSchema.statics.disconnectDevice = async function(userId, provider, reason) {
  const device = await this.findOne({ userId, provider });
  if (device) {
    return device.disconnect(reason);
  }
  return null;
};

const WearableDevice = mongoose.model('WearableDevice', wearableDeviceSchema);

module.exports = WearableDevice;
