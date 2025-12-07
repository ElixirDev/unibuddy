const mongoose = require('mongoose');

const videoRoomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true },
  password: { type: String, default: null },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Store each participant's media state
  participantStates: [{
    odId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    video: { type: Boolean, default: false },
    audio: { type: Boolean, default: false },
    screenSharing: { type: Boolean, default: false }
  }],
  maxParticipants: { type: Number, default: 10 },
  isActive: { type: Boolean, default: true },
  settings: {
    allowVideo: { type: Boolean, default: true },
    allowAudio: { type: Boolean, default: true },
    allowScreenShare: { type: Boolean, default: true },
    allowChat: { type: Boolean, default: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('VideoRoom', videoRoomSchema);
