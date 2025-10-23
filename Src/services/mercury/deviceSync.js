// Src/services/mercury/deviceSync.js
const WearableDevice = require('../models/WearableDevice');
const WearableData = require('../models/WearableData');
const axios = require('axios');
const crypto = require('crypto');

// OAuth configurations for different providers
const PROVIDER_CONFIGS = {
  fitbit: {
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    apiUrl: 'https://api.fitbit.com/1/user/-',
    clientId: process.env.FITBIT_CLIENT_ID,
    clientSecret: process.env.FITBIT_CLIENT_SECRET,
    redirectUri: process.env.FITBIT_REDIRECT_URI,
    scope: 'activity heartrate sleep profile weight'
  },
  garmin: {
    authUrl: 'https://connect.garmin.com/oauthConfirm',
    tokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
    apiUrl: 'https://apis.garmin.com/wellness-api/rest',
    clientId: process.env.GARMIN_CLIENT_ID,
    clientSecret: process.env.GARMIN_CLIENT_SECRET,
    redirectUri: process.env.GARMIN_REDIRECT_URI
  },
  oura: {
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    apiUrl: 'https://api.ouraring.com/v2',
    clientId: process.env.OURA_CLIENT_ID,
    clientSecret: process.env.OURA_CLIENT_SECRET,
    redirectUri: process.env.OURA_REDIRECT_URI,
    scope: 'personal daily'
  },
  whoop: {
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    apiUrl: 'https://api.prod.whoop.com/developer/v1',
    clientId: process.env.WHOOP_CLIENT_ID,
    clientSecret: process.env.WHOOP_CLIENT_SECRET,
    redirectUri: process.env.WHOOP_REDIRECT_URI,
    scope: 'read:recovery read:sleep read:workout'
  },
  polar: {
    authUrl: 'https://flow.polar.com/oauth2/authorization',
    tokenUrl: 'https://polarremote.com/v2/oauth2/token',
    apiUrl: 'https://www.polaraccesslink.com/v3',
    clientId: process.env.POLAR_CLIENT_ID,
    clientSecret: process.env.POLAR_CLIENT_SECRET,
    redirectUri: process.env.POLAR_REDIRECT_URI
  },
  apple: {
    // Apple Health uses HealthKit - no OAuth needed (app-side integration)
    apiUrl: 'internal', // Data synced from iOS app
    clientId: 'apple_health'
  }
};

class DeviceSyncService {
  /**
   * Initiate OAuth connection flow
   */
  async initiateConnection(userId, provider) {
    const config = PROVIDER_CONFIGS[provider.toLowerCase()];
    if (!config) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Generate state for OAuth security
    const state = crypto.randomBytes(32).toString('hex');

    // Store state temporarily (in production, use Redis)
    await this.storeOAuthState(userId, provider, state);

    // Build authorization URL
    const authUrl = this.buildAuthUrl(provider, config, state);

    return {
      authorizationUrl: authUrl,
      state,
      provider
    };
  }

