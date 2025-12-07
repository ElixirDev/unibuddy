const mongoose = require('mongoose');

const matchQueueSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  region: { type: String, required: true },
  campus: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('MatchQueue', matchQueueSchema);
