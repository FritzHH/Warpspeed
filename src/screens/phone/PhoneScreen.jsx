import { useState, useEffect, useRef } from "react";
import throttle from "lodash/throttle";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useLoginStore,
  useInventoryStore,
} from "../../stores";
import {
  dbListenToOpenWorkorders,
  dbListenToInventory,
  dbListenToCurrentPunchClock,
  dbListenToSettings,
} from "../../db_calls_wrapper";
import { authSignOut } from "../../db_calls";
import { PinEntry } from "./PinEntry/PinEntry";
import { ListShell } from "./ListShell/ListShell";
import { WorkorderDetailModal } from "./WorkorderDetailModal";

const LOCAL_STORAGE_KEY = "warpspeed_phone_user_id";

export function PhoneScreen() {
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zSettings = useSettingsStore((state) => state.settings);
  const zStatuses = zSettings?.statuses;
  const zCurrentUser = useLoginStore((state) => state.currentUser);
  const zPunchClock = useLoginStore((state) => state.punchClock);

  const [sActiveModal, _setActiveModal] = useState(null);
  const [sSelectedWorkorderID, _setSelectedWorkorderID] = useState(null);
  const [sPin, _setPin] = useState("");
  const [sPinError, _setPinError] = useState("");
  const [sSearch, _setSearch] = useState("");

  const [sLoginPhase, _setLoginPhase] = useState(() => {
    const storedUserID = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!storedUserID) return "pin";
    const users = useSettingsStore.getState().settings?.users || [];
    const user = users.find((u) => u.id === storedUserID);
    if (!user) return "pin";
    useLoginStore.getState().setCurrentUser(user);
    useLoginStore.getState().setLastActionMillis();
    return null;
  });

  const throttledSetLastAction = useRef(
    throttle(() => {
      useLoginStore.getState().setLastActionMillis();
    }, 1000)
  ).current;

  useEffect(() => {
    const unsub = dbListenToOpenWorkorders((data) => {
      useOpenWorkordersStore.getState().setOpenWorkorders(data);
    });
    const unsubInv = dbListenToInventory((data) => {
      useInventoryStore.getState().setItems(data);
    });
    const unsubPunch = dbListenToCurrentPunchClock((data) => {
      useLoginStore.getState().setPunchClock(data);
    });
    const unsubSettings = dbListenToSettings((data) => {
      useSettingsStore.getState().setSettings(data, false, false);
    });
    return () => {
      if (typeof unsub === "function") unsub();
      if (typeof unsubInv === "function") unsubInv();
      if (typeof unsubPunch === "function") unsubPunch();
      if (typeof unsubSettings === "function") unsubSettings();
    };
  }, []);

  const selectedWorkorder = zWorkorders.find((w) => w.id === sSelectedWorkorderID) || null;

  function openWorkorder(workorder) {
    _setSelectedWorkorderID(workorder.id);
    _setActiveModal("workorderDetail");
  }

  function closeModal() {
    _setActiveModal(null);
    _setSelectedWorkorderID(null);
  }

  function handleToggleClock() {
    const userId = zCurrentUser?.id;
    if (!userId) return;
    const now = Date.now();
    const option = zPunchClock[userId] ? "out" : "in";
    useLoginStore.getState().setCreateUserClock(userId, now, option);
  }

  function handleSwitchUser() {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    useLoginStore.getState().setCurrentUser(null);
    _setLoginPhase("pin");
    _setActiveModal(null);
    _setSelectedWorkorderID(null);
    _setPin("");
    _setPinError("");
  }

  function handleLogoutApp() {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    useLoginStore.getState().setCurrentUser(null);
    authSignOut();
  }

  function handlePinKeyPress(key) {
    if (key === "CLR") {
      _setPin("");
      _setPinError("");
      return;
    }
    if (key === "\u232B") {
      _setPin((prev) => prev.slice(0, -1));
      _setPinError("");
      return;
    }

    const newPin = sPin + key;
    _setPin(newPin);
    _setPinError("");

    const users = zSettings?.users || [];
    let userObj = users.find((u) => u.pin == newPin);
    if (!userObj) userObj = users.find((u) => u.alternatePin == newPin);
    if (!userObj) return;

    localStorage.setItem(LOCAL_STORAGE_KEY, userObj.id);
    useLoginStore.getState().setCurrentUser(userObj);
    useLoginStore.getState().setLastActionMillis();
    _setLoginPhase(null);
    _setPin("");
  }

  if (sLoginPhase === "pin") {
    return <PinEntry pin={sPin} pinError={sPinError} onKeyPress={handlePinKeyPress} />;
  }

  const isClockedIn = !!zPunchClock[zCurrentUser?.id];

  if (sActiveModal === "workorderDetail" && selectedWorkorder) {
    return (
      <WorkorderDetailModal
        workorder={selectedWorkorder}
        zSettings={zSettings}
        onClose={closeModal}
      />
    );
  }

  return (
    <ListShell
      workorders={zWorkorders}
      zStatuses={zStatuses}
      zSettings={zSettings}
      currentUser={zCurrentUser}
      isClockedIn={isClockedIn}
      search={sSearch}
      onSearchChange={_setSearch}
      onToggleClock={handleToggleClock}
      onSwitchUser={handleSwitchUser}
      onLogoutApp={handleLogoutApp}
      onOpenWorkorder={openWorkorder}
      onActivity={throttledSetLastAction}
    />
  );
}
