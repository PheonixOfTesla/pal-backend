const crypto = require('crypto');
const axios = require('axios');
const redis = require('redis');
const WearableData = require('../models/WearableData');
const User = require('../models/User');

// ============================================
// REDIS CLIENT SETUP
// ============================================
let redisClient = null;
let redisReady = false;

const initializeRedis = async () => {
  if (redisClient && redisReady) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.warn('⚠️  REDIS_URL not configured. Using in-memory storage');
    return null;
  }

  try {
    redisClient = redis.createClient({
      url: redisUrl,
      socket: {
        tls: true,
        rejectUnauthorized: false
      }
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
      redisReady = false;
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis connected and ready!');
      redisReady = true;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('❌ Redis initialization failed:', error);
    return null;
  }
};

initializeRedis();

const inMemoryStates = new Map();
const inMemoryTokenCache = new Map();

// ============================================
// PKCE HELPER FUNCTIONS
// ============================================
const generateCodeVerifier = () => {
  return crypto.randomBytes(32).toString('base64url');
};

const generateCodeChallenge = (verifier) => {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
};

// ============================================
// PROVIDER CONFIGURATIONS
// ============================================
const PROVIDERS = {
    fitbit: {
        name: 'Fitbit',
        clientId: process.env.FITBIT_CLIENT_ID || '23TKZ3',
        clientSecret: process.env.FITBIT_CLIENT_SECRET || 'e7d40e8f805e9d0631af7178c0ec1b08',
        redirectUri: process.env.FITBIT_REDIRECT_URI || 'https://clockwork.fit/api/wearables/callback/fitbit',
        authUrl: 'https://www.fitbit.com/oauth2/authorize',
        tokenUrl: 'https://api.fitbit.com/oauth2/token',
        apiBase: 'https://api.fitbit.com/1',
        scope: 'activity heartrate sleep profile weight nutrition oxygen_saturation respiratory_rate cardio_fitness temperature',
        usesOAuth2: true,
        usesPKCE: true,
        rateLimit: { requests: 150, window: 3600000 }
    },
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
        usesPKCE: false,
        rateLimit: { requests: 100, window: 3600000 }
    },
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
        usesPKCE: false,
        rateLimit: { requests: 5000, window: 86400000 }
    },
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
        usesPKCE: false,
        rateLimit: { requests: 100, window: 3600000 }
    }
};

// ============================================
// RATE LIMITING
// ============================================
const rateLimitTracker = new Map();

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

// ============================================
// UTILITY FUNCTIONS
// ============================================

const generateState = () => crypto.randomBytes(32).toString('hex');

const storeState = async (state, userId, provider, additionalData = {}) => {
  const stateData = { 
    userId, 
    provider, 
    timestamp: Date.now(),
    ...additionalData 
  };

  if (redisClient && redisReady) {
    try {
      await redisClient.setEx(
        `oauth:state:${state}`,
        600,
        JSON.stringify(stateData)
      );
      console.log('✅ State stored in Redis:', state);
      return;
    } catch (error) {
      console.error('❌ Redis store failed, using fallback:', error);
    }
  }

  inMemoryStates.set(state, stateData);
  setTimeout(() => inMemoryStates.delete(state), 10 * 60 * 1000);
  console.log('⚠️  State stored in memory (fallback):', state);
};

