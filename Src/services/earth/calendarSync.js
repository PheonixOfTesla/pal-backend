// ================================================================
// CALENDAR SYNC SERVICE
// ================================================================
// File: Src/services/earth/calendarSync.js
// Purpose: Handle OAuth and syncing with calendar providers
// Providers: Google Calendar, Outlook Calendar, Apple Calendar
// ================================================================

const axios = require('axios');
const CalendarEvent = require('../../models/earth/CalendarEvent');
const { google } = require('googleapis');
const crypto = require('crypto');

// ================================================================
// CONFIGURATION
// ================================================================

const GOOGLE_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'https://api.phoenix.com/api/earth/calendar/callback',
  scopes: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
  ]
};

const OUTLOOK_CONFIG = {
  clientId: process.env.OUTLOOK_CLIENT_ID,
  clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
  redirectUri: process.env.OUTLOOK_REDIRECT_URI || 'https://api.phoenix.com/api/earth/calendar/callback',
  scopes: ['Calendars.Read', 'Calendars.ReadWrite']
};

// ================================================================
// OAUTH FLOW
// ================================================================

/**
 * Initiate OAuth flow for calendar provider
 */
exports.initiateOAuth = async (provider, userId) => {
  const state = crypto.randomBytes(32).toString('hex');
  let authUrl = '';

  switch (provider) {
    case 'google':
      authUrl = await initiateGoogleOAuth(state);
      break;
    case 'outlook':
      authUrl = await initiateOutlookOAuth(state);
      break;
    case 'apple':
      authUrl = await initiateAppleOAuth(state);
      break;
    default:
      throw new Error('Unsupported calendar provider');
  }

  return { authUrl, state };
};

/**
 * Google Calendar OAuth
 */
const initiateGoogleOAuth = async (state) => {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CONFIG.clientId,
    GOOGLE_CONFIG.clientSecret,
    GOOGLE_CONFIG.redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_CONFIG.scopes,
    state,
    prompt: 'consent'
  });

  return authUrl;
};

/**
 * Outlook Calendar OAuth
 */
const initiateOutlookOAuth = async (state) => {
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    `client_id=${OUTLOOK_CONFIG.clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(OUTLOOK_CONFIG.redirectUri)}` +
    `&scope=${encodeURIComponent(OUTLOOK_CONFIG.scopes.join(' '))}` +
    `&state=${state}` +
    `&response_mode=query`;

  return authUrl;
};

/**
 * Apple Calendar OAuth (iCloud)
 */
const initiateAppleOAuth = async (state) => {
  // Apple uses CloudKit for calendar access
  // This is a placeholder - actual implementation would use CloudKit JS
  throw new Error('Apple Calendar integration coming soon');
};

/**
 * Exchange authorization code for access token
 */
exports.exchangeCode = async (provider, code) => {
  switch (provider) {
    case 'google':
      return await exchangeGoogleCode(code);
    case 'outlook':
      return await exchangeOutlookCode(code);
    case 'apple':
      return await exchangeAppleCode(code);
    default:
      throw new Error('Unsupported calendar provider');
  }
};

/**
 * Exchange Google authorization code
 */
const exchangeGoogleCode = async (code) => {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CONFIG.clientId,
    GOOGLE_CONFIG.clientSecret,
    GOOGLE_CONFIG.redirectUri
  );

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

/**
 * Exchange Outlook authorization code
 */
