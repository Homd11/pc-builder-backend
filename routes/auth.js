const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/signup
 * Register a new user via Supabase Auth.
 * Body: { email, password, fullName? }
 */
const validateSignup = [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

router.post('/signup', validateSignup, async (req, res, next) => {
    try {
        if (!supabase) {
            return res.status(503).json({ success: false, error: 'Auth service not configured' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
        }

        const { email, password, fullName } = req.body;

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName || '' },
            },
        });

        if (error) {
            logger.error('Signup failed', { error: error.message });
            return res.status(400).json({ success: false, error: error.message });
        }

        // If email confirmation is required, user won't have a session yet
        if (!data.session) {
            return res.json({
                success: true,
                message: 'Signup successful. Please check your email to confirm your account.',
                user: data.user ? { id: data.user.id, email: data.user.email } : null,
            });
        }

        // Insert profile row
        if (data.user) {
            await supabase.from('profiles').upsert({
                id: data.user.id,
                full_name: fullName || '',
            });
        }

        logger.info('User signed up', { userId: data.user?.id, email });

        res.status(201).json({
            success: true,
            user: {
                id: data.user.id,
                email: data.user.email,
                fullName: fullName || '',
            },
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/auth/login
 * Login with email + password.
 * Body: { email, password }
 */
const validateLogin = [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
];

router.post('/login', validateLogin, async (req, res, next) => {
    try {
        if (!supabase) {
            return res.status(503).json({ success: false, error: 'Auth service not configured' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
        }

        const { email, password } = req.body;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            logger.warn('Login failed', { email, error: error.message });
            return res.status(401).json({ success: false, error: error.message });
        }

        logger.info('User logged in', { userId: data.user.id, email });

        // Fetch profile
        let fullName = '';
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', data.user.id)
            .single();

        if (profile) {
            fullName = profile.full_name || '';
        }

        res.json({
            success: true,
            user: {
                id: data.user.id,
                email: data.user.email,
                fullName,
            },
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/auth/refresh
 * Refresh an expired access token.
 * Body: { refreshToken }
 */
router.post('/refresh', async (req, res, next) => {
    try {
        if (!supabase) {
            return res.status(503).json({ success: false, error: 'Auth service not configured' });
        }

        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'refreshToken is required' });
        }

        const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

        if (error || !data.session) {
            return res.status(401).json({ success: false, error: 'Failed to refresh token' });
        }

        res.json({
            success: true,
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/auth/logout
 * Signs out the user (invalidates the token on Supabase side).
 */
router.post('/logout', requireAuth, async (req, res, next) => {
    try {
        // Client will clear its stored tokens. Server-side signout is best-effort.
        if (supabase) {
            await supabase.auth.signOut().catch(() => {});
        }

        logger.info('User logged out', { userId: req.user.id });

        res.json({ success: true, message: 'Logged out' });
    } catch (err) {
        // Even if Supabase signout fails, tell the client it's OK
        res.json({ success: true, message: 'Logged out' });
    }
});

/**
 * GET /api/auth/me
 * Returns the current user's profile (requires valid token).
 */
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        let fullName = '';

        if (supabase) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', req.user.id)
                .single();

            if (profile) {
                fullName = profile.full_name || '';
            }
        }

        res.json({
            success: true,
            user: {
                id: req.user.id,
                email: req.user.email,
                fullName,
            },
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

