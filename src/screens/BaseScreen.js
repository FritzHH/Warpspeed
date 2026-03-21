/* eslint-disable */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native-web";
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
  useCustMessagesStore,
  broadcastWorkorderToDisplay,
} from "../stores";
import {
  onDisplayStatusMessage,
  broadcastDisplayStatus,
  DISPLAY_STATUS,
} from "../broadcastChannel";
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
  dbListenToCustomerMessages,
} from "../db_calls_wrapper";
import { SETTINGS_OBJ, TAB_NAMES } from "../data";
import { clog, log } from "../utils";
import { cloneDeep, throttle } from "lodash";
import { ROUTES } from "../routes";

export function BaseScreen() {
  // store getters /////////////////////////////////////////////////////////////////
  const zShowLoginScreen = useLoginStore((state) => state.showLoginScreen);
  const zLoginModalVisible = useLoginStore((state) => state.modalVisible);
  const zRunBackgroundRecognition = useLoginStore(
    (state) => state.runBackgroundRecognition
  );
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);
  const zCustomerCell = useCurrentCustomerStore((state) => state.customer?.cell);

  const throttledSetLastAction = useRef(throttle(() => {
    useLoginStore.getState().setLastActionMillis();
  }, 5000)).current;

  // display window status — "closed" until display broadcasts otherwise
  const [sDisplayStatus, _setDisplayStatus] = useState(DISPLAY_STATUS.CLOSED);
  const [sDisplayLoading, _setDisplayLoading] = useState(false);

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

  // display status listener — re-broadcast current workorder when display window opens
  useEffect(() => {
    let unsub = onDisplayStatusMessage((msg) => {
      _setDisplayStatus(msg.status);
      if (msg.status === DISPLAY_STATUS.OPEN || msg.status === DISPLAY_STATUS.VISIBLE) {
        _setDisplayLoading(false);
        let wo = useOpenWorkordersStore.getState().getOpenWorkorder();
        if (wo) broadcastWorkorderToDisplay(wo);
      }
    });
    // Ping to discover if display is already open
    broadcastDisplayStatus(DISPLAY_STATUS.PING);
    return () => unsub();
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

  // message listener — subscribes to customer_phone/{phone}/messages when active customer has a cell
  useEffect(() => {
    if (!zCustomerCell) {
      useCustMessagesStore.getState().clearMessages();
      return;
    }
    let unsubscribe = dbListenToCustomerMessages(zCustomerCell, (messages) => {
      let incoming = messages.filter((m) => m.type === "incoming");
      let outgoing = messages.filter((m) => m.type === "outgoing");
      useCustMessagesStore.getState().setIncomingMessages(incoming);
      useCustMessagesStore.getState().setOutgoingMessages(outgoing);
    });
    return () => {
      if (unsubscribe) unsubscribe();
      useCustMessagesStore.getState().clearMessages();
    };
  }, [zCustomerCell]);


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
        {(sDisplayStatus === DISPLAY_STATUS.CLOSED ||
          sDisplayStatus === DISPLAY_STATUS.HIDDEN) && (
            <View
              style={{
                height: 25,
                width: "95%",
                alignSelf: 'center',
                flexDirection: "row",
                alignItems: "center",
                justifyContent: 'center',
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: C.red,
                borderRadius: 5,
                // marginBottom: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  color: C.textWhite,
                  fontWeight: "600",
                }}
              >
                Customer screen is closed
              </Text>
              <TouchableOpacity
                disabled={sDisplayLoading}
                onPress={async () => {
                  if (sDisplayLoading) return;
                  _setDisplayLoading(true);
                  let storeName = useSettingsStore.getState().getSettings()?.storeInfo?.displayName || "";
                  let title = storeName ? `${storeName} Checkout Display` : "Checkout Display";
                  let screenDetails = null;
                  let secondScreen = null;
                  if (window.getScreenDetails) {
                    try {
                      screenDetails = await window.getScreenDetails();
                      let currentScreen = screenDetails.currentScreen;
                      secondScreen = screenDetails.screens.find(
                        (s) => s.label !== currentScreen.label
                      );
                    } catch (e) { }
                  }
                  let features = secondScreen
                    ? `popup,left=${secondScreen.left},top=${secondScreen.top},width=${secondScreen.width},height=${secondScreen.height}`
                    : "popup,width=1024,height=768";
                  let win = window.open(ROUTES.display, "customerDisplay", features);
                  if (win) {
                    win.addEventListener("load", () => {
                      win.document.title = title;
                    });
                  } else {
                    _setDisplayLoading(false);
                  }
                }}
                style={{ marginLeft: 10, paddingHorizontal: 12, paddingVertical: 2, backgroundColor: C.green, borderRadius: 5, opacity: sDisplayLoading ? 0.5 : 1 }}
              >
                {sDisplayLoading ? (
                  <ActivityIndicator size="small" color={C.textWhite} />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      color: C.textWhite,
                      fontWeight: "600",
                    }}
                  >
                    Open
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
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
