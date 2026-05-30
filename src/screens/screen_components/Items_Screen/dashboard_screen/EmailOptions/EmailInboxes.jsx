import React, { useState } from "react";
import {
  Button,
  Image,
  TextInput,
  TouchableOpacity,
} from "../../../../../dom_components";
import { C, COLOR_GRADIENTS, Fonts, ICONS, Radius } from "../../../../../styles";
import { generate36CharUUID, log } from "../../../../../utils";
import {
  useAlertScreenStore,
  useEmailStore,
  useSettingsStore,
} from "../../../../../stores";
import {
  dbCreateEmailAccount,
  dbDeleteEmailAccount,
  dbGmailDisconnect,
  dbGmailInitiateAuth,
  dbUpdateEmailAccount,
} from "../../../../../db_calls_wrapper";
import { BoxContainerInner, BoxContainerOuter, MAX_EMAIL_ACCOUNTS } from "./_helpers";
import styles from "./EmailOptions.module.css";

// Pre-OAuth scope picker. The choice is encoded into the OAuth state param
// so the callback writes assignedStoreID to the auth + accounts docs without
// a second round-trip. Default is Shared (assignedStoreID: null) — matches
// the floating-manager / shared-support-inbox case.
function ScopePickerModal({ open, currentStoreID, onChoose, onCancel }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: C.surfaceBase || "#fff",
          borderRadius: Radius.row,
          padding: 24,
          width: 420,
          maxWidth: "90%",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: Fonts.weight.textHeavy, color: C.text }}>
          Inbox Scope
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.4 }}>
          Choose how this inbox should be scoped. Shared inboxes appear in every
          store under this tenant. Store-specific inboxes are visible only when
          a user is signed into the chosen store.
        </div>
        <TouchableOpacity
          onPress={() => onChoose(null)}
          style={{
            border: `1px solid ${C.buttonLightGreenOutline || "#cfd8dc"}`,
            borderRadius: Radius.control,
            padding: 12,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ fontWeight: Fonts.weight.textHeavy, color: C.text, marginBottom: 4 }}>
            Shared across all stores
          </div>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            Recommended for support@, info@, and other tenant-wide addresses.
          </div>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onChoose(currentStoreID)}
          style={{
            border: `1px solid ${C.buttonLightGreenOutline || "#cfd8dc"}`,
            borderRadius: Radius.control,
            padding: 12,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ fontWeight: Fonts.weight.textHeavy, color: C.text, marginBottom: 4 }}>
            This store only ({currentStoreID || "—"})
          </div>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            Restrict visibility to users signed into this store.
          </div>
        </TouchableOpacity>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            text="Cancel"
            onPress={onCancel}
            colorGradientArr={COLOR_GRADIENTS.grey}
            buttonStyle={{ paddingLeft: 16, paddingRight: 16, paddingTop: 6, paddingBottom: 6 }}
            textStyle={{ fontSize: 13 }}
          />
        </div>
      </div>
    </div>
  );
}

