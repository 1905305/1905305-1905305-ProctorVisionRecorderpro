require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
const { getStorage } = require('firebase/storage');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL, // Netlify frontend
}));
app.use(express.json());

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

app.get('/', (req, res) => {
  res.send('Firebase backend running ✅');
});

// Example: add a test endpoint
app.post('/log-event', async (req, res) => {
  try {
    const { candidateName, type } = req.body;
    const docRef = await db.collection('proctorLogs').add({
      candidateName,
      type,
      timestamp: new Date()
    });
    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
