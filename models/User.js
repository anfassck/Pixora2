const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username:    { type: String, required: true, unique: true, trim: true, lowercase: true },
  fullName:    { type: String, required: true },
  email:       { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:    { type: String, required: true },
  avatar:      { type: String, default: '' },
  bio:         { type: String, default: '', maxlength: 150 },
  website:     { type: String, default: '' },
  followers:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  followRequests:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savedPosts:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  isPrivate:   { type: Boolean, default: false },
  isAdmin:     { type: Boolean, default: false },
  note: {
    text: { type: String, default: '', maxlength: 60 },
    createdAt: { type: Date, default: Date.now }
  },
  createdAt:   { type: Date, default: Date.now },
});



userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
