// Src/controllers/wearableController.js - COMPLETE WITH SAFETY CHECKS
const crypto = require('crypto');
const axios = require('axios');
const WearableData = require('../models/WearableData');
const User = require('../models/User');

// ============================================
// PROVIDER CONFIGURATIONS - YOUR REAL CREDENTIALS
// ============================================
const PROVIDERS = {
  // ✅ FITBIT - FULLY CONFIGURED
  fitbit: {
    name: 'Fitbit',
    clientId: process.env.FITBIT_CLIENT_ID || '23TKZ3',
    clientSecret: process.env.FITBIT_CLIENT_SECRET || 'e7d40e8f805e9d0631af7178c0ec1b08',
    redirectUri: process.env.FITBIT_REDIRECT_URI || 'https://clockwork.fit/api/wearables/callback/fitbit',
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    apiBase: 'https://api.fitbit.com/1',
    scope: 'activity heartrate sleep profile weight nutrition',
    usesOAuth2: true,
    rateLimit: { requests: 150, window: 3600000 }
  },
  
  // ❌ GARMIN - NEEDS COMPLETION
  garmin: {
    name: 'Garmin',
    clientId: process.env.GARMIN_CONSUMER_KEY || null,
    clientSecret: process.env.GARMIN_CONSUMER_SECRET || null,
    redirectUri: 'https://clockwork.fit/api/wearables/callback/garmin',
    requestTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
    authUrl: 'https://connect.garmin.com/oauthConfirm',
    accessTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
    apiBase: 'https://apis.garmin.com/wellness-api/rest',
    usesOAuth1: true,
    rateLimit: { requests: 200, window: 3600000 }
  },
  
  // ✅ POLAR - FULLY CONFIGURED
  polar: {
    name: 'Polar',
    clientId: process.env.POLAR_CLIENT_ID || 'ca1d6347-f83c-423d-94ef-c4b4ee06cab6',
    clientSecret: process.env.POLAR_CLIENT_SECRET || '34c2a57a-bbc7-4035-84aa-153db113c809',
    redirectUri: process.env.POLAR_REDIRECT_URI || 'https://clockwork.fit/api/wearables/callback/polar',
    authUrl: 'https://flow.polar.com/oauth2/authorization',
    tokenUrl: 'https://polarremote.com/v2/oauth2/token',
    apiBase: 'https://www.polaraccesslink.com/v3',
    scope: 'accesslink.read_all',
    usesOAuth2: true,
    rateLimit: { requests: 100, window: 3600000 }
  },
  
  // ❌ OURA - NEEDS CREDENTIALS
  oura: {
    name: 'Oura',
    clientId: process.env.OURA_CLIENT_ID || null,
    clientSecret: process.env.OURA_CLIENT_SECRET || null,
    redirectUri: 'https://clockwork.fit/api/wearables/callback/oura',
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    apiBase: 'https://api.ouraring.com/v2',
    scope: 'daily heartrate workout session',
    usesOAuth2: true,
    rateLimit: { requests: 5000, window: 86400000 }
  },

  // ❌ WHOOP - NEEDS MEMBERSHIP
  whoop: {
    name: 'WHOOP',
    clientId: process.env.WHOOP_CLIENT_ID || null,
    clientSecret: process.env.WHOOP_CLIENT_SECRET || null,
    redirectUri: 'https://clockwork.fit/api/wearables/callback/whoop',
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    apiBase: 'https://api.prod.whoop.com/developer/v1',
    scope: 'read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement',
    usesOAuth2: true,
    rateLimit: { requests: 100, window: 3600000 }
  }
};

// ============================================
// IN-MEMORY CACHES
// ============================================
const oauthStates = new Map();
const tokenCache = new Map();
const rateLimitTracker = new Map();

// ============================================
// UTILITY FUNCTIONS
// ============================================

const generateState = () => crypto.randomBytes(32).toString('hex');

const storeState = (state, userId, provider, additionalData = {}) => {
  oauthStates.set(state, { 
    userId, 
    provider, 
    timestamp: Date.now(),
    ...additionalData 
  });
  setTimeout(() => oauthStates.delete(state), 10 * 60 * 1000);
};

const verifyState = (state) => {
  const data = oauthStates.get(state);
  if (data) {
    oauthStates.delete(state);
    return data;
  }
  return null;
};

const checkRateLimit = (provider, userId) => {
  const key = `${provider}:${userId}`;
  const config = PROVIDERS[provider].rateLimit;
  const now = Date.now();
  
  if (!rateLimitTracker.has(key)) {
    rateLimitTracker.set(key, { count: 0, resetAt: now + config.window });
    return true;
  }
  
  const tracker = rateLimitTracker.get(key);
  
  if (now > tracker.resetAt) {
    rateLimitTracker.set(key, { count: 1, resetAt: now + config.window });
    return true;
  }
  
  if (tracker.count >= config.requests) {
    return false;
  }
  
  tracker.count++;
  return true;
};

const buildBasicAuth = (clientId, clientSecret) => {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
};

