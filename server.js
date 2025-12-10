require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const url = require('url');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Import Models
const { User, Room, Message, MatchQueue, VideoRoom } = require('./server/models');

// Import Universities Data
const universities = require('./server/data/universities.json');

const app = express();
const server = http.createServer(app);

// ============== CONFIG ==============
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/unibuddy';
const PORT = process.env.SERVER_PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Gemini AI Setup
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// ============== MIDDLEWARE ==============
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1] || req.cookies?.session_token;
  if (!token) return res.status(401).json({ detail: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ detail: 'User not found' });
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    return res.status(401).json({ detail: 'Invalid token' });
  }
};

const generateToken = (userId) => jwt.sign({ userId: userId.toString() }, JWT_SECRET, { expiresIn: '7d' });

// ============== AUTH ROUTES ==============
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ detail: 'All fields are required' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ detail: 'Email already registered' });

    const user = new User({ email, password, name });
    await user.save();

    const token = generateToken(user._id);
    res.cookie('session_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ user, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ detail: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ detail: 'Invalid credentials' });

    const validPassword = await user.comparePassword(password);
    if (!validPassword) return res.status(401).json({ detail: 'Invalid credentials' });

    const token = generateToken(user._id);
    res.cookie('session_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ user, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ detail: 'Login failed' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ detail: 'Google credential required' });

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ email, name, picture, oauth_provider: 'google', oauth_id: googleId });
      await user.save();
    } else {
      user.name = name;
      user.picture = picture;
      if (!user.oauth_provider) { user.oauth_provider = 'google'; user.oauth_id = googleId; }
      await user.save();
    }

    const token = generateToken(user._id);
    res.cookie('session_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ user, token });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ detail: 'Google authentication failed' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => res.json({ user: req.user }));
app.post('/api/auth/logout', authenticateToken, (req, res) => { res.clearCookie('session_token'); res.json({ message: 'Logged out successfully' }); });

// ============== PROFILE ROUTES ==============
app.get('/api/profile', authenticateToken, (req, res) => res.json({ user: req.user }));

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { region, campus, is_anonymous_mode } = req.body;
    const updates = {};
    if (region !== undefined) updates.region = region;
    if (campus !== undefined) updates.campus = campus;
    if (is_anonymous_mode !== undefined) updates.is_anonymous_mode = is_anonymous_mode;

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    res.json({ user });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ detail: 'Failed to update profile' });
  }
});

// ============== UNIVERSITIES ==============
app.get('/api/universities', (req, res) => res.json({ universities }));

// ============== VIDEO ROOMS ==============
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

app.post('/api/video-rooms', authenticateToken, async (req, res) => {
  try {
    const { name, password, maxParticipants, settings } = req.body;
    if (!name) return res.status(400).json({ detail: 'Room name is required' });

    let code = generateRoomCode();
    while (await VideoRoom.findOne({ code })) {
      code = generateRoomCode();
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const videoRoom = new VideoRoom({
      name, code, password: hashedPassword, host: req.userId,
      participants: [req.userId], maxParticipants: maxParticipants || 0, settings: settings || {} // 0 = unlimited
    });
    await videoRoom.save();

    res.json({ 
      room: { ...videoRoom.toObject(), password: undefined, hasPassword: !!password },
      inviteLink: `${FRONTEND_URL}/room/${code}`, code
    });
  } catch (error) {
    console.error('Create video room error:', error);
    res.status(500).json({ detail: 'Failed to create room' });
  }
});

app.get('/api/video-rooms', authenticateToken, async (req, res) => {
  try {
    const rooms = await VideoRoom.find({
      $or: [{ host: req.userId }, { participants: req.userId }], isActive: true
    }).populate('host', 'name picture').sort({ createdAt: -1 });
    res.json({ rooms: rooms.map(r => ({ ...r.toObject(), password: undefined, hasPassword: !!r.password })) });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to get rooms' });
  }
});

app.post('/api/video-rooms/join', authenticateToken, async (req, res) => {
  try {
    const { code, password } = req.body;
    if (!code) return res.status(400).json({ detail: 'Room code is required' });

    const room = await VideoRoom.findOne({ code: code.toUpperCase(), isActive: true });
    if (!room) return res.status(404).json({ detail: 'Room not found' });

    if (room.password) {
      if (!password) return res.status(401).json({ detail: 'Password required', requiresPassword: true });
      const validPassword = await bcrypt.compare(password, room.password);
      if (!validPassword) return res.status(401).json({ detail: 'Invalid password' });
    }

    // Only check limit if maxParticipants > 0 (0 = unlimited)
    if (room.maxParticipants > 0 && room.participants.length >= room.maxParticipants) {
      return res.status(400).json({ detail: 'Room is full' });
    }

    if (!room.participants.some(p => p.equals(req.userId))) {
      room.participants.push(req.userId);
      await room.save();
    }

    await room.populate('host', 'name picture');
    await room.populate('participants', 'name picture');
    res.json({ room: { ...room.toObject(), password: undefined, hasPassword: !!room.password } });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ detail: 'Failed to join room' });
  }
});

