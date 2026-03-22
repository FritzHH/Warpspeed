/*eslint-disable*/
import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text } from "react-native-web";
import * as faceapi from "face-api.js";
import { localStorageWrapper, log } from "./utils";
import {
  FACE_DESCRIPTOR_CONFIDENCE_DISTANCE,
  FACIAL_RECOGNITION_INTERVAL_MILLIS,
  LOCAL_DB_KEYS,
  PAUSE_USER_CLOCK_IN_CHECK_MILLIS,
} from "./constants";
import { useAlertScreenStore, useLoginStore, useSettingsStore } from "./stores";
import { Button_ } from "./components";
import { C, COLOR_GRADIENTS } from "./styles";

const MODEL_URL = "./models";
const LOGOUT_GRACE_PERIOD_MS = 15000; // 15s before clearing user on no-match/no-face

export function FaceDetectionClientComponent({ __handleEnrollDescriptor }) {
  // store subscriptions ////////////////////////////////////////////////////
  const zRunBackgroundRecognition = useLoginStore(
    useCallback((state) => state.runBackgroundRecognition, [])
  );
  const zUsers = useSettingsStore(
    useCallback((state) => state.settings?.users, [])
  );
  const zPunchClock = useLoginStore(
    useCallback((state) => state.punchClock, [])
  );

  // refs — stable references for use inside the interval callback //////////
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const pauseRef = useRef(false);
  const usersRef = useRef(zUsers);
  const punchClockRef = useRef(zPunchClock);
  const descriptorErrorsRef = useRef(new Set()); // track users with logged errors
  const lastMatchRef = useRef({ userId: null, timestamp: 0 }); // grace period tracking

  // local state ////////////////////////////////////////////////////////////
  const [sReady, _setReady] = useState(false);
  const [sStatus, _setStatus] = useState("Loading models and finding webcam...");

  // keep refs in sync with store values ////////////////////////////////////
  useEffect(() => { usersRef.current = zUsers; }, [zUsers]);
  useEffect(() => { punchClockRef.current = zPunchClock; }, [zPunchClock]);

  // 1. Load models + start video //////////////////////////////////////////
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        await startVideo();
        useLoginStore.getState().setWebcamDetected(true);

        if (!cancelled) {
          log("Face detection setup complete — webcam found, models loaded.");
          _setReady(true);
        }
      } catch (e) {
        log("Face detection setup failed:", e);
        useLoginStore.getState().setWebcamDetected(false);
        if (!cancelled) _setStatus("No webcam detected");
      }
    }

    setup();
    return () => { cancelled = true; };
  }, []);

  // 2. Cleanup — stop video + clear interval on unmount ////////////////////
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 3. Background recognition loop ////////////////////////////////////////
  useEffect(() => {
    if (!sReady) return;

    _setStatus("Setup ready, enroll face now");
    log("Starting background facial recognition");

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      // skip detection while clock-in prompt is showing
      if (pauseRef.current) return;

      const descriptor = await getFaceDescriptor();
      const matchedUser = descriptor ? findMatchingUser(descriptor) : null;

      if (matchedUser) {
        // recognized — update last match and reset grace period
        lastMatchRef.current = { userId: matchedUser.id, timestamp: Date.now() };
        useLoginStore.getState().setCurrentUser(matchedUser);
        useLoginStore.getState().setLastActionMillis();
        checkClockIn(matchedUser);
      } else {
        // no match or no face — check grace period before clearing
        const { userId, timestamp } = lastMatchRef.current;
        if (userId && (Date.now() - timestamp < LOGOUT_GRACE_PERIOD_MS)) {
          return; // still within grace period, keep current user
        }
        // grace period expired — clear user
        lastMatchRef.current = { userId: null, timestamp: 0 };
        useLoginStore.getState().setCurrentUser(null);
      }
    }, FACIAL_RECOGNITION_INTERVAL_MILLIS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sReady]);

  // helpers ////////////////////////////////////////////////////////////////

  function startVideo() {
    return new Promise(async (resolve, reject) => {
      // if video already has a stream, capture the ref and resolve
      if (videoRef.current?.srcObject) {
        streamRef.current = videoRef.current.srcObject;
        resolve();
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        reject(new Error("getUserMedia not supported"));
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  async function getFaceDescriptor() {
    if (!videoRef.current) return null;
    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection ? detection.descriptor : null;
  }

  function findMatchingUser(descriptor) {
    const users = usersRef.current;
    if (!users) return null;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      if (!user.faceDescriptor) continue;

      try {
        const distance = faceapi.euclideanDistance(
          Object.values(user.faceDescriptor),
          descriptor
        );
        if (distance < FACE_DESCRIPTOR_CONFIDENCE_DISTANCE) {
          return user;
        }
      } catch (e) {
        // log once per user per session to avoid spamming every 1.5s
        const key = user.id || user.first;
        if (!descriptorErrorsRef.current.has(key)) {
          descriptorErrorsRef.current.add(key);
          log("Face descriptor error for " + (user.first || "unknown") + " " + (user.last || "") + ":", e);
        }
      }
    }

    return null;
  }

  function checkClockIn(user) {
    const isClockedIn = punchClockRef.current[user.id];
    if (isClockedIn) return;

    // read pause state fresh from localStorage (not from a stale closure)
    let clockPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};

    const lastCheckMillis = clockPauseObj[user.id];
    if (lastCheckMillis && (Date.now() - lastCheckMillis < PAUSE_USER_CLOCK_IN_CHECK_MILLIS)) {
      return; // still within pause window
    }

    // pause recognition while alert is showing to prevent duplicate prompts
    pauseRef.current = true;

    useAlertScreenStore.getState().setValues({
      title: "PUNCH CLOCK",
      message: "Hi " + user.first + ", you are not clocked in. Would you like to punch in now?",
      handleBtn1Press: () => {
        useLoginStore.getState().setCreateUserClock(user.id, Date.now(), "in");
        useLoginStore.getState().setLastActionMillis();
        pauseRef.current = false;
      },
      handleBtn2Press: () => {
        // re-read and update localStorage fresh inside the handler
        let freshPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};
        freshPauseObj[user.id] = Date.now();
        localStorageWrapper.setItem(LOCAL_DB_KEYS.userClockCheckPauseObj, freshPauseObj);
        pauseRef.current = false;
      },
      showAlert: true,
    });
  }

  // enrollment /////////////////////////////////////////////////////////////

  async function handleEnroll() {
    _setStatus("Detecting face for enrollment...");
    const desc = await getFaceDescriptor();
    if (desc) {
      _setStatus("Found facial descriptor. You may exit now.");
      __handleEnrollDescriptor(desc);
    } else {
      _setStatus("No face detected. Try again.");
    }
  }

  function handleLoadedMetadata() {
    if (videoRef.current) videoRef.current.play();
  }

  // render /////////////////////////////////////////////////////////////////

  return (
    <View style={{}}>
      <video
        ref={videoRef}
        width={zRunBackgroundRecognition ? 0 : 500}
        height={zRunBackgroundRecognition ? 0 : 500}
        autoPlay={true}
        muted
        onLoadedMetadata={handleLoadedMetadata}
        style={{}}
      />
      {!zRunBackgroundRecognition && (
        <View style={{ alignItems: "center" }}>
          <Text style={{ marginBottom: 20, color: "#007AFF", fontSize: 18, fontWeight: 400 }}>
            {sStatus}
          </Text>
          {!!sReady && (
            <Button_
              buttonStyle={{ marginBottom: 20 }}
              colorGradientArr={COLOR_GRADIENTS.blue}
              textStyle={{ color: C.textWhite }}
              text="Enroll Face"
              onPress={handleEnroll}
            />
          )}
        </View>
      )}
    </View>
  );
}