const createAxiosInstance = (baseURL, timeout = 30000) => {
  const instance = axios.create({
    baseURL,
    timeout,
    headers: {
      'User-Agent': 'ClockWork-Wearables/2.0',
      'Accept': 'application/json'
    }
  });

  instance.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config;
      
      if (!config || !config.retry) {
        config.retry = 0;
      }
      
      if (config.retry >= 3) {
        return Promise.reject(error);
      }
      
      if (error.response?.status >= 500 || error.code === 'ECONNABORTED') {
        config.retry += 1;
        const delay = Math.pow(2, config.retry) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return instance(config);
      }
      
      return Promise.reject(error);
    }
  );

  return instance;
};

// ✅ NEW: ENSURE WEARABLE CONNECTIONS EXIST
const ensureWearableConnections = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
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
    const user = await ensureWearableConnections(userId);

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

  const user = await ensureWearableConnections(userId);

  const connection = user.wearableConnections.find(
    conn => conn.provider === provider
  );

  if (connection) {
    tokenCache.set(cacheKey, connection);
  }

  return connection;
};

const storeWearableData = async (userId, provider, data, date) => {
  try {
    const wearableData = await WearableData.findOneAndUpdate(
      { userId, provider, date: new Date(date) },
      {
        $set: {
          ...data,
          lastSynced: new Date(),
          syncStatus: 'success'
        }
      },
      { upsert: true, new: true }
    );

    return wearableData;
  } catch (error) {
    console.error('Store wearable data error:', error);
    throw error;
  }
};

// ============================================
// OAUTH 2.0 FLOW
// ============================================

const initiateOAuth2 = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;
    
    const config = PROVIDERS[provider];
    if (!config || !config.usesOAuth2) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or unsupported provider' 
      });
    }

    if (!config.clientId || !config.clientSecret) {
      return res.status(500).json({ 
        success: false,
        error: `${config.name} credentials not configured. Please set up ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET` 
      });
    }

    const state = generateState();
    storeState(state, userId, provider);

    const authParams = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scope,
      state: state
    });

    const authUrl = `${config.authUrl}?${authParams.toString()}`;
    
    res.json({ 
      success: true,
      authUrl,
      provider: config.name
    });
  } catch (error) {
    console.error('OAuth initiation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to initiate OAuth' 
    });
  }
};

const handleOAuth2Callback = async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/settings/wearables?error=${error}`);
    }

    const stateData = verifyState(state);
    if (!stateData) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/settings/wearables?error=invalid_state`);
    }

    const config = PROVIDERS[provider];
    const { userId } = stateData;

    const tokenResponse = await axios.post(
      config.tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': buildBasicAuth(config.clientId, config.clientSecret)
        }
      }
    );

    const { access_token, refresh_token, expires_in, user_id } = tokenResponse.data;

    await storeWearableTokens(userId, provider, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      externalUserId: user_id
    });

    res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/settings/wearables?success=${provider}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/settings/wearables?error=auth_failed`);
  }
};

// ============================================
// DATA FETCHING - FITBIT
// ============================================

const fetchFitbitData = async (accessToken, startDate, endDate) => {
  const config = PROVIDERS.fitbit;
  const api = createAxiosInstance(config.apiBase);
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`
  };

  try {
    const [activity, heartRate, sleep] = await Promise.all([
      api.get(`/user/-/activities/date/${startDate}.json`, { headers }),
      api.get(`/user/-/activities/heart/date/${startDate}/1d.json`, { headers }),
      api.get(`/user/-/sleep/date/${startDate}.json`, { headers })
    ]);

    return {
      steps: activity.data.summary?.steps || 0,
      distance: activity.data.summary?.distances?.[0]?.distance || 0,
      caloriesBurned: activity.data.summary?.caloriesOut || 0,
      activeMinutes: (activity.data.summary?.veryActiveMinutes || 0) + (activity.data.summary?.fairlyActiveMinutes || 0),
      restingHeartRate: heartRate.data['activities-heart']?.[0]?.value?.restingHeartRate,
      sleepDuration: sleep.data.summary?.totalMinutesAsleep || 0,
      deepSleep: sleep.data.summary?.stages?.deep || 0,
      lightSleep: sleep.data.summary?.stages?.light || 0,
      remSleep: sleep.data.summary?.stages?.rem || 0,
      rawData: { activity: activity.data, heartRate: heartRate.data, sleep: sleep.data }
    };
  } catch (error) {
    console.error('Fitbit fetch error:', error);
    throw error;
  }
};

// ============================================
// DATA FETCHING - POLAR
// ============================================

