const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { requireAuth, generateAccessToken, generateRefreshToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/signup
 * Register a new user.
 * Body: { email, password, fullName? }
 */
const validateSignup = [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

router.post('/signup', validateSignup, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
        }

        const { email, password, fullName } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // Create user (password is hashed via pre-save hook)
        const user = await User.create({
            email,
            password,
            full_name: fullName || '',
        });

        const token = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        logger.info('User signed up', { userId: user._id, email });

        res.status(201).json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.full_name,
            },
            token,
            refreshToken,
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
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
        }

        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        // Compare password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            logger.warn('Login failed — wrong password', { email });
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const token = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        logger.info('User logged in', { userId: user._id, email });

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.full_name,
            },
            token,
            refreshToken,
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
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'refreshToken is required' });
        }

        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
        }

        if (decoded.type !== 'refresh') {
            return res.status(401).json({ success: false, error: 'Invalid token type' });
        }

        // Verify user still exists
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        const newToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        res.json({
            success: true,
            token: newToken,
            refreshToken: newRefreshToken,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/auth/logout
 * Signs out the user. (Client-side clears tokens; stateless JWT has no server revocation.)
 */
router.post('/logout', requireAuth, async (req, res, next) => {
    try {
        logger.info('User logged out', { userId: req.user.id });
        res.json({ success: true, message: 'Logged out' });
    } catch (err) {
        res.json({ success: true, message: 'Logged out' });
    }
});

/**
 * GET /api/auth/me
 * Returns the current user's profile (requires valid token).
 */
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.full_name,
            },
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
