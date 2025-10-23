const CalendarEvent = require('../models/CalendarEvent');
const EnergyPattern = require('../models/EnergyPattern');
const calendarSync = require('../services/earth/calendarSync');
const energyOptimizer = require('../services/earth/energyOptimizer');

exports.connectCalendar = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    const validProviders = ['google', 'outlook'];
    if (!validProviders.includes(provider.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`
      });
    }

    const authData = await calendarSync.initiateOAuth(userId, provider);

    res.json({
      success: true,
      provider,
      authUrl: authData.authUrl,
      state: authData.state,
      message: 'Redirect user to authUrl to complete OAuth flow'
    });
  } catch (error) {
    console.error('Calendar connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate calendar connection',
      details: error.message
    });
  }
};

exports.handleCalendarCallback = async (req, res) => {
  try {
    const { code, state, provider } = req.body;
    const userId = req.user.id;

    if (!code || !state || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: code, state, provider'
      });
    }

    const result = await calendarSync.handleOAuthCallback(userId, provider, code, state);
    const syncResult = await calendarSync.syncCalendar(userId, provider);

    res.json({
      success: true,
      connected: true,
      provider,
      eventsImported: syncResult.eventsImported,
      lastSync: new Date(),
      message: `${provider} calendar connected successfully`
    });
  } catch (error) {
    console.error('Calendar callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete calendar connection',
      details: error.message
    });
  }
};

exports.getCalendarEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, days = 7 } = req.query;

    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setDate(end.getDate() + parseInt(days));
      end.setHours(23, 59, 59, 999);
    }

    const events = await CalendarEvent.find({
      userId,
      startTime: { $gte: start, $lte: end }
    }).sort({ startTime: 1 }).lean();

    const stats = {
      totalEvents: events.length,
      totalMeetingTime: events.reduce((acc, event) => {
        const duration = (new Date(event.endTime) - new Date(event.startTime)) / (1000 * 60);
        return acc + duration;
      }, 0),
      eventTypes: events.reduce((acc, event) => {
        acc[event.type || 'other'] = (acc[event.type || 'other'] || 0) + 1;
        return acc;
      }, {})
    };

    res.json({
      success: true,
      events,
      stats,
      dateRange: { start, end }
    });
  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve calendar events',
      details: error.message
    });
  }
};

exports.createCalendarEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, startTime, endTime, description, location, type } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, startTime, endTime'
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      return res.status(400).json({
        success: false,
        error: 'End time must be after start time'
      });
    }

    const event = await CalendarEvent.create({
      userId,
      title,
      startTime: start,
      endTime: end,
      description: description || '',
      location: location || '',
      type: type || 'personal',
      provider: 'manual',
      providerEventId: `manual_${Date.now()}`
    });

    res.status(201).json({
      success: true,
      event,
      message: 'Event created successfully'
    });
  } catch (error) {
    console.error('Create calendar event error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create calendar event',
      details: error.message
    });
  }
};

exports.getEnergyOptimizedSchedule = async (req, res) => {
  try {
    const userId = req.user.id;
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const energyPattern = await EnergyPattern.findOne({ userId }).lean();

    if (!energyPattern) {
      return res.status(404).json({
        success: false,
        error: 'No energy pattern data found. Please log energy levels first.',
        suggestion: 'Use POST /api/earth/energy/log to start tracking energy'
      });
    }

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const events = await CalendarEvent.find({
      userId,
      startTime: { $gte: targetDate, $lt: nextDay }
    }).sort({ startTime: 1 }).lean();

    const optimizedSchedule = await energyOptimizer.optimizeSchedule(
      userId,
      targetDate,
      events,
      energyPattern
    );

    res.json({
      success: true,
      date: targetDate,
      energyPattern: energyPattern.pattern,
      peakEnergyTime: energyPattern.peakEnergyTime,
      currentSchedule: events,
      optimizedSchedule: optimizedSchedule.recommendations,
      energyAlignment: optimizedSchedule.alignmentScore,
      suggestions: optimizedSchedule.suggestions,
      insights: optimizedSchedule.insights
    });
  } catch (error) {
    console.error('Energy map error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate energy-optimized schedule',
      details: error.message
    });
  }
};

exports.detectConflicts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + parseInt(days));

    const events = await CalendarEvent.find({
      userId,
      startTime: { $gte: startDate, $lte: endDate }
    }).sort({ startTime: 1 }).lean();

    const conflicts = [];
    const overbooked = [];

    for (let i = 0; i < events.length - 1; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const event1 = events[i];
        const event2 = events[j];

        const start1 = new Date(event1.startTime);
        const end1 = new Date(event1.endTime);
        const start2 = new Date(event2.startTime);
        const end2 = new Date(event2.endTime);

        if (start1 < end2 && start2 < end1) {
          conflicts.push({
            event1: {
              id: event1._id,
              title: event1.title,
              start: event1.startTime,
              end: event1.endTime
            },
            event2: {
              id: event2._id,
              title: event2.title,
              start: event2.startTime,
              end: event2.endTime
            },
            overlapMinutes: Math.min(
              (end1 - start2) / (1000 * 60),
              (end2 - start1) / (1000 * 60)
            )
          });
        }
      }
    }

    const dailyMeetingTime = {};
    events.forEach(event => {
      const dateKey = new Date(event.startTime).toISOString().split('T')[0];
      const duration = (new Date(event.endTime) - new Date(event.startTime)) / (1000 * 60 * 60);
      dailyMeetingTime[dateKey] = (dailyMeetingTime[dateKey] || 0) + duration;
    });

    Object.entries(dailyMeetingTime).forEach(([date, hours]) => {
      if (hours > 8) {
        overbooked.push({
          date,
          totalHours: hours.toFixed(2),
          message: `Overbooked day: ${hours.toFixed(2)} hours of meetings`
        });
      }
    });

    res.json({
      success: true,
      dateRange: { start: startDate, end: endDate },
      conflicts,
      overbooked,
      summary: {
        totalConflicts: conflicts.length,
        overbookedDays: overbooked.length,
        totalEvents: events.length
      },
      recommendations: conflicts.length > 0 || overbooked.length > 0
        ? ['Review conflicting events', 'Consider rescheduling overlapping meetings', 'Add buffer time between meetings']
        : ['Schedule looks good! No conflicts detected.']
    });
  } catch (error) {
    console.error('Detect conflicts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect scheduling conflicts',
      details: error.message
    });
  }
};

exports.syncCalendar = async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider } = req.body;

    let results;

    if (provider) {
      results = await calendarSync.syncCalendar(userId, provider);
    } else {
      results = await calendarSync.syncAllCalendars(userId);
    }

    res.json({
      success: true,
      synced: true,
      results,
      lastSync: new Date(),
      message: provider
        ? `${provider} calendar synced successfully`
        : 'All calendars synced successfully'
    });
  } catch (error) {
    console.error('Calendar sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync calendar',
      details: error.message
    });
  }
};

exports.getEnergyPattern = async (req, res) => {
  try {
    const userId = req.user.id;

    const energyPattern = await EnergyPattern.findOne({ userId }).lean();

    if (!energyPattern) {
      return res.status(404).json({
        success: false,
        error: 'No energy pattern data found',
        message: 'Start logging your energy levels to generate patterns',
        suggestion: 'Use POST /api/earth/energy/log'
      });
    }

    const insights = await energyOptimizer.generateEnergyInsights(energyPattern);

    res.json({
      success: true,
      pattern: energyPattern.pattern,
      peakEnergyTime: energyPattern.peakEnergyTime,
      lowEnergyTime: energyPattern.lowEnergyTime,
      chronotype: energyPattern.chronotype,
      consistency: energyPattern.consistency,
      dataPoints: energyPattern.dataPoints,
      lastUpdated: energyPattern.updatedAt,
      insights
    });
  } catch (error) {
    console.error('Get energy pattern error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve energy pattern',
      details: error.message
    });
  }
};

exports.logEnergyLevel = async (req, res) => {
  try {
    const userId = req.user.id;
    const { level, timestamp, notes } = req.body;

    if (!level || level < 1 || level > 10) {
      return res.status(400).json({
        success: false,
        error: 'Energy level must be between 1 and 10'
      });
    }

    const logTime = timestamp ? new Date(timestamp) : new Date();
    const hour = logTime.getHours();

    let energyPattern = await EnergyPattern.findOne({ userId });

    if (!energyPattern) {
      energyPattern = new EnergyPattern({
        userId,
        pattern: new Array(24).fill(null),
        hourlyLogs: [],
        dataPoints: 0
      });
    }

    energyPattern.hourlyLogs.push({
      timestamp: logTime,
      hour,
      level,
      notes: notes || ''
    });

    const hourLogs = energyPattern.hourlyLogs.filter(log => log.hour === hour);
    const avgLevel = hourLogs.reduce((sum, log) => sum + log.level, 0) / hourLogs.length;
    energyPattern.pattern[hour] = Math.round(avgLevel);

    const maxLevel = Math.max(...energyPattern.pattern.filter(v => v !== null));
    const minLevel = Math.min(...energyPattern.pattern.filter(v => v !== null));
    energyPattern.peakEnergyTime = energyPattern.pattern.indexOf(maxLevel);
    energyPattern.lowEnergyTime = energyPattern.pattern.indexOf(minLevel);

    if (energyPattern.peakEnergyTime >= 6 && energyPattern.peakEnergyTime <= 10) {
      energyPattern.chronotype = 'morning';
    } else if (energyPattern.peakEnergyTime >= 14 && energyPattern.peakEnergyTime <= 18) {
      energyPattern.chronotype = 'afternoon';
    } else if (energyPattern.peakEnergyTime >= 19 || energyPattern.peakEnergyTime <= 2) {
      energyPattern.chronotype = 'evening';
    } else {
      energyPattern.chronotype = 'flexible';
    }

    const variance = energyPattern.pattern
      .filter(v => v !== null)
      .reduce((sum, v, i, arr) => {
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        return sum + Math.pow(v - avg, 2);
      }, 0) / energyPattern.pattern.filter(v => v !== null).length;
    energyPattern.consistency = Math.max(0, Math.min(100, 100 - variance * 10));

    energyPattern.dataPoints += 1;
    energyPattern.lastLogged = logTime;

    await energyPattern.save();

    res.json({
      success: true,
      logged: true,
      energyLevel: level,
      timestamp: logTime,
      hour,
      pattern: energyPattern.pattern,
      chronotype: energyPattern.chronotype,
      dataPoints: energyPattern.dataPoints,
      message: 'Energy level logged successfully'
    });
  } catch (error) {
    console.error('Log energy level error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log energy level',
      details: error.message
    });
  }
};

exports.getOptimalMeetingTimes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'routine', duration = 60 } = req.query;

    const energyPattern = await EnergyPattern.findOne({ userId }).lean();

    if (!energyPattern) {
      return res.status(404).json({
        success: false,
        error: 'No energy pattern data found',
        suggestion: 'Log energy levels to get personalized recommendations'
      });
    }

    const meetingTypeRequirements = {
      focus: { minEnergy: 7, ideal: 'peak' },
      creative: { minEnergy: 6, ideal: 'high' },
      social: { minEnergy: 5, ideal: 'medium-high' },
      routine: { minEnergy: 4, ideal: 'any' }
    };

    const requirement = meetingTypeRequirements[type] || meetingTypeRequirements.routine;

    const optimalSlots = energyPattern.pattern
      .map((level, hour) => ({ hour, level }))
      .filter(slot => slot.level !== null && slot.level >= requirement.minEnergy)
      .sort((a, b) => b.level - a.level)
      .slice(0, 5)
      .map(slot => ({
        hour: slot.hour,
        timeRange: `${slot.hour}:00 - ${(slot.hour + 1) % 24}:00`,
        energyLevel: slot.level,
        suitability: slot.level >= 8 ? 'excellent' : slot.level >= 6 ? 'good' : 'acceptable'
      }));

    res.json({
      success: true,
      meetingType: type,
      duration: parseInt(duration),
      chronotype: energyPattern.chronotype,
      optimalTimes: optimalSlots,
      recommendations: [
        `Best time for ${type} meetings: ${optimalSlots[0]?.timeRange || 'Not enough data'}`,
        `Your peak energy is at ${energyPattern.peakEnergyTime}:00`,
        `Avoid scheduling ${type} meetings during low energy hours (around ${energyPattern.lowEnergyTime}:00)`
      ],
      insights: energyOptimizer.getMeetingTypeInsights(type, energyPattern)
    });
  } catch (error) {
    console.error('Get optimal times error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get optimal meeting times',
      details: error.message
    });
  }
};

exports.predictEnergy = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, hour } = req.query;

    if (hour === undefined || hour < 0 || hour > 23) {
      return res.status(400).json({
        success: false,
        error: 'Hour must be specified and between 0 and 23'
      });
    }

    const energyPattern = await EnergyPattern.findOne({ userId }).lean();

    if (!energyPattern) {
      return res.status(404).json({
        success: false,
        error: 'No energy pattern data found',
        suggestion: 'Log energy levels to enable predictions'
      });
    }

    const targetDate = date ? new Date(date) : new Date();
    const targetHour = parseInt(hour);

    const predictedLevel = energyPattern.pattern[targetHour];

    if (predictedLevel === null) {
      return res.json({
        success: true,
        prediction: null,
        message: 'No data available for this hour yet',
        suggestion: 'Log more energy levels during this time'
      });
    }

    const confidence = Math.min(
      100,
      (energyPattern.dataPoints / 100) * 100
    );

    const context = {
      isPeakTime: targetHour === energyPattern.peakEnergyTime,
      isLowTime: targetHour === energyPattern.lowEnergyTime,
      recommendation: predictedLevel >= 7
        ? 'Great time for important tasks'
        : predictedLevel >= 5
        ? 'Good time for routine work'
        : 'Consider lighter tasks or rest'
    };

    res.json({
      success: true,
      prediction: {
        date: targetDate,
        hour: targetHour,
        predictedLevel,
        confidence: Math.round(confidence),
        ...context
      },
      chronotype: energyPattern.chronotype,
      dataPoints: energyPattern.dataPoints
    });
  } catch (error) {
    console.error('Predict energy error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to predict energy level',
      details: error.message
    });
  }
};

module.exports = exports;