  /**
   * Build OAuth authorization URL
   */
  buildAuthUrl(provider, config, state) {
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      state,
      scope: config.scope || ''
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange OAuth code for access token
   */
  async exchangeToken(userId, provider, code, state) {
    const config = PROVIDER_CONFIGS[provider.toLowerCase()];
    if (!config) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Verify state
    const isValidState = await this.verifyOAuthState(userId, provider, state);
    if (!isValidState) {
      throw new Error('Invalid OAuth state');
    }

    try {
      // Exchange code for token
      const tokenResponse = await axios.post(config.tokenUrl, {
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, refresh_token, expires_in, user_id } = tokenResponse.data;

      // Create or update device record
      const device = await WearableDevice.findOneAndUpdate(
        { userId, provider },
        {
          userId,
          provider,
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiry: new Date(Date.now() + expires_in * 1000),
          providerUserId: user_id,
          isActive: true,
          status: 'connected',
          connectedAt: new Date(),
          lastSync: new Date()
        },
        { upsert: true, new: true }
      );

      // Initial sync
      await this.syncDeviceData(userId, provider, access_token);

      return device;
    } catch (error) {
      console.error(`Token exchange error for ${provider}:`, error);
      throw new Error(`Failed to connect ${provider}: ${error.message}`);
    }
  }

  /**
   * Disconnect device and revoke token
   */
  async disconnectDevice(userId, provider) {
    const device = await WearableDevice.findOne({ userId, provider });
    
    if (!device) {
      throw new Error('Device not found');
    }

    // Revoke token with provider (if supported)
    try {
      await this.revokeToken(provider, device.accessToken);
    } catch (error) {
      console.error('Token revocation error:', error);
    }

    // Deactivate device
    device.isActive = false;
    device.status = 'disconnected';
    await device.save();

    return { success: true, message: `${provider} disconnected` };
  }

  /**
   * Manual sync for a device
   */
  async manualSync(userId, provider) {
    const device = await WearableDevice.findOne({ userId, provider, isActive: true });
    
    if (!device) {
      throw new Error('Device not found or not active');
    }

    // Check if token needs refresh
    if (new Date() > device.tokenExpiry) {
      await this.refreshAccessToken(device);
    }

    // Sync last 7 days
    const syncResult = await this.syncDeviceData(userId, provider, device.accessToken);

    // Update last sync time
    device.lastSync = new Date();
    await device.save();

    return {
      recordsAdded: syncResult.recordsAdded,
      lastSync: device.lastSync
    };
  }

  /**
   * Sync device data from provider API
   */
  async syncDeviceData(userId, provider, accessToken) {
    const config = PROVIDER_CONFIGS[provider.toLowerCase()];
    const endDate = new Date();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

    let recordsAdded = 0;

    try {
      // Fetch data based on provider
      const data = await this.fetchProviderData(provider, config, accessToken, startDate, endDate);

      // Store data in database
      for (const dailyData of data) {
        await WearableData.findOneAndUpdate(
          {
            userId,
            provider,
            date: dailyData.date
          },
          {
            userId,
            provider,
            date: dailyData.date,
            hrv: dailyData.hrv,
            rhr: dailyData.rhr,
            sleep: dailyData.sleep,
            steps: dailyData.steps,
            calories: dailyData.calories,
            activeMinutes: dailyData.activeMinutes,
            rawData: dailyData.raw,
            syncedAt: new Date()
          },
          { upsert: true, new: true }
        );
        recordsAdded++;
      }

      return { recordsAdded };
    } catch (error) {
      console.error(`Sync error for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Fetch data from provider API
   */
  async fetchProviderData(provider, config, accessToken, startDate, endDate) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const data = [];

    try {
      switch (provider.toLowerCase()) {
        case 'fitbit':
          return await this.fetchFitbitData(config.apiUrl, headers, startDate, endDate);
        case 'oura':
          return await this.fetchOuraData(config.apiUrl, headers, startDate, endDate);
        case 'whoop':
          return await this.fetchWhoopData(config.apiUrl, headers, startDate, endDate);
        case 'garmin':
          return await this.fetchGarminData(config.apiUrl, headers, startDate, endDate);
        case 'polar':
          return await this.fetchPolarData(config.apiUrl, headers, startDate, endDate);
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Fetch error for ${provider}:`, error);
      return [];
    }
  }

  /**
   * Fetch Fitbit data
   */
  async fetchFitbitData(apiUrl, headers, startDate, endDate) {
    const data = [];
    const dateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    try {
      // Fetch HRV
      const hrvResponse = await axios.get(
        `${apiUrl}/hrv/date/${dateStr}/${endDateStr}.json`,
        { headers }
      );

      // Fetch activity
      const activityResponse = await axios.get(
        `${apiUrl}/activities/date/${dateStr}/${endDateStr}.json`,
        { headers }
      );

      // Fetch sleep
      const sleepResponse = await axios.get(
        `${apiUrl}/sleep/date/${dateStr}/${endDateStr}.json`,
        { headers }
      );

      // Combine data by date
      const dateMap = {};
      
      hrvResponse.data.hrv?.forEach(item => {
        const date = item.dateTime;
        if (!dateMap[date]) dateMap[date] = { date: new Date(date) };
        dateMap[date].hrv = item.value?.dailyRmssd;
        dateMap[date].rhr = item.value?.rhr;
      });

      activityResponse.data['activities-steps']?.forEach(item => {
        const date = item.dateTime;
        if (!dateMap[date]) dateMap[date] = { date: new Date(date) };
        dateMap[date].steps = parseInt(item.value);
      });

      activityResponse.data['activities-calories']?.forEach(item => {
        const date = item.dateTime;
        if (!dateMap[date]) dateMap[date] = { date: new Date(date) };
        dateMap[date].calories = parseInt(item.value);
      });

      sleepResponse.data.sleep?.forEach(item => {
        const date = item.dateOfSleep;
        if (!dateMap[date]) dateMap[date] = { date: new Date(date) };
        dateMap[date].sleep = {
          duration: item.duration / 60000, // Convert to minutes
          efficiency: item.efficiency,
          stages: {
            deep: item.levels?.summary?.deep?.minutes || 0,
            light: item.levels?.summary?.light?.minutes || 0,
            rem: item.levels?.summary?.rem?.minutes || 0,
            wake: item.levels?.summary?.wake?.minutes || 0
          }
        };
      });

      return Object.values(dateMap);
    } catch (error) {
      console.error('Fitbit fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch Oura data
   */
  async fetchOuraData(apiUrl, headers, startDate, endDate) {
    const data = [];
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    try {
      // Fetch sleep data
      const sleepResponse = await axios.get(
        `${apiUrl}/usercollection/sleep?start_date=${startDateStr}&end_date=${endDateStr}`,
        { headers }
      );

      // Fetch daily activity
      const activityResponse = await axios.get(
        `${apiUrl}/usercollection/daily_activity?start_date=${startDateStr}&end_date=${endDateStr}`,
        { headers }
      );

      // Fetch readiness (includes HRV)
      const readinessResponse = await axios.get(
        `${apiUrl}/usercollection/daily_readiness?start_date=${startDateStr}&end_date=${endDateStr}`,
        { headers }
      );

      // Combine data
      const dateMap = {};

      sleepResponse.data.data?.forEach(item => {
        const date = item.day;
        if (!dateMap[date]) dateMap[date] = { date: new Date(date) };
        dateMap[date].sleep = {
          duration: item.total_sleep_duration / 60,
          efficiency: item.sleep_efficiency,
          stages: {
            deep: item.deep_sleep_duration / 60,
            light: item.light_sleep_duration / 60,
            rem: item.rem_sleep_duration / 60,
            wake: item.awake_time / 60
          }
        };
        dateMap[date].rhr = item.lowest_heart_rate;
      });

      activityResponse.data.data?.forEach(item => {
        const date = item.day;
        if (!dateMap[date]) dateMap[date] = { date: new Date(date) };
        dateMap[date].steps = item.steps;
        dateMap[date].calories = item.active_calories;
        dateMap[date].activeMinutes = item.high_activity_time / 60;
      });

      readinessResponse.data.data?.forEach(item => {
        const date = item.day;
        if (!dateMap[date]) dateMap[date] = { date: new Date(date) };
        dateMap[date].hrv = item.hrv_balance;
      });

      return Object.values(dateMap);
    } catch (error) {
      console.error('Oura fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch Whoop data
   */
  async fetchWhoopData(apiUrl, headers, startDate, endDate) {
    try {
      const startStr = startDate.toISOString();
      const endStr = endDate.toISOString();

      // Fetch recovery data
      const recoveryResponse = await axios.get(
        `${apiUrl}/recovery?start=${startStr}&end=${endStr}`,
        { headers }
      );

      // Fetch sleep data
      const sleepResponse = await axios.get(
        `${apiUrl}/sleep?start=${startStr}&end=${endStr}`,
        { headers }
      );

      const dateMap = {};

      recoveryResponse.data.records?.forEach(item => {
        const date = item.created_at.split('T')[0];
        if (!dateMap[date]) dateMap[date] = { date: new Date(date) };
        dateMap[date].hrv = item.score.hrv_rmssd_milli;
        dateMap[date].rhr = item.score.resting_heart_rate;
      });

      sleepResponse.data.records?.forEach(item => {
        const date = item.created_at.split('T')[0];
        if (!dateMap[date]) dateMap[date] = { date: new Date(date) };
        dateMap[date].sleep = {
          duration: item.score.total_sleep_time_milli / 60000,
          efficiency: item.score.sleep_efficiency_percentage,
          stages: {
            deep: item.score.slow_wave_sleep_duration_milli / 60000,
            light: item.score.light_sleep_duration_milli / 60000,
            rem: item.score.rem_sleep_duration_milli / 60000,
            wake: item.score.wake_duration_milli / 60000
          }
        };
      });

      return Object.values(dateMap);
    } catch (error) {
      console.error('Whoop fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch Garmin data
   */
  async fetchGarminData(apiUrl, headers, startDate, endDate) {
    // Garmin API implementation
    // Note: Garmin uses a different auth flow (OAuth 1.0a)
    return [];
  }

  /**
   * Fetch Polar data
   */
  async fetchPolarData(apiUrl, headers, startDate, endDate) {
    // Polar API implementation
    return [];
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(provider, req) {
    const signature = req.headers['x-fitbit-signature'] || req.headers['x-whoop-signature'];
    
    if (!signature) {
      return false;
    }

    const config = PROVIDER_CONFIGS[provider.toLowerCase()];
    const payload = JSON.stringify(req.body);
    
    const hmac = crypto.createHmac('sha256', config.clientSecret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('base64');

    return signature === expectedSignature;
  }

  /**
   * Process webhook data
   */
  async processWebhook(provider, data) {
    // Process real-time webhook updates
    console.log(`Processing webhook for ${provider}:`, data);
    
    // Implementation depends on webhook structure
    // Typically triggers a sync for the affected user
  }

  /**
   * Get unified data from all devices (data fusion)
   */
  async getUnifiedData(userId, days, metrics) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Get data from all active devices
    const devices = await WearableDevice.find({ userId, isActive: true });
    const allData = await WearableData.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    // Data fusion: combine data from multiple sources
    const fusedData = this.fuseMultipleDeviceData(allData, metrics);

    return {
      fusedData,
      sources: devices.map(d => d.provider),
      fusionMethod: 'weighted_average'
    };
  }

  /**
   * Fuse data from multiple devices
   */
  fuseMultipleDeviceData(dataArray, metrics) {
    const dateMap = {};

    dataArray.forEach(data => {
      const dateKey = data.date.toISOString().split('T')[0];
      
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = {
          date: data.date,
          sources: [],
          values: {}
        };
      }

      dateMap[dateKey].sources.push(data.provider);

      metrics.forEach(metric => {
        if (data[metric] !== undefined && data[metric] !== null) {
          if (!dateMap[dateKey].values[metric]) {
            dateMap[dateKey].values[metric] = [];
          }
          dateMap[dateKey].values[metric].push({
            value: data[metric],
            provider: data.provider
          });
        }
      });
    });

    // Average values from multiple sources
    const fusedData = Object.values(dateMap).map(day => {
      const fused = { date: day.date, sources: day.sources };

      metrics.forEach(metric => {
        if (day.values[metric] && day.values[metric].length > 0) {
          // Weighted average (prioritize Oura/Whoop for HRV, Fitbit for steps, etc.)
          const weights = this.getProviderWeights(metric);
          
          let weightedSum = 0;
          let totalWeight = 0;

          day.values[metric].forEach(item => {
            const weight = weights[item.provider] || 1;
            weightedSum += item.value * weight;
            totalWeight += weight;
          });

          fused[metric] = weightedSum / totalWeight;
        }
      });

      return fused;
    });

    return fusedData;
  }

  /**
   * Get provider weights for data fusion
   */
  getProviderWeights(metric) {
    const weights = {
      hrv: { oura: 1.5, whoop: 1.5, fitbit: 1.0, polar: 1.2, garmin: 1.0 },
      rhr: { oura: 1.3, whoop: 1.3, fitbit: 1.0, polar: 1.0, garmin: 1.0 },
      sleep: { oura: 1.5, whoop: 1.4, fitbit: 1.0, polar: 0.8, garmin: 0.8 },
      steps: { fitbit: 1.3, garmin: 1.2, oura: 1.0, whoop: 0.8, polar: 1.0 },
      calories: { fitbit: 1.2, garmin: 1.2, oura: 1.0, whoop: 1.1, polar: 1.0 }
    };

    return weights[metric] || {};
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(device) {
    const config = PROVIDER_CONFIGS[device.provider.toLowerCase()];

    try {
      const response = await axios.post(config.tokenUrl, {
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: device.refreshToken
      });

      device.accessToken = response.data.access_token;
      device.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);
      
      if (response.data.refresh_token) {
        device.refreshToken = response.data.refresh_token;
      }

      await device.save();
      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      device.status = 'token_expired';
      await device.save();
      return false;
    }
  }

  /**
   * Revoke token
   */
  async revokeToken(provider, accessToken) {
    // Provider-specific token revocation
    // Not all providers support this
    return true;
  }

  /**
   * Store OAuth state (use Redis in production)
   */
  async storeOAuthState(userId, provider, state) {
    // In production, store in Redis with TTL
    // For now, store in memory or database
    return true;
  }

  /**
   * Verify OAuth state
   */
  async verifyOAuthState(userId, provider, state) {
    // In production, verify from Redis
    return true; // Simplified for now
  }
}

module.exports = new DeviceSyncService();
