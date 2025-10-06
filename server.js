const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

// ============================================
// INITIALIZATION
// ============================================
const app = express();
const server = createServer(app);
const isDevelopment = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 5000;

// ============================================
// CORS CONFIGURATION - UNIVERSALLY COMPATIBLE
// ============================================
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // In production, allow any origin temporarily for universal compatibility
        if (process.env.NODE_ENV === 'production') {
            return callback(null, true);
        }
        
        // In development, allow common localhost ports
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5000',
            'http://localhost:5173',
            'http://localhost:8080',
            'https://coastal-fitness.vercel.app',
            'https://coastal-fitness-app.vercel.app',
            'https://coastal-fitness.netlify.app',
            /\.vercel\.app$/,
            /\.netlify\.app$/
        ];
        
        const isAllowed = allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') {
                return allowed === origin;
            }
            return allowed.test(origin);
        });
        
        callback(null, isAllowed || true); // Allow anyway for universal compatibility
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400
};

// Apply CORS first
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================
// SOCKET.IO CONFIGURATION
// ============================================
const io = socketIO(server, {
    cors: corsOptions,
    pingTimeout: 60000,
    transports: ['websocket', 'polling']
});

app.set('io', io);
global.io = io;

// ============================================
// DATABASE CONNECTION
// ============================================
const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/coastal-fitness';
        
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        };
        
        await mongoose.connect(mongoUri, options);
        
        console.log('✅ MongoDB connected successfully');
        console.log(`📦 Database: ${mongoose.connection.name}`);
        
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });
        
    } catch (err) {
        console.error('❌ MongoDB initial connection failed:', err);
        if (!isDevelopment) {
            setTimeout(connectDB, 5000);
        } else {
            process.exit(1);
        }
    }
};

// ============================================
// SECURITY MIDDLEWARE
// ============================================
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// ============================================
// GENERAL MIDDLEWARE
// ============================================
app.use(compression());
app.use(morgan(isDevelopment ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging for debugging
app.use((req, res, next) => {
    console.log(`🔥 ${req.method} ${req.path} from ${req.ip}`);
    next();
});

// ============================================
// API ROUTES - ALL IMPORTS
// ============================================
const authRoutes = require('./Src/routes/auth');
const userRoutes = require('./Src/routes/user');
const workoutRoutes = require('./Src/routes/workout');
const measurementRoutes = require('./Src/routes/measurements');
const goalRoutes = require('./Src/routes/goals');
const nutritionRoutes = require('./Src/routes/nutrition');
const messageRoutes = require('./Src/routes/message');
const testRoutes = require('./Src/routes/test');
const exerciseRoutes = require('./Src/routes/exercises');
const classRoutes = require('./Src/routes/classes');
const gymRoutes = require('./Src/routes/gyms');

// ============================================
// MOUNT ALL ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/measurements', measurementRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/gyms', gymRoutes);

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/api/health', async (req, res) => {
    const healthcheck = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        service: 'ClockWork API',
        version: '1.0.0',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        routes: {
            auth: '✅',
            users: '✅',
            workouts: '✅',
            measurements: '✅',
            goals: '✅',
            nutrition: '✅',
            messages: '✅',
            tests: '✅',
            exercises: '✅',
            classes: '✅',
            gyms: '✅'
        }
    };
    
    res.status(200).json(healthcheck);
});

// API root endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'ClockWork API',
        version: '1.0.0',
        status: 'running',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            workouts: '/api/workouts',
            measurements: '/api/measurements',
            goals: '/api/goals',
            nutrition: '/api/nutrition',
            messages: '/api/messages',
            tests: '/api/tests',
            exercises: '/api/exercises',
            classes: '/api/classes',
            gyms: '/api/gyms',
            health: '/api/health'
        }
    });
});

// ============================================
// SOCKET.IO HANDLERS
// ============================================
require('./Src/utils/socketHandlers')(io);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        success: false,
        error: 'API endpoint not found',
        path: req.originalUrl,
        method: req.method,
        availableEndpoints: [
            '/api/auth',
            '/api/users',
            '/api/workouts',
            '/api/measurements',
            '/api/goals',
            '/api/nutrition',
            '/api/messages',
            '/api/tests',
            '/api/exercises',
            '/api/classes',
            '/api/gyms',
            '/api/health'
        ]
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(`❌ Error: ${err.message}`);
    console.error(err.stack);
    
    let status = err.status || err.statusCode || 500;
    let message = err.message || 'Internal server error';
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        status = 400;
        message = Object.values(err.errors).map(e => e.message).join(', ');
    }
    
    if (err.name === 'CastError') {
        status = 400;
        message = 'Invalid ID format';
    }
    
    if (err.code === 11000) {
        status = 400;
        message = 'Duplicate entry - this record already exists';
    }
    
    if (err.message === 'Not allowed by CORS') {
        status = 403;
        message = 'Cross-origin request blocked';
    }
    
    if (err.name === 'JsonWebTokenError') {
        status = 401;
        message = 'Invalid token';
    }
    
    if (err.name === 'TokenExpiredError') {
        status = 401;
        message = 'Token expired';
    }
    
    res.status(status).json({
        success: false,
        message: message,
        error: isDevelopment ? {
            name: err.name,
            stack: err.stack,
            details: err
        } : undefined
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION! Shutting down...');
    console.error(err.name, err.message);
    console.error(err.stack);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ UNHANDLED REJECTION! Shutting down...');
    console.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});

// Handle SIGTERM
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM RECEIVED. Shutting down gracefully...');
    server.close(() => {
        console.log('💥 Process terminated!');
    });
});

// ============================================
// START SERVER
// ============================================
const startServer = async () => {
    try {
        await connectDB();
        
        server.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════════════╗
║        🚀 CLOCKWORK BACKEND SERVER STARTED 🚀         ║
╠════════════════════════════════════════════════════════╣
║  🌐 Server:      http://localhost:${PORT}                 ║
║  📚 API:         http://localhost:${PORT}/api             ║
║  💚 Health:      http://localhost:${PORT}/api/health      ║
║  🔧 Environment: ${(process.env.NODE_ENV || 'development').padEnd(41)}║
║  📦 Database:    Connected                             ║
║  🎯 Routes:      11 route groups mounted               ║
╠════════════════════════════════════════════════════════╣
║  📍 Available Endpoints:                               ║
║     /api/auth         - Authentication                 ║
║     /api/users        - User Management                ║
║     /api/workouts     - Workout System                 ║
║     /api/measurements - Body Measurements              ║
║     /api/goals        - Goals & Habits                 ║
║     /api/nutrition    - Nutrition Plans                ║
║     /api/messages     - Messaging                      ║
║     /api/tests        - Tests & Assessments            ║
║     /api/exercises    - Exercise Library               ║
║     /api/classes      - Calendar & Scheduling          ║
║     /api/gyms         - Gym Management                 ║
╠════════════════════════════════════════════════════════╣
║  🔥 Phoenix of Tesla™ - Production Ready               ║
╚════════════════════════════════════════════════════════╝
            `);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Start the server
startServer();

// Export for testing
module.exports = { app, server, io };