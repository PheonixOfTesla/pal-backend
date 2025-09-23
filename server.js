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
// CORS CONFIGURATION - FIXED FOR RAILWAY
// ============================================
const corsOptions = {
    origin: function (origin, callback) {
        // In production, allow any origin temporarily to debug
        if (process.env.NODE_ENV === 'production') {
            return callback(null, true);
        }
        
        // In development, be more restrictive
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5000',
            'http://localhost:5173',
            'https://coastal-fitness.vercel.app',
            'https://coastal-fitness-app.vercel.app',
            'https://coastal-fitness.netlify.app'
        ];
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // Allow anyway for now
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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
// API ROUTES
// ============================================
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const workoutRoutes = require('./routes/workout');
const measurementRoutes = require('./routes/measurements');
const goalRoutes = require('./routes/goals');
const nutritionRoutes = require('./routes/nutrition');
const messageRoutes = require('./routes/message');
const testRoutes = require('./routes/test');
const exerciseRoutes = require('./routes/exercises');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/measurements', measurementRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/exercises', exerciseRoutes);

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/api/health', async (req, res) => {
    const healthcheck = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        service: 'Coastal Fitness API',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    };
    
    res.status(200).json(healthcheck);
});

// API root endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Coastal Fitness API',
        version: '1.0.0',
        status: 'running',
        environment: process.env.NODE_ENV || 'development'
    });
});

// ============================================
// SOCKET.IO HANDLERS
// ============================================
require('./utils/socketHandlers')(io);

// ============================================
// ERROR HANDLING
// ============================================
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        success: false,
        error: 'API endpoint not found',
        path: req.originalUrl
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(`Error: ${err.message}`);
    
    let status = err.status || 500;
    let message = err.message || 'Internal server error';
    
    if (err.message === 'Not allowed by CORS') {
        status = 403;
        message = 'Cross-origin request blocked';
    }
    
    res.status(status).json({
        success: false,
        message: message
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
║     🚀 COASTAL FITNESS BACKEND SERVER STARTED 🚀      ║
╠════════════════════════════════════════════════════════╣
║  🌐 Server:      http://localhost:${PORT}                 ║
║  📚 API:         http://localhost:${PORT}/api             ║
║  💚 Health:      http://localhost:${PORT}/api/health      ║
║  🔧 Environment: ${process.env.NODE_ENV || 'development'}                        ║
║  📦 Database:    Connected                             ║
╚════════════════════════════════════════════════════════╝
            `);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = { app, server, io };
