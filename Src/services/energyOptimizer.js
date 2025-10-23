const CalendarEvent = require('../../models/CalendarEvent');
const EnergyPattern = require('../../models/EnergyPattern');

function getOptimalEnergyForEventType(eventType) {
  const energyRequirements = {
    focus: 8,
    meeting: 6,
    creative: 7,
    workout: 7,
    social: 5,
    break: 3,
    personal: 5,
    travel: 4,
    other: 5
  };

  return energyRequirements[eventType] || 5;
}

function calculateEnergyMatch(actual, optimal) {
  if (actual === null) return 0;
  
  const difference = Math.abs(actual - optimal);
  return Math.max(0, Math.min(100, 100 - (difference * 15)));
}

function generateRecommendation(event, energyLevel, optimalEnergy) {
  const difference = energyLevel - optimalEnergy;

  if (Math.abs(difference) <= 1) {
    return {
      status: 'optimal',
      message: `Perfect timing! Your energy level (${energyLevel}/10) matches this ${event.type} event well.`,
      action: null
    };
  } else if (difference > 1) {
    return {
      status: 'overqualified',
      message: `Your energy (${energyLevel}/10) is higher than needed (${optimalEnergy}/10). Consider scheduling more demanding work here.`,
      action: 'Consider moving a more important task to this time slot'
    };
  } else {
    return {
      status: 'suboptimal',
      message: `Your energy (${energyLevel}/10) may be lower than ideal (${optimalEnergy}/10) for this ${event.type} event.`,
      action: difference < -3 ? 'Consider rescheduling if possible' : 'Take a break before this event'
    };
  }
}

function generateOptimizationSuggestions(recommendations, energyPattern) {
  const suggestions = [];
  
  const suboptimalEvents = recommendations.filter(r => r.match < 70);
  
  if (suboptimalEvents.length > 0) {
    suggestions.push(
      `${suboptimalEvents.length} event(s) are scheduled during suboptimal energy times`
    );
    
    const bestHours = energyPattern.pattern
      .map((level, hour) => ({ level, hour }))
      .filter(h => h.level !== null)
      .sort((a, b) => b.level - a.level)
      .slice(0, 3)
      .map(h => `${h.hour}:00`);
    
    suggestions.push(
      `Your peak energy times are: ${bestHours.join(', ')}. Try scheduling important work during these hours.`
    );
  }

  const meetingHours = recommendations.filter(r => r.event.type === 'meeting').length;
  if (meetingHours > 4) {
    suggestions.push(
      `You have ${meetingHours} meetings scheduled. Consider blocking time for deep work.`
    );
  }

  const hasBreaks = recommendations.some(r => r.event.type === 'break');
  if (!hasBreaks && recommendations.length > 3) {
    suggestions.push(
      'Consider scheduling short breaks between events to maintain energy levels.'
    );
  }

  const afternoonEvents = recommendations.filter(r => {
    const hour = new Date(r.event.time).getHours();
    return hour >= 13 && hour <= 17;
  });
  
  if (afternoonEvents.length > 3 && energyPattern.chronotype === 'morning') {
    suggestions.push(
      'As a morning person, you have many afternoon events. Consider a power nap or caffeine break around 2 PM.'
    );
  }

  return suggestions;
}

