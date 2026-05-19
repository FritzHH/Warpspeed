/* eslint-disable */

import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native-web";
import {
  checkInternetConnection,
  convertMillisToHoursMins,
  dim,
  localStorageWrapper,
  log,
} from "../../utils";
import { Image_, Button_, Tooltip } from "../../components";
import { TabMenuButton } from "../../dom_components/TabMenuButton/TabMenuButton";
import { C, COLOR_GRADIENTS, Fonts, ICONS, Z } from "../../styles";
import { TAB_NAMES } from "../../data";
import tabBarStyles from "./OptionsTabBar.module.css";
// import { QuickItemsTab } from "./Options_QuickItemsTab";
import ReactDOM from "react-dom";
import React, { useEffect, useRef, useState, useCallback, Suspense, lazy } from "react";
import { WorkordersComponent } from "../screen_components/Options_Screen/Options_Workorders";
import { InventoryComponent } from "../screen_components/Options_Screen/Options_Inventory";
import { MessagesComponent } from "../screen_components/Options_Screen/Options_Messages";
import { EmailOptionsPanel } from "../screen_components/Options_Screen/Options_Email";
import {
  useTabNamesStore,
  useLoginStore,
  useAlertScreenStore,
  useSettingsStore,
  useEmailStore,
} from "../../stores";
import { INTERNET_CHECK_DELAY, LOCAL_DB_KEYS } from "../../constants";
const PayrollModal = lazy(() =>
  import("../screen_components/modal_screens/PayrollModal").then((m) => ({
    default: m.PayrollModal,
  }))
);
import { getWeekStart, formatTimeShort, getStoreHoursForDayIndex } from "../screen_components/modal_screens/ScheduleModal";
import dayjs from "dayjs";
import { gray } from "../../utils";

export const Options_Section = React.memo(({}) => {
  // store getters ///////////////////////////////////////////////////////////////
  const zOptionsTabName = useTabNamesStore((state) => state.optionsTabName);
  const zCurrentUser = useLoginStore((state) => state.currentUser);

  // local state
  const [sShowPayroll, _setShowPayroll] = useState(false);
  const [sShowUserClockModal, _setShowUserClockModal] = useState(false);

  //////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////

  function handleUserClockPress() {
    _setShowUserClockModal(true);
  }

  function ScreenComponent() {
    switch (zOptionsTabName) {
      case TAB_NAMES.optionsTab.inventory:
        return <InventoryComponent />;
      case TAB_NAMES.optionsTab.messages:
        return <MessagesComponent />;
      case TAB_NAMES.optionsTab.email:
        return <EmailOptionsPanel />;
      case TAB_NAMES.optionsTab.inventory:
        return <InventoryComponent />;
      case TAB_NAMES.optionsTab.workorders:
        return <WorkordersComponent />;
    }
    return null;
  }

  return (
    <View style={{ height: "100%", width: "100%", backgroundColor: null }}>
      <TabBar
        zOptionsTabName={zOptionsTabName}
        handleUserPress={handleUserClockPress}
      />
      {ScreenComponent()}
      {sShowPayroll && (
        <Suspense fallback={null}>
          <PayrollModal
            handleExit={() => _setShowPayroll(false)}
            employeeUser={zCurrentUser}
          />
        </Suspense>
      )}
      {sShowUserClockModal && (
        <UserClockModal
          user={zCurrentUser}
          handleExit={() => _setShowUserClockModal(false)}
          handleViewHistory={() => {
            _setShowUserClockModal(false);
            _setShowPayroll(true);
          }}
        />
      )}
    </View>
  );
});

