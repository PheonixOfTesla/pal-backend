// Real-time Monitor Service - WebSocket Ready
const CorrelationPattern = require('../../models/CorrelationPattern');

exports.getCurrentPatterns = async (userId) => {
  const activePatterns = await CorrelationPattern.find({
    userId,
    isActive: true
  }).sort({ 'correlation.strength': -1 }).limit(5);

  return {
    activePatterns: activePatterns.map(p => ({
      type: p.patternType,
      strength: p.correlation.strength,
      confidence: p.correlation.confidence,
      lastUpdated: p.lastValidated
    })),
    alerts: generateRealtimeAlerts(activePatterns),
    liveMetrics: {
      patternsActive: activePatterns.length,
      monitoringStatus: 'active',
      lastUpdate: new Date()
    }
  };
};

function generateRealtimeAlerts(patterns) {
  const alerts = [];
  
  patterns.forEach(pattern => {
    if (pattern.triggers && pattern.triggers.length > 0) {
      pattern.triggers.forEach(trigger => {
        if (trigger.severity === 'high' || trigger.severity === 'critical') {
          alerts.push({
            patternType: pattern.patternType,
            trigger: trigger.condition,
            severity: trigger.severity,
            action: trigger.action
          });
        }
      });
    }
  });

  return alerts;
}

module.exports = exports;