function generateScheduleInsights(recommendations, energyPattern, targetDate) {
  const insights = [];
  
  if (recommendations.length === 0) {
    return [{ type: 'info', message: 'No events scheduled for analysis', confidence: 100 }];
  }

  const avgMatch = recommendations.reduce((sum, r) => sum + r.match, 0) / recommendations.length;
  
  if (avgMatch >= 80) {
    insights.push({
      type: 'positive',
      message: 'Your schedule is well-aligned with your energy pattern!',
      confidence: 90
    });
  } else if (avgMatch < 60) {
    insights.push({
      type: 'warning',
      message: 'Your schedule has significant misalignment with your energy levels',
      confidence: 85
    });
  }

  const peakHour = energyPattern.peakEnergyTime;
  if (peakHour !== null) {
    const peakEvents = recommendations.filter(r => {
      const hour = new Date(r.event.time).getHours();
      return hour === peakHour;
    });

    if (peakEvents.length === 0) {
      insights.push({
        type: 'opportunity',
        message: `Your peak energy time (${peakHour}:00) is free! Perfect for your most important work.`,
        confidence: 95
      });
    } else if (peakEvents.some(e => e.event.type !== 'focus' && e.event.type !== 'creative')) {
      insights.push({
        type: 'suggestion',
        message: `Consider using your peak energy time (${peakHour}:00) for high-priority deep work`,
        confidence: 80
      });
    }
  }

  const lowHour = energyPattern.lowEnergyTime;
  if (lowHour !== null) {
    const lowEnergyEvents = recommendations.filter(r => {
      const hour = new Date(r.event.time).getHours();
      return Math.abs(hour - lowHour) <= 1;
    });

    if (lowEnergyEvents.some(e => e.optimalEnergy >= 7)) {
      insights.push({
        type: 'warning',
        message: `Important tasks scheduled near your low energy time (${lowHour}:00). Consider rescheduling.`,
        confidence: 85
      });
    }
  }

  if (energyPattern.chronotype === 'morning') {
    const morningEvents = recommendations.filter(r => {
      const hour = new Date(r.event.time).getHours();
      return hour >= 6 && hour <= 11;
    });
    
    if (morningEvents.length > 0) {
      insights.push({
        type: 'positive',
        message: 'Good job! You\'re taking advantage of your morning energy peak.',
        confidence: 80
      });
    }
  }

  return insights;
}

async function optimizeSchedule(userId, targetDate, events, energyPattern) {
  const recommendations = [];
  const suggestions = [];
  const insights = [];
  let alignmentScore = 0;
  let totalEvents = events.length;

  if (totalEvents === 0) {
    return {
      recommendations: [],
      suggestions: ['Your schedule is clear! Great day for deep work.'],
      insights: ['No events scheduled for this day'],
      alignmentScore: 100
    };
  }

  for (const event of events) {
    const eventHour = new Date(event.startTime).getHours();
    const energyLevel = energyPattern.pattern[eventHour];

    if (energyLevel === null) {
      continue;
    }

    const optimalEnergy = getOptimalEnergyForEventType(event.type);
    const energyMatch = calculateEnergyMatch(energyLevel, optimalEnergy);

    recommendations.push({
      event: {
        id: event._id,
        title: event.title,
        time: event.startTime,
        type: event.type
      },
      energyLevel,
      optimalEnergy,
      match: energyMatch,
      recommendation: generateRecommendation(event, energyLevel, optimalEnergy)
    });

    alignmentScore += energyMatch;
  }

  alignmentScore = totalEvents > 0 ? Math.round(alignmentScore / totalEvents) : 100;

  suggestions.push(...generateOptimizationSuggestions(recommendations, energyPattern));
  insights.push(...generateScheduleInsights(recommendations, energyPattern, targetDate));

  return {
    recommendations,
    suggestions,
    insights,
    alignmentScore
  };
}

async function generateEnergyInsights(energyPattern) {
  const insights = [];

  const completeness = energyPattern.pattern.filter(v => v !== null).length / 24 * 100;
  
  if (completeness < 50) {
    insights.push({
      type: 'data',
      message: `Your energy pattern is ${completeness.toFixed(0)}% complete. Log more data for better recommendations.`,
      priority: 'high'
    });
  }

  if (energyPattern.chronotype !== 'unknown') {
    insights.push({
      type: 'chronotype',
      message: `You're a ${energyPattern.chronotype} person. Your natural energy peaks around ${energyPattern.peakEnergyTime}:00.`,
      priority: 'high'
    });
  }

  if (energyPattern.consistency > 70) {
    insights.push({
      type: 'positive',
      message: 'Your energy pattern is very consistent! This makes schedule optimization highly accurate.',
      priority: 'medium'
    });
  } else if (energyPattern.consistency < 40) {
    insights.push({
      type: 'warning',
      message: 'Your energy levels vary significantly. Consider improving sleep consistency and reducing stressors.',
      priority: 'high'
    });
  }

  if (energyPattern.peakEnergyTime !== null) {
    insights.push({
      type: 'recommendation',
      message: `Schedule your most important work between ${energyPattern.peakEnergyTime - 1}:00 and ${energyPattern.peakEnergyTime + 2}:00`,
      priority: 'high'
    });
  }

  if (energyPattern.lowEnergyTime !== null) {
    insights.push({
      type: 'recommendation',
      message: `Avoid demanding tasks around ${energyPattern.lowEnergyTime}:00. Use this time for breaks or routine work.`,
      priority: 'medium'
    });
  }

  return insights;
}

