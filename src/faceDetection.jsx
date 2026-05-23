/*eslint-disable*/
import React, { useRef, useEffect, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import { localStorageWrapper, log } from "./utils";
import {
  FACE_DESCRIPTOR_CONFIDENCE_DISTANCE,
  LOCAL_DB_KEYS,
  PAUSE_USER_CLOCK_IN_CHECK_MILLIS,
} from "./constants";
import { useAlertScreenStore, useLoginStore, useSettingsStore } from "./stores";
import { Button, SmallLoadingIndicator } from "./dom_components";
import { C, COLOR_GRADIENTS } from "./styles";
import styles from "./faceDetection.module.css";

const MODEL_URL = "./models";
const DEFAULT_LOGOUT_GRACE_SECONDS = 7;

// Motion-gated recognition — fast pixel-diff check gates expensive face-api calls
const TICK_INTERVAL_MS = 500;
const MOTION_PIXEL_DIFF = 30;
const MOTION_PERCENT = 0.005;
const MOTION_CANVAS_W = 160;
const MOTION_CANVAS_H = 120;

// Recognition throttle timings
const SCANNING_INTERVAL_MS = 500;
const KEEPALIVE_INTERVAL_MS = 1000;
const VERIFY_INTERVAL_MS = 1000;
const VERIFY_MAX_ATTEMPTS = 3;

// IndexedDB cache for model weight shards ////////////////////////////////////
const CACHE_DB_NAME = "faceapi-model-cache";
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = "shards";
const MODEL_CACHE_VERSION = "v1"; // bump when model files in public/models/ change

export function openCacheDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME);
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function getCachedShard(db, key) {
  return new Promise((resolve) => {
    const tx = db.transaction(CACHE_STORE_NAME, "readonly");
    const store = tx.objectStore(CACHE_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

function setCachedShard(db, key, buffer) {
  return new Promise((resolve) => {
    const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(CACHE_STORE_NAME);
    const request = store.put(buffer, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export async function clearStaleCache(db) {
  try {
    const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(CACHE_STORE_NAME);
    const allKeys = await new Promise((resolve) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    for (const key of allKeys) {
      if (typeof key === "string" && !key.startsWith(MODEL_CACHE_VERSION + ":")) {
        store.delete(key);
      }
    }
  } catch (e) {
    // ignore — stale entries don't affect correctness
  }
}

export async function loadModelCached(net, modelName, db) {
  const manifestUri = MODEL_URL + "/" + modelName + "-weights_manifest.json";
  const manifestResponse = await fetch(manifestUri);
  const manifest = await manifestResponse.json();

  const cachedFetchWeights = async (fetchUrls) => {
    return Promise.all(
      fetchUrls.map(async (url) => {
        const filename = url.split("/").pop();
        const cacheKey = MODEL_CACHE_VERSION + ":" + filename;

        if (db) {
          try {
            const cached = await getCachedShard(db, cacheKey);
            if (cached) {
              return cached; // cache hit
            }
          } catch (e) { /* fall through to network */ }
        }

        log("Face model cache miss: " + filename);
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();

        if (db) {
          setCachedShard(db, cacheKey, buffer).catch(() => {});
        }

        return buffer;
      })
    );
  };

  const loadWeightsFn = faceapi.tf.io.weightsLoaderFactory(cachedFetchWeights);
  const weightMap = await loadWeightsFn(manifest, MODEL_URL + "/");
  net.loadFromWeightMap(weightMap);
}

export function FaceDetectionClientComponent({ __handleEnrollDescriptor }) {
  // store subscriptions ////////////////////////////////////////////////////
  const zRunBackgroundRecognition = useLoginStore(
    useCallback((state) => state.runBackgroundRecognition, [])
  );
  const zCameraRetryTrigger = useLoginStore(
    useCallback((state) => state.cameraRetryTrigger, [])
  );
  const zUsers = useSettingsStore(
    useCallback((state) => state.settings?.users, [])
  );
  const zPunchClock = useLoginStore(
    useCallback((state) => state.punchClock, [])
  );
  const zActiveLoginTimeout = useSettingsStore(
    useCallback((state) => state.settings?.activeLoginTimeoutSeconds, [])
  );

  // refs — stable references for use inside the interval callback //////////
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const pauseRef = useRef(false);
  const usersRef = useRef(zUsers);
  const punchClockRef = useRef(zPunchClock);
  const activeLoginTimeoutRef = useRef(zActiveLoginTimeout);
  const descriptorErrorsRef = useRef(new Set()); // track users with logged errors
  const lastMatchRef = useRef({ userId: null, timestamp: 0 }); // grace period tracking
  const motionCanvasRef = useRef(null);
  const prevFrameRef = useRef(null);
  const recognitionStateRef = useRef("scanning"); // "idle" | "scanning" | "keepalive" | "verifying"
  const lastRecognitionCheckRef = useRef(0);
  const verifyAttemptsRef = useRef(0);
  const recognitionRunningRef = useRef(false);

  // local state ////////////////////////////////////////////////////////////
  const [sReady, _setReady] = useState(false);
  const [sStatus, _setStatus] = useState("Loading models and finding webcam...");

  // keep refs in sync with store values ////////////////////////////////////
  useEffect(() => { usersRef.current = zUsers; }, [zUsers]);
  useEffect(() => { punchClockRef.current = zPunchClock; }, [zPunchClock]);
  useEffect(() => { activeLoginTimeoutRef.current = zActiveLoginTimeout; }, [zActiveLoginTimeout]);

  // 1. Load models + start video //////////////////////////////////////////
  useEffect(() => {
    let cancelled = false;

    // on retry, stop any existing stream and reset ready state
    if (zCameraRetryTrigger > 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      _setReady(false);
    }

    async function setup() {
      try {
        let db = null;
        try {
          db = await openCacheDB();
          await clearStaleCache(db);
        } catch (e) {
          log("IndexedDB unavailable, loading models from network:", e);
        }

        await Promise.all([
          loadModelCached(faceapi.nets.tinyFaceDetector, "tiny_face_detector_model", db),
          loadModelCached(faceapi.nets.faceLandmark68Net, "face_landmark_68_model", db),
          loadModelCached(faceapi.nets.faceRecognitionNet, "face_recognition_model", db),
          startVideo(),
        ]);

        if (db) db.close();
        useLoginStore.getState().setWebcamDetected(true);
        useLoginStore.getState().setCameraStatus("ready");

        if (!cancelled) {
          _setReady(true);
        }
      } catch (e) {
        log("Face detection setup failed:", e);
        useLoginStore.getState().setWebcamDetected(false);
        useLoginStore.getState().setCameraStatus("failed");
        useLoginStore.getState().setCameraError(e?.message || "Camera failed to start");
        if (!cancelled) _setStatus("No webcam detected");
      }
    }

    setup();
    return () => { cancelled = true; };
  }, [zCameraRetryTrigger]);

  // 2. Cleanup — stop video + clear interval on unmount ////////////////////
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // helpers ////////////////////////////////////////////////////////////////

  function detectMotion() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return false;

    if (!motionCanvasRef.current) {
      motionCanvasRef.current = document.createElement("canvas");
      motionCanvasRef.current.width = MOTION_CANVAS_W;
      motionCanvasRef.current.height = MOTION_CANVAS_H;
    }

    const ctx = motionCanvasRef.current.getContext("2d");
    ctx.drawImage(video, 0, 0, MOTION_CANVAS_W, MOTION_CANVAS_H);
    const currentPixels = ctx.getImageData(0, 0, MOTION_CANVAS_W, MOTION_CANVAS_H).data;

    if (!prevFrameRef.current) {
      prevFrameRef.current = currentPixels.slice();
      return false;
    }

    const prev = prevFrameRef.current;
    const totalPixels = MOTION_CANVAS_W * MOTION_CANVAS_H;
    let changed = 0;

    for (let i = 0; i < currentPixels.length; i += 4) {
      const diff =
        Math.abs(currentPixels[i] - prev[i]) +
        Math.abs(currentPixels[i + 1] - prev[i + 1]) +
        Math.abs(currentPixels[i + 2] - prev[i + 2]);
      if (diff > MOTION_PIXEL_DIFF * 3) changed++;
    }

    prevFrameRef.current = currentPixels.slice();
    const hasMotion = changed / totalPixels > MOTION_PERCENT;
    return hasMotion;
  }

  function isStreamAlive() {
    const stream = streamRef.current;
    if (!stream) return false;
    const tracks = stream.getVideoTracks();
    return tracks.length > 0 && tracks.every((t) => t.readyState === "live");
  }

  async function startVideo() {
    if (videoRef.current?.srcObject && isStreamAlive()) {
      streamRef.current = videoRef.current.srcObject;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported");
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    streamRef.current = stream;
    useLoginStore.getState().setCameraStream(stream);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
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
        const threshold = useSettingsStore.getState().settings?.faceRecognitionThreshold ?? FACE_DESCRIPTOR_CONFIDENCE_DISTANCE;
        if (distance < threshold) {
          return user;
        }
      } catch (e) {
        const key = user.id || user.first;
        if (!descriptorErrorsRef.current.has(key)) {
          descriptorErrorsRef.current.add(key);
          log("Face descriptor error for " + (user.first || "unknown") + " " + (user.last || "") + ":", e);
        }
      }
    }

    return null;
  }

  async function runOneRecognitionCheck() {
    if (recognitionRunningRef.current || pauseRef.current) return;
    recognitionRunningRef.current = true;
    lastRecognitionCheckRef.current = Date.now();

    try {
      const descriptor = await getFaceDescriptor();
      const matchedUser = descriptor ? findMatchingUser(descriptor) : null;

      if (matchedUser) {
        let prevUserId = useLoginStore.getState().currentUser?.id;
        let isFreshLogin = prevUserId !== matchedUser.id;
        lastMatchRef.current = { userId: matchedUser.id, timestamp: Date.now() };
        useLoginStore.getState().setCurrentUser(matchedUser);
        useLoginStore.getState().setLastActionMillis();
        useLoginStore.getState().setCameraStatus("matched");
        if (isFreshLogin) {
          useLoginStore.getState().runPostLoginFunction();
          useLoginStore.getState().triggerLoginMessagesAutoOpen(matchedUser);
          checkClockIn(matchedUser);
        }
        recognitionStateRef.current = "keepalive";
        verifyAttemptsRef.current = 0;
      } else {
        handleMissedCheck();
      }
    } finally {
      recognitionRunningRef.current = false;
    }
  }

  function handleMissedCheck() {
    const state = recognitionStateRef.current;

    if (state === "scanning") return;

    if (state === "keepalive") {
      recognitionStateRef.current = "verifying";
      verifyAttemptsRef.current = 1;
      return;
    }

    if (state === "verifying") {
      verifyAttemptsRef.current++;
      if (verifyAttemptsRef.current >= VERIFY_MAX_ATTEMPTS) {
        tryLogout();
      }
    }
  }

  function tryLogout() {
    const { userId, timestamp } = lastMatchRef.current;
    if (!userId) {
      recognitionStateRef.current = "idle";
      verifyAttemptsRef.current = 0;
      return;
    }

    const graceMs = (activeLoginTimeoutRef.current || DEFAULT_LOGOUT_GRACE_SECONDS) * 1000;
    const lastAction = useLoginStore.getState().getLastActionMillis();

    if (Date.now() - timestamp >= graceMs && Date.now() - lastAction >= graceMs) {
      lastMatchRef.current = { userId: null, timestamp: 0 };
      useLoginStore.getState().setCurrentUser(null);
      useLoginStore.getState().setCameraStatus("idle");
      recognitionStateRef.current = "idle";
      verifyAttemptsRef.current = 0;
    } else {
      // User still active via mouse/keyboard - keep checking face periodically
      recognitionStateRef.current = "keepalive";
      verifyAttemptsRef.current = 0;
    }
  }

  function checkClockIn(user) {
    const isClockedIn = punchClockRef.current[user.id];
    if (isClockedIn) return;

    let clockPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};

    const lastCheckMillis = clockPauseObj[user.id];
    if (lastCheckMillis && (Date.now() - lastCheckMillis < PAUSE_USER_CLOCK_IN_CHECK_MILLIS)) {
      return;
    }

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
        let freshPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};
        freshPauseObj[user.id] = Date.now();
        localStorageWrapper.setItem(LOCAL_DB_KEYS.userClockCheckPauseObj, freshPauseObj);
        pauseRef.current = false;
      },
      showAlert: true,
    });
  }

  // 3. State-machine recognition loop ///////////////////////////////////////
  useEffect(() => {
    if (!sReady) return;

    _setStatus("Setup ready, enroll face now");
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      if (!isStreamAlive()) {
        startVideo().catch(() => {});
        return;
      }

      const motionDetected = detectMotion();
      const now = Date.now();
      const elapsed = now - lastRecognitionCheckRef.current;
      const state = recognitionStateRef.current;

      if (state === "idle") {
        if (motionDetected) {
          recognitionStateRef.current = "scanning";
        }
        return;
      }

      if (state === "scanning") {
        if (elapsed >= SCANNING_INTERVAL_MS) {
          runOneRecognitionCheck();
        }
        if (!motionDetected && !lastMatchRef.current.userId) {
          recognitionStateRef.current = "idle";
        }
        return;
      }

      if (state === "keepalive") {
        if (!lastMatchRef.current.userId) {
          recognitionStateRef.current = "idle";
          return;
        }
        if (elapsed >= KEEPALIVE_INTERVAL_MS) {
          runOneRecognitionCheck();
        }
        return;
      }

      if (state === "verifying") {
        if (!lastMatchRef.current.userId) {
          recognitionStateRef.current = "idle";
          verifyAttemptsRef.current = 0;
          return;
        }
        if (elapsed >= VERIFY_INTERVAL_MS) {
          runOneRecognitionCheck();
        }
        return;
      }
    }, TICK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sReady]);

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
    <div className={styles.root}>
      <video
        ref={videoRef}
        width={zRunBackgroundRecognition ? 0 : 500}
        height={zRunBackgroundRecognition ? 0 : 500}
        autoPlay={true}
        muted
        onLoadedMetadata={handleLoadedMetadata}
      />
      {!zRunBackgroundRecognition && (
        <div className={styles.controls}>
          {!sReady && (
            <SmallLoadingIndicator text="Loading recognition" color="#007AFF" />
          )}
          <p className={styles.statusText}>{sStatus}</p>
          {!!sReady && (
            <Button
              buttonStyle={{ marginBottom: 20 }}
              colorGradientArr={COLOR_GRADIENTS.blue}
              textStyle={{ color: C.textWhite }}
              text="Enroll Face"
              onPress={handleEnroll}
            />
          )}
        </div>
      )}
    </div>
  );
}