export const EmailInboxes = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sAdding, _sSetAdding] = useState(false);
  const [sEmail, _sSetEmail] = useState("");
  const [sDisplayName, _sSetDisplayName] = useState("");
  const [sEditingKey, _sSetEditingKey] = useState(null);
  const [sEditDisplayName, _sSetEditDisplayName] = useState("");
  const [sScopePickerFor, _sSetScopePickerFor] = useState(null); // accountKey awaiting scope choice
  const emailAccounts = useEmailStore((state) => state.getEmailAccounts()) || [];
  const zEmailAuth = useEmailStore((state) => state.getEmailAuth());
  const zCurrentStoreID = useSettingsStore((s) => s.getSettings?.()?.storeID) || "";

  async function handleAdd() {
    if (!sEmail.trim() || !sDisplayName.trim()) return;
    if (emailAccounts.length >= MAX_EMAIL_ACCOUNTS) return;
    const accountKey = generate36CharUUID();
    await dbCreateEmailAccount(accountKey, {
      email: sEmail.trim().toLowerCase(),
      displayName: sDisplayName.trim(),
      signature: {
        segments: [],
        imageUrl: "",
        fontFamily: "Arial",
        fontSize: 14,
        fontWeight: "400",
      },
      assignedStoreID: null,
    });
    _sSetEmail("");
    _sSetDisplayName("");
    _sSetAdding(false);
  }

  async function handleRemove(accountKey) {
    let acct = emailAccounts.find((a) => a.accountKey === accountKey || a.id === accountKey);
    if (!acct) return;
    const key = acct.accountKey || acct.id;
    useAlertScreenStore.getState().setValues({
      title: "Remove Email Account",
      message: `Remove "${acct.displayName}" (${acct.email})? This will disconnect the account and remove it from all users.`,
      btn1Text: "REMOVE",
      btn2Text: "CANCEL",
      handleBtn1Press: async () => {
        let isConnected = zEmailAuth?.[key]?.status === "connected";
        if (isConnected) {
          await dbGmailDisconnect(key);
        }
        await dbDeleteEmailAccount(key);
      },
      handleBtn2Press: () => null,
      showAlert: true,
    });
  }

  // Open scope picker first; only after a choice do we actually initiate
  // OAuth. The picker writes the choice into the OAuth state, so the
  // callback persists it server-side in one round trip.
  function handleAuthorize(accountKey) {
    _sSetScopePickerFor(accountKey);
  }

  async function handleScopeChosen(assignedStoreID) {
    const accountKey = sScopePickerFor;
    _sSetScopePickerFor(null);
    if (!accountKey) return;
    try {
      let result = await dbGmailInitiateAuth(accountKey, { assignedStoreID });
      if (result.success && result.data?.authUrl) {
        // Persist the scope locally before redirect so a refresh during OAuth
        // still has a usable row (server merge will also set it on callback).
        await dbUpdateEmailAccount(accountKey, { assignedStoreID });
        window.open(result.data.authUrl, "gmailAuth", "width=600,height=700,scrollbars=yes");
      } else {
        log("Gmail auth error", result.error);
      }
    } catch (e) {
      log("Gmail auth error", e);
    }
  }

  async function handleSaveDisplayName(accountKey) {
    if (!sEditDisplayName.trim()) return;
    await dbUpdateEmailAccount(accountKey, { displayName: sEditDisplayName.trim() });
    _sSetEditingKey(null);
    _sSetEditDisplayName("");
  }

  function renderScopeBadge(assignedStoreID) {
    const isShared = !assignedStoreID;
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: Fonts.weight.textHeavy,
          color: isShared ? C.green : (C.textMuted || "#666"),
          background: isShared ? "rgba(46,125,50,0.12)" : "rgba(0,0,0,0.06)",
          borderRadius: Radius.control,
          padding: "2px 6px",
          marginLeft: 8,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {isShared ? "Shared" : `Store: ${assignedStoreID}`}
      </span>
    );
  }

  return (
    <BoxContainerOuter style={{ marginTop: 20 }}>
      <BoxContainerInner style={{ paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: Fonts.weight.textHeavy, color: C.text, marginBottom: 15 }}>
            Email Inboxes
          </span>

          {emailAccounts.map((acct) => {
            const key = acct.accountKey || acct.id;
            let isConnected = zEmailAuth?.[key]?.status === "connected";
            return (
              <div
                key={key}
                className={styles.inboxRow}
                style={{ borderBottomColor: C.buttonLightGreenOutline }}
              >
                <div className={styles.inboxRowLeft}>
                  {sEditingKey === key ? (
                    <div className={styles.inboxNameRow}>
                      <TextInput
                        value={sEditDisplayName}
                        onChangeText={_sSetEditDisplayName}
                        debounceMs={0}
                        style={{
                          flex: 1,
                          fontSize: 14,
                          fontWeight: Fonts.weight.textHeavy,
                          color: C.text,
                          borderColor: C.buttonLightGreenOutline,
                          borderWidth: 1,
                          borderRadius: Radius.control,
                          paddingTop: 2,
                          paddingBottom: 2,
                          paddingLeft: 6,
                          paddingRight: 6,
                          backgroundColor: C.listItemWhite,
                          outline: "none",
                        }}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveDisplayName(key); }}
                      />
                      <TouchableOpacity
                        onPress={() => handleSaveDisplayName(key)}
                        style={{ padding: 2 }}
                      >
                        <span style={{ fontSize: 13, color: C.green, fontWeight: "700" }}>{"\u2713"}</span>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { _sSetEditingKey(null); _sSetEditDisplayName(""); }}
                        style={{ padding: 2 }}
                      >
                        <span style={{ fontSize: 13, color: C.textMuted, fontWeight: "700" }}>{"\u2715"}</span>
                      </TouchableOpacity>
                    </div>
                  ) : (
                    <div className={styles.inboxNameRow}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: Fonts.weight.textHeavy,
                          color: C.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {acct.displayName}
                      </span>
                      {renderScopeBadge(acct.assignedStoreID)}
                      <TouchableOpacity
                        onPress={() => { _sSetEditingKey(key); _sSetEditDisplayName(acct.displayName); }}
                        style={{ padding: 2 }}
                      >
                        <Image icon={ICONS.editPencil} size={14} />
                      </TouchableOpacity>
                    </div>
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      color: C.textMuted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {acct.email}
                  </span>
                </div>
                <div className={styles.inboxRowActions}>
                  {isConnected && (
                    <div
                      className={styles.inboxStatusDot}
                      style={{ backgroundColor: C.green }}
                    />
                  )}
                  <Button
                    text={isConnected ? "Re-Authorize" : "Authorize"}
                    onPress={() => handleAuthorize(key)}
                    colorGradientArr={isConnected ? COLOR_GRADIENTS.grey : COLOR_GRADIENTS.blue}
                    buttonStyle={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4 }}
                    textStyle={{ fontSize: 11 }}
                  />
                  <Button
                    text="Remove"
                    onPress={() => handleRemove(key)}
                    colorGradientArr={COLOR_GRADIENTS.grey}
                    buttonStyle={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4 }}
                    textStyle={{ fontSize: 11 }}
                  />
                </div>
              </div>
            );
          })}

          {sAdding && (
            <div style={{ width: "100%", paddingLeft: 10, paddingRight: 10, marginTop: 12 }}>
              <TextInput
                placeholder="Email address"
                value={sEmail}
                onChangeText={_sSetEmail}
                style={{ marginBottom: 8 }}
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                name="email-account-address"
              />
              <TextInput
                placeholder="Display name (e.g. Sales, Personal)"
                value={sDisplayName}
                onChangeText={_sSetDisplayName}
                style={{ marginBottom: 8 }}
                autoComplete="off"
                name="email-account-display-name"
              />
              <div style={{ display: "flex", flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
                <Button
                  text="Save"
                  onPress={handleAdd}
                  colorGradientArr={COLOR_GRADIENTS.green}
                  buttonStyle={{ paddingLeft: 16, paddingRight: 16, paddingTop: 6, paddingBottom: 6 }}
                  textStyle={{ fontSize: 13 }}
                  enabled={!!sEmail.trim() && !!sDisplayName.trim()}
                />
                <Button
                  text="Cancel"
                  onPress={() => { _sSetAdding(false); _sSetEmail(""); _sSetDisplayName(""); }}
                  colorGradientArr={COLOR_GRADIENTS.grey}
                  buttonStyle={{ paddingLeft: 16, paddingRight: 16, paddingTop: 6, paddingBottom: 6 }}
                  textStyle={{ fontSize: 13 }}
                />
              </div>
            </div>
          )}

          {!sAdding && (
            <Button
              text={emailAccounts.length >= MAX_EMAIL_ACCOUNTS ? "Max 5 Accounts" : "+ Add Email Account"}
              onPress={() => _sSetAdding(true)}
              enabled={emailAccounts.length < MAX_EMAIL_ACCOUNTS}
              colorGradientArr={COLOR_GRADIENTS.blue}
              buttonStyle={{ marginTop: 20, paddingLeft: 20, paddingRight: 20, paddingTop: 8, paddingBottom: 8 }}
              textStyle={{ fontSize: 13 }}
            />
          )}
        </div>
      </BoxContainerInner>

      <ScopePickerModal
        open={!!sScopePickerFor}
        currentStoreID={zCurrentStoreID}
        onChoose={handleScopeChosen}
        onCancel={() => _sSetScopePickerFor(null)}
      />
    </BoxContainerOuter>
  );
};
