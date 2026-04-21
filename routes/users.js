const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const verifyToken = require('../middleware/auth');

// GET /api/users/search/query?q=xxx
router.get('/search/query', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { fullName:  { $regex: q, $options: 'i' } }
      ]
    }).select('username fullName avatar isPrivate note').limit(20);
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/users/me — current user full profile

router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/users/suggestions/list — suggested users (not yet following)
router.get('/suggestions/list', verifyToken, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const users = await User.find({
      _id: { $nin: [...currentUser.following, currentUser._id] }
    }).select('username fullName avatar isPrivate').limit(10);
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/users/all — all users except self (for messages list)
router.get('/all', verifyToken, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select('username fullName avatar isPrivate note')
      .sort({ username: 1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// GET /api/users/id/:id — get user by MongoDB ID
router.get('/id/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('followers', '_id username avatar')
      .populate('following', '_id username avatar');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const postCount = await Post.countDocuments({ user: user._id, isArchived: false });
    res.json({ ...user.toObject(), postCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/users/:username — get user by username
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password')
      .populate('followers', 'username fullName avatar')
      .populate('following', 'username fullName avatar');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const postCount = await Post.countDocuments({ user: user._id, isArchived: false });
    res.json({ ...user.toObject(), postCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/edit — update profile (username, fullName, bio, website, avatar, isPrivate)
router.put('/edit', verifyToken, async (req, res) => {
  try {
    const { username, fullName, bio, website, avatar, isPrivate } = req.body;
    
    // Check if username is taken
    if (username) {
      const existingUser = await User.findOne({ username: username.toLowerCase(), _id: { $ne: req.user.id } });
      if (existingUser) return res.status(400).json({ message: 'Username is already taken' });
    }

    const updates = {};
    if (username !== undefined)  updates.username = username.toLowerCase().trim();
    if (fullName !== undefined)  updates.fullName = fullName;
    if (bio !== undefined)       updates.bio = bio;
    if (website !== undefined)   updates.website = website;
    if (avatar !== undefined)    updates.avatar = avatar;
    if (isPrivate !== undefined) updates.isPrivate = isPrivate;

    const user = await User.findByIdAndUpdate(
      req.user.id, updates, { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// PUT /api/users/:id/follow — follow / unfollow with privacy check
router.put('/:id/follow', verifyToken, async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }
    const userToFollow = await User.findById(req.params.id);
    const currentUser  = await User.findById(req.user.id);
    if (!userToFollow) return res.status(404).json({ message: 'User not found' });

    const isFollowing = currentUser.following.includes(req.params.id);
    const isRequested = userToFollow.followRequests.includes(req.user.id);
    let statusAction = '';

    if (isFollowing) {
      currentUser.following.pull(req.params.id);
      userToFollow.followers.pull(req.user.id);
      statusAction = 'unfollowed';
    } else if (isRequested) {
      userToFollow.followRequests.pull(req.user.id);
      statusAction = 'unrequested';
    } else {
      if (userToFollow.isPrivate) {
        userToFollow.followRequests.push(req.user.id);
        statusAction = 'requested';
      } else {
        currentUser.following.push(req.params.id);
        userToFollow.followers.push(req.user.id);
        statusAction = 'followed';
      }
    }
    
    await currentUser.save();
    await userToFollow.save();

    // Create / remove follow notification
    if (statusAction === 'followed') {
      const exists = await Notification.findOne({ recipient: req.params.id, sender: req.user.id, type: 'follow' });
      if (!exists) {
        await Notification.create({ recipient: req.params.id, sender: req.user.id, type: 'follow' });
      }
    } else if (statusAction === 'requested') {
      const exists = await Notification.findOne({ recipient: req.params.id, sender: req.user.id, type: 'follow_request' });
      if (!exists) {
        await Notification.create({ recipient: req.params.id, sender: req.user.id, type: 'follow_request' });
      }
    } else if (statusAction === 'unfollowed' || statusAction === 'unrequested') {
      await Notification.deleteOne({ recipient: req.params.id, sender: req.user.id, type: { $in: ['follow', 'follow_request'] } });
    }

    res.json({
      isFollowing: currentUser.following.includes(req.params.id),
      isRequested: userToFollow.followRequests.includes(req.user.id),
      followers: userToFollow.followers.length,
      isPrivate: userToFollow.isPrivate,
      statusAction
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id/accept-follow — accept a pending follow request
router.put('/:id/accept-follow', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const requester = await User.findById(req.params.id);
    if (!requester || !user) return res.status(404).json({ message: 'User not found' });
    
    if (user.followRequests.includes(requester._id)) {
      user.followRequests.pull(requester._id);
      user.followers.push(requester._id);
      requester.following.push(user._id);
      await user.save();
      await requester.save();
      
      // Delete old request
      await Notification.deleteOne({ recipient: req.user.id, sender: requester._id, type: 'follow_request' });
      // Notify requester their request was accepted
      const exists = await Notification.findOne({ recipient: requester._id, sender: req.user.id, type: 'follow_accept' });
      if (!exists) {
        await Notification.create({ recipient: requester._id, sender: req.user.id, type: 'follow_accept' });
      }
    }
    res.json({ success: true, followers: user.followers.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/privacy/toggle — toggle account private/public
router.put('/privacy/toggle', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.isPrivate = !user.isPrivate;
    await user.save();
    res.json({ isPrivate: user.isPrivate });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/note — update status note
router.put('/note', verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    const user = await User.findById(req.user.id);
    user.note = { text: text.substring(0, 60), createdAt: new Date() };
    await user.save();
    res.json(user.note);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;


