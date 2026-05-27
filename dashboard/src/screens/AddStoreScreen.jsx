import React from "react";
import { Link, useParams } from "react-router-dom";
import { AddStoreForm } from "./AddStoreForm";

export function AddStoreScreen() {
  const { tenantID } = useParams();
  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <Link to={`/tenants/${tenantID}`} className="linkButton">
          ← Back to tenant
        </Link>
        <h1 className="cardTitle">Add store</h1>
        <p className="cardSubtitle">
          Adds a store under <span className="tenantRowID">{tenantID}</span>.
          Fresh defaults uses the bootstrap settings; Copy clones an existing
          store's settings (with address/tax overridden).
        </p>
        <AddStoreForm tenantID={tenantID} />
      </div>
    </div>
  );
}
