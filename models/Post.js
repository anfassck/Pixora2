const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  imageUrl:  { type: String, default: '' },          // image URL or base64
  videoUrl:  { type: String, default: '' },          // video file path / URL
  mediaType: { type: String, enum: ['image','video'], default: 'image' },
  caption:   { type: String, default: '', maxlength: 2200 },
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
  location:  { type: String, default: '' },
  tags:      [{ type: String }],
  views:     { type: Number, default: 0 },
  isArchived: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', postSchema);
