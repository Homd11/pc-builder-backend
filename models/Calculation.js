const mongoose = require('mongoose');

const calculationSchema = new mongoose.Schema({
    cpu_score: { type: Number, required: true },
    gpu_score: { type: Number, required: true },
    bottleneck_percent: { type: Number, required: true },
    severity: { type: String, required: true },
    culprit: { type: String, required: true },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

calculationSchema.index({ created_at: -1 });

module.exports = mongoose.model('Calculation', calculationSchema);
