import React, { useState } from "react";

// Shared store-details stage. Both single-shop and multi-shop flows land here
// after the tenant form. We pre-fill shop name, owner info, and address from
// the tenant fields the prospect already filled out so single-shop owners
// just confirm and multi-shop owners get a starting point for their first
// store. They can edit any field before continuing.

function formatPhoneForDisplay(s) {
  const digits = (s || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+${digits}`;
}

export function TenantSetupStoreDetailsForm({
  email,
  formData,
  onSaveFormData,
}) {
  // Pre-fill chain: prefer the user's store-level entry if they already made
  // one (e.g., they came back to this screen), otherwise fall back to the
  // tenant-level field they entered on the previous screen.
  const [storeName, setStoreName] = useState(
    formData.storeName || formData.businessName || ""
  );
  const [storeOwnerFirstName, setStoreOwnerFirstName] = useState(
    formData.storeOwnerFirstName || formData.ownerFirstName || ""
  );
  const [storeOwnerLastName, setStoreOwnerLastName] = useState(
    formData.storeOwnerLastName || formData.ownerLastName || ""
  );
  const [storeOwnerPhone, setStoreOwnerPhone] = useState(
    formatPhoneForDisplay(
      formData.storeOwnerPhone || formData.ownerPhone || ""
    )
  );
  const [storeStreet, setStoreStreet] = useState(
    formData.storeStreet || formData.tenantStreet || ""
  );
  const [storeCity, setStoreCity] = useState(
    formData.storeCity || formData.tenantCity || ""
  );
  const [storeState, setStoreState] = useState(
    formData.storeState || formData.tenantState || ""
  );
  const [storeZip, setStoreZip] = useState(
    formData.storeZip || formData.tenantZip || ""
  );

  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");

  async function persist(field, value) {
    if ((formData[field] ?? "") === value) return;
    setSaveStatus("saving");
    setSaveError("");
    try {
      await onSaveFormData({ [field]: value });
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err?.message || "Failed to save.");
    }
  }

  async function handleBack() {
    setSaveError("");
    try {
      await onSaveFormData({ currentStep: "tenant-form" });
    } catch (err) {
      setSaveError(err?.message || "Failed to go back.");
    }
  }

  async function handleContinue() {
    setSaveError("");
    try {
      await onSaveFormData({ currentStep: "payment" });
    } catch (err) {
      setSaveError(err?.message || "Failed to continue.");
    }
  }

  const allFieldsFilled =
    storeName.trim().length > 0 &&
    storeOwnerFirstName.trim().length > 0 &&
    storeOwnerLastName.trim().length > 0 &&
    storeOwnerPhone.trim().length > 0 &&
    storeStreet.trim().length > 0 &&
    storeCity.trim().length > 0 &&
    storeState.trim().length > 0 &&
    storeZip.trim().length > 0;

  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <div className="switchTypeRow">
          <button type="button" className="linkButton" onClick={handleBack}>
            ← Back
          </button>
          <span className={`saveStatus saveStatus-${saveStatus}`}>
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && "Save failed"}
          </span>
        </div>

        <h1 className="cardTitle">Your first shop</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>. We've pre-filled this from
          what you told us about your business — confirm or edit any field
          below. Your progress saves automatically.
        </p>

        <div className="sectionHeading">Shop</div>

        <div className="fieldLabel">Shop name</div>
        <input
          className="textInput"
          type="text"
          placeholder="Acme Cycles"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          onBlur={() => persist("storeName", storeName.trim())}
          autoComplete="organization"
        />

        <div className="sectionHeading">Owner / Manager</div>

        <div className="fieldLabel">Name</div>
        <div className="nameRow">
          <input
            className="textInput"
            type="text"
            placeholder="First"
            value={storeOwnerFirstName}
            onChange={(e) => setStoreOwnerFirstName(e.target.value)}
            onBlur={() =>
              persist("storeOwnerFirstName", storeOwnerFirstName.trim())
            }
            autoComplete="given-name"
          />
          <input
            className="textInput"
            type="text"
            placeholder="Last"
            value={storeOwnerLastName}
            onChange={(e) => setStoreOwnerLastName(e.target.value)}
            onBlur={() =>
              persist("storeOwnerLastName", storeOwnerLastName.trim())
            }
            autoComplete="family-name"
          />
        </div>

        <div className="fieldLabel">Phone</div>
        <input
          className="textInput"
          type="tel"
          placeholder="(555) 123-4567"
          value={storeOwnerPhone}
          onChange={(e) =>
            setStoreOwnerPhone(formatPhoneForDisplay(e.target.value))
          }
          onBlur={() => persist("storeOwnerPhone", storeOwnerPhone.trim())}
          autoComplete="tel"
        />

        <div className="sectionHeading">Shop address</div>

        <div className="fieldLabel">Street</div>
        <input
          className="textInput"
          type="text"
          placeholder="1234 Main St"
          value={storeStreet}
          onChange={(e) => setStoreStreet(e.target.value)}
          onBlur={() => persist("storeStreet", storeStreet.trim())}
          autoComplete="street-address"
        />

        <div className="fieldLabel">City</div>
        <input
          className="textInput"
          type="text"
          placeholder="Bonita Springs"
          value={storeCity}
          onChange={(e) => setStoreCity(e.target.value)}
          onBlur={() => persist("storeCity", storeCity.trim())}
          autoComplete="address-level2"
        />

        <div className="nameRow">
          <div className="fieldGroup">
            <div className="fieldLabel">State</div>
            <input
              className="textInput"
              type="text"
              placeholder="FL"
              maxLength={2}
              value={storeState}
              onChange={(e) => setStoreState(e.target.value.toUpperCase())}
              onBlur={() =>
                persist("storeState", storeState.trim().toUpperCase())
              }
              autoComplete="address-level1"
            />
          </div>
          <div className="fieldGroup">
            <div className="fieldLabel">ZIP</div>
            <input
              className="textInput"
              type="text"
              placeholder="34135"
              value={storeZip}
              onChange={(e) => setStoreZip(e.target.value)}
              onBlur={() => persist("storeZip", storeZip.trim())}
              autoComplete="postal-code"
            />
          </div>
        </div>

        {saveError && <div className="errorText">{saveError}</div>}

        {allFieldsFilled && (
          <button
            type="button"
            className="primaryButton"
            onClick={handleContinue}
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
