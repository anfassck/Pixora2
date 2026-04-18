const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  imageUrl:  { type: String, default: '' },
  mediaUrl:  { type: String, default: '' },
  mediaType: { type: String, enum: ['image','video'], default: 'image' },
  caption:   { type: String, default: '' },
  viewers:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  duration:  { type: Number, default: 5 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Story', storySchema);
