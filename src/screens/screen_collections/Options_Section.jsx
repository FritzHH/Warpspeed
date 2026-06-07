/* eslint-disable */

import { checkInternetConnection, convertMillisToHoursMins, dim, localStorageWrapper, log } from "../../utils";
import { Button, Tooltip, LoadingIndicator, ModalFooter, ModalFooterButton, LargeModalHeader, LargeModalHeaderButton } from "../../dom_components";
import { TabMenuButton } from "../../dom_components/TabMenuButton/TabMenuButton";
import { C, COLOR_GRADIENTS, Fonts, ICONS, Radius } from "../../styles";
import { useZ } from "../../hooks/useZ";
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
const UserMessagesModal = lazy(() =>
  import("../screen_components/modal_screens/UserMessagesModal").then((m) => ({
    default: m.UserMessagesModal,
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
  const [sShowUserMessages, _setShowUserMessages] = useState(false);

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
          <Suspense fallback={null}>
            <MessagesComponent />
          </Suspense>
        );
      case TAB_NAMES.optionsTab.email:
        return (
          <Suspense fallback={null}>
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
          handleOpenMessages={() => {
            _setShowUserClockModal(false);
            _setShowUserMessages(true);
          }}
        />
      )}
      {sShowUserMessages && (
        <Suspense fallback={null}>
          <UserMessagesModal handleExit={() => _setShowUserMessages(false)} />
        </Suspense>
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
  const zInAppMessages = useLoginStore((state) => state.inAppMessages) || {};
  const zManagerNotes = useLoginStore((state) => state.managerNotes) || {};

  let userUnreadCount = 0;
  let managerUnreadCount = 0;
  if (zCurrentUser?.id) {
    userUnreadCount = Object.values(zInAppMessages).filter((m) => {
      if (!m) return false;
      if (m.fromUserID === zCurrentUser.id) return false;
      if (m.deletedBy?.[zCurrentUser.id]) return false;
      if (!(m.toUserIDs || []).includes(zCurrentUser.id)) return false;
      return !m.readBy?.[zCurrentUser.id];
    }).length;
    if ((zCurrentUser?.permissions?.level || 0) >= 3) {
      managerUnreadCount = Object.values(zManagerNotes).filter((n) => n && !n.read).length;
    }
  }
  let totalUnreadCount = userUnreadCount + managerUnreadCount;
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
            {totalUnreadCount > 0 && (
              <span className={tabBarStyles.userUnreadBadge}>
                {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
              </span>
            )}
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
    if (showError) {
      return (
        <Tooltip text="Camera offline — click for details" position="bottom">
          <button
            type="button"
            className={tabBarStyles.printerOfflineBtn}
            onClick={showCameraError}
          >
            <img src={ICONS.camera} alt="" className={tabBarStyles.printerOfflineIcon} />
            <span className={tabBarStyles.printerOfflineText}>Offline</span>
          </button>
        </Tooltip>
      );
    }
    return (
      <Tooltip text="Camera on and identifying" position="bottom">
        <div className={tabBarStyles.cameraBtnWrap}>
          <button
            type="button"
            className={tabBarStyles.cameraBtn}
            onClick={() => _sSetShowCameraPreview(true)}
          >
            <img src={ICONS.camera} alt="" className={tabBarStyles.cameraIcon} />
          </button>
        </div>
      </Tooltip>
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
          style={{ borderTopLeftRadius: Radius.container }}
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
              <Tooltip text="Printer offline — click to open Readers/Printers" position="bottom">
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
              </Tooltip>
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

function AppMessagingSlot({ _equalWidth, iconSize, onClick, unreadMsgCount }) {
  return (
    <button type="button" className={styles.notesBtn} onClick={onClick}>
      APP MESSAGING
      {unreadMsgCount > 0 && (
        <span className={styles.notesBadge}>
          {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
        </span>
      )}
    </button>
  );
}

const UserClockModal = ({ user, handleExit, handleViewHistory, handleOpenMessages }) => {
  const zPunchClock = useLoginStore((state) => state.punchClock);
  const settings = useSettingsStore((state) => state.settings);
  const storeHours = settings?.storeHours;
  const schedules = settings?.schedules;
  const zInAppMessages = useLoginStore((state) => state.inAppMessages) || {};
  const [sNoteText, _setNoteText] = useState("");
  const [sNoteSent, _setNoteSent] = useState(false);
  const z = useZ("modal");

  let unreadMsgCount = Object.values(zInAppMessages).filter((m) => {
    if (!m) return false;
    if (m.fromUserID === user?.id) return false;
    if (m.deletedBy?.[user?.id]) return false;
    if (!(m.toUserIDs || []).includes(user?.id)) return false;
    return !m.readBy?.[user?.id];
  }).length;

  function handleSendNote() {
    let trimmed = (sNoteText || "").trim();
    if (!trimmed) return;
    let authorName = ((user?.first || "") + " " + (user?.last || "")).trim();
    useLoginStore.getState().setAddManagerNote(user.id, trimmed, authorName, "punch_forgot");
    _setNoteText("");
    _setNoteSent(true);
    setTimeout(() => _setNoteSent(false), 3000);
  }

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
      handleBtn1Press: async () => {
        let result = await useLoginStore
          .getState()
          .setCreateUserClock(user.id, millis, option);
        if (!result?.success) throw new Error(result?.error || "Punch failed");
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

  let headerLastInitial = user?.last?.length ? user.last[0].toUpperCase() + "." : "";
  let headerDisplayName = ((user?.first || "") + (headerLastInitial ? " " + headerLastInitial : "")).trim();

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} style={{ zIndex: z }}>
      <button
        type="button"
        aria-label="Close"
        className={styles.modalBackdropBtn}
        onClick={handleExit}
      />
      <div className={styles.modalCard}>
        <LargeModalHeader
          title={headerDisplayName}
          iconSize={22}
          style={{ width: "100%" }}
          actions={[
            <AppMessagingSlot
              key="app-messaging"
              onClick={handleOpenMessages}
              unreadMsgCount={unreadMsgCount}
            />,
            <LargeModalHeaderButton
              key="close"
              variant="default"
              icon={ICONS.close1}
              iconPosition="only"
              tooltip="Close"
              onClick={handleExit}
            />,
          ]}
        />
        {/* ─── clock status ───────────────────────────────────── */}
        <p className={styles.modalClockMessage} style={{ color: C.textDisabled }}>
          {clockMessage}
        </p>

        {/* ─── action buttons row ─────────────────────────────── */}
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
        </div>

        {/* ─── schedule: this week + next week ────────────────── */}
        {(() => {
          function userHasShifts(weekStart) {
            let weekShifts = schedules?.[weekStart]?.shifts || {};
            let prefix = `${user?.id}_`;
            return Object.keys(weekShifts).some((k) => k.startsWith(prefix) && weekShifts[k]);
          }
          let showThis = userHasShifts(thisWeekStart);
          let showNext = userHasShifts(nextWeekStart);
          if (!showThis && !showNext) return null;
          return (
            <div
              className={styles.scheduleWrap}
              style={{ borderTopColor: C.borderSubtle }}
            >
              {showThis && (
                <ScheduleWeekRow
                  label="This Week"
                  user={user}
                  weekStart={thisWeekStart}
                  schedules={schedules}
                  storeHours={storeHours}
                  todayStr={todayStr}
                />
              )}
              {showNext && (
                <ScheduleWeekRow
                  label="Next Week"
                  user={user}
                  weekStart={nextWeekStart}
                  schedules={schedules}
                  storeHours={storeHours}
                  todayStr={todayStr}
                />
              )}
            </div>
          );
        })()}

        {/* ─── note to manager ────────────────────────────────── */}
        <div
          className={styles.noteWrap}
          style={{ borderTopColor: C.borderSubtle }}
        >
          <span className={styles.noteHeader} style={{ color: C.textMuted }}>
            Note to Manager
          </span>
          <span className={styles.noteSubtitle} style={{ color: C.textMuted }}>
            Forgot to punch in or out? Let your manager know.
          </span>
          <div
            className={styles.noteInputRow}
            style={{ borderColor: C.borderSubtle, backgroundColor: C.surfaceBase }}
          >
            <textarea
              className={styles.noteInputField}
              value={sNoteText}
              onChange={(e) => {
                let val = e.target.value;
                if (val.length > 0) val = val.charAt(0).toUpperCase() + val.slice(1);
                _setNoteText(val);
              }}
              placeholder="e.g. Forgot to clock in at 8:00 AM today"
              style={{ color: C.text }}
            />
            <div className={styles.noteSendColumn}>
              <button
                type="button"
                className={styles.noteSendBtn}
                disabled={!sNoteText.trim()}
                onClick={handleSendNote}
                style={{ opacity: !sNoteText.trim() ? 0.3 : 1 }}
              >
                <img src={ICONS.airplane} alt="Send" className={styles.noteSendIcon} />
              </button>
            </div>
          </div>
          <div className={styles.noteFooter}>
            <span className={styles.noteConfirmation} style={{ color: sNoteSent ? C.green : "transparent" }}>
              Sent to manager
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const CameraPreviewModal = ({ visible, onClose }) => {
  const videoRef = useRef(null);
  const zCameraStream = useLoginStore((state) => state.cameraStream);
  const z = useZ("modal", visible);

  useEffect(() => {
    if (!visible || !videoRef.current || !zCameraStream) return;
    videoRef.current.srcObject = zCameraStream;
    videoRef.current.play().catch(() => {});
  }, [visible, zCameraStream]);

  if (!visible) return null;

  return ReactDOM.createPortal(
    <div className={styles.camOverlay} style={{ zIndex: z }}>
      <button
        type="button"
        aria-label="Close"
        className={styles.modalBackdropBtn}
        onClick={onClose}
      />
      <div className={styles.camCard}>
        <LargeModalHeader
          title="Camera Preview"
          iconSize={22}
          actions={
            <LargeModalHeaderButton
              variant="default"
              icon={ICONS.close1}
              iconPosition="only"
              tooltip="Close"
              onClick={onClose}
            />
          }
        />
        <div className={styles.camBody}>
          <div className={styles.camVideoWrap}>
            <video ref={videoRef} autoPlay muted className={styles.camVideo} />
          </div>
          {!zCameraStream && (
            <p className={styles.camNoStream}>No camera stream available</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