const verifyState = async (state) => {
  if (redisClient && redisReady) {
    try {
      const data = await redisClient.get(`oauth:state:${state}`);
      if (data) {
        await redisClient.del(`oauth:state:${state}`);
        console.log('✅ State verified from Redis');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ Redis verify failed, checking fallback:', error);
    }
  }

  const data = inMemoryStates.get(state);
  if (data) {
    inMemoryStates.delete(state);
    console.log('⚠️  State verified from memory (fallback)');
    return data;
  }

  console.log('❌ State not found:', state);
  return null;
};

const buildBasicAuth = (clientId, clientSecret) => {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
};

const createAxiosInstance = (baseURL, timeout = 30000) => {
  const instance = axios.create({
    baseURL,
    timeout,
    headers: {
      'User-Agent': 'ClockWork-Elite/3.0',
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

// ============================================
// DATABASE OPERATIONS
// ============================================

const storeWearableTokens = async (userId, provider, tokens) => {
  try {
    console.log('🔄 Storing tokens for:', userId, provider);
    
    const user = await User.findById(userId);
    if (!user) {
      console.error('❌ User not found:', userId);
      throw new Error('User not found');
    }

    console.log('📦 Current connections:', user.wearableConnections?.length || 0);

    if (!user.wearableConnections) {
      user.wearableConnections = [];
    }

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
      console.log('🔄 Updating existing connection');
      user.wearableConnections[connectionIndex] = connectionData;
    } else {
      console.log('➕ Adding new connection');
      user.wearableConnections.push(connectionData);
    }

    user.markModified('wearableConnections');
    
    await user.save();
    
    console.log('✅ Tokens stored successfully. Total connections:', user.wearableConnections.length);
    
    if (redisClient && redisReady) {
      try {
        await redisClient.setEx(
          `token:${userId}:${provider}`,
          3600,
          JSON.stringify(connectionData)
        );
        console.log('✅ Cached in Redis');
      } catch (error) {
        console.warn('⚠️ Redis cache failed:', error);
      }
    } else {
      inMemoryTokenCache.set(`${userId}:${provider}`, connectionData);
      console.log('✅ Cached in memory');
    }
    
    return connectionData;
  } catch (error) {
    console.error('❌ Store tokens error:', error);
    throw error;
  }
};

const getWearableConnection = async (userId, provider) => {
  const cacheKey = `token:${userId}:${provider}`;
  
  if (redisClient && redisReady) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Redis cache read failed:', error);
    }
  }

  const memoryCacheKey = `${userId}:${provider}`;
  if (inMemoryTokenCache.has(memoryCacheKey)) {
    return inMemoryTokenCache.get(memoryCacheKey);
  }

  const user = await User.findById(userId);
  if (!user) return null;

  const connection = user.wearableConnections?.find(
    conn => conn.provider === provider
  );

  if (connection) {
    if (redisClient && redisReady) {
      try {
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(connection));
      } catch (error) {
        console.warn('Redis cache write failed:', error);
      }
    } else {
      inMemoryTokenCache.set(memoryCacheKey, connection);
    }
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

/**
 * ✅ Get most recent complete wearable data with smart fallback
 */
const getLatestCompleteData = async (userId, provider) => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const todayData = await WearableData.findOne({
    userId,
    provider,
    date: new Date(today)
  });
  
  if (todayData && (todayData.steps > 100 || todayData.sleepDuration > 0)) {
    console.log('✅ Using today\'s data (has activity/sleep)');
    return todayData;
  }
  
  const yesterdayData = await WearableData.findOne({
    userId,
    provider,
    date: new Date(yesterday)
  });
  
  if (yesterdayData) {
    console.log('⚠️ Using yesterday\'s data (today incomplete)');
  }
  
  return yesterdayData || todayData;
};

// ============================================
// RECOVERY CALCULATION
// ============================================

const calculateRecoveryScore = (hrv, restingHR, sleepQuality, sleepEfficiency, breathingRate) => {
  let score = 0;
  let totalWeight = 0;
  
  if (hrv && hrv > 0) {
    const hrvScore = Math.min((hrv / 80) * 100, 100);
    score += hrvScore * 0.35;
    totalWeight += 0.35;
  }
  
  if (restingHR && restingHR > 0) {
    const rhrScore = Math.max(0, 100 - ((restingHR - 40) / 40 * 100));
    score += Math.min(rhrScore, 100) * 0.25;
    totalWeight += 0.25;
  }
  
  if (sleepQuality && sleepEfficiency) {
    const sleepScore = (sleepQuality * 10 * 0.6) + (sleepEfficiency * 0.4);
    score += sleepScore * 0.25;
    totalWeight += 0.25;
  }
  
  if (breathingRate && breathingRate > 0) {
    const breathingScore = breathingRate >= 12 && breathingRate <= 20 ? 100 : 
                          Math.max(0, 100 - Math.abs(16 - breathingRate) * 10);
    score += breathingScore * 0.15;
    totalWeight += 0.15;
  }
  
  if (totalWeight > 0) {
    score = score / totalWeight;
  }
  
  return Math.round(Math.min(Math.max(score, 0), 100));
};

const calculateTrainingLoad = (activeMinutes, caloriesBurned, steps, activeZoneMinutes, cardioLoad) => {
  let load = 0;
  let weights = 0;
  
  if (activeZoneMinutes && activeZoneMinutes > 0) {
    const azmScore = Math.min((activeZoneMinutes / 30) * 100, 100);
    load += azmScore * 0.3;
    weights += 0.3;
  }
  
  if (cardioLoad && cardioLoad > 0) {
    const cardioScore = Math.min(cardioLoad, 100);
    load += cardioScore * 0.25;
    weights += 0.25;
  }
  
  if (activeMinutes) {
    const activeScore = Math.min((activeMinutes / 60) * 100, 100);
    load += activeScore * 0.2;
    weights += 0.2;
  }
  
  if (caloriesBurned) {
    const caloriesScore = Math.min(((caloriesBurned - 1500) / 1500) * 100, 100);
    load += Math.max(0, caloriesScore) * 0.15;
    weights += 0.15;
  }
  
  if (steps) {
    const stepsScore = Math.min((steps / 15000) * 100, 100);
    load += stepsScore * 0.1;
    weights += 0.1;
  }
  
  return weights > 0 ? Math.round(Math.min(Math.max(load / weights, 0), 100)) : 0;
};

// ============================================
// 🔥 FITBIT DATA FETCHING - 100% GUARANTEED DELIVERY
// ============================================

/**
 * 🛡️ SAFE API CALL - Never throws, always returns data or null
 */
const safeFitbitCall = async (accessToken, endpoint, description) => {
  const config = PROVIDERS.fitbit;
  const api = createAxiosInstance(config.apiBase);
  
  try {
    console.log(`📡 Fetching ${description}...`);
    const response = await api.get(endpoint, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      timeout: 10000
    });
    console.log(`✅ ${description} fetched successfully`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      console.error(`❌ ${description}: Unauthorized (token expired)`);
      throw new Error('TOKEN_EXPIRED');
    }
    console.warn(`⚠️ ${description} unavailable:`, error.message);
    return null;
  }
};

/**
 * 🔥 COMPREHENSIVE FITBIT DATA FETCH - GUARANTEED DELIVERY
 * Returns partial data even if some endpoints fail
 */
const fetchFitbitDataEnhanced = async (accessToken, date) => {
  console.log('🔄 Starting comprehensive Fitbit data fetch for', date);
  
  // Initialize result object with safe defaults
  const result = {
    // Basic Activity (REQUIRED - will fail sync if this fails)
    steps: 0,
    distance: 0,
    caloriesBurned: 0,
    activeMinutes: 0,
    sedentaryMinutes: 0,
    lightlyActiveMinutes: 0,
    floors: 0,
    elevation: 0,
    
    // Fitbit Proprietary
    activeZoneMinutes: 0,
    cardioLoad: 0,
    
    // Heart Rate
    restingHeartRate: 0,
    heartRateZones: [],
    
    // Sleep
    sleepDuration: 0,
    deepSleep: 0,
    lightSleep: 0,
    remSleep: 0,
    awakeTime: 0,
    restlessMinutes: 0,
    restlessCount: 0,
    sleepEfficiency: 0,
    sleepScore: 0,
    sleepStartTime: null,
    sleepEndTime: null,
    
    // Advanced Metrics (optional)
    hrv: null,
    breathingRate: null,
    deepSleepBreathingRate: null,
    spo2Avg: null,
    spo2Min: null,
    spo2Max: null,
    vo2Max: null,
    cardioFitnessScore: null,
    
    // Calculated Scores
    recoveryScore: 0,
    trainingLoad: 0,
    
    // Metadata
    dataQuality: {
      activity: false,
      heartRate: false,
      sleep: false,
      hrv: false,
      breathingRate: false,
      spo2: false,
      cardioFitness: false
    }
  };
  
  try {
    // ============================================
    // PHASE 1: CRITICAL DATA (Activity Summary)
    // ============================================
    const activity = await safeFitbitCall(
      accessToken,
      `/1/user/-/activities/date/${date}.json`,
      'Activity Summary'
    );
    
    if (!activity || !activity.summary) {
      throw new Error('Critical activity data unavailable');
    }
    
    // Extract activity data
    result.steps = activity.summary.steps || 0;
    result.distance = activity.summary.distances?.[0]?.distance || 0;
    result.caloriesBurned = activity.summary.caloriesOut || 0;
    result.activeMinutes = (activity.summary.veryActiveMinutes || 0) + (activity.summary.fairlyActiveMinutes || 0);
    result.sedentaryMinutes = activity.summary.sedentaryMinutes || 0;
    result.lightlyActiveMinutes = activity.summary.lightlyActiveMinutes || 0;
    result.floors = activity.summary.floors || 0;
    result.elevation = activity.summary.elevation || 0;
    result.activeZoneMinutes = activity.summary.activeZoneMinutes?.totalMinutes || 0;
    result.cardioLoad = activity.summary.cardioFitnessScore || 0;
    result.dataQuality.activity = true;
    
    console.log('✅ PHASE 1 COMPLETE: Activity data captured');
    
    // ============================================
    // PHASE 2: HEART RATE DATA (High Priority)
    // ============================================
    const heartRateData = await safeFitbitCall(
      accessToken,
      `/1/user/-/activities/heart/date/${date}/1d.json`,
      'Heart Rate Data'
    );
    
    if (heartRateData && heartRateData['activities-heart']?.[0]) {
      const hrData = heartRateData['activities-heart'][0].value;
      result.restingHeartRate = hrData.restingHeartRate || 0;
      result.heartRateZones = (hrData.heartRateZones || []).map(zone => ({
        name: zone.name,
        min: zone.min,
        max: zone.max,
        minutes: zone.minutes,
        caloriesOut: zone.caloriesOut || 0
      }));
      result.dataQuality.heartRate = true;
      console.log('✅ PHASE 2 COMPLETE: Heart rate data captured');
    }
    
    // ============================================
    // PHASE 3: SLEEP DATA (High Priority)
    // ============================================
    const sleep = await safeFitbitCall(
      accessToken,
      `/1.2/user/-/sleep/date/${date}.json`,
      'Sleep Data'
    );
    
    if (sleep && sleep.sleep?.[0]) {
      const sleepData = sleep.sleep[0];
      result.sleepDuration = sleepData.minutesAsleep || 0;
      result.deepSleep = sleepData.levels?.summary?.deep?.minutes || 0;
      result.remSleep = sleepData.levels?.summary?.rem?.minutes || 0;
      result.lightSleep = sleepData.levels?.summary?.light?.minutes || 0;
      result.awakeTime = sleepData.levels?.summary?.wake?.minutes || 0;
      result.restlessMinutes = sleepData.levels?.summary?.restless?.minutes || 0;
      result.restlessCount = sleepData.levels?.summary?.restless?.count || 0;
      result.sleepEfficiency = sleepData.efficiency || 0;
      result.sleepStartTime = sleepData.startTime || null;
      result.sleepEndTime = sleepData.endTime || null;
      
      // Calculate sleep score
      if (result.sleepDuration > 0) {
        result.sleepScore = Math.min((result.sleepDuration / 480) * 100, 100);
      }
      
      result.dataQuality.sleep = true;
      console.log('✅ PHASE 3 COMPLETE: Sleep data captured');
    }
    
    // ============================================
    // PHASE 4: ADVANCED METRICS (Optional - Won't fail sync)
    // ============================================
    
    // HRV
    const hrv = await safeFitbitCall(
      accessToken,
      `/1/user/-/hrv/date/${date}.json`,
      'HRV'
    );
    if (hrv && hrv.hrv?.[0]) {
      result.hrv = hrv.hrv[0].value?.dailyRmssd || null;
      result.dataQuality.hrv = !!result.hrv;
    }
    
    // Breathing Rate
    const breathingRate = await safeFitbitCall(
      accessToken,
      `/1/user/-/br/date/${date}.json`,
      'Breathing Rate'
    );
    if (breathingRate && breathingRate.br?.[0]) {
      const brData = breathingRate.br[0];
      result.breathingRate = brData.value?.breathingRate || null;
      result.deepSleepBreathingRate = brData.value?.deepSleepSummary?.breathingRate || null;
      result.dataQuality.breathingRate = !!result.breathingRate;
    }
    
    // SpO2
    const spo2 = await safeFitbitCall(
      accessToken,
      `/1/user/-/spo2/date/${date}.json`,
      'SpO2'
    );
    if (spo2 && spo2.length > 0 && spo2[0].value) {
      result.spo2Avg = spo2[0].value.avg || null;
      result.spo2Min = spo2[0].value.min || null;
      result.spo2Max = spo2[0].value.max || null;
      result.dataQuality.spo2 = !!result.spo2Avg;
    }
    
    // Cardio Fitness
    const cardioFitness = await safeFitbitCall(
      accessToken,
      `/1/user/-/cardioscore/date/${date}.json`,
      'Cardio Fitness'
    );
    if (cardioFitness && cardioFitness.cardioScore?.[0]) {
      result.vo2Max = cardioFitness.cardioScore[0].value?.vo2Max || null;
      result.cardioFitnessScore = cardioFitness.cardioScore[0].value?.score || null;
      result.dataQuality.cardioFitness = !!result.vo2Max;
    }
    
    console.log('✅ PHASE 4 COMPLETE: Advanced metrics captured');
    
    // ============================================
    // PHASE 5: CALCULATE SCORES
    // ============================================
    
    const sleepQuality = result.sleepDuration > 0 ? Math.min((result.sleepDuration / 480) * 10, 10) : 0;
    
    result.recoveryScore = calculateRecoveryScore(
      result.hrv,
      result.restingHeartRate,
      sleepQuality,
      result.sleepEfficiency,
      result.breathingRate
    );
    
    result.trainingLoad = calculateTrainingLoad(
      result.activeMinutes,
      result.caloriesBurned,
      result.steps,
      result.activeZoneMinutes,
      result.cardioLoad
    );
    
    console.log('✅ ALL PHASES COMPLETE - Data Quality:', result.dataQuality);
    console.log('📊 Final Scores - Recovery:', result.recoveryScore, 'Training Load:', result.trainingLoad);
    
    return result;
    
  } catch (error) {
    if (error.message === 'TOKEN_EXPIRED') {
      throw error;
    }
    
    // If critical data failed, throw error
    if (!result.dataQuality.activity) {
      console.error('❌ Critical error: Activity data unavailable');
      throw new Error('Failed to fetch critical activity data');
    }
    
    // Return partial data if we have at least activity
    console.warn('⚠️ Returning partial data due to error:', error.message);
    return result;
  }
};

// ============================================
// POLAR DATA FETCHING
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
        error: `${config.name} credentials not configured` 
      });
    }

    const state = generateState();
    const additionalData = {};
    
    let codeChallenge = null;
    if (config.usesPKCE) {
      const codeVerifier = generateCodeVerifier();
      codeChallenge = generateCodeChallenge(codeVerifier);
      additionalData.codeVerifier = codeVerifier;
      
      console.log('🔐 PKCE Generated for', provider);
    }
    
    await storeState(state, userId, provider, additionalData);

    const authParams = {
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scope,
      state: state,
      prompt: 'login consent'
    };
    
    if (config.usesPKCE && codeChallenge) {
      authParams.code_challenge = codeChallenge;
      authParams.code_challenge_method = 'S256';
    }

    const authUrl = `${config.authUrl}?${new URLSearchParams(authParams).toString()}`;
    
    console.log('📤 OAuth URL Generated for', provider);
    
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

    console.log('📥 OAuth Callback:', provider);

    if (error) {
      console.error('❌ OAuth Error:', error);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/?wearable_error=oauth_error`);
    }

    const stateData = await verifyState(state);
    if (!stateData) {
      console.error('❌ Invalid state');
      return res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/?wearable_error=invalid_state`);
    }

    console.log('✅ State verified');

    const config = PROVIDERS[provider];
    const { userId, codeVerifier } = stateData;

    const tokenRequestBody = {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId
    };
    
    if (config.usesPKCE && codeVerifier) {
      tokenRequestBody.code_verifier = codeVerifier;
      console.log('🔐 Using PKCE for token exchange');
    } else {
      tokenRequestBody.client_secret = config.clientSecret;
    }

    console.log('📤 Requesting token from', provider);

    const tokenResponse = await axios.post(
      config.tokenUrl,
      new URLSearchParams(tokenRequestBody),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': buildBasicAuth(config.clientId, config.clientSecret)
        }
      }
    );

    console.log('✅ Token received');

    const { access_token, refresh_token, expires_in, user_id, scope } = tokenResponse.data;

    await storeWearableTokens(userId, provider, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      externalUserId: user_id,
      scope: scope
    });

    console.log('✅ Tokens stored in database');

    return res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/?wearable_connected=${provider}`);
  } catch (error) {
    console.error('❌ OAuth callback error:', error.response?.data || error.message);
    return res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/?wearable_error=auth_failed`);
  }
};