const fetchPolarData = async (accessToken, userId) => {
  const config = PROVIDERS.polar;
  const api = createAxiosInstance(config.apiBase);
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`
  };

  try {
    await api.post('/users', { 'member-id': userId }, { headers }).catch(() => {});

    const [exercises, activity] = await Promise.all([
      api.get(`/users/${userId}/exercise-transactions`, { headers }),
      api.get(`/users/${userId}/activity-transactions`, { headers })
    ]);

    const latestActivity = activity.data['activity-log']?.[0] || {};

    return {
      steps: latestActivity.steps || 0,
      caloriesBurned: latestActivity.calories || 0,
      activeMinutes: latestActivity['active-time'] ? Math.floor(latestActivity['active-time'] / 60) : 0,
      rawData: { exercises: exercises.data, activity: activity.data }
    };
  } catch (error) {
    console.error('Polar fetch error:', error);
    throw error;
  }
};

// ============================================
// TOKEN REFRESH
// ============================================

const refreshAccessToken = async (userId, provider) => {
  try {
    const connection = await getWearableConnection(userId, provider);
    if (!connection || !connection.refreshToken) {
      throw new Error('No refresh token available');
    }

    const config = PROVIDERS[provider];
    
    const response = await axios.post(
      config.tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': buildBasicAuth(config.clientId, config.clientSecret)
        }
      }
    );

    const tokens = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || connection.refreshToken,
      expiresIn: response.data.expires_in
    };

    await storeWearableTokens(userId, provider, tokens);
    
    return tokens;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
};

// ============================================
// MAIN SYNC FUNCTION
// ============================================

const syncWearableData = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    if (!PROVIDERS[provider]) {
      return res.status(400).json({ 
        success: false,
        error: 'Unsupported provider' 
      });
    }

    if (!PROVIDERS[provider].clientId) {
      return res.status(501).json({ 
        success: false,
        error: `${PROVIDERS[provider].name} is not yet configured. Please add API credentials.` 
      });
    }

    if (!checkRateLimit(provider, userId)) {
      return res.status(429).json({ 
        success: false,
        error: 'Rate limit exceeded. Please try again later.' 
      });
    }

    let connection = await getWearableConnection(userId, provider);
    if (!connection || !connection.connected) {
      return res.status(404).json({ 
        success: false,
        error: 'Wearable not connected' 
      });
    }

    if (connection.expiresAt && new Date() >= new Date(connection.expiresAt)) {
      try {
        const newTokens = await refreshAccessToken(userId, provider);
        connection.accessToken = newTokens.accessToken;
      } catch (refreshError) {
        return res.status(401).json({ 
          success: false,
          error: 'Token expired. Please reconnect your device.' 
        });
      }
    }

    const today = new Date().toISOString().split('T')[0];
    let data;

    switch (provider) {
      case 'fitbit':
        data = await fetchFitbitData(connection.accessToken, today, today);
        break;
      case 'polar':
        data = await fetchPolarData(connection.accessToken, userId);
        break;
      case 'oura':
      case 'whoop':
      case 'garmin':
        return res.status(501).json({ 
          success: false,
          error: `${PROVIDERS[provider].name} integration coming soon. Please add API credentials to enable.` 
        });
      default:
        return res.status(400).json({ 
          success: false,
          error: 'Provider not implemented' 
        });
    }

    await storeWearableData(userId, provider, data, today);

    res.json({ 
      success: true, 
      data,
      provider: PROVIDERS[provider].name,
      syncedAt: new Date()
    });
  } catch (error) {
    console.error('Sync error:', error);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication failed. Please reconnect your device.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to sync wearable data' 
    });
  }
};

// ============================================
// USER-FACING ENDPOINTS (ENHANCED)
// ============================================

const getConnections = async (req, res) => {
  try {
    const user = await ensureWearableConnections(req.user.id);
    
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

const getWearableData = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, provider } = req.query;

    const query = { userId };
    
    if (provider) {
      query.provider = provider;
    }
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const data = await WearableData.find(query).sort('-date').limit(30);

    res.json({ 
      success: true,
      count: data.length,
      data 
    });
  } catch (error) {
    console.error('Get wearable data error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch wearable data' 
    });
  }
};

const manualEntry = async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, ...dataFields } = req.body;

    const wearableData = await storeWearableData(
      userId,
      'manual',
      dataFields,
      date || new Date()
    );

    res.json({ 
      success: true,
      data: wearableData 
    });
  } catch (error) {
    console.error('Manual entry error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to save manual entry' 
    });
  }
};

const disconnect = async (req, res) => {
  try {
    const { provider } = req.params;
    const user = await ensureWearableConnections(req.user.id);

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

const getInsights = async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const data = await WearableData.find({
      userId,
      date: { $gte: startDate }
    }).sort('date');

    if (data.length === 0) {
      return res.json({ 
        success: true,
        insights: null,
        message: 'No data available for insights' 
      });
    }

    const insights = {
      averageSteps: Math.round(data.reduce((sum, d) => sum + (d.steps || 0), 0) / data.length),
      averageSleep: Math.round(data.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / data.length),
      averageCalories: Math.round(data.reduce((sum, d) => sum + (d.caloriesBurned || 0), 0) / data.length),
      dataPoints: data.length,
      period: days
    };

    res.json({ 
      success: true,
      insights 
    });
  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate insights' 
    });
  }
};

const oauthCallback = handleOAuth2Callback;
const syncNow = syncWearableData;
const initiateGarminOAuth = (req, res) => {
  res.status(501).json({ 
    success: false,
    error: 'Garmin OAuth not yet configured. Please add GARMIN_CONSUMER_KEY and GARMIN_CONSUMER_SECRET' 
  });
};

// ============================================
// EXPORTS
// ============================================
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
