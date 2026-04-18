/**
 * make-admin.js — Run once to grant admin privileges to a user
 * Usage:  node make-admin.js <username_or_email>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const target = process.argv[2];
if (!target) {
  console.error('❌  Usage: node make-admin.js <username_or_email>');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const user = await User.findOne({
      $or: [{ username: target.toLowerCase() }, { email: target.toLowerCase() }],
    });
    if (!user) {
      console.error(`❌  User "${target}" not found.`);
      process.exit(1);
    }
    user.isAdmin = true;
    await user.save();
    console.log(`✅  "${user.username}" (${user.email}) is now an Admin.`);
    process.exit(0);
  })
  .catch(err => { console.error(err); process.exit(1); });
