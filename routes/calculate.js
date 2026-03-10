const express = require('express');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const {
    getAlternatives,
    getComponentById,
    getScoreRange,
    saveCalculation,
} = require('../services/componentService');

const router = express.Router();

// --- Cache for score ranges (refreshed from Supabase every 5 min) ---
let ranges = {};
let rangeLastFetched = 0;
const RANGE_CACHE_TTL = 5 * 60 * 1000;

async function ensureRanges() {
    const now = Date.now();
    if (ranges.CPU && ranges.GPU && ranges.RAM && (now - rangeLastFetched) < RANGE_CACHE_TTL) {
        return;
    }

    const [cpu, gpu, ram] = await Promise.all([
        getScoreRange('CPU'),
        getScoreRange('GPU'),
        getScoreRange('RAM'),
    ]);

    ranges = { CPU: cpu, GPU: gpu, RAM: ram };
    rangeLastFetched = now;

    logger.info('Score ranges loaded from Supabase', {
        cpuMin: cpu.min, cpuMax: cpu.max,
        gpuMin: gpu.min, gpuMax: gpu.max,
        ramMin: ram.min, ramMax: ram.max,
    });
}

function normalize(score, min, max) {
    if (max === min) return 50;
    const clamped = Math.max(min, Math.min(max, score));
    return ((clamped - min) / (max - min)) * 100;
}

function getSeverityTier(percent) {
    if (percent < 10) return 'Balanced';
    if (percent < 25) return 'Mild';
    if (percent < 50) return 'Moderate';
    return 'Severe';
}

function getScoreTier(score) {
    if (score < 5000) return 'low';
    if (score < 15000) return 'mid';
    return 'high';
}

// =========================================================
// POST /api/v1/calculate
//
// Accepts EITHER:
//   A) { cpuId, gpuId, ramId?, motherboardId? }  — component IDs (preferred)
//   B) { cpuScore, gpuScore }                     — raw benchmark scores (legacy)
//
// Returns bottleneck %, severity, culprit, compatibility warnings, alternatives
// =========================================================

