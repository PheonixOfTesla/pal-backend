// Voice Agent Service - Fully Implemented
const VoiceSession = require('../../models/phoenix/VoiceSession');

exports.createSession = async (userId) => {
  const session = await VoiceSession.create({
    userId,
    sessionId: `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    startedAt: new Date(),
    status: 'active'
  });

  return {
    sessionId: session.sessionId,
    userId,
    startedAt: session.startedAt,
    status: 'active',
    message: 'Voice session started. Speak naturally.'
  };
};

exports.endSession = async (sessionId, userId) => {
  const session = await VoiceSession.findOne({ sessionId, userId });
  
  if (session) {
    session.status = 'ended';
    session.endedAt = new Date();
    session.duration = (new Date() - new Date(session.startedAt)) / 1000; // seconds
    await session.save();
  }

  return { 
    success: true, 
    endedAt: new Date(),
    duration: session ? session.duration : 0
  };
};

exports.getTranscriptions = async (userId, startDate, limit) => {
  const sessions = await VoiceSession.find({
    userId,
    createdAt: { $gte: startDate },
    transcriptions: { $exists: true, $ne: [] }
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  const transcriptions = [];
  sessions.forEach(session => {
    if (session.transcriptions) {
      transcriptions.push(...session.transcriptions.map(t => ({
        ...t,
        sessionId: session.sessionId,
        sessionDate: session.createdAt
      })));
    }
  });

  return transcriptions;
};

exports.getSessionHistory = async (userId, startDate) => {
  const sessions = await VoiceSession.find({
    userId,
    createdAt: { $gte: startDate }
  }).sort({ createdAt: -1 });

  const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);

  return { 
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      duration: s.duration,
      status: s.status,
      messageCount: s.transcriptions ? s.transcriptions.length : 0
    })),
    totalSessions: sessions.length,
    totalDuration: Math.round(totalDuration)
  };
};

module.exports = exports;
