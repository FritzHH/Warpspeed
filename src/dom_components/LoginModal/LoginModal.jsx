import React, { forwardRef, useState, useRef, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { C, Fonts, ICONS } from "../../styles";
import { useZ } from "../../hooks/useZ";
import { deepEqual, localStorageWrapper, verifyPin, verifyAlternatePin, hashPin, generatePinSalt } from "../../utils";
import { permissionToLevel } from "../../data";
import { useLoginStore, useSettingsStore, useAlertScreenStore } from "../../stores";
import { LOCAL_DB_KEYS, PAUSE_USER_CLOCK_IN_CHECK_MILLIS } from "../../constants";
import { LargeModalHeader, LargeModalHeaderButton } from "../LargeModalHeader/LargeModalHeader";
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
  const [sExpandedTo4, _setExpandedTo4] = useState(false);
  const pinInputRef = useRef(null);
  const pinReqRef = useRef(0);
  const z = useZ("modal", modalVisible);

  const requiredLevel = permissionToLevel(zAdminPrivilege);
  const adminEntryRequired = requiredLevel >= 4;
  const effectivePinLength = (sExpandedTo4 || adminEntryRequired) ? 4 : zPinStrength;
  const showLockToggle = zPinStrength < 4 && !adminEntryRequired;

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
        let hasAccess = permissionToLevel(user.permissions) >= permissionToLevel(store.adminPrivilege);
        if (!hasAccess) return;
      }
      clearInterval(interval);
      _setPin("");
      _setError("");
      store.setShowLoginScreen(false);
      store.resolveLoginPrompt(true);
    }, 500);
    return () => clearInterval(interval);
  }, [modalVisible, sSuccess]);

  function handleClose() {
    _setPin("");
    _setError("");
    _setSuccess(false);
    useLoginStore.getState().setShowLoginScreen(false);
    useLoginStore.getState().resolveLoginPrompt(false);
  }

  async function handlePinChange(input) {
    _setPin(input);
    _setError("");
    if (!input) return;

    const reqId = ++pinReqRef.current;
    const users = zUsers || [];

    let userObj = null;
    let matchType = null;
    const primaryMatches = await Promise.all(users.map((u) => verifyPin(input, u)));
    if (reqId !== pinReqRef.current) return;
    const pIdx = primaryMatches.findIndex(Boolean);
    if (pIdx >= 0) { userObj = users[pIdx]; matchType = "primary"; }

    if (!userObj) {
      const altMatches = await Promise.all(users.map((u) => verifyAlternatePin(input, u)));
      if (reqId !== pinReqRef.current) return;
      const aIdx = altMatches.findIndex(Boolean);
      if (aIdx >= 0) { userObj = users[aIdx]; matchType = "alternate"; }
    }

    if (!userObj) {
      if (input.length >= effectivePinLength) _setPin("");
      return;
    }

    if (zAdminPrivilege) {
      let hasAccess = permissionToLevel(userObj.permissions) >= permissionToLevel(zAdminPrivilege);
      if (!hasAccess) {
        _setError("Insufficient permissions");
        return;
      }
    }

    maybeLazyMigratePin(userObj, input, matchType);

    useLoginStore.getState().setCurrentUser(userObj);
    useLoginStore.getState().setLastActionMillis();
    _setPin("");
    _setError("");
    useLoginStore.getState().setShowLoginScreen(false);
    useLoginStore.getState().resolveLoginPrompt(true);
    runPostLoginChain(userObj);
  }

  async function maybeLazyMigratePin(userObj) {
    const claims = useLoginStore.getState().authClaims;
    if (claims?.privilege) return;
    const needsPrimary = !!userObj.pin && !userObj.pinHash;
    const needsAlt = !!userObj.alternatePin && !userObj.alternatePinHash;
    if (!needsPrimary && !needsAlt) return;
    try {
      let primaryHash, primarySalt, altHash, altSalt;
      if (needsPrimary) {
        primarySalt = generatePinSalt();
        primaryHash = await hashPin(userObj.pin, primarySalt);
      }
      if (needsAlt) {
        altSalt = generatePinSalt();
        altHash = await hashPin(userObj.alternatePin, altSalt);
      }
      const liveUsers = useSettingsStore.getState().settings?.users || [];
      const updated = liveUsers.map((u) => {
        if (u.id !== userObj.id) return u;
        const next = { ...u };
        if (needsPrimary) {
          next.pinHash = primaryHash;
          next.pinSalt = primarySalt;
          delete next.pin;
        }
        if (needsAlt) {
          next.alternatePinHash = altHash;
          next.alternatePinSalt = altSalt;
          delete next.alternatePin;
        }
        return next;
      });
      useSettingsStore.getState().setField("users", updated);
    } catch (e) {}
  }

  function runPostLoginChain(userObj) {
    let steps = [
      (next) => maybeOpenMessagesModal(userObj, next),
      (next) => maybePromptClockIn(userObj, next),
    ];
    let i = 0;
    function runNext() {
      if (i >= steps.length) return;
      let step = steps[i++];
      step(() => setTimeout(runNext, 150));
    }
    runNext();
  }

  function maybeOpenMessagesModal(userObj, next) {
    useLoginStore.getState().triggerLoginMessagesAutoOpen(userObj, next);
  }

  function maybePromptClockIn(userObj, next) {
    promptClockInIfNeeded(userObj);
    next();
  }

  function promptClockInIfNeeded(userObj) {
    if (permissionToLevel(userObj.permissions) >= 4) return;
    let punchClock = useLoginStore.getState().punchClock;
    if (punchClock[userObj.id]) return;

    let clockPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};
    const lastCheckMillis = clockPauseObj[userObj.id];
    if (lastCheckMillis && (Date.now() - lastCheckMillis < PAUSE_USER_CLOCK_IN_CHECK_MILLIS)) {
      return;
    }

    useAlertScreenStore.getState().setValues({
      message: "Hi " + userObj.first + ", you are not clocked in. Would you like to punch in now?",
      btn1Text: "CLOCK IN",
      btn2Text: "NOT NOW",
      handleBtn1Press: async () => {
        let result = await useLoginStore
          .getState()
          .setCreateUserClock(userObj.id, new Date().getTime(), "in");
        if (!result?.success) throw new Error(result?.error || "Punch failed");
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

  return (
    <DialogPrimitive.Root open={modalVisible} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <div className={`${styles.backdrop} ${className}`} style={{ zIndex: z }} />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          asChild
          onOpenAutoFocus={(e) => { e.preventDefault(); pinInputRef.current?.focus(); }}
        >
          <div
            ref={ref}
            className={styles.contentWrapper}
            style={{ zIndex: z + 1 }}
            data-testid={testId}
          >
            <DialogPrimitive.Title className={styles.srOnly}>
              {zAdminPrivilege ? "Admin Login" : "Login"}
            </DialogPrimitive.Title>
            <div
              className={styles.card}
              onClick={(e) => { e.stopPropagation(); pinInputRef.current?.focus(); }}
              style={{
                backgroundColor: sSuccess ? C.green : undefined,
              }}
            >
              <LargeModalHeader
                title={sSuccess ? "Welcome!" : zAdminPrivilege ? "Admin Login" : "User Login"}
                actions={[
                  !sSuccess && showLockToggle && (
                    <LargeModalHeaderButton
                      key="lock"
                      variant="default"
                      icon={sExpandedTo4 ? ICONS.unblock : ICONS.blocked}
                      iconSize={22}
                      iconPosition="only"
                      tooltip={sExpandedTo4 ? "Use standard PIN length" : "Use 4-digit admin PIN"}
                      onClick={(e) => {
                        e.stopPropagation();
                        _setExpandedTo4((v) => !v);
                        _setPin("");
                        _setError("");
                        pinInputRef.current?.focus();
                      }}
                    />
                  ),
                  !sSuccess && (
                    <LargeModalHeaderButton
                      key="close"
                      variant="default"
                      icon={ICONS.close1}
                      iconSize={22}
                      iconPosition="only"
                      tooltip="Close"
                      onClick={(e) => { e.stopPropagation(); handleClose(); }}
                    />
                  ),
                ]}
              />
              <div className={styles.body}>
                {/* Privilege badge */}
                {!!zAdminPrivilege && !sSuccess && (
                  <div className={styles.privilegeBadge} style={{ backgroundColor: C.surfaceAlt }}>
                    <span className={styles.privilegeText} style={{ color: C.textMuted }}>
                      Requires: <span style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}>{zAdminPrivilege}</span> or higher
                    </span>
                  </div>
                )}

                {/* PIN input */}
                {!sSuccess && (
                  <div className={styles.pinSection}>
                    <span className={styles.pinLabel} style={{ color: C.textMuted }}>Enter PIN</span>
                    <div
                      className={styles.pinBoxes}
                      onClick={() => pinInputRef.current?.focus()}
                    >
                      {Array.from({ length: effectivePinLength }).map((_, i) => {
                        const isFilled = i < sPin.length;
                        const isCursor = i === sPin.length;
                        return (
                          <div
                            key={i}
                            className={styles.pinBox}
                            style={{
                              borderColor: sError ? C.danger : isCursor ? C.dangerStrong : isFilled ? C.borderFocus : C.borderSubtle,
                              backgroundColor: isCursor ? C.dangerStrong : isFilled ? C.surfaceBase : C.surfaceAlt,
                              boxShadow: isCursor ? `0 0 10px ${C.dangerStrong}` : "none",
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
                          const clean = e.target.value.replace(/\D/g, "").slice(0, effectivePinLength);
                          handlePinChange(clean);
                        }}
                        maxLength={effectivePinLength}
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

            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});
