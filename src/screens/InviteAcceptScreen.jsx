/* eslint-disable */
// Public landing page for Firebase email-link sign-in from invites.
//
// Two URL shapes handled here, both produced by SaaS callables in
// functions/saas/auth-claims.js:
//
//   ?token=<inviteToken>    Invited user. After email-link sign-in we call
//                           redeemInviteCallable to stamp the tenant claims.
//   ?bootstrap=1            Platform-admin-created tenant owner. Claims are
//                           already stamped server-side; after email-link
//                           sign-in we show the owner a single form to fill
//                           in store info + choose a 4-digit in-app PIN,
//                           then call ownerCompleteBootstrapCallable to
//                           finish setup.
//
// On either path, after sign-in we force a fresh ID token so the new custom
// claims are visible immediately (Firebase otherwise caches the token for up
// to 1 hour before picking them up).
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { AUTH, FUNCTIONS } from "../db_calls";
import { ROUTES } from "../routes";
import { C } from "../styles";
import logo from "../resources/default_app_logo_large.png";
import styles from "./InviteAcceptScreen.module.css";

const EMAIL_LOCALSTORAGE_KEY = "warpspeedInviteEmail";

const STAGE = {
  CHECKING_LINK: "checking-link",
  PROMPT_EMAIL: "prompt-email",
  SIGNING_IN: "signing-in",
  REDEEMING: "redeeming",
  BOOTSTRAP_FORM: "bootstrap-form",
  SUBMITTING_BOOTSTRAP: "submitting-bootstrap",
  SUCCESS: "success",
  ERROR: "error",
  REQUESTING_RESEND: "requesting-resend",
  RESEND_SENT: "resend-sent",
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
];