app.get('/api/video-rooms/:code', authenticateToken, async (req, res) => {
  try {
    const room = await VideoRoom.findOne({ code: req.params.code.toUpperCase(), isActive: true })
      .populate('host', 'name picture').populate('participants', 'name picture');
    if (!room) return res.status(404).json({ detail: 'Room not found' });

    const isParticipant = room.participants.some(p => p._id.equals(req.userId));
    res.json({ 
      room: { ...room.toObject(), password: undefined, hasPassword: !!room.password, isParticipant, isHost: room.host._id.equals(req.userId) }
    });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to get room' });
  }
});

app.post('/api/video-rooms/:code/leave', authenticateToken, async (req, res) => {
  try {
    const room = await VideoRoom.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ detail: 'Room not found' });

    if (room.host.equals(req.userId)) {
      room.isActive = false;
      await room.save();
      return res.json({ message: 'Room ended' });
    }

    room.participants = room.participants.filter(p => !p.equals(req.userId));
    // Remove participant state when leaving
    room.participantStates = room.participantStates.filter(ps => !ps.odId.equals(req.userId));
    await room.save();
    res.json({ message: 'Left room' });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to leave room' });
  }
});

// Save/Get media state for a participant
app.post('/api/video-rooms/:code/media-state', authenticateToken, async (req, res) => {
  try {
    const { video, audio, screenSharing } = req.body;
    const room = await VideoRoom.findOne({ code: req.params.code.toUpperCase(), isActive: true });
    if (!room) return res.status(404).json({ detail: 'Room not found' });

    // Find or create participant state
    const stateIndex = room.participantStates.findIndex(ps => ps.odId.equals(req.userId));
    if (stateIndex >= 0) {
      if (video !== undefined) room.participantStates[stateIndex].video = video;
      if (audio !== undefined) room.participantStates[stateIndex].audio = audio;
      if (screenSharing !== undefined) room.participantStates[stateIndex].screenSharing = screenSharing;
    } else {
      room.participantStates.push({
        odId: req.userId,
        video: video ?? false,
        audio: audio ?? false,
        screenSharing: screenSharing ?? false
      });
    }
    await room.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to save media state' });
  }
});

app.get('/api/video-rooms/:code/media-state', authenticateToken, async (req, res) => {
  try {
    const room = await VideoRoom.findOne({ code: req.params.code.toUpperCase(), isActive: true });
    if (!room) return res.status(404).json({ detail: 'Room not found' });

    const state = room.participantStates.find(ps => ps.odId.equals(req.userId));
    res.json({ state: state || { video: false, audio: false, screenSharing: false } });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to get media state' });
  }
});

