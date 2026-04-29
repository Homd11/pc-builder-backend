const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Cache the connection promise for serverless reuse
let cachedPromise = null;

const connectDB = async () => {
    // If already connected, return immediately
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    // If a connection attempt is in progress, wait for it
    if (cachedPromise) {
        return cachedPromise;
    }

    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        logger.warn('⚠ MONGODB_URI not configured — database features will not work');
        throw new Error('MONGODB_URI not configured');
    }

    cachedPromise = mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
    }).then(conn => {
        logger.info(`✅ MongoDB connected: ${conn.connection.host}`);
        return conn.connection;
    }).catch(err => {
        cachedPromise = null; // Allow retry on next request
        throw err;
    });

    return cachedPromise;
};

module.exports = connectDB;
