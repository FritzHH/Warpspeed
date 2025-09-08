/* eslint-disable */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import { Button } from "react-native-web";
import { C, Colors, ICONS, ViewStyles } from "../styles";

import {
  clog,
  dim,
  formatDateTimeForReceipt,
  generateBarcode,
  generateRandomID,
  log,
  searchPhoneNum,
  useInterval,
} from "../utils";
import {
  AlertBox_,
  LoginScreenModalComponent,
  SHADOW_RADIUS_PROTO,
} from "../components";
import { Info_Section } from "./screen_collections/Info_Section";
import { Items_Section } from "./screen_collections/Items_Section";
import { Options_Section } from "./screen_collections/Options_Section";
import { Notes_Section } from "./screen_collections/Notes_Section";
import {
  get_firestore_field,
  get_firestore_field2,
  getRealtimeNodeItem,
  searchCollection,
  set_firestore_field,
  set_firestore_field2,
  subscribeToFirestorePath,
} from "../db";
import {
  fillSettings,
  fillPrinterNames,
  fillPunchHistory,
  fillReceipt,
  fillInventory,
} from "../testing";
import {
  customerPreviewListSubscribe,
  inventorySubscribe,
  openWorkordersSubscribe,
  punchClockSubscribe,
  settingsSubscribe,
  subscribeToDBNodeChanges,
} from "../db_subscription_wrapper";
import {
  useCustomerPreviewStore,
  useInventoryStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useActionStore,
  useLoginStore,
  useDatabaseBatchStore,
} from "../stores";
import {
  dbGetSettings,
  dbSearchForPhoneNumber,
  executeDBBatch,
} from "../db_call_wrapper";
import { FaceDetectionClientComponent } from "../faceDetectionClient";
import {
  DB_BATCH_INTERVAL_MILLIS,
  REALTIME_DATABASE_NODE_NAMES,
} from "../constants";

