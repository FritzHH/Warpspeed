import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { functions, db } from "../firebase";
import {
  StoreAddressFields,
  useStoreAddressFields,
} from "./StoreAddressFields";

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

function slugify(s) {
  let out = (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (out.length > 64) out = out.slice(0, 64).replace(/-+$/, "");
  return out;
}

function formatPhoneForDisplay(s) {
  const digits = (s || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+${digits}`;
}

export function CreateTenantForm() {
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState("");
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const addr = useStoreAddressFields();
  const [tenantID, setTenantID] = useState("");
  const [idEditable, setIdEditable] = useState(false);
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [idCheckStatus, setIdCheckStatus] = useState("idle");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const checkTimerRef = useRef(null);
  const checkRequestRef = useRef(0);
  const idInputRef = useRef(null);

  function startDupCheck(id) {
    if (checkTimerRef.current) {
      clearTimeout(checkTimerRef.current);
      checkTimerRef.current = null;
    }
    if (!id || !TENANT_ID_PATTERN.test(id)) {
      setIdCheckStatus(id ? "invalid" : "idle");
      return;
    }
    setIdCheckStatus("checking");
    const requestID = ++checkRequestRef.current;
    checkTimerRef.current = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, "tenants", id));
        if (requestID !== checkRequestRef.current) return;
        setIdCheckStatus(snap.exists() ? "taken" : "available");
      } catch {
        if (requestID !== checkRequestRef.current) return;
        setIdCheckStatus("idle");
      }
    }, 350);
  }

  function handleNameChange(e) {
    const newName = e.target.value;
    setTenantName(newName);
    if (!idManuallyEdited) {
      const newSlug = slugify(newName);
      setTenantID(newSlug);
      startDupCheck(newSlug);
    }
  }

  function handleIdChange(e) {
    const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setTenantID(v);
    setIdManuallyEdited(true);
    startDupCheck(v);
  }

  function handleEditID() {
    setIdEditable(true);
    setTimeout(() => idInputRef.current?.focus(), 0);
  }

  function handleResetID() {
    const newSlug = slugify(tenantName);
    setTenantID(newSlug);
    setIdManuallyEdited(false);
    setIdEditable(false);
    startDupCheck(newSlug);
  }

  const trimmedName = tenantName.trim();
  const trimmedFirstName = ownerFirstName.trim();
  const trimmedLastName = ownerLastName.trim();
  const trimmedEmail = ownerEmail.trim();
  const phoneDigits = ownerPhone.replace(/\D/g, "");
  const phoneIsValid =
    phoneDigits.length === 10 ||
    (phoneDigits.length === 11 && phoneDigits.startsWith("1")) ||
    (ownerPhone.trim().startsWith("+") && phoneDigits.length >= 8);

  const idIsValid = TENANT_ID_PATTERN.test(tenantID);

  const canSubmit =
    status !== "submitting" &&
    trimmedName &&
    trimmedFirstName &&
    trimmedLastName &&
    trimmedEmail &&
    phoneIsValid &&
    addr.allValid &&
    idIsValid &&
    idCheckStatus !== "taken" &&
    idCheckStatus !== "checking";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMsg("");
    try {
      const fn = httpsCallable(functions, "platformAdminCreateTenantCallable");
      const res = await fn({
        tenantID,
        tenantName: trimmedName,
        ownerEmail: trimmedEmail,
        ownerFirstName: trimmedFirstName,
        ownerLastName: trimmedLastName,
        ownerPhone: ownerPhone.trim(),
        ...addr.payload,
      });
      setResult(res.data);
      setStatus("success");
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to create tenant.";
      setErrorMsg(code ? `${code}: ${msg}` : msg);
      setStatus("error");
    }
  }

  function handleReset() {
    setTenantName("");
    setOwnerFirstName("");
    setOwnerLastName("");
    setOwnerEmail("");
    setOwnerPhone("");
    addr.reset();
    setTenantID("");
    setIdEditable(false);
    setIdManuallyEdited(false);
    setIdCheckStatus("idle");
    setResult(null);
    setStatus("idle");
    setErrorMsg("");
    setCopied(false);
  }

  async function handleCopy() {
    if (!result?.signInLink) return;
    try {
      await navigator.clipboard.writeText(result.signInLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (status === "success" && result) {
    return (
      <div className="formBlock">
        <div className="successBadge">Tenant created</div>
        <div className="resultRow">
          <span className="resultLabel">Tenant ID</span>
          <span className="resultValue">{result.tenantID}</span>
        </div>
        {result.storeID && (
          <div className="resultRow">
            <span className="resultLabel">Store ID</span>
            <span className="resultValue">{result.storeID}</span>
          </div>
        )}
        <div className="resultRow">
          <span className="resultLabel">Owner</span>
          <span className="resultValue">{result.ownerEmail}</span>
        </div>
        <div className="fieldLabel">Sign-in link (give to the owner)</div>
        <div className="linkBox">
          <pre className="linkText">{result.signInLink}</pre>
        </div>
        <button
          type="button"
          className="primaryButton"
          onClick={handleCopy}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          className="secondaryButton"
          onClick={() => navigate(`/tenants/${result.tenantID}`)}
        >
          Open tenant
        </button>
        <button
          type="button"
          className="secondaryButton"
          onClick={handleReset}
        >
          Create another tenant
        </button>
      </div>
    );
  }

  const idStatusText = (() => {
    if (!tenantID) return "Auto-generated from business name.";
    if (idCheckStatus === "invalid")
      return "Lowercase letters, digits, and dashes only. 3-64 chars.";
    if (!idIsValid) return "";
    if (idCheckStatus === "checking") return "Checking availability...";
    if (idCheckStatus === "taken")
      return `This tenant ID is already in use.`;
    if (idCheckStatus === "available") return "Available.";
    return "";
  })();

  const idStatusClass =
    idCheckStatus === "taken" || idCheckStatus === "invalid"
      ? "errorText"
      : idCheckStatus === "available"
        ? "successText"
        : "helperText";

  return (
    <form className="formBlock" onSubmit={handleSubmit}>
      <div className="fieldLabel">Business name</div>
      <input
        className="textInput"
        type="text"
        placeholder="Acme Cycles"
        value={tenantName}
        onChange={handleNameChange}
        disabled={status === "submitting"}
      />

      <div className="fieldLabel">Owner name</div>
      <div className="nameRow">
        <input
          className="textInput"
          type="text"
          placeholder="First"
          value={ownerFirstName}
          onChange={(e) => setOwnerFirstName(e.target.value)}
          disabled={status === "submitting"}
          autoComplete="given-name"
        />
        <input
          className="textInput"
          type="text"
          placeholder="Last"
          value={ownerLastName}
          onChange={(e) => setOwnerLastName(e.target.value)}
          disabled={status === "submitting"}
          autoComplete="family-name"
        />
      </div>

      <div className="fieldLabel">Owner email</div>
      <input
        className="textInput"
        type="email"
        placeholder="owner@acmecycles.com"
        value={ownerEmail}
        onChange={(e) => setOwnerEmail(e.target.value)}
        disabled={status === "submitting"}
        autoComplete="off"
      />

      <div className="fieldLabel">Owner phone</div>
      <input
        className="textInput"
        type="tel"
        placeholder="(555) 123-4567"
        value={ownerPhone}
        onChange={(e) => setOwnerPhone(formatPhoneForDisplay(e.target.value))}
        disabled={status === "submitting"}
        autoComplete="off"
      />
      {ownerPhone && !phoneIsValid && (
        <div className="errorText">
          Enter a 10-digit US number or +country format.
        </div>
      )}

      <div className="sectionHeading">First store</div>

      <StoreAddressFields
        {...addr}
        disabled={status === "submitting"}
      />

      <div className="fieldLabel">Tenant ID</div>
      <div className="idRow">
        <input
          ref={idInputRef}
          className={`textInput idInput${!idEditable ? " idInputLocked" : ""}`}
          type="text"
          placeholder="auto-generated"
          value={tenantID}
          onChange={handleIdChange}
          disabled={status === "submitting"}
          readOnly={!idEditable}
          autoComplete="off"
          spellCheck={false}
        />
        {idEditable ? (
          <button
            type="button"
            className="iconButton"
            onClick={handleResetID}
            disabled={status === "submitting"}
            title="Reset to auto-generated"
          >
            Reset
          </button>
        ) : (
          <button
            type="button"
            className="iconButton"
            onClick={handleEditID}
            disabled={status === "submitting" || !tenantName.trim()}
            title="Edit tenant ID"
          >
            Edit
          </button>
        )}
      </div>
      <div className={idStatusClass}>{idStatusText}</div>

      {errorMsg && <div className="errorText">{errorMsg}</div>}

      <button type="submit" className="primaryButton" disabled={!canSubmit}>
        {status === "submitting" ? "Creating..." : "Create tenant"}
      </button>
    </form>
  );
}
