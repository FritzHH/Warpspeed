import React, { useState } from "react";

// Multi-shop wizard. Mirrors the prospect-relevant fields from the dashboard
// New Tenant page (business + owner + tenant address). Stores are added in a
// later step (and after provisioning, from inside the tenant's dashboard).
// Billing model is intentionally left out — that's a sales-side decision and
// is locked in before the auth email is sent.

function formatPhoneForDisplay(s) {
  const digits = (s || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+${digits}`;
}

export function TenantSetupMultiShopForm({
  email,
  formData,
  onSaveFormData,
  onSwitchType,
}) {
  // Country selector — drives currency (server-derived), Stripe Connect
  // account country, and downstream address-format expectations.
  const [country, setCountry] = useState(formData.country || "US");
  const [businessName, setBusinessName] = useState(formData.businessName || "");
  const [ownerFirstName, setOwnerFirstName] = useState(
    formData.ownerFirstName || ""
  );
  const [ownerLastName, setOwnerLastName] = useState(
    formData.ownerLastName || ""
  );
  const [ownerPhone, setOwnerPhone] = useState(
    formatPhoneForDisplay(formData.ownerPhone || "")
  );
  const [street, setStreet] = useState(formData.tenantStreet || "");
  const [city, setCity] = useState(formData.tenantCity || "");
  const [stateCode, setStateCode] = useState(formData.tenantState || "");
  const [zip, setZip] = useState(formData.tenantZip || "");

  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
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

  async function handleCountryChange(nextCountry) {
    setCountry(nextCountry);
    setSaveStatus("saving");
    setSaveError("");
    try {
      await onSaveFormData({ country: nextCountry });
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err?.message || "Failed to save.");
    }
  }

  async function handleContinue() {
    setSaveError("");
    try {
      await onSaveFormData({ currentStep: "store-details" });
    } catch (err) {
      setSaveError(err?.message || "Failed to continue.");
    }
  }

  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <div className="switchTypeRow">
          <button
            type="button"
            className="linkButton"
            onClick={onSwitchType}
          >
            ← I actually run only one shop
          </button>
          <span className={`saveStatus saveStatus-${saveStatus}`}>
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && "Save failed"}
          </span>
        </div>

        <h1 className="cardTitle">Tell us about your business</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>. We'll add your individual
          stores in the next step. Your progress saves automatically as you
          fill in each field.
        </p>

        <div className="sectionHeading">Country</div>
        <p className="helperText">
          We use this to set up payments and your business's currency.
        </p>
        <div className="nameRow">
          <label className="toggleRow">
            <input
              type="radio"
              name="country"
              value="US"
              checked={country === "US"}
              onChange={() => handleCountryChange("US")}
            />
            <span>United States (USD)</span>
          </label>
          <label className="toggleRow">
            <input
              type="radio"
              name="country"
              value="CA"
              checked={country === "CA"}
              onChange={() => handleCountryChange("CA")}
            />
            <span>Canada (CAD)</span>
          </label>
        </div>

        <div className="sectionHeading">Business</div>

        <div className="fieldLabel">Business name</div>
        <input
          className="textInput"
          type="text"
          placeholder="Acme Cycles"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          onBlur={() => persist("businessName", businessName.trim())}
          autoComplete="organization"
        />

        <div className="sectionHeading">Owner</div>

        <div className="fieldLabel">Your name</div>
        <div className="nameRow">
          <input
            className="textInput"
            type="text"
            placeholder="First"
            value={ownerFirstName}
            onChange={(e) => setOwnerFirstName(e.target.value)}
            onBlur={() => persist("ownerFirstName", ownerFirstName.trim())}
            autoComplete="given-name"
          />
          <input
            className="textInput"
            type="text"
            placeholder="Last"
            value={ownerLastName}
            onChange={(e) => setOwnerLastName(e.target.value)}
            onBlur={() => persist("ownerLastName", ownerLastName.trim())}
            autoComplete="family-name"
          />
        </div>

        <div className="fieldLabel">Phone</div>
        <input
          className="textInput"
          type="tel"
          placeholder="(555) 123-4567"
          value={ownerPhone}
          onChange={(e) => setOwnerPhone(formatPhoneForDisplay(e.target.value))}
          onBlur={() => persist("ownerPhone", ownerPhone.trim())}
          autoComplete="tel"
        />

        <div className="sectionHeading">Business mailing address</div>

        <div className="fieldLabel">Street</div>
        <input
          className="textInput"
          type="text"
          placeholder="1234 Main St"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          onBlur={() => persist("tenantStreet", street.trim())}
          autoComplete="street-address"
        />

        <div className="fieldLabel">City</div>
        <input
          className="textInput"
          type="text"
          placeholder="Bonita Springs"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onBlur={() => persist("tenantCity", city.trim())}
          autoComplete="address-level2"
        />

        <div className="nameRow">
          <div className="fieldGroup">
            <div className="fieldLabel">{country === "CA" ? "Province" : "State"}</div>
            <input
              className="textInput"
              type="text"
              placeholder={country === "CA" ? "ON" : "FL"}
              maxLength={2}
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value.toUpperCase())}
              onBlur={() => persist("tenantState", stateCode.trim().toUpperCase())}
              autoComplete="address-level1"
            />
          </div>
          <div className="fieldGroup">
            <div className="fieldLabel">{country === "CA" ? "Postal code" : "ZIP"}</div>
            <input
              className="textInput"
              type="text"
              placeholder={country === "CA" ? "A1A 1A1" : "34135"}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              onBlur={() => persist("tenantZip", zip.trim())}
              autoComplete="postal-code"
            />
          </div>
        </div>

        {saveError && <div className="errorText">{saveError}</div>}

        <button
          type="button"
          className="primaryButton"
          onClick={handleContinue}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
