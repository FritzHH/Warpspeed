import React, { useState } from "react";

// Single-shop wizard — consolidated form.
//
// Layout (top to bottom):
//   1. Shop section: shop name + shop address (required). For a single-shop
//      owner these are also the tenant's identity, so we collect them once
//      and the server mirrors them onto the tenant doc at finalize.
//   2. Primary owner: name + phone. Email is the signed-in email (locked).
//   3. Additional owners (optional, add-as-needed): each with name + email +
//      phone. Persisted as formData.additionalOwners and provisioned with
//      auto-generated PINs at finalize.
//   4. "My holding company is different" toggle: reveals holding-company
//      name (writes formData.businessName). Empty → server copies shopName.
//   5. "My holding company address is different" toggle: reveals separate
//      tenant address. Empty → server copies shop address at finalize.
//
// Continue advances directly to "payment" — the previous separate store-
// details step is gone for single-shop signups.

function formatPhoneForDisplay(s) {
  const digits = (s || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+${digits}`;
}

function isValidEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw || "").trim());
}

function isValidPhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function isValidPostalCode(raw, country) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return false;
  if ((country || "US").toUpperCase() === "CA") {
    return /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(trimmed);
  }
  return /^\d{5}(-\d{4})?$/.test(trimmed);
}

export function TenantSetupSingleShopForm({
  email,
  formData,
  onSaveFormData,
  onSwitchType,
}) {
  // Country selector — drives currency (server-derived), Stripe Connect
  // account country, and downstream address-format expectations. Defaults to
  // "US" for backward compatibility with prospects already mid-wizard.
  const [country, setCountry] = useState(formData.country || "US");

  // Shop (required)
  const [shopName, setShopName] = useState(formData.storeName || "");
  const [shopStreet, setShopStreet] = useState(formData.storeStreet || "");
  const [shopCity, setShopCity] = useState(formData.storeCity || "");
  const [shopState, setShopState] = useState(formData.storeState || "");
  const [shopZip, setShopZip] = useState(formData.storeZip || "");

  // Primary owner (required)
  const [ownerFirstName, setOwnerFirstName] = useState(
    formData.ownerFirstName || ""
  );
  const [ownerLastName, setOwnerLastName] = useState(
    formData.ownerLastName || ""
  );
  const [ownerPhone, setOwnerPhone] = useState(
    formatPhoneForDisplay(formData.ownerPhone || "")
  );

  // Additional owners (optional)
  const [additionalOwners, setAdditionalOwners] = useState(
    Array.isArray(formData.additionalOwners) ? formData.additionalOwners : []
  );

  // Holding company name (optional — collapsed by default)
  const initialHasHoldingName = !!(
    formData.businessName && formData.businessName !== formData.storeName
  );
  const [showHoldingName, setShowHoldingName] = useState(initialHasHoldingName);
  const [holdingName, setHoldingName] = useState(
    initialHasHoldingName ? formData.businessName : ""
  );

  // Holding company address (optional — collapsed by default)
  const initialHasHoldingAddress = !!(
    formData.tenantStreet &&
    (formData.tenantStreet !== formData.storeStreet ||
      formData.tenantCity !== formData.storeCity ||
      formData.tenantState !== formData.storeState ||
      formData.tenantZip !== formData.storeZip)
  );
  const [showHoldingAddress, setShowHoldingAddress] = useState(
    initialHasHoldingAddress
  );
  const [holdingStreet, setHoldingStreet] = useState(
    initialHasHoldingAddress ? formData.tenantStreet : ""
  );
  const [holdingCity, setHoldingCity] = useState(
    initialHasHoldingAddress ? formData.tenantCity : ""
  );
  const [holdingState, setHoldingState] = useState(
    initialHasHoldingAddress ? formData.tenantState : ""
  );
  const [holdingZip, setHoldingZip] = useState(
    initialHasHoldingAddress ? formData.tenantZip : ""
  );

  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");

  async function persist(partial) {
    setSaveStatus("saving");
    setSaveError("");
    try {
      await onSaveFormData(partial);
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err?.message || "Failed to save.");
    }
  }

  // Generic field-blur persister: only writes when the value actually
  // changed from what's in formData, so refocusing without edits is a no-op.
  async function persistIfChanged(field, value) {
    if ((formData[field] ?? "") === value) return;
    await persist({ [field]: value });
  }

  async function persistOwners(next) {
    setAdditionalOwners(next);
    await persist({ additionalOwners: next });
  }

  function handleAddOwner() {
    const next = [
      ...additionalOwners,
      { firstName: "", lastName: "", email: "", phone: "" },
    ];
    setAdditionalOwners(next);
  }

  function handleRemoveOwner(idx) {
    const next = additionalOwners.filter((_, i) => i !== idx);
    void persistOwners(next);
  }

  function handleOwnerField(idx, field, value) {
    const next = additionalOwners.map((o, i) =>
      i === idx ? { ...o, [field]: value } : o
    );
    setAdditionalOwners(next);
  }

  async function handleOwnerBlur() {
    await persist({ additionalOwners });
  }

  async function handleToggleHoldingName(nextShow) {
    setShowHoldingName(nextShow);
    if (!nextShow) {
      setHoldingName("");
      await persist({ businessName: "" });
    }
  }

  async function handleToggleHoldingAddress(nextShow) {
    setShowHoldingAddress(nextShow);
    if (!nextShow) {
      setHoldingStreet("");
      setHoldingCity("");
      setHoldingState("");
      setHoldingZip("");
      await persist({
        tenantStreet: "",
        tenantCity: "",
        tenantState: "",
        tenantZip: "",
      });
    }
  }

  // Required-field gate. Additional owners are validated only when present —
  // an empty additional-owners list is fine. A partially-filled additional
  // owner blocks Continue until completed.
  const shopFieldsOk =
    shopName.trim().length > 0 &&
    ownerFirstName.trim().length > 0 &&
    ownerLastName.trim().length > 0 &&
    isValidPhone(ownerPhone) &&
    shopStreet.trim().length > 0 &&
    shopCity.trim().length > 0 &&
    /^[A-Za-z]{2}$/.test(shopState.trim()) &&
    isValidPostalCode(shopZip, country);
  const additionalOwnersOk = additionalOwners.every(
    (o) =>
      (o.firstName || "").trim().length > 0 &&
      (o.lastName || "").trim().length > 0 &&
      isValidEmail(o.email) &&
      isValidPhone(o.phone) &&
      (o.email || "").trim().toLowerCase() !== (email || "").trim().toLowerCase()
  );
  const holdingNameOk = !showHoldingName || holdingName.trim().length > 0;
  const holdingAddressOk =
    !showHoldingAddress ||
    (holdingStreet.trim().length > 0 &&
      holdingCity.trim().length > 0 &&
      /^[A-Za-z]{2}$/.test(holdingState.trim()) &&
      isValidPostalCode(holdingZip, country));
  const canContinue =
    shopFieldsOk && additionalOwnersOk && holdingNameOk && holdingAddressOk;

  async function handleCountryChange(nextCountry) {
    setCountry(nextCountry);
    await persist({ country: nextCountry });
  }

  async function handleContinue() {
    setSaveError("");
    try {
      await onSaveFormData({ currentStep: "payment" });
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
            ← I actually run multiple shops
          </button>
          <span className={`saveStatus saveStatus-${saveStatus}`}>
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && "Save failed"}
          </span>
        </div>

        <h1 className="cardTitle">Tell us about your shop</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>. One short form covers your
          shop, you, and any co-owners. Your progress saves automatically.
        </p>

        <div className="sectionHeading">Country</div>
        <p className="helperText">
          We use this to set up payments and your store's currency.
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

        <div className="sectionHeading">Shop</div>

        <div className="fieldLabel">Shop name</div>
        <input
          className="textInput"
          type="text"
          placeholder="Acme Cycles"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          onBlur={() => persistIfChanged("storeName", shopName.trim())}
          autoComplete="organization"
        />

        <div className="fieldLabel">Street</div>
        <input
          className="textInput"
          type="text"
          placeholder="1234 Main St"
          value={shopStreet}
          onChange={(e) => setShopStreet(e.target.value)}
          onBlur={() => persistIfChanged("storeStreet", shopStreet.trim())}
          autoComplete="street-address"
        />

        <div className="fieldLabel">City</div>
        <input
          className="textInput"
          type="text"
          placeholder="Bonita Springs"
          value={shopCity}
          onChange={(e) => setShopCity(e.target.value)}
          onBlur={() => persistIfChanged("storeCity", shopCity.trim())}
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
              value={shopState}
              onChange={(e) => setShopState(e.target.value.toUpperCase())}
              onBlur={() =>
                persistIfChanged("storeState", shopState.trim().toUpperCase())
              }
              autoComplete="address-level1"
            />
          </div>
          <div className="fieldGroup">
            <div className="fieldLabel">{country === "CA" ? "Postal code" : "ZIP"}</div>
            <input
              className="textInput"
              type="text"
              placeholder={country === "CA" ? "A1A 1A1" : "34135"}
              value={shopZip}
              onChange={(e) => setShopZip(e.target.value)}
              onBlur={() => persistIfChanged("storeZip", shopZip.trim())}
              autoComplete="postal-code"
            />
          </div>
        </div>

        <div className="sectionHeading">Primary owner</div>

        <div className="fieldLabel">Your name</div>
        <div className="nameRow">
          <input
            className="textInput"
            type="text"
            placeholder="First"
            value={ownerFirstName}
            onChange={(e) => setOwnerFirstName(e.target.value)}
            onBlur={() =>
              persistIfChanged("ownerFirstName", ownerFirstName.trim())
            }
            autoComplete="given-name"
          />
          <input
            className="textInput"
            type="text"
            placeholder="Last"
            value={ownerLastName}
            onChange={(e) => setOwnerLastName(e.target.value)}
            onBlur={() =>
              persistIfChanged("ownerLastName", ownerLastName.trim())
            }
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
          onBlur={() => persistIfChanged("ownerPhone", ownerPhone.trim())}
          autoComplete="tel"
        />

        <div className="fieldLabel">Email</div>
        <input
          className="textInput"
          type="email"
          value={email}
          readOnly
          disabled
          autoComplete="email"
        />
        <p className="helperText">
          This is the email you signed up with — we'll send your POS PIN here
          when setup completes.
        </p>

        <div className="sectionHeading">Additional owners (optional)</div>
        <p className="helperText">
          Add any co-owners who should also have full owner access to the POS.
          Each will receive an emailed 4-digit PIN when setup completes; they
          can change it later from the app.
        </p>

        {additionalOwners.map((owner, idx) => (
          <div key={idx} className="additionalOwnerCard">
            <div className="additionalOwnerHeader">
              <span className="additionalOwnerLabel">Co-owner #{idx + 1}</span>
              <button
                type="button"
                className="linkButton"
                onClick={() => handleRemoveOwner(idx)}
              >
                Remove
              </button>
            </div>

            <div className="fieldLabel">Name</div>
            <div className="nameRow">
              <input
                className="textInput"
                type="text"
                placeholder="First"
                value={owner.firstName}
                onChange={(e) =>
                  handleOwnerField(idx, "firstName", e.target.value)
                }
                onBlur={handleOwnerBlur}
                autoComplete="off"
              />
              <input
                className="textInput"
                type="text"
                placeholder="Last"
                value={owner.lastName}
                onChange={(e) =>
                  handleOwnerField(idx, "lastName", e.target.value)
                }
                onBlur={handleOwnerBlur}
                autoComplete="off"
              />
            </div>

            <div className="fieldLabel">Email</div>
            <input
              className="textInput"
              type="email"
              placeholder="coowner@example.com"
              value={owner.email}
              onChange={(e) => handleOwnerField(idx, "email", e.target.value)}
              onBlur={handleOwnerBlur}
              autoComplete="off"
            />

            <div className="fieldLabel">Phone</div>
            <input
              className="textInput"
              type="tel"
              placeholder="(555) 987-6543"
              value={formatPhoneForDisplay(owner.phone)}
              onChange={(e) =>
                handleOwnerField(idx, "phone", formatPhoneForDisplay(e.target.value))
              }
              onBlur={handleOwnerBlur}
              autoComplete="off"
            />
          </div>
        ))}

        <button
          type="button"
          className="secondaryButton"
          onClick={handleAddOwner}
        >
          + Add another owner
        </button>

        <div className="sectionHeading">Holding company (optional)</div>

        <label className="toggleRow">
          <input
            type="checkbox"
            checked={showHoldingName}
            onChange={(e) => handleToggleHoldingName(e.target.checked)}
          />
          <span>
            My holding company has a different name than the shop
          </span>
        </label>

        {showHoldingName && (
          <>
            <div className="fieldLabel">Holding company name</div>
            <input
              className="textInput"
              type="text"
              placeholder="Acme Holdings LLC"
              value={holdingName}
              onChange={(e) => setHoldingName(e.target.value)}
              onBlur={() =>
                persistIfChanged("businessName", holdingName.trim())
              }
              autoComplete="organization"
            />
          </>
        )}

        <label className="toggleRow">
          <input
            type="checkbox"
            checked={showHoldingAddress}
            onChange={(e) => handleToggleHoldingAddress(e.target.checked)}
          />
          <span>
            My holding company address is different from the shop address
          </span>
        </label>

        {showHoldingAddress && (
          <>
            <div className="fieldLabel">Street</div>
            <input
              className="textInput"
              type="text"
              placeholder="100 Corporate Way"
              value={holdingStreet}
              onChange={(e) => setHoldingStreet(e.target.value)}
              onBlur={() =>
                persistIfChanged("tenantStreet", holdingStreet.trim())
              }
              autoComplete="street-address"
            />

            <div className="fieldLabel">City</div>
            <input
              className="textInput"
              type="text"
              placeholder="Naples"
              value={holdingCity}
              onChange={(e) => setHoldingCity(e.target.value)}
              onBlur={() => persistIfChanged("tenantCity", holdingCity.trim())}
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
                  value={holdingState}
                  onChange={(e) =>
                    setHoldingState(e.target.value.toUpperCase())
                  }
                  onBlur={() =>
                    persistIfChanged(
                      "tenantState",
                      holdingState.trim().toUpperCase()
                    )
                  }
                  autoComplete="address-level1"
                />
              </div>
              <div className="fieldGroup">
                <div className="fieldLabel">{country === "CA" ? "Postal code" : "ZIP"}</div>
                <input
                  className="textInput"
                  type="text"
                  placeholder={country === "CA" ? "A1A 1A1" : "34102"}
                  value={holdingZip}
                  onChange={(e) => setHoldingZip(e.target.value)}
                  onBlur={() =>
                    persistIfChanged("tenantZip", holdingZip.trim())
                  }
                  autoComplete="postal-code"
                />
              </div>
            </div>
          </>
        )}

        {saveError && <div className="errorText">{saveError}</div>}

        <button
          type="button"
          className="primaryButton"
          onClick={handleContinue}
          disabled={!canContinue}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
