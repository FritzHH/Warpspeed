import React, { useEffect, useRef, useState } from "react";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  onAuthStateChanged,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";
import { TenantSetupMultiShopForm } from "./TenantSetupMultiShopForm";
import { TenantSetupSingleShopForm } from "./TenantSetupSingleShopForm";
import { TenantSetupStoreDetailsForm } from "./TenantSetupStoreDetailsForm";
import { TenantSetupPaymentForm } from "./TenantSetupPaymentForm";
import { TenantSetupPhoneForm } from "./TenantSetupPhoneForm";
import { TenantSetupA2pForm } from "./TenantSetupA2pForm";
import { TenantSetupReviewForm } from "./TenantSetupReviewForm";

// Stages of the landing page state machine. We sit on LOADING while we figure
// out which path applies (already signed in vs. email-link vs. neither), then
// move to one of the terminal stages.
const STAGE = {
  LOADING: "loading",
  PROMPT_EMAIL: "prompt_email",
  SIGNING_IN: "signing_in",
  FETCHING_DOC: "fetching_doc",
  READY: "ready",
  ERROR: "error",
  RESUME: "resume",
};

const EMAIL_LOCALSTORAGE_KEY = "cadence.tenantSetup.emailForSignIn";

const getSetupCallable = httpsCallable(
  functions,
  "getTenantAccountSetupCallable"
);
const updateSetupCallable = httpsCallable(
  functions,
  "updateTenantAccountSetupCallable"
);
const finalizeCallable = httpsCallable(
  functions,
  "tenantSetupFinalizeCallable"
);
const resendCallable = httpsCallable(
  functions,
  "requestTenantSetupResendCallable"
);

