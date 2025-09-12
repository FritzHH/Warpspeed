/* eslint-disable */

import React, { useEffect, useState } from "react";
import { View } from "react-native-web";
import { Button } from "react-native-web";
import { C, Colors, ICONS, ViewStyles } from "../styles";

import {
  AlertBox_,
  LoginModalScreen,
  SHADOW_RADIUS_PROTO,
} from "../components";
import { Info_Section } from "./screen_collections/Info_Section";
import { Items_Section } from "./screen_collections/Items_Section";
import { Options_Section } from "./screen_collections/Options_Section";
import { Notes_Section } from "./screen_collections/Notes_Section";

import { subscribeToDBNodeChanges } from "../db_subscription_wrapper";
import {
  useInventoryStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useLoginStore,
  useDatabaseBatchStore,
  useCheckoutStore,
} from "../stores";
import { executeDBBatch } from "../db_call_wrapper";
import { FaceDetectionClientComponent } from "../faceDetectionClient";
import { DB_BATCH_INTERVAL_MILLIS } from "../constants";
import { fillInventory, fillOpenWorkorders, fillSettings } from "../testing";
import { CheckoutModalScreen } from "./screen_components/modal_screens/CheckoutModalScreen";

export function BaseScreen() {
  // store setters ////////////////////////////////////////////////////////////////

  const _zSetInventoryItem = useInventoryStore((state) => state.setItem);
  const _zRemoveInventoryItem = useInventoryStore((state) => state.removeItem);
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
  const _zSetWorkorderObj = useOpenWorkordersStore(
    (state) => state.setWorkorder
  );
  const _zRemoveWorkorderObj = useOpenWorkordersStore(
    (state) => state.removeWorkorder
  );
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );
  // testing
  // const _zSetCurrentUserObj = useLoginStore((state) => state.setCurrentUserObj);

  // store getters /////////////////////////////////////////////////////////////////
  const zOpenWorkorderObj = useOpenWorkordersStore((state) =>
    state.getOpenWorkorderObj()
  );
  const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());
  const zLastDatabaseBatchMillis = useDatabaseBatchStore((state) =>
    state.getLastBatchMillis()
  );
  const zLastDatabaseWriteMillis = useDatabaseBatchStore((state) =>
    state.getLastWriteMillis()
  );
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());
  const zLoginModalVisible = useLoginStore((state) => state.getModalVisible());
  const zRunBackgroundRecognition = useLoginStore((state) =>
    state.getRunBackgroundRecognition()
  );

  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());

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
      removeCallback: (key, val) => {
        _zSetPunchClockItem(val, "remove");
      },
    });

    subscribeToDBNodeChanges({
      option: "open workorders",
      addCallback: (key, val) => {
        _zSetWorkorderObj(val, false);
      },
      removeCallback: (key, val) => {
        _zRemoveWorkorderObj(val, false);
      },
      changeCallback: (key, val) => {
        _zSetWorkorderObj(val, false);
      },
    });
    subscribeToDBNodeChanges({
      option: "inventory",
      addCallback: (key, val) => {
        _zSetInventoryItem(val, false);
      },
      removeCallback: (key, val) => {
        _zRemoveInventoryItem(val, false);
      },
      changeCallback: (key, val) => {
        _zSetInventoryItem(val, false);
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
    // if (zInventoryArr.length > 0) fillOpenWorkorders(zInventoryArr);
  }, [zInventoryArr]);
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

      {zIsCheckingOut ? (
        <CheckoutModalScreen openWorkorder={zOpenWorkorderObj} />
      ) : null}
      <LoginModalScreen
        modalVisible={zShowLoginScreen && !zLoginModalVisible}
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
