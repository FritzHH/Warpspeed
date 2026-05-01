/* eslint-disable */

import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native-web";
import {
  checkInternetConnection,
  convertMillisToHoursMins,
  dim,
  localStorageWrapper,
  log,
} from "../../utils";
import { TabMenuButton, Image_, Button_ } from "../../components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../styles";
import { TAB_NAMES } from "../../data";
// import { QuickItemsTab } from "./Options_QuickItemsTab";
import ReactDOM from "react-dom";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { WorkordersComponent } from "../screen_components/Options_Screen/Options_Workorders";
import { InventoryComponent } from "../screen_components/Options_Screen/Options_Inventory";
import { MessagesComponent } from "../screen_components/Options_Screen/Options_Messages";
import {
  useTabNamesStore,
  useLoginStore,
  useAlertScreenStore,
  useSettingsStore,
} from "../../stores";
import { INTERNET_CHECK_DELAY, LOCAL_DB_KEYS } from "../../constants";
import { PayrollModal } from "../screen_components/modal_screens/PayrollModal";
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
        <PayrollModal
          handleExit={() => _setShowPayroll(false)}
          employeeUser={zCurrentUser}
        />
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
      <View
        title="Right click to log out"
        onContextMenu={(e) => {
          e.preventDefault();
          useLoginStore.getState().setCurrentUser(null);
          useLoginStore.getState().setLastActionMillis();
        }}
      >
        <Button_
          onPress={() => handleUserPress(zCurrentUser)}
          icon={isClockedIn ? ICONS.check : ICONS.redx}
          text={
            zCurrentUser.first +
            " " +
            (zCurrentUser?.last?.length >= 0 ? zCurrentUser.last[0] : "") +
            "."
          }
          textStyle={{ fontSize: 13, color: C.text }}
          iconSize={13}
          buttonStyle={{
            paddingHorizontal: 7,
            paddingVertical: 2,
            marginRight: 5,
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: C.buttonLightGreen,
            borderRadius: 5,
          }}
        />
      </View>
    );
  }

  function LoginButton() {
    return (
      <Button_
        onPress={() => useLoginStore.getState().setShowLoginScreen(true)}
        icon={ICONS.userControl}
        iconSize={13}
        text="Login"
        textStyle={{ fontSize: 13, color: C.text }}
        buttonStyle={{
          paddingHorizontal: 7,
          paddingVertical: 2,
          marginRight: 5,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          backgroundColor: C.buttonLightGreen,
          borderRadius: 15,
        }}
      />
    );
  }

  function CameraIcon() {
    return (
      <TouchableOpacity
        title="Camera on and identifying"
        onPress={() => _sSetShowCameraPreview(true)}
      >
        <Image_ style={{ width: 19, height: 19 }} icon={ICONS.camera} />
      </TouchableOpacity>
    );
  }

  function ErrorIcon() {
    return (
      <Button_
        onPress={showCameraError}
        icon={ICONS.redx}
        iconSize={15}
        buttonStyle={{
          paddingHorizontal: 4,
          paddingVertical: 2,
          marginRight: 3,
        }}
      />
    );
  }

  function renderUserArea() {
    // loading — spinner only
    if (zCameraStatus === "loading") {
      return <ActivityIndicator size={16} color={C.green} />;
    }

    // failed — show user or login button + error icon
    if (zCameraStatus === "failed") {
      return (
        <>
          {zCurrentUser ? <UserButton /> : <LoginButton />}
          <ErrorIcon />
        </>
      );
    }

    // ready — camera started, searching for face
    if (zCameraStatus === "ready") {
      return (
        <>
          {zCurrentUser ? <UserButton /> : <ActivityIndicator size={16} color={C.green} />}
          <View style={{ width: 5 }} />
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
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        justifyContent: "space-between",
        paddingRight: 5,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "flex-start" }}>
        <TabMenuButton
          buttonStyle={{ borderTopLeftRadius: 15 }}
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
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {renderUserArea()}
        <View style={{ width: 5 }} />
        {(() => {
          let selectedID = localStorageWrapper.getItem("selectedPrinterID");
          let selectedPrinter = selectedID && zPrinters?.[selectedID];
          if (selectedPrinter && selectedPrinter.active !== true) {
            return (
              <TouchableOpacity
                onPress={() => {
                  useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.dashboard);
                  useTabNamesStore.getState().setDashboardExpand("Readers/Printers");
                }}
                style={{ flexDirection: "row", alignItems: "center", backgroundColor: "yellow", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 5 }}
              >
                <Image_ icon={ICONS.print} size={14} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "red" }}>Offline</Text>
              </TouchableOpacity>
            );
          }
          return null;
        })()}
        <Image_
          style={{ width: 28, height: 28 }}
          icon={sIsOnline ? ICONS.wifi : ICONS.internetOfflineGIF}
        />
      </View>
      <CameraPreviewModal
        visible={sShowCameraPreview}
        onClose={() => _sSetShowCameraPreview(false)}
      />
    </View>
  );
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ScheduleWeekRow({ label, user, weekStart, schedules, storeHours, todayStr }) {
  let weekShifts = schedules?.[weekStart]?.shifts || {};
  return (
    <View style={{ width: "100%", marginBottom: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: gray(0.4), marginBottom: 6 }}>{label}</Text>
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
                backgroundColor: shift ? "#e8f5e9" : gray(0.95),
                borderRadius: 10,
                paddingVertical: 10,
                borderWidth: isToday ? 2 : 1,
                borderColor: isToday ? C.blue : shift ? C.green : gray(0.85),
                minHeight: 70,
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: isToday ? "800" : "700",
                  color: isToday ? C.blue : gray(0.35),
                }}
              >
                {dayName}
              </Text>
              {isClosed ? (
                <Text style={{ fontSize: 11, color: gray(0.45), marginTop: 3, fontWeight: "600" }}>OFF</Text>
              ) : shift ? (
                <View style={{ alignItems: "center", marginTop: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: gray(0.2) }}>
                    {formatTimeShort(shift.startTime)}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: gray(0.2) }}>
                    {formatTimeShort(shift.endTime)}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: gray(0.55), marginTop: 3 }}>-</Text>
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
    useLoginStore.getState().setCreateUserClock(user.id, millis, option);
    if (option === "out") {
      let clockPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj);
      if (!clockPauseObj) clockPauseObj = {};
      clockPauseObj[user.id] = new Date().getTime();
      localStorageWrapper.setItem(LOCAL_DB_KEYS.userClockCheckPauseObj, clockPauseObj);
    }
    handleExit();
  }

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
        zIndex: 9998,
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
        zIndex: 9999,
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
