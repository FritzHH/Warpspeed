import React, { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { functions, storage } from "../../firebase";

// /portal/port-number — initiates a Twilio Hosted SMS port-in for the
// tenant's real business number.
//
// Inputs collected:
//   - phoneNumber:          E.164 number being ported IN (tenant's existing
//                            business line they want to move onto Cadence).
//   - contactPhoneNumber:   E.164 number Twilio can reach the tenant at
//                            during the port (often the same as their main
//                            line OR a personal cell).
//   - contactEmail:         tenant email Twilio sends port status to.
//   - storeID:              which Cadence store receives the number (picker
//                            shows only when claims.stores has >1).
//   - LOA PDF:              uploaded to Firebase Storage at
//                            tenants/{tenantID}/port-in/{phoneNumber}/loa-{ts}.pdf
//                            then the path is passed to portInTwilioNumber.
//                            The functions-side LOA→Twilio attachment upload
//                            is currently a TODO (see twilio-numbers.js:515).
//
// Once portInTwilioNumber returns, the per-store doc is updated and the
// scheduled poll (scheduledTwilioPortInPoll) takes over. We show a success
// state with the order SID so the tenant can confirm with support if
// needed.

const portInCallable = httpsCallable(functions, "portInTwilioNumber");

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
}

function isValidE164(raw) {
  return /^\+[1-9]\d{6,14}$/.test(String(raw || ""));
}

function isValidEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw || ""));
}

export function PortNumberRoute() {
  const { claims, email: signedInEmail } = useOutletContext();
  const tenantID = claims?.tenantID || "";
  const stores = Array.isArray(claims?.stores) ? claims.stores : [];

  const [phoneNumber, setPhoneNumber] = useState("");
  const [contactPhoneNumber, setContactPhoneNumber] = useState("");
  const [contactEmail, setContactEmail] = useState(signedInEmail || "");
  const [storeID, setStoreID] = useState(stores[0] || "");
  const [loaFile, setLoaFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState(null);

  const normalizedTarget = normalizePhone(phoneNumber);
  const normalizedContact = normalizePhone(contactPhoneNumber);
  const targetValid = isValidE164(normalizedTarget);
  const contactValid = isValidE164(normalizedContact);
  const emailValid = isValidEmail(contactEmail);
  const storeValid = !!storeID;
  const canSubmit =
    targetValid &&
    contactValid &&
    emailValid &&
    storeValid &&
    !!tenantID &&
    !submitting;

  function handleFileChange(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      setLoaFile(null);
      return;
    }
    if (f.type && f.type !== "application/pdf") {
      setSubmitError("LOA must be a PDF file.");
      setLoaFile(null);
      return;
    }
    setSubmitError("");
    setLoaFile(f);
  }

  async function maybeUploadLoa() {
    if (!loaFile) return null;
    const ts = Date.now();
    const safeNumber = normalizedTarget.replace(/\D/g, "");
    const path = `tenants/${tenantID}/port-in/${safeNumber}/loa-${ts}.pdf`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, loaFile, { contentType: "application/pdf" });
    return path;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const loaStoragePath = await maybeUploadLoa();
      const res = await portInCallable({
        tenantID,
        storeID,
        phoneNumber: normalizedTarget,
        contactPhoneNumber: normalizedContact,
        contactEmail: contactEmail.trim(),
        loaStoragePath,
      });
      setResult(res.data || { ok: true });
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Port request failed.";
      setSubmitError(code ? `${code}: ${msg}` : msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="centerScreen">
        <div className="card cardWide">
          <h1 className="cardTitle">Port-in submitted</h1>
          <p className="cardSubtitle">
            Twilio has received your port-in request for{" "}
            <strong>{normalizedTarget}</strong>. Most ports complete within
            5–10 business days, sometimes faster.
          </p>
          {result.hostedNumberOrderSid && (
            <p className="helperText">
              Twilio reference:{" "}
              <code>{result.hostedNumberOrderSid}</code>
            </p>
          )}
          <p>
            We'll email <strong>{contactEmail}</strong> when your number is
            live on Cadence. Until then, your current carrier continues to
            route calls and texts normally — nothing changes on your end.
          </p>
          <Link
            to="/portal"
            className="primaryButton"
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            ← Back to portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <div className="switchTypeRow">
          <Link to="/portal" className="linkButton">
            ← Back to portal
          </Link>
        </div>

        <h1 className="cardTitle">Port in your phone number</h1>
        <p className="cardSubtitle">
          Move your existing business number onto Cadence. We submit the
          port request to Twilio on your behalf — your current carrier
          continues service until the port completes (typically 5–10
          business days).
        </p>

        <form className="cardSetupForm" onSubmit={handleSubmit}>
          {stores.length > 1 && (
            <>
              <label className="fieldLabel">Store</label>
              <select
                className="textInput"
                value={storeID}
                onChange={(e) => setStoreID(e.target.value)}
                disabled={submitting}
              >
                {stores.map((sid) => (
                  <option key={sid} value={sid}>
                    {sid}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="fieldLabel">
            Phone number you want to port in
          </label>
          <input
            type="tel"
            className="textInput"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="(555) 123-4567"
            disabled={submitting}
            autoComplete="off"
          />

          <label className="fieldLabel">
            Best contact phone during the port
          </label>
          <input
            type="tel"
            className="textInput"
            value={contactPhoneNumber}
            onChange={(e) => setContactPhoneNumber(e.target.value)}
            placeholder="(555) 987-6543"
            disabled={submitting}
            autoComplete="off"
          />
          <p className="helperText">
            A number Twilio can call or text if there are questions. Can be
            your personal cell — does not have to be the number being ported.
          </p>

          <label className="fieldLabel">Contact email</label>
          <input
            type="email"
            className="textInput"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="owner@example.com"
            disabled={submitting}
            autoComplete="email"
          />

          <label className="fieldLabel">
            Letter of Authorization (LOA) — PDF, optional for now
          </label>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={submitting}
          />
          <p className="helperText">
            Some carriers require a signed LOA before they'll release your
            number. If you have one ready, upload it here — otherwise we'll
            email you the template if Twilio asks for it during the port.
          </p>

          <div className="cardFooterRow">
            <Link to="/portal" className="linkButton">
              ← Cancel
            </Link>
            <button
              type="submit"
              className="primaryButton"
              disabled={!canSubmit}
            >
              {submitting ? "Submitting…" : "Submit port-in request"}
            </button>
          </div>

          {submitError && <div className="errorText">{submitError}</div>}
        </form>
      </div>
    </div>
  );
}
