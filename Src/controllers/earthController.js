// Src/controllers/earthController.js
const CalendarEvent = require('../models/CalendarEvent');
const EnergyPattern = require('../models/EnergyPattern');
const WearableData = require('../models/WearableData');
const User = require('../models/User');
const axios = require('axios');

// ============================================
// GOOGLE CALENDAR INTEGRATION
// ============================================

/**
 * Initiate Google Calendar OAuth
 */
exports.connectGoogleCalendar = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GOOGLE_CALENDAR_CLIENT_ID}&` +
      `redirect_uri=${process.env.GOOGLE_CALENDAR_REDIRECT_URI}&` +
      `response_type=code&` +
      `scope=https://www.googleapis.com/auth/calendar.readonly&` +
      `access_type=offline&` +
      `state=${userId}&` +
      `prompt=consent`;
    
    res.json({
      success: true,
      authUrl,
      provider: 'google'
    });
  } catch (error) {
    console.error('Google Calendar connect error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate calendar connection'
    });
  }
};

/**
 * Handle Google Calendar OAuth callback
 */
exports.googleCalendarCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const userId = state;
    
    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
      grant_type: 'authorization_code'
    });
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Store tokens in user document
    await User.findByIdAndUpdate(userId, {
      $push: {
        calendarConnections: {
          provider: 'google',
          connected: true,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: new Date(Date.now() + expires_in * 1000)
        }
      }
    });
    
    res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/?calendar_connected=google`);
  } catch (error) {
    console.error('Google Calendar callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://clockwork.fit'}/?calendar_error=auth_failed`);
  }
};

/**
 * Sync calendar events from Google Calendar
 */
exports.syncCalendarEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId);
    const googleConnection = user.calendarConnections?.find(c => c.provider === 'google');
    
    if (!googleConnection) {
      return res.status(404).json({
        success: false,
        message: 'Calendar not connected'
      });
    }
    
    // Fetch events from Google Calendar
    const eventsResponse = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      headers: {
        Authorization: `Bearer ${googleConnection.accessToken}`
      },
      params: {
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      }
    });
    
    const events = eventsResponse.data.items;
    
    // Store events in database
    for (const event of events) {
      await CalendarEvent.findOneAndUpdate(
        {
          userId,
          externalEventId: event.id
        },
        {
          userId,
          provider: 'google',
          externalEventId: event.id,
          title: event.summary,
          description: event.description,
          startTime: new Date(event.start.dateTime || event.start.date),
          endTime: new Date(event.end.dateTime || event.end.date),
          location: event.location,
          attendees: event.attendees?.map(a => a.email) || [],
          lastSynced: new Date()
        },
        { upsert: true, new: true }
      );
    }
    
    res.json({
      success: true,
      message: `Synced ${events.length} events`,
      count: events.length
    });
  } catch (error) {
    console.error('Sync calendar error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync calendar'
    });
  }
};

/**
 * Get user's calendar events
 */
exports.getCalendarEvents = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    
    const query = { userId };
    
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = new Date(startDate);
      if (endDate) query.startTime.$lte = new Date(endDate);
    }
    
    const events = await CalendarEvent.find(query).sort('startTime');
    
    res.json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events'
    });
  }
};

/**
 * Optimize schedule based on energy levels
 */
exports.optimizeSchedule = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get upcoming events
    const events = await CalendarEvent.find({
      userId,
      startTime: { $gte: new Date() }
    }).sort('startTime').limit(20);
    
    // Get recent wearable data
    const wearableData = await WearableData.find({
      userId,
      date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort('-date');
    
    // Calculate average HRV and sleep patterns
    const avgHRV = wearableData.reduce((sum, d) => sum + (d.hrv || 0), 0) / wearableData.length;
    const avgSleep = wearableData.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / wearableData.length;
    
    // Generate recommendations
    const recommendations = [];
    
    for (const event of events) {
      const hour = event.startTime.getHours();
      
      // Morning meetings (before 10am)
      if (hour < 10) {
        if (avgSleep < 420) { // Less than 7 hours
          recommendations.push({
            eventId: event._id,
            eventTitle: event.title,
            recommendation: 'Consider rescheduling - low sleep detected',
            reason: 'Your average sleep is below optimal. Morning meetings may be challenging.',
            severity: 'warning'
          });
        }
      }
      
      // Late afternoon meetings (after 3pm)
      if (hour >= 15 && hour < 18) {
        if (avgHRV < 50) {
          recommendations.push({
            eventId: event._id,
            eventTitle: event.title,
            recommendation: 'Energy levels may be low - consider morning alternative',
            reason: 'HRV indicates elevated stress. Afternoon energy may be compromised.',
            severity: 'info'
          });
        }
      }
      
      // Back-to-back meetings
      const nextEvent = events.find(e => 
        e.startTime > event.startTime && 
        e.startTime < event.endTime
      );
      
      if (nextEvent) {
        recommendations.push({
          eventId: event._id,
          eventTitle: event.title,
          recommendation: 'Add buffer time between meetings',
          reason: 'Back-to-back meetings reduce recovery and increase stress.',
          severity: 'warning'
        });
      }
    }
    
    res.json({
      success: true,
      recommendations,
      metrics: {
        avgHRV,
        avgSleepHours: (avgSleep / 60).toFixed(1),
        upcomingEvents: events.length
      }
    });
  } catch (error) {
    console.error('Optimize schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to optimize schedule'
    });
  }
};

/**
 * Analyze energy patterns
 */
exports.analyzeEnergyPatterns = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get last 30 days of wearable data
    const wearableData = await WearableData.find({
      userId,
      date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).sort('-date');
    
    // Get calendar events for same period
    const events = await CalendarEvent.find({
      userId,
      startTime: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    // Analyze patterns by hour of day
    const hourlyPatterns = {};
    
    for (let hour = 0; hour < 24; hour++) {
      const eventsAtHour = events.filter(e => e.startTime.getHours() === hour);
      
      hourlyPatterns[hour] = {
        hour,
        eventCount: eventsAtHour.length,
        avgRecoveryOnDays: 0,
        recommendation: ''
      };
    }
    
    // Calculate best times based on HRV
    const morningHRV = wearableData.filter(d => d.hrv && d.hrv > 60);
    const afternoonEvents = events.filter(e => {
      const hour = e.startTime.getHours();
      return hour >= 14 && hour < 17;
    });
    
    const insights = [];
    
    if (morningHRV.length > wearableData.length * 0.7) {
      insights.push({
        pattern: 'Strong morning recovery',
        recommendation: 'Schedule important meetings between 9-11am',
        confidence: 'high'
      });
    }
    
    if (afternoonEvents.length > 10) {
      insights.push({
        pattern: 'High afternoon meeting load',
        recommendation: 'Block 30min recovery time after 3pm meetings',
        confidence: 'medium'
      });
    }
    
    res.json({
      success: true,
      insights,
      hourlyPatterns,
      summary: {
        totalEvents: events.length,
        avgDailyEvents: (events.length / 30).toFixed(1),
        avgHRV: (wearableData.reduce((sum, d) => sum + (d.hrv || 0), 0) / wearableData.length).toFixed(1),
        optimalHours: [9, 10, 11]
      }
    });
  } catch (error) {
    console.error('Energy analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze energy patterns'
    });
  }
};

module.exports = exports;