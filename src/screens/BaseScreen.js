/* eslint-disable */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import { Button } from "react-native-web";
import { Colors, ViewStyles } from "../styles";

import {
  dim,
  formatDateTime,
  generateBarcode,
  generateRandomID,
  log,
  useInterval,
} from "../utils";
import { LoginScreenModalComponent, SHADOW_RADIUS_PROTO } from "../components";
import { Info_Section } from "./screen_collections/Info_Section";
import { Items_Section } from "./screen_collections/Items_Section";
import { Options_Section } from "./screen_collections/Options_Section";
import { Notes_Section } from "./screen_collections/Notes_Section";
import { getRealtimeNodeItem } from "../db";
import { fillPreferences, fillPrinterNames, fillReceipt } from "../testing";
import {
  customerPreviewListSubscribe,
  inventorySubscribe,
  openWorkordersSubscribe,
  settingsSubscribe,
} from "../db_subscriptions";
import {
  useCustomerPreviewStore,
  useInventoryStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useActionStore,
  useAppCurrentUserStore,
  useLoginStore,
} from "../stores";

export function BaseScreen() {
  // setters ////////////////////////////////////////////////////////////////
  const _zModCustPreviewItem = useCustomerPreviewStore(
    (state) => state.modItem
  );
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

  // getters /////////////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());
  const zModalVisible = useLoginStore((state) => state.getModalVisible());
  //////////////////////////////////////////////////////////////////////////////
  const [sInitFlag, _setInitFlag] = React.useState(false);
  <script src="https://js.stripe.com/terminal/v1/"></script>;

  // subscribe to database listeners
  useEffect(() => {
    openWorkordersSubscribe(_zModWorkorderItem);
    inventorySubscribe(_zModInventoryItem);
    customerPreviewListSubscribe(_zModCustPreviewItem);
    settingsSubscribe(_zSetSettingsItem); // subscribe to changes only
    getRealtimeNodeItem("SETTINGS").then((res) => _zSetSettingsObj(res));
  }, []);

  useEffect(() => {
    if (zSettingsObj.loginTimeout) _zSetLoginTimeout(zSettingsObj.loginTimeout);

    // testing take out this is your user obj
    if (zSettingsObj.users) _zSetCurrentUserObj(zSettingsObj.users[0]);
  }, [zSettingsObj]);

  // timer
  useEffect(() => {
    function tick() {}
    let id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, []);

  // testing
  async function initialize() {
    if (!sInitFlag) {
      // fillReceipt();
      // fillPrinterNames();
      fillPreferences();
      _setInitFlag(true);
    }
  }
  initialize();

  return (
    <div
      onKeyUp={() => {
        _zSetLastActionMillis();
      }}
      onMouseMove={() => {
        _zSetLastActionMillis();
      }}
      style={{ width: "100%" }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          justifyContent: "space-around",
        }}
      >
        <LoginScreenModalComponent
          modalVisible={zShowLoginScreen && !zModalVisible}
        />
        <View
          style={{
            width: "65%",
            backgroundColor: Colors.mainBackground,
            paddingLeft: 5,
          }}
        >
          <View
            style={{
              width: "100%",
              height: dim.windowHeight * 0.65,
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
                backgroundColor: Colors.opacityBackgroundLight,
                // backgroundColor: "red",
                ...SHADOW_RADIUS_PROTO,
              }}
            >
              <Items_Section />
            </View>
          </View>
          <View
            style={{
              width: "100%",
              height: dim.windowHeight * 0.35,
            }}
          >
            <Notes_Section />
          </View>
        </View>
        <View
          style={{
            width: "35%",
            height: dim.windowHeight,
            backgroundColor: Colors.opacityBackgroundLight,
          }}
        >
          <Options_Section />
        </View>
      </View>
    </div>
  );
}