function formatPhoneForDisplay(s) {
  const digits = (s || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+${digits}`;
}

function getInviteToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

function isBootstrap() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bootstrap") === "1";
}

async function completeSignIn(email) {
  await signInWithEmailLink(AUTH, email, window.location.href);
  window.localStorage.removeItem(EMAIL_LOCALSTORAGE_KEY);
}

async function redeemInvite(token) {
  const fn = httpsCallable(FUNCTIONS, "redeemInviteCallable");
  const result = await fn({ token });
  return result.data;
}

async function completeBootstrap(payload) {
  const fn = httpsCallable(FUNCTIONS, "ownerCompleteBootstrapCallable");
  const result = await fn(payload);
  return result.data;
}

async function requestResend(email) {
  const fn = httpsCallable(FUNCTIONS, "requestOwnerWelcomeResendCallable");
  const result = await fn({ email });
  return result.data;
}

async function forceClaimRefresh() {
  if (!AUTH.currentUser) return;
  await AUTH.currentUser.getIdToken(true);
}

export function InviteAcceptScreen() {
  const navigate = useNavigate();
  const [stage, setStage] = useState(STAGE.CHECKING_LINK);
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successInfo, setSuccessInfo] = useState(null);

  // Bootstrap form state — only used when ?bootstrap=1.
  const [storeLegalName, setStoreLegalName] = useState("");
  const [storeDisplayName, setStoreDisplayName] = useState("");
  const [storeStreet, setStoreStreet] = useState("");
  const [storeUnit, setStoreUnit] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeState, setStoreState] = useState("");
  const [storeZip, setStoreZip] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeSupportEmail, setStoreSupportEmail] = useState("");
  const [storeOfficeEmail, setStoreOfficeEmail] = useState("");
  const [salesTaxPercent, setSalesTaxPercent] = useState("");
  const [userPin, setUserPin] = useState("");
  const [confirmUserPin, setConfirmUserPin] = useState("");

  // Stripe Payments Info — required by Stripe for the connected account to
  // leave Restricted status. Posted server-side via ownerCompleteBootstrapCallable
  // and pushed straight to the Stripe API.
  const [businessUrl, setBusinessUrl] = useState("");
  const [bankRouting, setBankRouting] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [ssnLast4, setSsnLast4] = useState("");

  const userPinInputRef = useRef(null);
  const confirmPinInputRef = useRef(null);

  useEffect(() => {
    if (!isSignInWithEmailLink(AUTH, window.location.href)) {
      setErrorMsg(
        "This link isn't a valid sign-in link. Please request a new invite."
      );
      setStage(STAGE.ERROR);
      return;
    }
    const stored = window.localStorage.getItem(EMAIL_LOCALSTORAGE_KEY);
    if (stored) {
      setEmail(stored);
      void run(stored);
    } else {
      setStage(STAGE.PROMPT_EMAIL);
    }
  }, []);

  async function run(emailToUse) {
    try {
      setStage(STAGE.SIGNING_IN);
      await completeSignIn(emailToUse);

      const token = getInviteToken();
      const bootstrap = isBootstrap();

      if (bootstrap) {
        await forceClaimRefresh();
        setStage(STAGE.BOOTSTRAP_FORM);
        return;
      }

      if (token) {
        setStage(STAGE.REDEEMING);
        const data = await redeemInvite(token);
        setSuccessInfo({
          tenantID: data.tenantID,
          privilege: data.privilege,
        });
      }

      await forceClaimRefresh();
      setStage(STAGE.SUCCESS);
      setTimeout(() => navigate(ROUTES.dashboard, { replace: true }), 1500);
    } catch (err) {
      const code = err && err.code;
      const msg = err && err.message;
      if (code === "auth/invalid-action-code") {
        setErrorMsg(
          "This invite link has expired or already been used. Please request a new invite."
        );
      } else if (code === "auth/invalid-email") {
        setErrorMsg("That email address doesn't match the invite.");
      } else {
        setErrorMsg(msg || "Something went wrong. Please try again.");
      }
      setStage(STAGE.ERROR);
    }
  }

  function handleSubmitEmail(e) {
    e.preventDefault();
    if (!email) return;
    window.localStorage.setItem(EMAIL_LOCALSTORAGE_KEY, email);
    void run(email);
  }

  async function handleRequestResend() {
    if (!email || stage === STAGE.REQUESTING_RESEND) return;
    setStage(STAGE.REQUESTING_RESEND);
    setErrorMsg("");
    try {
      await requestResend(email);
      setStage(STAGE.RESEND_SENT);
    } catch (err) {
      const msg = err && err.message;
      setErrorMsg(msg || "Couldn't send a new link. Please try again.");
      setStage(STAGE.ERROR);
    }
  }

  // Field-level validity for the bootstrap form. Phone is digits-only beyond
  // the (xxx) xxx-xxxx mask; we accept 10 US digits or +country format.
  const phoneDigits = storePhone.replace(/\D/g, "");
  const phoneValid =
    phoneDigits.length === 10 ||
    (phoneDigits.length === 11 && phoneDigits.startsWith("1")) ||
    (storePhone.trim().startsWith("+") && phoneDigits.length >= 8);
  const zipValid = /^\d{5}(-\d{4})?$/.test(storeZip.trim());
  const stateValid = US_STATES.includes(storeState);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const supportEmailValid = emailRegex.test(storeSupportEmail.trim());
  const officeEmailValid = emailRegex.test(storeOfficeEmail.trim());
  const taxNum = salesTaxPercent === "" ? NaN : Number(salesTaxPercent);
  const taxValid = Number.isFinite(taxNum) && taxNum >= 0 && taxNum <= 100;
  const pinValid = /^\d{4}$/.test(userPin);
  const pinsMatch = userPin === confirmUserPin;

  // Stripe Payments Info validation.
  const urlValid = /^https?:\/\/\S+\.\S+/.test(businessUrl.trim());
  const routingDigits = bankRouting.replace(/\D/g, "");
  const routingValid = routingDigits.length === 9;
  const accountDigits = bankAccount.replace(/\D/g, "");
  const accountValid = accountDigits.length >= 4 && accountDigits.length <= 17;
  const dobMonthNum = Number(dobMonth);
  const dobDayNum = Number(dobDay);
  const dobYearNum = Number(dobYear);
  const currentYear = new Date().getFullYear();
  const dobValid =
    Number.isInteger(dobMonthNum) &&
    dobMonthNum >= 1 &&
    dobMonthNum <= 12 &&
    Number.isInteger(dobDayNum) &&
    dobDayNum >= 1 &&
    dobDayNum <= 31 &&
    Number.isInteger(dobYearNum) &&
    dobYearNum >= 1900 &&
    dobYearNum <= currentYear - 13;
  const ssnValid = /^\d{4}$/.test(ssnLast4);

  const bootstrapFormValid =
    storeLegalName.trim().length > 0 &&
    storeDisplayName.trim().length > 0 &&
    storeStreet.trim().length > 0 &&
    storeCity.trim().length > 0 &&
    stateValid &&
    zipValid &&
    phoneValid &&
    supportEmailValid &&
    officeEmailValid &&
    taxValid &&
    pinValid &&
    pinsMatch &&
    urlValid &&
    routingValid &&
    accountValid &&
    dobValid &&
    ssnValid;

  async function handleSubmitBootstrap(e) {
    e.preventDefault();
    if (!bootstrapFormValid || stage === STAGE.SUBMITTING_BOOTSTRAP) return;
    setStage(STAGE.SUBMITTING_BOOTSTRAP);
    setErrorMsg("");
    try {
      await completeBootstrap({
        storeLegalName: storeLegalName.trim(),
        storeDisplayName: storeDisplayName.trim(),
        storeStreet: storeStreet.trim(),
        storeUnit: storeUnit.trim(),
        storeCity: storeCity.trim(),
        storeState: storeState.toUpperCase(),
        storeZip: storeZip.trim(),
        storePhone: storePhone.trim(),
        storeSupportEmail: storeSupportEmail.trim(),
        storeOfficeEmail: storeOfficeEmail.trim(),
        salesTaxPercent: taxNum,
        userPin,
        stripePaymentsInfo: {
          businessUrl: businessUrl.trim(),
          bankRouting: routingDigits,
          bankAccount: accountDigits,
          dob: { month: dobMonthNum, day: dobDayNum, year: dobYearNum },
          ssnLast4,
        },
      });
      await forceClaimRefresh();
      navigate(ROUTES.dashboard, { replace: true });
    } catch (err) {
      const code = err && err.code;
      const msg = err && err.message;
      setErrorMsg(msg || "Failed to complete setup. Please try again.");
      setStage(STAGE.BOOTSTRAP_FORM);
      // Don't swallow — surface code in console for debugging.
      if (code) console.error("ownerCompleteBootstrapCallable error:", code, msg);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <img src={logo} alt="Logo" className={styles.logo} />

        {stage === STAGE.CHECKING_LINK && (
          <div className={styles.statusText}>Verifying invite link…</div>
        )}

        {stage === STAGE.PROMPT_EMAIL && (
          <form onSubmit={handleSubmitEmail} className={styles.form}>
            <div className={styles.heading}>Accept your invite</div>
            <div className={styles.subheading}>
              Enter the email address this invite was sent to.
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invite-email">
                Email
              </label>
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.textInput}
                autoFocus
                required
              />
            </div>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={!email}
            >
              Continue
            </button>
          </form>
        )}

        {stage === STAGE.SIGNING_IN && (
          <div className={styles.statusText}>Signing in…</div>
        )}

        {stage === STAGE.REDEEMING && (
          <div className={styles.statusText}>Activating your account…</div>
        )}

        {(stage === STAGE.BOOTSTRAP_FORM ||
          stage === STAGE.SUBMITTING_BOOTSTRAP) && (
          <form onSubmit={handleSubmitBootstrap} className={styles.form}>
            <div className={styles.heading}>Set up your store</div>
            <div className={styles.subheading}>
              Fill in your store details and choose a 4-digit in-app PIN.
            </div>

            <div className={styles.storeInfoSection}>
              <div className={styles.storeInfoSectionHeading}>
                Store Info
              </div>
              <div className={styles.storeInfoSectionSubheading}>
                Basic info about the store and where customer receipts and
                support emails should be addressed.
              </div>

              <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Store legal name</label>
              <input
                type="text"
                className={styles.textInput}
                value={storeLegalName}
                onChange={(e) => setStoreLegalName(e.target.value)}
                maxLength={200}
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Store display name</label>
              <input
                type="text"
                className={styles.textInput}
                value={storeDisplayName}
                onChange={(e) => setStoreDisplayName(e.target.value)}
                maxLength={100}
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Street</label>
              <input
                type="text"
                className={styles.textInput}
                value={storeStreet}
                onChange={(e) => setStoreStreet(e.target.value)}
                maxLength={200}
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Unit / Suite (optional)</label>
              <input
                type="text"
                className={styles.textInput}
                value={storeUnit}
                onChange={(e) => setStoreUnit(e.target.value)}
                maxLength={50}
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>City</label>
              <input
                type="text"
                className={styles.textInput}
                value={storeCity}
                onChange={(e) => setStoreCity(e.target.value)}
                maxLength={100}
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>State</label>
              <select
                className={styles.textInput}
                value={storeState}
                onChange={(e) => setStoreState(e.target.value)}
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                required
              >
                <option value="">Select state</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>ZIP</label>
              <input
                type="text"
                className={styles.textInput}
                value={storeZip}
                onChange={(e) => setStoreZip(e.target.value)}
                maxLength={10}
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
                required
              />
              {storeZip && !zipValid && (
                <div className={styles.errorText}>
                  ZIP must be 5 digits or ZIP+4.
                </div>
              )}
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Store phone</label>
              <input
                type="tel"
                className={styles.textInput}
                value={storePhone}
                onChange={(e) =>
                  setStorePhone(formatPhoneForDisplay(e.target.value))
                }
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
                required
              />
              {storePhone && !phoneValid && (
                <div className={styles.errorText}>
                  Enter a 10-digit US number or +country format.
                </div>
              )}
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Support email</label>
              <input
                type="email"
                className={styles.textInput}
                value={storeSupportEmail}
                onChange={(e) => setStoreSupportEmail(e.target.value)}
                maxLength={200}
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
                required
              />
              {storeSupportEmail && !supportEmailValid && (
                <div className={styles.errorText}>
                  Enter a valid email address.
                </div>
              )}
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Office email</label>
              <input
                type="email"
                className={styles.textInput}
                value={storeOfficeEmail}
                onChange={(e) => setStoreOfficeEmail(e.target.value)}
                maxLength={200}
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
                required
              />
              {storeOfficeEmail && !officeEmailValid && (
                <div className={styles.errorText}>
                  Enter a valid email address.
                </div>
              )}
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Sales tax %</label>
              <input
                type="text"
                inputMode="decimal"
                className={styles.textInput}
                value={salesTaxPercent}
                onChange={(e) => setSalesTaxPercent(e.target.value)}
                placeholder="0.00"
                disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                autoComplete="off"
                required
              />
              {salesTaxPercent && !taxValid && (
                <div className={styles.errorText}>
                  Must be a number between 0 and 100.
                </div>
              )}
            </div>
            </div>

            <div className={styles.paymentsSection}>
              <div className={styles.paymentsSectionHeading}>
                Stripe Payments Info
              </div>
              <div className={styles.paymentsSectionSubheading}>
                Required so your store can accept card payments. Without these
                fields your account stays in "Restricted" status.
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Business website URL</label>
                <input
                  type="url"
                  className={styles.textInput}
                  value={businessUrl}
                  onChange={(e) => setBusinessUrl(e.target.value)}
                  placeholder="https://yourstore.com"
                  maxLength={200}
                  disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                  autoComplete="off"
                  required
                />
                {businessUrl && !urlValid && (
                  <div className={styles.errorText}>
                    Enter a full URL starting with http:// or https://
                  </div>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Bank routing number (9 digits)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.textInput}
                  value={bankRouting}
                  onChange={(e) =>
                    setBankRouting(e.target.value.replace(/\D/g, "").slice(0, 9))
                  }
                  maxLength={9}
                  disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                  autoComplete="off"
                  required
                />
                {bankRouting && !routingValid && (
                  <div className={styles.errorText}>
                    Routing number must be exactly 9 digits.
                  </div>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Bank account number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.textInput}
                  value={bankAccount}
                  onChange={(e) =>
                    setBankAccount(e.target.value.replace(/\D/g, "").slice(0, 17))
                  }
                  maxLength={17}
                  disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                  autoComplete="off"
                  required
                />
                {bankAccount && !accountValid && (
                  <div className={styles.errorText}>
                    Account number must be 4-17 digits.
                  </div>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Owner / representative date of birth
                </label>
                <div className={styles.dobRow}>
                  <div>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={styles.textInput}
                      value={dobMonth}
                      onChange={(e) =>
                        setDobMonth(e.target.value.replace(/\D/g, "").slice(0, 2))
                      }
                      maxLength={2}
                      placeholder="MM"
                      disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={styles.textInput}
                      value={dobDay}
                      onChange={(e) =>
                        setDobDay(e.target.value.replace(/\D/g, "").slice(0, 2))
                      }
                      maxLength={2}
                      placeholder="DD"
                      disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={styles.textInput}
                      value={dobYear}
                      onChange={(e) =>
                        setDobYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      maxLength={4}
                      placeholder="YYYY"
                      disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                {(dobMonth || dobDay || dobYear) && !dobValid && (
                  <div className={styles.errorText}>
                    Enter a valid date of birth (must be at least 13 years old).
                  </div>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Last 4 digits of SSN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  className={styles.textInput}
                  value={ssnLast4}
                  onChange={(e) =>
                    setSsnLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  maxLength={4}
                  disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                  autoComplete="off"
                  required
                />
                {ssnLast4 && !ssnValid && (
                  <div className={styles.errorText}>
                    Must be exactly 4 digits.
                  </div>
                )}
              </div>
            </div>

            <div className={styles.pinSection}>
              <span className={styles.pinLabel}>4-digit in-app PIN</span>
              <div
                className={styles.pinBoxes}
                onClick={() => userPinInputRef.current?.focus()}
              >
                {Array.from({ length: 4 }).map((_, i) => {
                  const isFilled = i < userPin.length;
                  const isCursor = i === userPin.length;
                  return (
                    <div
                      key={i}
                      className={styles.pinBox}
                      style={{
                        borderColor: isCursor
                          ? C.dangerStrong
                          : isFilled
                          ? C.borderFocus
                          : C.borderSubtle,
                        backgroundColor: isCursor
                          ? C.dangerStrong
                          : isFilled
                          ? C.surfaceBase
                          : C.surfaceAlt,
                        boxShadow: isCursor
                          ? `0 0 10px ${C.dangerStrong}`
                          : "none",
                      }}
                    >
                      {isFilled && (
                        <div
                          className={styles.pinDot}
                          style={{ backgroundColor: C.text }}
                        />
                      )}
                    </div>
                  );
                })}
                <input
                  ref={userPinInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={userPin}
                  onChange={(e) =>
                    setUserPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  maxLength={4}
                  disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                  className={styles.pinHiddenInput}
                />
              </div>
              {userPin && !pinValid && (
                <div className={styles.errorText}>PIN must be exactly 4 digits.</div>
              )}
            </div>

            <div className={styles.pinSection}>
              <span className={styles.pinLabel}>Confirm PIN</span>
              <div
                className={styles.pinBoxes}
                onClick={() => confirmPinInputRef.current?.focus()}
              >
                {Array.from({ length: 4 }).map((_, i) => {
                  const isFilled = i < confirmUserPin.length;
                  const isCursor = i === confirmUserPin.length;
                  return (
                    <div
                      key={i}
                      className={styles.pinBox}
                      style={{
                        borderColor: isCursor
                          ? C.dangerStrong
                          : isFilled
                          ? C.borderFocus
                          : C.borderSubtle,
                        backgroundColor: isCursor
                          ? C.dangerStrong
                          : isFilled
                          ? C.surfaceBase
                          : C.surfaceAlt,
                        boxShadow: isCursor
                          ? `0 0 10px ${C.dangerStrong}`
                          : "none",
                      }}
                    >
                      {isFilled && (
                        <div
                          className={styles.pinDot}
                          style={{ backgroundColor: C.text }}
                        />
                      )}
                    </div>
                  );
                })}
                <input
                  ref={confirmPinInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={confirmUserPin}
                  onChange={(e) =>
                    setConfirmUserPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  maxLength={4}
                  disabled={stage === STAGE.SUBMITTING_BOOTSTRAP}
                  className={styles.pinHiddenInput}
                />
              </div>
              {confirmUserPin && !pinsMatch && (
                <div className={styles.errorText}>PINs don't match.</div>
              )}
            </div>

            {errorMsg && <div className={styles.errorText}>{errorMsg}</div>}

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={
                !bootstrapFormValid || stage === STAGE.SUBMITTING_BOOTSTRAP
              }
            >
              {stage === STAGE.SUBMITTING_BOOTSTRAP
                ? "Finishing setup…"
                : "Finish setup"}
            </button>
          </form>
        )}

        {stage === STAGE.SUCCESS && (
          <div className={styles.successBlock}>
            <div className={styles.heading}>You're in!</div>
            {successInfo && (
              <div className={styles.subheading}>
                Tenant <strong>{successInfo.tenantID}</strong>
                {successInfo.privilege && (
                  <>
                    {" "}
                    · Privilege <strong>{successInfo.privilege}</strong>
                  </>
                )}
              </div>
            )}
            <div className={styles.subheading}>Redirecting…</div>
          </div>
        )}

        {stage === STAGE.ERROR && (
          <div className={styles.errorBlock}>
            <div className={styles.heading}>Invite couldn't be redeemed</div>
            <div className={styles.errorText}>{errorMsg}</div>
            {email && (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleRequestResend}
              >
                Email me a new link
              </button>
            )}
          </div>
        )}

        {stage === STAGE.REQUESTING_RESEND && (
          <div className={styles.statusText}>Sending a new link…</div>
        )}

        {stage === STAGE.RESEND_SENT && (
          <div className={styles.successBlock}>
            <div className={styles.heading}>Check your email</div>
            <div className={styles.subheading}>
              If <strong>{email}</strong> is registered, a new sign-in link is
              on its way. The link works once and expires after a short time.
            </div>
          </div>
        )}
      </div>

      {stage === STAGE.SUBMITTING_BOOTSTRAP && (
        <div className={styles.overlay}>
          <div className={styles.spinner} />
          <div className={styles.overlayText}>Finishing setup…</div>
          <div className={styles.overlaySubText}>
            Saving your store and redirecting you to sign in.
          </div>
        </div>
      )}
    </div>
  );
}
