import React, { useRef, useEffect, useState } from "react";
import { View, Button, Text } from "react-native";
import * as faceapi from "face-api.js";
import { clog, log } from "./utils";
import {
  FACE_DESCRIPTOR_CONFIDENCE_DISTANCE,
  FACIAL_RECOGNITION_INTERVAL,
} from "./constants";
import {
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
} from "./stores";
import { SETTINGS_OBJ } from "./data";
import { intersection } from "lodash";
import { cloneDeep } from "lodash";
import { StaticRouter } from "react-router-dom";
// import {} from "./models";

const MODEL_URL = "./models"; // Place models in public/models

export function FaceDetectionComponent({ runInBackground = true }) {
  // store setters ////////////////////////////////////////////////////
  const _zSetCurrentUserObj = useLoginStore((state) => state.setCurrentUserObj);
  const _zSetWebcamDetected = useLoginStore((state) => state.setWebcamDetected);

  // store getters ///////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  //   const zRunBackgroundRecognition = useLoginStore((state) =>
  //     state.getRunBackgroundRecognition()
  //   );

  /////////////////////////////////////////////////////////////////////////
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const [status, setStatus] = useState("Loading models...");
  const [enrolledDescriptor, setEnrolledDescriptor] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [backgroundStarted, _setBackgroundStarted] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  const SETUP_END_COUNT = 4;
  useEffect(() => {
    // log("running");
    let setupCount = 0;
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).then(() => {
      setupCount++;
      if (setupCount === SETUP_END_COUNT) setSetupComplete(true);
    });
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL).then(() => {
      setupCount++;
      if (setupCount === SETUP_END_COUNT) setSetupComplete(true);
    });
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL).then(() => {
      setupCount++;
      if (setupCount === SETUP_END_COUNT) setSetupComplete(true);
    });
    startVideo()
      .then(() => {
        setupCount++;
        _zSetWebcamDetected(true);
        if (setupCount === SETUP_END_COUNT) setSetupComplete(true);
      })
      .catch((e) => {
        log("no webcam detected", e);
        _zSetWebcamDetected(false);
      });
  }, []);

  useEffect(() => {
    if (!zSettingsObj || backgroundStarted) return;
    if (runInBackground) startBackgroundRecognition(zSettingsObj);
  }, [zSettingsObj, backgroundStarted, runInBackground]);

  // cleanup state
  useEffect(() => {
    return () => {
      log("cleaning up faceDetectionClient state");
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [intervalRef, streamRef]);

  //////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////

  // Separate handler for metadata loaded event
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setStatus("Ready! Enroll your face.");
    }
  };

  const startVideo = async () => {
    if (videoRef?.current?.srcObject) return;
    log("starting video stream");
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        log("video stream started");
      }
    }
  };

  const startBackgroundRecognition = (settingsObj) => {
    _setBackgroundStarted(true);
    log("starting background facial recognition");
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const currentDesc = await getFaceDescriptor();
      // log("cur desc", currentDesc);
      if (currentDesc) {
        // log("found descriptor");
        let userObj = settingsObj.users.find((userObj) => {
          const distance = faceapi.euclideanDistance(
            userObj.faceDescriptor,
            currentDesc
          );
          if (distance < FACE_DESCRIPTOR_CONFIDENCE_DISTANCE) {
            // log("Face descriptor distance", distance);
            // clog("Face Login!", userObj);
            return true;
          } else {
            return false;
          }
        });
        if (userObj) {
          _zSetCurrentUserObj(userObj);
          // clog("Face Login!", userObj);
        }
      }
    }, FACIAL_RECOGNITION_INTERVAL);
  };

  const getFaceDescriptor = async () => {
    if (!videoRef.current) {
      log("No video ref in getFaceDescriptor()");
      //   setStatus("No Video Playback Ref");
      return null;
    }
    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (detection) {
      return detection.descriptor;
    } else {
      log("No detection");
      return null;
    }
  };

  const handleEnroll = async () => {
    setStatus("Detecting face for enrollment...");
    const desc = await getFaceDescriptor();
    if (desc) {
      log("desc", desc);
      setEnrolledDescriptor(desc);
      setStatus("Face enrolled! Now looking for you...");
      startBackgroundRecognition(desc);
    } else {
      setStatus("No face detected. Try again.");
    }
  };

  return (
    <View style={{}}>
      <video
        ref={videoRef}
        width={runInBackground ? 0 : 320}
        height={runInBackground ? 0 : 250}
        autoPlay
        muted
        onLoadedMetadata={handleLoadedMetadata}
        style={{}}
      />
      {!runInBackground ? (
        <View>
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
                fontWeight: "bold",
              }}
            >
              ✅ You are logged in!
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
