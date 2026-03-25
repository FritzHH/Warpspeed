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
  useStripePaymentStore,
  broadcastWorkorderToDisplay,
} from "../stores";
import {
  onDisplayStatusMessage,
  broadcastDisplayStatus,
  DISPLAY_STATUS,
} from "../broadcastChannel";
import { FaceDetectionClientComponent } from "../faceDetection";
import { NewCheckoutModalScreen } from "./screen_components/modal_screens/newCheckoutModalScreen/NewCheckoutModalScreen";
import { NewRefundModalScreen } from "./screen_components/modal_screens/newCheckoutModalScreen/NewRefundModalScreen";
import { isSaleID, isLightspeedID } from "./screen_components/modal_screens/newCheckoutModalScreen/newCheckoutUtils";
import { decodeLightspeedBarcode } from "../utils";
import { newCheckoutGetStripeReaders } from "./screen_components/modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import {
  dbListenToSettings,
  dbListenToOpenWorkorders,
  dbListenToCurrentPunchClock,
  dbListenToInventory,
} from "../db_calls_wrapper";
import { SETTINGS_OBJ, TAB_NAMES } from "../data";
import { clog, log, recoverPendingAutoTexts } from "../utils";
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
  const throttledSetLastAction = useRef(throttle(() => {
    useLoginStore.getState().setLastActionMillis();
  }, 5000)).current;

  // display window status — "closed" until display broadcasts otherwise
  const [sDisplayStatus, _setDisplayStatus] = useState(DISPLAY_STATUS.CLOSED);
  const [sDisplayLoading, _setDisplayLoading] = useState(
    localStorage.getItem("warpspeed_has_secondary_display") === "true"
  );
  const [sDisplayFullscreen, _setDisplayFullscreen] = useState(false);
  const [sDisplayHeartbeatAlive, _setDisplayHeartbeatAlive] = useState(false);

  // Poll display heartbeat from localStorage
  useEffect(() => {
    function checkHeartbeat() {
      let raw = localStorage.getItem("warpspeed_display_heartbeat");
      if (!raw) {
        _setDisplayFullscreen(false);
        _setDisplayHeartbeatAlive(false);
        return;
      }
      try {
        let hb = JSON.parse(raw);
        let stale = Date.now() - hb.timestamp > 10000;
        _setDisplayFullscreen(!stale && hb.fullscreen === true);
        _setDisplayHeartbeatAlive(!stale && hb.open === true);
      } catch (e) {
        _setDisplayFullscreen(false);
        _setDisplayHeartbeatAlive(false);
      }
    }
    checkHeartbeat();
    let interval = setInterval(checkHeartbeat, 1000);
    return () => clearInterval(interval);
  }, []);

  async function openDisplayWindow() {
    _setDisplayLoading(true);
    let storeName = useSettingsStore.getState().getSettings()?.storeInfo?.displayName || "";
    let title = storeName ? `${storeName} Checkout Display` : "Checkout Display";
    let screenDetails = null;
    let secondScreen = null;
    if (window.getScreenDetails) {
      try {
        screenDetails = await window.getScreenDetails();
        let currentScreen = screenDetails.currentScreen;
        secondScreen = screenDetails.screens.find((s) => s.label !== currentScreen.label);
      } catch (e) { }
    }
    let features = secondScreen
      ? `popup,left=${secondScreen.left},top=${secondScreen.top},width=${secondScreen.width},height=${secondScreen.height}`
      : "popup,width=1024,height=768";
    let win = window.open(ROUTES.display, "customerDisplay", features);
    if (win) {
      win.focus();
      win.addEventListener("load", () => { win.document.title = title; });
      return true;
    } else {
      _setDisplayLoading(false);
      return false;
    }
  }

  // new checkout refund modal state
  const [sRefundModalVisible, _setRefundModalVisible] = useState(false);
  const [sRefundSaleID, _setRefundSaleID] = useState("");

  const zReceiptScan = useCheckoutStore((state) => state.receiptScan);

  // Detect sale-ID scans to open refund modal (prefix 3 = Warpspeed sale, prefix 22 = LS sale)
  useEffect(() => {
    if (!zReceiptScan || sRefundModalVisible) return;
    let isSale = isSaleID(zReceiptScan);
    if (!isSale && isLightspeedID(zReceiptScan)) {
      let decoded = decodeLightspeedBarcode(zReceiptScan);
      isSale = decoded?.type === "sale";
    }
    if (isSale) {
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
  // auto-open + auto-reopen when "secondary display attached" is enabled in localStorage
  useEffect(() => {
    let popupBlocked = false;
    const hasSecondary = localStorage.getItem("warpspeed_has_secondary_display") === "true";

    let unsub = onDisplayStatusMessage((msg) => {
      console.log("[Dashboard] display status received:", msg.status);
      _setDisplayStatus(msg.status);
      if (msg.status === DISPLAY_STATUS.WINDOWED) {
        console.log("[Dashboard] WARNING: display is NOT in full-screen mode");
      }
      if (msg.status === DISPLAY_STATUS.OPEN || msg.status === DISPLAY_STATUS.VISIBLE) {
        _setDisplayLoading(false);
        popupBlocked = false;
        let wo = useOpenWorkordersStore.getState().getOpenWorkorder();
        if (wo) broadcastWorkorderToDisplay(wo);
      }
      // Auto-reopen on close if secondary display is configured
      if (msg.status === DISPLAY_STATUS.CLOSED && hasSecondary && !popupBlocked) {
        openDisplayWindow().then((success) => {
          if (!success) popupBlocked = true;
        });
      }
    });

    // Ping to discover if display is already open
    broadcastDisplayStatus(DISPLAY_STATUS.PING);

    // Auto-open on mount if secondary display is configured and display is not already open
    let autoOpenTimer = null;
    if (hasSecondary) {
      autoOpenTimer = setTimeout(() => {
        let raw = localStorage.getItem("warpspeed_display_heartbeat");
        let alive = false;
        if (raw) {
          try {
            let hb = JSON.parse(raw);
            alive = hb.open === true && (Date.now() - hb.timestamp) < 10000;
          } catch (e) {}
        }
        if (!popupBlocked && !alive) {
          openDisplayWindow().then((success) => {
            if (!success) popupBlocked = true;
          });
        }
      }, 1500);
    }

    return () => {
      unsub();
      if (autoOpenTimer) clearTimeout(autoOpenTimer);
    };
  }, []);

  // Pre-load Stripe card readers on mount + refresh every 5 minutes
  useEffect(() => {
    async function fetchReaders() {
      try {
        let result = await newCheckoutGetStripeReaders();
        let readersArr = result?.data?.data || [];
        useStripePaymentStore.getState().setReadersArr(readersArr);
      } catch (e) {}
    }
    fetchReaders();
    let interval = setInterval(fetchReaders, 5 * 60 * 1000);
    return () => clearInterval(interval);
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

    // Recover any pending auto-text messages from localStorage (crash recovery)
    recoverPendingAutoTexts();
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

      <style>{`
        @keyframes bannerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
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
        {localStorage.getItem("warpspeed_has_secondary_display") === "true" &&
          (sDisplayStatus === DISPLAY_STATUS.CLOSED ||
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
              onPress={() => openDisplayWindow()}
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
        {!sDisplayFullscreen && sDisplayStatus !== DISPLAY_STATUS.CLOSED && sDisplayStatus !== DISPLAY_STATUS.HIDDEN && (
          <div
            style={{
              height: 25,
              width: "95%",
              alignSelf: 'center',
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: 'center',
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 4,
              paddingBottom: 4,
              backgroundColor: 'yellow',
              borderRadius: 5,
              animation: "bannerPulse 1.5s ease-in-out infinite",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                color: 'red',
                fontWeight: "600",
              }}
            >
              Please press the Full-Screen button on the Customer Display!
            </Text>
          </div>
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
