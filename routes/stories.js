const express = require('express');
const router  = express.Router();
const Story   = require('../models/Story');
const User    = require('../models/User');
const verifyToken = require('../middleware/auth');

/* ── GET /api/stories
   Returns two things:
   1. groups[]  — stories from followed users (for the stories bar)
   2. myStories — current user's own stories (so "Your Story" ring shows gradient)
─────────────────────────── */
router.get('/', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const twentyFourHoursAgo = new Date(Date.now() - 86400000);
    // Only followed users' stories (NOT own) that are < 24h old
    const followedStories = await Story.find({ 
      user: { $in: user.following },
      createdAt: { $gt: twentyFourHoursAgo }
    })
      .populate('user', 'username fullName avatar')
      .sort({ createdAt: -1 });

    // Group by user
    const grouped = {};
    followedStories.forEach(story => {
      const uid = story.user._id.toString();
      if (!grouped[uid]) grouped[uid] = { user: story.user, stories: [], hasUnviewed: false };
      grouped[uid].stories.push(story);
      if (!story.viewers.includes(req.user.id)) grouped[uid].hasUnviewed = true;
    });

    // Own stories (< 24h old)
    const myStories = await Story.find({ 
      user: req.user.id,
      createdAt: { $gt: twentyFourHoursAgo }
    })
      .populate('user', 'username fullName avatar')
      .sort({ createdAt: -1 });

    res.json({
      groups:    Object.values(grouped),
      myStories: myStories,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /api/stories/archive — past stories for highlights */
router.get('/archive', verifyToken, async (req, res) => {
  try {
    const archived = await Story.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(archived);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── POST /api/stories — create */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { imageUrl, mediaUrl, mediaType, caption, duration } = req.body;
    const url = mediaUrl || imageUrl;
    if (!url) return res.status(400).json({ message: 'Media URL required' });
    const story = new Story({
      user:      req.user.id,
      imageUrl:  url,
      mediaUrl:  url,
      mediaType: mediaType || 'image',
      caption:   caption || '',
      duration:  duration || 5,
    });
    await story.save();
    const populated = await Story.findById(story._id).populate('user', 'username fullName avatar');
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── PUT /api/stories/:id/view */
router.put('/:id/view', verifyToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    await Story.findByIdAndUpdate(req.params.id, { 
      $addToSet: { viewers: req.user.id } 
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── DELETE /api/stories/:id */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (story.user.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    await Story.findByIdAndDelete(req.params.id);
    res.json({ message: 'Story deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── PUT /api/stories/:id/like — toggle like */
router.put('/:id/like', verifyToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    const idx = story.likes.indexOf(req.user.id);
    if (idx === -1) story.likes.push(req.user.id);
    else            story.likes.splice(idx, 1);
    await story.save();
    res.json({ likes: story.likes.length, liked: idx === -1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/stories/:id/likers — who liked
router.get('/:id/likers', verifyToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id).populate('likes', 'username fullName avatar');
    if (!story) return res.status(404).json({ message: 'Story not found' });
    res.json(story.likes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /api/stories/:id/viewers — who viewed (owner only) */
router.get('/:id/viewers', verifyToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id).populate('viewers', 'username avatar');
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (story.user.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    res.json({ count: story.viewers.length, viewers: story.viewers });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /api/stories/user/:userId — active stories for profile view */
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 86400000);
    const stories = await Story.find({ 
      user: req.params.userId,
      createdAt: { $gt: twentyFourHoursAgo }
    })
      .populate('user', 'username fullName avatar')
      .sort({ createdAt: 1 });
    res.json(stories);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
