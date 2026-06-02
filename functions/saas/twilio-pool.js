/* eslint-disable */
// twilio-pool.js — temporary number pool interface (STUBBED).
//
// During tenant onboarding, the prospect can pick "temporary number" instead
// of purchasing a permanent one. We hand them a number from a platform-owned
// "pool" subaccount that matches their requested area code; the number is
// theirs for 30 days, after which they're expected to have initiated a
// port-in for their real number (via the post-onboarding portal route).
//
// This file is the INTERFACE the rest of the codebase uses. The real
// implementation is deferred — when the pool subaccount + on-demand purchase
// pipeline lands, only the bodies of these functions need to change. Until
// then, both calls return stub data shaped like the real return so the rest
// of the onboarding flow can be wired end-to-end.
//
// Real-implementation notes (when this gets un-stubbed):
//   - One platform-owned Twilio subaccount holds the pool of unassigned
//     numbers (purchased on-demand by area code).
//   - assignTempNumberToTenant: transfer the number's ownership FROM the
//     pool subaccount TO the tenant's subaccount via the Twilio API
//     (subaccount transfer / number-portability between subaccounts). Then
//     stamp the pool-entry doc with `assignedTenantID` + `expiresAt`.
//   - releaseTempNumber: transfer back to pool subaccount, clear assignment
//     fields. Called when a tenant either successfully ports their real
//     number or churns within the 30-day window.
//   - The 30-day expiry sweep is a separate scheduled function (deferred).

const STUB_EXPIRY_DAYS = 30;

// Assigns a temporary pool number to a tenant for ~30 days.
//
// Inputs:
//   tenantID  — final tenant ID (post-finalize) OR the setup-doc email
//               (during onboarding, before finalize). Real impl will need
//               both anchors so the post-finalize transfer can be wired up.
//   areaCode  — 3-digit US area code as string ("619").
//
// Returns:
//   {
//     phoneNumber:  string E.164 ("+16195550100"),
//     twilioSID:    string ("PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
//     capabilities: { sms, mms, voice },
//     expiresAt:    millis-epoch (30 days from now),
//     _stub:        true,
//   }
//
// NOTE: stub mode does NOT actually reserve a real number with Twilio. The
// number returned is a placeholder; downstream code that tries to send SMS
// through it will fail until the real implementation lands.
async function assignTempNumberToTenant(tenantID, areaCode) {
  const code = String(areaCode || "").replace(/\D/g, "").slice(0, 3);
  if (code.length !== 3) {
    throw new Error(`Invalid areaCode: ${areaCode}`);
  }
  const expiresAt = Date.now() + STUB_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return {
    phoneNumber: `+1${code}5550100`,
    twilioSID: `PN${"x".repeat(32)}`,
    capabilities: { sms: true, mms: true, voice: true },
    expiresAt,
    _stub: true,
  };
}

// Returns a temporary pool number back to the pool. Called after the tenant
// successfully ports their real number, or on early churn.
//
// Inputs:
//   tenantID, phoneNumber
//
// Returns: { released: true, _stub: true }
async function releaseTempNumber(tenantID, phoneNumber) {
  if (!tenantID || !phoneNumber) {
    throw new Error("tenantID and phoneNumber are required.");
  }
  return { released: true, _stub: true };
}

module.exports = {
  assignTempNumberToTenant,
  releaseTempNumber,
  _STUB_EXPIRY_DAYS: STUB_EXPIRY_DAYS,
};
