const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const verifyToken = require('../middleware/auth');

// GET /api/notifications/unread/count
router.get('/unread/count', verifyToken, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user.id, read: false });
    res.json({ count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/notifications — get my notifications
router.get('/', verifyToken, async (req, res) => {
  try {
    const notifs = await Notification.find({ recipient: req.user.id })
      .populate('sender', 'username avatar fullName')
      .populate('post', 'imageUrl mediaType')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/read-all — mark all as read
router.put('/read-all', verifyToken, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user.id, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
