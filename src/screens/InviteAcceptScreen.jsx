/* eslint-disable */
// Public landing page for Firebase email-link sign-in from invites.
//
// Two URL shapes handled here, both produced by SaaS callables in
// functions/saas/auth-claims.js:
//
//   ?token=<inviteToken>    Invited user. After email-link sign-in we call
//                           redeemInviteCallable to stamp the tenant claims.
//   ?bootstrap=1            Platform-admin-created tenant owner. Claims are
//                           already stamped server-side; we just complete the
//                           email-link sign-in and redirect to the app.
//
// On either path, after sign-in we force a fresh ID token so the new custom
// claims are visible immediately (Firebase otherwise caches the token for up
// to 1 hour before picking them up).
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { AUTH, FUNCTIONS } from "../db_calls";
import { ROUTES } from "../routes";
import logo from "../resources/default_app_logo_large.png";
import styles from "./InviteAcceptScreen.module.css";

const EMAIL_LOCALSTORAGE_KEY = "warpspeedInviteEmail";

const STAGE = {
  CHECKING_LINK: "checking-link",
  PROMPT_EMAIL: "prompt-email",
  SIGNING_IN: "signing-in",
  REDEEMING: "redeeming",
  SUCCESS: "success",
  ERROR: "error",
};

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

  // On mount: verify URL is a Firebase email-link, then either auto-complete
  // (email in localStorage) or prompt the user for their email.
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

      if (!bootstrap && token) {
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

        {stage === STAGE.SUCCESS && (
          <div className={styles.successBlock}>
            <div className={styles.heading}>You're in!</div>
            {successInfo && (
              <div className={styles.subheading}>
                Tenant <strong>{successInfo.tenantID}</strong> ·{" "}
                Privilege <strong>{successInfo.privilege}</strong>
              </div>
            )}
            <div className={styles.subheading}>Redirecting…</div>
          </div>
        )}

        {stage === STAGE.ERROR && (
          <div className={styles.errorBlock}>
            <div className={styles.heading}>Invite couldn't be redeemed</div>
            <div className={styles.errorText}>{errorMsg}</div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate(ROUTES.login, { replace: true })}
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
