import React from "react";
import { signOut } from "../auth";

export function DeniedScreen({ email }) {
  return (
    <div className="centerScreen">
      <div className="card">
        <h1 className="cardTitle">Access denied</h1>
        <p className="cardSubtitle">
          {email} is signed in but is not a platform admin.
        </p>
        <p className="placeholderText">
          This dashboard is restricted to Retail Soft Systems platform administrators.
        </p>
        <button type="button" className="secondaryButton" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
