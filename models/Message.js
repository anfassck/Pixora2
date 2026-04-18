const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:     { type: String, default: '' },
  mediaUrl: { type: String, default: '' },   // image / video URL
  mediaType:{ type: String, enum: ['text', 'image', 'video', 'voice', 'reel'], default: 'text' },
  isRead:   { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
