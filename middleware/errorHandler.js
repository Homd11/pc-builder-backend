const logger = require('../utils/logger');

/**
 * Global error handler middleware.
 * Catches any unhandled errors and returns a consistent JSON response.
 * Note: Express requires all 4 params (err, req, res, next) to identify this as an error handler.
 */
// noinspection JSUnusedLocalSymbols
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
    logger.error(`Unhandled error: ${err.message}`, {
        stack: err.stack,
        method: req.method,
        url: req.originalUrl,
        body: req.body,
    });

    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error';

    res.status(statusCode).json({
        success: false,
        error: message,
    });
};

module.exports = errorHandler;

