const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  is_active: { type: Boolean, default: true },
  ended_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ended_at: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);
