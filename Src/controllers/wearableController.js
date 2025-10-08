import crypto from 'crypto';
import axios from 'axios';
import OAuth from 'oauth-1.0a';

// ============================================
// PROVIDER CONFIGURATIONS - WITH ACTUAL CREDENTIALS
// ============================================
const PROVIDERS = {
  fitbit: {
    name: 'Fitbit',
    clientId: '23TKZ3',
    clientSecret: 'e7d40e8f805e9d0631af7178c0ec1b08',
    redirectUri: 'https://clockwork.fit/api/wearables/callback/fitbit',
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    apiBase: 'https://api.fitbit.com/1',
    scope: 'activity heartrate sleep profile weight nutrition',
    usesOAuth2: true
  },
  
  garmin: {
    name: 'Garmin',
    clientId: process.env.GARMIN_CONSUMER_KEY, // You need to get this from Garmin
    clientSecret: process.env.GARMIN_CONSUMER_SECRET, // You need to get this from Garmin
    redirectUri: 'https://clockwork.fit/api/wearables/callback/garmin',
    requestTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
    authUrl: 'https://connect.garmin.com/oauthConfirm',
    accessTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
    apiBase: 'https://apis.garmin.com/wellness-api/rest',
    usesOAuth1: true
  },
  
  polar: {
    name: 'Polar',
    clientId: 'ca1d6347-f83c-423d-94ef-c4b4ee06cab6',
    clientSecret: '34c2a57a-bbc7-4035-84aa-153db113c809',
    redirectUri: 'https://clockwork.fit/api/wearables/callback/polar',
    authUrl: 'https://flow.polar.com/oauth2/authorization',
    tokenUrl: 'https://polarremote.com/v2/oauth2/token',
    apiBase: 'https://www.polaraccesslink.com/v3',
    scope: 'accesslink.read_all',
    usesOAuth2: true
  },
  
  oura: {
    name: 'Oura',
    clientId: process.env.OURA_CLIENT_ID, // Friend needs to provide this
    clientSecret: process.env.OURA_CLIENT_SECRET, // Friend needs to provide this
    redirectUri: 'https://clockwork.fit/api/wearables/callback/oura',
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    apiBase: 'https://api.ouraring.com/v2',
    scope: 'daily heartrate workout session',
    usesOAuth2: true
  }
};

// ============================================
// OAUTH STATE MANAGEMENT (Store in Redis/DB in production)
// ============================================
const oauthStates = new Map(); // In-memory storage (use Redis in production)

// Generate secure state token
const generateState = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Store state with user info
const storeState = (state, userId, provider) => {
  oauthStates.set(state, { userId, provider, timestamp: Date.now() });
  // Auto-cleanup after 10 minutes
  setTimeout(() => oauthStates.delete(state), 10 * 60 * 1000);
};

// Verify and retrieve state
const verifyState = (state) => {
  const data = oauthStates.get(state);
  if (data) oauthStates.delete(state);
  return data;
};

// ============================================
// OAUTH 2.0 FLOW (Fitbit, Polar, Oura)
// ============================================

export const initiateOAuth2 = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;
    
    const config = PROVIDERS[provider];
    if (!config || !config.usesOAuth2) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    // Generate and store state
    const state = generateState();
    storeState(state, userId, provider);

    // Build authorization URL
    const authParams = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scope,
      state: state
    });

    const authUrl = `${config.authUrl}?${authParams.toString()}`;
    
    res.json({ authUrl });
  } catch (error) {
    console.error('OAuth initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth' });
  }
};

export const handleOAuth2Callback = async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`https://clockwork.fit/settings/wearables?error=${error}`);
    }

    // Verify state
    const stateData = verifyState(state);
    if (!stateData) {
      return res.status(400).json({ error: 'Invalid state' });
    }

    const config = PROVIDERS[provider];
    const { userId } = stateData;

    // Exchange code for access token
    const tokenResponse = await axios.post(config.tokenUrl, 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
        }
      }
    );

    const { access_token, refresh_token, expires_in, user_id } = tokenResponse.data;

    // Store tokens in database (implement your DB logic here)
    await storeWearableTokens(userId, provider, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      externalUserId: user_id,
      connectedAt: new Date()
    });

    // Redirect to success page
    res.redirect(`https://clockwork.fit/settings/wearables?success=${provider}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`https://clockwork.fit/settings/wearables?error=auth_failed`);
  }
};

// ============================================
// OAUTH 1.0a FLOW (Garmin)
// ============================================

export const initiateGarminOAuth = async (req, res) => {
  try {
    const userId = req.user.id;
    const config = PROVIDERS.garmin;

    if (!config.clientId || !config.clientSecret) {
      return res.status(400).json({ error: 'Garmin credentials not configured' });
    }

    const oauth = new OAuth({
      consumer: {
        key: config.clientId,
        secret: config.clientSecret
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      }
    });

    const requestData = {
      url: config.requestTokenUrl,
      method: 'POST',
      data: { oauth_callback: config.redirectUri }
    };

    const authHeader = oauth.toHeader(oauth.authorize(requestData));

    // Request temporary token
    const response = await axios.post(config.requestTokenUrl, null, {
      headers: authHeader,
      params: { oauth_callback: config.redirectUri }
    });

    const params = new URLSearchParams(response.data);
    const oauthToken = params.get('oauth_token');
    const oauthTokenSecret = params.get('oauth_token_secret');

    // Store temporary credentials
    const state = generateState();
    storeState(state, userId, 'garmin');
    oauthStates.get(state).tokenSecret = oauthTokenSecret;

    const authUrl = `${config.authUrl}?oauth_token=${oauthToken}`;
    res.json({ authUrl });
  } catch (error) {
    console.error('Garmin OAuth error:', error);
    res.status(500).json({ error: 'Failed to initiate Garmin OAuth' });
  }
};