export const TabBar = ({
  zOptionsTabName,
  handleUserPress,
}) => {
  const zCurrentUser = useLoginStore((state) => state.currentUser);
  const zPunchClock = useLoginStore((state) => state.punchClock);
  const zCameraStatus = useLoginStore((state) => state.cameraStatus);
  const zCameraError = useLoginStore((state) => state.cameraError);
  const zPrinters = useSettingsStore((state) => state.settings?.printers);
  const zUseFacialRecognition = useSettingsStore((state) => state.settings?.useFacialRecognition !== false);
  // local state /////////////////////////////////////////////////////////////////////////
  const [sIsOnline, _setIsOnline] = useState(true);
  const [sShowCameraPreview, _sSetShowCameraPreview] = useState(false);

  // run constant checks to check if interent is connected
  useEffect(() => {
    async function tick() {
      let isOnline = false;
      try {
        isOnline = await checkInternetConnection();
      } catch (e) {}
      _setIsOnline(isOnline);
    }
    let id = setInterval(tick, INTERNET_CHECK_DELAY);
    return () => clearInterval(id);
  }, []);

  let isClockedIn = zPunchClock[zCurrentUser?.id];

  function showCameraError() {
    useAlertScreenStore.getState().setValues({
      title: "CAMERA ERROR",
      message: zCameraError || "Unknown camera error",
      btn1Text: "Retry Camera",
      handleBtn1Press: () => useLoginStore.getState().triggerCameraRetry(),
      btn2Text: "OK",
      handleBtn2Press: () => null,
      showAlert: true,
    });
  }

  function UserButton() {
    return (
      <Tooltip text="Press for user, right-click to log out" position="bottom" hideOnPress>
        <div
          className={tabBarStyles.userBtnWrap}
          onContextMenu={(e) => {
            e.preventDefault();
            useLoginStore.getState().setCurrentUser(null);
            useLoginStore.getState().setLastActionMillis();
          }}
        >
          <button
            type="button"
            className={tabBarStyles.userBtn}
            onClick={() => handleUserPress(zCurrentUser)}
          >
            <img
              src={isClockedIn ? ICONS.check : ICONS.redx}
              alt=""
              className={tabBarStyles.btnIcon}
            />
            <span className={tabBarStyles.btnText} style={{ color: C.text }}>
              {zCurrentUser.first +
                " " +
                (zCurrentUser?.last?.length >= 0 ? zCurrentUser.last[0] : "") +
                "."}
            </span>
          </button>
        </div>
      </Tooltip>
    );
  }

  function LoginButton({ showSpinner } = {}) {
    return (
      <button
        type="button"
        className={tabBarStyles.loginBtn}
        onClick={() => useLoginStore.getState().setShowLoginScreen(true)}
      >
        {showSpinner ? (
          <span className={tabBarStyles.spinner} style={{ color: C.green }} />
        ) : (
          <img src={ICONS.userControl} alt="" className={tabBarStyles.btnIcon} />
        )}
        <span className={tabBarStyles.btnText} style={{ color: C.text }}>
          User
        </span>
      </button>
    );
  }

  function CameraIcon() {
    const showError = zCameraStatus === "failed";
    return (
      <div className={tabBarStyles.cameraBtnWrap}>
        <button
          type="button"
          title="Camera on and identifying"
          className={tabBarStyles.cameraBtn}
          onClick={showError ? showCameraError : () => _sSetShowCameraPreview(true)}
        >
          <img src={ICONS.camera} alt="" className={tabBarStyles.cameraIcon} />
          {showError && (
            <span className={tabBarStyles.cameraErrorOverlay}>
              <img src={ICONS.redx} alt="" className={tabBarStyles.cameraIcon} />
            </span>
          )}
        </button>
      </div>
    );
  }

  function renderUserArea() {
    if (!zUseFacialRecognition) {
      return zCurrentUser ? <UserButton /> : <LoginButton />;
    }

    // loading or ready without a user — show login button with spinner icon
    if (!zCurrentUser && (zCameraStatus === "loading" || zCameraStatus === "ready")) {
      return (
        <>
          <LoginButton showSpinner />
          {zCameraStatus === "ready" && <><div className={tabBarStyles.spacer5} /><CameraIcon /></>}
        </>
      );
    }

    // failed — show user or login button + camera icon (with error overlay)
    if (zCameraStatus === "failed") {
      return (
        <>
          {zCurrentUser ? <UserButton /> : <LoginButton />}
          <CameraIcon />
        </>
      );
    }

    // ready with a user
    if (zCameraStatus === "ready") {
      return (
        <>
          <UserButton />
          <div className={tabBarStyles.spacer5} />
          <CameraIcon />
        </>
      );
    }

    // idle or matched — normal display
    return (
      <>
        {zCurrentUser ? <UserButton /> : <LoginButton />}
        <CameraIcon />
      </>
    );
  }

  return (
    <div className={tabBarStyles.tabBarRoot}>
      <div className={tabBarStyles.tabBarLeft}>
        <TabMenuButton
          style={{ borderTopLeftRadius: 15 }}
          onPress={() => useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.inventory)}
          text={TAB_NAMES.optionsTab.inventory}
          isSelected={zOptionsTabName === TAB_NAMES.optionsTab.inventory}
        />
        <TabMenuButton
          onPress={() => useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.workorders)}
          text={TAB_NAMES.optionsTab.workorders}
          isSelected={zOptionsTabName === TAB_NAMES.optionsTab.workorders}
        />
        <TabMenuButton
          onPress={() => useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.messages)}
          text={TAB_NAMES.optionsTab.messages}
          isSelected={zOptionsTabName === TAB_NAMES.optionsTab.messages}
        />
        <EmailTabButton zOptionsTabName={zOptionsTabName} />
      </div>
      <div className={tabBarStyles.tabBarRight}>
        {renderUserArea()}
        <div className={tabBarStyles.spacer5} />
        {(() => {
          let selectedID = localStorageWrapper.getItem("selectedPrinterID");
          let selectedPrinter = selectedID && zPrinters?.[selectedID];
          if (selectedPrinter && selectedPrinter.active !== true) {
            return (
              <button
                type="button"
                className={tabBarStyles.printerOfflineBtn}
                onClick={() => {
                  useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.dashboard);
                  useTabNamesStore.getState().setDashboardExpand("Readers/Printers");
                }}
              >
                <img src={ICONS.print} alt="" className={tabBarStyles.printerOfflineIcon} />
                <span className={tabBarStyles.printerOfflineText}>Offline</span>
              </button>
            );
          }
          return null;
        })()}
        <img
          src={sIsOnline ? ICONS.wifi : ICONS.internetOfflineGIF}
          alt=""
          className={tabBarStyles.wifiIcon}
        />
      </div>
      <CameraPreviewModal
        visible={sShowCameraPreview}
        onClose={() => _sSetShowCameraPreview(false)}
      />
    </div>
  );
};

