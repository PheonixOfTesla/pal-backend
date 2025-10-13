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
 * ✅ ELITE: Get most recent complete wearable data with smart fallback
 */
const getLatestCompleteData = async (userId, provider) => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  // Try to get today's data
  const todayData = await WearableData.findOne({
    userId,
    provider,
    date: new Date(today)
  });
  
  // If today has meaningful data (steps > 100 OR sleep > 0), use it
  if (todayData && (todayData.steps > 100 || todayData.sleepDuration > 0)) {
    console.log('✅ Using today\'s data (has activity/sleep)');
    return todayData;
  }
  
  // Otherwise, fall back to yesterday
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
// IMG ACADEMY: ELITE RECOVERY ALGORITHMS
// ============================================

const calculateRecoveryScore = (hrv, restingHR, sleepQuality, sleepEfficiency, breathingRate) => {
  let score = 0;
  let totalWeight = 0;
  
  // HRV (35% weight)
  if (hrv && hrv > 0) {
    const hrvScore = Math.min((hrv / 80) * 100, 100);
    score += hrvScore * 0.35;
    totalWeight += 0.35;
  }
  
  // Resting HR (25% weight)
  if (restingHR && restingHR > 0) {
    const rhrScore = Math.max(0, 100 - ((restingHR - 40) / 40 * 100));
    score += Math.min(rhrScore, 100) * 0.25;
    totalWeight += 0.25;
  }
  
  // Sleep Quality (25% weight)
  if (sleepQuality && sleepEfficiency) {
    const sleepScore = (sleepQuality * 10 * 0.6) + (sleepEfficiency * 0.4);
    score += sleepScore * 0.25;
    totalWeight += 0.25;
  }
  
  // Breathing Rate (15% weight) - NEW
  if (breathingRate && breathingRate > 0) {
    // Ideal breathing rate during sleep: 12-20 breaths/min
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
  
  // Active Zone Minutes (30% weight) - Fitbit's proprietary metric
  if (activeZoneMinutes && activeZoneMinutes > 0) {
    const azmScore = Math.min((activeZoneMinutes / 30) * 100, 100);
    load += azmScore * 0.3;
    weights += 0.3;
  }
  
  // Cardio Load (25% weight) - NEW from Fitbit
  if (cardioLoad && cardioLoad > 0) {
    // Cardio load typically ranges 0-100+
    const cardioScore = Math.min(cardioLoad, 100);
    load += cardioScore * 0.25;
    weights += 0.25;
  }
  
  // Active Minutes (20% weight)
  if (activeMinutes) {
    const activeScore = Math.min((activeMinutes / 60) * 100, 100);
    load += activeScore * 0.2;
    weights += 0.2;
  }
  
  // Calories (15% weight)
  if (caloriesBurned) {
    const caloriesScore = Math.min(((caloriesBurned - 1500) / 1500) * 100, 100);
    load += Math.max(0, caloriesScore) * 0.15;
    weights += 0.15;
  }
  
  // Steps (10% weight)
  if (steps) {
    const stepsScore = Math.min((steps / 15000) * 100, 100);
    load += stepsScore * 0.1;
    weights += 0.1;
  }
  
  return weights > 0 ? Math.round(Math.min(Math.max(load / weights, 0), 100)) : 0;
};

// ============================================
// 🔥 ELITE FITBIT DATA FETCHING - 100% CAPTURE
// ============================================

/**
 * Fetch Breathing Rate (Respiratory Rate during sleep)
 */
const fetchFitbitBreathingRate = async (accessToken, date) => {
  const config = PROVIDERS.fitbit;
  const api = createAxiosInstance(config.apiBase);
  
  try {
    const response = await api.get(`/1/user/-/br/date/${date}.json`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    // Fitbit returns breathing rate data
    const brData = response.data.br;
    if (brData && brData.length > 0) {
      // Get the most recent breathing rate value
      const latestBR = brData[brData.length - 1];
      return {
        breathingRate: latestBR.value?.breathingRate || null,
        deepSleepSummary: latestBR.value?.deepSleepSummary || null
      };
    }
    return null;
  } catch (error) {
    console.warn('Breathing rate fetch skipped:', error.message);
    return null;
  }
};

/**
 * Fetch SpO2 (Blood Oxygen) - if device supports
 */
const fetchFitbitSpO2 = async (accessToken, date) => {
  const config = PROVIDERS.fitbit;
  const api = createAxiosInstance(config.apiBase);
  
  try {
    const response = await api.get(`/1/user/-/spo2/date/${date}.json`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    // Fitbit SpO2 data structure
    const spo2Data = response.data;
    if (spo2Data && spo2Data.length > 0) {
      const latestSpO2 = spo2Data[0];
      return {
        avg: latestSpO2.value?.avg || null,
        min: latestSpO2.value?.min || null,
        max: latestSpO2.value?.max || null
      };
    }
    return null;
  } catch (error) {
    console.warn('SpO2 fetch skipped (may not be supported):', error.message);
    return null;
  }
};

/**
 * Fetch HRV (Heart Rate Variability)
 */
const fetchFitbitHRV = async (accessToken, date) => {
  const config = PROVIDERS.fitbit;
  const api = createAxiosInstance(config.apiBase);
  
  try {
    const response = await api.get(`/1/user/-/hrv/date/${date}.json`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    return response.data.hrv?.[0]?.value?.dailyRmssd || null;
  } catch (error) {
    console.warn('HRV fetch skipped:', error.message);
    return null;
  }
};

/**
 * Fetch detailed sleep with ALL stages
 */
const fetchFitbitSleepDetailed = async (accessToken, date) => {
  const config = PROVIDERS.fitbit;
  const api = createAxiosInstance(config.apiBase);
  
  try {
    const response = await api.get(`/1.2/user/-/sleep/date/${date}.json`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const sleep = response.data.sleep?.[0];
    if (!sleep) return null;
    
    return {
      totalMinutes: sleep.timeInBed || 0,
      deepMinutes: sleep.levels?.summary?.deep?.minutes || 0,
      remMinutes: sleep.levels?.summary?.rem?.minutes || 0,
      lightMinutes: sleep.levels?.summary?.light?.minutes || 0,
      awakeMinutes: sleep.levels?.summary?.wake?.minutes || 0,
      restlessCount: sleep.levels?.summary?.restless?.count || 0,
      restlessMinutes: sleep.levels?.summary?.restless?.minutes || 0,
      efficiency: sleep.efficiency || 0,
      startTime: sleep.startTime,
      endTime: sleep.endTime,
      minutesAsleep: sleep.minutesAsleep || 0,
      minutesAwake: sleep.minutesAwake || 0
    };
  } catch (error) {
    console.warn('Sleep detailed fetch skipped:', error.message);
    return null;
  }
};

/**
 * Fetch heart rate zones with full details
 */
const fetchFitbitHeartRateZones = async (accessToken, date) => {
  const config = PROVIDERS.fitbit;
  const api = createAxiosInstance(config.apiBase);
  
  try {
    const response = await api.get(`/1/user/-/activities/heart/date/${date}/1d.json`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const heartRateZones = response.data['activities-heart']?.[0]?.value?.heartRateZones || [];
    const restingHR = response.data['activities-heart']?.[0]?.value?.restingHeartRate || null;
    
    return {
      zones: heartRateZones.map(zone => ({
        name: zone.name,
        min: zone.min,
        max: zone.max,
        minutes: zone.minutes,
        caloriesOut: zone.caloriesOut || 0
      })),
      restingHeartRate: restingHR
    };
  } catch (error) {
    console.warn('Heart rate zones fetch skipped:', error.message);
    return { zones: [], restingHeartRate: null };
  }
};

/**
 * Fetch Cardio Fitness Score (VO2 Max estimate)
 */
const fetchFitbitCardioFitness = async (accessToken, date) => {
  const config = PROVIDERS.fitbit;
  const api = createAxiosInstance(config.apiBase);
  
  try {
    const response = await api.get(`/1/user/-/cardioscore/date/${date}.json`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const cardioScore = response.data.cardioScore?.[0];
    if (cardioScore) {
      return {
        vo2Max: cardioScore.value?.vo2Max || null,
        cardioFitnessScore: cardioScore.value?.score || null
      };
    }
    return null;
  } catch (error) {
    console.warn('Cardio fitness fetch skipped:', error.message);
    return null;
  }
};

/**
 * 🔥 ELITE FITBIT DATA FETCHING - COMPREHENSIVE
 * Captures 100% of available Fitbit data
 */
const fetchFitbitDataEnhanced = async (accessToken, date) => {
  const config = PROVIDERS.fitbit;
  const api = createAxiosInstance(config.apiBase);
  
  const headers = { 'Authorization': `Bearer ${accessToken}` };

  try {
    console.log('🔄 Fetching ELITE enhanced Fitbit data for', date);
    
    // Parallel fetch ALL available data
    const [
      activity, 
      heartRateData, 
      sleep, 
      hrv, 
      breathingRate, 
      spo2,
      cardioFitness
    ] = await Promise.all([
      api.get(`/1/user/-/activities/date/${date}.json`, { headers }),
      fetchFitbitHeartRateZones(accessToken, date),
      fetchFitbitSleepDetailed(accessToken, date),
      fetchFitbitHRV(accessToken, date),
      fetchFitbitBreathingRate(accessToken, date),
      fetchFitbitSpO2(accessToken, date),
      fetchFitbitCardioFitness(accessToken, date)
    ]);

    // Extract activity metrics
    const steps = activity.data.summary?.steps || 0;
    const distance = activity.data.summary?.distances?.[0]?.distance || 0;
    const caloriesBurned = activity.data.summary?.caloriesOut || 0;
    const activeMinutes = (activity.data.summary?.veryActiveMinutes || 0) + 
                         (activity.data.summary?.fairlyActiveMinutes || 0);
    const sedentaryMinutes = activity.data.summary?.sedentaryMinutes || 0;
    const lightlyActiveMinutes = activity.data.summary?.lightlyActiveMinutes || 0;
    const floors = activity.data.summary?.floors || 0;
    const elevation = activity.data.summary?.elevation || 0;
    
    // Active Zone Minutes (Fitbit's proprietary metric)
    const activeZoneMinutes = activity.data.summary?.activeZoneMinutes?.totalMinutes || 0;
    
    // Extract heart rate data
    const restingHR = heartRateData.restingHeartRate;
    
    // Extract sleep data
    const sleepMinutes = sleep?.minutesAsleep || 0;
    const sleepEfficiency = sleep?.efficiency || 0;
    
    // Calculate sleep quality score
    const sleepQuality = sleepMinutes > 0 ? Math.min((sleepMinutes / 480) * 10, 10) : 0;
    
    // Calculate recovery score with breathing rate
    const recoveryScore = calculateRecoveryScore(
      hrv, 
      restingHR, 
      sleepQuality, 
      sleepEfficiency,
      breathingRate?.breathingRate
    );
    
    // Calculate training load with cardio load
    const cardioLoad = activity.data.summary?.cardioFitnessScore || 0;
    const trainingLoad = calculateTrainingLoad(
      activeMinutes, 
      caloriesBurned, 
      steps,
      activeZoneMinutes,
      cardioLoad
    );

    console.log('✅ ELITE enhanced data fetched:', {
      steps,
      recoveryScore,
      trainingLoad,
      hrv: hrv || 'N/A',
      breathingRate: breathingRate?.breathingRate || 'N/A',
      spo2: spo2?.avg || 'N/A',
      activeZoneMinutes,
      cardioLoad
    });

    // Return comprehensive data structure
    return {
      // Basic Activity
      steps,
      distance,
      caloriesBurned,
      activeMinutes,
      sedentaryMinutes,
      lightlyActiveMinutes,
      floors,
      elevation,
      
      // Fitbit Proprietary Metrics
      activeZoneMinutes,
      cardioLoad,
      
      // Heart Rate
      restingHeartRate: restingHR,
      heartRateZones: heartRateData.zones,
      
      // Sleep - Complete breakdown
      sleepDuration: sleepMinutes,
      deepSleep: sleep?.deepMinutes || 0,
      lightSleep: sleep?.lightMinutes || 0,
      remSleep: sleep?.remMinutes || 0,
      awakeTime: sleep?.awakeMinutes || 0,
      restlessMinutes: sleep?.restlessMinutes || 0,
      restlessCount: sleep?.restlessCount || 0,
      sleepEfficiency: sleepEfficiency,
      sleepScore: Math.round(sleepQuality * 10),
      sleepStartTime: sleep?.startTime || null,
      sleepEndTime: sleep?.endTime || null,
      
      // Advanced Metrics
      hrv: hrv,
      breathingRate: breathingRate?.breathingRate || null,
      deepSleepBreathingRate: breathingRate?.deepSleepSummary?.breathingRate || null,
      spo2Avg: spo2?.avg || null,
      spo2Min: spo2?.min || null,
      spo2Max: spo2?.max || null,
      vo2Max: cardioFitness?.vo2Max || null,
      cardioFitnessScore: cardioFitness?.cardioFitnessScore || null,
      
      // Calculated Scores
      recoveryScore: recoveryScore,
      trainingLoad: trainingLoad,
      
      // Raw data for reference
      rawData: {
        activity: activity.data,
        heartRateData: heartRateData,
        sleep: sleep,
        hrv: hrv,
        breathingRate: breathingRate,
        spo2: spo2,
        cardioFitness: cardioFitness
      }
    };
  } catch (error) {
    console.error('❌ Fitbit ELITE enhanced fetch error:', error.response?.data || error.message);
    throw error;
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
// DATA SYNCING - ELITE 2-DAY FETCH
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

    console.log('🔄 ELITE Sync requested for:', provider, 'by user:', userId);

    if (!PROVIDERS[provider]) {
      return res.status(400).json({ 
        success: false,
        error: 'Unsupported provider' 
      });
    }

    if (!PROVIDERS[provider].clientId) {
      return res.status(501).json({ 
        success: false,
        error: `${PROVIDERS[provider].name} not configured` 
      });
    }

    if (!checkRateLimit(provider, userId)) {
      return res.status(429).json({ 
        success: false,
        error: 'Rate limit exceeded' 
      });
    }

    let connection = await getWearableConnection(userId, provider);
    if (!connection || !connection.connected) {
      return res.status(404).json({ 
        success: false,
        error: 'Wearable not connected' 
      });
    }

    console.log('✅ Connection found');

    if (connection.expiresAt && new Date() >= new Date(connection.expiresAt)) {
      console.log('🔄 Token expired, refreshing...');
      try {
        const newTokens = await refreshAccessToken(userId, provider);
        connection.accessToken = newTokens.accessToken;
      } catch (refreshError) {
        return res.status(401).json({ 
          success: false,
          error: 'Token expired. Please reconnect.' 
        });
      }
    }

    // 🔥 ELITE: Fetch TODAY and YESTERDAY to ensure complete data
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    console.log('📡 Fetching ELITE data from', provider, 'for', yesterday, 'and', today);

    let data;

    switch (provider) {
      case 'fitbit':
        // Fetch both days with ELITE comprehensive data
        const [yesterdayData, todayData] = await Promise.all([
          fetchFitbitDataEnhanced(connection.accessToken, yesterday),
          fetchFitbitDataEnhanced(connection.accessToken, today)
        ]);
        
        // Store both
        await Promise.all([
          storeWearableData(userId, provider, yesterdayData, yesterday),
          storeWearableData(userId, provider, todayData, today)
        ]);
        
        console.log('✅ ELITE data stored for both', yesterday, 'and', today);
        
        // Return today's data
        data = todayData;
        break;
        
      case 'polar':
        data = await fetchPolarData(connection.accessToken, userId);
        await storeWearableData(userId, provider, data, today);
        break;
        
      default:
        return res.status(501).json({ 
          success: false,
          error: `${PROVIDERS[provider].name} coming soon` 
        });
    }

    console.log('✅ ELITE Data fetched and stored');

    res.json({ 
      success: true, 
      data,
      provider: PROVIDERS[provider].name,
      syncedAt: new Date(),
      daysStored: provider === 'fitbit' ? 2 : 1
    });
  } catch (error) {
    console.error('❌ ELITE Sync error:', error);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication failed' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to sync',
      details: error.message
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
    
    // Smart default: get last 2 days for better UX
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