router.post('/', async (req, res, next) => {
    try {
        const { cpuId, gpuId, ramId, motherboardId, cpuScore, gpuScore } = req.body;

        // --- Mode A: Component IDs ---
        if (cpuId && gpuId) {
            return await calculateByIds(req, res, { cpuId, gpuId, ramId, motherboardId });
        }

        // --- Mode B: Raw scores (legacy) ---
        if (cpuScore != null && gpuScore != null) {
            return await calculateByScores(req, res, Number(cpuScore), Number(gpuScore));
        }

        return res.status(400).json({
            success: false,
            errors: ['Provide either { cpuId, gpuId } or { cpuScore, gpuScore }'],
        });
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------
// Mode A — Calculate by component IDs (full features)
// -------------------------------------------------------
async function calculateByIds(req, res, { cpuId, gpuId, ramId, motherboardId }) {
    // Fetch all components in parallel
    const [cpu, gpu, ram, motherboard] = await Promise.all([
        getComponentById(cpuId),
        getComponentById(gpuId),
        ramId ? getComponentById(ramId) : null,
        motherboardId ? getComponentById(motherboardId) : null,
    ]);

    if (!cpu) return res.status(404).json({ success: false, error: 'CPU not found' });
    if (!gpu) return res.status(404).json({ success: false, error: 'GPU not found' });

    await ensureRanges();

    // --- Normalize scores ---
    const cpuNorm = normalize(cpu.benchmark, ranges.CPU.min, ranges.CPU.max);
    const gpuNorm = normalize(gpu.benchmark, ranges.GPU.min, ranges.GPU.max);

    let ramNorm = null;
    if (ram) {
        ramNorm = normalize(ram.benchmark, ranges.RAM.min, ranges.RAM.max);
    }

    // --- CPU vs GPU bottleneck ---
    let cgDiff = Math.abs(cpuNorm - gpuNorm);

    // --- RAM bottleneck ---
    let ramDiff = 0;
    let ramBottleneck = false;
    let ramSeverity = 'None';

    if (ramNorm !== null) {
        const avgCpuGpu = (cpuNorm + gpuNorm) / 2;
        ramDiff = Math.max(avgCpuGpu - ramNorm, 0);

        if (ramDiff > 30) { ramBottleneck = true; ramSeverity = 'Severe'; }
        else if (ramDiff > 20) { ramBottleneck = true; ramSeverity = 'Moderate'; }
        else if (ramDiff > 10) { ramBottleneck = true; ramSeverity = 'Mild'; }

        // Blend: 70% CPU/GPU mismatch + 30% RAM deficit
        cgDiff = (cgDiff * 0.7) + (ramDiff * 0.3);
    }

    const bottleneckPercent = Math.min(Math.round(cgDiff), 100);
    const severity = getSeverityTier(bottleneckPercent);

    // --- Determine culprit ---
    let culprit = 'None';
    let message;

    if (bottleneckPercent < 10) {
        message = 'Your build is well balanced! No significant bottleneck detected.';
    } else if (ramBottleneck && ramDiff > Math.abs(cpuNorm - gpuNorm)) {
        culprit = 'RAM';
        message = `Your RAM is holding back your system. (${bottleneckPercent}% ${severity} Bottleneck)`;
    } else if (cpuNorm < gpuNorm) {
        culprit = 'CPU';
        message = `Your CPU is holding back your GPU. (${bottleneckPercent}% ${severity} Bottleneck)`;
    } else {
        culprit = 'GPU';
        message = `Your GPU is holding back your CPU. (${bottleneckPercent}% ${severity} Bottleneck)`;
    }

    // --- Compatibility checks ---
    const compatibility = { compatible: true, warnings: [] };

    // Socket check: CPU vs Motherboard
    if (motherboard) {
        if (cpu.socket && motherboard.socket && cpu.socket !== motherboard.socket) {
            compatibility.compatible = false;
            compatibility.warnings.push(
                `Socket mismatch: ${cpu.name} uses ${cpu.socket} but ${motherboard.name} uses ${motherboard.socket}`
            );
        }

        // Memory type check: Motherboard vs RAM
        if (ram && motherboard.memory_type && ram.memory_type && motherboard.memory_type !== ram.memory_type) {
            compatibility.compatible = false;
            compatibility.warnings.push(
                `Memory type mismatch: ${motherboard.name} supports ${motherboard.memory_type} but ${ram.name} is ${ram.memory_type}`
            );
        }
    }

    // Memory type check: CPU vs RAM
    if (ram && cpu.memory_type && ram.memory_type && cpu.memory_type !== ram.memory_type) {
        compatibility.compatible = false;
        compatibility.warnings.push(
            `Memory type mismatch: ${cpu.name} supports ${cpu.memory_type} but ${ram.name} is ${ram.memory_type}`
        );
    }

    // --- Fetch upgrade alternatives for the weakest component ---
    const weakScore = culprit === 'RAM'
        ? (ram?.benchmark || 0)
        : (cpuNorm < gpuNorm ? cpu.benchmark : gpu.benchmark);
    const tier = getScoreTier(weakScore);
    const alternatives = await getAlternatives(culprit, tier);

    // Save history (non-blocking)
    saveCalculation({ cpuScore: cpu.benchmark, gpuScore: gpu.benchmark, bottleneckPercent, severity, culprit });

    const result = {
        success: true,
        bottleneckPercent,
        severity,
        culprit,
        message,
        cpuPercentile: Math.round(cpuNorm),
        gpuPercentile: Math.round(gpuNorm),
        ramPercentile: ramNorm !== null ? Math.round(ramNorm) : null,
        ramBottleneck,
        ramSeverity,
        compatibility,
        components: {
            cpu: { id: cpu.id, name: cpu.name, benchmark: cpu.benchmark, socket: cpu.socket, memoryType: cpu.memory_type },
            gpu: { id: gpu.id, name: gpu.name, benchmark: gpu.benchmark },
            ram: ram ? { id: ram.id, name: ram.name, benchmark: ram.benchmark, memoryType: ram.memory_type, speed: ram.speed } : null,
            motherboard: motherboard ? { id: motherboard.id, name: motherboard.name, socket: motherboard.socket, memoryType: motherboard.memory_type } : null,
        },
        alternatives,
    };

    logger.info('Calculation completed (ID mode)', {
        cpu: cpu.name, gpu: gpu.name,
        ram: ram?.name, motherboard: motherboard?.name,
        bottleneckPercent, severity, culprit,
        compatible: compatibility.compatible,
    });

    res.json(result);
}

// -------------------------------------------------------
// Mode B — Calculate by raw scores (legacy / backward compat)
// -------------------------------------------------------
async function calculateByScores(req, res, cpuScore, gpuScore) {
    if (cpuScore < 1 || cpuScore > 100000 || gpuScore < 1 || gpuScore > 100000) {
        return res.status(400).json({
            success: false,
            errors: ['Scores must be between 1 and 100,000'],
        });
    }

    await ensureRanges();

    const cpuNorm = normalize(cpuScore, ranges.CPU.min, ranges.CPU.max);
    const gpuNorm = normalize(gpuScore, ranges.GPU.min, ranges.GPU.max);

    const difference = Math.abs(cpuNorm - gpuNorm);
    const bottleneckPercent = Math.min(Math.round(difference), 100);
    const severity = getSeverityTier(bottleneckPercent);

    let culprit = 'None';
    let message;

    if (bottleneckPercent < 10) {
        message = 'Your build is well balanced! No significant bottleneck detected.';
    } else if (cpuNorm < gpuNorm) {
        culprit = 'CPU';
        message = `Your CPU is holding back your GPU. (${bottleneckPercent}% ${severity} Bottleneck)`;
    } else {
        culprit = 'GPU';
        message = `Your GPU is holding back your CPU. (${bottleneckPercent}% ${severity} Bottleneck)`;
    }

    const weakScore = cpuNorm < gpuNorm ? cpuScore : gpuScore;
    const tier = getScoreTier(weakScore);
    const alternatives = await getAlternatives(culprit, tier);

    saveCalculation({ cpuScore, gpuScore, bottleneckPercent, severity, culprit });

    res.json({
        success: true,
        bottleneckPercent,
        severity,
        culprit,
        message,
        cpuPercentile: Math.round(cpuNorm),
        gpuPercentile: Math.round(gpuNorm),
        alternatives,
    });
}

module.exports = router;
