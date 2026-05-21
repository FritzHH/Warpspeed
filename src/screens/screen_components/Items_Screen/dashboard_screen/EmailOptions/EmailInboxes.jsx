import React, { useState } from "react";
import {
  Button,
  CheckBox,
  Image,
  TextInput,
  TouchableOpacity,
} from "../../../../../dom_components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../../styles";
import { generate36CharUUID, log } from "../../../../../utils";
import { useAlertScreenStore, useEmailStore } from "../../../../../stores";
import {
  dbGmailDisconnect,
  dbGmailInitiateAuth,
} from "../../../../../db_calls_wrapper";
import { BoxContainerInner, BoxContainerOuter, MAX_EMAIL_ACCOUNTS } from "./_helpers";
import styles from "./EmailOptions.module.css";

export const EmailInboxes = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sAdding, _sSetAdding] = useState(false);
  const [sEmail, _sSetEmail] = useState("");
  const [sDisplayName, _sSetDisplayName] = useState("");
  const [sEditingKey, _sSetEditingKey] = useState(null);
  const [sEditDisplayName, _sSetEditDisplayName] = useState("");
  const emailAccounts = zSettingsObj?.emailAccounts || [];
  const zEmailAuth = useEmailStore((state) => state.getEmailAuth());

  function handleAdd() {
    if (!sEmail.trim() || !sDisplayName.trim()) return;
    if (emailAccounts.length >= MAX_EMAIL_ACCOUNTS) return;
    let newAccount = {
      accountKey: generate36CharUUID(),
      email: sEmail.trim().toLowerCase(),
      displayName: sDisplayName.trim(),
      appendUserName: false,
      signature: { segments: [], imageUrl: "", fontFamily: "Arial", fontSize: 14, fontWeight: "400" },
    };
    let updated = [...emailAccounts, newAccount];
    handleSettingsFieldChange("emailAccounts", updated);
    _sSetEmail("");
    _sSetDisplayName("");
    _sSetAdding(false);
  }

  async function handleRemove(accountKey) {
    let acct = emailAccounts.find((a) => a.accountKey === accountKey);
    if (!acct) return;
    useAlertScreenStore.getState().setValues({
      title: "Remove Email Account",
      message: `Remove "${acct.displayName}" (${acct.email})? This will disconnect the account and remove it from all users.`,
      btn1Text: "REMOVE",
      btn2Text: "CANCEL",
      handleBtn1Press: async () => {
        let isConnected = zEmailAuth?.[accountKey]?.status === "connected";
        if (isConnected) {
          await dbGmailDisconnect(accountKey);
        }
        let updated = emailAccounts.filter((a) => a.accountKey !== accountKey);
        handleSettingsFieldChange("emailAccounts", updated);
      },
      handleBtn2Press: () => null,
      showAlert: true,
    });
  }

  async function handleAuthorize(accountKey) {
    try {
      let result = await dbGmailInitiateAuth(accountKey);
      if (result.success && result.data?.authUrl) {
        window.open(result.data.authUrl, "gmailAuth", "width=600,height=700,scrollbars=yes");
      } else {
        log("Gmail auth error", result.error);
      }
    } catch (e) {
      log("Gmail auth error", e);
    }
  }

  function handleSaveDisplayName(accountKey) {
    if (!sEditDisplayName.trim()) return;
    let updated = emailAccounts.map((a) =>
      a.accountKey === accountKey ? { ...a, displayName: sEditDisplayName.trim() } : a
    );
    handleSettingsFieldChange("emailAccounts", updated);
    _sSetEditingKey(null);
    _sSetEditDisplayName("");
  }

  function handleMigrate() {
    if (emailAccounts.length > 0) return;
    let accounts = [];
    if (zSettingsObj?.storeInfo?.supportEmail) {
      accounts.push({
        accountKey: "support",
        email: zSettingsObj.storeInfo.supportEmail,
        displayName: "Support",
        signature: zSettingsObj.emailSignature ? { ...zSettingsObj.emailSignature } : { segments: [], imageUrl: "", fontFamily: "Arial", fontSize: 14, fontWeight: "400" },
      });
    }
    if (zSettingsObj?.storeInfo?.officeEmail) {
      accounts.push({
        accountKey: "office",
        email: zSettingsObj.storeInfo.officeEmail,
        displayName: "Office",
        signature: { segments: [], imageUrl: "", fontFamily: "Arial", fontSize: 14, fontWeight: "400" },
      });
    }
    if (accounts.length > 0) {
      handleSettingsFieldChange("emailAccounts", accounts);
    }
  }

  return (
    <BoxContainerOuter style={{ marginTop: 20 }}>
      <BoxContainerInner style={{ paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: Fonts.weight.textHeavy, color: C.text, marginBottom: 15 }}>
            Email Inboxes
          </span>

          {emailAccounts.map((acct) => {
            let isConnected = zEmailAuth?.[acct.accountKey]?.status === "connected";
            return (
              <div
                key={acct.accountKey}
                className={styles.inboxRow}
                style={{ borderBottomColor: C.buttonLightGreenOutline }}
              >
                <div className={styles.inboxRowLeft}>
                  {sEditingKey === acct.accountKey ? (
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
                          borderRadius: 5,
                          paddingTop: 2,
                          paddingBottom: 2,
                          paddingLeft: 6,
                          paddingRight: 6,
                          backgroundColor: C.listItemWhite,
                          outline: "none",
                        }}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveDisplayName(acct.accountKey); }}
                      />
                      <TouchableOpacity
                        onPress={() => handleSaveDisplayName(acct.accountKey)}
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
                      <TouchableOpacity
                        onPress={() => { _sSetEditingKey(acct.accountKey); _sSetEditDisplayName(acct.displayName); }}
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
                  <CheckBox
                    isChecked={!!acct.appendUserName}
                    text="Append user name"
                    onCheck={() => {
                      let updated = emailAccounts.map((a) =>
                        a.accountKey === acct.accountKey ? { ...a, appendUserName: !a.appendUserName } : a
                      );
                      handleSettingsFieldChange("emailAccounts", updated);
                    }}
                    buttonStyle={{ marginTop: 4 }}
                    textStyle={{ fontSize: 11, color: C.textMuted }}
                  />
                </div>
                <div className={styles.inboxRowActions}>
                  {isConnected && (
                    <div
                      className={styles.inboxStatusDot}
                      style={{ backgroundColor: C.green }}
                    />
                  )}
                  {!isConnected && (
                    <Button
                      text="Authorize"
                      onPress={() => handleAuthorize(acct.accountKey)}
                      colorGradientArr={COLOR_GRADIENTS.blue}
                      buttonStyle={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4 }}
                      textStyle={{ fontSize: 11 }}
                    />
                  )}
                  <Button
                    text="Remove"
                    onPress={() => handleRemove(acct.accountKey)}
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
              />
              <TextInput
                placeholder="Display name (e.g. Sales, Personal)"
                value={sDisplayName}
                onChangeText={_sSetDisplayName}
                style={{ marginBottom: 8 }}
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

          {emailAccounts.length === 0 && (
            <Button
              text="Migrate Existing Accounts"
              onPress={handleMigrate}
              colorGradientArr={COLOR_GRADIENTS.purple}
              buttonStyle={{ marginTop: 12, paddingLeft: 20, paddingRight: 20, paddingTop: 8, paddingBottom: 8 }}
              textStyle={{ fontSize: 13 }}
            />
          )}
        </div>
      </BoxContainerInner>
    </BoxContainerOuter>
  );
};
