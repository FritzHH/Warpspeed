import React, { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

// Stage 3b: phone-number selection. Lands here after the card is on file
// (or skipped, for per-sale). Modes:
//
//   buy:   search Twilio's master pool by area code (+ optional locality),
//          purchase the picked number into the prospect's pre-tenant
//          subaccount. Number sits dormant (no webhooks) until tenant
//          provisioning adopts it.
//   port:  placeholder until Twilio support confirms the routing path for
//          Hosted SMS vs Bulk Number Port submission. Blocks shipping the
//          port flow until then.

const searchNumbersCallable = httpsCallable(
  functions,
  "tenantSetupSearchTwilioNumbersCallable"
);
const purchaseNumberCallable = httpsCallable(
  functions,
  "tenantSetupPurchaseTwilioNumberCallable"
);
const releaseNumberCallable = httpsCallable(
  functions,
  "tenantSetupReleaseTwilioNumberCallable"
);

const BILLING_TIER_COPY = {
  per_sale: {
    label: "Per-sale plan",
    detail: "0.5% of every sale, billed monthly to the card on file.",
    badge: "Per-sale",
  },
  monthly_sub: {
    label: "Monthly subscription",
    detail: "$50/month, billed to the card on file.",
    badge: "$50/mo",
  },
};

export function TenantSetupPhoneForm({
  email,
  // eslint-disable-next-line no-unused-vars
  formData,
  billingTier,
  purchasedPhoneNumber,
  onSaveFormData,
  onPhoneNumberChanged,
}) {
  const [mode, setMode] = useState("buy");
  const [areaCode, setAreaCode] = useState("");
  const [locality, setLocality] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [purchasingNumber, setPurchasingNumber] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState("");
  const [saveError, setSaveError] = useState("");

  const tierCopy = BILLING_TIER_COPY[billingTier] || null;
  const hasPurchasedNumber = !!(
    purchasedPhoneNumber && purchasedPhoneNumber.phoneNumber
  );

  async function handleBack() {
    setSaveError("");
    try {
      await onSaveFormData({ currentStep: "payment" });
    } catch (err) {
      setSaveError(err?.message || "Failed to go back.");
    }
  }

  async function handleContinue() {
    setSaveError("");
    try {
      await onSaveFormData({ currentStep: "a2p" });
    } catch (err) {
      setSaveError(err?.message || "Failed to continue.");
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (searching) return;
    const trimmedArea = areaCode.trim();
    if (!trimmedArea) {
      setSearchError("Enter an area code to search.");
      return;
    }
    setSearching(true);
    setSearchError("");
    setResults([]);
    try {
      const payload = { areaCode: trimmedArea };
      const trimmedLocality = locality.trim();
      if (trimmedLocality) payload.locality = trimmedLocality;
      const res = await searchNumbersCallable(payload);
      const candidates =
        (res && res.data && res.data.candidates) || [];
      if (candidates.length === 0) {
        setSearchError(
          `No numbers available in area code ${trimmedArea}${
            trimmedLocality ? ` for ${trimmedLocality}` : ""
          }.`
        );
      }
      setResults(candidates);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Search failed.";
      setSearchError(code ? `${code}: ${msg}` : msg);
    } finally {
      setSearching(false);
    }
  }

  async function handlePurchase(phoneNumber) {
    if (purchasingNumber) return;
    setPurchasingNumber(phoneNumber);
    setPurchaseError("");
    try {
      await purchaseNumberCallable({ phoneNumber });
      if (typeof onPhoneNumberChanged === "function") {
        await onPhoneNumberChanged();
      }
      setResults([]);
      setAreaCode("");
      setLocality("");
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Purchase failed.";
      setPurchaseError(code ? `${code}: ${msg}` : msg);
    } finally {
      setPurchasingNumber("");
    }
  }

  async function handleRelease() {
    if (releasing) return;
    if (
      !window.confirm(
        "Release this phone number? You can pick a different one after."
      )
    ) {
      return;
    }
    setReleasing(true);
    setReleaseError("");
    try {
      await releaseNumberCallable({});
      if (typeof onPhoneNumberChanged === "function") {
        await onPhoneNumberChanged();
      }
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Release failed.";
      setReleaseError(code ? `${code}: ${msg}` : msg);
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <div className="switchTypeRow">
          <button type="button" className="linkButton" onClick={handleBack}>
            ← Back
          </button>
        </div>

        {tierCopy && (
          <div className="tierBanner">
            <div className="tierBannerHeader">
              <div className="tierBannerEyebrow">You're signing up for</div>
              <div className="tierBannerBadge">{tierCopy.badge}</div>
            </div>
            <div className="tierBannerLabel">{tierCopy.label}</div>
            <div className="tierBannerDetail">{tierCopy.detail}</div>
          </div>
        )}

        <h1 className="cardTitle">Pick your shop's phone number</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>. Customers text this number;
          your caller ID shows the locality you pick.
        </p>

        {hasPurchasedNumber ? (
          <div className="phoneOwnedCard">
            <div className="phoneOwnedHeader">Your phone number</div>
            <div className="phoneOwnedNumber">
              {purchasedPhoneNumber.phoneNumber}
            </div>
            <div className="phoneOwnedDetail">
              {purchasedPhoneNumber.friendlyName || "Ready for setup"}
            </div>
            <button
              type="button"
              className="secondaryButton"
              onClick={handleRelease}
              disabled={releasing}
            >
              {releasing ? "Releasing…" : "Pick a different number"}
            </button>
            {releaseError && <div className="errorText">{releaseError}</div>}
          </div>
        ) : (
          <>
            <div className="phoneModeRow">
              <button
                type="button"
                className={
                  mode === "buy"
                    ? "phoneModeButton phoneModeButtonActive"
                    : "phoneModeButton"
                }
                onClick={() => setMode("buy")}
              >
                <div className="phoneModeTitle">Buy a new number</div>
                <div className="phoneModeBody">
                  Pick from numbers available in any US area code.
                </div>
              </button>
              <button
                type="button"
                className={
                  mode === "port"
                    ? "phoneModeButton phoneModeButtonActive"
                    : "phoneModeButton"
                }
                onClick={() => setMode("port")}
              >
                <div className="phoneModeTitle">Port an existing number</div>
                <div className="phoneModeBody">
                  Move a number you already own from another provider.
                </div>
              </button>
            </div>

            {mode === "buy" && (
              <>
                <form className="phoneSearchForm" onSubmit={handleSearch}>
                  <div className="phoneSearchFields">
                    <div className="phoneSearchField">
                      <label className="fieldLabel">Area code</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={3}
                        className="textInput"
                        value={areaCode}
                        onChange={(e) =>
                          setAreaCode(
                            e.target.value.replace(/[^0-9]/g, "").slice(0, 3)
                          )
                        }
                        placeholder="619"
                      />
                    </div>
                    <div className="phoneSearchField">
                      <label className="fieldLabel">
                        Locality (optional)
                      </label>
                      <input
                        type="text"
                        className="textInput"
                        value={locality}
                        onChange={(e) => setLocality(e.target.value)}
                        placeholder="San Diego"
                      />
                    </div>
                    <button
                      type="submit"
                      className="primaryButton"
                      disabled={searching}
                    >
                      {searching ? "Searching…" : "Search"}
                    </button>
                  </div>
                  {searchError && (
                    <div className="errorText">{searchError}</div>
                  )}
                </form>

                {results.length > 0 && (
                  <div className="phoneResultsList">
                    {results.map((candidate) => (
                      <div
                        key={candidate.phoneNumber}
                        className="phoneResultRow"
                      >
                        <div className="phoneResultMain">
                          <div className="phoneResultNumber">
                            {candidate.phoneNumber}
                          </div>
                          <div className="phoneResultLocality">
                            {candidate.locality || "—"}
                            {candidate.region ? `, ${candidate.region}` : ""}
                            {candidate.rateCenter
                              ? ` · ${candidate.rateCenter}`
                              : ""}
                          </div>
                          <div className="phoneResultCaps">
                            {candidate.capabilities?.sms ? "SMS" : ""}
                            {candidate.capabilities?.mms ? " · MMS" : ""}
                            {candidate.capabilities?.voice ? " · Voice" : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="primaryButton"
                          onClick={() => handlePurchase(candidate.phoneNumber)}
                          disabled={!!purchasingNumber}
                        >
                          {purchasingNumber === candidate.phoneNumber
                            ? "Purchasing…"
                            : "Select"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {purchaseError && (
                  <div className="errorText">{purchaseError}</div>
                )}
              </>
            )}

            {mode === "port" && (
              <div className="setupSectionPlaceholder">
                Number porting (coming soon). For now, pick "Buy a new
                number" — you can port your existing number after onboarding.
              </div>
            )}
          </>
        )}

        <div className="cardFooterRow">
          <button
            type="button"
            className="linkButton"
            onClick={handleBack}
            disabled={searching || !!purchasingNumber || releasing}
          >
            ← Back
          </button>
          <button
            type="button"
            className="primaryButton"
            onClick={handleContinue}
            disabled={!hasPurchasedNumber}
          >
            Continue
          </button>
        </div>

        {saveError && <div className="errorText">{saveError}</div>}
      </div>
    </div>
  );
}