export function BaseScreen() {
  // store setters ////////////////////////////////////////////////////////////////
  const _zSetInventoryItem = useInventoryStore((state) => state.setItem);
  const _zSetSettingsItem = useSettingsStore((state) => state.setField);
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);
  const _zSetLastActionMillis = useLoginStore(
    (state) => state.setLastActionMillis
  );
  const _zSetLoginTimeout = useLoginStore((state) => state.setLoginTimeout);
  const _zSetPunchClockArr = useLoginStore((state) => state.setPunchClockArr);
  const _zSetPunchClockItem = useLoginStore(
    (state) => state.setSinglePunchObjInPunchArr
  );
  const _zSetLastDatabaseBatchMillis = useDatabaseBatchStore(
    (state) => state.setLastBatchMillis
  );
  const _zSetLastDatabaseWriteMillis = useDatabaseBatchStore(
    (state) => state.setLastWriteMillis
  );
  const _zTestIncoming = useOpenWorkordersStore((state) => state.testIncoming);
  // testing
  // const _zSetCurrentUserObj = useLoginStore((state) => state.setCurrentUserObj);

  // store getters /////////////////////////////////////////////////////////////////
  const zLastDatabaseBatchMillis = useDatabaseBatchStore((state) =>
    state.getLastBatchMillis()
  );
  const zLastDatabaseWriteMillis = useDatabaseBatchStore((state) =>
    state.getLastWriteMillis()
  );
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());
  const zModalVisible = useLoginStore((state) => state.getModalVisible());
  const zRunBackgroundRecognition = useLoginStore((state) =>
    state.getRunBackgroundRecognition()
  );

  // local state ////////////////////////////////////////////////////////////////////////
  const [screenWidth, _setScreenWidth] = useState(window.innerWidth);
  const [screenHeight, _setScreenHeight] = useState(window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      _setScreenWidth(window.innerWidth);
      _setScreenHeight(window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // subscribe to database listeners
  useEffect(() => {
    subscribeToDBNodeChanges({
      option: "settings",
      addCallback: (key, val) => _zSetSettingsItem(key, val, false),
      changeCallback: (key, val) => _zSetSettingsItem(key, val, false),
    });

    subscribeToDBNodeChanges({
      option: "punch clock",
      addCallback: (key, val) => {
        _zSetPunchClockItem(val, "add");
      },
      // changeCallback: (key, val) => {
      //   _zSetPunchClockItem(val, "change");
      // },
      removeCallback: (key, val) => {
        _zSetPunchClockItem(val, "remove");
      },
    });
  }, []);

  useEffect(() => {
    try {
      _zSetLoginTimeout(zSettingsObj?.loginTimeout);
      // testing take out this is your user obj
      // _zSetCurrentUserObj(zSettingsObj?.users[0]);
    } catch (e) {}
  }, [zSettingsObj]);

  // database batching
  useEffect(() => {
    const intervalId = setInterval(() => {
      let curMillis = new Date().getTime();
      let diff = curMillis - zLastDatabaseWriteMillis;
      // let batchDiff = curMillis - batchDiff
      // log("diff", diff);
      if (diff > DB_BATCH_INTERVAL_MILLIS) executeDBBatch();
    }, 100);

    // Cleanup function to clear the interval
    return () => {
      clearInterval(intervalId);
    };
  }, [zLastDatabaseBatchMillis, zLastDatabaseWriteMillis]);

  // testing, build db items
  useEffect(() => {
    // fillSettings();
    // fillReceipt();
    // fillPrinterNames();
    // fillPunchHistory()
    // fillInventory();
  }, []);
  // log(zSettingsObj);
  return (
    <View
      style={{
        width: screenWidth,
        height: screenHeight,
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
      }}
    >
      <div
        onKeyUp={() => {
          _zSetLastActionMillis();
        }}
        onMouseMove={() => {
          _zSetLastActionMillis();
        }}
        style={{ width: "100%", height: 0 }}
      />

      <LoginScreenModalComponent
        modalVisible={zShowLoginScreen && !zModalVisible}
      />
      {zRunBackgroundRecognition ? <FaceDetectionClientComponent /> : null}
      <AlertBox_ />
      <View
        style={{
          width: "65%",
          backgroundColor: C.backgroundWhite,
          height: "100%",
          paddingRight: 8,
          justifyContent: "space-around",
        }}
      >
        <View
          style={{
            width: "100%",
            height: "64%",
            flexDirection: "row",
            justifyContent: "space-around",
          }}
        >
          {/*Info Section */}
          <View
            style={{
              width: "33%",
              height: "100%",
              backgroundColor: C.backgroundWhite,
              borderColor: C.buttonLightGreen,
              borderWidth: 1,
              borderRadius: 15,
              shadowColor: C.green,
              shadowOffset: {
                width: 1,
                height: 1,
              },
              shadowOpacity: 0.5,
              shadowRadius: 10,
            }}
          >
            <Info_Section />
          </View>
          <View
            style={{
              width: "65%",
              height: "100%",
              backgroundColor: C.backgroundWhite,
              borderColor: C.buttonLightGreen,
              borderWidth: 1,
              borderRadius: 15,
              // backgroundColor: "red",
              shadowColor: C.green,
              shadowOffset: {
                width: 1,
                height: 1,
              },
              shadowOpacity: 0.5,
              shadowRadius: 10,
            }}
          >
            <Items_Section />
          </View>
        </View>
        <View
          style={{
            marginLeft: 6,
            width: "99%",
            height: "33%",
            backgroundColor: C.backgroundWhite,
            borderColor: C.buttonLightGreen,
            borderWidth: 1,
            borderRadius: 15,
            // backgroundColor: "red",
            shadowColor: C.green,
            shadowOffset: {
              width: 1,
              height: 1,
            },
            shadowOpacity: 0.5,
            shadowRadius: 10,
          }}
        >
          <Notes_Section />
        </View>
      </View>
      <View
        style={{
          marginRight: 13,
          // width: "100%",
          width: "34%",
          height: "99%",
          backgroundColor: C.backgroundWhite,
          // borderColor: APP_BASE_COLORS.green,
          // borderWidth: 1,
          borderRadius: 15,
          shadowColor: C.green,
          shadowOffset: {
            width: 0,
            height: 1,
          },
          shadowOpacity: 0.5,
          shadowRadius: 10,
        }}
      >
        <Options_Section />
      </View>
    </View>
  );
}
