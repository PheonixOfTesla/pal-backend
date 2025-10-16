require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors({
  origin: [
    'https://pal-frontend-vert.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// ============================================
// DATABASE CONNECTION
// ============================================

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => {
  console.error('❌ MongoDB Connection Error:', err);
  process.exit(1);
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/', (req, res) => {
  res.json({ 
    message: '🔥 Phoenix Backend API',
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (req, res) => {
  res.json({ 
    message: '🔥 Phoenix API v1.0',
    status: 'active',
    availableEndpoints: [
      '/api/auth',
      '/api/intelligence',
      '/api/wearables',
      '/api/workouts',
      '/api/exercises',
      '/api/goals',
      '/api/measurements',
      '/api/nutrition',
      '/api/interventions',
      '/api/predictions',
      '/api/companion',
      '/api/saturn'
    ]
  });
});

// ============================================
// LOAD ROUTES
// ============================================

// 🔥 CRITICAL - Auth routes (MUST work for login)
try {
  const authRoutes = require('./Src/routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded');
} catch (e) {
  console.error('❌ CRITICAL: Auth routes failed:', e.message);
  process.exit(1);
}

// Core Routes
try {
  const intelligenceRoutes = require('./Src/routes/intelligence');
  app.use('/api/intelligence', intelligenceRoutes);
  console.log('✅ Intelligence routes loaded');
} catch (e) {
  console.warn('⚠️  Intelligence routes not found');
}

try {
  const wearableRoutes = require('./Src/routes/wearables');
  app.use('/api/wearables', wearableRoutes);
  console.log('✅ Wearable routes loaded');
} catch (e) {
  console.warn('⚠️  Wearable routes not found');
}

try {
  const workoutRoutes = require('./Src/routes/workout');
  app.use('/api/workouts', workoutRoutes);
  console.log('✅ Workout routes loaded');
} catch (e) {
  console.warn('⚠️  Workout routes not found');
}

try {
  const exerciseRoutes = require('./Src/routes/exercises');
  app.use('/api/exercises', exerciseRoutes);
  console.log('✅ Exercise routes loaded');
} catch (e) {
  console.warn('⚠️  Exercise routes not found');
}

try {
  const goalRoutes = require('./Src/routes/goals');
  app.use('/api/goals', goalRoutes);
  console.log('✅ Goal routes loaded');
} catch (e) {
  console.warn('⚠️  Goal routes not found');
}

try {
  const measurementRoutes = require('./Src/routes/measurements');
  app.use('/api/measurements', measurementRoutes);
  console.log('✅ Measurement routes loaded');
} catch (e) {
  console.warn('⚠️  Measurement routes not found');
}

try {
  const nutritionRoutes = require('./Src/routes/nutrition');
  app.use('/api/nutrition', nutritionRoutes);
  console.log('✅ Nutrition routes loaded');
} catch (e) {
  console.warn('⚠️  Nutrition routes not found');
}

// 🆕 NEW PLANETARY ROUTES
try {
  const interventionRoutes = require('./Src/routes/intervention');
  app.use('/api/interventions', interventionRoutes);
  console.log('✅ Intervention routes loaded');
} catch (e) {
  console.warn('⚠️  Intervention routes not found');
}

try {
  const predictionRoutes = require('./Src/routes/prediction');
  app.use('/api/predictions', predictionRoutes);
  console.log('✅ Prediction routes loaded');
} catch (e) {
  console.warn('⚠️  Prediction routes not found');
}

try {
  const companionRoutes = require('./Src/routes/companion');
  app.use('/api/companion', companionRoutes);
  console.log('✅ Companion routes loaded');
} catch (e) {
  console.warn('⚠️  Companion routes not found');
}

try {
  const saturnRoutes = require('./Src/routes/saturn');
  app.use('/api/saturn', saturnRoutes);
  console.log('✅ Saturn routes loaded');
} catch (e) {
  console.warn('⚠️  Saturn routes not found');
}

// ============================================
// ERROR HANDLING
// ============================================

app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found',
    path: req.path 
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`
  🔥 ========================================
     PHOENIX BACKEND - COMPLETE SYSTEM
     Status: Active
     Port: ${PORT}
     Environment: ${process.env.NODE_ENV || 'development'}
     Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}
  ======================================== 🔥
  `);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

module.exports = app;