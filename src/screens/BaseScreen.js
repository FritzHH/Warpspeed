/* eslint-disable */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import { Button } from "react-native-web";
import { APP_BASE_COLORS, Colors, ICONS, ViewStyles } from "../styles";

import {
  clog,
  dim,
  formatDateTime,
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
import { getRealtimeNodeItem, searchCollection } from "../db";
import { fillPreferences, fillPrinterNames, fillReceipt } from "../testing";
import {
  customerPreviewListSubscribe,
  inventorySubscribe,
  openWorkordersSubscribe,
  settingsSubscribe,
} from "../db_subscription_wrapper";
import {
  useCustomerPreviewStore,
  useInventoryStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useActionStore,
  useLoginStore,
} from "../stores";
import { dbSearchForPhoneNumber } from "../db_call_wrapper";
import { FaceDetectionComponent } from "../faceDetectionClient";

export function BaseScreen() {
  // store setters ////////////////////////////////////////////////////////////////
  const _zModWorkorderItem = useOpenWorkordersStore((state) => state.modItem);
  const _zModInventoryItem = useInventoryStore((state) => state.modItem);
  const _zSetSettingsItem = useSettingsStore((state) => state.setSettingsItem);
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);
  const _zSetLastActionMillis = useLoginStore(
    (state) => state.setLastActionMillis
  );
  const _zSetLoginTimeout = useLoginStore((state) => state.setLoginTimeout);

  // testing
  const _zSetCurrentUserObj = useLoginStore((state) => state.setCurrentUserObj);

  // store getters /////////////////////////////////////////////////////////////////
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
    openWorkordersSubscribe(_zModWorkorderItem);
    inventorySubscribe(_zModInventoryItem);
    settingsSubscribe(_zSetSettingsItem); // subscribe to changes only
    // have to do a one-off get due to only subscribing to changes in SETTINGS
    getRealtimeNodeItem("SETTINGS").then((res) => {
      // log(res);
      _zSetSettingsObj(res);
    });
  }, []);

  useEffect(() => {
    try {
      _zSetLoginTimeout(zSettingsObj?.loginTimeout);
      // testing take out this is your user obj
      _zSetCurrentUserObj(zSettingsObj?.users[0]);
    } catch (e) {}
  }, [zSettingsObj]);

  // timer
  useEffect(() => {
    function tick() {}
    let id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, []);

  // testing, build db items
  useEffect(() => {
    // fillReceipt();
    // fillPrinterNames();
    // fillPreferences();
  }, []);

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
      <View
        style={{
          width: "65%",
          backgroundColor: APP_BASE_COLORS.backgroundWhite,
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
              backgroundColor: APP_BASE_COLORS.backgroundWhite,
              borderColor: APP_BASE_COLORS.buttonLightGreen,
              borderWidth: 1,
              borderRadius: 15,
              shadowColor: APP_BASE_COLORS.green,
              shadowOffset: {
                width: 1,
                height: 1,
              },
              shadowOpacity: 0.5,
              shadowRadius: 10,
            }}
          >
            {zRunBackgroundRecognition ? <FaceDetectionComponent /> : null}
            <AlertBox_ />
            <Info_Section />
          </View>
          <View
            style={{
              width: "65%",
              height: "100%",
              backgroundColor: APP_BASE_COLORS.backgroundWhite,
              borderColor: APP_BASE_COLORS.buttonLightGreen,
              borderWidth: 1,
              borderRadius: 15,
              // backgroundColor: "red",
              shadowColor: APP_BASE_COLORS.green,
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
            backgroundColor: APP_BASE_COLORS.backgroundWhite,
            borderColor: APP_BASE_COLORS.buttonLightGreen,
            borderWidth: 1,
            borderRadius: 15,
            // backgroundColor: "red",
            shadowColor: APP_BASE_COLORS.green,
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
          backgroundColor: APP_BASE_COLORS.backgroundWhite,
          // borderColor: APP_BASE_COLORS.green,
          // borderWidth: 1,
          borderRadius: 15,
          shadowColor: APP_BASE_COLORS.green,
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
