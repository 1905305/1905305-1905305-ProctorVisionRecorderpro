// src/components/VideoInterview.jsx
import React, { useRef, useState, useEffect } from "react";
import axios from "axios";
import * as tf from "@tensorflow/tfjs";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";

const VideoInterview = () => {
  const videoRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState(null);

  // Load Face Detection model once
  useEffect(() => {
    const loadModel = async () => {
      const loadedModel = await faceLandmarksDetection.load(
        faceLandmarksDetection.SupportedPackages.mediapipeFacemesh
      );
      setModel(loadedModel);
    };
    loadModel();
  }, []);

  // Start webcam safely
  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      videoRef.current.srcObject = stream;

      videoRef.current.onloadedmetadata = () => {
        videoRef.current.play();
        setStreaming(true);
        startDetectionLoop();
      };
    } catch (err) {
      console.error("Webcam error:", err);
    }
  };

  // Stop webcam
  const stopVideo = () => {
    const stream = videoRef.current.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  };

  // Safe event logging
  const logEvent = async (eventType) => {
    try {
      await axios.post("http://localhost:5000/api/log-event", {
        candidate: "Test Candidate",
        type: eventType,
        timestamp: new Date(),
      });
      console.log("Event logged:", eventType);
    } catch (err) {
      console.error("Logging error:", err);
    }
  };

  // Detection loop
  const startDetectionLoop = async () => {
    if (!model) return;

    const detect = async () => {
      try {
        const video = videoRef.current;

        if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
          // Wait until video is ready
          setTimeout(detect, 500);
          return;
        }

        const faces = await model.estimateFaces({
          input: video,
          returnTensors: false,
          flipHorizontal: false,
        });

        if (!faces || faces.length === 0) {
          logEvent("No Face Detected");
        } else {
          faces.forEach((face) => {
            if (face.keypoints && face.keypoints.length > 0) {
              const nose = face.keypoints.find((k) => k.name === "nose");
              if (!nose) logEvent("Focus Lost");
            }
          });

          if (faces.length > 1) logEvent("Multiple Faces Detected");
        }
      } catch (err) {
        console.error("Detection error:", err);
      }

      if (streaming) setTimeout(detect, 500);
    };

    detect();
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>Video Interview</h2>
      <video
        ref={videoRef}
        width="640"
        height="480"
        style={{ border: "1px solid black" }}
      />
      <div style={{ marginTop: "20px" }}>
        {!streaming ? (
          <button onClick={startVideo}>Start Interview</button>
        ) : (
          <button onClick={stopVideo}>Stop Interview</button>
        )}
      </div>
    </div>
  );
};

export default VideoInterview;
