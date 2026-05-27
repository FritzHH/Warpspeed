import React, { useState } from "react";

const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

function formatPhoneForDisplay(s) {
  const digits = (s || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+${digits}`;
}

export function useStoreAddressFields() {
  const [storeStreet, setStoreStreet] = useState("");
  const [storeUnit, setStoreUnit] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeState, setStoreState] = useState("");
  const [storeZip, setStoreZip] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [salesTaxPercent, setSalesTaxPercent] = useState("");

  const trimmedStreet = storeStreet.trim();
  const trimmedCity = storeCity.trim();
  const trimmedZip = storeZip.trim();
  const trimmedStorePhone = storePhone.trim();
  const storePhoneDigits = storePhone.replace(/\D/g, "");

  const streetIsValid =
    trimmedStreet.length > 0 && trimmedStreet.length <= 200;
  const unitIsValid = storeUnit.trim().length <= 50;
  const cityIsValid = trimmedCity.length > 0 && trimmedCity.length <= 100;
  const stateIsValid = US_STATES.some((s) => s.code === storeState);
  const zipIsValid = /^\d{5}(-\d{4})?$/.test(trimmedZip);
  const phoneIsValid =
    storePhoneDigits.length === 10 ||
    (storePhoneDigits.length === 11 && storePhoneDigits.startsWith("1")) ||
    (trimmedStorePhone.startsWith("+") && storePhoneDigits.length >= 8);
  const salesTaxNum = salesTaxPercent === "" ? NaN : Number(salesTaxPercent);
  const salesTaxIsValid =
    Number.isFinite(salesTaxNum) && salesTaxNum >= 0 && salesTaxNum <= 100;

  const allValid =
    streetIsValid &&
    unitIsValid &&
    cityIsValid &&
    stateIsValid &&
    zipIsValid &&
    phoneIsValid &&
    salesTaxIsValid;

  function reset() {
    setStoreStreet("");
    setStoreUnit("");
    setStoreCity("");
    setStoreState("");
    setStoreZip("");
    setStorePhone("");
    setSalesTaxPercent("");
  }

  const payload = {
    storeStreet: trimmedStreet,
    storeUnit: storeUnit.trim(),
    storeCity: trimmedCity,
    storeState: storeState.toUpperCase(),
    storeZip: trimmedZip,
    storePhone: trimmedStorePhone,
    salesTaxPercent: salesTaxNum,
  };

  return {
    storeStreet,
    setStoreStreet,
    storeUnit,
    setStoreUnit,
    storeCity,
    setStoreCity,
    storeState,
    setStoreState,
    storeZip,
    setStoreZip,
    storePhone,
    setStorePhone,
    salesTaxPercent,
    setSalesTaxPercent,
    streetIsValid,
    unitIsValid,
    cityIsValid,
    stateIsValid,
    zipIsValid,
    phoneIsValid,
    salesTaxIsValid,
    trimmedZip,
    salesTaxNum,
    allValid,
    payload,
    reset,
  };
}

export function StoreAddressFields({
  storeStreet,
  setStoreStreet,
  storeUnit,
  setStoreUnit,
  storeCity,
  setStoreCity,
  storeState,
  setStoreState,
  storeZip,
  setStoreZip,
  storePhone,
  setStorePhone,
  salesTaxPercent,
  setSalesTaxPercent,
  zipIsValid,
  phoneIsValid,
  salesTaxIsValid,
  trimmedZip,
  disabled = false,
}) {
  return (
    <>
      <div className="fieldLabel">Street</div>
      <input
        className="textInput"
        type="text"
        placeholder="123 Main St"
        value={storeStreet}
        onChange={(e) => setStoreStreet(e.target.value)}
        disabled={disabled}
        maxLength={200}
        autoComplete="off"
      />

      <div className="fieldLabel">Unit / Suite (optional)</div>
      <input
        className="textInput"
        type="text"
        placeholder="Suite 4"
        value={storeUnit}
        onChange={(e) => setStoreUnit(e.target.value)}
        disabled={disabled}
        maxLength={50}
        autoComplete="off"
      />

      <div className="fieldLabel">City / State / ZIP</div>
      <div className="cityStateZipRow">
        <input
          className="textInput cityInput"
          type="text"
          placeholder="City"
          value={storeCity}
          onChange={(e) => setStoreCity(e.target.value)}
          disabled={disabled}
          maxLength={100}
          autoComplete="off"
        />
        <select
          className="textInput stateSelect"
          value={storeState}
          onChange={(e) => setStoreState(e.target.value)}
          disabled={disabled}
        >
          <option value="">State</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code}
            </option>
          ))}
        </select>
        <input
          className="textInput zipInput"
          type="text"
          placeholder="ZIP"
          value={storeZip}
          onChange={(e) => setStoreZip(e.target.value)}
          disabled={disabled}
          maxLength={10}
          autoComplete="off"
        />
      </div>
      {trimmedZip && !zipIsValid && (
        <div className="errorText">ZIP must be 5 digits or ZIP+4.</div>
      )}

      <div className="fieldLabel">Store phone</div>
      <input
        className="textInput"
        type="tel"
        placeholder="(555) 123-4567"
        value={storePhone}
        onChange={(e) => setStorePhone(formatPhoneForDisplay(e.target.value))}
        disabled={disabled}
        autoComplete="off"
      />
      {storePhone && !phoneIsValid && (
        <div className="errorText">
          Enter a 10-digit US number or +country format.
        </div>
      )}

      <div className="fieldLabel">Sales tax %</div>
      <input
        className="textInput salesTaxInput"
        type="text"
        inputMode="decimal"
        placeholder="7.25"
        value={salesTaxPercent}
        onChange={(e) => setSalesTaxPercent(e.target.value)}
        disabled={disabled}
        autoComplete="off"
      />
      {salesTaxPercent && !salesTaxIsValid && (
        <div className="errorText">
          Sales tax must be a number between 0 and 100.
        </div>
      )}
    </>
  );
}
