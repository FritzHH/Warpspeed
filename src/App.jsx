/* eslint-disable */
import React, { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { BaseScreen } from "./screens/BaseScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoadingIndicator } from "./dom_components";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useZ } from "./hooks/useZ";
const CustomerDisplayScreen = lazy(() =>
  import("./screens/CustomerDisplayScreen").then((m) => ({
    default: m.CustomerDisplayScreen,
  }))
);
const TranslateScreen = lazy(() =>
  import("./screens/TranslateScreen").then((m) => ({
    default: m.TranslateScreen,
  }))
);
const IntakeScreen = lazy(() =>
  import("./screens/IntakeScreen").then((m) => ({
    default: m.IntakeScreen,
  }))
);
const BikeStandScreen = lazy(() =>
  import("./screens/BikeStandScreen").then((m) => ({
    default: m.BikeStandScreen,
  }))
);
const PhoneScreen = lazy(() =>
  import("./screens/phone/PhoneScreen").then((m) => ({
    default: m.PhoneScreen,
  }))
);
import { HomeScreen } from "./screens/HomeScreen";
const DatabaseViewerScreen = lazy(() =>
  import("./screens/DatabaseViewerScreen").then((m) => ({
    default: m.DatabaseViewerScreen,
  }))
);
const TokensScreen = lazy(() =>
  import("./screens/TokensScreen").then((m) => ({
    default: m.TokensScreen,
  }))
);
const StripeConnectScreen = lazy(() =>
  import("./screens/StripeConnectScreen").then((m) => ({
    default: m.StripeConnectScreen,
  }))
);
const InviteAcceptScreen = lazy(() =>
  import("./screens/InviteAcceptScreen").then((m) => ({
    default: m.InviteAcceptScreen,
  }))
);
import {
  onAuthStateChange,
  loadTenantAndSettings,
  dbLogout,
} from "./db_calls_wrapper";
import { log } from "./utils";
import { C } from "./styles";
import { useLayoutStore, useSettingsStore, useLoginStore } from "./stores";
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
        backgroundColor: C.surfaceAlt,
      }}>
        <div style={{
          height: "90vh",
          aspectRatio: "9 / 19.5",
          borderRadius: 40,
          overflow: "hidden",
          border: "6px solid " + C.borderSubtle,
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
        backgroundColor: C.surfaceAlt,
      }}>
        <div style={{
          height: "90vh",
          aspectRatio: "3 / 4",
          borderRadius: 16,
          overflow: "hidden",
          border: "2px solid " + C.borderSubtle,
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
  const setIsMobile = useLayoutStore((state) => state.setIsMobile);
  const setDeviceType = useLayoutStore((state) => state.setDeviceType);
  const zEmulatorBadge = useZ(
    "debug",
    import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true",
  );

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
    let initialLoad = true;
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser && initialLoad) {
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          const { tenantID, storeID } = tokenResult.claims;
          await loadTenantAndSettings(tenantID, storeID);
          topUpPool();

          // Stash SaaS claims for new SaaS-only UI gates. tokenResult.claims
          // also carries privilege, stores, and platformAdmin when present;
          // legacy Bonita users only have {tenantID, storeID} so the others
          // fall back to safe defaults.
          useLoginStore.getState().setAuthClaims({
            tenantID: tokenResult.claims.tenantID || null,
            storeID: tokenResult.claims.storeID || null,
            privilege: tokenResult.claims.privilege || null,
            stores: Array.isArray(tokenResult.claims.stores)
              ? tokenResult.claims.stores
              : [],
            platformAdmin: tokenResult.claims.platformAdmin === true,
          });

          // DEV-ONLY: auto-login the user with id "1234" so owner-permissioned
          // functions are available without waiting on face recognition.
          // Stripped from production builds via Vite's import.meta.env.DEV.
          if (import.meta.env.DEV) {
            const devUser = useSettingsStore.getState().getSettings()?.users
              ?.find((u) => u.id == "1234");
            if (devUser) {
              useLoginStore.getState().setCurrentUser(devUser);
              useLoginStore.setState({ lastActionMillis: Infinity });
            }
          }
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            emailVerified: firebaseUser.emailVerified,
            displayName: firebaseUser.displayName,
          });
        } catch (error) {
          console.error("Failed to load tenant/settings:", error);
          await dbLogout();
          setUser(null);
        }
      } else if (!firebaseUser) {
        setUser(null);
        useLoginStore.getState().setAuthClaims(null);
      }
      initialLoad = false;
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
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={300}>
    {import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true" && (
      <div
        style={{
          position: "fixed",
          bottom: 8,
          left: 8,
          padding: "4px 8px",
          backgroundColor: "#d97706",
          color: "white",
          fontSize: 11,
          fontWeight: "bold",
          borderRadius: 4,
          zIndex: zEmulatorBadge,
          pointerEvents: "none",
          letterSpacing: 0.5,
        }}
      >
        EMULATOR
      </div>
    )}
    <BrowserRouter>
      <Routes>
        {/* Public route - Login */}
        <Route
          path={ROUTES.login}
          element={
            user ? (
              <DeviceAwareRedirect />
            ) : (
              <LoginScreen setUser={setUser} />
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
        <Route
          path={ROUTES.dbViewer}
          element={
            <Suspense fallback={<LoadingIndicator />}>
              <DatabaseViewerScreen />
            </Suspense>
          }
        />

        {/* Protected route - Design Tokens (admin-gated inside the screen) */}
        <Route
          path={ROUTES.tokens}
          element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LoadingIndicator />}>
                <TokensScreen />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Protected route - Stripe Connect onboarding (SaaS) */}
        <Route
          path={ROUTES.stripeConnect}
          element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LoadingIndicator />}>
                <StripeConnectScreen />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.stripeConnectRefresh}
          element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LoadingIndicator />}>
                <StripeConnectScreen mode="refresh" />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.stripeConnectComplete}
          element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LoadingIndicator />}>
                <StripeConnectScreen mode="complete" />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Public route - Invite accept (email-link sign-in landing) */}
        <Route
          path={ROUTES.inviteAccept}
          element={
            <Suspense fallback={<LoadingIndicator />}>
              <InviteAcceptScreen />
            </Suspense>
          }
        />

        {/* Public route - Customer Display */}
        <Route
          path={ROUTES.display}
          element={
            <Suspense fallback={<LoadingIndicator />}>
              <CustomerDisplayScreen />
            </Suspense>
          }
        />

        {/* Public route - Translation Display */}
        <Route
          path={ROUTES.translate}
          element={
            <Suspense fallback={<LoadingIndicator />}>
              <TranslateScreen />
            </Suspense>
          }
        />

        {/* Protected route - Intake Screen */}
        <Route
          path={ROUTES.intake}
          element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LoadingIndicator />}>
                <IntakeScreen />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Protected route - Bike Stand Screen */}
        <Route
          path={ROUTES.stand}
          element={
            <ProtectedRoute user={user}>
              <Suspense fallback={null}>
                <BikeStandScreenWrapper />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Protected route - Phone Simulator */}
        <Route
          path={ROUTES.phone}
          element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LoadingIndicator />}>
                <PhoneScreenWrapper />
              </Suspense>
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
    </TooltipPrimitive.Provider>
  );
}

export default App;
