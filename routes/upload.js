const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const verifyToken = require('../middleware/auth');

// Upload single file (image or video)
// POST /api/upload/media
router.post('/media', verifyToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const isVideo = req.file.mimetype.startsWith('video/');
  const url = `/uploads/${req.file.filename}`;
  res.json({
    url,
    mediaType: isVideo ? 'video' : 'image',
    filename: req.file.filename,
    size: req.file.size,
  });
});

// Upload avatar (profile picture)
// POST /api/upload/avatar
router.post('/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const User = require('../models/User');
  const url = `/uploads/${req.file.filename}`;
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { avatar: url },
    { new: true }
  ).select('-password');
  res.json({ avatar: url, user });
});

module.exports = router;
