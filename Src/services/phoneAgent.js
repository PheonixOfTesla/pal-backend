// Phone Agent Service - Twilio Integration Ready
const ButlerAction = require('../models/ButlerAction');

exports.initiateCall = async (data) => {
  const call = await ButlerAction.create({
    userId: data.userId,
    actionType: 'phone_call',
    details: {
      phoneNumber: data.phoneNumber,
      purpose: data.purpose,
      script: data.script,
      recordCall: data.recordCall || false
    },
    status: 'initiated',
    createdAt: new Date()
  });

  return {
    callId: call._id,
    status: 'initiated',
    phoneNumber: data.phoneNumber,
    message: 'Call initiated. Twilio integration required for production.'
  };
};

exports.getCallHistory = async (userId, days, limit) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await ButlerAction.find({
    userId,
    actionType: 'phone_call',
    createdAt: { $gte: startDate }
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = exports;
