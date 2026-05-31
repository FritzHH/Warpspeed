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
  INVALID_LINK: "invalid_link",
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

export function TenantSetupLandingScreen() {
  const [stage, setStage] = useState(STAGE.LOADING);
  const [email, setEmail] = useState("");
  const [setupDoc, setSetupDoc] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [typeSaving, setTypeSaving] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      // Path A: user is already signed in (email-link consumed earlier this
      // session, or they returned mid-flow). Skip straight to loading the
      // setup doc.
      if (user) {
        setEmail(user.email || "");
        await loadSetupDoc();
        return;
      }

      // Path B: user not signed in. If the URL is a Firebase email-link, do
      // the sign-in dance.
      if (isSignInWithEmailLink(auth, window.location.href)) {
        const stored = window.localStorage.getItem(EMAIL_LOCALSTORAGE_KEY);
        if (stored) {
          await completeSignIn(stored);
        } else {
          setStage(STAGE.PROMPT_EMAIL);
        }
        return;
      }

      // Path C: not signed in, not an email-link. Random visitor hit the URL.
      setStage(STAGE.INVALID_LINK);
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
      const code = err?.code || "";
      const msg = err?.message || "Sign-in failed.";
      setErrorMsg(code ? `${code}: ${msg}` : msg);
      setStage(STAGE.ERROR);
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

  if (stage === STAGE.INVALID_LINK) {
    return (
      <div className="centerScreen">
        <div className="card">
          <h1 className="cardTitle">No active signup</h1>
          <p className="cardSubtitle">
            This page is reachable only through a Cadence POS signup link
            emailed to you. If you need one, contact support.
          </p>
        </div>
      </div>
    );
  }

  if (stage === STAGE.ERROR) {
    return (
      <div className="centerScreen">
        <div className="card">
          <h1 className="cardTitle">Something went wrong</h1>
          <p className="cardSubtitle">{errorMsg}</p>
          <p className="helperText">
            If your link is expired, contact support to send a new one.
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
    if (currentStep === "a2p" || currentStep === "done") {
      return (
        <TenantSetupA2pForm
          email={resolvedEmail}
          formData={formData}
          onSaveFormData={handleSaveFormData}
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
