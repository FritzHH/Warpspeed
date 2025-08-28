import React, { useRef, useEffect, useState } from "react";
import { View, Button, Text } from "react-native";
import * as faceapi from "face-api.js";
import { clog, localStorageWrapper, log } from "./utils";
import {
  FACE_DESCRIPTOR_CONFIDENCE_DISTANCE,
  FACIAL_RECOGNITION_INTERVAL_MILLIS,
  LOCAL_DB_KEYS,
  MILLIS_IN_MINUTE,
  PAUSE_USER_CLOCK_IN_CHECK_MILLIS,
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
import { dbSetUserPunchAction } from "./db_call_wrapper";
// import {} from "./models";

const MODEL_URL = "./models"; // Place models in public/models

export function FaceDetectionComponent({}) {
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
  const _zSetAlertValues = useAlertScreenStore((state) => state.setValues);

  // store getters ///////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zClockedInUsersArr = useLoginStore((state) =>
    state.getClockedInUsers()
  );
  const zRunBackgroundRecognition = useLoginStore((state) =>
    state.getRunBackgroundRecognition()
  );

  /////////////////////////////////////////////////////////////////////////
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const [status, setStatus] = useState("Loading models...");
  const [enrolledDescriptor, setEnrolledDescriptor] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [sBackgroundRecognitionRunning, _setBackgroundRecognitionRunning] =
    useState(false);
  const [sSetupComplete, _setSetupComplete] = useState(false);
  const [sPauseBackgroundRecognition, _setPauseBackgroundRecognition] =
    useState(false);
  const [sFacialRecognitionReady, _setFacialRecognitionReady] = useState(false);

  useEffect(() => {
    // localStorageWrapper.clearLocalStorage(); // testing
    const SETUP_END_COUNT = 4;
    let setupCount = 0;
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).then(() => {
      setupCount++;
      if (setupCount === SETUP_END_COUNT) _setSetupComplete(true);
    });
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL).then(() => {
      setupCount++;
      if (setupCount === SETUP_END_COUNT) _setSetupComplete(true);
    });
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL).then(() => {
      setupCount++;
      if (setupCount === SETUP_END_COUNT) _setSetupComplete(true);
    });
    startVideo()
      .then(() => {
        setupCount++;
        _zSetWebcamDetected(true);
        if (setupCount === SETUP_END_COUNT) _setSetupComplete(true);
      })
      .catch((e) => {
        log("no webcam detected", e);
        _zSetWebcamDetected(false);
      });
  }, [_zSetWebcamDetected]);

  // watch the
  useEffect(() => {
    if (!zSettingsObj || sBackgroundRecognitionRunning) return;
    if (sSetupComplete) _setFacialRecognitionReady(true);
  }, [zSettingsObj, sBackgroundRecognitionRunning, sSetupComplete]);

  // cleanup state
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [intervalRef, streamRef]);

  useEffect(() => {
    if (!sFacialRecognitionReady || !zRunBackgroundRecognition || !zSettingsObj)
      return;

    log("starting background facial recognition");
    _setBackgroundRecognitionRunning(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      if (sPauseBackgroundRecognition) return;
      const currentDesc = await getFaceDescriptor();
      if (currentDesc) {
        // log("found descriptor");
        let userObj = zSettingsObj?.users?.find((userObj) => {
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
          _zSetCurrentUserObj(userObj); // set app user on face recognition

          // check to see if user asked to not clock in within period of time
          let clockedInUser = zClockedInUsersArr.find(
            (o) => o.id === userObj.id
          );
          if (!clockedInUser) {
            let clockPauseObj = localStorageWrapper.getItem(
              LOCAL_DB_KEYS.userClockCheckPauseObj
            );
            if (!clockPauseObj) clockPauseObj = {};
            localStorageWrapper.setItem(
              LOCAL_DB_KEYS.userClockCheckPauseObj,
              clockPauseObj
            );

            let userKey = Object.keys(clockPauseObj).find(
              (id) => id === userObj.id
            );
            if (userKey) {
              let lastCheckMillis = clockPauseObj[userKey];
              if (
                new Date().getTime() - lastCheckMillis <
                PAUSE_USER_CLOCK_IN_CHECK_MILLIS
              )
                return;
            }

            // ask the user if they want to clock in. pause for period of time if not, so they may use the computer without it asking all the time
            let millis = new Date().getTime();
            _zSetShowAlert(true);
            _setPauseBackgroundRecognition(true);
            _zSetAlertValues({
              title: "PUNCH CLOCK",
              message:
                "Hi " +
                userObj.first +
                ", you are not clocked in. Would you like to punch in now?",
              handleBtn1Press: () => {
                _zSetClockedInUser(userObj.id, millis, "in");
                dbSetUserPunchAction({
                  userID: userObj.id,
                  millisIn: millis,
                });
                _setPauseBackgroundRecognition(false);
              },
              handleBtn2Press: () => {
                clockPauseObj[userObj.id] = new Date().getTime();
                localStorageWrapper.setItem(
                  LOCAL_DB_KEYS.userClockCheckPauseObj,
                  clockPauseObj
                );
                _setPauseBackgroundRecognition(false);
              },
            });
          }
        } else {
          _zSetCurrentUserObj(null);
        }
      } else {
        _zSetCurrentUserObj(null);
      }
    }, FACIAL_RECOGNITION_INTERVAL_MILLIS);
  }, [
    sFacialRecognitionReady,
    zClockedInUsersArr,
    zSettingsObj,
    sPauseBackgroundRecognition,
    intervalRef,
    _setPauseBackgroundRecognition,
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
        width={zRunBackgroundRecognition ? 0 : 320}
        height={zRunBackgroundRecognition ? 0 : 250}
        autoPlay
        muted
        onLoadedMetadata={handleLoadedMetadata}
        style={{}}
      />
      {!zRunBackgroundRecognition ? (
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
