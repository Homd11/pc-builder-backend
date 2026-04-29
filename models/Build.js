const mongoose = require('mongoose');

const buildSchema = new mongoose.Schema({
    build_name: { type: String, required: true },
    cpu_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Component', default: null },
    gpu_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Component', default: null },
    ram_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Component', default: null },
    motherboard_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Component', default: null },
    bottleneck_percentage: { type: Number, default: 0 },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

buildSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model('Build', buildSchema);
