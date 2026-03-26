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
import { Button_, SmallLoadingIndicator } from "./components";
import { C, COLOR_GRADIENTS } from "./styles";

const MODEL_URL = "./models";
const DEFAULT_LOGOUT_GRACE_SECONDS = 7;

// IndexedDB cache for model weight shards ////////////////////////////////////
const CACHE_DB_NAME = "faceapi-model-cache";
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = "shards";
const MODEL_CACHE_VERSION = "v1"; // bump when model files in public/models/ change

function openCacheDB() {
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

async function clearStaleCache(db) {
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

async function loadModelCached(net, modelName, db) {
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
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      // skip detection while clock-in prompt is showing
      if (pauseRef.current) return;

      // re-acquire stream if tracks died (e.g. after hibernate/sleep)
      if (!isStreamAlive()) {
        try {
          await startVideo();
          log("Webcam stream re-acquired after sleep/hibernate.");
        } catch (e) {
          return; // camera not available yet, try again next interval
        }
      }

      const descriptor = await getFaceDescriptor();
      const matchedUser = descriptor ? findMatchingUser(descriptor) : null;

      if (matchedUser) {
        // recognized — update last match and reset grace period
        lastMatchRef.current = { userId: matchedUser.id, timestamp: Date.now() };
        useLoginStore.getState().setCurrentUser(matchedUser);
        useLoginStore.getState().setLastActionMillis();
        useLoginStore.getState().setCameraStatus("matched");
        useLoginStore.getState().runPostLoginFunction();
        checkClockIn(matchedUser);
      } else {
        // no match or no face — check grace period before clearing
        const { userId, timestamp } = lastMatchRef.current;
        const graceMs = (activeLoginTimeoutRef.current || DEFAULT_LOGOUT_GRACE_SECONDS) * 1000;
        if (userId && (Date.now() - timestamp < graceMs)) {
          return; // still within grace period, keep current user
        }
        // grace period expired — clear user
        lastMatchRef.current = { userId: null, timestamp: 0 };
        useLoginStore.getState().setCurrentUser(null);
        useLoginStore.getState().setCameraStatus("idle");
      }
    }, FACIAL_RECOGNITION_INTERVAL_MILLIS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sReady]);

  // helpers ////////////////////////////////////////////////////////////////

  function isStreamAlive() {
    const stream = streamRef.current;
    if (!stream) return false;
    const tracks = stream.getVideoTracks();
    return tracks.length > 0 && tracks.every((t) => t.readyState === "live");
  }

  async function startVideo() {
    // if video already has a live stream, just capture the ref
    if (videoRef.current?.srcObject && isStreamAlive()) {
      streamRef.current = videoRef.current.srcObject;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported");
    }

    // stop any dead tracks before re-acquiring
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    streamRef.current = stream;
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
          {!sReady && (
            <SmallLoadingIndicator text="Loading recognition" color="#007AFF" />
          )}
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
