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

export function useTenantAddressFields() {
  const [tenantStreet, setTenantStreet] = useState("");
  const [tenantUnit, setTenantUnit] = useState("");
  const [tenantCity, setTenantCity] = useState("");
  const [tenantState, setTenantState] = useState("");
  const [tenantZip, setTenantZip] = useState("");

  const trimmedStreet = tenantStreet.trim();
  const trimmedCity = tenantCity.trim();
  const trimmedZip = tenantZip.trim();

  const streetIsValid =
    trimmedStreet.length > 0 && trimmedStreet.length <= 200;
  const unitIsValid = tenantUnit.trim().length <= 50;
  const cityIsValid = trimmedCity.length > 0 && trimmedCity.length <= 100;
  const stateIsValid = US_STATES.some((s) => s.code === tenantState);
  const zipIsValid = /^\d{5}(-\d{4})?$/.test(trimmedZip);

  const allValid =
    streetIsValid && unitIsValid && cityIsValid && stateIsValid && zipIsValid;

  function reset() {
    setTenantStreet("");
    setTenantUnit("");
    setTenantCity("");
    setTenantState("");
    setTenantZip("");
  }

  const payload = {
    tenantStreet: trimmedStreet,
    tenantUnit: tenantUnit.trim(),
    tenantCity: trimmedCity,
    tenantState: tenantState.toUpperCase(),
    tenantZip: trimmedZip,
  };

  return {
    tenantStreet,
    setTenantStreet,
    tenantUnit,
    setTenantUnit,
    tenantCity,
    setTenantCity,
    tenantState,
    setTenantState,
    tenantZip,
    setTenantZip,
    streetIsValid,
    unitIsValid,
    cityIsValid,
    stateIsValid,
    zipIsValid,
    trimmedZip,
    allValid,
    payload,
    reset,
  };
}

export function TenantAddressFields({
  tenantStreet,
  setTenantStreet,
  tenantUnit,
  setTenantUnit,
  tenantCity,
  setTenantCity,
  tenantState,
  setTenantState,
  tenantZip,
  setTenantZip,
  zipIsValid,
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
        value={tenantStreet}
        onChange={(e) => setTenantStreet(e.target.value)}
        disabled={disabled}
        maxLength={200}
        autoComplete="off"
      />

      <div className="fieldLabel">Unit / Suite (optional)</div>
      <input
        className="textInput"
        type="text"
        placeholder="Suite 4"
        value={tenantUnit}
        onChange={(e) => setTenantUnit(e.target.value)}
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
          value={tenantCity}
          onChange={(e) => setTenantCity(e.target.value)}
          disabled={disabled}
          maxLength={100}
          autoComplete="off"
        />
        <select
          className="textInput stateSelect"
          value={tenantState}
          onChange={(e) => setTenantState(e.target.value)}
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
          value={tenantZip}
          onChange={(e) => setTenantZip(e.target.value)}
          disabled={disabled}
          maxLength={10}
          autoComplete="off"
        />
      </div>
      {trimmedZip && !zipIsValid && (
        <div className="errorText">ZIP must be 5 digits or ZIP+4.</div>
      )}
    </>
  );
}
