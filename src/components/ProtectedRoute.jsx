/* eslint-disable */
import React from "react";
import { Navigate } from "react-router-dom";
import { ROUTES } from "../routes";
import { useLoginStore } from "../stores";

// Auth-gated route. Optional claim-based gates:
//   requirePrivilege="owner"  -> only owners of a SaaS tenant
//   requirePlatformAdmin      -> only platform-admin (RSS staff)
// Unauthed users go to /login. Authed-but-unauthorized users go to dashboard.
export function ProtectedRoute({
  children,
  user,
  requirePrivilege,
  requirePlatformAdmin,
}) {
  const authClaims = useLoginStore((state) => state.authClaims);

  if (!user) {
    return <Navigate to={ROUTES.login} replace />;
  }

  if (requirePlatformAdmin && authClaims?.platformAdmin !== true) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  if (requirePrivilege && authClaims?.privilege !== requirePrivilege) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  return children;
}

