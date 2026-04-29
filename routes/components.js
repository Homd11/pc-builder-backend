const express = require('express');
const Component = require('../models/Component');
const logger = require('../utils/logger');

const router = express.Router();

function mapRow(row) {
    const type = (row.type || '').toLowerCase();
    const base = {
        id: row._id,
        name: row.name,
        type,
        performanceScore: row.benchmark ?? 0,
        price: typeof row.price === 'string'
            ? parseFloat(row.price.replace(/[^0-9.]/g, '')) || 0
            : row.price ?? 0,
        tier: row.tier,
        matchScore: row.match_score ?? 0,
        imageUrl: null,
    };
    if (type === 'cpu') {
        base.socket = row.socket ?? null;
        base.memoryType = row.memory_type ?? null;
    }
    if (type === 'motherboard') {
        base.socket = row.socket ?? null;
        base.chipset = row.chipset ?? null;
        base.formFactor = row.form_factor ?? null;
        base.memoryType = row.memory_type ?? null;
        base.maxMemory = row.max_memory ?? null;
    }
    if (type === 'ram') {
        base.memoryType = row.memory_type ?? null;
        base.speed = row.speed ?? null;
        base.capacity = row.capacity ?? null;
        base.modules = row.modules ?? null;
        base.latency = row.latency ?? null;
    }
    return base;
}

router.get('/', async (req, res, next) => {
    try {
        const data = await Component.find().sort({ benchmark: -1 }).lean();
        const grouped = { cpu: [], gpu: [], ram: [], motherboard: [] };
        for (const row of data) {
            const type = (row.type || '').toLowerCase();
            if (!grouped[type]) continue;
            grouped[type].push(mapRow(row));
        }
        res.json({ success: true, data: grouped });
    } catch (err) {
        logger.error('Failed to fetch components', { error: err.message });
        next(err);
    }
});

router.get('/compatible/motherboards', async (req, res, next) => {
    try {
        const { socket } = req.query;
        if (!socket) return res.status(400).json({ success: false, error: 'socket query param is required' });
        const data = await Component.find({ type: 'Motherboard', socket }).sort({ benchmark: -1 }).lean();
        res.json({ success: true, data: data.map(mapRow) });
    } catch (err) {
        logger.error('Failed to fetch compatible motherboards', { error: err.message });
        next(err);
    }
});

router.get('/compatible/ram', async (req, res, next) => {
    try {
        const { memoryType } = req.query;
        if (!memoryType) return res.status(400).json({ success: false, error: 'memoryType query param is required' });
        const data = await Component.find({ type: 'RAM', memory_type: memoryType }).sort({ benchmark: -1 }).lean();
        res.json({ success: true, data: data.map(mapRow) });
    } catch (err) {
        logger.error('Failed to fetch compatible RAM', { error: err.message });
        next(err);
    }
});

router.get('/compatible', async (req, res, next) => {
    try {
        const { cpuId } = req.query;
        if (!cpuId) return res.status(400).json({ success: false, error: 'cpuId query param is required' });
        const cpu = await Component.findById(cpuId).lean();
        if (!cpu || cpu.type !== 'CPU') return res.status(404).json({ success: false, error: 'CPU not found' });
        const [motherboards, rams] = await Promise.all([
            Component.find({ type: 'Motherboard', socket: cpu.socket }).sort({ benchmark: -1 }).lean(),
            Component.find({ type: 'RAM', memory_type: cpu.memory_type }).sort({ benchmark: -1 }).lean(),
        ]);
        res.json({
            success: true,
            cpu: mapRow(cpu),
            compatibleMotherboards: motherboards.map(mapRow),
            compatibleRam: rams.map(mapRow),
        });
    } catch (err) {
        logger.error('Failed to fetch compatible components', { error: err.message });
        next(err);
    }
});

module.exports = router;
