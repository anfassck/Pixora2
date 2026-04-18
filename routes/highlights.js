const express = require('express');
const router = express.Router();
const Highlight = require('../models/Highlight');
const verifyToken = require('../middleware/auth');

// Add story to highlight
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, storyId } = req.body;
    const highlightTitle = title || 'Highlights';
    
    let highlight = await Highlight.findOne({ user: req.user.id, title: highlightTitle });
    if (!highlight) {
      highlight = new Highlight({ user: req.user.id, title: highlightTitle, stories: [storyId] });
    } else {
      if (!highlight.stories.includes(storyId)) highlight.stories.push(storyId);
    }
    
    // Set cover to the first story if not set
    if (!highlight.cover) {
      const Story = require('../models/Story');
      const story = await Story.findById(storyId);
      if (story) highlight.cover = story.mediaUrl || story.imageUrl;
    }
    
    await highlight.save();
    res.json(highlight);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get user highlights
router.get('/user/:userId', async (req, res) => {
  try {
    const highlights = await Highlight.find({ user: req.params.userId }).populate('stories').sort({ createdAt: -1 });
    res.json(highlights);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
