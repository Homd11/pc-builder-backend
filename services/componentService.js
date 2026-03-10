const logger = require('../utils/logger');
const supabase = require('../config/supabase');

/**
 * Fetch upgrade alternatives from Supabase.
 *
 * Expected Supabase table: "components"
 *   Columns: id, type (CPU|GPU|Motherboard|RAM), tier (low|mid|high), name, price, benchmark, match_score
 */
async function getAlternatives(culprit, tier) {
    if (culprit === 'None') return [];
    if (!supabase) return [];

    try {
        const { data, error } = await supabase
            .from('components')
            .select('name, price, benchmark, match_score')
            .eq('type', culprit)
            .eq('tier', tier)
            .order('match_score', { ascending: false })
            .limit(5);

        if (error) {
            logger.error('Supabase components query error', { error: error.message });
            return [];
        }

        return (data || []).map(row => ({
            name: row.name,
            price: row.price,
            benchmark: row.benchmark,
            matchScore: row.match_score,
        }));
    } catch (err) {
        logger.error('Supabase query failed', { error: err.message });
        return [];
    }
}

/**
 * Fetch a single component by ID from Supabase.
 */
async function getComponentById(id) {
    if (!supabase || !id) return null;

    try {
        const { data, error } = await supabase
            .from('components')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            logger.error('Failed to fetch component by ID', { id, error: error.message });
            return null;
        }

        return data;
    } catch (err) {
        logger.error('Failed to fetch component', { error: err.message });
        return null;
    }
}

/**
 * Get min/max benchmark scores for a component type from Supabase.
 * Used by the bottleneck algorithm for percentile normalization.
 */
async function getScoreRange(type) {
    if (!supabase) return { min: 0, max: 1 };

    try {
        const { data, error } = await supabase
            .from('components')
            .select('benchmark')
            .eq('type', type)
            .order('benchmark', { ascending: true });

        if (error || !data || data.length === 0) {
            logger.error('Failed to fetch score range from Supabase', { type, error: error?.message });
            return { min: 0, max: 1 };
        }

        return {
            min: data[0].benchmark,
            max: data[data.length - 1].benchmark,
        };
    } catch (err) {
        logger.error('Failed to fetch score range', { error: err.message });
        return { min: 0, max: 1 };
    }
}

/**
 * Save a calculation result to Supabase for analytics / history.
 *
 * Expected Supabase table: "calculations"
 *   Columns: id, cpu_score, gpu_score, bottleneck_percent, severity, culprit, created_at
 */
async function saveCalculation({ cpuScore, gpuScore, bottleneckPercent, severity, culprit }) {
    if (!supabase) return null;

    try {
        const { data, error } = await supabase
            .from('calculations')
            .insert({
                cpu_score: cpuScore,
                gpu_score: gpuScore,
                bottleneck_percent: bottleneckPercent,
                severity,
                culprit,
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to save calculation to Supabase', { error: error.message });
            return null;
        }

        logger.debug('Calculation saved to Supabase', { id: data?.id });
        return data;
    } catch (err) {
        // Non-critical — don't break the response if saving fails
        logger.error('Failed to save calculation to Supabase', { error: err.message });
        return null;
    }
}

/**
 * Get recent calculation history from Supabase.
 */
async function getCalculationHistory(limit = 20) {
    if (!supabase) return [];

    try {
        const { data, error } = await supabase
            .from('calculations')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('Failed to fetch calculation history', { error: error.message });
            return [];
        }

        return data || [];
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
