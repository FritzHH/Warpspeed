import React, { useRef, useEffect, useState } from "react";
import { View, Button, Text } from "react-native";
import * as faceapi from "face-api.js";
import { log } from "./utils";
// import {} from "./models";

const MODEL_URL = "./models"; // Place models in public/models

export default function FaceLogin() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const [status, setStatus] = useState("Loading models...");
  const [enrolledDescriptor, setEnrolledDescriptor] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    (async () => {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      log("loaded models successfully");
      setStatus("Loaded models");
      await startVideo();
    })();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Separate handler for metadata loaded event
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setStatus("Ready! Enroll your face.");
    }
  };

  const startVideo = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // DO NOT call play() here! Wait for onLoadedMetadata
      }
    }
  };

  const getFaceDescriptor = async () => {
    if (!videoRef.current) {
      setStatus("no video ref");
      return null;
    }
    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (detection) {
      return detection.descriptor;
    } else {
      setStatus("No detection");
      return null;
    }
  };

  const handleEnroll = async () => {
    setStatus("Detecting face for enrollment...");
    const desc = await getFaceDescriptor();
    if (desc) {
      setEnrolledDescriptor(desc);
      setStatus("Face enrolled! Now looking for you...");
      startBackgroundRecognition(desc);
    } else {
      setStatus("No face detected. Try again.");
    }
  };

  const startBackgroundRecognition = (descriptor) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      if (loggedIn) return;
      const currentDesc = await getFaceDescriptor();
      if (currentDesc) {
        const distance = faceapi.euclideanDistance(descriptor, currentDesc);
        if (distance < 0.5) {
          setStatus("Login successful!");
          setLoggedIn(true);
          clearInterval(intervalRef.current);
        } else {
          setStatus("Face detected, but does not match.");
        }
      } else {
        setStatus("Looking for your face...");
      }
    }, 1000);
  };

  return (
    <View style={{ alignItems: "center", marginTop: 40 }}>
      <Text style={{ margin: 12, fontSize: 18 }}>
        Face Recognition Login (Web Demo)
      </Text>
      <video
        ref={videoRef}
        width={320}
        height={240}
        autoPlay
        muted
        onLoadedMetadata={handleLoadedMetadata}
        style={{ borderWidth: 2, borderColor: "#888", margin: 8 }}
      />
      <Button
        title="Enroll Face"
        onPress={handleEnroll}
        disabled={!!enrolledDescriptor}
      />
      <Text style={{ margin: 12, color: "#007AFF", fontSize: 16 }}>
        {status}
      </Text>
      {loggedIn && (
        <Text
          style={{
            margin: 12,
            color: "green",
            fontSize: 20,
            fontWeight: "bold"
          }}
        >
          ✅ You are logged in!
        </Text>
      )}
    </View>
  );
}
