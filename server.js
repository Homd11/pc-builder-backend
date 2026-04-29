require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const calculateRoute = require('./routes/calculate');
const historyRoute = require('./routes/history');
const componentsRoute = require('./routes/components');
const buildsRoute = require('./routes/builds');
const authRoute = require('./routes/auth');

const app = express();

// --- Security Middleware ---
app.use(helmet()); // Secure HTTP headers

// CORS — allow frontend to talk to the API
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
}));

// Handle preflight requests explicitly
app.options('*', cors());

// Body parser
app.use(express.json({ limit: '10kb' })); // Limit payload size

// Rate limiting — prevent abuse
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // 100 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please try again later.' },
});
app.use('/api/', apiLimiter);

// --- Ensure MongoDB is connected before handling API requests ---
app.use('/api/', async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        logger.error('Database connection failed', { error: err.message });
        return res.status(503).json({ success: false, error: 'Database temporarily unavailable' });
    }
});

// --- Request Logging ---
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
    next();
});

// --- Routes ---
app.use('/api/v1/calculate', calculateRoute);
app.use('/api/v1/history', historyRoute);

// Backward-compatible route (old clients hitting /api/calculate)
app.use('/api/calculate', calculateRoute);
app.use('/api/history', historyRoute);

// Auth
app.use('/api/auth', authRoute);

// Components & Builds CRUD
app.use('/api/components', componentsRoute);
app.use('/api/builds', buildsRoute);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'OK', uptime: process.uptime() });
});

// --- Global Error Handler ---
app.use(errorHandler);

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    logger.info(`🚀 Backend is running on http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

// Export for Vercel serverless deployment
module.exports = app;
