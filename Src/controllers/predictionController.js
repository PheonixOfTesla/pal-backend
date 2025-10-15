// Src/controllers/predictionController.js
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Goal = require('../models/Goal');
const Measurement = require('../models/Measurement');

const calculateTrend = (values) => {
  if (values.length < 3) return 'stable';
  const recent = values.slice(0, Math.floor(values.length / 2)).reduce((a, b) => a + b) / Math.floor(values.length / 2);
  const older = values.slice(Math.floor(values.length / 2)).reduce((a, b) => a + b) / (values.length - Math.floor(values.length / 2));
  return recent > older + 5 ? 'improving' : recent < older - 5 ? 'declining' : 'stable';
};

exports.predictHRV = async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 7 } = req.query;
    
    const data = await WearableData.find({ userId, hrv: { $exists: true, $gt: 0 } })
      .sort('-date').limit(30).lean();
    
    if (data.length < 7) return res.json({ success: false, message: 'Insufficient data' });
    
    const hrvValues = data.map(d => d.hrv);
    const avgHRV = hrvValues.reduce((a, b) => a + b) / hrvValues.length;
    const trend = calculateTrend(hrvValues);
    const changeRate = (hrvValues[0] - hrvValues[hrvValues.length - 1]) / hrvValues.length;
    
    const forecast = Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.now() + (i + 1) * 86400000).toISOString().split('T')[0],
      predicted: Math.round(avgHRV + changeRate * (i + 1)),
      confidence: Math.max(60, 90 - i * 5)
    }));
    
    const alerts = forecast.filter(f => f.predicted < 40).map(f => `HRV predicted to drop to ${f.predicted}ms on ${f.date} - rest day needed`);
    
    res.json({ success: true, forecast, trend, alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Prediction failed' });
  }
};

exports.predictIllness = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [wearable, workouts] = await Promise.all([
      WearableData.find({ userId }).sort('-date').limit(7).lean(),
      Workout.find({ clientId: userId, completed: true }).sort('-completedAt').limit(7).lean()
    ]);
    
    let riskScore = 0;
    const avgHRV = wearable.reduce((sum, d) => sum + (d.hrv || 0), 0) / wearable.length;
    const avgSleep = wearable.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / wearable.length;
    const trainingLoad = workouts.length;
    
    if (avgHRV < 40) riskScore += 40;
    if (avgSleep < 360) riskScore += 30;
    if (trainingLoad > 5) riskScore += 20;
    if (wearable[0]?.restingHeartRate > wearable[wearable.length - 1]?.restingHeartRate + 5) riskScore += 10;
    
    const probability = Math.min(riskScore, 100);
    const recommendations = [];
    if (probability > 70) recommendations.push('Cancel workouts for 48h', 'Increase sleep to 9h', 'Reduce stress');
    
    res.json({ success: true, probability, riskScore, recommendations });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Illness prediction failed' });
  }
};

exports.predictGoalCompletion = async (req, res) => {
  try {
    const { goalId } = req.params;
    
    const goal = await Goal.findById(goalId).lean();
    if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });
    
    const progress = goal.current - goal.startingValue;
    const target = goal.target - goal.startingValue;
    const daysElapsed = Math.ceil((Date.now() - new Date(goal.createdAt)) / 86400000);
    const daysRemaining = Math.ceil((new Date(goal.deadline) - Date.now()) / 86400000);
    
    const velocity = progress / daysElapsed;
    const projectedProgress = progress + (velocity * daysRemaining);
    const projectedDate = new Date(Date.now() + ((target - progress) / velocity) * 86400000);
    
    const onTrack = projectedProgress >= target;
    const confidence = Math.min(Math.round((progress / target) * 100), 95);
    
    res.json({ success: true, projectedDate: projectedDate.toISOString().split('T')[0], onTrack, confidence, velocity: velocity.toFixed(2) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Goal prediction failed' });
  }
};

exports.predictEnergy = async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 7 } = req.query;
    
    const wearable = await WearableData.find({ userId }).sort('-date').limit(30).lean();
    
    const avgHRV = wearable.reduce((sum, d) => sum + (d.hrv || 0), 0) / wearable.length;
    const avgSleep = wearable.reduce((sum, d) => sum + (d.sleepDuration || 0), 0) / wearable.length;
    
    const baseEnergy = Math.min(((avgHRV / 70) * 50) + ((avgSleep / 480) * 50), 100);
    
    const forecast = Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.now() + (i + 1) * 86400000).toISOString().split('T')[0],
      morningEnergy: Math.round(baseEnergy * 0.9),
      afternoonEnergy: Math.round(baseEnergy * 0.7),
      eveningEnergy: Math.round(baseEnergy * 0.5)
    }));
    
    res.json({ success: true, forecast, avgBaseline: Math.round(baseEnergy) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Energy prediction failed' });
  }
};