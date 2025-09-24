/* eslint-disable */
import React, { useState, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { BaseScreen } from "./screens/BaseScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { onAuthStateChange } from "./db";

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
      // Bypass authentication for development
      setUser({ uid: "dev-user", email: "dev@example.com" });
      setIsLoading(false);
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