const exchangeOutlookCode = async (code) => {
  const response = await axios.post(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    new URLSearchParams({
      client_id: OUTLOOK_CONFIG.clientId,
      client_secret: OUTLOOK_CONFIG.clientSecret,
      code,
      redirect_uri: OUTLOOK_CONFIG.redirectUri,
      grant_type: 'authorization_code'
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  return response.data;
};

/**
 * Exchange Apple authorization code
 */
const exchangeAppleCode = async (code) => {
  // Placeholder for Apple CloudKit
  throw new Error('Apple Calendar integration coming soon');
};

// ================================================================
// CALENDAR SYNCING
// ================================================================

/**
 * Sync calendar events from provider
 */
exports.syncEvents = async (userId, provider, accessToken, daysBack = 7, daysForward = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysForward);

  let events = [];

  switch (provider) {
    case 'google':
      events = await syncGoogleEvents(accessToken, startDate, endDate);
      break;
    case 'outlook':
      events = await syncOutlookEvents(accessToken, startDate, endDate);
      break;
    case 'apple':
      events = await syncAppleEvents(accessToken, startDate, endDate);
      break;
    default:
      throw new Error('Unsupported calendar provider');
  }

  // Save or update events in database
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const event of events) {
    const existingEvent = await CalendarEvent.findOne({
      userId,
      externalEventId: event.externalEventId,
      provider
    });

    if (existingEvent) {
      // Update existing event
      Object.assign(existingEvent, event);
      existingEvent.lastSynced = new Date();
      await existingEvent.save();
      updated++;
    } else {
      // Create new event
      await CalendarEvent.create({
        userId,
        provider,
        ...event,
        lastSynced: new Date()
      });
      added++;
    }
  }

  return {
    success: true,
    added,
    updated,
    skipped,
    total: events.length,
    provider,
    syncedAt: new Date()
  };
};

/**
 * Sync Google Calendar events
 */
const syncGoogleEvents = async (accessToken, startDate, endDate) => {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CONFIG.clientId,
    GOOGLE_CONFIG.clientSecret,
    GOOGLE_CONFIG.redirectUri
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250
  });

  const events = response.data.items.map(event => ({
    externalEventId: event.id,
    title: event.summary || 'Untitled Event',
    description: event.description || '',
    startTime: new Date(event.start.dateTime || event.start.date),
    endTime: new Date(event.end.dateTime || event.end.date),
    location: event.location || '',
    attendees: event.attendees ? event.attendees.map(a => a.email) : [],
    meetingType: inferMeetingType(event.summary, event.description),
    energyRequirement: inferEnergyRequirement(event.summary, event.description),
    isRecurring: !!event.recurringEventId,
    recurringEventId: event.recurringEventId || null,
    status: event.status === 'cancelled' ? 'cancelled' : 'confirmed'
  }));

  return events;
};

/**
 * Sync Outlook Calendar events
 */
