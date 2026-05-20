/* eslint-disable */

import { checkInternetConnection, convertMillisToHoursMins, dim, localStorageWrapper, log } from "../../utils";
import { Button, Tooltip, LoadingIndicator } from "../../dom_components";
import { TabMenuButton } from "../../dom_components/TabMenuButton/TabMenuButton";
import { C, COLOR_GRADIENTS, Fonts, ICONS, Z } from "../../styles";
import { TAB_NAMES } from "../../data";
import tabBarStyles from "./OptionsTabBar.module.css";
import styles from "./Options_Section.module.css";
// import { QuickItemsTab } from "./Options_QuickItemsTab";
import ReactDOM from "react-dom";
import React, { useEffect, useRef, useState, useCallback, Suspense, lazy } from "react";
import { WorkordersComponent } from "../screen_components/Options_Screen/Options_Workorders";
import { InventoryComponent } from "../screen_components/Options_Screen/Options_Inventory";
const MessagesComponent = lazy(() =>
  import("../screen_components/Options_Screen/Options_Messages").then((m) => ({
    default: m.MessagesComponent,
  }))
);
const preloadMessagesComponent = () =>
  import("../screen_components/Options_Screen/Options_Messages");
const EmailOptionsPanel = lazy(() =>
  import("../screen_components/Options_Screen/Options_Email").then((m) => ({
    default: m.EmailOptionsPanel,
  }))
);
const preloadEmailOptionsPanel = () =>
  import("../screen_components/Options_Screen/Options_Email");
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
import { getWeekStart, formatTimeShort, getStoreHoursForDayIndex } from "../screen_components/modal_screens/scheduleUtils";
import { preloadItemsEmailView } from "./Items_Section";
import dayjs from "dayjs";


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
        return (
          <Suspense fallback={<LoadingIndicator />}>
            <MessagesComponent />
          </Suspense>
        );
      case TAB_NAMES.optionsTab.email:
        return (
          <Suspense fallback={<LoadingIndicator />}>
            <EmailOptionsPanel />
          </Suspense>
        );
      case TAB_NAMES.optionsTab.inventory:
        return <InventoryComponent />;
      case TAB_NAMES.optionsTab.workorders:
        return <WorkordersComponent />;
    }
    return null;
  }

  return (
    <div className={styles.sectionRoot}>
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
    </div>
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
      <Tooltip text="Press for user, right-click to log out" position="bottom">
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
          onMouseEnter={preloadMessagesComponent}
          onFocus={preloadMessagesComponent}
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
        onMouseEnter={() => {
          preloadItemsEmailView();
          preloadEmailOptionsPanel();
        }}
        onFocus={() => {
          preloadItemsEmailView();
          preloadEmailOptionsPanel();
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
    <div className={styles.weekRow}>
      <p className={styles.weekLabel}>{label}</p>
      <div className={styles.weekDaysRow}>
        {DAY_LABELS.map((dayName, i) => {
          let dayIndex = i + 1;
          let shiftKey = `${user?.id}_${dayIndex}`;
          let shift = weekShifts[shiftKey];
          let storeDay = getStoreHoursForDayIndex(storeHours, dayIndex);
          let isClosed = storeDay ? !storeDay.isOpen : false;
          let dateStr = dayjs(weekStart).add(i, "day").format("YYYY-MM-DD");
          let isToday = dateStr === todayStr;

          return (
            <div
              key={dayIndex}
              className={styles.dayCell}
              style={{
                backgroundColor: shift ? C.surfaceSuccessMuted : C.borderSubtle,
                border: `${isToday ? 2 : 1}px solid ${
                  isToday ? C.blue : shift ? C.green : C.borderStrong
                }`,
              }}
            >
              <span
                className={styles.dayName}
                style={{
                  fontWeight: isToday ? 800 : 700,
                  color: isToday ? C.blue : C.text,
                }}
              >
                {dayName}
              </span>
              {isClosed ? (
                <span className={styles.dayOff}>OFF</span>
              ) : shift ? (
                <div className={styles.dayShift}>
                  <span className={styles.dayShiftTime}>
                    {formatTimeShort(shift.startTime)}
                  </span>
                  <span className={styles.dayShiftTime}>
                    {formatTimeShort(shift.endTime)}
                  </span>
                </div>
              ) : (
                <span className={styles.dayEmpty}>-</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
    <div className={styles.modalOverlay} style={{ zIndex: Z.modal }}>
      <button
        type="button"
        aria-label="Close"
        className={styles.modalBackdropBtn}
        onClick={handleExit}
      />
      <div className={styles.modalCard}>
        {/* ─── title + clock status ───────────────────────────── */}
        <p className={styles.modalTitle}>PUNCH CLOCK</p>
        <p className={styles.modalClockMessage} style={{ color: C.textDisabled }}>
          {clockMessage}
        </p>

        {/* ─── 3 buttons in a row ─────────────────────────────── */}
        <div className={styles.modalButtonsRow}>
          <Button
            colorGradientArr={COLOR_GRADIENTS.green}
            text={option === "in" ? "CLOCK IN" : "CLOCK OUT"}
            buttonStyle={{ paddingVertical: 4, marginHorizontal: 6, flex: 1 }}
            textStyle={{ color: C.textWhite, fontWeight: "600" }}
            onPress={handleClockPress}
            iconSize={60}
            icon={ICONS.clockGif}
          />
          <Button
            colorGradientArr={COLOR_GRADIENTS.blue}
            text="VIEW HISTORY"
            buttonStyle={{ paddingVertical: 4, marginHorizontal: 6, flex: 1 }}
            textStyle={{ color: C.textWhite, fontWeight: "600" }}
            onPress={handleViewHistory}
            iconSize={60}
            icon={ICONS.listGif}
          />
          <Button
            colorGradientArr={COLOR_GRADIENTS.purple}
            text="CANCEL"
            buttonStyle={{ paddingVertical: 4, marginHorizontal: 6, flex: 1 }}
            textStyle={{ color: C.textWhite, fontWeight: "600" }}
            onPress={handleExit}
            iconSize={60}
            icon={ICONS.cancelGif}
          />
        </div>

        {/* ─── schedule: this week + next week ────────────────── */}
        <div
          className={styles.scheduleWrap}
          style={{ borderTopColor: C.borderSubtle }}
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
        </div>
      </div>
    </div>,
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
    <div className={styles.camOverlay} style={{ zIndex: Z.modal }}>
      <button
        type="button"
        aria-label="Close"
        className={styles.modalBackdropBtn}
        onClick={onClose}
      />
      <div className={styles.camCard}>
        <div className={styles.camHeader}>
          <span
            className={styles.camTitle}
            style={{ fontWeight: Fonts.weight.textHeavy }}
          >
            Camera Preview
          </span>
          <button
            type="button"
            className={styles.camCloseBtn}
            onClick={onClose}
            aria-label="Close camera preview"
          >
            <img
              src={typeof ICONS.close1 === "object" ? ICONS.close1.default || ICONS.close1 : ICONS.close1}
              alt=""
              className={styles.camCloseIcon}
            />
          </button>
        </div>
        <div className={styles.camVideoWrap}>
          <video ref={videoRef} autoPlay muted className={styles.camVideo} />
        </div>
        {!zCameraStream && (
          <p className={styles.camNoStream}>No camera stream available</p>
        )}
      </div>
    </div>,
    document.body
  );
};
