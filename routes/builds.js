const express = require('express');
const { body, validationResult } = require('express-validator');
const Build = require('../models/Build');
const Component = require('../models/Component');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function mapComponent(row) {
    if (!row) return null;
    return {
        id: row._id,
        name: row.name,
        type: (row.type || '').toLowerCase(),
        performanceScore: row.benchmark ?? 0,
        price: typeof row.price === 'string'
            ? parseFloat(row.price.replace(/[^0-9.]/g, '')) || 0
            : row.price ?? 0,
        imageUrl: null,
    };
}

router.get('/', requireAuth, async (req, res, next) => {
    try {
        const builds = await Build.find({ user_id: req.user.id })
            .sort({ created_at: -1 })
            .lean();

        const componentIds = new Set();
        for (const b of builds) {
            if (b.cpu_id) componentIds.add(b.cpu_id.toString());
            if (b.gpu_id) componentIds.add(b.gpu_id.toString());
            if (b.ram_id) componentIds.add(b.ram_id.toString());
            if (b.motherboard_id) componentIds.add(b.motherboard_id.toString());
        }

        let componentsById = {};
        if (componentIds.size > 0) {
            const compRows = await Component.find({ _id: { $in: Array.from(componentIds) } }).lean();
            for (const row of compRows) {
                componentsById[row._id.toString()] = row;
            }
        }

        const result = builds.map((row) => ({
            id: row._id,
            name: row.build_name,
            cpu: row.cpu_id ? mapComponent(componentsById[row.cpu_id.toString()]) : null,
            gpu: row.gpu_id ? mapComponent(componentsById[row.gpu_id.toString()]) : null,
            ram: row.ram_id ? mapComponent(componentsById[row.ram_id.toString()]) : null,
            motherboard: row.motherboard_id ? mapComponent(componentsById[row.motherboard_id.toString()]) : null,
            bottleneckPercentage: row.bottleneck_percentage ?? 0,
            createdAt: row.created_at,
        }));

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

const validateBuild = [
    body('name').isString().withMessage('name is required'),
];

router.post('/', requireAuth, validateBuild, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
        }

        const { name, cpuId, gpuId, ramId, motherboardId, bottleneckPercentage } = req.body;

        const build = await Build.create({
            build_name: name,
            cpu_id: cpuId || null,
            gpu_id: gpuId || null,
            ram_id: ramId || null,
            motherboard_id: motherboardId || null,
            bottleneck_percentage: bottleneckPercentage ?? 0,
            user_id: req.user.id,
        });

        logger.info('Build saved', { id: build._id, name });
        res.status(201).json({ success: true, data: build });
    } catch (err) {
        next(err);
    }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await Build.deleteOne({ _id: id, user_id: req.user.id });

        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, error: 'Build not found or not authorized' });
        }

        logger.info('Build deleted', { id });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
