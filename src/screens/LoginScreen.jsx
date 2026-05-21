/* eslint-disable */
import React, { useState } from "react";
import { sendPasswordReset, dbLoginUser, dbLogout, loadTenantAndSettings } from "../db_calls_wrapper";

import { topUpPool } from "../idPool";
import { useAlertScreenStore } from "../stores";
import { C, Fonts } from "../styles";
import logo from "../resources/default_app_logo_large.png";
import styles from "./LoginScreen.module.css";

// ── Brand colors pulled from the logo ──
const BRAND_BLUE = "#2B7CB5";
const BRAND_YELLOW = "#D4B830";
const BRAND_DARK_BLUE = "#1A5A8A";

export function LoginScreen({ setUser }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await dbLoginUser(email, password);
      if (!result.success) {
        setError(result.error ? getErrorMessage(result.error) : "Login failed. Please try again.");
        return;
      }
      await loadTenantAndSettings(result.tenantID, result.storeID, result.settings);
      topUpPool();
      setUser({
        uid: result.user.uid,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        displayName: result.user.displayName,
      });
    } catch (error) {
      setError(getErrorMessage(error.message || error.code));
      await dbLogout();
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address");
      return;
    }

    try {
      await sendPasswordReset(email);
      useAlertScreenStore.getState().setValues({
        title: "Password Reset",
        message: "A password reset email has been sent to your email address.",
        btn1Text: "OK",
        handleBtn1Press: () => {},
        showAlert: true,
      });
    } catch (error) {
      setError(getErrorMessage(error.code));
    }
  };

  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "Invalid email or password";
      case "auth/invalid-email":
        return "Invalid email address";
      case "auth/user-disabled":
        return "This account has been disabled";
      case "auth/too-many-requests":
        return "Too many failed attempts. Please try again later";
      case "❌ User is not associated with any tenant.":
        return "User account is not properly configured";
      case "❌ User is not associated with any store.":
        return "User account is not associated with any store";
      case "❌ User not found in system.":
        return "User account not found in system";
      default:
        return errorCode || "An error occurred. Please try again";
    }
  };

  const emailBorder = emailFocused ? BRAND_BLUE : C.borderStrong;
  const passwordBorder = passwordFocused ? BRAND_BLUE : C.borderStrong;

  return (
    <div className={styles.screen} style={{ backgroundColor: BRAND_BLUE }}>
      {/* Card */}
      <div className={styles.card}>
        {/* Logo */}
        <img src={logo} alt="" className={styles.logo} />

        {/* Yellow accent divider */}
        <div className={styles.divider} style={{ backgroundColor: BRAND_YELLOW }} />

        <form
          onSubmit={(e) => { e.preventDefault(); handleSignIn(); }}
          className={styles.form}
        >
          {/* Email */}
          <div className={styles.fieldGroup}>
            <span
              className={styles.fieldLabel}
              style={{ color: BRAND_DARK_BLUE, fontWeight: Fonts.weight.textHeavy }}
            >
              EMAIL
            </span>
            <input
              type="email"
              name="email"
              id="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              className={styles.textInput}
              style={{ border: `2px solid ${emailBorder}` }}
            />
          </div>

          {/* Password */}
          <div className={styles.fieldGroupTight}>
            <span
              className={styles.fieldLabel}
              style={{ color: BRAND_DARK_BLUE, fontWeight: Fonts.weight.textHeavy }}
            >
              PASSWORD
            </span>
            <div className={styles.passwordRow} style={{ borderColor: passwordBorder }}>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                id="password"
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                className={styles.passwordInput}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={styles.eyeButton}
              >
                <span className={styles.eyeIcon} style={{ color: C.textMuted }}>
                  {showPassword ? "\u{1F441}" : "\u{1F441}\u{200D}\u{1F5E8}"}
                </span>
              </button>
            </div>
          </div>

          {/* Error message */}
          {error ? (
            <div className={styles.errorBox}>
              <span className={styles.errorText}>{error}</span>
            </div>
          ) : (
            <div className={styles.errorSpacer} />
          )}

          {/* Sign In button */}
          <button
            type="submit"
            disabled={isLoading}
            className={styles.signInButton}
            style={{ backgroundColor: isLoading ? C.borderStrong : BRAND_BLUE, cursor: isLoading ? "default" : "pointer" }}
          >
            <span className={styles.signInLabel}>
              {isLoading ? "Signing In..." : "Sign In"}
            </span>
          </button>
        </form>

        {/* Forgot password */}
        <button
          type="button"
          className={styles.forgotButton}
          onClick={handleForgotPassword}
        >
          <span className={styles.forgotLabel} style={{ color: BRAND_DARK_BLUE }}>
            Forgot Password?
          </span>
        </button>
      </div>

      {/* Bottom branding */}
      <span className={styles.brandingText}>
        Warpspeed POS
      </span>
    </div>
  );
}