const EmailTabButton = ({ zOptionsTabName }) => {
  const zUnreadCount = useEmailStore((state) => state.getTotalUnreadCount());
  const currentUser = useLoginStore((state) => state.currentUser);
  const userInboxes = currentUser?.emailInboxes || [];
  const isSelected = zOptionsTabName === TAB_NAMES.optionsTab.email;

  if (userInboxes.length === 0) return null;

  return (
    <div className={tabBarStyles.emailTabWrap}>
      <TabMenuButton
        onPress={() => {
          useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.email);
          useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.emailView);
        }}
        text={TAB_NAMES.optionsTab.email}
        isSelected={isSelected}
      />
      {zUnreadCount > 0 && (
        <div className={tabBarStyles.emailBadge} style={{ background: C.red }}>
          <span className={tabBarStyles.emailBadgeText}>
            {zUnreadCount > 99 ? "99+" : zUnreadCount}
          </span>
        </div>
      )}
    </div>
  );
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ScheduleWeekRow({ label, user, weekStart, schedules, storeHours, todayStr }) {
  let weekShifts = schedules?.[weekStart]?.shifts || {};
  return (
    <View style={{ width: "100%", marginBottom: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: "rgb(130,130,130)", marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {DAY_LABELS.map((dayName, i) => {
          let dayIndex = i + 1;
          let shiftKey = `${user?.id}_${dayIndex}`;
          let shift = weekShifts[shiftKey];
          let storeDay = getStoreHoursForDayIndex(storeHours, dayIndex);
          let isClosed = storeDay ? !storeDay.isOpen : false;
          let dateStr = dayjs(weekStart).add(i, "day").format("YYYY-MM-DD");
          let isToday = dateStr === todayStr;

          return (
            <View
              key={dayIndex}
              style={{
                flex: 1,
                alignItems: "center",
                marginHorizontal: 3,
                backgroundColor: shift ? "#e8f5e9" : "rgb(235,235,235)",
                borderRadius: 10,
                paddingVertical: 10,
                borderWidth: isToday ? 2 : 1,
                borderColor: isToday ? C.blue : shift ? C.green : "rgb(210,210,210)",
                minHeight: 70,
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: isToday ? "800" : "700",
                  color: isToday ? C.blue : C.text,
                }}
              >
                {dayName}
              </Text>
              {isClosed ? (
                <Text style={{ fontSize: 11, color: "rgb(140,140,140)", marginTop: 3, fontWeight: "600" }}>OFF</Text>
              ) : shift ? (
                <View style={{ alignItems: "center", marginTop: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>
                    {formatTimeShort(shift.startTime)}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>
                    {formatTimeShort(shift.endTime)}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: "rgb(160,160,160)", marginTop: 3 }}>-</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const UserClockModal = ({ user, handleExit, handleViewHistory }) => {
  const zPunchClock = useLoginStore((state) => state.punchClock);
  const settings = useSettingsStore((state) => state.settings);
  const storeHours = settings?.storeHours;
  const schedules = settings?.schedules;

  let isClockedIn = zPunchClock[user?.id];
  let millis = new Date().getTime();
  let option = isClockedIn ? "out" : "in";

  let clockMessage = "";
  if (option === "out") {
    let punchObj = zPunchClock[user?.id];
    if (punchObj && punchObj.millis) {
      let diff = millis - punchObj.millis;
      let t = convertMillisToHoursMins(diff);
      clockMessage = "Clocked in for " + t.hours + "h " + String(t.minutes).padStart(2, "0") + "m";
    }
  } else {
    clockMessage = "Currently clocked out";
  }

  function handleClockPress() {
    let lastInitial = user?.last?.length ? user.last[0].toUpperCase() + "." : "";
    let displayName = (user?.first || "") + (lastInitial ? " " + lastInitial : "");
    let actionWord = option === "in" ? "CLOCK IN" : "CLOCK OUT";

    handleExit();

    useAlertScreenStore.getState().setValues({
      title: "CONFIRM IDENTITY",
      message:
        "Are you " +
        displayName.trim() +
        "?\n\nThis will " +
        actionWord +
        " this user. Do NOT press YES if you are not " +
        (user?.first || "this user") +
        ".",
      btn1Text: "YES, I AM " + (user?.first ? user.first.toUpperCase() : "THIS USER"),
      btn2Text: "NO",
      handleBtn1Press: () => {
        useLoginStore.getState().setCreateUserClock(user.id, millis, option);
        if (option === "out") {
          let clockPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj);
          if (!clockPauseObj) clockPauseObj = {};
          clockPauseObj[user.id] = new Date().getTime();
          localStorageWrapper.setItem(LOCAL_DB_KEYS.userClockCheckPauseObj, clockPauseObj);
        }
      },
      handleBtn2Press: () => {},
      showAlert: true,
    });
  }

  useEffect(() => {
    let timer = setTimeout(handleExit, 30000);
    return () => clearTimeout(timer);
  }, []);

  let thisWeekStart = getWeekStart(new Date());
  let nextWeekStart = dayjs(thisWeekStart).add(7, "day").format("YYYY-MM-DD");
  let todayStr = dayjs().format("YYYY-MM-DD");

  return ReactDOM.createPortal(
    <View
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: Z.modal,
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleExit}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, cursor: "default" }}
      />
      <View
        style={{
          backgroundColor: C.backgroundWhite,
          borderRadius: 15,
          alignItems: "center",
          minWidth: 700,
          maxWidth: 800,
          width: "50%",
          overflow: "hidden",
        }}
      >
        {/* ─── title + clock status ───────────────────────────── */}
        <Text
          style={{
            fontWeight: "500",
            marginTop: 25,
            fontSize: 25,
            color: "red",
            textAlign: "center",
          }}
        >
          PUNCH CLOCK
        </Text>
        <Text
          style={{
            textAlign: "center",
            width: "90%",
            marginTop: 10,
            fontSize: 18,
            color: gray(0.25),
          }}
        >
          {clockMessage}
        </Text>

        {/* ─── 3 buttons in a row ─────────────────────────────── */}
        <View
          style={{
            marginTop: 25,
            marginBottom: 25,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            paddingHorizontal: 20,
          }}
        >
          <Button_
            colorGradientArr={COLOR_GRADIENTS.green}
            text={option === "in" ? "CLOCK IN" : "CLOCK OUT"}
            buttonStyle={{ paddingVertical: 4, marginHorizontal: 6, flex: 1 }}
            textStyle={{ color: C.textWhite, fontWeight: "600" }}
            onPress={handleClockPress}
            iconSize={60}
            icon={ICONS.clockGif}
          />
          <Button_
            colorGradientArr={COLOR_GRADIENTS.blue}
            text="VIEW HISTORY"
            buttonStyle={{ paddingVertical: 4, marginHorizontal: 6, flex: 1 }}
            textStyle={{ color: C.textWhite, fontWeight: "600" }}
            onPress={handleViewHistory}
            iconSize={60}
            icon={ICONS.listGif}
          />
          <Button_
            colorGradientArr={COLOR_GRADIENTS.purple}
            text="CANCEL"
            buttonStyle={{ paddingVertical: 4, marginHorizontal: 6, flex: 1 }}
            textStyle={{ color: C.textWhite, fontWeight: "600" }}
            onPress={handleExit}
            iconSize={60}
            icon={ICONS.cancelGif}
          />
        </View>

        {/* ─── schedule: this week + next week ────────────────── */}
        <View
          style={{
            width: "100%",
            borderTopWidth: 1,
            borderTopColor: gray(0.12),
            paddingVertical: 16,
            paddingHorizontal: 20,
          }}
        >
          <ScheduleWeekRow
            label="This Week"
            user={user}
            weekStart={thisWeekStart}
            schedules={schedules}
            storeHours={storeHours}
            todayStr={todayStr}
          />
          <ScheduleWeekRow
            label="Next Week"
            user={user}
            weekStart={nextWeekStart}
            schedules={schedules}
            storeHours={storeHours}
            todayStr={todayStr}
          />
        </View>
      </View>
    </View>,
    document.body
  );
};

const CameraPreviewModal = ({ visible, onClose }) => {
  const videoRef = useRef(null);
  const zCameraStream = useLoginStore((state) => state.cameraStream);

  useEffect(() => {
    if (!visible || !videoRef.current || !zCameraStream) return;
    videoRef.current.srcObject = zCameraStream;
    videoRef.current.play().catch(() => {});
  }, [visible, zCameraStream]);

  if (!visible) return null;

  return ReactDOM.createPortal(
    <View
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: Z.modal,
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          cursor: "default",
        }}
      />
      <View
        style={{
          width: 520,
          backgroundColor: C.backgroundWhite,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: C.buttonLightGreenOutline,
          padding: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: Fonts.weight.textHeavy,
              color: C.text,
            }}
          >
            Camera Preview
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Image_ source={ICONS.close1} width={18} height={18} />
          </TouchableOpacity>
        </View>
        <View
          style={{
            borderRadius: 10,
            overflow: "hidden",
            borderWidth: 2,
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: "black",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            style={{
              width: "100%",
              display: "block",
              borderRadius: 8,
            }}
          />
        </View>
        {!zCameraStream && (
          <Text
            style={{
              fontSize: 14,
              color: C.red,
              textAlign: "center",
              marginTop: 12,
            }}
          >
            No camera stream available
          </Text>
        )}
      </View>
    </View>,
    document.body
  );
};
