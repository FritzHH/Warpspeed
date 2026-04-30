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
  useCurrentCustomerStore,
  useActiveSalesStore,
  useCustMessagesStore,
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
import { FullSaleModal } from "./screen_components/modal_screens/FullSaleModal";
import { isSaleID, isLightspeedID } from "./screen_components/modal_screens/newCheckoutModalScreen/newCheckoutUtils";
import { decodeLightspeedBarcode, lightenRGBByPercent } from "../utils";
import { newCheckoutGetStripeReaders, readActiveSale, recoverPendingActiveSales } from "./screen_components/modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import {
  dbListenToSettings,
  dbListenToOpenWorkorders,
  dbListenToCurrentPunchClock,
  dbListenToInventory,
  dbListenToActiveSales,
  dbGetCompletedSale,
  dbListenToActiveMessageThreads,
} from "../db_calls_wrapper";
import { SETTINGS_OBJ, TAB_NAMES, CUSTOMER_PROTO } from "../data";
import { clog, log, recoverPendingAutoTexts, localStorageWrapper } from "../utils";
import { cloneDeep, throttle } from "lodash";
import { ROUTES } from "../routes";

function playNotificationBeep() {
  try {
    let ctx = new (window.AudioContext || window.webkitAudioContext)();
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}

export function BaseScreen() {
  document.title = "Workorders";
  // store getters /////////////////////////////////////////////////////////////////
  const zShowLoginScreen = useLoginStore((state) => state.showLoginScreen);
  const zLoginModalVisible = useLoginStore((state) => state.modalVisible);
  const zRunBackgroundRecognition = useLoginStore(
    (state) => state.runBackgroundRecognition
  );
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);
  const throttledSetLastAction = useRef(throttle(() => {
    useLoginStore.getState().setLastActionMillis();
  }, 1000)).current;

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
  const zSaleModalObj = useOpenWorkordersStore((s) => s.saleModalObj);

  // Detect sale-ID scans to open refund modal
  useEffect(() => {
    if (!zReceiptScan || sRefundModalVisible) return;
    // Fast path for old prefixed IDs
    let knownSale = isSaleID(zReceiptScan);
    if (!knownSale && isLightspeedID(zReceiptScan)) {
      let decoded = decodeLightspeedBarcode(zReceiptScan);
      knownSale = decoded?.type === "sale";
    }
    if (knownSale) {
      _setRefundSaleID(zReceiptScan);
      _setRefundModalVisible(true);
      useCheckoutStore.getState().setStringOnly("");
      return;
    }
    // Async lookup for new random IDs — check if it's a sale
    if (/^\d{12}$/.test(zReceiptScan)) {
      (async () => {
        let sale = await readActiveSale(zReceiptScan);
        if (!sale) sale = await dbGetCompletedSale(zReceiptScan);
        if (sale) {
          _setRefundSaleID(zReceiptScan);
          _setRefundModalVisible(true);
          useCheckoutStore.getState().setStringOnly("");
        }
      })();
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

    // Ping to discover if display is already open (only if secondary display is enabled)
    if (hasSecondary) broadcastDisplayStatus(DISPLAY_STATUS.PING);

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
      // console.log("[CARD_READER] BaseScreen fetchReaders called");
      try {
        let result = await newCheckoutGetStripeReaders();
        let readersArr = result?.data?.data || [];
        // console.log("[CARD_READER] BaseScreen fetchReaders:", readersArr.length, "readers found", readersArr.map(r => ({ id: r.id, label: r.label, status: r.status })));
        useStripePaymentStore.getState().setReadersArr(readersArr);
      } catch (e) {
        console.log("[CARD_READER] BaseScreen fetchReaders ERROR:", e?.message, e);
      }
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
    // Workorders first — small collection, needed immediately for UI
    dbListenToOpenWorkorders((data) => {
      let prev = useOpenWorkordersStore.getState().workorders;
      let newSMS = data.some((wo) => {
        if (!wo.hasNewSMS) return false;
        let old = prev.find((p) => p.id === wo.id);
        return !old || !old.hasNewSMS;
      });
      if (newSMS && localStorage.getItem("warpspeed_sms_sound") !== "false") {
        playNotificationBeep();
      }
      useOpenWorkordersStore.getState().setOpenWorkorders(data);
    });

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

    let activeSalesRecoveryDone = false;
    dbListenToActiveSales((data) => {
      useActiveSalesStore.getState().setActiveSales(data);
      if (!activeSalesRecoveryDone) {
        activeSalesRecoveryDone = true;
        recoverPendingActiveSales(data);
      }
    });

    // SMS threads: load from IndexedDB FIRST, then start Firestore listener
    // (avoids race condition where listener fires against empty state)
    import("../hubMessageDB").then(async (hubDB) => {
      try {
        // First-time setup: if IndexedDB is empty, seed from Firestore
        const initialized = await hubDB.isInitialized();
        if (!initialized) {
          const { dbGetSmsThreadCards } = await import("../db_calls_wrapper");
          const seedResult = await dbGetSmsThreadCards(500);
          if (seedResult?.length > 0) {
            await hubDB.putThreadCards(seedResult);
          }
          await hubDB.setInitialized();
        }

        // Load thread cards from IndexedDB -> Zustand (instant sidebar render)
        const allCards = await hubDB.getAllThreadCards();
        if (allCards.length > 0) {
          useCustMessagesStore.getState().setSmsThreads(allCards);
        }

        // Batch-load 30 most recent conversations (single state update, no write-back)
        const recentPhones = allCards.slice(0, 30).map((c) => c.phone);
        const batch = {};
        for (const phone of recentPhones) {
          const msgs = await hubDB.getMessages(phone);
          if (msgs.length > 0) batch[phone] = { messages: msgs, noMoreHistory: false };
        }
        if (Object.keys(batch).length > 0) {
          useCustMessagesStore.getState().batchSetHubCachedThreads(batch);
        }

        // Purge old conversation messages (60 days inactive)
        hubDB.purgeOldConversations(60);
      } catch (e) {
        log("IndexedDB init error (non-fatal)", e);
      }

      // Start Firestore listener AFTER IndexedDB is loaded so getSmsThreads() is pre-populated
      const threadsUnsub = dbListenToActiveMessageThreads((changes) => {
        const current = useCustMessagesStore.getState().getSmsThreads();
        let updated = [...current];
        changes.forEach(({ type, phone, ...data }) => {
          const idx = updated.findIndex((t) => t.phone === phone);
          if (type === "removed") {
            if (idx !== -1) updated.splice(idx, 1);
          } else {
            const thread = { phone, ...data };
            if (idx !== -1) updated[idx] = thread;
            else updated.push(thread);
          }
        });
        updated.sort((a, b) => b.lastMillis - a.lastMillis);
        useCustMessagesStore.getState().setSmsThreads(updated);
        // Sync changed thread cards to IndexedDB (fire-and-forget)
        changes.forEach(({ type, phone, ...data }) => {
          if (type === "removed") return;
          hubDB.putThreadCard(phone, { phone, ...data });
        });
      });
      useCustMessagesStore.getState().setThreadsUnsub(threadsUnsub);
    });

    // Recover any pending auto-text messages from localStorage (crash recovery)
    recoverPendingAutoTexts();
  }, []);

  // Inactivity timer — clear active workorder/customer after timeout
  useEffect(() => {
    const DEFAULT_TIMEOUT_SECONDS = 120;
    const interval = setInterval(() => {
      const lastAction = useLoginStore.getState().getLastActionMillis();
      const openWorkorderID = useOpenWorkordersStore.getState().openWorkorderID;
      if (!openWorkorderID) return; // nothing to clear
      const timeoutSeconds =
        useSettingsStore.getState().settings?.userInactivityTimeout || DEFAULT_TIMEOUT_SECONDS;
      const elapsedSeconds = (Date.now() - lastAction) / 1000;
      if (elapsedSeconds >= timeoutSeconds) {
        useOpenWorkordersStore.getState().setOpenWorkorderID(null);
        useCurrentCustomerStore.getState().setCustomer({ ...CUSTOMER_PROTO }, false);
        useTabNamesStore.getState().setItems({
          infoTabName: TAB_NAMES.infoTab.customer,
          itemsTabName: TAB_NAMES.itemsTab.empty,
          optionsTabName: TAB_NAMES.optionsTab.workorders,
        });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);


  return (
    <View
      onMouseMove={() => throttledSetLastAction()}
      onKeyUp={() => throttledSetLastAction()}
      style={{
        width: screenWidth,
        height: screenHeight,
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        position: "relative",
      }}
    >

      <style>{`
        @keyframes bannerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      {!!zSaleModalObj && (
        <FullSaleModal
          item={{ saleID: zSaleModalObj.id }}
          onClose={() => useOpenWorkordersStore.getState().setSaleModalObj(null)}
        />
      )}
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
              Double-click anywhere in the secondary display to go Full Screen!
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
          borderColor: C.buttonLightGreen,
          borderWidth: 1,
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
