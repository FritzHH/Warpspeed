/* eslint-disable */
import React, { useState, useEffect } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { BaseScreen } from "./screens/BaseScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ProtectedRoute } from "./components";
import { MobileBaseScreen } from "./screens/mobile/MobileBaseScreen";
import { MobileHomeScreen } from "./screens/mobile/MobileHomeScreen";
import { MobileWorkorderListScreen } from "./screens/mobile/MobileWorkorderListScreen";
import { MobileWorkorderDetailScreen } from "./screens/mobile/MobileWorkorderDetailScreen";
import { CustomerDisplayScreen } from "./screens/CustomerDisplayScreen";
import { TranslateScreen } from "./screens/TranslateScreen";
import { IntakeScreen } from "./screens/IntakeScreen";
import { HomeScreen } from "./screens/HomeScreen";
import {
  dbLoginUser,
  onAuthStateChange,
  dbGetSettings,
  dbGetTenantById,
} from "./db_calls_wrapper";
import { log } from "./utils";
import { useSettingsStore, useLayoutStore } from "./stores";
import { ROUTES } from "./routes";

// Re-export ROUTES for backward compatibility
export { ROUTES };

// Development auto-login credentials
const DEVELOPMENT_AUTO_LOGIN = {
  enabled: true,
  email: "fritz@bonitabikes.com",
  password: "BonitaBikes.1236",
};

/////////////////////////////////////
function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const setIsMobile = useLayoutStore((state) => state.setIsMobile);
  const isMobile = useLayoutStore((state) => state.isMobile);

  // Detect if app is running on mobile device or desktop browser
  useEffect(() => {
    const detectDevice = () => {
      // Check if running on mobile device
      const isMobileDevice =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );

      // Also check screen width as secondary indicator
      const isMobileWidth = window.innerWidth <= 768;

      // Set isMobile if either condition is true
      const mobile = isMobileDevice || isMobileWidth;
      setIsMobile(mobile);
      // useLayoutStore.setIsMobile(mobile)
      // useLayoutStore.setwindow

      log(
        `Device detected: ${mobile ? "Mobile" : "Desktop"} (${window.innerWidth
        }×${window.innerHeight})`
      );
    };

    // Initial detection
    detectDevice();

    // Re-detect on window resize
    window.addEventListener("resize", detectDevice);

    return () => {
      window.removeEventListener("resize", detectDevice);
    };
  }, [setIsMobile]);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        if (DEVELOPMENT_AUTO_LOGIN.enabled) {
          // Auto-login for development
          // console.log("Auto-logging in for development...");
          const loginResult = await dbLoginUser(
            DEVELOPMENT_AUTO_LOGIN.email,
            DEVELOPMENT_AUTO_LOGIN.password
          );

          if (loginResult.success) {
            console.log(
              "Auto-login successful, loading initial data:",
              loginResult.user.email
            );
            dbGetTenantById(loginResult.user.uid).then((res) => {
              // log("tenatn", res);
              dbGetSettings(res.tenantID, res.storeID).then((settings) => {
                // log("settings", settings);
                useSettingsStore.getState().setSettings(settings, false, false);
                // log("initial data loaded, heading to Main");
                setUser(loginResult.user);
                setIsLoading(false);
              });
            });
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
        setIsLoading(false);
        // Fall back to normal auth flow on error
        const unsubscribe = onAuthStateChange((user) => {
          setUser(user);
          setIsLoading(false);
        });

        return () => unsubscribe();
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
        {/* Public route - Login */}
        <Route
          path={ROUTES.login}
          element={
            user ? (
              <Navigate to={ROUTES.dashboard} replace />
            ) : (
              <LoginScreen onLoginSuccess={handleLoginSuccess} />
            )
          }
        />

        {/* Protected route - Dashboard/Base Screen (desktop) or Mobile UI */}
        <Route
          path={ROUTES.dashboard}
          element={
            <ProtectedRoute user={user}>
              {isMobile ? <MobileBaseScreen /> : <BaseScreen />}
            </ProtectedRoute>
          }
        >
          {isMobile && (
            <>
              <Route index element={<MobileHomeScreen />} />
              <Route path="workorders" element={<MobileWorkorderListScreen />} />
              <Route path="workorder/:id" element={<MobileWorkorderDetailScreen />} />
            </>
          )}
        </Route>

        {/* Public route - Home (links to all routes) */}
        <Route path={ROUTES.home} element={<HomeScreen />} />

        {/* Public route - Customer Display */}
        <Route path={ROUTES.display} element={<CustomerDisplayScreen />} />

        {/* Public route - Translation Display */}
        <Route path={ROUTES.translate} element={<TranslateScreen />} />

        {/* Protected route - Intake Screen */}
        <Route
          path={ROUTES.intake}
          element={
            <ProtectedRoute user={user}>
              <IntakeScreen />
            </ProtectedRoute>
          }
        />

        {/* Catch-all redirect to dashboard for authenticated users, login for unauthenticated */}
        <Route
          path="*"
          element={
            <Navigate to={user ? ROUTES.dashboard : ROUTES.login} replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
