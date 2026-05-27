import React from "react";
import { Link } from "react-router-dom";
import { CreateTenantForm } from "./CreateTenantForm";

export function CreateTenantScreen() {
  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <Link to="/" className="linkButton">
          ← Back to tenants
        </Link>
        <h1 className="cardTitle">New tenant</h1>
        <p className="cardSubtitle">
          Creates the tenant document and stamps owner claims. Hand the
          sign-in link to the owner via any channel.
        </p>
        <CreateTenantForm />
      </div>
    </div>
  );
}
