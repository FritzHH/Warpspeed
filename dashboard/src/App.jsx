import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, isPlatformAdmin } from "./auth";
import { LoginScreen } from "./screens/LoginScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { CreateTenantScreen } from "./screens/CreateTenantScreen";
import { TenantDetailScreen } from "./screens/TenantDetailScreen";
import { AddStoreScreen } from "./screens/AddStoreScreen";
import { BillingTiersScreen } from "./screens/BillingTiersScreen";
import { DeniedScreen } from "./screens/DeniedScreen";
import { TenantSetupLandingScreen } from "./screens/TenantSetupLandingScreen";

export function App() {
  return (
    <Routes>
      {/* Tenant signup landing — gated by Firebase email-link auth. Sits
          outside the platform-admin gate so prospects (who get auto-signed
          in via the email-link, with no custom claims) don't get bounced to
          the DeniedScreen. */}
      <Route path="/welcome" element={<TenantSetupLandingScreen />} />
      <Route path="/*" element={<AuthGatedApp />} />
    </Routes>
  );
}

function AuthGatedApp() {
  const [authState, setAuthState] = useState({ status: "loading", user: null, claims: null });

  useEffect(() => {
    const unsub = onAuthStateChanged(({ user, claims }) => {
      if (!user) {
        setAuthState({ status: "signedOut", user: null, claims: null });
      } else if (!isPlatformAdmin(claims)) {
        setAuthState({ status: "denied", user, claims });
      } else {
        setAuthState({ status: "signedIn", user, claims });
      }
    });
    return unsub;
  }, []);

  if (authState.status === "loading") {
    return <div className="centerScreen">Loading...</div>;
  }
  if (authState.status === "signedOut") {
    return <LoginScreen />;
  }
  if (authState.status === "denied") {
    return <DeniedScreen email={authState.user?.email} />;
  }
  return (
    <Routes>
      <Route
        path="/"
        element={<HomeScreen user={authState.user} claims={authState.claims} />}
      />
      <Route path="/tenants/new" element={<CreateTenantScreen />} />
      <Route path="/tenants/:tenantID" element={<TenantDetailScreen />} />
      <Route
        path="/tenants/:tenantID/stores/new"
        element={<AddStoreScreen />}
      />
      <Route path="/billing/tiers" element={<BillingTiersScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
