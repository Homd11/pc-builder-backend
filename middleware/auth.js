const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret_change_me';

/**
 * Auth middleware — validates the JWT from the Authorization header.
 * Attaches req.user = { id, email } on success, returns 401 otherwise.
 */
async function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, error: 'Missing token' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        req.user = {
            id: decoded.id,
            email: decoded.email,
        };
        req.token = token;

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Token expired' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }
        logger.error('Auth middleware error', { error: err.message });
        return res.status(500).json({ success: false, error: 'Authentication error' });
    }
}

/**
 * Optional auth — same as requireAuth but doesn't block unauthenticated requests.
 * If token is valid, sets req.user. If not, continues anyway with req.user = null.
 */
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            req.user = null;
            return next();
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        req.user = {
            id: decoded.id,
            email: decoded.email,
        };
        req.token = token;

        next();
    } catch (err) {
        req.user = null;
        next();
    }
}

/**
 * Generate an access token (short-lived).
 */
function generateAccessToken(user) {
    return jwt.sign(
        { id: user._id || user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

/**
 * Generate a refresh token (long-lived).
 */
function generateRefreshToken(user) {
    return jwt.sign(
        { id: user._id || user.id, email: user.email, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

module.exports = { requireAuth, optionalAuth, generateAccessToken, generateRefreshToken, JWT_SECRET };
