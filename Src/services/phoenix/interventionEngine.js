// Intervention Engine - Fully Implemented
const Intervention = require('../../models/phoenix/Intervention');

exports.calculateStats = (interventions) => {
  const stats = {
    total: interventions.length,
    byType: {},
    byStatus: {},
    bySeverity: {},
    successRate: 0,
    avgResponseTime: 0
  };

  interventions.forEach(i => {
    stats.byType[i.interventionType] = (stats.byType[i.interventionType] || 0) + 1;
    stats.byStatus[i.status] = (stats.byStatus[i.status] || 0) + 1;
    stats.bySeverity[i.severity] = (stats.bySeverity[i.severity] || 0) + 1;
  });

  const completed = interventions.filter(i => i.status === 'completed');
  const successful = completed.filter(i => i.successful);
  stats.successRate = completed.length > 0 ? Math.round((successful.length / completed.length) * 100) : 0;

  // Calculate average response time
  const acknowledged = interventions.filter(i => i.acknowledgedAt);
  if (acknowledged.length > 0) {
    const totalTime = acknowledged.reduce((sum, i) => {
      return sum + (new Date(i.acknowledgedAt) - new Date(i.createdAt));
    }, 0);
    stats.avgResponseTime = Math.round(totalTime / acknowledged.length / 1000 / 60); // minutes
  }

  stats.activeCount = interventions.filter(i => i.status === 'active').length;
  stats.pendingCount = interventions.filter(i => i.status === 'pending').length;

  return stats;
};

exports.createManualIntervention = async (userId, type, reason, priority) => {
  return await Intervention.create({
    userId,
    interventionType: type,
    reason,
    severity: priority,
    status: 'pending',
    isManual: true,
    createdAt: new Date()
  });
};

module.exports = exports;
