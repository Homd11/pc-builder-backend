const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const { createUserClient } = require('../config/supabaseUser');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();


/**
 * Helper: look up a component row by ID and map to the frontend shape.
 */
function mapComponent(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        type: (row.type || '').toLowerCase(),
        performanceScore: row.benchmark ?? row.performance_score ?? 0,
        price: typeof row.price === 'string'
            ? parseFloat(row.price.replace(/[^0-9.]/g, '')) || 0
            : row.price ?? 0,
        imageUrl: row.image_url ?? null,
    };
}

/**
 * GET /api/builds
 * Returns the authenticated user's saved builds.
 * Each build has its component IDs resolved into full component objects.
 */
router.get('/', requireAuth, async (req, res, next) => {
    try {
        const userDb = createUserClient(req.token);
        if (!userDb) {
            return res.status(503).json({ success: false, error: 'Database not configured' });
        }

        // Fetch builds for the authenticated user only
        const { data: builds, error: buildsError } = await userDb
            .from('builds')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (buildsError) {
            logger.error('Failed to fetch builds', { error: buildsError.message });
            return res.status(500).json({ success: false, error: 'Failed to fetch builds' });
        }

        // Collect unique component IDs to resolve
        const componentIds = new Set();
        for (const b of builds) {
            if (b.cpu_id) componentIds.add(b.cpu_id);
            if (b.gpu_id) componentIds.add(b.gpu_id);
            if (b.ram_id) componentIds.add(b.ram_id);
            if (b.motherboard_id) componentIds.add(b.motherboard_id);
        }

        // Fetch components by IDs
        let componentsById = {};
        if (componentIds.size > 0) {
            const { data: compRows, error: compError } = await supabase
                .from('components')
                .select('*')
                .in('id', Array.from(componentIds));

            if (compError) {
                logger.error('Failed to resolve component IDs', { error: compError.message });
            } else if (compRows) {
                for (const row of compRows) {
                    componentsById[row.id] = row;
                }
            }
        }

        // Map to frontend shape
        const result = builds.map((row) => ({
            id: row.id,
            name: row.build_name,
            cpu: row.cpu_id ? mapComponent(componentsById[row.cpu_id]) : null,
            gpu: row.gpu_id ? mapComponent(componentsById[row.gpu_id]) : null,
            ram: row.ram_id ? mapComponent(componentsById[row.ram_id]) : null,
            motherboard: row.motherboard_id ? mapComponent(componentsById[row.motherboard_id]) : null,
            bottleneckPercentage: row.bottleneck_percentage ?? 0,
            createdAt: row.created_at,
        }));

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/builds
 * Save a new build. Accepts: { name, cpuId, gpuId, ramId, bottleneckPercentage }
 */
const validateBuild = [
    body('name').isString().withMessage('name is required'),
];

router.post('/', requireAuth, validateBuild, async (req, res, next) => {
    try {
        const userDb = createUserClient(req.token);
        if (!userDb) {
            return res.status(503).json({ success: false, error: 'Database not configured' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
        }

        const { name, cpuId, gpuId, ramId, motherboardId, bottleneckPercentage } = req.body;

        // user_id explicitly set from the authenticated user
        const { data, error } = await userDb.from('builds').insert({
            build_name: name,
            cpu_id: cpuId ?? null,
            gpu_id: gpuId ?? null,
            ram_id: ramId ?? null,
            motherboard_id: motherboardId ?? null,
            bottleneck_percentage: bottleneckPercentage ?? 0,
            user_id: req.user.id,
        }).select().single();

        if (error) {
            logger.error('Failed to save build', { error: error.message });
            return res.status(500).json({ success: false, error: 'Failed to save build', detail: error.message });
        }

        logger.info('Build saved', { id: data.id, name });
        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/builds/:id
 * Delete a build by ID.
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
    try {
        const userDb = createUserClient(req.token);
        if (!userDb) {
            return res.status(503).json({ success: false, error: 'Database not configured' });
        }

        const { id } = req.params;

        // Only allow deleting own builds (RLS + explicit filter)
        const { error } = await userDb.from('builds').delete().eq('id', id).eq('user_id', req.user.id);

        if (error) {
            logger.error('Failed to delete build', { error: error.message });
            return res.status(500).json({ success: false, error: 'Failed to delete build' });
        }

        logger.info('Build deleted', { id });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

