require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 7500;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files (images/videos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

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

// Serve frontend static files (production)
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (req, res) => {
  const file = path.join(__dirname, '..', 'frontend', 'index.html');
  if (require('fs').existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).json({ message: 'Frontend not built' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Pixora server running on http://localhost:${PORT}`);
});
