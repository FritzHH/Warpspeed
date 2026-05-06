/* eslint-disable */
import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, Alert } from "react-native-web";
import { C, Colors, Fonts } from "../styles";
import { sendPasswordReset, dbLoginUser, dbLogout, loadTenantAndSettings } from "../db_calls_wrapper";
import { gray } from "../utils";
import { topUpPool } from "../idPool";

const logo = require("../resources/default_app_logo_large.png");

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
      Alert.alert(
        "Password Reset",
        "A password reset email has been sent to your email address.",
        [{ text: "OK" }]
      );
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

  let emailBorder = emailFocused ? BRAND_BLUE : gray(0.78);
  let passwordBorder = passwordFocused ? BRAND_BLUE : gray(0.78);

  return (
    <View style={{
      width: "100%",
      height: "100vh",
      backgroundColor: BRAND_BLUE,
      justifyContent: "center",
      alignItems: "center",
    }}>
      {/* Card */}
      <View style={{
        width: "90%",
        maxWidth: 380,
        backgroundColor: "#fff",
        borderRadius: 16,
        alignItems: "center",
        paddingTop: 40,
        paddingBottom: 30,
        paddingHorizontal: 30,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 12,
      }}>

        {/* Logo */}
        <Image
          source={logo}
          style={{ width: 160, height: 160, marginBottom: 10 }}
          resizeMode="contain"
        />

        {/* Yellow accent divider */}
        <View style={{
          width: "60%",
          height: 3,
          backgroundColor: BRAND_YELLOW,
          borderRadius: 2,
          marginBottom: 28,
        }} />

        <form
          onSubmit={(e) => { e.preventDefault(); handleSignIn(); }}
          style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
        >
        {/* Email */}
        <View style={{ width: "100%", marginBottom: 14 }}>
          <Text style={{
            fontSize: 12,
            color: BRAND_DARK_BLUE,
            fontWeight: Fonts.weight.textHeavy,
            marginBottom: 4,
            marginLeft: 2,
          }}>EMAIL</Text>
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
            style={{
              width: "100%",
              border: `2px solid ${emailBorder}`,
              borderRadius: 10,
              padding: "11px 14px",
              fontSize: 15,
              backgroundColor: "#FAFBFC",
              outline: "none",
              color: "#333",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </View>

        {/* Password */}
        <View style={{ width: "100%", marginBottom: 6 }}>
          <Text style={{
            fontSize: 12,
            color: BRAND_DARK_BLUE,
            fontWeight: Fonts.weight.textHeavy,
            marginBottom: 4,
            marginLeft: 2,
          }}>PASSWORD</Text>
          <View style={{ width: "100%", flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: passwordBorder, borderRadius: 10, backgroundColor: "#FAFBFC" }}>
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
              style={{
                flex: 1,
                padding: "11px 14px",
                fontSize: 15,
                outline: "none",
                color: "#333",
                backgroundColor: "transparent",
                border: "none",
                fontFamily: "inherit",
              }}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 16, color: gray(0.45), userSelect: "none" }}>{showPassword ? "\u{1F441}" : "\u{1F441}\u{200D}\u{1F5E8}"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Error message */}
        {error ? (
          <View style={{
            width: "100%",
            backgroundColor: "#FEF2F2",
            borderWidth: 1,
            borderColor: "#FECACA",
            borderRadius: 8,
            paddingVertical: 10,
            paddingHorizontal: 12,
            marginTop: 10,
            marginBottom: 4,
          }}>
            <Text style={{
              color: "#B91C1C",
              fontSize: 13,
              fontWeight: "500",
            }}>{error}</Text>
          </View>
        ) : (
          <View style={{ height: 16 }} />
        )}

        {/* Sign In button */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: "100%",
            backgroundColor: isLoading ? gray(0.6) : BRAND_BLUE,
            borderRadius: 10,
            paddingTop: 13,
            paddingBottom: 13,
            border: "none",
            cursor: isLoading ? "default" : "pointer",
            marginTop: 6,
            boxShadow: `0px 3px 6px rgba(43, 124, 181, 0.3)`,
          }}
        >
          <Text style={{
            color: "#fff",
            fontSize: 16,
            fontWeight: "700",
            letterSpacing: 0.5,
            textAlign: "center",
          }}>
            {isLoading ? "Signing In..." : "Sign In"}
          </Text>
        </button>
        </form>

        {/* Forgot password */}
        <TouchableOpacity
          style={{ marginTop: 16, paddingVertical: 4 }}
          onPress={handleForgotPassword}
        >
          <Text style={{
            color: BRAND_DARK_BLUE,
            fontSize: 13,
            fontWeight: "500",
          }}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom branding */}
      <Text style={{
        color: "rgba(255,255,255,0.5)",
        fontSize: 11,
        marginTop: 24,
        fontWeight: "500",
      }}>
        Warpspeed POS
      </Text>
    </View>
  );
}
