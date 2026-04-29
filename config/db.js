const mongoose = require('mongoose');
const dns = require('dns');
const logger = require('../utils/logger');

// Use Google DNS to resolve MongoDB SRV records (fixes issues on some networks)
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI;

        if (!mongoUri) {
            logger.warn('⚠ MONGODB_URI not configured — database features will not work');
            return null;
        }

        const conn = await mongoose.connect(mongoUri);

        logger.info(`✅ MongoDB connected: ${conn.connection.host}`);
        return conn;
    } catch (err) {
        logger.error(`MongoDB connection error: ${err.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
