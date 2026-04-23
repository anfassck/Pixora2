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

// Update highlight title or cover
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { title, cover } = req.body;
    const highlight = await Highlight.findById(req.params.id);
    if (!highlight) return res.status(404).json({ message: 'Highlight not found' });
    if (highlight.user.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    
    if (title) highlight.title = title;
    if (cover) highlight.cover = cover;
    
    await highlight.save();
    res.json(highlight);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete highlight
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const highlight = await Highlight.findById(req.params.id);
    if (!highlight) return res.status(404).json({ message: 'Highlight not found' });
    if (highlight.user.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    await Highlight.findByIdAndDelete(req.params.id);
    res.json({ message: 'Highlight deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

