const express = require('express');
const supabase = require('../config/supabase');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Map a DB row to the frontend shape (shared helper).
 */
function mapRow(row) {
    const type = (row.type || '').toLowerCase();
    const base = {
        id: row.id,
        name: row.name,
        type,
        performanceScore: row.benchmark ?? 0,
        price: typeof row.price === 'string'
            ? parseFloat(row.price.replace(/[^0-9.]/g, '')) || 0
            : row.price ?? 0,
        tier: row.tier,
        matchScore: row.match_score ?? 0,
        imageUrl: row.image_url ?? null,
    };

    // CPU-specific
    if (type === 'cpu') {
        base.socket = row.socket ?? null;
        base.memoryType = row.memory_type ?? null;
    }

    // Motherboard-specific
    if (type === 'motherboard') {
        base.socket = row.socket ?? null;
        base.chipset = row.chipset ?? null;
        base.formFactor = row.form_factor ?? null;
        base.memoryType = row.memory_type ?? null;
        base.maxMemory = row.max_memory ?? null;
    }

    // RAM-specific
    if (type === 'ram') {
        base.memoryType = row.memory_type ?? null;
        base.speed = row.speed ?? null;
        base.capacity = row.capacity ?? null;
        base.modules = row.modules ?? null;
        base.latency = row.latency ?? null;
    }

    return base;
}

/**
 * GET /api/components
 * Returns all components, grouped by type.
 */
router.get('/', async (req, res, next) => {
    try {
        if (!supabase) {
            return res.status(503).json({ success: false, error: 'Database not configured' });
        }

        const { data, error } = await supabase
            .from('components')
            .select('*')
            .order('benchmark', { ascending: false });

        if (error) {
            logger.error('Failed to fetch components', { error: error.message });
            return res.status(500).json({ success: false, error: 'Failed to fetch components' });
        }

        const grouped = { cpu: [], gpu: [], ram: [], motherboard: [] };

        for (const row of data) {
            const type = (row.type || '').toLowerCase();
            if (!grouped[type]) continue;
            grouped[type].push(mapRow(row));
        }

        res.json({ success: true, data: grouped });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/components/compatible/motherboards?socket=LGA 1700
 * Returns motherboards compatible with the given CPU socket.
 */
router.get('/compatible/motherboards', async (req, res, next) => {
    try {
        if (!supabase) {
            return res.status(503).json({ success: false, error: 'Database not configured' });
        }

        const { socket } = req.query;
        if (!socket) {
            return res.status(400).json({ success: false, error: 'socket query param is required' });
        }

        const { data, error } = await supabase
            .from('components')
            .select('*')
            .eq('type', 'Motherboard')
            .eq('socket', socket)
            .order('benchmark', { ascending: false });

        if (error) {
            logger.error('Failed to fetch compatible motherboards', { error: error.message });
            return res.status(500).json({ success: false, error: 'Failed to fetch motherboards' });
        }

        res.json({ success: true, data: (data || []).map(mapRow) });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/components/compatible/ram?memoryType=DDR5
 * Returns RAM kits compatible with the given memory type.
 */
router.get('/compatible/ram', async (req, res, next) => {
    try {
        if (!supabase) {
            return res.status(503).json({ success: false, error: 'Database not configured' });
        }

        const { memoryType } = req.query;
        if (!memoryType) {
            return res.status(400).json({ success: false, error: 'memoryType query param is required' });
        }

        const { data, error } = await supabase
            .from('components')
            .select('*')
            .eq('type', 'RAM')
            .eq('memory_type', memoryType)
            .order('benchmark', { ascending: false });

        if (error) {
            logger.error('Failed to fetch compatible RAM', { error: error.message });
            return res.status(500).json({ success: false, error: 'Failed to fetch RAM' });
        }

        res.json({ success: true, data: (data || []).map(mapRow) });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/components/compatible?cpuId=123
 * Given a CPU ID, returns only compatible motherboards and RAM.
 */
router.get('/compatible', async (req, res, next) => {
    try {
        if (!supabase) {
            return res.status(503).json({ success: false, error: 'Database not configured' });
        }

        const { cpuId } = req.query;
        if (!cpuId) {
            return res.status(400).json({ success: false, error: 'cpuId query param is required' });
        }

        // Fetch CPU to get socket and memory type
        const { data: cpu, error: cpuError } = await supabase
            .from('components')
            .select('*')
            .eq('id', cpuId)
            .eq('type', 'CPU')
            .single();

        if (cpuError || !cpu) {
            return res.status(404).json({ success: false, error: 'CPU not found' });
        }

        // Fetch compatible motherboards (same socket) and RAM (same memory type) in parallel
        const [moboResult, ramResult] = await Promise.all([
            supabase.from('components').select('*')
                .eq('type', 'Motherboard').eq('socket', cpu.socket)
                .order('benchmark', { ascending: false }),
            supabase.from('components').select('*')
                .eq('type', 'RAM').eq('memory_type', cpu.memory_type)
                .order('benchmark', { ascending: false }),
        ]);

        res.json({
            success: true,
            cpu: mapRow(cpu),
            compatibleMotherboards: (moboResult.data || []).map(mapRow),
            compatibleRam: (ramResult.data || []).map(mapRow),
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
