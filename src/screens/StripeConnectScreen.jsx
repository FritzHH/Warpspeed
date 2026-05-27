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
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, LoadingIndicator, TextInput } from "../dom_components";
import { C, COLOR_GRADIENTS, ICONS } from "../styles";
import { useSettingsStore, useLoginStore } from "../stores";
import {
  firestoreSubscribe,
  firestoreSubscribeCollection,
  stripeConnectAccountCreateCallable,
  stripeConnectAccountLinkCreateCallable,
  stripeConnectAccountStatusCallable,
  stripeConnectCreateTerminalLocationCallable,
  stripeConnectRegisterReaderCallable,
  stripeConnectListReadersCallable,
  AUTH,
} from "../db_calls";
import { ROUTES } from "../routes";
import { log } from "../utils";
import styles from "./StripeConnectScreen.module.css";

// Stripe Terminal-supported countries (subset most likely for SaaS launch).
// Stripe's Terminal location API accepts ISO-2 country codes; for non-US the
// `state` field becomes a free-text region (Stripe rejects bad combinations
// itself, so we don't validate region format here).
const TERMINAL_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "NO", name: "Norway" },
  { code: "SE", name: "Sweden" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NZ", name: "New Zealand" },
  { code: "SG", name: "Singapore" },
];

// Capability check for Tap to Pay on iPhone. Stripe's JS SDK only supports
// TTPi on iOS Safari running on an eligible iPhone (XS or later, iOS 16.7+).
// We can't detect iPhone hardware generation from JS — Stripe's discovery
// surfaces an explicit error if the device is ineligible, so we just check
// platform+browser here and let Stripe handle hardware gating.
function detectIsIOSSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

