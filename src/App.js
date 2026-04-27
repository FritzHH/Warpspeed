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
import { MobileItemEditScreen } from "./screens/mobile/MobileItemEditScreen";
import { MobileMessagesScreen } from "./screens/mobile/MobileMessagesScreen";
import { CustomerDisplayScreen } from "./screens/CustomerDisplayScreen";
import { TranslateScreen } from "./screens/TranslateScreen";
import { IntakeScreen } from "./screens/IntakeScreen";
import { BikeStandScreen } from "./screens/BikeStandScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { DatabaseViewerScreen } from "./screens/DatabaseViewerScreen";
import { CustomerWorkorderScreen } from "./screens/CustomerWorkorderScreen";
import {
  onAuthStateChange,
  loadTenantAndSettings,
  dbLogout,
} from "./db_calls_wrapper";
import { log, gray } from "./utils";
import { View } from "react-native-web";
import { useLayoutStore } from "./stores";
import { ROUTES } from "./routes";
import { topUpPool } from "./idPool";
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

// Redirects tablet → /stand, mobile → / (workorders), desktop → shows HomeScreen
function DeviceAwareHome({ user }) {
  const deviceType = useLayoutStore((state) => state.deviceType);
  if (deviceType === "tablet" && user) {
    return <Navigate to={ROUTES.stand} replace />;
  }
  if (deviceType === "mobile" && user) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }
  return <HomeScreen />;
}

// Desktop: wrap BikeStandScreen in a centered tablet portrait frame that fits the viewport
function BikeStandScreenWrapper() {
  const deviceType = useLayoutStore((state) => state.deviceType);

  if (deviceType === "desktop") {
    return (
      <div style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: gray(0.12),
      }}>
        <div style={{
          height: "90vh",
          aspectRatio: "3 / 4",
          borderRadius: 16,
          overflow: "hidden",
          border: "2px solid " + gray(0.25),
          backgroundColor: "white",
          display: "flex",
        }}>
          <BikeStandScreen />
        </div>
      </div>
    );
  }

  return <BikeStandScreen />;
}

/////////////////////////////////////
function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const setIsMobile = useLayoutStore((state) => state.setIsMobile);
  const setDeviceType = useLayoutStore((state) => state.setDeviceType);
  const isMobile = useLayoutStore((state) => state.isMobile);

  // Detect if app is running on mobile, tablet, or desktop
  useEffect(() => {
    const detectDevice = () => {
      const ua = navigator.userAgent;
      const w = window.innerWidth;
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

      // iPad reports as Mac in newer iOS — detect via touch + Mac UA
      const isIPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && isTouch);
      const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
      const isPhone = /iPhone|iPod|BlackBerry|IEMobile|Opera Mini|webOS/i.test(ua) ||
        (/Android/i.test(ua) && /Mobile/i.test(ua));

      let deviceType;
      if (isIPad || isAndroidTablet || (isTouch && w > 480 && w <= 1024)) {
        deviceType = "tablet";
      } else if (isPhone || w <= 480) {
        deviceType = "mobile";
      } else {
        deviceType = "desktop";
      }

      const mobile = deviceType === "mobile";
      setIsMobile(mobile);
      setDeviceType(deviceType);

      // log(
      //   `Device detected: ${deviceType} (${w}×${window.innerHeight})`
      // );
    };

    detectDevice();
    window.addEventListener("resize", detectDevice);
    return () => window.removeEventListener("resize", detectDevice);
  }, [setIsMobile, setDeviceType]);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await loadTenantAndSettings(firebaseUser.uid);
          topUpPool(); // Pre-fetch IDs for workorders, sales, transactions
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
              <Route path="workorder/:id/items" element={<MobileItemEditScreen />} />
              <Route path="workorder/:id/messages" element={<MobileMessagesScreen />} />
            </>
          )}
        </Route>

        {/* Public route - Home (auto-redirects by device type) */}
        <Route path={ROUTES.home} element={<DeviceAwareHome user={user} />} />

        {/* Database Viewer */}
        <Route path={ROUTES.dbViewer} element={<DatabaseViewerScreen />} />

        {/* Public route - Customer Display */}
        <Route path={ROUTES.display} element={<CustomerDisplayScreen />} />

        {/* Public route - Translation Display */}
        <Route path={ROUTES.translate} element={<TranslateScreen />} />

        {/* Public route - Customer Workorder View */}
        <Route path={ROUTES.customerWorkorder} element={<CustomerWorkorderScreen />} />

        {/* Protected route - Intake Screen */}
        <Route
          path={ROUTES.intake}
          element={
            <ProtectedRoute user={user}>
              <IntakeScreen />
            </ProtectedRoute>
          }
        />

        {/* Protected route - Bike Stand Screen */}
        <Route
          path={ROUTES.stand}
          element={
            <ProtectedRoute user={user}>
              <BikeStandScreenWrapper />
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