const syncOutlookEvents = async (accessToken, startDate, endDate) => {
  const response = await axios.get(
    'https://graph.microsoft.com/v1.0/me/calendarview',
    {
      params: {
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
        $top: 250,
        $orderby: 'start/dateTime'
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const events = response.data.value.map(event => ({
    externalEventId: event.id,
    title: event.subject || 'Untitled Event',
    description: event.bodyPreview || '',
    startTime: new Date(event.start.dateTime),
    endTime: new Date(event.end.dateTime),
    location: event.location?.displayName || '',
    attendees: event.attendees ? event.attendees.map(a => a.emailAddress.address) : [],
    meetingType: inferMeetingType(event.subject, event.bodyPreview),
    energyRequirement: inferEnergyRequirement(event.subject, event.bodyPreview),
    isRecurring: !!event.recurrence,
    status: event.isCancelled ? 'cancelled' : 'confirmed'
  }));

  return events;
};

/**
 * Sync Apple Calendar events
 */
const syncAppleEvents = async (accessToken, startDate, endDate) => {
  // Placeholder for Apple CloudKit implementation
  throw new Error('Apple Calendar integration coming soon');
};

// ================================================================
// AI CLASSIFICATION
// ================================================================

/**
 * Infer meeting type from title and description
 */
const inferMeetingType = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();

  // Keywords for each meeting type
  const typeKeywords = {
    focus: ['deep work', 'focus', 'coding', 'development', 'writing', 'analysis', 'strategy'],
    stressful: ['performance review', 'difficult', 'conflict', 'negotiation', 'presentation', 'pitch', 'board'],
    social: ['coffee', 'lunch', 'dinner', 'happy hour', 'team building', 'celebration', 'party'],
    travel: ['flight', 'drive', 'travel', 'commute', 'trip'],
    workout: ['gym', 'workout', 'exercise', 'training', 'run', 'yoga', 'fitness']
  };

  for (const [type, keywords] of Object.entries(typeKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return type;
    }
  }

  // Check if it's a 1:1 meeting
  if (text.includes('1:1') || text.includes('one-on-one') || text.includes('1-on-1')) {
    return 'focus';
  }

  return 'other';
};

/**
 * Infer energy requirement from title and description
 */
const inferEnergyRequirement = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();

  // High energy (5)
  const highEnergyKeywords = ['presentation', 'pitch', 'keynote', 'all-hands', 'performance review', 'negotiation'];
  if (highEnergyKeywords.some(keyword => text.includes(keyword))) {
    return 5;
  }

  // Medium-high energy (4)
  const mediumHighKeywords = ['meeting', 'interview', 'workshop', 'brainstorm', 'planning'];
  if (mediumHighKeywords.some(keyword => text.includes(keyword))) {
    return 4;
  }

  // Low energy (2)
  const lowEnergyKeywords = ['coffee', 'lunch', 'catch up', 'casual', 'social'];
  if (lowEnergyKeywords.some(keyword => text.includes(keyword))) {
    return 2;
  }

  // Very low energy (1)
  const veryLowKeywords = ['break', 'buffer', 'hold', 'placeholder'];
  if (veryLowKeywords.some(keyword => text.includes(keyword))) {
    return 1;
  }

  // Default: medium energy (3)
  return 3;
};

// ================================================================
// TOKEN REFRESH
// ================================================================

/**
 * Refresh access token if expired
 */
exports.refreshAccessToken = async (provider, refreshToken) => {
  switch (provider) {
    case 'google':
      return await refreshGoogleToken(refreshToken);
    case 'outlook':
      return await refreshOutlookToken(refreshToken);
    case 'apple':
      return await refreshAppleToken(refreshToken);
    default:
      throw new Error('Unsupported calendar provider');
  }
};

/**
 * Refresh Google access token
 */
const refreshGoogleToken = async (refreshToken) => {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CONFIG.clientId,
    GOOGLE_CONFIG.clientSecret,
    GOOGLE_CONFIG.redirectUri
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  
  return credentials;
};

/**
 * Refresh Outlook access token
 */
const refreshOutlookToken = async (refreshToken) => {
  const response = await axios.post(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    new URLSearchParams({
      client_id: OUTLOOK_CONFIG.clientId,
      client_secret: OUTLOOK_CONFIG.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  return response.data;
};

/**
 * Refresh Apple access token
 */
const refreshAppleToken = async (refreshToken) => {
  throw new Error('Apple Calendar integration coming soon');
};

// ================================================================
// WEBHOOK HANDLERS (for real-time updates)
// ================================================================

/**
 * Handle Google Calendar webhook
 */
exports.handleGoogleWebhook = async (req, res) => {
  // Google sends notifications to watch resources
  const { resourceId, resourceState } = req.headers;
  
  if (resourceState === 'sync') {
    // Initial sync - acknowledge
    return { success: true };
  }

  // Trigger sync for this user's calendar
  // Extract userId from resourceId or channel metadata
  // Then call syncEvents
  
  return { success: true, message: 'Webhook processed' };
};

/**
 * Handle Outlook Calendar webhook
 */
exports.handleOutlookWebhook = async (req, res) => {
  const { subscriptionId, resource, changeType } = req.body;
  
  if (changeType === 'created' || changeType === 'updated' || changeType === 'deleted') {
    // Trigger sync for affected calendar
    // Extract userId and sync
  }
  
  return { success: true, message: 'Webhook processed' };
};

module.exports = exports;
