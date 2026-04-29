const winston = require('winston');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
    level: isProduction ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'pc-builder-api' },
    transports: [
        // Always log to console (works on Vercel, Railway, etc.)
        new winston.transports.Console({
            format: isProduction
                ? winston.format.json()
                : winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        const metaStr = Object.keys(meta).length && meta.service === undefined
                            ? ` ${JSON.stringify(meta)}`
                            : '';
                        return `${timestamp} [${level}]: ${message}${metaStr}`;
                    })
                ),
        }),
    ],
});

// File transports only in development (Vercel has a read-only filesystem)
if (!isProduction) {
    logger.add(new winston.transports.File({
        filename: path.join(__dirname, '..', 'logs', 'error.log'),
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5,
    }));
    logger.add(new winston.transports.File({
        filename: path.join(__dirname, '..', 'logs', 'combined.log'),
        maxsize: 5242880,
        maxFiles: 5,
    }));
}

module.exports = logger;

