require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  // First try to find by email
  let admin = await User.findOne({ email: 'muhammedanfasck@gmail.com' });
  
  // If not found, try by isAdmin flag
  if (!admin) {
    admin = await User.findOne({ isAdmin: true });
  }
  
  if (admin) {
    admin.password = 'anfass123';
    await admin.save();
    console.log(`✅ Password updated to anfass123 for user: ${admin.username} (${admin.email})`);
    
    // Also ensure this user is actually an admin
    if (!admin.isAdmin) {
      admin.isAdmin = true;
      await admin.save();
      console.log('Made user an admin too.');
    }
  } else {
    // If no users at all, maybe create one?
    const users = await User.find({});
    console.log('❌ Admin not found! Available users in DB:', users.map(u => u.username).join(', '));
  }
  process.exit();
});
