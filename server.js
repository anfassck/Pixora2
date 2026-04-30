require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const http = require('http');
const { Server } = require('socket.io');

const app = express();

// Middleware - Moved CORS to the top
app.use(cors({
  origin: ["https://pixora.anfassck.online", "http://localhost:5173", "http://localhost:3000", "http://localhost:7070"],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://pixora.anfassck.online", "http://localhost:5173", "http://localhost:3000", "http://localhost:7070"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

<<<<<<< HEAD
const PORT = process.env.PORT || 7070;
=======
app.use(cors({
  origin: "https://pixora.anfassck.online",
  credentials: true
}));

const PORT = 9000;
>>>>>>> a8103e6 (local changes before pull)

// Socket.io Logic
const userSockets = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('👤 Socket connected:', socket.id);

  socket.on('register', (userId) => {
    userSockets.set(userId, socket.id);
    console.log(`✅ User ${userId} registered with socket ${socket.id}`);
    io.emit('online-users', Array.from(userSockets.keys()));
  });

  socket.on('call-user', async ({ to, from, offer, type }) => {
    console.log(`📞 Call attempt: from ${from} to ${to} (${type})`);
    const targetSocket = userSockets.get(to);
    
    // Fetch sender and receiver info for notification
    const User = require('./models/User');
    const { sendPushNotification } = require('./utils/pushNotifications');
    const [caller, receiver] = await Promise.all([
      User.findById(from).select('username'),
      User.findById(to).select('fcmToken')
    ]);

    if (targetSocket) {
      console.log(`➡️ Forwarding call to socket ${targetSocket}`);
      io.to(targetSocket).emit('incoming-call', { from, offer, type });
      socket.emit('call-status', { status: 'ringing' });
    } else {
      console.log(`⚠️ Target user ${to} is offline. Sending push notification.`);
      socket.emit('call-status', { status: 'offline' });
      
      // Send push notification if offline
      if (receiver?.fcmToken) {
        sendPushNotification(
          receiver.fcmToken,
          `Incoming ${type} call`,
          `Pixora: ${caller?.username || 'Someone'} is calling you`,
          { type: 'call', fromId: from, callType: type }
        );
      }
    }
  });

  socket.on('answer-call', ({ to, answer }) => {
    const targetSocket = userSockets.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit('call-answered', { answer });
    }
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    const targetSocket = userSockets.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit('ice-candidate', { candidate });
    }
  });

  socket.on('end-call', ({ to }) => {
    const targetSocket = userSockets.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit('call-ended');
    }
  });

  socket.on('disconnect', () => {
    let disconnectedUserId = null;
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        userSockets.delete(userId);
        break;
      }
    }
    io.emit('online-users', Array.from(userSockets.keys()));
    console.log(`❌ Socket disconnected: ${socket.id} (User: ${disconnectedUserId || 'Unknown'})`);
  });
});

// Attach Socket.io to req
app.use((req, res, next) => {
  req.io = io;
  req.userSockets = userSockets;
  next();
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Serve uploaded files (images/videos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
const authRouter          = require('./routes/auth');
const postRouter          = require('./routes/posts');
const userRouter          = require('./routes/users');
const storyRouter         = require('./routes/stories');
const uploadRouter        = require('./routes/upload');
const notificationsRouter = require('./routes/notifications');
const adminRouter         = require('./routes/admin');
const highlightsRouter    = require('./routes/highlights');
const messagesRouter      = require('./routes/messages');

app.use('/api/auth',          authRouter);
app.use('/api/posts',         postRouter);
app.use('/api/users',         userRouter);
app.use('/api/stories',       storyRouter);
app.use('/api/upload',        uploadRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin',         adminRouter);
app.use('/api/highlights',    highlightsRouter);
app.use('/api/messages',      messagesRouter);

// Serve frontend static files (production build: frontend_react/dist)
const frontendDist = path.join(__dirname, '..', 'frontend_react', 'dist');
app.use(express.static(frontendDist));
app.use('/assets', express.static(path.join(frontendDist, 'assets')));
app.get('*', (req, res) => {
  const file = path.join(frontendDist, 'index.html');
  if (require('fs').existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).json({ message: 'Frontend not built — run: npm run build inside frontend_react/' });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Pixora server running on http://localhost:${PORT}`);
});

