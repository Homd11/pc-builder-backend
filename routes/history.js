const express = require('express');
const { getCalculationHistory } = require('../services/componentService');

const router = express.Router();

/**
 * GET /api/v1/history
 * Returns recent bottleneck calculation history from MongoDB.
 */
router.get('/', async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const history = await getCalculationHistory(limit);

        res.json({
            success: true,
            count: history.length,
            data: history,
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
