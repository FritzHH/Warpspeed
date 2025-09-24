/* eslint-disable */
import React, { useState, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { BaseScreen } from "./screens/BaseScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { onAuthStateChange } from "./db";
import { dbAutoLoginForDevelopment } from "./db_call_wrapper";
import { log } from "./utils";

export const ROUTES = {
  init: "/",
};

// Development bypass option - set to true to skip login screen
const BYPASS_LOGIN_FOR_DEVELOPMENT = true;

/////////////////////////////////////
function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (BYPASS_LOGIN_FOR_DEVELOPMENT) {
      // Automatic login for development
      const performAutoLogin = async () => {
        try {
          const result = await dbAutoLoginForDevelopment();
          if (result.success) {
            setUser(result.user);
            log("Development auto-login successful", result.user);
          }
        } catch (error) {
          log("Development auto-login failed:", error);
          // Fallback to mock user if auto-login fails
          setUser({ uid: "dev-user", email: "dev@example.com" });
        }
        setIsLoading(false);
      };

      performAutoLogin();
      return;
    }

    // Listen for authentication state changes
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (user) => {
    setUser(user);
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#f5f5f5",
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: "18px",
            color: "#666",
          }}
        >
          Loading...
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path={ROUTES.init}
          element={
            user ? (
              <BaseScreen />
            ) : (
              <LoginScreen onLoginSuccess={handleLoginSuccess} />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
