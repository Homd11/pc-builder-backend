/**
 * Seed script — imports CSV data into MongoDB.
 *
 * Usage:
 *   node scripts/seed.js
 *
 * Requires MONGODB_URI in .env
 */
require('dotenv').config();
// Use Google DNS to resolve MongoDB SRV records (fixes issues on some networks)
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Component = require('../models/Component');
const Calculation = require('../models/Calculation');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
}

function parseCsv(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.replace(/\r\n/g, '\n').split('\n').filter(Boolean);
    const headers = lines[0].split(',');
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (const ch of lines[i]) {
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        values.push(current.trim());

        const obj = {};
        headers.forEach((h, idx) => {
            obj[h.trim()] = values[idx] ?? '';
        });
        rows.push(obj);
    }
    return rows;
}

function toNumberOrNull(val) {
    if (val === '' || val === undefined || val === null) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
}

async function seed() {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected');

    // --- Seed Components ---
    const componentsFile = path.join(__dirname, '..', 'components_rows.csv');
    if (fs.existsSync(componentsFile)) {
        const rows = parseCsv(componentsFile);
        console.log(`📦 Seeding ${rows.length} components...`);

        // Clear existing
        await Component.deleteMany({});

        const docs = rows.map(r => ({
            _numericId: Number(r.id),
            type: r.type,
            tier: r.tier,
            name: r.name,
            price: r.price,
            benchmark: Number(r.benchmark) || 0,
            match_score: Number(r.match_score) || 0,
            socket: r.socket || null,
            chipset: r.chipset || null,
            form_factor: r.form_factor || null,
            memory_type: r.memory_type || null,
            max_memory: toNumberOrNull(r.max_memory),
            speed: toNumberOrNull(r.speed),
            capacity: toNumberOrNull(r.capacity),
            modules: r.modules || null,
            latency: r.latency || null,
        }));

        await Component.insertMany(docs);
        console.log(`✅ ${docs.length} components seeded`);
    } else {
        console.log('⚠ components_rows.csv not found, skipping');
    }

    // --- Seed Calculations ---
    const calculationsFile = path.join(__dirname, '..', 'calculations_rows.csv');
    if (fs.existsSync(calculationsFile)) {
        const rows = parseCsv(calculationsFile);
        console.log(`📦 Seeding ${rows.length} calculations...`);

        await Calculation.deleteMany({});

        const docs = rows.map(r => ({
            cpu_score: Number(r.cpu_score),
            gpu_score: Number(r.gpu_score),
            bottleneck_percent: Number(r.bottleneck_percent),
            severity: r.severity,
            culprit: r.culprit,
            created_at: r.created_at ? new Date(r.created_at) : new Date(),
        }));

        await Calculation.insertMany(docs);
        console.log(`✅ ${docs.length} calculations seeded`);
    } else {
        console.log('⚠ calculations_rows.csv not found, skipping');
    }

    console.log('\n🎉 Seeding complete!');
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
