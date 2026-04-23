const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Path to your service account key file
const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized');
} else {
  console.log('⚠️ Firebase service account key missing at backend/firebase-service-account.json');
  console.log('Push notifications will be disabled until the file is added.');
}

const sendPushNotification = async (token, title, body, data = {}) => {
  if (!token) return;
  if (!admin.apps.length) return;

  const message = {
    notification: { title, body },
    data,
    token: token
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent FCM message:', response);
  } catch (error) {
    console.log('Error sending FCM message:', error);
  }
};

module.exports = { sendPushNotification };