export function StripeConnectScreen({ mode = "default" }) {
  const navigate = useNavigate();
  const zSettings = useSettingsStore((state) => state.settings);
  const zCurrentUser = useLoginStore((state) => state.getCurrentUser());

  const tenantID = zSettings?.tenantID;
  const storeID = zSettings?.storeID;
  const storeInfo = zSettings?.storeInfo || {};
  const defaultEmail = AUTH.currentUser?.email || zCurrentUser?.email || "";
  const defaultBusinessName = storeInfo.storeName || "";

  const [sAccounts, _setAccounts] = useState(null);
  const [sLoading, _setLoading] = useState(false);
  const [sError, _setError] = useState("");
  const [sEmail, _setEmail] = useState(defaultEmail);
  const [sBusinessName, _setBusinessName] = useState(defaultBusinessName);
  const [sJustRefreshed, _setJustRefreshed] = useState(false);

  // Reader-section state (gated on isOnboarded later).
  const [sConnectConfig, _setConnectConfig] = useState(null);
  const [sConfigLoaded, _setConfigLoaded] = useState(false);
  const [sReaders, _setReaders] = useState(null);
  const [sReaderError, _setReaderError] = useState("");
  const [sReaderBusy, _setReaderBusy] = useState(false);

  // Location form (only shown when no terminalLocationID yet).
  const [sLocCountry, _setLocCountry] = useState("US");
  const [sLocDisplayName, _setLocDisplayName] = useState("");
  const [sLocLine1, _setLocLine1] = useState("");
  const [sLocLine2, _setLocLine2] = useState("");
  const [sLocCity, _setLocCity] = useState("");
  const [sLocState, _setLocState] = useState("");
  const [sLocPostal, _setLocPostal] = useState("");

  // Register-reader form.
  const [sRegCode, _setRegCode] = useState("");
  const [sRegLabel, _setRegLabel] = useState("");

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
  const connectAccountID = activeAccount?.stripeAccountID || null;
  const terminalLocationID = sConnectConfig?.terminalLocationID || null;
  const showReaderUI =
    isOnboarded && !isDeauthorized && !!tenantID && !!storeID && !!connectAccountID;
  const isIOSSafari = useMemo(() => detectIsIOSSafari(), []);

  // Subscribe to connect-config/config doc (carries terminalLocationID).
  useEffect(() => {
    if (!showReaderUI) return;
    const path = `tenants/${tenantID}/stores/${storeID}/connect-config/config`;
    const unsub = firestoreSubscribe(path, (data, err) => {
      if (err) {
        _setReaderError("Could not load Terminal config. " + (err.message || ""));
        _setConfigLoaded(true);
        return;
      }
      _setConnectConfig(data || null);
      _setConfigLoaded(true);
    });
    return () => unsub && unsub();
  }, [showReaderUI, tenantID, storeID]);

  // Subscribe to readers subcollection.
  useEffect(() => {
    if (!showReaderUI) return;
    const path = `tenants/${tenantID}/stores/${storeID}/readers`;
    const unsub = firestoreSubscribeCollection(path, (docs, err) => {
      if (err) {
        _setReaderError("Could not load readers. " + (err.message || ""));
        return;
      }
      _setReaders(docs || []);
    });
    return () => unsub && unsub();
  }, [showReaderUI, tenantID, storeID]);

  // Poll Stripe every 45s to refresh reader online/offline status while the
  // Terminal UI is open. The readers subcollection listener above only fires
  // when Stripe pushes via webhook; status flips don't always webhook, so we
  // pull to keep the UI honest. Silent flag prevents the busy-spinner flicker.
  useEffect(() => {
    if (!showReaderUI || !terminalLocationID || !connectAccountID) return;
    let id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      handleRefreshReaders({ silent: true });
    }, 45000);
    return () => clearInterval(id);
  }, [showReaderUI, terminalLocationID, connectAccountID, tenantID, storeID]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill location form from storeInfo when no location exists yet.
  useEffect(() => {
    if (!showReaderUI || !sConfigLoaded || terminalLocationID) return;
    if (!sLocDisplayName) _setLocDisplayName(storeInfo.storeName || "");
    if (!sLocLine1) _setLocLine1(storeInfo.street || "");
    if (!sLocLine2) _setLocLine2(storeInfo.unit || "");
    if (!sLocCity) _setLocCity(storeInfo.city || "");
    if (!sLocState) _setLocState(storeInfo.state || "");
    if (!sLocPostal) _setLocPostal(storeInfo.zip || "");
  }, [showReaderUI, sConfigLoaded, terminalLocationID]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateLocation() {
    _setReaderError("");
    if (!sLocDisplayName.trim()) {
      _setReaderError("Display name is required.");
      return;
    }
    if (!sLocLine1.trim() || !sLocCity.trim() || !sLocPostal.trim()) {
      _setReaderError("Street, city, and postal code are required.");
      return;
    }
    if (sLocCountry === "US" && !sLocState.trim()) {
      _setReaderError("State is required for US locations.");
      return;
    }
    _setReaderBusy(true);
    try {
      const result = await stripeConnectCreateTerminalLocationCallable({
        connectAccountID,
        tenantID,
        storeID,
        displayName: sLocDisplayName.trim(),
        address: {
          line1: sLocLine1.trim(),
          line2: sLocLine2.trim() || undefined,
          city: sLocCity.trim(),
          state: sLocState.trim() || undefined,
          postal_code: sLocPostal.trim(),
          country: sLocCountry,
        },
      });
      log("Terminal location created:", result.data);
    } catch (err) {
      log("Location create failed:", err);
      _setReaderError(err.message || "Could not create Terminal location.");
    } finally {
      _setReaderBusy(false);
    }
  }

  async function handleRegisterReader() {
    _setReaderError("");
    const code = sRegCode.trim();
    if (!code) {
      _setReaderError("Registration code is required.");
      return;
    }
    _setReaderBusy(true);
    try {
      const result = await stripeConnectRegisterReaderCallable({
        connectAccountID,
        tenantID,
        storeID,
        registrationCode: code,
        label: sRegLabel.trim() || undefined,
      });
      log("Reader registered:", result.data);
      _setRegCode("");
      _setRegLabel("");
    } catch (err) {
      log("Reader register failed:", err);
      _setReaderError(err.message || "Could not register reader.");
    } finally {
      _setReaderBusy(false);
    }
  }

  async function handleRefreshReaders(opts = {}) {
    let silent = opts && opts.silent === true;
    if (!silent) {
      _setReaderError("");
      _setReaderBusy(true);
    }
    try {
      const result = await stripeConnectListReadersCallable({
        connectAccountID,
        tenantID,
        storeID,
        terminalLocationID: terminalLocationID || undefined,
      });
      log("Readers refreshed from Stripe:", result.data);
    } catch (err) {
      log("Reader refresh failed:", err);
      if (!silent) _setReaderError(err.message || "Could not refresh readers.");
    } finally {
      if (!silent) _setReaderBusy(false);
    }
  }

  async function handleEnableTtpi() {
    _setReaderError("");
    if (!terminalLocationID) {
      _setReaderError("Create a Terminal location first.");
      return;
    }
    _setReaderBusy(true);
    try {
      // Lazy-load the TTPi pairing helper so non-iOS-Safari users never pay
      // the cost of loading @stripe/terminal-js.
      const { pairTapToPayOnIphone } = await import(
        "./screen_components/modal_screens/newCheckoutModalScreen/stripeTerminalSDK"
      );
      const result = await pairTapToPayOnIphone({
        connectAccountID,
        tenantID,
        storeID,
        terminalLocationID,
      });
      log("TTPi paired:", result);
    } catch (err) {
      log("TTPi pair failed:", err);
      _setReaderError(err.message || "Could not enable Tap to Pay on iPhone.");
    } finally {
      _setReaderBusy(false);
    }
  }

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

        {showReaderUI && (
          <ReaderSections
            tenantID={tenantID}
            storeID={storeID}
            connectAccountID={connectAccountID}
            configLoaded={sConfigLoaded}
            connectConfig={sConnectConfig}
            terminalLocationID={terminalLocationID}
            readers={sReaders}
            busy={sReaderBusy}
            error={sReaderError}
            isIOSSafari={isIOSSafari}
            locCountry={sLocCountry}
            setLocCountry={_setLocCountry}
            locDisplayName={sLocDisplayName}
            setLocDisplayName={_setLocDisplayName}
            locLine1={sLocLine1}
            setLocLine1={_setLocLine1}
            locLine2={sLocLine2}
            setLocLine2={_setLocLine2}
            locCity={sLocCity}
            setLocCity={_setLocCity}
            locState={sLocState}
            setLocState={_setLocState}
            locPostal={sLocPostal}
            setLocPostal={_setLocPostal}
            regCode={sRegCode}
            setRegCode={_setRegCode}
            regLabel={sRegLabel}
            setRegLabel={_setRegLabel}
            onCreateLocation={handleCreateLocation}
            onRegisterReader={handleRegisterReader}
            onRefreshReaders={handleRefreshReaders}
            onEnableTtpi={handleEnableTtpi}
          />
        )}
      </div>
    </div>
  );
}

