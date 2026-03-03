const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// ── App Setup ──
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// ── Paths ──
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// ── Ensure data directory exists ──
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '{}');

// ── Available Rooms ──
const ROOMS = [
  { id: 'general', name: 'General', icon: '💬', description: 'General discussion' },
  { id: 'random', name: 'Random', icon: '🎲', description: 'Off-topic & fun' },
  { id: 'tech-talk', name: 'Tech Talk', icon: '💻', description: 'Programming & tech' },
  { id: 'music', name: 'Music', icon: '🎵', description: 'Share your favorite tunes' },
  { id: 'gaming', name: 'Gaming', icon: '🎮', description: 'Gaming discussions' }
];

// ── Data Helpers ──
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return filePath === USERS_FILE ? [] : {};
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ── Middleware ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret: 'chatvibe-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});
app.use(sessionMiddleware);

// Share session with Socket.IO
io.engine.use(sessionMiddleware);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Middleware ──
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// ═══════════════════════════════════════
//  AUTH API
// ═══════════════════════════════════════

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 2-20 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const users = readJSON(USERS_FILE);

    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      bio: '',
      status: 'online',
      createdAt: new Date().toISOString()
    };

    users.push(user);
    writeJSON(USERS_FILE, users);

    req.session.userId = user.id;

    const { password: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.userId = user.id;

    const { password: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get('/api/me', requireAuth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

// Update profile
app.put('/api/profile', requireAuth, (req, res) => {
  const { username, bio, status } = req.body;
  const users = readJSON(USERS_FILE);
  const idx = users.findIndex(u => u.id === req.session.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  if (username) {
    const taken = users.find(u => u.id !== req.session.userId && u.username.toLowerCase() === username.toLowerCase());
    if (taken) return res.status(400).json({ error: 'Username already taken' });
    users[idx].username = username;
  }
  if (bio !== undefined) users[idx].bio = bio.slice(0, 150);
  if (status) users[idx].status = status;

  writeJSON(USERS_FILE, users);

  const { password: _, ...safeUser } = users[idx];
  res.json({ success: true, user: safeUser });
});

// Get rooms list
app.get('/api/rooms', requireAuth, (req, res) => {
  res.json({ rooms: ROOMS });
});

// Get message history for a room
app.get('/api/messages/:room', requireAuth, (req, res) => {
  const messages = readJSON(MESSAGES_FILE);
  const roomMessages = messages[req.params.room] || [];
  res.json({ messages: roomMessages.slice(-100) });
});

// ═══════════════════════════════════════
//  SOCKET.IO
// ═══════════════════════════════════════

// Track online users: { socketId: { userId, username, room } }
const onlineUsers = new Map();

function getRoomUsers(room) {
  const users = [];
  const seen = new Set();
  for (const [, data] of onlineUsers) {
    if (data.room === room && !seen.has(data.userId)) {
      seen.add(data.userId);
      users.push({ userId: data.userId, username: data.username });
    }
  }
  return users;
}

function broadcastRoomUsers(room) {
  io.to(room).emit('room users', getRoomUsers(room));
}

io.on('connection', (socket) => {
  const session = socket.request.session;
  if (!session || !session.userId) {
    socket.disconnect();
    return;
  }

  const userId = session.userId;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === userId);
  if (!user) { socket.disconnect(); return; }

  const username = user.username;

  // Join a room
  socket.on('join room', (roomId) => {
    // Leave previous room
    const prev = onlineUsers.get(socket.id);
    if (prev && prev.room) {
      socket.leave(prev.room);
      onlineUsers.delete(socket.id);
      broadcastRoomUsers(prev.room);
      socket.to(prev.room).emit('system message', { text: `${username} left the room`, room: prev.room });
    }

    // Join new room
    socket.join(roomId);
    onlineUsers.set(socket.id, { userId, username, room: roomId });
    broadcastRoomUsers(roomId);
    socket.to(roomId).emit('system message', { text: `${username} joined the room`, room: roomId });

    // Send total online count
    const uniqueUsers = new Set();
    for (const [, data] of onlineUsers) uniqueUsers.add(data.userId);
    io.emit('online count', uniqueUsers.size);
  });

  // Chat message
  socket.on('chat message', (data) => {
    const userData = onlineUsers.get(socket.id);
    if (!userData) return;

    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId,
      username,
      message: data.message.slice(0, 500),
      room: userData.room,
      timestamp: new Date().toISOString()
    };

    // Save to history
    const messages = readJSON(MESSAGES_FILE);
    if (!messages[userData.room]) messages[userData.room] = [];
    messages[userData.room].push(msg);
    // Keep only last 200 messages per room
    if (messages[userData.room].length > 200) {
      messages[userData.room] = messages[userData.room].slice(-200);
    }
    writeJSON(MESSAGES_FILE, messages);

    // Broadcast to room
    io.to(userData.room).emit('chat message', msg);
  });

  // Typing
  socket.on('typing', () => {
    const userData = onlineUsers.get(socket.id);
    if (userData) {
      socket.to(userData.room).emit('typing', { username, room: userData.room });
    }
  });

  socket.on('stop typing', () => {
    const userData = onlineUsers.get(socket.id);
    if (userData) {
      socket.to(userData.room).emit('stop typing', { room: userData.room });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const userData = onlineUsers.get(socket.id);
    if (userData) {
      onlineUsers.delete(socket.id);
      broadcastRoomUsers(userData.room);
      socket.to(userData.room).emit('system message', { text: `${username} left the room`, room: userData.room });

      const uniqueUsers = new Set();
      for (const [, data] of onlineUsers) uniqueUsers.add(data.userId);
      io.emit('online count', uniqueUsers.size);
    }
  });
});

// ── Start Server ──
server.listen(PORT, () => {
  console.log(`🚀 ChatVibe running at http://localhost:${PORT}`);
});
