/* eslint-disable */
import React, { useState, useEffect } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { BaseScreen } from "./screens/BaseScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ProtectedRoute } from "./components";
import { CustomerDisplayScreen } from "./screens/CustomerDisplayScreen";
import { TranslateScreen } from "./screens/TranslateScreen";
import { IntakeScreen } from "./screens/IntakeScreen";
import { BikeStandScreen } from "./screens/BikeStandScreen";
import { PhoneScreen } from "./screens/PhoneScreen";
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
// Checks on page load, tab refocus, and every day at 8 AM.
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
const scheduleNextUpdateCheck = () => {
  const now = new Date();
  const next8AM = new Date(now);
  next8AM.setHours(8, 0, 0, 0);
  if (now >= next8AM) next8AM.setDate(next8AM.getDate() + 1);
  setTimeout(() => {
    checkForAppUpdate();
    scheduleNextUpdateCheck();
  }, next8AM - now);
};
checkForAppUpdate();
scheduleNextUpdateCheck();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForAppUpdate();
});

// Returns the correct home route for the current device type
function DeviceAwareRedirect() {
  const deviceType = useLayoutStore((state) => state.deviceType);
  if (deviceType === "tablet") return <Navigate to={ROUTES.stand} replace />;
  if (deviceType === "mobile") return <Navigate to={ROUTES.phone} replace />;
  return <Navigate to={ROUTES.dashboard} replace />;
}

// Redirects tablet → /stand, mobile → /phone, desktop → shows HomeScreen
function DeviceAwareHome({ user }) {
  const deviceType = useLayoutStore((state) => state.deviceType);
  if (deviceType === "tablet" && user) {
    return <Navigate to={ROUTES.stand} replace />;
  }
  if (deviceType === "mobile" && user) {
    return <Navigate to={ROUTES.phone} replace />;
  }
  return <HomeScreen />;
}

// Tablet → /stand, mobile → /phone, desktop → BaseScreen
function DashboardRoute() {
  const deviceType = useLayoutStore((state) => state.deviceType);
  if (deviceType === "tablet") return <Navigate to={ROUTES.stand} replace />;
  if (deviceType === "mobile") return <Navigate to={ROUTES.phone} replace />;
  return <BaseScreen />;
}

// Desktop: wrap PhoneScreen in a centered phone frame for previewing mobile UI
function PhoneScreenWrapper() {
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
          aspectRatio: "9 / 19.5",
          borderRadius: 40,
          overflow: "hidden",
          border: "6px solid " + gray(0.2),
          backgroundColor: "white",
          display: "flex",
          boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
        }}>
          <PhoneScreen />
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100vh", overflow: "hidden" }}>
      <PhoneScreen />
    </div>
  );
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
              <DeviceAwareRedirect />
            ) : (
              <LoginScreen sessionError={sessionError} onClearError={() => setSessionError("")} />
            )
          }
        />

        {/* Protected route - Dashboard/Base Screen */}
        <Route
          path={ROUTES.dashboard}
          element={
            <ProtectedRoute user={user}>
              <DashboardRoute />
            </ProtectedRoute>
          }
        />

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

        {/* Protected route - Phone Simulator */}
        <Route
          path={ROUTES.phone}
          element={
            <ProtectedRoute user={user}>
              <PhoneScreenWrapper />
            </ProtectedRoute>
          }
        />

        {/* Catch-all redirect */}
        <Route
          path="*"
          element={
            user ? <DeviceAwareRedirect /> : <Navigate to={ROUTES.login} replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
