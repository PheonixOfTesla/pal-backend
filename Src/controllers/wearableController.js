// Src/controllers/wearableController.js - ENHANCED WITH SAFETY CHECKS
const crypto = require('crypto');
const axios = require('axios');
const WearableData = require('../models/WearableData');
const User = require('../models/User');

// ... [Keep all your existing PROVIDERS config] ...

// ============================================
// UTILITY: ENSURE WEARABLE CONNECTIONS EXIST
// ============================================
const ensureWearableConnections = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // ✅ AUTO-FIX: Initialize if missing
  if (!user.wearableConnections || !Array.isArray(user.wearableConnections)) {
    console.log(`⚠️  Initializing wearableConnections for user ${userId}`);
    user.wearableConnections = [];
    await user.save();
  }
  
  return user;
};

// ============================================
// DATABASE OPERATIONS (ENHANCED)
// ============================================

const storeWearableTokens = async (userId, provider, tokens) => {
  try {
    const user = await ensureWearableConnections(userId); // ✅ USE HELPER

    const connectionIndex = user.wearableConnections.findIndex(
      conn => conn.provider === provider
    );

    const connectionData = {
      provider,
      connected: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
      externalUserId: tokens.externalUserId,
      lastSync: new Date(),
      scopes: tokens.scope ? tokens.scope.split(' ') : []
    };

    if (connectionIndex >= 0) {
      user.wearableConnections[connectionIndex] = connectionData;
    } else {
      user.wearableConnections.push(connectionData);
    }

    await user.save();
    tokenCache.set(`${userId}:${provider}`, connectionData);
    
    return connectionData;
  } catch (error) {
    console.error('Store tokens error:', error);
    throw error;
  }
};

const getWearableConnection = async (userId, provider) => {
  const cacheKey = `${userId}:${provider}`;
  
  if (tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey);
  }

  const user = await ensureWearableConnections(userId); // ✅ USE HELPER

  const connection = user.wearableConnections.find(
    conn => conn.provider === provider
  );

  if (connection) {
    tokenCache.set(cacheKey, connection);
  }

  return connection;
};

// ... [Keep all your existing OAuth and data fetching functions] ...

// ============================================
// USER-FACING ENDPOINTS (ENHANCED)
// ============================================

const getConnections = async (req, res) => {
  try {
    const user = await ensureWearableConnections(req.user.id); // ✅ USE HELPER
    
    const connections = user.wearableConnections.map(conn => ({
      provider: conn.provider,
      connected: conn.connected,
      lastSync: conn.lastSync,
      providerName: PROVIDERS[conn.provider]?.name || conn.provider
    }));

    res.json({ 
      success: true,
      connections 
    });
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch connections' 
    });
  }
};

const disconnect = async (req, res) => {
  try {
    const { provider } = req.params;
    const user = await ensureWearableConnections(req.user.id); // ✅ USE HELPER

    const connectionIndex = user.wearableConnections.findIndex(
      conn => conn.provider === provider
    );

    if (connectionIndex >= 0) {
      user.wearableConnections.splice(connectionIndex, 1);
      await user.save();
      
      tokenCache.delete(`${req.user.id}:${provider}`);
    }

    res.json({ 
      success: true,
      message: `${PROVIDERS[provider]?.name || provider} disconnected` 
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to disconnect wearable' 
    });
  }
};

// ... [Keep all other existing functions] ...

module.exports = {
  initiateOAuth2,
  handleOAuth2Callback,
  initiateGarminOAuth,
  oauthCallback,
  syncWearableData,
  syncNow,
  getWearableData,
  getConnections,
  getInsights,
  manualEntry,
  disconnect,
  refreshAccessToken,
  fetchFitbitData,
  fetchPolarData
};
