const mongoose = require('mongoose');

const videoRoomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true },
  password: { type: String, default: null },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  coHosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Store each participant's media state
  participantStates: [{
    odId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    video: { type: Boolean, default: false },
    audio: { type: Boolean, default: false },
    screenSharing: { type: Boolean, default: false },
    handRaised: { type: Boolean, default: false },
    pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  // No participant limit - unlimited like Google Meet
  maxParticipants: { type: Number, default: 0 }, // 0 = unlimited
  isActive: { type: Boolean, default: true },
  settings: {
    allowVideo: { type: Boolean, default: true },
    allowAudio: { type: Boolean, default: true },
    allowScreenShare: { type: Boolean, default: true },
    allowChat: { type: Boolean, default: true },
    allowHandRaise: { type: Boolean, default: true },
    muteOnJoin: { type: Boolean, default: false },
    hostOnlyScreenShare: { type: Boolean, default: false }
  },
  // Recording support (future)
  recording: {
    isRecording: { type: Boolean, default: false },
    startedAt: { type: Date },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }
}, { timestamps: true });

module.exports = mongoose.model('VideoRoom', videoRoomSchema);
