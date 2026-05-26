/* eslint-disable */
// Stripe Connect onboarding screen — dedicated route for the SaaS Connect flow.
//
// Surfaces three states off the same `tenants/{tenantID}/connect-accounts`
// collection:
//   1. No account yet — caller submits email/businessName, account is created
//      via `stripeConnectAccountCreate`.
//   2. Account exists but onboarding incomplete (`!chargesEnabled`) — caller
//      hits "Continue onboarding" which mints a Stripe Account Link and
//      redirects to Stripe's hosted form.
//   3. Onboarded — status panel shows charges/payouts/requirements.
//
// Mode prop:
//   - "refresh"  Stripe sent the merchant back here because the previous link
//                expired. Auto-mint a fresh link and redirect.
//   - "complete" Stripe sent the merchant back after they finished. Force a
//                status pull so the cache reflects current Stripe state
//                without waiting for the webhook.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, LoadingIndicator, TextInput } from "../dom_components";
import { C, COLOR_GRADIENTS, ICONS } from "../styles";
import { useSettingsStore, useLoginStore } from "../stores";
import {
  firestoreSubscribeCollection,
  stripeConnectAccountCreateCallable,
  stripeConnectAccountLinkCreateCallable,
  stripeConnectAccountStatusCallable,
  AUTH,
} from "../db_calls";
import { ROUTES } from "../routes";
import { log } from "../utils";
import styles from "./StripeConnectScreen.module.css";

