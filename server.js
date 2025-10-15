require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// CORS Configuration
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

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logging
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
// ROUTES - PHOENIX ONLY
// ============================================

// Health Check
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
    endpoints: [
      '/api/auth',
      '/api/intelligence',
      '/api/wearables',
      '/api/workouts',
      '/api/exercises',
      '/api/goals',
      '/api/measurements',
      '/api/nutrition',
      '/api/earth',
      '/api/jupiter',
      '/api/saturn',
      '/api/interventions',
      '/api/predictions',
      '/api/companion',
      '/api/personal'
    ]
  });
});

// Import Routes (only if files exist)
try {
  const authRoutes = require('./Src/routes/auth');
  app.use('/api/auth', authRoutes);
} catch (e) {
  console.warn('⚠️  Auth routes not found');
}

try {
  const intelligenceRoutes = require('./Src/routes/intelligence');
  app.use('/api/intelligence', intelligenceRoutes);
} catch (e) {
  console.warn('⚠️  Intelligence routes not found');
}

try {
  const wearableRoutes = require('./Src/routes/wearable');
  app.use('/api/wearables', wearableRoutes);
} catch (e) {
  console.warn('⚠️  Wearable routes not found');
}

try {
  const workoutRoutes = require('./Src/routes/workout');
  app.use('/api/workouts', workoutRoutes);
} catch (e) {
  console.warn('⚠️  Workout routes not found');
}

try {
  const exerciseRoutes = require('./Src/routes/exercise');
  app.use('/api/exercises', exerciseRoutes);
} catch (e) {
  console.warn('⚠️  Exercise routes not found');
}

try {
  const goalRoutes = require('./Src/routes/goal');
  app.use('/api/goals', goalRoutes);
} catch (e) {
  console.warn('⚠️  Goal routes not found');
}

try {
  const measurementRoutes = require('./Src/routes/measurement');
  app.use('/api/measurements', measurementRoutes);
} catch (e) {
  console.warn('⚠️  Measurement routes not found');
}

try {
  const nutritionRoutes = require('./Src/routes/nutrition');
  app.use('/api/nutrition', nutritionRoutes);
} catch (e) {
  console.warn('⚠️  Nutrition routes not found');
}

try {
  const earthRoutes = require('./Src/routes/earth');
  app.use('/api/earth', earthRoutes);
} catch (e) {
  console.warn('⚠️  Earth routes not found');
}

try {
  const jupiterRoutes = require('./Src/routes/jupiter');
  app.use('/api/jupiter', jupiterRoutes);
} catch (e) {
  console.warn('⚠️  Jupiter routes not found');
}

try {
  const saturnRoutes = require('./Src/routes/saturn');
  app.use('/api/saturn', saturnRoutes);
} catch (e) {
  console.warn('⚠️  Saturn routes not found');
}

try {
  const interventionRoutes = require('./Src/routes/intervention');
  app.use('/api/interventions', interventionRoutes);
} catch (e) {
  console.warn('⚠️  Intervention routes not found');
}

try {
  const predictionRoutes = require('./Src/routes/prediction');
  app.use('/api/predictions', predictionRoutes);
} catch (e) {
  console.warn('⚠️  Prediction routes not found');
}

try {
  const companionRoutes = require('./Src/routes/companion');
  app.use('/api/companion', companionRoutes);
} catch (e) {
  console.warn('⚠️  Companion routes not found');
}

try {
  const personalRoutes = require('./Src/routes/personal');
  app.use('/api/personal', personalRoutes);
} catch (e) {
  console.warn('⚠️  Personal routes not found');
}

// ============================================
// ERROR HANDLING
// ============================================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found',
    path: req.path 
  });
});

// Global Error Handler
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
     PHOENIX BACKEND
     Status: Active
     Port: ${PORT}
     Environment: ${process.env.NODE_ENV || 'development'}
     Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}
  ======================================== 🔥
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Close server & exit process
  process.exit(1);
});

module.exports = app;