export function TenantSetupLandingScreen() {
  const [stage, setStage] = useState(STAGE.LOADING);
  const [email, setEmail] = useState("");
  const [setupDoc, setSetupDoc] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [typeSaving, setTypeSaving] = useState(false);
  const [resumeEmail, setResumeEmail] = useState("");
  const [resumeSubmitting, setResumeSubmitting] = useState(false);
  const [resumeSent, setResumeSent] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const ranRef = useRef(false);
  const linkConsumedRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      // Prefer the existing session. The common case where a prospect
      // closes the tab and re-clicks the email link has a still-valid
      // Firebase session that already owns the setup doc — retrying the
      // now-spent oobCode would just dump them on the resume screen for
      // no reason. If the signed-in identity ISN'T authorized for the doc
      // (stale platform-admin session in the same browser, prior test
      // signup, etc.), loadSetupDoc's catch falls back to the email-link
      // path with the right identity.
      if (user) {
        setEmail(user.email || "");
        await loadSetupDoc();
        return;
      }

      // No session: consume the email-link if one is in the URL.
      // linkConsumedRef guards against re-attempting the now-spent oobCode
      // on the next auth-state fire triggered by completeSignIn itself.
      if (
        !linkConsumedRef.current &&
        isSignInWithEmailLink(auth, window.location.href)
      ) {
        linkConsumedRef.current = true;
        const stored = window.localStorage.getItem(EMAIL_LOCALSTORAGE_KEY);
        if (stored) {
          await completeSignIn(stored);
        } else {
          setStage(STAGE.PROMPT_EMAIL);
        }
        return;
      }

      // No session, no link — drop onto the resume screen with the email
      // pre-filled from localStorage when we have one.
      const stored = window.localStorage.getItem(EMAIL_LOCALSTORAGE_KEY);
      if (stored) setResumeEmail(stored);
      setStage(STAGE.RESUME);
    });

    return unsub;
  }, []);

  async function completeSignIn(emailToUse) {
    setStage(STAGE.SIGNING_IN);
    setErrorMsg("");
    try {
      await signInWithEmailLink(auth, emailToUse, window.location.href);
      window.localStorage.removeItem(EMAIL_LOCALSTORAGE_KEY);
      // onAuthStateChanged above fires next, which calls loadSetupDoc.
    } catch (err) {
      // Email-link failures (spent oobCode, expired, malformed) shouldn't
      // dump raw "auth/invalid-action-code" copy on the prospect. Route to
      // the resume screen with the email pre-filled so they can request a
      // fresh link in one click.
      setResumeEmail(emailToUse || "");
      setResumeSent(false);
      setResumeError("");
      setStage(STAGE.RESUME);
    }
  }

  async function handleResumeSubmit(e) {
    e.preventDefault();
    const trimmed = (resumeEmail || "").trim().toLowerCase();
    if (!trimmed || resumeSubmitting) return;
    setResumeSubmitting(true);
    setResumeError("");
    try {
      await resendCallable({ email: trimmed });
      window.localStorage.setItem(EMAIL_LOCALSTORAGE_KEY, trimmed);
      setResumeSent(true);
    } catch (err) {
      const code = err?.code || "";
      // Throttle from the callable comes back as resource-exhausted; surface
      // a friendly wording without leaking the underlying rate-limit detail.
      if (code === "functions/resource-exhausted") {
        setResumeError(
          "Please wait a moment before requesting another link."
        );
      } else {
        setResumeError("Something went wrong. Please try again.");
      }
    } finally {
      setResumeSubmitting(false);
    }
  }

  async function loadSetupDoc() {
    setStage(STAGE.FETCHING_DOC);
    setErrorMsg("");
    try {
      const res = await getSetupCallable({});
      setSetupDoc(res.data);
      setStage(STAGE.READY);
    } catch (err) {
      const code = err?.code || "";
      // Stale-session collision: signed in as someone who doesn't own the
      // setup doc keyed to the link recipient. If the URL still carries an
      // email-link, sign out and let onAuthStateChanged refire with
      // user=null, which then takes the link branch with the right
      // identity. Covers platform-admin testing in the same browser.
      if (
        code === "functions/permission-denied" &&
        !linkConsumedRef.current &&
        isSignInWithEmailLink(auth, window.location.href)
      ) {
        try {
          await auth.signOut();
          return;
        } catch {
          // Fall through to ERROR if sign-out itself fails.
        }
      }
      const msg = err?.message || "Failed to load your signup.";
      setErrorMsg(code ? `${code}: ${msg}` : msg);
      setStage(STAGE.ERROR);
    }
  }

  function handleEmailSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    window.localStorage.setItem(EMAIL_LOCALSTORAGE_KEY, trimmed);
    void completeSignIn(trimmed);
  }

  // Pick single vs multi shop. Persists immediately so a refresh/return resumes
  // into the right form. Optimistic local update, server is best-effort.
  async function handleChooseType(signupType) {
    if (typeSaving) return;
    setTypeSaving(true);
    setErrorMsg("");
    const previous = setupDoc;
    setSetupDoc({ ...(setupDoc || {}), signupType });
    try {
      const res = await updateSetupCallable({ signupType });
      setSetupDoc((prev) => ({ ...(prev || {}), ...res.data }));
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to save your choice.";
      setErrorMsg(code ? `${code}: ${msg}` : msg);
      setSetupDoc(previous);
    } finally {
      setTypeSaving(false);
    }
  }

  // Persist formData merges from child forms. Children call this with a
  // partial { fieldName: value } object; server shallow-merges into the
  // existing formData.
  async function handleSaveFormData(partial) {
    const res = await updateSetupCallable({ formData: partial });
    setSetupDoc((prev) => ({ ...(prev || {}), ...res.data }));
    return res.data;
  }

  // Persist the prospect's billingTier pick from the Payment step radio.
  // Top-level field (not formData) — matches server-side schema.
  async function handleChooseBillingTier(billingTier) {
    const res = await updateSetupCallable({ billingTier });
    setSetupDoc((prev) => ({
      ...(prev || {}),
      billingTier: res.data.billingTier,
    }));
    return res.data;
  }

  // Finalize signup: promote setup doc into a real tenant + store, set
  // owner claims, adopt the Twilio subaccount + purchased number, persist
  // a2p info, best-effort create a Stripe Connect account, then delete the
  // setup doc. After success, force a token refresh so the client picks up
  // the new claims, then return the result to the caller.
  async function handleFinalize() {
    const res = await finalizeCallable({});
    if (auth.currentUser) {
      try {
        await auth.currentUser.getIdToken(true);
      } catch {
        // Non-fatal — the next sign-in will pick up claims either way.
      }
    }
    return res.data;
  }

  if (stage === STAGE.LOADING || stage === STAGE.SIGNING_IN || stage === STAGE.FETCHING_DOC) {
    const label =
      stage === STAGE.SIGNING_IN
        ? "Signing you in…"
        : stage === STAGE.FETCHING_DOC
          ? "Loading your signup…"
          : "Loading…";
    return (
      <div className="centerScreen">
        <div className="card">
          <h1 className="cardTitle">Cadence POS</h1>
          <p className="cardSubtitle">{label}</p>
        </div>
      </div>
    );
  }

  if (stage === STAGE.PROMPT_EMAIL) {
    return (
      <div className="centerScreen">
        <form className="card" onSubmit={handleEmailSubmit}>
          <h1 className="cardTitle">Confirm your email</h1>
          <p className="cardSubtitle">
            For security, please re-enter the email you used to request access.
          </p>
          <label className="fieldLabel">Email</label>
          <input
            type="email"
            className="textInput"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            autoComplete="email"
          />
          {errorMsg && <div className="errorText">{errorMsg}</div>}
          <button type="submit" className="primaryButton">
            Continue
          </button>
        </form>
      </div>
    );
  }

  if (stage === STAGE.RESUME) {
    if (resumeSent) {
      return (
        <div className="centerScreen">
          <div className="card">
            <h1 className="cardTitle">Check your email</h1>
            <p className="cardSubtitle">
              If you have a signup in progress, we just sent a fresh link to{" "}
              <strong>{resumeEmail}</strong>. Click it to continue where you
              left off.
            </p>
            <p className="helperText">
              The link can take a minute to arrive. Check your spam folder if
              you don't see it.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="centerScreen">
        <form className="card" onSubmit={handleResumeSubmit}>
          <h1 className="cardTitle">Continue your setup</h1>
          <p className="cardSubtitle">
            Enter the email you started with and we'll send you a fresh link
            to pick up where you left off.
          </p>
          <label className="fieldLabel">Email</label>
          <input
            type="email"
            className="textInput"
            value={resumeEmail}
            onChange={(e) => setResumeEmail(e.target.value)}
            autoFocus
            autoComplete="email"
            disabled={resumeSubmitting}
          />
          {resumeError && <div className="errorText">{resumeError}</div>}
          <button
            type="submit"
            className="primaryButton"
            disabled={resumeSubmitting || !resumeEmail.trim()}
          >
            {resumeSubmitting ? "Sending…" : "Send fresh link"}
          </button>
        </form>
      </div>
    );
  }

  if (stage === STAGE.ERROR) {
    return (
      <div className="centerScreen">
        <div className="card">
          <h1 className="cardTitle">Something went wrong</h1>
          <p className="cardSubtitle">
            We couldn't load your signup. Please try again in a moment.
          </p>
          <p className="helperText">
            If this keeps happening, email{" "}
            <a href="mailto:support@retailsoftsystems.com">
              support@retailsoftsystems.com
            </a>{" "}
            and we'll help you out.
          </p>
        </div>
      </div>
    );
  }

  // STAGE.READY — branch on signupType and currentStep. If type is unset,
  // show the chooser; once chosen, render the tenant form by default and
  // advance to the shared store-details form when the user clicks Continue
  // (which writes formData.currentStep = "store-details").
  const signupType = setupDoc?.signupType;
  const formData = setupDoc?.formData || {};
  const currentStep = formData.currentStep;
  const resolvedEmail = setupDoc?.email || email;

  if (signupType === "single" || signupType === "multi") {
    if (currentStep === "review") {
      return (
        <TenantSetupReviewForm
          email={resolvedEmail}
          formData={formData}
          onSaveFormData={handleSaveFormData}
          onFinalize={handleFinalize}
        />
      );
    }

    if (currentStep === "a2p" || currentStep === "done") {
      return (
        <TenantSetupA2pForm
          email={resolvedEmail}
          formData={formData}
          onSaveFormData={handleSaveFormData}
          onFinalize={handleFinalize}
        />
      );
    }

    if (currentStep === "phone") {
      return (
        <TenantSetupPhoneForm
          email={resolvedEmail}
          formData={formData}
          billingTier={setupDoc?.billingTier}
          purchasedPhoneNumber={setupDoc?.purchasedPhoneNumber}
          poolNumberInfo={setupDoc?.poolNumberInfo}
          onSaveFormData={handleSaveFormData}
          onPhoneNumberChanged={loadSetupDoc}
        />
      );
    }

    if (currentStep === "payment" || currentStep === "payment-phone") {
      return (
        <TenantSetupPaymentForm
          email={resolvedEmail}
          formData={formData}
          billingTier={setupDoc?.billingTier}
          paymentMethodCollected={setupDoc?.paymentMethodCollected}
          onSaveFormData={handleSaveFormData}
          onChooseBillingTier={handleChooseBillingTier}
          onPaymentMethodSaved={loadSetupDoc}
        />
      );
    }

    if (currentStep === "store-details") {
      return (
        <TenantSetupStoreDetailsForm
          email={resolvedEmail}
          formData={formData}
          onSaveFormData={handleSaveFormData}
        />
      );
    }

    if (signupType === "multi") {
      return (
        <TenantSetupMultiShopForm
          email={resolvedEmail}
          formData={formData}
          onSaveFormData={handleSaveFormData}
          onSwitchType={() => handleChooseType("single")}
        />
      );
    }

    return (
      <TenantSetupSingleShopForm
        email={resolvedEmail}
        formData={formData}
        onSaveFormData={handleSaveFormData}
        onSwitchType={() => handleChooseType("multi")}
      />
    );
  }

  // No choice yet — render the chooser.
  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <h1 className="cardTitle">Welcome to Cadence POS</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{setupDoc?.email || email}</strong>. Let's get
          you set up — first, tell us how your business is structured.
        </p>

        <div className="choiceGrid">
          <button
            type="button"
            className="choiceCard"
            disabled={typeSaving}
            onClick={() => handleChooseType("single")}
          >
            <div className="choiceCardTitle">Single Shop</div>
            <div className="choiceCardBody">
              Pick this if you operate one location today. You'll fill out a
              single short form covering your business and your store in one
              go — no duplicated questions, nothing to repeat.
            </div>
          </button>

          <button
            type="button"
            className="choiceCard"
            disabled={typeSaving}
            onClick={() => handleChooseType("multi")}
          >
            <div className="choiceCardTitle">Multi Shop</div>
            <div className="choiceCardBody">
              Pick this if you operate two or more locations under one
              business. You'll set up your business first, then add each store
              separately so each has its own address, inventory, staff, and
              store-level settings. Best for franchises, small chains, or any
              owner managing multiple retail locations.
            </div>
          </button>
        </div>

        <p className="helperText choiceFooterNote">
          <strong>Not sure?</strong> Pick <strong>Single Shop</strong>. This
          choice is not binding — if you ever open a second location, adding
          it later is a quick few-click process and nothing about your current
          setup changes.
        </p>

        {errorMsg && <div className="errorText">{errorMsg}</div>}
      </div>
    </div>
  );
}
