# 1905305-1905305-ProctorVisionRecorderpro

**Focus & Object Detection in Video Interviews**  

A real-time video proctoring system designed to monitor candidate attention and detect unauthorized items during online interviews. The system provides automated event logging, real-time alerts, and comprehensive integrity reports to ensure interview authenticity.

---

## 🔹 Features

### 1. Real-Time Interview Monitoring
- Record and stream candidate video securely.
- Detect focus issues:
  - Candidate looking away for more than 5 seconds.
  - No face detected for more than 10 seconds.
  - Multiple faces detected in the frame.
- Automatically log all focus events with timestamps.

### 2. Unauthorized Item Detection
- Detect items using object detection (YOLO / TensorFlow.js):
  - Mobile phones
  - Books or paper notes
  - Extra electronic devices
- Flag and log any unauthorized items in real-time.

### 3. Reporting & Analytics
- Generate detailed proctoring reports including:
  - Candidate Name
  - Interview Duration
  - Number of focus loss events
  - Suspicious events detected (e.g., absence, multiple faces, unauthorized items)
  - Final Integrity Score (calculated as 100 – deductions)

### 4. Real-Time Dashboard
- Live candidate video feed for the interviewer.
- Real-time alerts for attention loss or suspicious items.
- Logs stored in backend (Firebase) for review and reporting.

---

## 🔹 Tech Stack

- **Frontend:** React, JavaScript, CSS, HTML  
- **Backend:** Node.js, Express.js, Firebase  
- **Computer Vision:** MediaPipe, TensorFlow.js, YOLO models  
- **Deployment:** Render (Backend), Netlify (Frontend)

---

## 🔹 Live Demo

- Frontend: [Netlify Link](https://fastidious-cannoli-d8bc18.netlify.app/)  
- Backend API: [Render Link](https://one905305-1905305-c902.onrender.com/)  

---

## 🔹 Setup Instructions

### 1. Clone Repository
```bash
git clone https://github.com/1905305/1905305-1905305-ProctorVisionRecorderpro.git
cd 1905305-1905305-ProctorVisionRecorderpro

2. Backend Setup

Navigate to the backend folder:

cd backend


Install dependencies:

npm install


Create a .env file in the backend folder with the following content:

FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id
FRONTEND_URL=https://fastidious-cannoli-d8bc18.netlify.app


Replace the placeholders with your Firebase project values.

Start the backend server:

npm run dev


This starts the backend on http://localhost:PORT as specified in your .env or default port 5000.

3. Frontend Setup

Navigate to the frontend folder:

cd ../frontend


Install dependencies:

npm install


Create a .env file in the frontend folder with the following:

REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id
REACT_APP_BACKEND_URL=https://one905305-1905305-c902.onrender.com


Make sure the backend URL points to your Render deployment.

Start the frontend:

npm start


This will launch the web app on http://localhost:3000.

4. Deployment Notes

Backend is deployed on Render at: https://one905305-1905305-c902.onrender.com

Frontend is deployed on Netlify at: https://fastidious-cannoli-d8bc18.netlify.app

Ensure your frontend .env is pointing to the deployed backend URL for production.

5. Testing

Open the frontend URL in a browser.

Start an interview session and verify:

Candidate video streams correctly.

Focus and item detection events are logged.

Reports can be generated in the backend.