// ============== MATCHING ==============
app.post('/api/match/find', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    if (!user.region || !user.campus) return res.status(400).json({ detail: 'Please set your region and campus first' });

    const existingRoom = await Room.findOne({ users: req.userId, is_active: true });
    if (existingRoom) return res.json({ status: 'matched', room_id: existingRoom._id });

    const waitingUser = await MatchQueue.findOne({ user: { $ne: req.userId }, region: user.region, campus: user.campus }).sort({ createdAt: 1 });

    if (waitingUser) {
      await MatchQueue.deleteOne({ _id: waitingUser._id });
      await MatchQueue.deleteOne({ user: req.userId });
      const room = new Room({ users: [req.userId, waitingUser.user] });
      await room.save();
      return res.json({ status: 'matched', room_id: room._id });
    } else {
      await MatchQueue.findOneAndUpdate({ user: req.userId }, { user: req.userId, region: user.region, campus: user.campus }, { upsert: true, new: true });
      return res.json({ status: 'waiting' });
    }
  } catch (error) {
    console.error('Match error:', error);
    res.status(500).json({ detail: 'Matching failed' });
  }
});

app.delete('/api/match/cancel', authenticateToken, async (req, res) => {
  try {
    await MatchQueue.deleteOne({ user: req.userId });
    res.json({ message: 'Matching cancelled' });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to cancel matching' });
  }
});

// ============== CHAT ==============
const roomConnections = new Map();

app.get('/api/chat/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ detail: 'Room not found' });
    if (!room.users.some(u => u.equals(req.userId))) return res.status(403).json({ detail: 'Not authorized' });

    const messages = await Message.find({ room: roomId }).populate('sender', 'name picture is_anonymous_mode').sort({ createdAt: 1 });
    const formattedMessages = messages.map(msg => ({
      message_id: msg._id, room_id: msg.room, sender_id: msg.sender._id, content: msg.content,
      message_type: msg.message_type, is_anonymous: msg.is_anonymous, timestamp: msg.createdAt,
      sender_name: msg.is_anonymous ? null : msg.sender.name, sender_picture: msg.is_anonymous ? null : msg.sender.picture
    }));
    res.json({ messages: formattedMessages });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to get messages' });
  }
});

app.post('/api/chat/:roomId/end', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ detail: 'Room not found' });
    if (!room.users.some(u => u.equals(req.userId))) return res.status(403).json({ detail: 'Not authorized' });

    room.is_active = false;
    room.ended_by = req.userId;
    room.ended_at = new Date();
    await room.save();

    const connections = roomConnections.get(roomId);
    if (connections) {
      for (const [odId, ws] of connections) {
        if (odId !== req.userId.toString() && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'chat_ended' }));
        }
      }
    }
    res.json({ message: 'Chat ended' });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to end chat' });
  }
});

// ============== HEALTH CHECK ==============
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ============== ONLINE USERS ==============
const onlineUsers = new Map();

app.post('/api/stats/heartbeat', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1] || req.cookies?.session_token;
    
    let odId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        odId = decoded.userId;
      } catch (e) {}
    }
    
    const visitorId = odId || req.body.visitorId || req.ip;
    onlineUsers.set(visitorId, { timestamp: Date.now(), odId });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of onlineUsers) {
    if (now - data.timestamp > 60000) onlineUsers.delete(id);
  }
}, 30000);

app.get('/api/stats/online', async (req, res) => {
  let loggedInCount = 0;
  for (const [, data] of onlineUsers) {
    if (data.odId) loggedInCount++;
  }
  
  let wsConnections = 0;
  for (const [, connections] of roomConnections) {
    wsConnections += connections.size;
  }
  
  let queueCount = 0;
  try { queueCount = await MatchQueue.countDocuments(); } catch (e) {}
  
  const totalOnline = Math.max(loggedInCount, wsConnections) + queueCount;
  res.json({ online: totalOnline, inQueue: queueCount, loggedIn: loggedInCount });
});


