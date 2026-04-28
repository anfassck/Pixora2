const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Message = require('../models/Message');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer setup for message media
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/messages');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `msg_${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

// GET /api/messages/conversations — list of users chatted with, sorted by latest message
router.get('/conversations', auth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    
    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $cond: [{ $eq: ['$sender', userId] }, '$receiver', '$sender'] },
          lastMessageAt: { $first: '$createdAt' }
        }
      },
      { $sort: { lastMessageAt: -1 } }
    ]);
    
    const User = require('../models/User');
    const populated = await User.find({ _id: { $in: conversations.map(c => c._id) } })
                                .select('_id username fullName avatar note');
                                
    const sortedUsers = conversations.map(c => 
      populated.find(u => u._id.toString() === c._id.toString())
    ).filter(Boolean);
    
    res.json(sortedUsers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/messages/unread/counts — per-user unread counts
router.get('/unread/counts', auth, async (req, res) => {
  try {
    const unread = await Message.aggregate([
      { $match: { receiver: new mongoose.Types.ObjectId(req.user.id), isRead: false } },
      { $group: { _id: '$sender', count: { $sum: 1 } } }
    ]);
    const counts = {};
    unread.forEach(u => counts[u._id] = u.count);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/messages/unread/count — total count
router.get('/unread/count', auth, async (req, res) => {
  try {
    const count = await Message.countDocuments({ 
      receiver: req.user.id, 
      isRead: false 
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// GET /api/messages/:userId  – full conversation
router.get('/:userId', auth, async (req, res) => {
  try {
    const me   = req.user.id;
    const them = req.params.userId;
    const msgs = await Message.find({
      $or: [
        { sender: me,   receiver: them },
        { sender: them, receiver: me   },
      ],
    })
    .populate('sender',   '_id username avatar')
    .populate('receiver', '_id username avatar')
    .sort({ createdAt: 1 });

    // Mark as read
    await Message.updateMany(
      { sender: them, receiver: me, isRead: false },
      { $set: { isRead: true } }
    );

    res.json(msgs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/messages/:userId  – send text message
router.post('/:userId', auth, async (req, res) => {
  try {
    const { text, mediaUrl, mediaType } = req.body;
    if (!text?.trim() && !mediaUrl) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }
    const msg = await Message.create({
      sender:    req.user.id,
      receiver:  req.params.userId,
      text:      text?.trim() || '',
      mediaUrl:  mediaUrl || '',
      mediaType: mediaType || 'text',
    });
    const populated = await msg.populate('sender', '_id username avatar');
    
    // Emit real-time message
    const targetSocket = req.userSockets.get(req.params.userId);
    if (targetSocket) {
      req.io.to(targetSocket).emit('receive-message', populated);
    } else {
      // Send push notification if offline
      const User = require('../models/User');
      const { sendPushNotification } = require('../utils/pushNotifications');
      const receiver = await User.findById(req.params.userId).select('fcmToken');
      if (receiver?.fcmToken) {
        sendPushNotification(
          receiver.fcmToken,
          `New message from ${populated.sender.username}`,
          populated.text || 'Sent an attachment',
          { type: 'chat', senderId: req.user.id }
        );
      }
    }

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/messages/:userId/media – upload image/video/voice
router.post('/:userId/media', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const fileUrl = `/uploads/messages/${req.file.filename}`;
    let mediaType = 'image';
    if (req.file.mimetype.startsWith('video/')) mediaType = 'video';
    if (req.file.mimetype.startsWith('audio/')) mediaType = 'voice';

    const msg = await Message.create({
      sender:    req.user.id,
      receiver:  req.params.userId,
      text:      '',
      mediaUrl:  fileUrl,
      mediaType,
    });
    const populated = await msg.populate('sender', '_id username avatar');

    // Emit real-time message
    const targetSocket = req.userSockets.get(req.params.userId);
    if (targetSocket) {
      req.io.to(targetSocket).emit('receive-message', populated);
    } else {
      // Send push notification if offline
      const User = require('../models/User');
      const { sendPushNotification } = require('../utils/pushNotifications');
      const receiver = await User.findById(req.params.userId).select('fcmToken');
      if (receiver?.fcmToken) {
        sendPushNotification(
          receiver.fcmToken,
          `New message from ${populated.sender.username}`,
          'Sent an attachment',
          { type: 'chat', senderId: req.user.id }
        );
      }
    }

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
