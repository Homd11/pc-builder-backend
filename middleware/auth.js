const supabase = require('../config/supabase');
const logger = require('../utils/logger');

/**
 * Auth middleware — validates the Supabase JWT from the Authorization header.
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

        if (!supabase) {
            return res.status(503).json({ success: false, error: 'Auth service not configured' });
        }

        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data?.user) {
            logger.warn('Auth failed', { error: error?.message });
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        req.user = {
            id: data.user.id,
            email: data.user.email,
        };
        req.token = token;

        next();
    } catch (err) {
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
        if (!authHeader || !authHeader.startsWith('Bearer ') || !supabase) {
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            req.user = null;
            return next();
        }

        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data?.user) {
            req.user = null;
        } else {
            req.user = {
                id: data.user.id,
                email: data.user.email,
            };
            req.token = token;
        }

        next();
    } catch (err) {
        req.user = null;
        next();
    }
}

module.exports = { requireAuth, optionalAuth };