function getMeetingTypeInsights(meetingType, energyPattern) {
  const insights = [];

  const typeAdvice = {
    focus: {
      energy: 7,
      advice: 'Schedule during your peak energy times for maximum productivity',
      bestTimes: 'morning or whenever your energy is highest'
    },
    creative: {
      energy: 6,
      advice: 'Creativity flows best when you\'re alert but not stressed',
      bestTimes: 'mid-morning or after a light activity break'
    },
    social: {
      energy: 5,
      advice: 'Social events can work at various energy levels',
      bestTimes: 'afternoon or evening, depending on your chronotype'
    },
    routine: {
      energy: 4,
      advice: 'Routine tasks can be done during lower energy periods',
      bestTimes: 'any time, especially during your energy dips'
    }
  };

  const advice = typeAdvice[meetingType] || typeAdvice.routine;

  insights.push({
    type: 'general',
    message: advice.advice
  });

  insights.push({
    type: 'timing',
    message: `Best scheduling: ${advice.bestTimes}`
  });

  if (energyPattern.chronotype === 'morning') {
    if (meetingType === 'focus' || meetingType === 'creative') {
      insights.push({
        type: 'chronotype',
        message: 'As a morning person, schedule this before noon for best results'
      });
    }
  } else if (energyPattern.chronotype === 'evening') {
    if (meetingType === 'focus' || meetingType === 'creative') {
      insights.push({
        type: 'chronotype',
        message: 'As an evening person, you\'ll perform best in afternoon or evening'
      });
    }
  }

  return insights;
}

async function predictEnergyLevel(userId, targetDate, targetHour) {
  const energyPattern = await EnergyPattern.findOne({ userId });
  
  if (!energyPattern) {
    return null;
  }

  let prediction = energyPattern.pattern[targetHour];

  const dayOfWeek = targetDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend && energyPattern.weekendPattern[targetHour] !== null) {
    prediction = energyPattern.weekendPattern[targetHour];
  } else if (!isWeekend && energyPattern.weekdayPattern[targetHour] !== null) {
    prediction = energyPattern.weekdayPattern[targetHour];
  }

  const dataPoints = energyPattern.hourlyLogs.filter(log => log.hour === targetHour).length;
  const confidence = Math.min(100, (dataPoints / 10) * 100);

  return {
    predictedLevel: prediction,
    confidence,
    basedOn: `${dataPoints} historical data points`
  };
}

async function analyzeCalendarLoad(userId, startDate, endDate) {
  const events = await CalendarEvent.find({
    userId,
    startTime: { $gte: startDate, $lte: endDate }
  });

  const energyPattern = await EnergyPattern.findOne({ userId });

  if (!energyPattern) {
    return {
      totalEvents: events.length,
      warning: 'No energy pattern data available for detailed analysis'
    };
  }

  let totalMismatch = 0;
  let heavyDays = 0;
  const dailyLoad = {};

  for (const event of events) {
    const dateKey = event.startTime.toISOString().split('T')[0];
    dailyLoad[dateKey] = (dailyLoad[dateKey] || 0) + 1;

    const eventHour = event.startTime.getHours();
    const energyLevel = energyPattern.pattern[eventHour];
    const optimalEnergy = getOptimalEnergyForEventType(event.type);

    if (energyLevel !== null) {
      const mismatch = Math.abs(energyLevel - optimalEnergy);
      totalMismatch += mismatch;
    }
  }

  Object.values(dailyLoad).forEach(count => {
    if (count >= 5) heavyDays++;
  });

  const avgMismatch = events.length > 0 ? totalMismatch / events.length : 0;
  const overallAlignment = Math.max(0, 100 - (avgMismatch * 15));

  return {
    totalEvents: events.length,
    heavyDays,
    overallAlignment: Math.round(overallAlignment),
    avgMismatchScore: avgMismatch.toFixed(2),
    recommendation: overallAlignment < 60 
      ? 'Consider rescheduling several events to better align with your energy patterns'
      : 'Your schedule has good energy alignment',
    dailyBreakdown: dailyLoad
  };
}

module.exports = {
  optimizeSchedule,
  generateEnergyInsights,
  getMeetingTypeInsights,
  predictEnergyLevel,
  analyzeCalendarLoad,
  getOptimalEnergyForEventType,
  calculateEnergyMatch
};
