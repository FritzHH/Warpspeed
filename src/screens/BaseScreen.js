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
  useAlertScreenStore,
} from "../stores";
import { createStore, createTenant, signOutUser } from "../db";
import { FaceDetectionClientComponent } from "../faceDetectionClient";
import { DB_BATCH_INTERVAL_MILLIS } from "../constants";
import { fillInventory, fillOpenWorkorders, fillSettings } from "../testing";
import { CheckoutModalScreen } from "./screen_components/modal_screens/CheckoutModalScreen";
import { dbLogout, dbSaveSettings, dbGetSettings, dbGetOpenWorkorders, dbGetInventoryItems, dbListenToSettings, dbListenToOpenWorkorders, dbListenToCurrentPunchClock, dbListenToInventory } from "../db_calls_wrapper";
import { SETTINGS_OBJ } from "../data";
import { clog, log } from "../utils";

export function BaseScreen() {
  // store setters ////////////////////////////////////////////////////////////////

  const _zSetLastActionMillis = useLoginStore(
    (state) => state.setLastActionMillis
  );

  // testing
  // const _zSetCurrentUserObj = useLoginStore((state) => state.setCurrentUserObj);

  // store getters /////////////////////////////////////////////////////////////////
  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.getOpenWorkorder()
  );
  const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());
  const zLastDatabaseBatchMillis = useDatabaseBatchStore((state) =>
    state.getLastBatchMillis()
  );
  const zLastDatabaseWriteMillis = useDatabaseBatchStore((state) =>
    state.getLastWriteMillis()
  );
  const zSettings = useSettingsStore((state) => state.getSettings());
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());
  const zLoginModalVisible = useLoginStore((state) => state.getModalVisible());
  const zRunBackgroundRecognition = useLoginStore((state) =>
    state.getRunBackgroundRecognition()
  );
  const zPauseAlertOnBaseComponent = useAlertScreenStore((state) =>
    state.getPauseOnBaseComponent()
  );
  const zShowAlert = useAlertScreenStore((state) => state.getShowAlert());

  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());

  // local state ////////////////////////////////////////////////////////////////////////
  const [screenWidth, _setScreenWidth] = useState(window.innerWidth);
  const [screenHeight, _setScreenHeight] = useState(window.innerHeight);

  // auto window resizing
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

  ////////  testing    //////////////////////////////////////////////////////////////////////

  // testing, build db items
  useEffect(() => {
    // dbSaveSettings(SETTINGS_OBJ, '1234', '999')
    // dbGetSettings('1234', '999').then(res => {
    //   useSettingsStore.getState().setSettings(res)
    // dbGetOpenWorkorders('1234', '999').then(res => {
    //   useOpenWorkordersStore.getState().setEntireArr(res)
    //   // log('res', res)
    // })
    //   dbGetInventoryItems('1234', '999').then(res => {
    //     // log('inventory', res)
    //     useInventoryStore.getState().setItems(res)
    //   })
    // log('res', res)
    // fillInventory()
    // })
  }, []);
  // }, []);

  ////////// testing   ////////////////////////////////////////////////////////////////////

  // subscribe to database listeners
  useEffect(() => {
    // tested!!
    dbListenToSettings((data) => {
      // log("settings", data.users[0].faceDescriptor);
      useSettingsStore.getState().setSettings(data, false, false);
    });

    dbListenToCurrentPunchClock((data) => {
      // log('punch', data)
      useLoginStore.getState().setPunchClock(data);
      // log("punch clock data", data);
    });

    dbListenToInventory((data) => {
      useInventoryStore.getState().setItems(data);
      // log("inventory", data);
    });

    /// not tested :(

    dbListenToOpenWorkorders((data) => {
      // log("incoming workorder listen", data);
      useOpenWorkordersStore.getState().setOpenWorkorders(data);
    });
  }, []);

  useEffect(() => {
    // try {
    //   _zSetLoginTimeout(zSettingsObj?.loginTimeout);
    //   // testing take out this is your user obj
    //   // _zSetCurrentUserObj(zSettingsObj?.users[0]);
    // } catch (e) {}
  }, [zSettings]);

  // database batching
  useEffect(() => {
    // const intervalId = setInterval(() => {
    //   let curMillis = new Date().getTime();
    //   let diff = curMillis - zLastDatabaseWriteMillis;
    //   // let batchDiff = curMillis - batchDiff
    //   // log("diff", diff);
    //   if (diff > DB_BATCH_INTERVAL_MILLIS) executeDBBatch();
    // }, 100);
    // // Cleanup function to clear the interval
    // return () => {
    //   clearInterval(intervalId);
    // };
  }, [zLastDatabaseBatchMillis, zLastDatabaseWriteMillis]);

  return (
    <View
      style={{
        width: screenWidth,
        height: screenHeight,
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        position: "relative",
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

      {!!zIsCheckingOut && (
        <CheckoutModalScreen openWorkorder={zOpenWorkorder} />
      )}
      <LoginModalScreen
        modalVisible={zShowLoginScreen && !zLoginModalVisible}
      />

      {!!zRunBackgroundRecognition && <FaceDetectionClientComponent />}
      {!!(!zPauseAlertOnBaseComponent && zShowAlert) && <AlertBox_ />}
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