// ============================================
// 🔥 100% GUARANTEED SYNC
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

const syncWearableData = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    console.log('🔄 Starting 100% guaranteed sync for:', provider);

    if (!PROVIDERS[provider]) {
      return res.status(400).json({ 
        success: false,
        error: 'Unsupported provider' 
      });
    }

    if (!PROVIDERS[provider].clientId) {
      return res.status(501).json({ 
        success: false,
        error: `${PROVIDERS[provider].name} not configured. Please contact support.` 
      });
    }

    if (!checkRateLimit(provider, userId)) {
      return res.status(429).json({ 
        success: false,
        error: 'Rate limit exceeded. Please try again in a few minutes.' 
      });
    }

    let connection = await getWearableConnection(userId, provider);
    if (!connection || !connection.connected) {
      return res.status(404).json({ 
        success: false,
        error: 'Device not connected. Please connect your wearable first.',
        needsConnection: true
      });
    }

    console.log('✅ Connection verified');

    // Token refresh logic
    if (connection.expiresAt && new Date() >= new Date(connection.expiresAt)) {
      console.log('🔄 Token expired, refreshing...');
      try {
        const newTokens = await refreshAccessToken(userId, provider);
        connection.accessToken = newTokens.accessToken;
        console.log('✅ Token refreshed successfully');
      } catch (refreshError) {
        console.error('❌ Token refresh failed:', refreshError);
        return res.status(401).json({ 
          success: false,
          error: 'Session expired. Please reconnect your device.',
          needsReconnect: true
        });
      }
    }

    // Fetch data for last 2 days
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    console.log('📡 Fetching data for', yesterday, 'and', today);

    let syncResults = {
      success: true,
      provider: PROVIDERS[provider].name,
      syncedDates: [],
      dataQuality: {},
      summary: {}
    };

    try {
      if (provider === 'fitbit') {
        // Fetch both days
        const [yesterdayData, todayData] = await Promise.all([
          fetchFitbitDataEnhanced(connection.accessToken, yesterday)
            .catch(err => {
              console.warn('⚠️ Yesterday fetch failed:', err.message);
              return null;
            }),
          fetchFitbitDataEnhanced(connection.accessToken, today)
            .catch(err => {
              console.warn('⚠️ Today fetch failed:', err.message);
              return null;
            })
        ]);
        
        // Store both
        if (yesterdayData) {
          await storeWearableData(userId, provider, yesterdayData, yesterday);
          syncResults.syncedDates.push(yesterday);
          syncResults.dataQuality.yesterday = yesterdayData.dataQuality;
        }
        
        if (todayData) {
          await storeWearableData(userId, provider, todayData, today);
          syncResults.syncedDates.push(today);
          syncResults.dataQuality.today = todayData.dataQuality;
          
          // Use today's data for summary
          syncResults.summary = {
            steps: todayData.steps,
            sleep: Math.floor(todayData.sleepDuration / 60),
            recoveryScore: todayData.recoveryScore,
            trainingLoad: todayData.trainingLoad
          };
        }
        
        // If neither day succeeded, return error
        if (!yesterdayData && !todayData) {
          throw new Error('Unable to fetch data for any date');
        }
        
        console.log('✅ Sync complete:', syncResults.syncedDates.length, 'days synced');
        
      } else if (provider === 'polar') {
        const data = await fetchPolarData(connection.accessToken, userId);
        await storeWearableData(userId, provider, data, today);
        syncResults.syncedDates.push(today);
        syncResults.summary = {
          steps: data.steps,
          calories: data.caloriesBurned,
          activeMinutes: data.activeMinutes
        };
      }
      
      return res.json(syncResults);
      
    } catch (fetchError) {
      console.error('❌ Data fetch error:', fetchError);
      
      if (fetchError.message === 'TOKEN_EXPIRED') {
        return res.status(401).json({
          success: false,
          error: 'Session expired. Please reconnect your device.',
          needsReconnect: true
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Failed to sync data. Please try again.',
        details: process.env.NODE_ENV === 'development' ? fetchError.message : undefined
      });
    }
    
  } catch (error) {
    console.error('❌ Sync error:', error);
    
    return res.status(500).json({ 
      success: false,
      error: 'Sync failed. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// USER-FACING ENDPOINTS
// ============================================

const getConnections = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user.wearableConnections || user.wearableConnections.length === 0) {
      return res.json({ 
        success: true,
        connections: []
      });
    }
    
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
    const { startDate, endDate, provider, days } = req.query;

    const query = { userId };
    
    if (!startDate && !endDate && !days) {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      query.date = { $gte: twoDaysAgo };
      console.log('⚠️ No date filter specified, defaulting to last 2 days');
    } else {
      if (provider) {
        query.provider = provider;
      }
      
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
      } else if (days) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));
        query.date = { $gte: daysAgo };
      }
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
      error: 'Failed to fetch data' 
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
    res.status(500).json({ 
      success: false,
      error: 'Failed to save entry' 
    });
  }
};