function ReaderSections({
  tenantID,
  storeID,
  connectAccountID,
  configLoaded,
  connectConfig,
  terminalLocationID,
  readers,
  busy,
  error,
  isIOSSafari,
  locCountry,
  setLocCountry,
  locDisplayName,
  setLocDisplayName,
  locLine1,
  setLocLine1,
  locLine2,
  setLocLine2,
  locCity,
  setLocCity,
  locState,
  setLocState,
  locPostal,
  setLocPostal,
  regCode,
  setRegCode,
  regLabel,
  setRegLabel,
  onCreateLocation,
  onRegisterReader,
  onRefreshReaders,
  onEnableTtpi,
}) {
  if (!configLoaded) {
    return (
      <div className={styles.section}>
        <LoadingIndicator />
        <p className={styles.muted}>Loading Terminal config...</p>
      </div>
    );
  }

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    border: `1px solid ${C.borderDefault}`,
    borderRadius: 6,
    outline: "none",
  };

  return (
    <>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Terminal location</h3>
        <p className={styles.sectionSubtitle}>
          A Terminal location represents the physical place where readers are
          used. Required before registering any reader.
        </p>

        {terminalLocationID ? (
          <div className={styles.locationSummary}>
            <strong>{connectConfig?.terminalLocationDisplayName || "Location"}</strong>
            {connectConfig?.terminalLocationAddress && (
              <div>
                {connectConfig.terminalLocationAddress.line1}
                {connectConfig.terminalLocationAddress.line2
                  ? `, ${connectConfig.terminalLocationAddress.line2}`
                  : ""}
                <br />
                {connectConfig.terminalLocationAddress.city}
                {connectConfig.terminalLocationAddress.state
                  ? `, ${connectConfig.terminalLocationAddress.state}`
                  : ""}{" "}
                {connectConfig.terminalLocationAddress.postal_code}
                <br />
                {connectConfig.terminalLocationAddress.country}
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
              <code>{terminalLocationID}</code>
            </div>
          </div>
        ) : (
          <>
            <label className={styles.label}>Country</label>
            <select
              className={styles.select}
              value={locCountry}
              onChange={(e) => setLocCountry(e.target.value)}
              disabled={busy}
              style={{ marginBottom: 12 }}
            >
              {TERMINAL_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>

            <label className={styles.label}>Display name</label>
            <TextInput
              value={locDisplayName}
              onChangeText={setLocDisplayName}
              placeholder="Main location"
              style={{ ...inputStyle, marginBottom: 12 }}
            />

            <label className={styles.label}>Street</label>
            <TextInput
              value={locLine1}
              onChangeText={setLocLine1}
              placeholder="123 Main St"
              style={{ ...inputStyle, marginBottom: 12 }}
            />

            <label className={styles.label}>Unit / suite (optional)</label>
            <TextInput
              value={locLine2}
              onChangeText={setLocLine2}
              placeholder="Suite 100"
              style={{ ...inputStyle, marginBottom: 12 }}
            />

            <div className={styles.fieldGrid}>
              <div>
                <label className={styles.label}>City</label>
                <TextInput
                  value={locCity}
                  onChangeText={setLocCity}
                  placeholder="City"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={styles.label}>
                  {locCountry === "US" ? "State" : "Region"}
                </label>
                <TextInput
                  value={locState}
                  onChangeText={setLocState}
                  placeholder={locCountry === "US" ? "CA" : "Region (optional)"}
                  style={inputStyle}
                />
              </div>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Postal code</label>
                <TextInput
                  value={locPostal}
                  onChangeText={setLocPostal}
                  placeholder="94110"
                  style={inputStyle}
                />
              </div>
            </div>

            <Button
              text={busy ? "Creating..." : "Create Terminal location"}
              onPress={onCreateLocation}
              enabled={!busy}
              colorGradientArr={COLOR_GRADIENTS.green}
              fullWidth
              buttonStyle={{ height: 40 }}
              textStyle={{ color: "white", fontWeight: 600 }}
            />
          </>
        )}
      </div>

      {terminalLocationID && (
        <div className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <h3 className={styles.sectionTitle}>Readers</h3>
            <button
              className={styles.refreshButton}
              onClick={onRefreshReaders}
              disabled={busy}
              type="button"
            >
              {busy ? "..." : "Refresh from Stripe"}
            </button>
          </div>

          {Array.isArray(readers) && readers.length > 0 ? (
            <div className={styles.readerList}>
              {readers.map((r) => {
                const isTtpi = r.deviceType === "apple_built_in";
                const typeLabel = isTtpi ? "Tap to Pay on iPhone" : r.deviceType || "reader";
                return (
                  <div key={r.id} className={styles.readerRow}>
                    <span
                      className={`${styles.readerStatusDot} ${
                        r.status === "online"
                          ? styles.readerStatusOnline
                          : styles.readerStatusOffline
                      }`}
                    />
                    <div className={styles.readerInfo}>
                      <span className={styles.readerLabel}>
                        {r.label || typeLabel || r.stripeReaderID}
                      </span>
                      <span className={styles.readerMeta}>
                        {typeLabel} · {r.serialNumber || r.stripeReaderID}
                      </span>
                    </div>
                    <span className={styles.readerBadge}>
                      {r.status || "unknown"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              No readers registered yet. Register one below.
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <h4 className={styles.label} style={{ marginBottom: 8, fontSize: 14 }}>
              Register a physical reader
            </h4>
            <p className={styles.sectionSubtitle} style={{ marginBottom: 10 }}>
              On the reader: Settings → Generate pairing code. Enter the 3-word
              code below.
            </p>

            <label className={styles.label}>Pairing code</label>
            <TextInput
              value={regCode}
              onChangeText={setRegCode}
              placeholder="quick-brown-fox"
              style={{ ...inputStyle, fontFamily: "monospace", marginBottom: 10 }}
            />

            <label className={styles.label}>Label (optional)</label>
            <TextInput
              value={regLabel}
              onChangeText={setRegLabel}
              placeholder="Front counter"
              style={{ ...inputStyle, marginBottom: 12 }}
            />

            <Button
              text={busy ? "Registering..." : "Register reader"}
              onPress={onRegisterReader}
              enabled={!busy}
              colorGradientArr={COLOR_GRADIENTS.green}
              fullWidth
              buttonStyle={{ height: 40 }}
              textStyle={{ color: "white", fontWeight: 600 }}
            />
          </div>
        </div>
      )}

      {terminalLocationID && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Tap to Pay on iPhone</h3>
          <p className={styles.sectionSubtitle}>
            Turn an iPhone (XS or later, iOS 16.7+) into a contactless reader.
            No hardware required.
          </p>

          {isIOSSafari ? (
            <>
              <div className={styles.ttpiBanner}>
                <div className={styles.ttpiBannerText}>
                  <strong>This device looks compatible.</strong>
                  Tap below to pair your iPhone as a reader. You'll be prompted
                  to accept Apple's Tap to Pay terms on first use.
                </div>
              </div>
              <Button
                text={busy ? "Pairing..." : "Enable Tap to Pay on this iPhone"}
                onPress={onEnableTtpi}
                enabled={!busy}
                colorGradientArr={COLOR_GRADIENTS.green}
                fullWidth
                buttonStyle={{ height: 44 }}
                textStyle={{ color: "white", fontWeight: 600 }}
              />
            </>
          ) : (
            <div className={styles.ttpiUnavailable}>
              Tap to Pay on iPhone requires iOS Safari on an eligible iPhone.
              Open this page in Safari on the iPhone you want to use as a
              reader, then return here to pair it.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className={styles.section}>
          <p className={styles.error}>{error}</p>
        </div>
      )}
    </>
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