// ============== AI CHAT ASSISTANT (Gemini) ==============
// Rate limiting for AI endpoint
const aiRateLimits = new Map();
const AI_RATE_LIMIT = {
  maxRequests: 10,      // Max requests per window
  windowMs: 60000,      // 1 minute window
  retryAfterMs: 30000   // Suggest retry after 30 seconds
};

const checkAIRateLimit = (sessionId) => {
  const now = Date.now();
  const key = sessionId || 'anonymous';
  
  if (!aiRateLimits.has(key)) {
    aiRateLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: AI_RATE_LIMIT.maxRequests - 1 };
  }
  
  const limit = aiRateLimits.get(key);
  
  // Reset window if expired
  if (now - limit.windowStart > AI_RATE_LIMIT.windowMs) {
    aiRateLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: AI_RATE_LIMIT.maxRequests - 1 };
  }
  
  // Check if over limit
  if (limit.count >= AI_RATE_LIMIT.maxRequests) {
    const retryAfter = Math.ceil((limit.windowStart + AI_RATE_LIMIT.windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }
  
  // Increment count
  limit.count++;
  return { allowed: true, remaining: AI_RATE_LIMIT.maxRequests - limit.count };
};

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of aiRateLimits) {
    if (now - data.windowStart > AI_RATE_LIMIT.windowMs * 2) {
      aiRateLimits.delete(key);
    }
  }
}, 300000);

const SYSTEM_PROMPT = `You are BuddyBot, a friendly AI assistant for UniBuddy - a chat platform that connects Filipino university students.

About UniBuddy:
- Students can sign up with Google or email
- They select their region (Luzon, Visayas, or Mindanao) and university
- They can match with random students from the same campus
- Anonymous mode hides their name and profile picture
- Real-time chat with instant messaging

Developer Credits:
- UniBuddy was developed by Vincent Bernabe Romeo, also known as "Daisukie"
- When users ask who made/created/developed this app or system, always credit Vincent Bernabe Romeo (Daisukie)
- Be proud to mention the developer when asked!

Your personality:
- Friendly, helpful, and encouraging
- Use emojis occasionally but not excessively
- Keep responses concise (2-4 sentences usually)
- You can understand and respond in Filipino/Tagalog or English
- Focus on helping users understand and use UniBuddy
- Promote safe and respectful chatting

Safety reminders when relevant:
- Never share personal info like phone numbers or addresses
- Keep conversations respectful
- Trust your instincts - end chats if uncomfortable`;

const chatHistories = new Map();

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ detail: 'Message required' });

    const sid = sessionId || 'default';

    // Check rate limit first
    const rateCheck = checkAIRateLimit(sid);
    if (!rateCheck.allowed) {
      return res.status(429).json({ 
        response: `I'm getting a lot of questions right now! Please wait ${rateCheck.retryAfter} seconds before asking again. In the meantime, feel free to explore UniBuddy - match with students, join video rooms, or update your profile!`,
        rateLimited: true,
        retryAfter: rateCheck.retryAfter
      });
    }

    if (!genAI) {
      return res.json({ 
        response: "Hey! I'm BuddyBot. To enable my full AI capabilities, please configure the GEMINI_API_KEY. For now, I can tell you that UniBuddy helps you connect with fellow Filipino students! Sign up, pick your region and university, and start chatting!",
        remaining: rateCheck.remaining
      });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    if (!chatHistories.has(sid)) chatHistories.set(sid, []);
    const history = chatHistories.get(sid);

    const chat = model.startChat({
      history: history.map(h => ({ role: h.role, parts: [{ text: h.content }] })),
      generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
    });

    const prompt = history.length === 0 ? `${SYSTEM_PROMPT}\n\nUser message: ${message}` : message;
    const result = await chat.sendMessage(prompt);
    const response = result.response.text();

    history.push({ role: 'user', content: message });
    history.push({ role: 'model', content: response });
    if (history.length > 20) history.splice(0, 2);

    res.json({ response, remaining: rateCheck.remaining });
  } catch (error) {
    console.error('AI chat error:', error);
    
    // Handle Gemini API quota/rate limit errors specifically
    if (error.status === 429 || error.statusText === 'Too Many Requests') {
      return res.status(429).json({ 
        response: "The AI service is currently at capacity. Please try again in a few minutes! While you wait, why not explore UniBuddy's features - match with fellow students or join a video room!",
        rateLimited: true,
        retryAfter: 60
      });
    }
    
    res.json({ response: "Oops! I'm having a little trouble right now. But I can still help! UniBuddy lets you chat with fellow students from Philippine universities. Just sign up, pick your school, and start connecting!" });
  }
});

