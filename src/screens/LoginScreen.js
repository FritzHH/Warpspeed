/* eslint-disable */
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Image, Alert } from "react-native-web";
import { C, Colors, Fonts } from "../styles";
import { sendPasswordReset, dbLoginUser } from "../db_calls_wrapper";
import { gray } from "../utils";

const logo = require("../resources/default_app_logo_large.png");

// ── Brand colors pulled from the logo ──
const BRAND_BLUE = "#2B7CB5";
const BRAND_YELLOW = "#D4B830";
const BRAND_DARK_BLUE = "#1A5A8A";

export function LoginScreen({ sessionError, onClearError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(sessionError || "");
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setIsLoading(true);
    setError("");
    if (onClearError) onClearError();

    try {
      const result = await dbLoginUser(email, password);
      if (!result.success) {
        setError("Login failed. Please try again.");
      }
    } catch (error) {
      setError(getErrorMessage(error.message || error.code));
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
        return "No account found with this email address";
      case "auth/wrong-password":
        return "Incorrect password";
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
      flex: 1,
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
          <TextInput
            style={{
              width: "100%",
              borderWidth: 2,
              borderColor: emailBorder,
              borderRadius: 10,
              paddingVertical: 11,
              paddingHorizontal: 14,
              fontSize: 15,
              backgroundColor: "#FAFBFC",
              outlineWidth: 0,
              outlineStyle: "none",
              color: "#333",
            }}
            placeholder="you@example.com"
            placeholderTextColor={gray(0.65)}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            nativeID="email"
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            onSubmitEditing={() => {}}
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
          <TextInput
            style={{
              width: "100%",
              borderWidth: 2,
              borderColor: passwordBorder,
              borderRadius: 10,
              paddingVertical: 11,
              paddingHorizontal: 14,
              fontSize: 15,
              backgroundColor: "#FAFBFC",
              outlineWidth: 0,
              outlineStyle: "none",
              color: "#333",
            }}
            placeholder="Enter password"
            placeholderTextColor={gray(0.65)}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            nativeID="password"
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            onSubmitEditing={handleSignIn}
          />
        </View>

        {/* Error message */}
        {error ? (
          <Text style={{
            color: "#D44",
            fontSize: 13,
            textAlign: "center",
            marginTop: 8,
            marginBottom: 4,
            fontWeight: "500",
          }}>{error}</Text>
        ) : (
          <View style={{ height: 16 }} />
        )}

        {/* Sign In button */}
        <TouchableOpacity
          style={{
            width: "100%",
            backgroundColor: isLoading ? gray(0.6) : BRAND_BLUE,
            borderRadius: 10,
            paddingVertical: 13,
            alignItems: "center",
            marginTop: 6,
            shadowColor: BRAND_BLUE,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
          }}
          onPress={handleSignIn}
          disabled={isLoading}
        >
          <Text style={{
            color: "#fff",
            fontSize: 16,
            fontWeight: "700",
            letterSpacing: 0.5,
          }}>
            {isLoading ? "Signing In..." : "Sign In"}
          </Text>
        </TouchableOpacity>
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
