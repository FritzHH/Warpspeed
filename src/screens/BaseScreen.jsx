/* eslint-disable */

import React, { useEffect, useRef, useState, Suspense, lazy } from "react";
import { C, Colors, ICONS, ViewStyles } from "../styles";

import { AlertBox, LoginModal, SmallLoadingIndicator, SuperUserBanner, BillingSuspensionBanner } from "../dom_components";
import { Info_Section } from "./screen_collections/Info_Section";
import styles from "./BaseScreen.module.css";
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
  useEmailStore,
  useOrderingModalStore,
  useInventoryReconciliationModalStore,
  usePhoneConfigStore,
  broadcastWorkorderToDisplay,
} from "../stores";
import {
  onDisplayStatusMessage,
  broadcastDisplayStatus,
  DISPLAY_STATUS,
} from "../broadcastChannel";
const FaceDetectionClientComponent = lazy(() =>
  import("../faceDetection").then((m) => ({
    default: m.FaceDetectionClientComponent,
  }))
);
import { NewCheckoutModalScreen } from "./screen_components/modal_screens/newCheckoutModalScreen/NewCheckoutModalScreen";
const NewRefundModalScreen = lazy(() =>
  import("./screen_components/modal_screens/newCheckoutModalScreen/NewRefundModalScreen").then((m) => ({ default: m.NewRefundModalScreen }))
);
const FullSaleModal = lazy(() =>
  import("../dom_components/FullSaleModal/FullSaleModal").then((m) => ({ default: m.FullSaleModal }))
);
const OrderingModalScreen = lazy(() =>
  import("./screen_components/modal_screens/OrderingModalScreen/OrderingModalScreen").then((m) => ({ default: m.OrderingModalScreen }))
);
const InventoryReconciliationModalScreen = lazy(() =>
  import("./screen_components/modal_screens/InventoryReconciliationModalScreen/InventoryReconciliationModalScreen").then((m) => ({ default: m.InventoryReconciliationModalScreen }))
);
const UserMessagesModalForLogin = lazy(() =>
  import("./screen_components/modal_screens/UserMessagesModal").then((m) => ({ default: m.UserMessagesModal }))
);
import { isSaleID, isLightspeedID } from "./screen_components/modal_screens/newCheckoutModalScreen/newCheckoutUtils";
import { decodeLightspeedBarcode, lightenRGBByPercent } from "../utils";
import { newCheckoutGetStripeReaders, readActiveSale, recoverPendingActiveSales } from "./screen_components/modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { AUTH, firestoreSubscribe, firestoreSubscribeCollection } from "../db_calls";
import {
  dbListenToSettings,
  dbListenToPhoneConfig,
  dbListenToTenantUsers,
  dbListenToOpenWorkorders,
  dbListenToCurrentPunchClock,
  dbListenToInAppMessages,
  dbListenToInventory,
  dbListenToActiveSales,
  dbGetCompletedSale,
  dbListenToActiveMessageThreads,
  dbListenToEmails,
  dbListenToEmailAuth,
  dbListenToEmailAccounts,
  dbLogout,
} from "../db_calls_wrapper";
import { SETTINGS_OBJ, TAB_NAMES, CUSTOMER_PROTO, permissionToLevel } from "../data";
import { clog, log, recoverPendingAutoTexts, localStorageWrapper } from "../utils";
import { register, reconnectAll, teardownAll, useListenerStatusStore } from "../listenerManager";
import cloneDeep from "lodash/cloneDeep";
import throttle from "lodash/throttle";
import { ROUTES } from "../routes";

