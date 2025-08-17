/* eslint-disable */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import { Button } from "react-native-web";
import { APP_BASE_COLORS, Colors, ViewStyles } from "../styles";

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
import { LoginScreenModalComponent, SHADOW_RADIUS_PROTO } from "../components";
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
  useAppCurrentUserStore,
  useLoginStore,
} from "../stores";
import { dbSearchForPhoneNumber } from "../db_call_wrapper";

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

  // local state ////////////////////////////////////////////////////////////////////////
  const [windowDimensions, setWindowDimensions] = useState({
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
  });
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
    getRealtimeNodeItem("SETTINGS").then((res) => _zSetSettingsObj(res));
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

  // return (
  //   <View
  //     style={{
  //       // flex: 1,
  //       width: screenWidth,
  //       height: screenHeight,
  //       flexDirection: "row",
  //       justifyContent: "space-around",
  //       backgroundColor: "green",
  //     }}
  //   />
  // );

  return (
    <View
      style={{
        // flex: 1,
        width: screenWidth,
        height: screenHeight,
        flexDirection: "row",
        justifyContent: "space-around",
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
        }}
      >
        <View
          style={{
            width: "100%",
            height: "65%",
            flexDirection: "row",
            justifyContent: "flex-start",
          }}
        >
          <View
            style={{
              width: "33%",
              // height: "40%",
              // backgro
            }}
          >
            <Info_Section />
          </View>
          <View
            style={{
              width: "66%",
              height: "100%",
              backgroundColor: APP_BASE_COLORS.backgroundWhite,
              borderColor: APP_BASE_COLORS.buttonLightGreen,
              borderWidth: 1,
              borderRadius: 15,
              // backgroundColor: "red",
              shadowColor: APP_BASE_COLORS.green,
              shadowOffset: {
                width: 4,
                height: 4,
              },
              shadowOpacity: 0.5,
              shadowRadius: 15,
            }}
          >
            <Items_Section />
          </View>
        </View>
        <View
          style={{
            width: "100%",
            height: "35%",
          }}
        >
          <Notes_Section />
        </View>
      </View>
      <View
        style={{
          width: "35%",
          height: "100%",
          backgroundColor: APP_BASE_COLORS.backgroundWhite,
          borderColor: APP_BASE_COLORS.green,
          borderWidth: 1,
          borderRadius: 15,
          // backgroundColor: "red",
          shadowColor: APP_BASE_COLORS.green,
          shadowOffset: {
            width: 4,
            height: 4,
          },
          shadowOpacity: 0.5,
          shadowRadius: 15,
        }}
      >
        <Options_Section />
      </View>
    </View>
  );
}
