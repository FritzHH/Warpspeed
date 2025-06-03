/* eslint-disable */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  bike_colors_arr_db,
  COLLECTION_NAMES,
  system_users_db,
  CUSTOMER_PROTO,
  INFO_COMPONENT_NAMES,
  TAB_NAMES,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
  test_inventory,
  ADJUSTABLE_BUTTON_SIZE_OPTIONS_ARR,
  DEFAULT_USER_PREFERENCES,
  WORKORDER_STATUS_NAMES,
  RECEIPT_WORKORDER_PROTO,
  printer_names,
  RECEIPT_TYPES,
  SMS_PROTO,
} from "../data";
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
import {
  AlertBox,
  LoginScreenComponent,
  SHADOW_RADIUS_PROTO,
} from "../components";
import { Info_Section } from "./screen_collections/Info_Section";
import { Items_Section } from "./screen_collections/Items_Section";
import { Options_Section } from "./screen_collections/Options_Section";
import { Notes_Section } from "./screen_collections/Notes_Section";
import {
  getCollection,
  getCollectionItem,
  getNewCollectionRef,
  sendSMS,
  setFirestoreCollectionItem,
  setCustomer,
  subscribeToCollectionNode,
  subscribeToNodeAddition,
  subscribeToNodeChange,
  subscribeToNodeRemoval,
  getRealtimeNodeItem,
} from "../db";
import {
  fillCustomers,
  fillInventory,
  fillOpenWorkorders,
  fillPreferences,
  sendTestMessage,
  testNode,
  testPayment,
} from "../testing";
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
  useCurrentUserStore,
  USER_ACTION_GLOBAL,
  useWaitForLoginStore,
} from "../stores";

export function WorkorderScreen() {
  // setters ////////////////////////////////////////////////////////////////
  const _zModCustPreviewItem = useCustomerPreviewStore(
    (state) => state.modItem
  );
  const _zModWorkorderItem = useOpenWorkordersStore((state) => state.modItem);
  const _zModInventoryItem = useInventoryStore((state) => state.modItem);
  const _zSetSettingsItem = useSettingsStore((state) => state.setSettingsItem);
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);
  const _zSetLastActionMillis = useActionStore(
    (state) => state.setLastActionMillis
  );
  const _zSetUserObj = useCurrentUserStore((state) => state.setCurrentUser);
  const _zSetShowLoginScreen = useWaitForLoginStore(
    (state) => state.setShowLoginScreen
  );

  // getters /////////////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zLastActionMillis = useActionStore((state) =>
    state.getLastActionMillis()
  );
  const zShowLoginScreen = useWaitForLoginStore((state) =>
    state.getShowLoginScreen()
  );
  const zLoginFunctionCallback = useWaitForLoginStore((state) =>
    state.getLoginFunctionCallback()
  );

  //////////////////////////////////////////////////////////////////////////////
  const [sInitFlag, _setInitFlag] = React.useState(false);
  const [sShowUserPinInputBox, _setShowUserPinInputBox] = React.useState(false);

  // subscribe to database listeners
  useEffect(() => {
    openWorkordersSubscribe(_zModWorkorderItem);
    inventorySubscribe(_zModInventoryItem);
    customerPreviewListSubscribe(_zModCustPreviewItem);
    settingsSubscribe(_zSetSettingsItem); // subscribe to changes only
    getRealtimeNodeItem("SETTINGS").then((res) => _zSetSettingsObj(res));
  }, []);

  useEffect(() => {
    // set the global login timeout from settings
    if (zSettingsObj.loginTimeout)
      USER_ACTION_GLOBAL.init(zSettingsObj.loginTimeout);
    if (zSettingsObj.users) USER_ACTION_GLOBAL.setUser(zSettingsObj.users[0]);
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
      fillPreferences();
      _setInitFlag(true);
    }
  }
  initialize();

  // log("rendering");
  return (
    <div
      onKeyUp={() => USER_ACTION_GLOBAL.set()}
      onMouseMove={() => USER_ACTION_GLOBAL.set()}
      style={{ width: "100%" }}
    >
      <View
        style={{
          flex: 1,
          // width: "100%",
          // height: "100%",
          flexDirection: "row",
          justifyContent: "space-around",
        }}
      >
        <LoginScreenComponent
          modalVisible={zShowLoginScreen}
          loginCallback={() => zLoginFunctionCallback()}
          _setModalVisibility={() => _zSetShowLoginScreen(false)}
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
              }}
            >
              <Info_Section />
            </View>
            <View
              style={{
                width: "66%",
                height: "100%",
                backgroundColor: Colors.opacityBackgroundLight,
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
