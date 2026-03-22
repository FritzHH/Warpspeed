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
  onAuthStateChange,
  loadTenantAndSettings,
  dbLogout,
} from "./db_calls_wrapper";
import { log } from "./utils";
import { useLayoutStore } from "./stores";
import { ROUTES } from "./routes";
import { BUILD_VERSION } from "./buildVersion";

// Re-export ROUTES for backward compatibility
export { ROUTES };

// Auto-update: force reload when a newer version is deployed.
// Runs on page load, tab refocus, and every 5 minutes.
const checkForAppUpdate = async () => {
  try {
    const res = await fetch("/version.json?t=" + Date.now());
    const { version } = await res.json();
    if (version && version !== BUILD_VERSION) {
      window.location.reload();
    }
  } catch (e) {
    // Network error — skip silently
  }
};
checkForAppUpdate();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForAppUpdate();
});
setInterval(checkForAppUpdate, 5 * 60 * 1000);

/////////////////////////////////////
function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
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
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await loadTenantAndSettings(firebaseUser.uid);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            emailVerified: firebaseUser.emailVerified,
            displayName: firebaseUser.displayName,
          });
        } catch (error) {
          console.error("Failed to load tenant/settings:", error);
          setSessionError("Your session has expired. Please sign in again.");
          await dbLogout();
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
              <LoginScreen sessionError={sessionError} onClearError={() => setSessionError("")} />
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
