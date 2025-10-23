// ============================================================================
// PHOENIX BACKEND - MASTER SERVER.JS
// ============================================================================
// Consolidates all 7 Planetary Controllers:
// - Mercury (Health & Biometrics) - 38 endpoints
// - Venus (Fitness & Training) - 88 endpoints  
// - Earth (Calendar & Energy) - 11 endpoints
// - Mars (Goals & Habits) - 20 endpoints
// - Jupiter (Financial Management) - 16 endpoints
// - Saturn (Legacy Planning) - 12 endpoints
// - Phoenix (AI Companion) - 76 endpoints
// TOTAL: 261 API endpoints
// ============================================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const morgan = require('morgan');

// ============================================================================
// EXPRESS APP INITIALIZATION
// ============================================================================

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet - Security headers
app.use(helmet());

// CORS Configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Rate Limiting - Prevent brute force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Sanitize data to prevent MongoDB injection
app.use(mongoSanitize());

// ============================================================================
// BODY PARSING MIDDLEWARE
// ============================================================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Compression middleware for response optimization
app.use(compression());

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// MONGODB CONNECTION
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phoenix';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB Connected Successfully');
  console.log(`🔗 Database: ${mongoose.connection.name}`);
})
.catch((err) => {
  console.error('❌ MongoDB Connection Error:', err.message);
  process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// ============================================================================
// IMPORT ALL ROUTES
// ============================================================================

// Authentication, Users & Subscriptions
const authRoutes = require('./Src/routes/auth');
const userRoutes = require('./Src/routes/user');
const subscriptionRoutes = require('./Src/routes/subscription');

// 7 Planetary System Routes (Fully Consolidated)
const mercuryRoutes = require('./Src/routes/mercury');      // Health, Biometrics, Wearables & Recovery (38 endpoints)
const venusRoutes = require('./Src/routes/venus');          // Fitness & Training (88 endpoints)
const earthRoutes = require('./Src/routes/earth');          // Calendar & Energy (11 endpoints)
const marsRoutes = require('./Src/routes/mars');            // Goals & Habits (18 endpoints)
const jupiterRoutes = require('./Src/routes/jupiter');      // Financial Management (16 endpoints)
const saturnRoutes = require('./Src/routes/saturn');        // Legacy Planning (12 endpoints)
const phoenixRoutes = require('./Src/routes/phoenix');      // AI Companion (76 endpoints)

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    routes: {
      auth: 'Authentication',
      users: 'User management',
      subscriptions: 'Subscription management',
      mercury: '38 endpoints (Health, Biometrics, Wearables, Recovery)',
      venus: '88 endpoints (Fitness & Training)',
      earth: '11 endpoints (Calendar & Energy)',
      mars: '18 endpoints (Goals & Habits)',
      jupiter: '16 endpoints (Financial)',
      saturn: '12 endpoints (Legacy)',
      phoenix: '76 endpoints (AI Companion)',
      total_routes: 10,
      total_endpoints: '259+'
    }
  };
  res.status(200).json(healthCheck);
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: '🚀 Phoenix Backend API',
    version: '1.0.0',
    status: 'Running',
    documentation: '/api/docs',
    planets: [
      'Mercury (Health)',
      'Venus (Fitness)', 
      'Earth (Calendar)',
      'Mars (Goals)',
      'Jupiter (Finance)',
      'Saturn (Legacy)',
      'Phoenix (AI)'
    ]
  });
});

// ============================================================================
// MOUNT ALL ROUTES
// ============================================================================

// Authentication, Users & Subscriptions
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// 7 Planetary Systems (All fully consolidated - no separate wearables/recovery routes)
app.use('/api/mercury', mercuryRoutes);     // Health, Biometrics, Wearables & Recovery - 38 endpoints
app.use('/api/venus', venusRoutes);         // Fitness & Training - 88 endpoints
app.use('/api/earth', earthRoutes);         // Calendar & Energy - 11 endpoints
app.use('/api/mars', marsRoutes);           // Goals & Habits - 18 endpoints
app.use('/api/jupiter', jupiterRoutes);     // Financial Management - 16 endpoints
app.use('/api/saturn', saturnRoutes);       // Legacy Planning - 12 endpoints
app.use('/api/phoenix', phoenixRoutes);     // AI Companion - 76 endpoints

console.log('✅ All 10 routes mounted successfully');
console.log('   🔐 Auth, Users & Subscriptions (3 routes)');
console.log('   🪐 7 Planetary Systems - Fully Consolidated');
console.log('   📡 Mercury includes: Wearables & Recovery');
console.log('📡 Total API Endpoints: 259+');

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

// 404 Handler - Route not found
app.use((req, res, next) => {
  const error = new Error(`Route not found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: errors
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      error: 'Duplicate Error',
      message: `${field} already exists`
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Authentication Error',
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Authentication Error',
      message: 'Token expired'
    });
  }

  // Default error response
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: err.name || 'ServerError',
    message: process.env.NODE_ENV === 'development' ? message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================================
// START SERVER (MUST BE BEFORE SHUTDOWN HANDLERS)
// ============================================================================

const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 PHOENIX BACKEND SERVER STARTED');
  console.log('='.repeat(60));
  console.log(`🔌 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
  console.log(`💾 Database: ${mongoose.connection.name}`);
  console.log('\n🔐 AUTH & MANAGEMENT:');
  console.log('   🔑 Auth          - Authentication');
  console.log('   👤 Users         - User management');
  console.log('   💳 Subscriptions - Stripe integration');
  console.log('\n🪐 7 PLANETARY SYSTEMS (FULLY CONSOLIDATED):');
  console.log('   ☿ Mercury  - Health, Biometrics, Wearables, Recovery (38)');
  console.log('   ♀ Venus    - Fitness & Training (88)');
  console.log('   ⊕ Earth    - Calendar & Energy (11)');
  console.log('   ♂ Mars     - Goals & Habits (18)');
  console.log('   ♃ Jupiter  - Financial Management (16)');
  console.log('   ♄ Saturn   - Legacy Planning (12)');
  console.log('   🔥 Phoenix  - AI Companion (76)');
  console.log(`\n📡 Total: 10 Route Files | 259+ Endpoints`);
  console.log(`\n✅ Server ready at: http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log('='.repeat(60) + '\n');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
  console.log(`\n${signal} signal received: closing HTTP server`);
  
  server.close(() => {
    console.log('HTTP server closed');
    
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  console.error(err.stack);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app;
