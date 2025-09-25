/* eslint-disable */
import React, { useState, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { BaseScreen } from "./screens/BaseScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { onAuthStateChange } from "./db";
import { dbAutoLogin, dbGetSettings, dbGetTenantById } from "./db_calls_wrapper";
import { log } from "./utils";
import { useSettingsStore } from "./stores";

export const ROUTES = {
  init: "/",
};

// Development auto-login credentials
const DEVELOPMENT_AUTO_LOGIN = {
  enabled: true,
  email: "fritz@bonitabikes.com",
  password: "BonitaBikes.1236"
};

/////////////////////////////////////
function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        if (DEVELOPMENT_AUTO_LOGIN.enabled) {
          // Auto-login for development
          // console.log("Auto-logging in for development...");
          const loginResult = await dbAutoLogin(
            DEVELOPMENT_AUTO_LOGIN.email,
            DEVELOPMENT_AUTO_LOGIN.password
          );
          
          if (loginResult.success) {
            console.log("Auto-login successful, loading initial data:", loginResult.user.email);
            dbGetTenantById(loginResult.user.uid).then(res => {
              dbGetSettings(res.tenantID, res.storeID).then(settings => {
                useSettingsStore.getState().setSettings(settings, false, false)
                log('initial data loaded, heading to Main')
                setUser(loginResult.user);
              })
            })

          } else {
            throw new Error("Auto-login failed");
          }
        } else {
          // Listen for authentication state changes
          const unsubscribe = onAuthStateChange((user) => {
            setUser(user);
            setIsLoading(false);
          });
          
          return () => unsubscribe();
        }
      } catch (error) {
        console.error("Auto-login error:", error);
        // Fall back to normal auth flow on error
        const unsubscribe = onAuthStateChange((user) => {
          setUser(user);
          setIsLoading(false);
        });
        
        return () => unsubscribe();
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
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
