/* eslint-disable */
import React from "react";
import { Navigate } from "react-router-dom";
import { ROUTES } from "../routes";

/**
 * ProtectedRoute component - protects routes that require authentication
 * If user is not authenticated, redirects to login page
 */
export function ProtectedRoute({ children, user }) {
  if (!user) {
    return <Navigate to={ROUTES.login} replace />;
  }

  return children;
}

