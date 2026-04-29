const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Fix DNS resolution for MongoDB SRV on some local networks
// Vercel's own DNS works fine, so only override locally
if (process.env.NODE_ENV !== 'production') {
    try {
        const dns = require('dns');
        dns.setServers(['8.8.8.8', '8.8.4.4']);
    } catch (e) {
        // Ignore if dns module not available
    }
}

let cached = global._mongooseConnection;

const connectDB = async () => {
    // Re-use cached connection in serverless environments (Vercel)
    if (cached && cached.readyState === 1) {
        return cached;
    }

    try {
        const mongoUri = process.env.MONGODB_URI;

        if (!mongoUri) {
            logger.warn('⚠ MONGODB_URI not configured — database features will not work');
            return null;
        }

        const conn = await mongoose.connect(mongoUri, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });

        cached = conn.connection;
        global._mongooseConnection = cached;

        logger.info(`✅ MongoDB connected: ${conn.connection.host}`);
        return conn;
    } catch (err) {
        logger.error(`MongoDB connection error: ${err.message}`);
        throw err;
    }
};

module.exports = connectDB;
