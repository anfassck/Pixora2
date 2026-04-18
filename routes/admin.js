const express = require('express');
const router = express.Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const Post   = require('../models/Post');
const Comment = require('../models/Comment');
const Story  = require('../models/Story');
const Notification = require('../models/Notification');
const verifyToken  = require('../middleware/auth');

/* ── Admin middleware ───────────────────── */
const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    next();
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const auth = [verifyToken, adminOnly];

/* ── Admin Login (own endpoint) ─────────── */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const user = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: email.toLowerCase() }]
    });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.isAdmin) return res.status(403).json({ message: 'This account does not have admin access' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({
      token,
      admin: {
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        isAdmin: true,
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Stats ──────────────────────────────── */
router.get('/stats', auth, async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d  = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, totalPosts, totalStories, totalVideos,
      activeToday, activeWeek, activeMonth,
      newUsersToday, newUsersWeek,
      totalLogins
    ] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments({ isArchived: false }),
      Story.countDocuments(),
      Post.countDocuments({ mediaType: 'video', isArchived: false }),
      User.countDocuments({ lastLoginAt: { $gte: last24h } }),
      User.countDocuments({ lastLoginAt: { $gte: last7d } }),
      User.countDocuments({ lastLoginAt: { $gte: lastMonth } }),
      User.countDocuments({ createdAt: { $gte: last24h } }),
      User.countDocuments({ createdAt: { $gte: last7d } }),
      User.aggregate([{ $group: { _id: null, total: { $sum: '$loginCount' } } }]),
    ]);

    res.json({
      totalUsers, totalPosts, totalStories, totalVideos,
      activeToday, activeWeek, activeMonth,
      newUsersToday, newUsersWeek,
      totalLogins: totalLogins[0]?.total || 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Users ──────────────────────────────── */
router.get('/users', auth, async (req, res) => {
  try {
    const { q = '', page = 1, limit = 15 } = req.query;
    const query = q
      ? { $or: [
          { username: { $regex: q, $options: 'i' } },
          { email:    { $regex: q, $options: 'i' } },
          { fullName: { $regex: q, $options: 'i' } }
        ] }
      : {};
    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)), // Removed select('-password') specifically to expose passwords as requested
      User.countDocuments(query),
    ]);
    const withCounts = await Promise.all(users.map(async u => {
      const postCount = await Post.countDocuments({ user: u._id, isArchived: false });
      return { ...u.toObject(), postCount };
    }));
    res.json({ users: withCounts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', auth, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ message: "Can't delete yourself" });
    const posts = await Post.find({ user: req.params.id });
    for (const p of posts) await Comment.deleteMany({ post: p._id });
    await Post.deleteMany({ user: req.params.id });
    await Story.deleteMany({ user: req.params.id });
    await Notification.deleteMany({ $or: [{ recipient: req.params.id }, { sender: req.params.id }] });
    await User.updateMany({ followers: req.params.id }, { $pull: { followers: req.params.id } });
    await User.updateMany({ following: req.params.id }, { $pull: { following: req.params.id } });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted', _id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/admin', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isAdmin = !user.isAdmin;
    await user.save();
    res.json({ isAdmin: user.isAdmin });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/privacy', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isPrivate = !user.isPrivate;
    await user.save();
    res.json({ isPrivate: user.isPrivate });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Posts ──────────────────────────────── */
router.get('/posts', auth, async (req, res) => {
  try {
    const { type = 'all', page = 1, limit = 24 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = {};
    if (type === 'video') filter.mediaType = 'video';
    if (type === 'image') filter.mediaType = { $ne: 'video' };

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate('user', 'username avatar fullName email')
        .sort({ createdAt: -1 })
        .skip(skip).limit(Number(limit)),
      Post.countDocuments(filter),
    ]);
    res.json({ posts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/posts/:id', auth, async (req, res) => {
  try {
    await Comment.deleteMany({ post: req.params.id });
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted', _id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
