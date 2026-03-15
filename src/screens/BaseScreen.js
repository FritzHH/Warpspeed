/* eslint-disable */

import React, { useEffect, useRef, useState } from "react";
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

import {
  useOpenWorkordersStore,
  useSettingsStore,
  useInventoryStore,
  useLoginStore,
  useCheckoutStore,
  useAlertScreenStore,
  useTabNamesStore,
  useCurrentCustomerStore,
} from "../stores";
import { FaceDetectionClientComponent } from "../faceDetectionClient";
import { NewCheckoutModalScreen } from "./screen_components/modal_screens/newCheckoutModalScreen/NewCheckoutModalScreen";
import { NewRefundModalScreen } from "./screen_components/modal_screens/newCheckoutModalScreen/NewRefundModalScreen";
import { isSaleID } from "./screen_components/modal_screens/newCheckoutModalScreen/newCheckoutUtils";
import {
  dbListenToSettings,
  dbListenToOpenWorkorders,
  dbListenToCurrentPunchClock,
  dbListenToInventory,
  dbGetCustomer,
} from "../db_calls_wrapper";
import { SETTINGS_OBJ, TAB_NAMES } from "../data";
import { clog, log } from "../utils";
import { cloneDeep, throttle } from "lodash";

export function BaseScreen() {
  // store getters /////////////////////////////////////////////////////////////////
  const zShowLoginScreen = useLoginStore((state) => state.showLoginScreen);
  const zLoginModalVisible = useLoginStore((state) => state.modalVisible);
  const zRunBackgroundRecognition = useLoginStore(
    (state) => state.runBackgroundRecognition
  );
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);

  const throttledSetLastAction = useRef(throttle(() => {
    useLoginStore.getState().setLastActionMillis();
  }, 5000)).current;

  // new checkout refund modal state
  const [sRefundModalVisible, _setRefundModalVisible] = useState(false);
  const [sRefundSaleID, _setRefundSaleID] = useState("");

  const zReceiptScan = useCheckoutStore((state) => state.receiptScan);

  // Detect sale-ID scans (starts with "s") to open refund modal
  useEffect(() => {
    if (zReceiptScan && isSaleID(zReceiptScan) && !sRefundModalVisible) {
      _setRefundSaleID(zReceiptScan);
      _setRefundModalVisible(true);
      useCheckoutStore.getState().setStringOnly("");
    }
  }, [zReceiptScan]);

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

  // log open workorders on change
  let workordersLength = useOpenWorkordersStore(s => s.workorders.length)
  useEffect(() => {
    let workorders = useOpenWorkordersStore.getState().workorders;
    log('workorders', workorders)
  }, [workordersLength])
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
        onKeyUp={() => throttledSetLastAction()}
        onMouseMove={() => throttledSetLastAction()}
        style={{ width: "100%", height: 0 }}
      />

      <NewCheckoutModalScreen />
      <NewRefundModalScreen
        visible={sRefundModalVisible}
        saleID={sRefundSaleID}
        onClose={() => {
          _setRefundModalVisible(false);
          _setRefundSaleID("");
        }}
      />
      <LoginModalScreen
        modalVisible={zShowLoginScreen && !zLoginModalVisible}
      />

      {!!zRunBackgroundRecognition && <FaceDetectionClientComponent />}
      {/* {!!(!zPauseAlertOnBaseComponent && zShowAlert) && <AlertBox_ />} */}
      <AlertBox_ showAlert={zShowAlert} />
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
