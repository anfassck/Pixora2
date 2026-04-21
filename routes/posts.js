const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const verifyToken = require('../middleware/auth');

// GET /api/posts/search/query?q=xxx — Search for posts and reels
router.get('/search/query', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    
    // Find users matching query to include their posts
    const users = await User.find({ username: { $regex: q, $options: 'i' } }).select('_id');
    const userIds = users.map(u => u._id);

    const posts = await populatePost(
      Post.find({
        isArchived: false,
        $or: [
          { caption: { $regex: q, $options: 'i' } },
          { tags: { $in: [new RegExp(q, 'i')] } },
          { user: { $in: userIds } }
        ]
      })
    ).sort({ createdAt: -1 }).limit(30);
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const populatePost = q =>

  q.populate('user', 'username fullName avatar isPrivate')
   .populate({ path: 'comments', populate: { path: 'user', select: 'username avatar' }, options: { sort: { createdAt: -1 }, limit: 3 } });

// GET /api/posts/feed — posts from followed users + own (exclude archived)
router.get('/feed', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const feedUsers = [...user.following, user._id];
    const posts = await populatePost(
      Post.find({ user: { $in: feedUsers }, isArchived: false })
    ).sort({ createdAt: -1 }).limit(50);
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/posts/explore — public posts only (exclude archived, exclude private accounts unless viewer follows)
router.get('/explore', async (req, res) => {
  try {
    // Get requester's following list if authenticated
    let followingIds = [];
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET);
        const me = await User.findById(decoded.id).select('following _id');
        if (me) followingIds = [...me.following.map(id => id.toString()), me._id.toString()];
      } catch {}
    }

    // Get all public users + users the viewer follows
    const privateUsers = await User.find({ isPrivate: true }).select('_id');
    const privateIds   = privateUsers.map(u => u._id.toString()).filter(id => !followingIds.includes(id));

    const posts = await populatePost(
      Post.find({
        isArchived: false,
        ...(privateIds.length > 0 ? { user: { $nin: privateIds } } : {})
      })
    ).sort({ createdAt: -1 }).limit(60);

    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// GET /api/posts/reels — public video posts only
router.get('/reels', async (req, res) => {
  try {
    let followingIds = [];
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET);
        const me = await User.findById(decoded.id).select('following _id');
        if (me) followingIds = [...me.following.map(id => id.toString()), me._id.toString()];
      } catch {}
    }

    const privateUsers = await User.find({ isPrivate: true }).select('_id');
    const privateIds   = privateUsers.map(u => u._id.toString()).filter(id => !followingIds.includes(id));

    const filter = { isArchived: false, mediaType: 'video' };
    if (privateIds.length > 0) filter.user = { $nin: privateIds };

    const reels = await populatePost(Post.find(filter)).sort({ createdAt: -1 }).limit(100);
    res.json(reels);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/posts/:id/view — increment view count
router.put('/:id/view', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    post.views = (post.views || 0) + 1;
    await post.save();
    res.json({ views: post.views });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// GET /api/posts/user/:userId — user's posts (exclude archived unless it's own profile)
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const isOwn = req.user.id === req.params.userId;
    const filter = isOwn
      ? { user: req.params.userId }
      : { user: req.params.userId, isArchived: false };
    const posts = await populatePost(Post.find(filter)).sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/posts/archived — current user's archived posts
router.get('/archived', verifyToken, async (req, res) => {
  try {
    const posts = await populatePost(
      Post.find({ user: req.user.id, isArchived: true })
    ).sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/posts/saved — current user's saved posts
router.get('/saved', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('savedPosts');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const posts = await populatePost(
      Post.find({ _id: { $in: user.savedPosts }, isArchived: false })
    ).sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/posts/:id
router.get('/:id', async (req, res) => {
  try {
    const post = await populatePost(Post.findById(req.params.id));
    if (!post) return res.status(404).json({ message: 'Post not found' });
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/posts — create post (supports imageUrl, videoUrl, mediaType)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { imageUrl, videoUrl, mediaType, caption, location, tags } = req.body;
    if (!imageUrl && !videoUrl) {
      return res.status(400).json({ message: 'Image or video is required' });
    }
    const newPost = new Post({
      user: req.user.id,
      imageUrl: imageUrl || '',
      videoUrl: videoUrl || '',
      mediaType: mediaType || 'image',
      caption: caption || '',
      location: location || '',
      tags: tags || [],
    });
    await newPost.save();
    const populated = await populatePost(Post.findById(newPost._id));
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/posts/:id/like — like / unlike
router.put('/:id/like', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const idx = post.likes.indexOf(req.user.id);
    if (idx === -1) post.likes.push(req.user.id);
    else post.likes.splice(idx, 1);
    await post.save();
    res.json({ likes: post.likes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/posts/:id/save — save / unsave
router.put('/:id/save', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const idx = user.savedPosts.indexOf(req.params.id);
    if (idx === -1) user.savedPosts.push(req.params.id);
    else user.savedPosts.splice(idx, 1);
    await user.save();
    res.json({ savedPosts: user.savedPosts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/posts/:id/edit — edit caption / location
router.put('/:id/edit', verifyToken, async (req, res) => {
  try {
    const { caption, location } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.user.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    post.caption = caption ?? post.caption;
    post.location = location ?? post.location;
    await post.save();
    const populated = await populatePost(Post.findById(post._id));
    res.json(populated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/posts/:id/archive — archive / unarchive
router.put('/:id/archive', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.user.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    post.isArchived = !post.isArchived;
    await post.save();
    res.json({ isArchived: post.isArchived, _id: post._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/posts/:id/comment — add comment
router.post('/:id/comment', verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Comment text required' });
    const comment = new Comment({ post: req.params.id, user: req.user.id, text });
    await comment.save();
    const post = await Post.findById(req.params.id);
    post.comments.push(comment._id);
    await post.save();
    const populated = await Comment.findById(comment._id).populate('user', 'username avatar');
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/posts/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.user.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    await Comment.deleteMany({ post: post._id });
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted', _id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/posts/comment/:commentId — edit comment
router.put('/comment/:commentId', verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Comment text required' });
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    
    const user = await User.findById(req.user.id);
    const isOwner = comment.user.toString() === req.user.id;
    const isAdmin = user && user.isAdmin;
    
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });
    
    comment.text = text;
    await comment.save();
    const populated = await Comment.findById(comment._id).populate('user', 'username avatar');
    res.json(populated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/posts/comment/:commentId — delete comment
router.delete('/comment/:commentId', verifyToken, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    
    const user = await User.findById(req.user.id);
    const isOwner = comment.user.toString() === req.user.id;
    const isAdmin = user && user.isAdmin;
    
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });
    
    // Remove from post
    await Post.findByIdAndUpdate(comment.post, { $pull: { comments: comment._id } });
    await Comment.findByIdAndDelete(req.params.commentId);
    res.json({ message: 'Comment deleted', commentId: req.params.commentId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


module.exports = router;

