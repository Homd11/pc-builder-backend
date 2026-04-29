const mongoose = require('mongoose');

const componentSchema = new mongoose.Schema({
    // Keep the original numeric ID from the CSV for backward compatibility
    _numericId: { type: Number, unique: true, index: true },
    type: {
        type: String,
        required: true,
        enum: ['CPU', 'GPU', 'Motherboard', 'RAM'],
    },
    tier: {
        type: String,
        required: true,
        enum: ['low', 'mid', 'high'],
    },
    name: { type: String, required: true },
    price: { type: String, required: true },
    benchmark: { type: Number, required: true, default: 0 },
    match_score: { type: Number, required: true, default: 0 },
    socket: { type: String, default: null },
    chipset: { type: String, default: null },
    form_factor: { type: String, default: null },
    memory_type: { type: String, default: null },
    max_memory: { type: Number, default: null },
    speed: { type: Number, default: null },
    capacity: { type: Number, default: null },
    modules: { type: String, default: null },
    latency: { type: String, default: null },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// Index for common queries
componentSchema.index({ type: 1, benchmark: -1 });
componentSchema.index({ type: 1, tier: 1, match_score: -1 });
componentSchema.index({ type: 1, socket: 1 });
componentSchema.index({ type: 1, memory_type: 1 });

module.exports = mongoose.model('Component', componentSchema);
