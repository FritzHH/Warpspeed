/*eslint-disable*/
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
} from "./storesOld";
import { SETTINGS_OBJ } from "./data";
import { intersection } from "lodash";
import { cloneDeep } from "lodash";
import { StaticRouter } from "react-router-dom";
// import { dbSetAppUserObj, dbCreateUserPunchAction } from "./db_call_wrapper";
import { Button_ } from "./components";
import { C, COLOR_GRADIENTS } from "./styles";
// import {} from "./models";

const MODEL_URL = "./models"; // Place models in public/models

export function FaceDetectionClientComponent({ __handleEnrollDescriptor }) {
  // store setters ////////////////////////////////////////////////////
  const _zSetCurrentUserObj = useLoginStore((state) => state.setCurrentUserObj);
  const _zCreateUserClockPunch = useLoginStore(
    (state) => state.setCreateUserClockObj
  );
  const _zSetWebcamDetected = useLoginStore((state) => state.setWebcamDetected);
  const _zSetShowAlert = useAlertScreenStore((state) => state.setShowAlert);
  const _zSetAlertValues = useAlertScreenStore((state) => state.setValues);

  // store getters ///////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zPunchClockArr = useLoginStore((state) => state.getPunchClockArr());
  const zRunBackgroundRecognition = useLoginStore((state) =>
    state.getRunBackgroundRecognition()
  );

  /////////////////////////////////////////////////////////////////////////
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const [status, setStatus] = useState("Loading models and finding webcam...");
  const [sBackgroundRecognitionRunning, _setBackgroundRecognitionRunning] =
    useState(false);
  const [sSetupComplete, _setSetupComplete] = useState(false);
  const [sPauseBackgroundRecognition, _setPauseBackgroundRecognition] =
    useState(false);
  // const [sFacialRecognitionReady, _setFacialRecognitionReady] = useState(false);

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
        if (setupCount === SETUP_END_COUNT) {
          log("Face detection setup complete! Webcam found, models loaded.");
          _setSetupComplete(true);
        }
      })
      .catch((e) => {
        log("no webcam detected", e);
        _zSetWebcamDetected(false);
      });
  }, [_zSetWebcamDetected]);

  // cleanup state
  useEffect(() => {
    return () => {
      // log("Cleaning up Face Detection Client; still active?");
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [intervalRef, streamRef]);

  // background facial detection service
  useEffect(() => {
    // log("setup", sSetupComplete);
    setStatus("Setup ready, enroll face now");
    // log("starting background facial recognition");
    _setBackgroundRecognitionRunning(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const currentDesc = await getFaceDescriptor();
      if (currentDesc) {
        // log("cur desc", currentDesc);
        let userObj = zSettingsObj?.users?.find((userObj) => {
          if (!userObj.faceDescriptor) {
            // log("here");
            return null;
          }
          try {
            // log(userObj.faceDescriptor);
            // clog(userObj);
            const distance = faceapi.euclideanDistance(
              // userObj.faceDescriptor,
              userObj.faceDescriptor,
              currentDesc
            );
            // log("dist", distance);
            if (distance < FACE_DESCRIPTOR_CONFIDENCE_DISTANCE) {
              return true;
            } else {
              return null;
            }
          } catch (e) {
            // log(
            //   "user: ",
            //   userObj.first +
            //     " " +
            //     userObj.last +
            //     "  error face recognition" +
            //     e.toString()
            // );
          }
        });

        // log(userObj);
        if (userObj) {
          _zSetCurrentUserObj(userObj); // set app user on face recognition

          // check to see if user asked to not clock in within period of time
          // log("punch clock arr in facedetectionclient", zPunchClockArr);
          let clockedInUser = zPunchClockArr.find(
            (o) => o.userID === userObj.id
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

            // paused for dev

            _zSetShowAlert(true);
            _setPauseBackgroundRecognition(true);
            _zSetAlertValues({
              title: "PUNCH CLOCK",
              message:
                "Hi " +
                userObj.first +
                ", you are not clocked in. Would you like to punch in now?",
              handleBtn1Press: () => {
                _zCreateUserClockPunch(userObj.id, millis, "in");
                // dbCreateUserPunchAction({
                //   userID: userObj.id,
                //   millisIn: millis,
                // });
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
    sSetupComplete,
    intervalRef,
    zSettingsObj,
    sPauseBackgroundRecognition,
    zPunchClockArr,
  ]);

  //////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////

  // Separate handler for metadata loaded event
  const handleLoadedMetadata = () => {
    // log("Metadata loaded");
    if (videoRef.current) {
      // log("playing");
      videoRef.current.play();
    }
  };

  const startVideo = async () => {
    if (videoRef?.current?.srcObject) return;
    // log("starting video stream");
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // log("found");
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
      // log("descriptor", detection.descriptor);
      return detection.descriptor;
    } else {
      // log("no face descriptor detection");
      return null;
    }
  };

  const handleEnroll = async () => {
    setStatus("Detecting face for enrollment...");
    const desc = await getFaceDescriptor();
    if (desc) {
      setStatus("Found facial descriptor. You may exit now.");
      // log("Found Descriptor");
      // clog(desc);
      // return;
      // must copy this array as Firestore convert
      __handleEnrollDescriptor(desc);
    } else {
      setStatus("No face detected. Try again.");
    }
  };

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
      {!zRunBackgroundRecognition ? (
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              marginBottom: 20,
              color: "#007AFF",
              fontSize: 18,
              fontWeight: 400,
            }}
          >
            {status}
          </Text>
          {sSetupComplete ? (
            <Button_
              buttonStyle={{ marginBottom: 20 }}
              colorGradientArr={COLOR_GRADIENTS.blue}
              textStyle={{ color: C.textWhite }}
              text="Enroll Face"
              onPress={handleEnroll}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
