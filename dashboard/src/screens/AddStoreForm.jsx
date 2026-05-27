import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import {
  StoreAddressFields,
  useStoreAddressFields,
} from "./StoreAddressFields";

const getTenantCallable = httpsCallable(functions, "getTenantCallable");
const createStoreCallable = httpsCallable(
  functions,
  "platformAdminCreateStoreCallable"
);

export function AddStoreForm({ tenantID }) {
  const navigate = useNavigate();
  const [tenant, setTenant] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [storeDisplayName, setStoreDisplayName] = useState("");
  const [mode, setMode] = useState("fresh");
  const [sourceStoreID, setSourceStoreID] = useState("");
  const addr = useStoreAddressFields();

  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState(null);

  const fetchID = useRef(0);

  useEffect(() => {
    const reqID = ++fetchID.current;
    setLoading(true);
    setLoadError("");
    getTenantCallable({ tenantID })
      .then((res) => {
        if (reqID !== fetchID.current) return;
        setTenant(res.data?.tenant || null);
        setLoading(false);
      })
      .catch((err) => {
        if (reqID !== fetchID.current) return;
        const code = err?.code || "";
        const msg = err?.message || "Failed to load tenant.";
        setLoadError(code ? `${code}: ${msg}` : msg);
        setLoading(false);
      });
  }, [tenantID]);

  const stores = tenant?.stores || [];
  const trimmedDisplayName = storeDisplayName.trim();
  const displayNameIsValid =
    trimmedDisplayName.length > 0 && trimmedDisplayName.length <= 100;
  const sourceStoreIsValid =
    mode === "fresh" ||
    (mode === "copy" &&
      sourceStoreID &&
      stores.some((s) => s.storeID === sourceStoreID));

  const canSubmit =
    status !== "submitting" &&
    displayNameIsValid &&
    addr.allValid &&
    sourceStoreIsValid;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMsg("");
    try {
      const payload = {
        tenantID,
        mode,
        storeDisplayName: trimmedDisplayName,
        ...addr.payload,
      };
      if (mode === "copy") payload.sourceStoreID = sourceStoreID;
      const res = await createStoreCallable(payload);
      setResult(res.data);
      setStatus("success");
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to create store.";
      setErrorMsg(code ? `${code}: ${msg}` : msg);
      setStatus("error");
    }
  }

  if (loading) {
    return <p className="placeholderText">Loading tenant…</p>;
  }
  if (loadError) {
    return <div className="errorText">{loadError}</div>;
  }
  if (!tenant) {
    return <div className="errorText">Tenant not found.</div>;
  }

  if (status === "success" && result) {
    return (
      <div className="formBlock">
        <div className="successBadge">Store created</div>
        <div className="resultRow">
          <span className="resultLabel">Store ID</span>
          <span className="resultValue">{result.storeID}</span>
        </div>
        <div className="resultRow">
          <span className="resultLabel">Mode</span>
          <span className="resultValue">{result.mode}</span>
        </div>
        <div className="resultRow">
          <span className="resultLabel">Owner claims</span>
          <span className="resultValue">
            {result.ownerClaimsUpdated ? "updated" : "unchanged"}
          </span>
        </div>
        <button
          type="button"
          className="primaryButton"
          onClick={() => navigate(`/tenants/${tenantID}`)}
        >
          Back to tenant
        </button>
      </div>
    );
  }

  return (
    <form className="formBlock" onSubmit={handleSubmit}>
      <div className="fieldLabel">Store display name</div>
      <input
        className="textInput"
        type="text"
        placeholder="e.g. Bonita Springs"
        value={storeDisplayName}
        onChange={(e) => setStoreDisplayName(e.target.value)}
        disabled={status === "submitting"}
        maxLength={100}
        autoComplete="off"
      />

      <div className="fieldLabel">Settings source</div>
      <div className="nameRow">
        <label className="modeRadio">
          <input
            type="radio"
            name="mode"
            value="fresh"
            checked={mode === "fresh"}
            onChange={() => setMode("fresh")}
            disabled={status === "submitting"}
          />
          <span>Fresh defaults</span>
        </label>
        <label className="modeRadio">
          <input
            type="radio"
            name="mode"
            value="copy"
            checked={mode === "copy"}
            onChange={() => setMode("copy")}
            disabled={status === "submitting" || stores.length === 0}
          />
          <span>Copy from existing store</span>
        </label>
      </div>

      {mode === "copy" && (
        <>
          <div className="fieldLabel">Source store</div>
          <select
            className="textInput"
            value={sourceStoreID}
            onChange={(e) => setSourceStoreID(e.target.value)}
            disabled={status === "submitting"}
          >
            <option value="">Select a store…</option>
            {stores.map((s) => (
              <option key={s.storeID} value={s.storeID}>
                {s.name || s.storeID}
                {s.city ? ` — ${s.city}` : ""}
                {s.state ? `, ${s.state}` : ""}
              </option>
            ))}
          </select>
          {stores.length === 0 && (
            <div className="helperText">
              No existing stores under this tenant — use Fresh defaults.
            </div>
          )}
        </>
      )}

      <div className="sectionHeading">Store address</div>

      <StoreAddressFields {...addr} disabled={status === "submitting"} />

      {errorMsg && <div className="errorText">{errorMsg}</div>}

      <div className="buttonRow">
        <button
          type="button"
          className="secondaryButton"
          onClick={() => navigate(`/tenants/${tenantID}`)}
          disabled={status === "submitting"}
        >
          Cancel
        </button>
        <button type="submit" className="primaryButton" disabled={!canSubmit}>
          {status === "submitting" ? "Creating…" : "Create store"}
        </button>
      </div>
    </form>
  );
}