// ============================================
// DATA FETCHING FUNCTIONS
// ============================================

export const fetchFitbitData = async (accessToken, startDate, endDate) => {
  const config = PROVIDERS.fitbit;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json'
  };

  try {
    // Fetch activity data
    const activityResponse = await axios.get(
      `${config.apiBase}/user/-/activities/date/${startDate}.json`,
      { headers }
    );

    // Fetch heart rate data
    const heartRateResponse = await axios.get(
      `${config.apiBase}/user/-/activities/heart/date/${startDate}/1d.json`,
      { headers }
    );

    // Fetch sleep data
    const sleepResponse = await axios.get(
      `${config.apiBase}/user/-/sleep/date/${startDate}.json`,
      { headers }
    );

    return {
      activity: activityResponse.data,
      heartRate: heartRateResponse.data,
      sleep: sleepResponse.data,
      fetchedAt: new Date()
    };
  } catch (error) {
    console.error('Fitbit data fetch error:', error);
    throw error;
  }
};

export const fetchPolarData = async (accessToken, userId) => {
  const config = PROVIDERS.polar;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json'
  };

  try {
    // Register user first (required by Polar)
    await axios.post(
      `${config.apiBase}/users`,
      { 'member-id': userId },
      { headers }
    );

    // Fetch available data
    const exercisesResponse = await axios.get(
      `${config.apiBase}/users/${userId}/exercise-transactions`,
      { headers }
    );

    const activityResponse = await axios.get(
      `${config.apiBase}/users/${userId}/activity-transactions`,
      { headers }
    );

    return {
      exercises: exercisesResponse.data,
      activity: activityResponse.data,
      fetchedAt: new Date()
    };
  } catch (error) {
    console.error('Polar data fetch error:', error);
    throw error;
  }
};

export const fetchOuraData = async (accessToken, startDate) => {
  const config = PROVIDERS.oura;
  const headers = {
    'Authorization': `Bearer ${accessToken}`
  };

  try {
    // Fetch daily activity
    const dailyActivity = await axios.get(
      `${config.apiBase}/usercollection/daily_activity`,
      { headers, params: { start_date: startDate } }
    );

    // Fetch sleep data
    const sleepData = await axios.get(
      `${config.apiBase}/usercollection/daily_sleep`,
      { headers, params: { start_date: startDate } }
    );

    // Fetch readiness
    const readiness = await axios.get(
      `${config.apiBase}/usercollection/daily_readiness`,
      { headers, params: { start_date: startDate } }
    );

    return {
      activity: dailyActivity.data,
      sleep: sleepData.data,
      readiness: readiness.data,
      fetchedAt: new Date()
    };
  } catch (error) {
    console.error('Oura data fetch error:', error);
    throw error;
  }
};

// ============================================
// TOKEN REFRESH
// ============================================

export const refreshAccessToken = async (provider, refreshToken) => {
  const config = PROVIDERS[provider];
  
  try {
    const response = await axios.post(config.tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
        }
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || refreshToken,
      expiresIn: response.data.expires_in
    };
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
};

// ============================================
// DATABASE HELPERS (IMPLEMENT WITH YOUR DB)
// ============================================

const storeWearableTokens = async (userId, provider, tokens) => {
  // TODO: Implement with your MongoDB/Database
  console.log('Storing tokens for user:', userId, provider, tokens);
  // Example:
  // await WearableConnection.findOneAndUpdate(
  //   { userId, provider },
  //   { ...tokens, lastSync: new Date() },
  //   { upsert: true }
  // );
};

const getWearableTokens = async (userId, provider) => {
  // TODO: Implement with your MongoDB/Database
  // Example:
  // return await WearableConnection.findOne({ userId, provider });
};

// ============================================
// MAIN SYNC FUNCTION
// ============================================

export const syncWearableData = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    // Get stored tokens
    const connection = await getWearableTokens(userId, provider);
    if (!connection) {
      return res.status(404).json({ error: 'Wearable not connected' });
    }

    let data;
    const today = new Date().toISOString().split('T')[0];

    // Fetch data based on provider
    switch (provider) {
      case 'fitbit':
        data = await fetchFitbitData(connection.accessToken, today, today);
        break;
      case 'polar':
        data = await fetchPolarData(connection.accessToken, userId);
        break;
      case 'oura':
        data = await fetchOuraData(connection.accessToken, today);
        break;
      default:
        return res.status(400).json({ error: 'Unsupported provider' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Sync error:', error);
    
    // If token expired, try refreshing
    if (error.response?.status === 401) {
      try {
        const newTokens = await refreshAccessToken(req.params.provider, connection.refreshToken);
        await storeWearableTokens(req.user.id, req.params.provider, newTokens);
        return res.status(401).json({ error: 'Token refreshed, please retry' });
      } catch (refreshError) {
        return res.status(401).json({ error: 'Authentication expired, please reconnect' });
      }
    }
    
    res.status(500).json({ error: 'Failed to sync data' });
  }
};

export default {
  initiateOAuth2,
  handleOAuth2Callback,
  initiateGarminOAuth,
  syncWearableData,
  refreshAccessToken
};