// If the live settings update removes the signed-in user from this store's
// users[] or flips their `disabled` flag, sign them out immediately. The
// Auth user's uid (not the punched-in `currentUser`) is the gate, so the
// owner who signed in stays in control even when a different staff member
// is on the clock. Pre-Phase-7 Bonita auth has no `privilege` claim and
// continues to use the legacy login path unaffected.
function enforceUserAccessOrLogout(settings) {
  const claims = useLoginStore.getState().authClaims;
  if (!claims?.privilege) return;
  const uid = AUTH.currentUser?.uid;
  if (!uid) return;

  const usersArr = Array.isArray(settings?.users) ? settings.users : [];
  const entry = usersArr.find((u) => u && u.id === uid);
  const removed = !entry;
  const disabled = !!entry?.disabled;
  if (!removed && !disabled) return;

  try {
    localStorage.setItem(
      "warpspeed_access_revoked",
      JSON.stringify({
        reason: removed ? "removed" : "disabled",
        at: Date.now(),
      })
    );
  } catch {
    /* localStorage may be unavailable; logout still proceeds */
  }

  dbLogout().catch((err) =>
    log("enforceUserAccessOrLogout: dbLogout failed:", err)
  );
}

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
  const zUseFacialRecognition = useSettingsStore(
    (state) => state.settings?.useFacialRecognition !== false
  );
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);
  const zLoginMessagesShowForUserID = useLoginStore((state) => state.loginMessagesShowForUserID);
  const zLoginMessagesShowTab = useLoginStore((state) => state.loginMessagesShowTab);
  const zCurrentUser = useLoginStore((state) => state.currentUser);
  const zListenerStatuses = useListenerStatusStore((state) => state.statuses);
  const zEverConnected = useListenerStatusStore((state) => state.everConnected);
  const zReconnectingNames = [];
  for (const [name, status] of Object.entries(zListenerStatuses)) {
    if (status === "reconnecting" && zEverConnected[name]) zReconnectingNames.push(name);
  }
  const zIsReconnecting = zReconnectingNames.length > 0;
  const throttledSetLastAction = useRef(throttle(() => {
    useLoginStore.getState().setLastActionMillis();
  }, 1000)).current;

  useEffect(() => {
    const id = setInterval(() => {
      const store = useLoginStore.getState();
      if (!store.currentUser || !store.lastActionMillis) return;
      const timeout = useSettingsStore.getState().getSettings()?.activeLoginTimeoutSeconds || 60;
      if ((Date.now() - store.lastActionMillis) / 1000 > timeout) {
        store.setCurrentUser(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Preload lazy chunks after first paint so subsequent navigations are
  // instant. Bundle savings from code-splitting are preserved (these still
  // ship as separate chunks, just fetched in the background after initial
  // render). Sandbox prospects feel zero flash on tab clicks.
  useEffect(() => {
    const idle =
      window.requestIdleCallback ||
      ((cb) => setTimeout(cb, 200));
    idle(() => {
      // Items tab content
      import("./screen_components/Items_Screen/Items_Dashboard");
      import("./screen_components/Items_Screen/Items_ChangeLog");
      import("./screen_components/Items_Screen/Items_EmailView");
      // Options tab content
      import("./screen_components/Options_Screen/Options_Messages");
      import("./screen_components/Options_Screen/Options_Email");
      import("./screen_components/Options_Screen/MediaLightbox");
      // Workorder / sale modals
      import("./screen_components/modal_screens/newCheckoutModalScreen/NewRefundModalScreen");
      import("../dom_components/FullSaleModal/FullSaleModal");
      import("./screen_components/modal_screens/ClosedWorkorderModal");
      import("./screen_components/modal_screens/TransactionModal");
      import("./screen_components/modal_screens/CustomerInfoModalScreen");
      import("./screen_components/modal_screens/WorkorderMediaModal");
      import("./screen_components/modal_screens/newCheckoutModalScreen/DepositRefundModal");
      import("./screen_components/modal_screens/newCheckoutModalScreen/WorkorderCombiner");
      import("./screen_components/modal_screens/newCheckoutModalScreen/SendReceiptModal");
      import("./screen_components/modal_screens/GoogleMapsModal");
      // Dashboard / admin modals
      import("./screen_components/modal_screens/PayrollModal");
      import("./screen_components/modal_screens/DevNotesModal");
      import("./screen_components/modal_screens/UserClockHistoryModalScreen");
      import("./screen_components/modal_screens/SalesReports");
      import("./screen_components/modal_screens/ScheduleModal");
      // Inventory modals
      import("./screen_components/modal_screens/InventoryItemModalScreen");
      import("./screen_components/modal_screens/CustomItemModal");
      import("./screen_components/modal_screens/ColorPickerModal");
      import("./screen_components/modal_screens/QuickButtonPickerModal");
    });
  }, []);

  // display window status — "closed" until display broadcasts otherwise
  const [sDisplayStatus, _setDisplayStatus] = useState(DISPLAY_STATUS.CLOSED);
  const [sDisplayLoading, _setDisplayLoading] = useState(
    localStorage.getItem("warpspeed_has_secondary_display") === "true"
  );
  const [sDisplayFullscreen, _setDisplayFullscreen] = useState(false);
  const [sDisplayHeartbeatAlive, _setDisplayHeartbeatAlive] = useState(false);
  // Holds the popup window object returned by window.open so the yellow
  // banner can synchronously focus + requestFullscreen on the popup from
  // inside a main-window click handler (gesture activation propagates).
  const _displayPopupRef = useRef(null);

  // Poll display heartbeat from localStorage
  useEffect(() => {
    function checkHeartbeat() {
      let raw = localStorage.getItem("warpspeed_display_heartbeat");
      if (!raw) {
        _setDisplayFullscreen(false);
        _setDisplayHeartbeatAlive(false);
        if (_displayPopupRef.current && _displayPopupRef.current.closed) {
          _displayPopupRef.current = null;
        }
        return;
      }
      try {
        let hb = JSON.parse(raw);
        let stale = Date.now() - hb.timestamp > 10000;
        _setDisplayFullscreen(!stale && hb.fullscreen === true);
        _setDisplayHeartbeatAlive(!stale && hb.open === true);
        if (_displayPopupRef.current && _displayPopupRef.current.closed) {
          _displayPopupRef.current = null;
        }
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

    // Zero-touch fullscreen on secondary monitor via Window Management API.
    // Permission is granted per-origin and remembered by the browser. On any
    // failure (no API, permission denied, single screen, throws) we fall
    // through to the default window.open path — existing behavior preserved.
    // Multi-monitor (3+) fallback: pick first non-primary; tenant-setting
    // for preferred display deferred to a future pass.
    let secondScreen = null;
    if (window.getScreenDetails) {
      try {
        let canQuery = true;
        if (navigator.permissions && navigator.permissions.query) {
          try {
            let status = await navigator.permissions.query({ name: "window-management" });
            canQuery = status.state === "granted" || status.state === "prompt";
          } catch (e) {
            // older Chrome may not know the name; let getScreenDetails decide
          }
        }
        if (canQuery) {
          let screenDetails = await window.getScreenDetails();
          let currentScreen = screenDetails.currentScreen;
          let nonPrimary = screenDetails.screens.filter(
            (s) => !s.isPrimary && s.label !== currentScreen.label
          );
          if (nonPrimary.length > 1) {
            clog("[CustomerDisplay] multi-monitor: chose", nonPrimary[0].label);
          }
          secondScreen = nonPrimary[0] || null;
        }
      } catch (e) {
        // permission denied / API unavailable — fall through to default
      }
    }
    let features = secondScreen
      ? `popup,left=${secondScreen.availLeft},top=${secondScreen.availTop},width=${secondScreen.availWidth},height=${secondScreen.availHeight}`
      : "popup,width=1024,height=768";
    let win = window.open(ROUTES.display, "customerDisplay", features);
    if (win) {
      _displayPopupRef.current = win;
      win.focus();
      win.addEventListener("load", () => { win.document.title = title; });
      return true;
    } else {
      _setDisplayLoading(false);
      return false;
    }
  }

  // Yellow-banner click: synchronously focus the popup and request
  // fullscreen. requestFullscreen MUST run inside the gesture handler
  // (no awaits before it) so user-activation propagates to the popup.
  function handleYellowBannerClick() {
    clog("[display] banner click fired");
    let popup = _displayPopupRef.current;
    if (!popup) {
      clog("[display] popup ref is null — auto-open never stored it, or it was cleared");
      return;
    }
    if (popup.closed) {
      clog("[display] popup ref present but .closed === true");
      return;
    }
    clog("[display] popup ref valid, calling focus + requestFullscreen");
    try {
      popup.focus();
      let result = popup.document.documentElement.requestFullscreen();
      if (result && result.then) {
        result.then(
          () => clog("[display] requestFullscreen resolved successfully"),
          (err) => clog("[display] requestFullscreen REJECTED:", err && err.message)
        );
      }
    } catch (e) {
      clog("[display] sync throw from cross-window access:", e && e.message);
    }
  }

  // new checkout refund modal state
  const [sRefundModalVisible, _setRefundModalVisible] = useState(false);
  const [sRefundSaleID, _setRefundSaleID] = useState("");

  const zReceiptScan = useCheckoutStore((state) => state.receiptScan);
  const zPendingRefundSaleID = useCheckoutStore((state) => state.pendingRefundSaleID);
  const zSaleModalObj = useOpenWorkordersStore((s) => s.saleModalObj);
  const zOrderingModalVisible = useOrderingModalStore((s) => s.visible);
  const zReconcileModalVisible = useInventoryReconciliationModalStore((s) => s.visible);

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

  useEffect(() => {
    if (!zPendingRefundSaleID) return;
    _setRefundSaleID(zPendingRefundSaleID);
    _setRefundModalVisible(true);
    useCheckoutStore.getState().setPendingRefundSaleID("");
  }, [zPendingRefundSaleID]);

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
        _displayPopupRef.current = null;
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

  // Stripe card reader feed. Two source-of-truth paths:
  //   • Connect tenants — Firestore listeners on `connect-accounts`,
  //     `connect-config/config`, and the store's `readers` subcollection. The
  //     reconcile callable keeps Firestore aligned with Stripe; we just read.
  //   • Legacy (Bonita) — keep the old 5-min poll against
  //     newCheckoutGetStripeReaders against the platform account.
  // Detection: if any `connect-accounts` doc has chargesEnabled and isn't
  // deauthorized, switch to Connect mode.
  const zSettingsTenantID = useSettingsStore((s) => s.settings?.tenantID || "");
  const zSettingsStoreID = useSettingsStore((s) => s.settings?.storeID || "");

  useEffect(() => {
    if (!zSettingsTenantID) return;
    const path = `tenants/${zSettingsTenantID}/connect-accounts`;
    const unsub = firestoreSubscribeCollection(path, (docs) => {
      const active = (docs || [])
        .filter((d) => d?.chargesEnabled && d?.status !== "deauthorized")
        .sort((a, b) => {
          const aMs = a?.createdAt?.toMillis?.() || 0;
          const bMs = b?.createdAt?.toMillis?.() || 0;
          return bMs - aMs;
        })[0] || null;
      const connectAccountID = active?.stripeAccountID || null;
      useStripePaymentStore.getState().setConnectContext({
        connectAccountID,
        terminalLocationID: useStripePaymentStore.getState().terminalLocationID,
        isConnectMode: !!connectAccountID,
      });
    });
    return () => unsub && unsub();
  }, [zSettingsTenantID]);

  useEffect(() => {
    if (!zSettingsTenantID || !zSettingsStoreID) return;
    const path = `tenants/${zSettingsTenantID}/stores/${zSettingsStoreID}/connect-config/config`;
    const unsub = firestoreSubscribe(path, (data) => {
      const terminalLocationID = data?.terminalLocationID || null;
      const s = useStripePaymentStore.getState();
      s.setConnectContext({
        connectAccountID: s.connectAccountID,
        terminalLocationID,
        isConnectMode: s.isConnectMode,
      });
    });
    return () => unsub && unsub();
  }, [zSettingsTenantID, zSettingsStoreID]);

  const zIsConnectMode = useStripePaymentStore((s) => s.isConnectMode);

  // Connect path — subscribe to the store's readers subcollection. Reconcile
  // happens server-side via stripeConnectListReadersCallable (called by the
  // "Refresh from Stripe" button on the Connect screen).
  useEffect(() => {
    if (!zIsConnectMode || !zSettingsTenantID || !zSettingsStoreID) return;
    const path = `tenants/${zSettingsTenantID}/stores/${zSettingsStoreID}/readers`;
    const unsub = firestoreSubscribeCollection(path, (docs) => {
      const arr = (docs || []).map((d) => ({
        id: d.stripeReaderID || d.id,
        label: d.label || d.stripeReaderID || d.id,
        status: d.status || "offline",
        device_type: d.deviceType || null,
        deviceType: d.deviceType || null,
        location: d.locationID || null,
        serial_number: d.serialNumber || null,
        livemode: !!d.livemode,
        action: null,
      }));
      useStripePaymentStore.getState().setReadersArr(arr);
    });
    return () => unsub && unsub();
  }, [zIsConnectMode, zSettingsTenantID, zSettingsStoreID]);

  // Legacy (Bonita) path — only runs when NOT in Connect mode.
  useEffect(() => {
    if (zIsConnectMode) return;
    async function fetchReaders() {
      try {
        let result = await newCheckoutGetStripeReaders();
        let readersArr = result?.data?.data || [];
        useStripePaymentStore.getState().setReadersArr(readersArr);
      } catch (e) {
        console.log("[CARD_READER] BaseScreen fetchReaders ERROR:", e?.message, e);
      }
    }
    fetchReaders();
    let interval = setInterval(fetchReaders, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [zIsConnectMode]);

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


  // subscribe to database listeners with auto-reconnect
  useEffect(() => {
    let activeSalesRecoveryDone = false;

    register("workorders", (onConnected, onError) => {
      return dbListenToOpenWorkorders((data) => {
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
        onConnected();
      }, onError);
    });

    register("settings", (onConnected, onError) => {
      return dbListenToSettings((data) => {
        useSettingsStore.getState().setSettings(data, false, false);
        enforceUserAccessOrLogout(data);
        onConnected();
      }, onError);
    });

    register("tenant-users", (onConnected, onError) => {
      return dbListenToTenantUsers((data) => {
        useSettingsStore.getState().setTenantUsers(data);
        onConnected();
      }, onError);
    });

    register("phone-config", (onConnected, onError) => {
      return dbListenToPhoneConfig((data) => {
        usePhoneConfigStore.getState().setPhoneConfig(data);
        onConnected();
      }, onError);
    });

    register("punch-clock", (onConnected, onError) => {
      return dbListenToCurrentPunchClock((data) => {
        let notes = data?.notes || {};
        let clean = { ...data };
        delete clean.notes;
        useLoginStore.getState().setPunchClock(clean);
        useLoginStore.getState().setManagerNotes(notes);
        onConnected();
      }, onError);
    });

    register("in-app-messages", (onConnected, onError) => {
      return dbListenToInAppMessages((data) => {
        let msgs = data?.messages || {};
        useLoginStore.getState().setInAppMessages(msgs);
        onConnected();
      }, onError);
    });

    register("inventory", (onConnected, onError) => {
      return dbListenToInventory((data) => {
        useInventoryStore.getState().setItems(data);
        onConnected();
      }, onError);
    });

    register("active-sales", (onConnected, onError) => {
      return dbListenToActiveSales((data) => {
        useActiveSalesStore.getState().setActiveSales(data);
        if (!activeSalesRecoveryDone) {
          activeSalesRecoveryDone = true;
          recoverPendingActiveSales(data);
        }
        onConnected();
      }, onError);
    });

    const emailTeardown = register("emails", (onConnected, onError) => {
      return dbListenToEmails((data) => {
        const reconciled = useEmailStore.getState().reconcilePendingLabelMods(data);
        useEmailStore.getState().setEmails(reconciled);
        onConnected();
      }, onError);
    });
    useEmailStore.getState().setEmailsUnsub(emailTeardown);

    const emailAuthTeardown = register("email-auth", (onConnected, onError) => {
      return dbListenToEmailAuth((docs) => {
        const authMap = {};
        docs.forEach((doc) => {
          authMap[doc.id] = doc;
        });
        useEmailStore.getState().setEmailAuth(authMap);
        onConnected();
      }, onError);
    });
    useEmailStore.getState().setAuthUnsub(emailAuthTeardown);

    const emailAccountsTeardown = register("email-accounts", (onConnected, onError) => {
      return dbListenToEmailAccounts((docs) => {
        useEmailStore.getState().setEmailAccounts(docs || []);
        onConnected();
      }, onError);
    });
    useEmailStore.getState().setAccountsUnsub(emailAccountsTeardown);

    // SMS threads: load from IndexedDB FIRST, then start Firestore listener
    import("../hubMessageDB").then(async (hubDB) => {
      try {
        const initialized = await hubDB.isInitialized();
        if (!initialized) {
          const { dbGetSmsThreadCards } = await import("../db_calls_wrapper");
          const seedResult = await dbGetSmsThreadCards(500);
          if (seedResult?.length > 0) {
            await hubDB.putThreadCards(seedResult);
          }
          await hubDB.setInitialized();
        }

        const allCards = await hubDB.getAllThreadCards();
        if (allCards.length > 0) {
          useCustMessagesStore.getState().setSmsThreads(allCards);
        }

        const recentPhones = allCards.slice(0, 30).map((c) => c.phone);
        const batch = {};
        for (const phone of recentPhones) {
          const msgs = await hubDB.getMessages(phone);
          if (msgs.length > 0) batch[phone] = { messages: msgs, noMoreHistory: false };
        }
        if (Object.keys(batch).length > 0) {
          useCustMessagesStore.getState().batchSetHubCachedThreads(batch);
        }

        hubDB.purgeOldConversations(60);
      } catch (e) {
        log("IndexedDB init error (non-fatal)", e);
      }

      const smsTeardown = register("sms-threads", (onConnected, onError) => {
        return dbListenToActiveMessageThreads((changes) => {
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
          changes.forEach(({ type, phone, ...data }) => {
            if (type === "removed") return;
            hubDB.putThreadCard(phone, { phone, ...data });
          });
          onConnected();
        }, onError);
      });
      useCustMessagesStore.getState().setThreadsUnsub(smsTeardown);
    });

    recoverPendingAutoTexts();

    // Reconnect listeners when tab regains focus after being hidden 5+ minutes
    let hiddenAt = null;
    const STALE_THRESHOLD = 5 * 60 * 1000;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible" && hiddenAt && Date.now() - hiddenAt > STALE_THRESHOLD) {
        hiddenAt = null;
        reconnectAll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      teardownAll();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
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


  const greenShadow = `1px 1px 10px ${C.green.replace("rgb", "rgba").replace(")", ", 0.5)")}`;
  const redShadow = `1px 1px 10px ${C.red.replace("rgb", "rgba").replace(")", ", 0.5)")}`;
  const isSuperUser = permissionToLevel(zCurrentUser?.permissions) >= 4;
  const sectionShadow = isSuperUser ? redShadow : greenShadow;

  return (
    <div
      onMouseMove={() => throttledSetLastAction()}
      onKeyUp={() => throttledSetLastAction()}
      className={styles.root}
      style={{ width: screenWidth, height: screenHeight }}
    >

      <style>{`
        @keyframes bannerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      {!!zSaleModalObj && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <FullSaleModal
            item={{ saleID: zSaleModalObj.id }}
            onClose={() => useOpenWorkordersStore.getState().setSaleModalObj(null)}
          />
        </Suspense>
      )}
      <NewCheckoutModalScreen />
      {zOrderingModalVisible && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <OrderingModalScreen handleExit={() => useOrderingModalStore.getState().hide()} />
        </Suspense>
      )}
      {zReconcileModalVisible && (
        <Suspense fallback={null}>
          <InventoryReconciliationModalScreen handleExit={() => useInventoryReconciliationModalStore.getState().hide()} />
        </Suspense>
      )}
      {sRefundModalVisible && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <NewRefundModalScreen
            visible={sRefundModalVisible}
            saleID={sRefundSaleID}
            onClose={() => {
              _setRefundModalVisible(false);
              _setRefundSaleID("");
            }}
          />
        </Suspense>
      )}
      {zShowLoginScreen && !zLoginModalVisible && (
        <LoginModal modalVisible={true} />
      )}
      {!!zRunBackgroundRecognition && zUseFacialRecognition && (
        <Suspense fallback={null}>
          <FaceDetectionClientComponent />
        </Suspense>
      )}
      <AlertBox showAlert={zShowAlert} />
      <SuperUserBanner />
      <BillingSuspensionBanner />
      {zLoginMessagesShowForUserID && (
        <Suspense fallback={null}>
          <UserMessagesModalForLogin
            handleExit={() => useLoginStore.getState().consumeLoginMessagesOnDismiss()}
            defaultTab={zLoginMessagesShowTab || "inbox"}
          />
        </Suspense>
      )}
      <div
        className={styles.leftCol}
        style={{ backgroundColor: C.backgroundWhite }}
      >
        {localStorage.getItem("warpspeed_has_secondary_display") === "true" &&
          (sDisplayStatus === DISPLAY_STATUS.CLOSED ||
          sDisplayStatus === DISPLAY_STATUS.HIDDEN) && (
            <div
              className={styles.banner}
              style={{ backgroundColor: C.red }}
            >
              <span className={styles.bannerTextLg} style={{ color: C.textWhite }}>
                Customer screen is closed
              </span>
              {sDisplayLoading && (
                <SmallLoadingIndicator
                  size={14}
                  color={C.textWhite}
                  message=""
                  style={{ padding: 0, marginLeft: 10 }}
                />
              )}
              <button
                type="button"
                disabled={sDisplayLoading}
                onClick={() => openDisplayWindow()}
                className={styles.bannerOpenBtn}
                style={{ backgroundColor: C.green, opacity: sDisplayLoading ? 0.5 : 1 }}
              >
                <span className={styles.bannerBtnText} style={{ color: C.textWhite }}>
                  Open
                </span>
              </button>
            </div>
          )}
        {!sDisplayFullscreen && sDisplayStatus !== DISPLAY_STATUS.CLOSED && sDisplayStatus !== DISPLAY_STATUS.HIDDEN && (
          <div
            role="button"
            tabIndex={0}
            onClick={handleYellowBannerClick}
            className={`${styles.banner} ${styles.bannerPulse} ${styles.bannerClickable}`}
            style={{ backgroundColor: "yellow" }}
          >
            <span className={styles.bannerBtnText} style={{ color: "red" }}>
              Click anywhere on the secondary display to go full-screen!
            </span>
          </div>
        )}
        {zIsReconnecting && (
          <div className={`${styles.banner} ${styles.bannerPulse}`} style={{ backgroundColor: C.orange }}>
            <span className={styles.bannerBtnText} style={{ color: C.textWhite }}>
              Reconnecting: {zReconnectingNames.join(", ")}...
            </span>
          </div>
        )}
        <div className={styles.row}>
          <div
            className={styles.infoShell}
            style={{
              backgroundColor: C.backgroundWhite,
              borderColor: C.buttonLightGreen,
              boxShadow: sectionShadow,
            }}
          >
            <Info_Section />
          </div>
          <div
            className={styles.itemsShell}
            style={{
              backgroundColor: C.backgroundWhite,
              borderColor: C.buttonLightGreen,
              boxShadow: sectionShadow,
            }}
          >
            <Items_Section />
          </div>
        </div>
        <div
          className={styles.notesShell}
          style={{
            backgroundColor: C.backgroundWhite,
            borderColor: C.buttonLightGreen,
            boxShadow: sectionShadow,
          }}
        >
          <Notes_Section />
        </div>
      </div>
      <div
        className={styles.rightCol}
        style={{
          backgroundColor: C.backgroundWhite,
          borderColor: C.buttonLightGreen,
          boxShadow: sectionShadow,
        }}
      >
        <Options_Section />
      </div>
    </div>
  );
}