export function StripeConnectScreen({ mode = "default" }) {
  const navigate = useNavigate();
  const zSettings = useSettingsStore((state) => state.settings);
  const zCurrentUser = useLoginStore((state) => state.getCurrentUser());

  const tenantID = zSettings?.tenantID;
  const defaultEmail = AUTH.currentUser?.email || zCurrentUser?.email || "";
  const defaultBusinessName = zSettings?.storeInfo?.storeName || "";

  const [sAccounts, _setAccounts] = useState(null);
  const [sLoading, _setLoading] = useState(false);
  const [sError, _setError] = useState("");
  const [sEmail, _setEmail] = useState(defaultEmail);
  const [sBusinessName, _setBusinessName] = useState(defaultBusinessName);
  const [sJustRefreshed, _setJustRefreshed] = useState(false);

  // Subscribe to the tenant's Connect accounts. There's typically one but
  // the schema supports multiple, so we render whichever is most-recently
  // created. Listener self-syncs after status pulls and webhook updates.
  useEffect(() => {
    if (!tenantID) return;
    const path = `tenants/${tenantID}/connect-accounts`;
    const unsub = firestoreSubscribeCollection(path, (docs, err) => {
      if (err) {
        _setError("Could not load Connect accounts. " + (err.message || ""));
        return;
      }
      _setAccounts(docs || []);
    });
    return () => unsub && unsub();
  }, [tenantID]);

  // Pick the active account: most recently created. Most tenants will only
  // have one, but the picker logic handles chain scenarios.
  const activeAccount = (sAccounts || [])
    .slice()
    .sort((a, b) => {
      const aMs = a?.createdAt?.toMillis?.() || 0;
      const bMs = b?.createdAt?.toMillis?.() || 0;
      return bMs - aMs;
    })[0] || null;

  // mode === "complete": Stripe redirected here after merchant finished
  // onboarding. Force a fresh status pull so the cache reflects current
  // state without waiting for the `account.updated` webhook.
  useEffect(() => {
    if (mode !== "complete" || !activeAccount?.stripeAccountID || sJustRefreshed) return;
    _setJustRefreshed(true);
    refreshStatus(activeAccount.stripeAccountID);
  }, [mode, activeAccount?.stripeAccountID, sJustRefreshed]);

  // mode === "refresh": Stripe sent the merchant back because the link
  // expired. Mint a new one and redirect.
  useEffect(() => {
    if (mode !== "refresh" || !activeAccount?.stripeAccountID) return;
    handleContinueOnboarding(activeAccount.stripeAccountID);
  }, [mode, activeAccount?.stripeAccountID]);

  async function handleCreateAccount() {
    _setError("");
    if (!tenantID) {
      _setError("Tenant not loaded.");
      return;
    }
    if (!sEmail || !sEmail.includes("@")) {
      _setError("Enter a valid email for the merchant account.");
      return;
    }
    _setLoading(true);
    try {
      const result = await stripeConnectAccountCreateCallable({
        tenantID,
        email: sEmail.trim(),
        businessName: sBusinessName?.trim() || undefined,
      });
      log("Connect account created:", result.data);
      // Listener will pick up the new doc — no manual state push needed.
    } catch (err) {
      log("Connect account create failed:", err);
      _setError(err.message || "Could not create Connect account.");
    } finally {
      _setLoading(false);
    }
  }

  async function handleContinueOnboarding(stripeAccountID) {
    _setError("");
    _setLoading(true);
    try {
      const result = await stripeConnectAccountLinkCreateCallable({
        stripeAccountID,
      });
      const url = result?.data?.url;
      if (!url) throw new Error("No onboarding URL returned.");
      window.location.href = url;
    } catch (err) {
      log("Onboarding link create failed:", err);
      _setError(err.message || "Could not start onboarding.");
      _setLoading(false);
    }
  }

  async function refreshStatus(stripeAccountID) {
    _setError("");
    _setLoading(true);
    try {
      const result = await stripeConnectAccountStatusCallable({
        stripeAccountID,
        tenantID,
      });
      log("Connect status refreshed:", result.data);
      // Backend syncs the Firestore cache, listener picks it up.
    } catch (err) {
      log("Status refresh failed:", err);
      _setError(err.message || "Could not refresh status.");
    } finally {
      _setLoading(false);
    }
  }

  const isLoaded = sAccounts !== null;
  const isOnboarded = !!activeAccount?.chargesEnabled;
  const isDeauthorized = activeAccount?.status === "deauthorized";

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => navigate(ROUTES.dashboard)}
          aria-label="Back to dashboard"
        >
          ← Dashboard
        </button>
        <h1 className={styles.title}>Stripe Connect</h1>
        <div className={styles.headerSpacer} />
      </div>

      <div className={styles.body}>
        {!tenantID && (
          <div className={styles.card}>
            <p className={styles.muted}>Loading tenant...</p>
          </div>
        )}

        {tenantID && !isLoaded && (
          <div className={styles.card}>
            <LoadingIndicator />
            <p className={styles.muted}>Loading Connect status...</p>
          </div>
        )}

        {tenantID && isLoaded && !activeAccount && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Set up payments</h2>
            <p className={styles.cardSubtitle}>
              Create a Stripe-connected account to start accepting card
              payments through the platform.
            </p>

            <label className={styles.label}>Merchant email</label>
            <TextInput
              value={sEmail}
              onChangeText={_setEmail}
              placeholder="owner@yourbusiness.com"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: `1px solid ${C.borderDefault}`,
                borderRadius: 6,
                outline: "none",
                marginBottom: 12,
              }}
            />

            <label className={styles.label}>Business name (optional)</label>
            <TextInput
              value={sBusinessName}
              onChangeText={_setBusinessName}
              placeholder="Your Business LLC"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: `1px solid ${C.borderDefault}`,
                borderRadius: 6,
                outline: "none",
                marginBottom: 20,
              }}
            />

            {sError && <p className={styles.error}>{sError}</p>}

            <Button
              text={sLoading ? "Creating..." : "Create Connect account"}
              onPress={handleCreateAccount}
              enabled={!sLoading}
              colorGradientArr={COLOR_GRADIENTS.green}
              fullWidth
              buttonStyle={{ height: 44 }}
              textStyle={{ color: "white", fontWeight: 600 }}
            />
          </div>
        )}

        {tenantID && isLoaded && activeAccount && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              {isDeauthorized
                ? "Account disconnected"
                : isOnboarded
                ? "Payments enabled"
                : "Finish onboarding"}
            </h2>
            <p className={styles.accountID}>
              Account: <code>{activeAccount.stripeAccountID}</code>
            </p>

            {isDeauthorized && (
              <p className={styles.warning}>
                This account has been disconnected from the platform. Re-create
                a connection to resume payments.
              </p>
            )}

            {!isDeauthorized && !isOnboarded && (
              <p className={styles.cardSubtitle}>
                Stripe needs some more information before this account can
                accept payments.
              </p>
            )}

            <div className={styles.statusGrid}>
              <StatusRow
                label="Charges enabled"
                value={activeAccount.chargesEnabled}
              />
              <StatusRow
                label="Payouts enabled"
                value={activeAccount.payoutsEnabled}
              />
              <StatusRow
                label="Details submitted"
                value={activeAccount.detailsSubmitted}
              />
            </div>

            {Array.isArray(activeAccount.requirementsCurrentlyDue) &&
              activeAccount.requirementsCurrentlyDue.length > 0 && (
                <div className={styles.requirements}>
                  <div className={styles.requirementsTitle}>
                    Required by Stripe:
                  </div>
                  <ul className={styles.requirementsList}>
                    {activeAccount.requirementsCurrentlyDue.map((req) => (
                      <li key={req}>{req.replace(/\./g, " › ").replace(/_/g, " ")}</li>
                    ))}
                  </ul>
                </div>
              )}

            {sError && <p className={styles.error}>{sError}</p>}

            <div className={styles.buttonRow}>
              {!isOnboarded && !isDeauthorized && (
                <Button
                  text={sLoading ? "Loading..." : "Continue onboarding"}
                  onPress={() =>
                    handleContinueOnboarding(activeAccount.stripeAccountID)
                  }
                  enabled={!sLoading}
                  colorGradientArr={COLOR_GRADIENTS.green}
                  buttonStyle={{ height: 44, flex: 1 }}
                  textStyle={{ color: "white", fontWeight: 600 }}
                />
              )}
              <Button
                text={sLoading ? "..." : "Refresh status"}
                onPress={() => refreshStatus(activeAccount.stripeAccountID)}
                enabled={!sLoading}
                colorGradientArr={COLOR_GRADIENTS.grey}
                buttonStyle={{ height: 44, flex: 1 }}
                textStyle={{ color: "white", fontWeight: 600 }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusRow({ label, value }) {
  return (
    <div className={styles.statusRow}>
      <span className={styles.statusLabel}>{label}</span>
      <span
        className={value ? styles.statusOk : styles.statusPending}
      >
        {value ? "Yes" : "No"}
      </span>
    </div>
  );
}
