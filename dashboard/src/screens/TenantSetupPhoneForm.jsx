import React, { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

// Stage 3b: phone-number selection. Lands here after the card is on file.
// Three-way choice (rebuilt 2026-05-31):
//
//   purchase: search Twilio's master pool by area code (+ optional locality),
//             purchase the picked number into the prospect's pre-tenant
//             subaccount. Number sits dormant (no webhooks) until tenant
//             provisioning adopts it.
//   pool:     assign a 30-day temp number from the platform pool matching
//             the requested area code (city/locality not guaranteed). After
//             onboarding the tenant uses the portal's /portal/port-number
//             route to port-in their real number. (Pool fulfillment is
//             currently STUBBED — see functions/saas/twilio-pool.js.)
//   opt_out:  skip SMS entirely. Tenant can enable it later from in-app
//             Subscription settings.
//
// Number porting during onboarding has been removed — it's now a separate
// post-onboarding flow on the cadence-dashboard portal route.

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
const assignPoolNumberCallable = httpsCallable(
  functions,
  "tenantSetupAssignPoolNumberCallable"
);
const releasePoolNumberCallable = httpsCallable(
  functions,
  "tenantSetupReleasePoolNumberCallable"
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

function formatPoolExpiry(expiresAtMs) {
  if (!expiresAtMs || typeof expiresAtMs !== "number") return null;
  try {
    return new Date(expiresAtMs).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

export function TenantSetupPhoneForm({
  email,
  formData,
  billingTier,
  purchasedPhoneNumber,
  poolNumberInfo,
  onSaveFormData,
  onPhoneNumberChanged,
}) {
  // smsChoice on the setup doc drives which sub-form is rendered. Default to
  // "purchase" so existing-in-flight signups (before this redesign shipped)
  // continue to land on the buy form.
  const initialChoice =
    formData && formData.smsChoice
      ? formData.smsChoice
      : purchasedPhoneNumber
        ? "purchase"
        : poolNumberInfo
          ? "pool"
          : "purchase";

  const [choice, setChoice] = useState(initialChoice);
  const [savingChoice, setSavingChoice] = useState(false);

  // Buy-mode local state
  const [areaCode, setAreaCode] = useState("");
  const [locality, setLocality] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [purchasingNumber, setPurchasingNumber] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState("");

  // Pool-mode local state
  const [poolAreaCode, setPoolAreaCode] = useState("");
  const [poolAssigning, setPoolAssigning] = useState(false);
  const [poolError, setPoolError] = useState("");
  const [poolReleasing, setPoolReleasing] = useState(false);

  const [saveError, setSaveError] = useState("");

  const tierCopy = BILLING_TIER_COPY[billingTier] || null;
  const hasPurchasedNumber = !!(
    purchasedPhoneNumber && purchasedPhoneNumber.phoneNumber
  );
  const hasPoolNumber = !!(poolNumberInfo && poolNumberInfo.phoneNumber);

  // Can continue? Different gating per choice:
  //   purchase  → must have purchased a number
  //   pool      → must have an assigned pool number
  //   opt_out   → always allowed
  const canContinue =
    choice === "opt_out" ||
    (choice === "purchase" && hasPurchasedNumber) ||
    (choice === "pool" && hasPoolNumber);

  async function persistChoice(newChoice) {
    if (savingChoice) return;
    setSavingChoice(true);
    setSaveError("");
    try {
      await onSaveFormData({ smsChoice: newChoice });
      setChoice(newChoice);
    } catch (err) {
      setSaveError(err?.message || "Failed to save your choice.");
    } finally {
      setSavingChoice(false);
    }
  }

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
      // opt_out skips the A2P form entirely and goes straight to finalize.
      const nextStep = choice === "opt_out" ? "review" : "a2p";
      await onSaveFormData({ smsChoice: choice, currentStep: nextStep });
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
      const candidates = (res && res.data && res.data.candidates) || [];
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

  async function handleAssignPool(e) {
    e.preventDefault();
    if (poolAssigning) return;
    const trimmed = poolAreaCode.trim();
    if (!/^\d{3}$/.test(trimmed)) {
      setPoolError("Enter a 3-digit area code.");
      return;
    }
    setPoolAssigning(true);
    setPoolError("");
    try {
      await assignPoolNumberCallable({ areaCode: trimmed });
      if (typeof onPhoneNumberChanged === "function") {
        await onPhoneNumberChanged();
      }
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Could not assign a pool number.";
      setPoolError(code ? `${code}: ${msg}` : msg);
    } finally {
      setPoolAssigning(false);
    }
  }

  async function handleReleasePool() {
    if (poolReleasing) return;
    if (
      !window.confirm(
        "Release this temporary number? You can pick a different area code after."
      )
    ) {
      return;
    }
    setPoolReleasing(true);
    setPoolError("");
    try {
      await releasePoolNumberCallable({});
      if (typeof onPhoneNumberChanged === "function") {
        await onPhoneNumberChanged();
      }
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Release failed.";
      setPoolError(code ? `${code}: ${msg}` : msg);
    } finally {
      setPoolReleasing(false);
    }
  }

  const poolExpiryStr = hasPoolNumber
    ? formatPoolExpiry(poolNumberInfo.expiresAt)
    : null;

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

        <h1 className="cardTitle">Set up text messaging</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>. Pick how you want to get
          started — you can change any of this later.
        </p>

        <div className="phoneChoiceList">
          <label
            className={
              choice === "purchase"
                ? "phoneChoiceRow phoneChoiceRowActive"
                : "phoneChoiceRow"
            }
          >
            <input
              type="radio"
              name="smsChoice"
              value="purchase"
              checked={choice === "purchase"}
              onChange={() => persistChoice("purchase")}
              disabled={savingChoice}
            />
            <div className="phoneChoiceBody">
              <div className="phoneChoiceTitle">
                Buy a permanent number
              </div>
              <div className="phoneChoiceDetail">
                Pick from numbers available in any US area code. This is your
                long-term business number — no port-in needed later.
              </div>
            </div>
          </label>

          <label
            className={
              choice === "pool"
                ? "phoneChoiceRow phoneChoiceRowActive"
                : "phoneChoiceRow"
            }
          >
            <input
              type="radio"
              name="smsChoice"
              value="pool"
              checked={choice === "pool"}
              onChange={() => persistChoice("pool")}
              disabled={savingChoice}
            />
            <div className="phoneChoiceBody">
              <div className="phoneChoiceTitle">
                Use a temporary number while you port your real one
              </div>
              <div className="phoneChoiceDetail">
                We'll assign you a number matching your area code (city/
                municipality not guaranteed). You'll have 30 days to start
                porting your existing business number — we'll walk you
                through it from your portal after signup.
              </div>
            </div>
          </label>

          <label
            className={
              choice === "opt_out"
                ? "phoneChoiceRow phoneChoiceRowActive"
                : "phoneChoiceRow"
            }
          >
            <input
              type="radio"
              name="smsChoice"
              value="opt_out"
              checked={choice === "opt_out"}
              onChange={() => persistChoice("opt_out")}
              disabled={savingChoice}
            />
            <div className="phoneChoiceBody">
              <div className="phoneChoiceTitle">
                Skip text messaging for now
              </div>
              <div className="phoneChoiceDetail">
                Set up Cadence without SMS. You can enable text messaging any
                time from your Subscription settings — nothing about this
                signup blocks you from adding it later.
              </div>
            </div>
          </label>
        </div>

        {choice === "purchase" && (
          <div className="phoneChoicePanel">
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
                {releaseError && (
                  <div className="errorText">{releaseError}</div>
                )}
              </div>
            ) : (
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
          </div>
        )}

        {choice === "pool" && (
          <div className="phoneChoicePanel">
            {hasPoolNumber ? (
              <div className="phoneOwnedCard">
                <div className="phoneOwnedHeader">
                  Your temporary number
                </div>
                <div className="phoneOwnedNumber">
                  {poolNumberInfo.phoneNumber}
                </div>
                <div className="phoneOwnedDetail">
                  {poolExpiryStr
                    ? `Yours through ${poolExpiryStr}. Start your port-in from the portal before then.`
                    : "Yours for 30 days. Start your port-in from the portal before then."}
                </div>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={handleReleasePool}
                  disabled={poolReleasing}
                >
                  {poolReleasing
                    ? "Releasing…"
                    : "Pick a different area code"}
                </button>
                {poolError && (
                  <div className="errorText">{poolError}</div>
                )}
              </div>
            ) : (
              <>
                <p className="helperText">
                  <strong>Reminder:</strong> we'll match your requested area
                  code, but the specific city or municipality cannot be
                  guaranteed for pool numbers.
                </p>
                <form className="phoneSearchForm" onSubmit={handleAssignPool}>
                  <div className="phoneSearchFields">
                    <div className="phoneSearchField">
                      <label className="fieldLabel">Area code</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={3}
                        className="textInput"
                        value={poolAreaCode}
                        onChange={(e) =>
                          setPoolAreaCode(
                            e.target.value
                              .replace(/[^0-9]/g, "")
                              .slice(0, 3)
                          )
                        }
                        placeholder="619"
                      />
                    </div>
                    <button
                      type="submit"
                      className="primaryButton"
                      disabled={poolAssigning}
                    >
                      {poolAssigning
                        ? "Assigning…"
                        : "Get a temporary number"}
                    </button>
                  </div>
                  {poolError && (
                    <div className="errorText">{poolError}</div>
                  )}
                </form>
              </>
            )}
          </div>
        )}

        {choice === "opt_out" && (
          <div className="phoneChoicePanel">
            <div className="phoneOwnedCard">
              <div className="phoneOwnedHeader">
                No text messaging on this account
              </div>
              <div className="phoneOwnedDetail">
                Your account will be set up without SMS/MMS. You can enable
                it anytime from your in-app Subscription settings — adding
                it later doesn't require redoing any of this signup.
              </div>
            </div>
          </div>
        )}

        <div className="cardFooterRow">
          <button
            type="button"
            className="linkButton"
            onClick={handleBack}
            disabled={
              searching ||
              !!purchasingNumber ||
              releasing ||
              poolAssigning ||
              poolReleasing ||
              savingChoice
            }
          >
            ← Back
          </button>
          <button
            type="button"
            className="primaryButton"
            onClick={handleContinue}
            disabled={!canContinue || savingChoice}
          >
            Continue
          </button>
        </div>

        {saveError && <div className="errorText">{saveError}</div>}
      </div>
    </div>
  );
}