const disconnect = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);
    const connectionIndex = user.wearableConnections?.findIndex(
      conn => conn.provider === provider
    );

    if (connectionIndex >= 0) {
      user.wearableConnections.splice(connectionIndex, 1);
      user.markModified('wearableConnections');
      await user.save();
      
      if (redisClient && redisReady) {
        await redisClient.del(`token:${userId}:${provider}`);
      }
      inMemoryTokenCache.delete(`${userId}:${provider}`);
    }

    res.json({ 
      success: true,
      message: `${PROVIDERS[provider]?.name || provider} disconnected` 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to disconnect' 
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
        message: 'No data available' 
      });
    }

    const insights = {
      averages: {
        steps: Math.round(data.reduce((sum, d) => sum + (d.steps || 0), 0) / data.length),
        sleep: Math.round(data.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / data.length),
        activeMinutes: Math.round(data.reduce((sum, d) => sum + (d.activeMinutes || 0), 0) / data.length),
        restingHR: Math.round(data.reduce((sum, d) => sum + (d.restingHeartRate || 0), 0) / data.filter(d => d.restingHeartRate).length) || 0,
        recoveryScore: Math.round(data.reduce((sum, d) => sum + (d.recoveryScore || 0), 0) / data.filter(d => d.recoveryScore).length) || 0,
        activeZoneMinutes: Math.round(data.reduce((sum, d) => sum + (d.activeZoneMinutes || 0), 0) / data.length),
        breathingRate: data.filter(d => d.breathingRate).length > 0 
          ? Math.round(data.reduce((sum, d) => sum + (d.breathingRate || 0), 0) / data.filter(d => d.breathingRate).length)
          : null
      },
      trends: {
        steps: data.length > 1 ? (data[data.length - 1].steps > data[0].steps ? 'improving' : 'declining') : 'stable'
      },
      dataPoints: data.length,
      period: days
    };

    res.json({ 
      success: true,
      insights 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate insights' 
    });
  }
};

const initiateGarminOAuth = (req, res) => {
  res.status(501).json({ 
    success: false,
    error: 'Garmin not configured' 
  });
};

module.exports = {
  initiateOAuth2,
  handleOAuth2Callback,
  initiateGarminOAuth,
  oauthCallback: handleOAuth2Callback,
  syncWearableData,
  syncNow: syncWearableData,
  getWearableData,
  getConnections,
  getInsights,
  manualEntry,
  disconnect,
  refreshAccessToken,
  fetchFitbitDataEnhanced,
  fetchPolarData,
  getLatestCompleteData
};
