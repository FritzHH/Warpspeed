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
const OrderingScreen = lazy(() =>
  import("./screens/phone/OrderingScreen/OrderingScreen").then((m) => ({
    default: m.OrderingScreen,
  }))
);
const OrderSelectScreen = lazy(() =>
  import("./screens/phone/OrderSelectScreen/OrderSelectScreen").then((m) => ({
    default: m.OrderSelectScreen,
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
import { doc, onSnapshot } from "firebase/firestore";
import { DB } from "./db_calls";
import { log } from "./utils";
import { C } from "./styles";
import {
  useLayoutStore,
  useSettingsStore,
  useLoginStore,
  useBillingStore,
} from "./stores";
import { ROUTES } from "./routes";
import { topUpPool } from "./idPool";
import { BUILD_VERSION } from "./buildVersion";

// Re-export ROUTES for backward compatibility
export { ROUTES };

// Auto-update: force reload when a newer version is deployed.
// Checks on page load, tab refocus, and every 30 minutes.
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
setInterval(checkForAppUpdate, 30 * 60 * 1000);
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
      // InviteAcceptScreen owns its own auth lifecycle (email-link sign-in,
      // bootstrap submit, sign-out, redirect). loadTenantAndSettings would
      // throw for a fresh tenant with no settings doc, hitting the catch
      // below and signing the user out mid-form.
      if (window.location.pathname.startsWith("/invite-accept")) {
        setIsLoading(false);
        return;
      }
      if (firebaseUser && initialLoad) {
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          const claims = tokenResult.claims;
          const { tenantID } = claims;
          // SaaS claim shape carries `stores: [storeID, ...]` with no singular
          // `storeID`. Legacy Bonita claim is `{tenantID, storeID}`. Pick the
          // active store from whichever is present so first sign-in works for
          // both. Owners with multiple stores land on stores[0] until an
          // explicit switcher exists.
          const claimStores = Array.isArray(claims.stores) ? claims.stores : [];
          // Passwordless sign-in stashes the user's picked store here so
          // a multi-store account can land somewhere other than stores[0].
          // Validate against claims.stores to refuse a forged value.
          let pendingStoreID = null;
          try {
            pendingStoreID = sessionStorage.getItem("warpspeed_pending_store");
            if (pendingStoreID) sessionStorage.removeItem("warpspeed_pending_store");
          } catch {
            pendingStoreID = null;
          }
          const activeStoreID =
            pendingStoreID && claimStores.includes(pendingStoreID)
              ? pendingStoreID
              : claims.storeID || claimStores[0] || null;
          await loadTenantAndSettings(tenantID, activeStoreID);
          topUpPool();

          useLoginStore.getState().setAuthClaims({
            tenantID: tenantID || null,
            storeID: activeStoreID,
            privilege: claims.privilege || null,
            stores: claimStores,
            platformAdmin: claims.platformAdmin === true,
          });

          // SaaS-only: subscribe to the tenant doc so client-side suspend
          // gating (past_due / grace window) reflects the live Stripe state.
          // Legacy Bonita claims have no `privilege` → skip the read.
          if (tenantID && claims.privilege) {
            useBillingStore.getState().teardown();
            const unsubTenant = onSnapshot(
              doc(DB, "tenants", tenantID),
              (snap) => {
                useBillingStore
                  .getState()
                  .setTenantDoc(snap.exists() ? snap.data() : null);
              },
              (err) => {
                console.error("tenant doc onSnapshot error:", err);
              }
            );
            useBillingStore.getState().setUnsub(unsubTenant);
          }

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
        useBillingStore.getState().teardown();
      }
      initialLoad = false;
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      useBillingStore.getState().teardown();
    };
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

        {/* Protected route - Stripe Connect onboarding (SaaS, owner-only) */}
        <Route
          path={ROUTES.stripeConnect}
          element={
            <ProtectedRoute user={user} requirePrivilege="owner">
              <Suspense fallback={<LoadingIndicator />}>
                <StripeConnectScreen />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.stripeConnectRefresh}
          element={
            <ProtectedRoute user={user} requirePrivilege="owner">
              <Suspense fallback={<LoadingIndicator />}>
                <StripeConnectScreen mode="refresh" />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.stripeConnectComplete}
          element={
            <ProtectedRoute user={user} requirePrivilege="owner">
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

        {/* Protected route - Phone Simulator (with nested sub-routes) */}
        <Route
          path={ROUTES.phone}
          element={
            <ProtectedRoute user={user}>
              <Suspense fallback={<LoadingIndicator />}>
                <PhoneScreenWrapper />
              </Suspense>
            </ProtectedRoute>
          }
        >
          {/* Nested: /phone/ordering picks an open vendor order (or starts
              a new one); /phone/ordering/:orderID runs the scanner against
              that order. Both render inside PhoneScreen via <Outlet>, so
              the PIN gate + listeners cover them. */}
          <Route
            path="ordering"
            element={
              <Suspense fallback={<LoadingIndicator />}>
                <OrderSelectScreen />
              </Suspense>
            }
          />
          <Route
            path="ordering/:orderID"
            element={
              <Suspense fallback={<LoadingIndicator />}>
                <OrderingScreen />
              </Suspense>
            }
          />
        </Route>

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
