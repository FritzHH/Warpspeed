import React, { forwardRef, useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { C, Fonts, ICONS } from "../../styles";
import { gray, deepEqual, localStorageWrapper } from "../../utils";
import { PRIVILEDGE_LEVELS } from "../../data";
import { useLoginStore, useSettingsStore, useAlertScreenStore } from "../../stores";
import { LOCAL_DB_KEYS, PAUSE_USER_CLOCK_IN_CHECK_MILLIS } from "../../constants";
import styles from "./LoginModal.module.css";

export const LoginModal = forwardRef(function LoginModal(
  {
    modalVisible,
    className = "",
    "data-testid": testId,
  },
  ref
) {
  const zAdminPrivilege = useLoginStore((state) => state.adminPrivilege);
  const zUsers = useSettingsStore((state) => state.settings?.users, deepEqual);
  const zPinStrength = useSettingsStore((state) => state.settings?.userPinStrength) || 4;
  const [sPin, _setPin] = useState("");
  const [sError, _setError] = useState("");
  const [sSuccess, _setSuccess] = useState(false);
  const pinInputRef = useRef(null);

  useEffect(() => {
    if (!modalVisible || sSuccess) return;
    const interval = setInterval(() => {
      let store = useLoginStore.getState();
      let user = store.currentUser;
      if (!user) return;
      let timeout = useSettingsStore.getState().getSettings()?.activeLoginTimeoutSeconds || 60;
      let diff = (Date.now() - store.lastActionMillis) / 1000;
      if (diff > timeout) return;
      if (store.adminPrivilege) {
        let perm = user.permissions?.name || user.permissions;
        let level = store.adminPrivilege;
        let hasAccess = false;
        if (level === PRIVILEDGE_LEVELS.user) hasAccess = true;
        if (level === PRIVILEDGE_LEVELS.superUser &&
          (perm === PRIVILEDGE_LEVELS.superUser || perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
          hasAccess = true;
        if (level === PRIVILEDGE_LEVELS.admin &&
          (perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
          hasAccess = true;
        if (level === PRIVILEDGE_LEVELS.owner && perm === PRIVILEDGE_LEVELS.owner)
          hasAccess = true;
        if (!hasAccess) return;
      }
      clearInterval(interval);
      _setPin("");
      _setError("");
      store.setShowLoginScreen(false);
    }, 500);
    return () => clearInterval(interval);
  }, [modalVisible, sSuccess]);

  function handleClose() {
    _setPin("");
    _setError("");
    _setSuccess(false);
    useLoginStore.getState().setShowLoginScreen(false);
  }

  function handlePinChange(input) {
    _setPin(input);
    _setError("");

    let userObj = zUsers?.find((u) => u.pin == input);
    if (!userObj) userObj = zUsers?.find((u) => u.alternatePin == input);
    if (!userObj) {
      if (input.length >= zPinStrength) _setPin("");
      return;
    }

    if (zAdminPrivilege) {
      let level = zAdminPrivilege;
      let perm = userObj.permissions?.name || userObj.permissions;
      let hasAccess = false;
      if (level === PRIVILEDGE_LEVELS.user) hasAccess = true;
      if (level === PRIVILEDGE_LEVELS.superUser &&
        (perm === PRIVILEDGE_LEVELS.superUser || perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
        hasAccess = true;
      if (level === PRIVILEDGE_LEVELS.admin &&
        (perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
        hasAccess = true;
      if (level === PRIVILEDGE_LEVELS.owner && perm === PRIVILEDGE_LEVELS.owner)
        hasAccess = true;

      if (!hasAccess) {
        _setError("Insufficient permissions");
        return;
      }
    }

    useLoginStore.getState().setCurrentUser(userObj);
    useLoginStore.getState().setLastActionMillis();
    _setPin("");
    _setError("");
    useLoginStore.getState().setShowLoginScreen(false);
    useLoginStore.getState().runPostLoginFunction();
    promptClockInIfNeeded(userObj);
  }

  function promptClockInIfNeeded(userObj) {
    let punchClock = useLoginStore.getState().punchClock;
    if (punchClock[userObj.id]) return;

    let clockPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};
    const lastCheckMillis = clockPauseObj[userObj.id];
    if (lastCheckMillis && (Date.now() - lastCheckMillis < PAUSE_USER_CLOCK_IN_CHECK_MILLIS)) {
      return;
    }

    useAlertScreenStore.getState().setValues({
      title: "PUNCH CLOCK",
      message: "Hi " + userObj.first + ", you are not clocked in. Would you like to punch in now?",
      btn1Text: "CLOCK IN",
      btn2Text: "NOT NOW",
      handleBtn1Press: () => {
        useLoginStore.getState().setCreateUserClock(userObj.id, new Date().getTime(), "in");
      },
      handleBtn2Press: () => {
        let freshPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};
        freshPauseObj[userObj.id] = Date.now();
        localStorageWrapper.setItem(LOCAL_DB_KEYS.userClockCheckPauseObj, freshPauseObj);
      },
      showAlert: true,
    });
  }

  if (!modalVisible) return null;

  const resolveIcon = (src) => {
    if (!src) return null;
    return typeof src === "object" ? src.default || src : src;
  };

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className={`${styles.backdrop} ${className}`}
      onClick={handleClose}
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-label={zAdminPrivilege ? "Authorization Required" : "Login"}
    >
      <div
        className={styles.card}
        onClick={(e) => { e.stopPropagation(); pinInputRef.current?.focus(); }}
        style={{
          backgroundColor: sSuccess ? C.green : undefined,
          borderColor: sSuccess ? C.green : C.buttonLightGreenOutline,
        }}
      >
        {/* Header */}
        <div className={styles.header}>
          <span
            className={styles.title}
            style={{ color: sSuccess ? "white" : C.text }}
          >
            {sSuccess ? "Welcome!" : zAdminPrivilege ? "Authorization Required" : "Login"}
          </span>
        </div>

        {/* Privilege badge */}
        {!!zAdminPrivilege && !sSuccess && (
          <div className={styles.privilegeBadge} style={{ backgroundColor: gray(0.05) }}>
            <span className={styles.privilegeText} style={{ color: gray(0.5) }}>
              Requires: <span style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}>{zAdminPrivilege}</span> or higher
            </span>
          </div>
        )}

        {/* PIN input */}
        {!sSuccess && (
          <div className={styles.pinSection}>
            <span className={styles.pinLabel} style={{ color: gray(0.5) }}>Enter PIN</span>
            <div
              className={styles.pinBoxes}
              onClick={() => pinInputRef.current?.focus()}
            >
              {Array.from({ length: zPinStrength }).map((_, i) => {
                const isFilled = i < sPin.length;
                const isCursor = i === sPin.length;
                return (
                  <div
                    key={i}
                    className={styles.pinBox}
                    style={{
                      borderColor: sError ? C.red : isCursor ? C.cursorRed : isFilled ? "#007bff" : "#ddd",
                      backgroundColor: isCursor ? C.cursorRed : isFilled ? "#fff" : "#f8f9fa",
                      boxShadow: isCursor ? "0 0 10px rgba(255, 107, 107, 0.5)" : "none",
                    }}
                  >
                    {isFilled && <div className={styles.pinDot} style={{ backgroundColor: C.text }} />}
                  </div>
                );
              })}
              <input
                ref={pinInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus={true}
                value={sPin}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, "").slice(0, zPinStrength);
                  handlePinChange(clean);
                }}
                maxLength={zPinStrength}
                className={styles.hiddenInput}
              />
            </div>
            {!!sError && (
              <span className={styles.errorText} style={{ color: C.red }}>{sError}</span>
            )}
          </div>
        )}

        {/* Success state */}
        {sSuccess && (
          <div className={styles.successIcon}>
            <img src={resolveIcon(ICONS.check)} alt="" style={{ width: 30, height: 30, filter: "brightness(0) invert(1)" }} />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});
