const logger = require('../utils/logger');
const Component = require('../models/Component');
const Calculation = require('../models/Calculation');

/**
 * Fetch upgrade alternatives from MongoDB.
 */
async function getAlternatives(culprit, tier) {
    if (culprit === 'None') return [];

    try {
        const docs = await Component.find({ type: culprit, tier })
            .sort({ match_score: -1 })
            .limit(5)
            .select('name price benchmark match_score')
            .lean();

        return docs.map(row => ({
            name: row.name,
            price: row.price,
            benchmark: row.benchmark,
            matchScore: row.match_score,
        }));
    } catch (err) {
        logger.error('Components query error', { error: err.message });
        return [];
    }
}

/**
 * Fetch a single component by its MongoDB _id.
 */
async function getComponentById(id) {
    if (!id) return null;

    try {
        const doc = await Component.findById(id).lean();
        if (!doc) {
            logger.error('Component not found', { id });
            return null;
        }
        return doc;
    } catch (err) {
        logger.error('Failed to fetch component', { error: err.message });
        return null;
    }
}

/**
 * Get min/max benchmark scores for a component type.
 * Used by the bottleneck algorithm for percentile normalization.
 */
async function getScoreRange(type) {
    try {
        const result = await Component.aggregate([
            { $match: { type } },
            {
                $group: {
                    _id: null,
                    min: { $min: '$benchmark' },
                    max: { $max: '$benchmark' },
                },
            },
        ]);

        if (!result.length) {
            logger.error('Failed to fetch score range', { type });
            return { min: 0, max: 1 };
        }

        return { min: result[0].min, max: result[0].max };
    } catch (err) {
        logger.error('Failed to fetch score range', { error: err.message });
        return { min: 0, max: 1 };
    }
}

/**
 * Save a calculation result to MongoDB for analytics / history.
 */
async function saveCalculation({ cpuScore, gpuScore, bottleneckPercent, severity, culprit }) {
    try {
        const doc = await Calculation.create({
            cpu_score: cpuScore,
            gpu_score: gpuScore,
            bottleneck_percent: bottleneckPercent,
            severity,
            culprit,
        });

        logger.debug('Calculation saved', { id: doc._id });
        return doc;
    } catch (err) {
        // Non-critical — don't break the response if saving fails
        logger.error('Failed to save calculation', { error: err.message });
        return null;
    }
}

/**
 * Get recent calculation history from MongoDB.
 */
async function getCalculationHistory(limit = 20) {
    try {
        const docs = await Calculation.find()
            .sort({ created_at: -1 })
            .limit(limit)
            .lean();

        return docs;
    } catch (err) {
        logger.error('Failed to fetch calculation history', { error: err.message });
        return [];
    }
}

module.exports = {
    getAlternatives,
    getComponentById,
    getScoreRange,
    saveCalculation,
    getCalculationHistory,
};