// ============== WEBSOCKET ==============
const wss = new WebSocket.Server({ noServer: true });
const videoRoomConnections = new Map();

// Handle WebSocket upgrade manually to support dynamic paths
server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;
  if (pathname.startsWith('/api/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (ws, req) => {
  const parsedUrl = url.parse(req.url, true);
  const pathParts = parsedUrl.pathname.split('/');
  const roomId = pathParts[pathParts.length - 1];
  const token = parsedUrl.query.token;
  const roomType = parsedUrl.query.type;

  if (!token || !roomId) { ws.close(1008, 'Missing token or room ID'); return; }

  let odId;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    odId = decoded.userId;
  } catch (error) { ws.close(1008, 'Invalid token'); return; }

  const user = await User.findById(odId);
  if (!user) { ws.close(1008, 'User not found'); return; }

  // Handle Video Room WebSocket
  if (roomType === 'video') {
    const videoRoom = await VideoRoom.findOne({ code: roomId.toUpperCase(), isActive: true });
    if (!videoRoom || !videoRoom.participants.some(p => p.equals(odId))) {
      ws.close(1008, 'Not authorized');
      return;
    }

    if (!videoRoomConnections.has(roomId)) videoRoomConnections.set(roomId, new Map());
    const roomConns = videoRoomConnections.get(roomId);
    const odIdStr = odId.toString();
    
    roomConns.set(odIdStr, { 
      ws, user: { _id: odIdStr, name: user.name, picture: user.picture },
      mediaState: { video: false, audio: false, speaking: false, screenSharing: false }
    });

    // Build participants list with string IDs
    const participantsList = [];
    for (const [odId, conn] of roomConns) {
      participantsList.push({ _id: odId, name: conn.user.name, picture: conn.user.picture, mediaState: conn.mediaState });
    }
    
    // Broadcast to all connected users
    for (const [odId, conn] of roomConns) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify({ type: 'participants_update', participants: participantsList, event: 'user_joined', odId: odIdStr, userName: user.name }));
      }
    }

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        const roomConns = videoRoomConnections.get(roomId);
        if (!roomConns) return;

        switch (msg.type) {
          case 'chat_message':
            for (const [uid, conn] of roomConns) {
              if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(JSON.stringify({ type: 'chat_message', sender: { _id: user._id, name: user.name, picture: user.picture }, content: msg.content, timestamp: new Date().toISOString() }));
              }
            }
            break;
          case 'media_state':
            const userConn = roomConns.get(odIdStr);
            if (userConn) {
              userConn.mediaState = { ...userConn.mediaState, ...msg.state };
              // Broadcast to ALL users so everyone sees the updated state
              for (const [uid, conn] of roomConns) {
                if (conn.ws.readyState === WebSocket.OPEN) {
                  conn.ws.send(JSON.stringify({ type: 'media_state_update', odId: odIdStr, state: userConn.mediaState }));
                }
              }
            }
            break;
          case 'speaking':
            // Update speaking state in connection
            const speakingConn = roomConns.get(odIdStr);
            if (speakingConn) {
              speakingConn.mediaState.speaking = msg.speaking;
            }
            // Broadcast to ALL users (including sender for consistency)
            for (const [uid, conn] of roomConns) {
              if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(JSON.stringify({ type: 'speaking', odId: odIdStr, speaking: msg.speaking }));
              }
            }
            break;
          case 'hand_raised':
            // Broadcast hand raise to all users
            for (const [uid, conn] of roomConns) {
              if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(JSON.stringify({ 
                  type: 'hand_raised', 
                  odId: odIdStr, 
                  userName: user.name,
                  raised: msg.raised 
                }));
              }
            }
            break;
          case 'screen_share_started':
            for (const [uid, conn] of roomConns) {
              if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(JSON.stringify({ type: 'screen_share_started', odId: odIdStr, userName: user.name }));
              }
            }
            break;
          case 'screen_share_stopped':
            for (const [uid, conn] of roomConns) {
              if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(JSON.stringify({ type: 'screen_share_stopped', odId: odIdStr }));
              }
            }
            break;
          case 'room_ended':
            for (const [uid, conn] of roomConns) {
              if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(JSON.stringify({ type: 'room_ended', by: user.name }));
              }
            }
            videoRoomConnections.delete(roomId);
            break;
          
          // WebRTC Signaling
          case 'webrtc_signal':
            const targetIdStr = msg.targetId?.toString();
            const targetConn = roomConns.get(targetIdStr);
            if (targetConn && targetConn.ws.readyState === WebSocket.OPEN) {
              targetConn.ws.send(JSON.stringify({
                type: 'webrtc_signal',
                signalType: msg.signalType,
                senderId: odIdStr,
                sdp: msg.sdp,
                candidate: msg.candidate
              }));
            }
            break;
        }
      } catch (error) { console.error('Video room WebSocket error:', error); }
    });

    ws.on('close', async () => {
      const roomConns = videoRoomConnections.get(roomId);
      if (roomConns) {
        roomConns.delete(odIdStr);
        const participantsList = [];
        for (const [odId, conn] of roomConns) {
          participantsList.push({ _id: odId, name: conn.user.name, picture: conn.user.picture, mediaState: conn.mediaState });
        }
        for (const [uid, conn] of roomConns) {
          if (conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.send(JSON.stringify({ type: 'participants_update', participants: participantsList, event: 'user_left', odId: odIdStr, userName: user.name }));
          }
        }
        if (roomConns.size === 0) videoRoomConnections.delete(roomId);
      }
    });
    return;
  }

  // Handle Chat Room WebSocket
  const room = await Room.findById(roomId);
  if (!room || !room.users.some(u => u.equals(odId))) { ws.close(1008, 'Not authorized'); return; }

  if (!roomConnections.has(roomId)) roomConnections.set(roomId, new Map());
  roomConnections.get(roomId).set(odId, ws);

  ws.on('message', async (data) => {
    try {
      const messageData = JSON.parse(data);
      if (messageData.content) {
        const message = new Message({ room: roomId, sender: odId, content: messageData.content, message_type: messageData.type || 'text', is_anonymous: user.is_anonymous_mode });
        await message.save();
        const formattedMessage = { message_id: message._id, room_id: roomId, sender_id: odId, content: message.content, message_type: message.message_type, is_anonymous: message.is_anonymous, timestamp: message.createdAt, sender_name: message.is_anonymous ? null : user.name, sender_picture: message.is_anonymous ? null : user.picture };
        const connections = roomConnections.get(roomId);
        if (connections) {
          for (const [uid, socket] of connections) {
            if (uid !== odId && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'message', message: formattedMessage }));
            }
          }
        }
      }
    } catch (error) { console.error('WebSocket message error:', error); }
  });

  ws.on('close', () => {
    const connections = roomConnections.get(roomId);
    if (connections) { connections.delete(odId); if (connections.size === 0) roomConnections.delete(roomId); }
  });
});

// ============== START SERVER ==============
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
