// server.js (BACKEND ROOT)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);

// ============================================
// SECURITY & PERFORMANCE MIDDLEWARE
// ============================================

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ============================================
// CORS CONFIGURATION
// ============================================

const allowedOrigins = [
  'https://pal-frontend-vert.vercel.app',
  'https://clockwork.fit',
  'https://www.clockwork.fit',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ============================================
// BODY PARSING
// ============================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// DATABASE CONNECTION
// ============================================

const connectDB = async () => {
  try {
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log('✅ MongoDB Connected Successfully');
    console.log(`   Database: ${mongoose.connection.name}`);
    console.log(`   Host: ${mongoose.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// MongoDB event listeners
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

// ============================================
// WEBSOCKET SERVER FOR VOICE
// ============================================

const wss = new WebSocket.Server({ server, path: '/api/voice/realtime' });
const realtimeVoiceController = require('./Src/controllers/realtimeVoiceController');

wss.on('connection', (ws, req) => {
  console.log('🎤 New WebSocket connection');
  
  // Extract user from query or token
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const token = urlParams.get('token');
  
  // Attach user info to request (simplified - enhance with JWT verification)
  req.user = { id: urlParams.get('userId') };
  
  realtimeVoiceController.handleConnection(ws, req);
  
  ws.on('close', () => {
    console.log('🔇 WebSocket connection closed');
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

console.log('✅ WebSocket server initialized on /api/voice/realtime');

// ============================================
// HEALTH CHECK & ROOT ROUTES
// ============================================

app.get('/', (req, res) => {
  res.json({ 
    message: '🔥 Phoenix Backend API',
    status: 'active',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/health', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    }
  };
  
  res.json(healthcheck);
});

app.get('/api', (req, res) => {
  res.json({ 
    message: '🔥 Phoenix API v2.0',
    status: 'active',
    systems: {
      mercury: 'Health & Vitals',
      venus: 'Training & Fitness',
      earth: 'Schedule & Time',
      mars: 'Goals & Habits',
      jupiter: 'Wealth & Finance',
      saturn: 'Legacy & Social'
    },
    endpoints: {
      auth: '/api/auth',
      intelligence: '/api/intelligence',
      wearables: '/api/wearables',
      workouts: '/api/workouts',
      exercises: '/api/exercises',
      goals: '/api/goals',
      measurements: '/api/measurements',
      nutrition: '/api/nutrition',
      interventions: '/api/interventions',
      predictions: '/api/predictions',
      companion: '/api/companion',
      voice: '/api/voice',
      earth: '/api/earth',
      jupiter: '/api/jupiter',
      saturn: '/api/saturn',
      users: '/api/users',
      subscription: '/api/subscription'
    }
  });
});

// ============================================
// LOAD ALL ROUTES
// ============================================

const routes = [
  { path: '/api/auth', file: './Src/routes/auth', name: 'Auth', critical: true },
  { path: '/api/intelligence', file: './Src/routes/intelligence', name: 'Intelligence' },
  { path: '/api/wearables', file: './Src/routes/wearables', name: 'Wearables' },
  { path: '/api/workouts', file: './Src/routes/workout', name: 'Workouts' },
  { path: '/api/exercises', file: './Src/routes/exercises', name: 'Exercises' },
  { path: '/api/goals', file: './Src/routes/goals', name: 'Goals' },
  { path: '/api/measurements', file: './Src/routes/measurements', name: 'Measurements' },
  { path: '/api/nutrition', file: './Src/routes/nutrition', name: 'Nutrition' },
  { path: '/api/interventions', file: './Src/routes/intervention', name: 'Interventions' },
  { path: '/api/predictions', file: './Src/routes/prediction', name: 'Predictions' },
  { path: '/api/companion', file: './Src/routes/companion', name: 'Companion' },
  { path: '/api/voice', file: './Src/routes/voice', name: 'Voice' },
  { path: '/api/earth', file: './Src/routes/earth', name: 'Earth (Calendar)' },
  { path: '/api/jupiter', file: './Src/routes/jupiter', name: 'Jupiter (Finance)' },
  { path: '/api/saturn', file: './Src/routes/saturn', name: 'Saturn (Legacy)' },
  { path: '/api/users', file: './Src/routes/user', name: 'Users' },
  { path: '/api/subscription', file: './Src/routes/subscription', name: 'Subscription' }
];

routes.forEach(({ path, file, name, critical }) => {
  try {
    const route = require(file);
    app.use(path, route);
    console.log(`✅ ${name} routes loaded`);
  } catch (error) {
    if (critical) {
      console.error(`❌ CRITICAL: ${name} routes failed:`, error.message);
      process.exit(1);
    } else {
      console.warn(`⚠️  ${name} routes not loaded`);
    }
  }
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found',
    path: req.path,
    method: req.method,
    availableEndpoints: '/api for full list'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      error: err 
    })
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Promise Rejection:', error);
  process.exit(1);
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();
    
    // Then start HTTP server
    server.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║            🔥 PHOENIX BACKEND - COMPLETE SYSTEM            ║
║                                                            ║
║  Status:       Active & Running                            ║
║  Port:         ${PORT}                                          ║
║  Environment:  ${process.env.NODE_ENV || 'development'}                                ║
║  Database:     Connected                                   ║
║  WebSocket:    Active (Voice AI)                           ║
║                                                            ║
║  API Base:     http://localhost:${PORT}/api                  ║
║  Health:       http://localhost:${PORT}/health               ║
║                                                            ║
║  Systems:      Mercury, Venus, Earth, Mars,                ║
║                Jupiter, Saturn                             ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = { app, server };