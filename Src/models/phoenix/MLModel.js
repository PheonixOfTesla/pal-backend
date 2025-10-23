const mongoose = require('mongoose');

const mlModelSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  version: { type: String, required: true },
  modelType: { type: String, required: true, enum: ['prediction', 'classification', 'regression', 'clustering'] },
  status: { type: String, enum: ['training', 'active', 'deprecated'], default: 'training' },
  accuracy: Number,
  trainedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('MLModel', mlModelSchema);
