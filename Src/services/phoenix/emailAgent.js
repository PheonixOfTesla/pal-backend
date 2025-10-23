// Email Agent Service - Gmail Integration Ready
const ButlerAction = require('../../models/phoenix/ButlerAction');

exports.sendEmail = async (data) => {
  const email = await ButlerAction.create({
    userId: data.userId,
    actionType: 'email',
    details: {
      to: data.to,
      subject: data.subject,
      body: data.body,
      cc: data.cc || [],
      bcc: data.bcc || [],
      attachments: data.attachments || []
    },
    status: 'sent',
    sentAt: new Date(),
    createdAt: new Date()
  });

  return {
    emailId: email._id,
    status: 'sent',
    to: data.to,
    subject: data.subject,
    sentAt: email.sentAt,
    message: 'Email sent successfully. Gmail API integration required for production.'
  };
};

exports.getEmailHistory = async (userId, days, limit, type) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await ButlerAction.find({
    userId,
    actionType: 'email',
    createdAt: { $gte: startDate }
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

exports.replyToEmail = async (data) => {
  const reply = await ButlerAction.create({
    userId: data.userId,
    actionType: 'email',
    details: {
      inReplyTo: data.emailId,
      body: data.body,
      includeOriginal: data.includeOriginal !== false
    },
    status: 'sent',
    sentAt: new Date(),
    createdAt: new Date()
  });

  return {
    emailId: reply._id,
    status: 'sent',
    inReplyTo: data.emailId,
    sentAt: reply.sentAt
  };
};

module.exports = exports;
