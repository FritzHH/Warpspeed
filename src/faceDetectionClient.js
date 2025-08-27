import React, { useRef, useEffect, useState } from "react";
import { View, Button, Text } from "react-native";
import * as faceapi from "face-api.js";
import { clog, log } from "./utils";
import {
  FACE_DESCRIPTOR_CONFIDENCE_DISTANCE,
  FACIAL_RECOGNITION_INTERVAL,
} from "./constants";
import {
  useAlertScreenStore,
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
  const _zSetClockedInUser = useLoginStore((state) => state.setClockedInUser);
  const _zSetWebcamDetected = useLoginStore((state) => state.setWebcamDetected);
  const _zSetAlertTitle = useAlertScreenStore((state) => state.setTitle);
  const _zSetAlertMessage = useAlertScreenStore((state) => state.setMessage);
  const _zSetAlertBtn1Handle = useAlertScreenStore(
    (state) => state.setButton1Handler
  );
  const _zSetAlertBtn2Handle = useAlertScreenStore(
    (state) => state.setButton2Handler
  );
  const _zSetShowAlert = useAlertScreenStore((state) => state.setShowAlert);

  // store getters ///////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zClockedInUsersArr = useLoginStore((state) =>
    state.getClockedInUsers()
  );

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
  const [sLastCheckedUserObj, _setLastCheckedUserObj] = useState([]);
  const [sPauseBackgroundRecognition, _setPauseBackgroundRecognition] =
    useState(false);
  const [sFacialRecognitionReady, _setFacialRecognitionReady] = useState(false);

  useEffect(() => {
    const SETUP_END_COUNT = 4;
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
    if (runInBackground) _setFacialRecognitionReady(true);
  }, [zSettingsObj, backgroundStarted, runInBackground]);

  // cleanup state
  useEffect(() => {
    return () => {
      // log("cleaning up faceDetectionClient state");
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [intervalRef, streamRef]);

  useEffect(() => {
    if (!sFacialRecognitionReady) return;
    log("starting background facial recognition");
    _setBackgroundStarted(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      if (sPauseBackgroundRecognition) return;
      const currentDesc = await getFaceDescriptor();
      if (currentDesc) {
        // log("found descriptor");
        let userObj = zSettingsObj.users.find((userObj) => {
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
          // log("here");
          _zSetCurrentUserObj(userObj);
          // log(zClockedInUsersArr);
          let clockedInUser = zClockedInUsersArr.find(
            (o) => o.id === userObj.id
          );
          if (!clockedInUser) {
            _zSetShowAlert(true);
            _setPauseBackgroundRecognition(true);
            _zSetAlertTitle("PUNCH CLOCK");
            _zSetAlertMessage(
              "Hi " +
                userObj.first +
                ", you are not clocked in. Would you like to punch in now?"
            );
            _zSetAlertBtn1Handle(() => {
              _zSetClockedInUser(userObj);
              _setPauseBackgroundRecognition(false);
            });
            _zSetAlertBtn2Handle(() => {
              let lastCheckedUserObj = cloneDeep(sLastCheckedUserObj);
              lastCheckedUserObj[userObj.id] = new Date().getTime();
              _setLastCheckedUserObj(lastCheckedUserObj);
              _setPauseBackgroundRecognition(false);
            });
          }
        } else {
          _zSetCurrentUserObj(null);
        }
      } else {
        _zSetCurrentUserObj(null);
      }
    }, FACIAL_RECOGNITION_INTERVAL);
  }, [
    sFacialRecognitionReady,
    sLastCheckedUserObj,
    zClockedInUsersArr,
    zSettingsObj,
    sPauseBackgroundRecognition,
    intervalRef,
  ]);

  //////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////

  // Separate handler for metadata loaded event
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.play();
    }
  };

  const startVideo = async () => {
    if (videoRef?.current?.srcObject) return;
    // log("starting video stream");
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // log("video stream started");
      }
    }
  };

  const getFaceDescriptor = async () => {
    if (!videoRef.current) {
      return null;
    }
    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (detection) {
      return detection.descriptor;
    } else {
      return null;
    }
  };

  const handleEnroll = async () => {
    setStatus("Detecting face for enrollment...");
    const desc = await getFaceDescriptor();
    if (desc) {
      // log("desc", desc);
      setEnrolledDescriptor(desc);
      // startBackgroundRecognition(desc);
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
