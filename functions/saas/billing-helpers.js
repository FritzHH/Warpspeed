/* eslint-disable */
// Shared helpers used by Stripe Connect (per-sale fee resolution) and
// Stripe Billing (tier lookup, subscription status, tenant fetch).
//
// Per-sale fee: tenant doc is source of truth for `billingModel` and
// `platformFeePercent`. monthly_sub tenants pay 0% per-charge.
//
// Tier lookup: `platform-billing-tiers/{tierID}` holds the catalog;
// archived tiers can be referenced by existing tenants but not picked
// for new subscriptions or tier swaps.
//
// Subscription status: convenience reader for Phase 5 client gating —
// returns the normalized status + grace state so the client gating logic
// doesn't have to re-derive it from the tenant doc shape.

const { HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");

const TIER_COLLECTION = "platform-billing-tiers";

async function getTenantOrThrow(db, tenantID) {
  if (!tenantID) {
    throw new HttpsError("invalid-argument", "tenantID is required.");
  }
  const ref = db.collection("tenants").doc(tenantID);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
  }
  return { ref, snap, data: snap.data() || {} };
}

// Semi-monthly period key in America/Chicago. Days 1-15 → "YYYY-MM-1H";
// days 16-EOM → "YYYY-MM-2H". This key is stamped on completed-sales docs
// at write time so the accumulation invoicer can range-query a closed
// period cheaply (single equality filter, no millis math) and so the rate
// at point-of-sale is locked even if the tenant's % changes later.
function computeFeeBillingPeriodKey(completedAtMillis, timeZone = "America/Chicago") {
  if (!Number.isFinite(completedAtMillis)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(completedAtMillis));
  let year = "";
  let month = "";
  let day = "";
  for (const p of parts) {
    if (p.type === "year") year = p.value;
    else if (p.type === "month") month = p.value;
    else if (p.type === "day") day = p.value;
  }
  if (!year || !month || !day) return null;
  const dayNum = parseInt(day, 10);
  if (!Number.isFinite(dayNum)) return null;
  const half = dayNum <= 15 ? "1H" : "2H";
  return `${year}-${month}-${half}`;
}

// Compute the fee snapshot to stamp on a completed-sale doc. Returns null
// for non-per_sale tenants (monthly_sub charges via Stripe Billing; nothing
// to accumulate). Returns null on missing/invalid percent so the snapshot
// stamper doesn't write a half-filled record the invoicer can't reason about.
async function resolveSaleFeeSnapshot(db, tenantID, completedAtMillis) {
  if (!tenantID || !Number.isFinite(completedAtMillis)) return null;

  const snap = await db.collection("tenants").doc(tenantID).get();
  if (!snap.exists) return null;
  const tdata = snap.data() || {};

  const model = tdata.billingModel || null;
  if (model !== "per_sale") return null;

  const pct = Number(tdata.platformFeePercent);
  if (!Number.isFinite(pct) || pct <= 0) return null;

  const feeBillingPeriodKey = computeFeeBillingPeriodKey(completedAtMillis);
  if (!feeBillingPeriodKey) return null;

  return {
    billingModelSnapshot: model,
    platformFeePercentSnapshot: pct,
    feeBillingPeriodKey,
  };
}

async function resolveApplicationFeeAmount(db, tenantID, amount) {
  if (!tenantID || typeof amount !== "number" || amount <= 0) return 0;

  const snap = await db.collection("tenants").doc(tenantID).get();
  if (!snap.exists) {
    logger.warn("resolveApplicationFeeAmount: tenant not found", { tenantID });
    return 0;
  }
  const tdata = snap.data() || {};
  const model = tdata.billingModel || null;
  if (model !== "per_sale") return 0;

  const pct = Number(tdata.platformFeePercent);
  if (!Number.isFinite(pct) || pct <= 0) return 0;

  let fee = Math.round((amount * pct) / 100);
  // Stripe requires application_fee_amount < amount. Cap at amount - 1 cent
  // as a defensive guard (would only trip with absurd percent settings).
  if (fee >= amount) fee = amount - 1;
  if (fee < 0) fee = 0;
  return fee;
}

// Load a tier doc by ID. Throws not-found if missing; throws failed-
// precondition if archived (when allowArchived=false, the default for
// new-subscription / tier-swap flows). Pass allowArchived=true for read
// paths that need to render historical tier references.
async function getTierDoc(db, tierID, { allowArchived = false } = {}) {
  if (!tierID || typeof tierID !== "string") {
    throw new HttpsError("invalid-argument", "tierID is required.");
  }
  const ref = db.collection(TIER_COLLECTION).doc(tierID);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Tier ${tierID} not found.`);
  }
  const data = snap.data() || {};
  if (!allowArchived && data.archived === true) {
    throw new HttpsError(
      "failed-precondition",
      `Tier ${tierID} is archived. Pick a different tier.`
    );
  }
  if (!allowArchived && data.active !== true) {
    throw new HttpsError(
      "failed-precondition",
      `Tier ${tierID} is not active.`
    );
  }
  if (!data.stripePriceID) {
    throw new HttpsError(
      "failed-precondition",
      `Tier ${tierID} has no stripePriceID — invalid tier doc.`
    );
  }
  return {
    tierID,
    label: data.label || "",
    description: data.description || "",
    stripePriceID: data.stripePriceID,
    monthlyAmount: typeof data.monthlyAmount === "number" ? data.monthlyAmount : 0,
    currency: data.currency || "usd",
    active: data.active === true,
    archived: data.archived === true,
  };
}

// Read the tenant's current subscription gate state. Returns a small,
// stable shape Phase 5 client gating can consume without knowing the
// underlying tenant doc field names. `isWithinGrace` is true ONLY when the
// tenant is past_due AND now < graceUntil — past_due with grace expired
// returns false (which Phase 5 turns into a hard suspend).
function readSubscriptionStatus(tenantData) {
  const status = tenantData.subscriptionStatus || null;
  const graceTs = tenantData.subscriptionGraceUntil;
  const graceUntilMs =
    graceTs && typeof graceTs.toMillis === "function"
      ? graceTs.toMillis()
      : typeof graceTs === "number"
        ? graceTs
        : null;

  const now = Date.now();
  let isWithinGrace = false;
  if (status === "past_due" && graceUntilMs && now < graceUntilMs) {
    isWithinGrace = true;
  }

  return {
    status,
    tierID: tenantData.subscriptionTierID || null,
    priceID: tenantData.stripeSubscriptionPriceID || null,
    subscriptionID: tenantData.stripeSubscriptionID || null,
    graceUntil: graceUntilMs,
    isWithinGrace,
  };
}

async function getSubscriptionStatus(db, tenantID) {
  const { data } = await getTenantOrThrow(db, tenantID);
  return readSubscriptionStatus(data);
}

module.exports = {
  resolveApplicationFeeAmount,
  getTenantOrThrow,
  getTierDoc,
  getSubscriptionStatus,
  readSubscriptionStatus,
  computeFeeBillingPeriodKey,
  resolveSaleFeeSnapshot,
};
