// src/App.jsx
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase"; // make sure your firebaseConfig exports storage

import React, { useEffect, useRef, useState } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";
import * as cam from "@mediapipe/camera_utils";

// eslint-disable-next-line
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from './firebase';


import "./styles/app.css";

function App() {
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const runningRef = useRef(false);
  const objectStateRef = useRef({});
  const visibilityHandlerRef = useRef(null);
  const blurHandlerRef = useRef(null);
  const detectLoopRef = useRef(null);

  // === Video recording refs ===
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const [candidateName, setCandidateName] = useState("");
  const [phase, setPhase] = useState("start");
  const [status, setStatus] = useState("Idle");
  const [timeElapsedSec, setTimeElapsedSec] = useState(0);
  const [integrityScore, setIntegrityScore] = useState(100);

  const [focusLostCount, setFocusLostCount] = useState(0);
  const [suspiciousItemCount, setSuspiciousItemCount] = useState(0);
  const [drowsinessCount, setDrowsinessCount] = useState(0);

  const [events, setEvents] = useState([]);
  const [reportData, setReportData] = useState(null);

  const startTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const examTimeoutRef = useRef(null);

  // ================== Video Recording Functions ==================
  const startRecording = () => {
    const stream = videoRef.current.srcObject;
    if (!stream) return;

    recordedChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    mediaRecorder.start();
    console.log("Recording started ✅");
  };

  const stopRecordingAndUpload = async () => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) return resolve();

      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const fileName = `${candidateName}_${Date.now()}.webm`;
        const storageRef = ref(storage, `videos/${fileName}`);
        try {
          await uploadBytes(storageRef, blob);
          console.log("Video uploaded ✅", fileName);
          resolve();
        } catch (err) {
          console.error("Video upload failed:", err);
          reject(err);
        }
      };

      mediaRecorder.stop();
    });
  };
  // ===============================================================

  const pushEvent = (type, extra = {}) => {
    const ts = new Date();
    const ev = { ts: ts.toISOString(), type, extra };
    setEvents((prev) => [...prev, ev]);

    (async () => {
      try {
        await addDoc(collection(db, "proctorLogs"), {
          candidateName: candidateName || "Unknown",
          type,
          extra,
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error("Logging failed:", err);
      }
    })();
  };

  const updateMetrics = (type) => {
    if (["no_face", "multiple_faces", "looking_away", "tab_change"].includes(type)) {
      setFocusLostCount((prev) => prev + 1);
      setIntegrityScore((prev) => Math.max(prev - 2, 0));
    } else if (["cell phone", "book", "laptop"].includes(type)) {
      setSuspiciousItemCount((prev) => prev + 1);
      setIntegrityScore((prev) => Math.max(prev - 5, 0));
    } else if (type === "drowsiness") {
      setDrowsinessCount((prev) => prev + 1);
      setIntegrityScore((prev) => Math.max(prev - 3, 0));
    }
  };

  const initProctoring = async () => {
    runningRef.current = true;
    await tf.ready();
    try {
      await tf.setBackend("webgl");
    } catch (e) {
      console.warn("Couldn't set webgl backend, using default:", e);
    }

    const video = videoRef.current;
    if (!video) {
      setStatus("No video element");
      return;
    }

    // Start recording here
    startRecording();

    const faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}?simd=false`,
    });
    faceMesh.setOptions({
      maxNumFaces: 2,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    let noFaceTimer = null;
    let lookingAwayTimer = null;
    let drowsinessTimer = null;

    faceMesh.onResults((results) => {
      if (!runningRef.current) return;
      try {
        const faces = results.multiFaceLandmarks;

        if (!faces || faces.length === 0) {
          if (!noFaceTimer) {
            noFaceTimer = setTimeout(() => {
              pushEvent("no_face");
              updateMetrics("no_face");
              setStatus("No face detected (10s)");
              noFaceTimer = null;
            }, 10000);
          }
        } else {
          if (noFaceTimer) {
            clearTimeout(noFaceTimer);
            noFaceTimer = null;
          }

          if (faces.length > 1) {
            const key = "multiple_faces";
            const prev = objectStateRef.current[key] || {};
            const now = Date.now();
            if (!prev.lastLogged || now - prev.lastLogged > 5000) {
              pushEvent("multiple_faces");
              updateMetrics("multiple_faces");
              setStatus("Multiple faces detected");
              objectStateRef.current[key] = { lastLogged: now };
            }
          } else {
            const landmarks = faces[0];
            const noseTip = landmarks[1];
            if (noseTip && (noseTip.x < 0.3 || noseTip.x > 0.7)) {
              if (!lookingAwayTimer) {
                lookingAwayTimer = setTimeout(() => {
                  pushEvent("looking_away");
                  updateMetrics("looking_away");
                  setStatus("Looking away (5s)");
                  lookingAwayTimer = null;
                }, 5000);
              }
            } else {
              if (lookingAwayTimer) {
                clearTimeout(lookingAwayTimer);
                lookingAwayTimer = null;
              }
            }

            const leftEye = landmarks[33];
            const rightEye = landmarks[263];
            if (leftEye && rightEye) {
              const eyeDistance = Math.abs(leftEye.y - rightEye.y);
              if (eyeDistance < 0.008) {
                if (!drowsinessTimer) {
                  drowsinessTimer = setTimeout(() => {
                    pushEvent("drowsiness");
                    updateMetrics("drowsiness");
                    setStatus("Drowsiness detected (3s)");
                    drowsinessTimer = null;
                  }, 3000);
                }
              } else {
                if (drowsinessTimer) {
                  clearTimeout(drowsinessTimer);
                  drowsinessTimer = null;
                }
              }
            }
            if (!lookingAwayTimer && !drowsinessTimer) {
              setStatus("Focused");
            }
          }
        }
      } catch (err) {
        console.warn("FaceMesh onResults error:", err);
      }
    });

    const camera = new cam.Camera(video, {
      onFrame: async () => {
        if (!runningRef.current) return;
        try {
          await faceMesh.send({ image: video });
        } catch {}
      },
      width: 640,
      height: 480,
    });
    cameraRef.current = camera;
    camera.start();

    const model = await cocoSsd.load();

    const detectObjectsLoop = async () => {
      if (!runningRef.current) return;
      if (!video.videoWidth || !video.videoHeight) {
        requestAnimationFrame(detectObjectsLoop);
        return;
      }

      try {
        const predictions = await model.detect(video);
        const now = Date.now();

        const detectedThisFrame = new Set();
        for (const pred of predictions) {
          const cls = pred.class;
          const score = pred.score || 0;
          if (!["cell phone", "book", "laptop"].includes(cls)) continue;
          if (score < 0.5) continue;

          detectedThisFrame.add(cls);
          const prev = objectStateRef.current[cls] || {};
          if ((!prev.detected || !prev.lastLogged) && (!prev.lastLogged || now - prev.lastLogged > 5000)) {
            objectStateRef.current[cls] = {
              ...prev,
              detected: true,
              lastSeen: now,
              lastLogged: now,
            };
            pushEvent(cls, { score: Number(pred.score.toFixed(2)) });
            updateMetrics(cls);
            setStatus(`${cls} detected`);
          } else {
            objectStateRef.current[cls] = {
              ...prev,
              detected: true,
              lastSeen: now,
              lastLogged: prev.lastLogged || 0,
            };
          }
        }

        Object.keys(objectStateRef.current).forEach((k) => {
          const st = objectStateRef.current[k];
          if (!st) return;
          if (st.lastSeen && now - st.lastSeen > 2000) {
            objectStateRef.current[k] = { ...st, detected: false };
          }
        });
      } catch (err) {
        console.warn("Object detection error:", err);
      }
      requestAnimationFrame(detectObjectsLoop);
    };

    detectLoopRef.current = detectObjectsLoop;
    requestAnimationFrame(detectObjectsLoop);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const key = "tab_change";
        const prev = objectStateRef.current[key] || {};
        const now = Date.now();
        if (!prev.lastLogged || now - prev.lastLogged > 5000) {
          objectStateRef.current[key] = { lastLogged: now };
          pushEvent("tab_change");
          updateMetrics("tab_change");
          setStatus("Tab change / hidden");
        }
      } else {
        setStatus("Focused");
      }
    };

    const handleWindowBlur = () => {
      const key = "window_blur";
      const prev = objectStateRef.current[key] || {};
      const now = Date.now();
      if (!prev.lastLogged || now - prev.lastLogged > 5000) {
        objectStateRef.current[key] = { lastLogged: now };
        pushEvent("window_blur");
        updateMetrics("tab_change");
        setStatus("Window lost focus");
      }
    };

    visibilityHandlerRef.current = handleVisibilityChange;
    blurHandlerRef.current = handleWindowBlur;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
  };

  const stopProctoring = () => {
    runningRef.current = false;
    try {
      if (cameraRef.current && typeof cameraRef.current.stop === "function") {
        cameraRef.current.stop();
      }
    } catch {}
    if (visibilityHandlerRef.current)
      document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
    if (blurHandlerRef.current)
      window.removeEventListener("blur", blurHandlerRef.current);
  };

  const startExam = () => {
    if (!candidateName.trim()) {
      alert("Enter candidate name");
      return;
    }
    setEvents([]);
    setFocusLostCount(0);
    setSuspiciousItemCount(0);
    setDrowsinessCount(0);
    setIntegrityScore(100);
    objectStateRef.current = {};
    setTimeElapsedSec(0);
    startTimeRef.current = Date.now();

    setPhase("exam");
    setStatus("Initializing proctoring...");
    initProctoring();

    timerIntervalRef.current = setInterval(() => {
      setTimeElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    examTimeoutRef.current = setTimeout(() => {
      endExam();
    }, 90 * 1000);
  };

  const endExam = async () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (examTimeoutRef.current) {
      clearTimeout(examTimeoutRef.current);
      examTimeoutRef.current = null;
    }

    stopProctoring();

    // Stop recording and upload video
    await stopRecordingAndUpload();

    const totalSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const minutes = Math.floor(totalSec / 60);
    const rem = totalSec % 60;
    const durationStr = `${minutes}m ${rem}s`;

    const r = {
      candidateName,
      duration: durationStr,
      durationSeconds: totalSec,
      focusLostCount,
      suspiciousEvents: suspiciousItemCount,
      drowsinessCount,
      finalIntegrityScore: integrityScore,
      events,
    };
    setReportData(r);
    setPhase("report");
    setStatus("Session ended");

    try {
      await addDoc(collection(db, "proctorReports"), {
        ...r,
        createdAt: serverTimestamp(),
      });
      console.log("Final report stored in Firebase ✅");
    } catch (err) {
      console.error("Failed to save final report:", err);
    }
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (examTimeoutRef.current) clearTimeout(examTimeoutRef.current);
      stopProctoring();
    };
  }, []);

  const formatElapsed = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ================== UI rendering ==================
  if (phase === "start") {
    return (
      <div className="container" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{ textAlign: "center", maxWidth: 400, width: "100%", padding: "20px", background: "#f9f9f9", borderRadius: "12px", boxShadow: "0 4px 10px rgba(0,0,0,0.15)" }}>
          <h1 style={{ marginBottom: "20px", color: "#2c3e50" }}>Online Proctored Assessment</h1>
  
          <div className="form" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontWeight: "bold", textAlign: "left", color: "#34495e" }}>Please enter your full name</label>
            <input
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder="Full Name"
              style={{
                padding: "10px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                fontSize: "14px"
              }}
            />
            <p style={{ marginTop: "10px", color: "#555" }}>Assessment Duration: <strong>90 seconds</strong></p>
            <button
              onClick={startExam}
              disabled={!candidateName.trim()}
              style={{
                marginTop: "15px",
                padding: "12px",
                background: candidateName.trim() ? "#2ecc71" : "#95a5a6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                cursor: candidateName.trim() ? "pointer" : "not-allowed",
                transition: "background 0.3s"
              }}
            >
              Start Assessment (90s)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "exam") {
    return (
      <div className="container">
        <h1>🎯 Candidate Video Proctoring</h1>

        <div className="video-container">
          <video ref={videoRef} autoPlay playsInline muted />
          <div className={`status ${status !== "Focused" ? "alert" : ""}`}>
            {status}
          </div>
        </div>

        <div className="metrics">
          <div>
            <strong>Candidate:</strong> {candidateName}
          </div>
          <div>
            <strong>Timer:</strong> {formatElapsed(timeElapsedSec)}
          </div>
          <div>
            <strong>Integrity Score:</strong> {integrityScore}
          </div>
          <div>
            <strong>Focus Lost Count:</strong> {focusLostCount}
          </div>
          <div>
            <strong>Suspicious Items:</strong> {suspiciousItemCount}
          </div>
          <div>
            <strong>Drowsiness Count:</strong> {drowsinessCount}
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={endExam}>Stop Now & Generate Report</button>
          </div>
        </div>

        <div className="events">
          <h4>Live Events</h4>
          <div style={{ maxHeight: 160, overflow: "auto", fontSize: 13 }}>
            {events.length === 0 ? (
              <div>No events yet</div>
            ) : (
              events
                .slice()
                .reverse()
                .map((ev, idx) => (
                  <div key={idx}>
                    <small>{ev.ts}</small> — <strong>{ev.type}</strong>{" "}
                    {ev.extra && JSON.stringify(ev.extra)}
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "report" && reportData) {
    return (
      <div className="container">
        <h1>📋 Proctoring Report</h1>

        <p>
          <strong>Candidate Name:</strong> {reportData.candidateName}
        </p>
        <p>
          <strong>Interview Duration:</strong> {reportData.duration} (
          {reportData.durationSeconds}s)
        </p>
        <p>
          <strong>Focus Lost:</strong> {reportData.focusLostCount}
        </p>
        <p>
          <strong>Suspicious Events:</strong> {reportData.suspiciousEvents}
        </p>
        <p>
          <strong>Drowsiness Count:</strong> {reportData.drowsinessCount}
        </p>
        <h3>Final Integrity Score: {reportData.finalIntegrityScore}</h3>

        <h4>All Events (chronological)</h4>
        <div style={{ maxHeight: 300, overflow: "auto", fontSize: 13 }}>
          {reportData.events.length === 0 ? (
            <div>No events logged</div>
          ) : (
            reportData.events.map((ev, i) => (
              <div key={i}>
                <small>{ev.ts}</small> — <strong>{ev.type}</strong>{" "}
                {ev.extra && JSON.stringify(ev.extra)}
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => {
              setPhase("start");
              setCandidateName("");
              setReportData(null);
            }}
          >
            Run Another
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
