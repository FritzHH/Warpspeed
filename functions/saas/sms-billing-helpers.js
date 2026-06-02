/* eslint-disable */
// Shared helpers for SMS per-text billing.
//
// Billing model: every billable SMS (inbound + outbound terminal) is stamped
// with `Math.abs(twilioPriceUsd) * 100 * smsMarkupMultiplier` rounded to cents.
// Default multiplier `1.05` lives at `platform-billing/config.smsMarkupMultiplier`;
// per-tenant override at `tenants/{tid}.smsMarkupMultiplierOverride`. Both
// reads fall back to DEFAULT_SMS_MARKUP_MULTIPLIER (1.05) on miss.
//
// Period keys match the per-sale invoicer's semi-monthly buckets
// ("YYYY-MM-1H" / "YYYY-MM-2H", America/Chicago) so the existing invoicer
// can range-query SMS stamps alongside per-sale fees in the same query
// cadence regardless of tenant billing model.
//
// Stamps live at `tenants/{tid}/sms-billing-stamps/{messageSid}` — keyed
// by Twilio MessageSid for idempotency (one Twilio message = one stamp,
// regardless of how many webhook callbacks fire).

const { logger } = require("firebase-functions");
const { computeFeeBillingPeriodKey } = require("./billing-helpers");

const DEFAULT_SMS_MARKUP_MULTIPLIER = 1.05;
const PLATFORM_BILLING_CONFIG_DOC = "config";
const PLATFORM_BILLING_COLLECTION = "platform-billing";
const STAMPS_SUBCOLLECTION = "sms-billing-stamps";

// Read the effective SMS markup multiplier for a tenant. Returns the
// tenant's override if present and valid, otherwise the platform default,
// otherwise the hardcoded DEFAULT_SMS_MARKUP_MULTIPLIER.
async function resolveSmsMarkupMultiplier(db, tenantID) {
  let override = null;
  if (tenantID) {
    try {
      const snap = await db.collection("tenants").doc(tenantID).get();
      if (snap.exists) {
        const v = Number(snap.data()?.smsMarkupMultiplierOverride);
        if (Number.isFinite(v) && v > 0) override = v;
      }
    } catch (err) {
      logger.warn("resolveSmsMarkupMultiplier: tenant read failed", {
        tenantID,
        error: err && err.message,
      });
    }
  }
  if (override !== null) return override;

  try {
    const cfg = await db
      .collection(PLATFORM_BILLING_COLLECTION)
      .doc(PLATFORM_BILLING_CONFIG_DOC)
      .get();
    if (cfg.exists) {
      const v = Number(cfg.data()?.smsMarkupMultiplier);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch (err) {
    logger.warn("resolveSmsMarkupMultiplier: platform read failed", {
      error: err && err.message,
    });
  }
  return DEFAULT_SMS_MARKUP_MULTIPLIER;
}

// Convert Twilio Price (negative USD string, e.g. "-0.0075") to positive
// cents. Returns 0 if the price is missing/invalid — caller decides whether
// to skip stamping (no cost) or write a zero-billed stamp for audit.
function twilioPriceToCents(priceStr) {
  if (priceStr === null || priceStr === undefined || priceStr === "") return 0;
  const n = Math.abs(Number(priceStr));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 * 1000) / 1000;
}

// Apply markup to the raw Twilio cost. Inputs are in fractional cents
// (twilioPriceToCents may return 0.75 for a $0.0075 message); the markup'd
// value is rounded to whole cents at the boundary.
function computeBilledCents(twilioCostFractionalCents, markupMultiplier) {
  if (!Number.isFinite(twilioCostFractionalCents) || twilioCostFractionalCents <= 0) {
    return 0;
  }
  const mult = Number.isFinite(markupMultiplier) && markupMultiplier > 0
    ? markupMultiplier
    : DEFAULT_SMS_MARKUP_MULTIPLIER;
  return Math.round(twilioCostFractionalCents * mult);
}

// Hook for the future SMS inbound spam-flagging filter. Returns
// `{ bill: true }` by default — bill every inbound message. The filter
// layer (rate caps, sender reputation, etc.) is deferred per
// project-sms-inbound-spam-flagging.md; this stub lets us wire the call
// site now so we don't have to retrofit the stamper later.
function shouldBillInbound(_envelope) {
  return { bill: true };
}

// Reference path builder for the stamps subcollection. Used by both the
// stamper (writes) and the invoicer (range-queries).
function smsStampDocRef(db, tenantID, messageSid) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection(STAMPS_SUBCOLLECTION)
    .doc(messageSid);
}

function smsStampCol(db, tenantID) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection(STAMPS_SUBCOLLECTION);
}

// Enumerate billable SMS stamps for a tenant within a billing period.
// Filters to `billed == true` so unbilled (spam-filtered, zero-cost) stamps
// don't pollute the period totals. Stamps marked `duringSuspension == true`
// are still returned — the caller decides whether to include them (the
// invoicer ignores them since the tenant isn't being charged during grace).
async function enumerateSmsBillingStampsForTenant(db, tenantID, periodKey) {
  if (!tenantID || !periodKey) return [];
  const snap = await smsStampCol(db, tenantID)
    .where("smsBillingPeriodKey", "==", periodKey)
    .where("billed", "==", true)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Aggregate stamps into invoice-ready totals. Excludes stamps marked
// `duringSuspension == true` from the billable total (we don't charge
// during the 30-day grace window) but keeps them in `suspendedCount` for
// auditing.
function computeSmsPeriodTotals(stamps) {
  let billedStampCount = 0;
  let suspendedCount = 0;
  let inboundCount = 0;
  let outboundCount = 0;
  let totalSmsCents = 0;
  let twilioCostFractionalCents = 0;
  for (const s of stamps || []) {
    if (s.duringSuspension === true) {
      suspendedCount += 1;
      continue;
    }
    billedStampCount += 1;
    if (s.direction === "inbound") inboundCount += 1;
    else if (s.direction === "outbound") outboundCount += 1;
    totalSmsCents += Number(s.billedCents) || 0;
    twilioCostFractionalCents += Number(s.twilioCostFractionalCents) || 0;
  }
  return {
    billedStampCount,
    suspendedCount,
    inboundCount,
    outboundCount,
    totalSmsCents,
    twilioCostCents: Math.round(twilioCostFractionalCents),
  };
}

module.exports = {
  DEFAULT_SMS_MARKUP_MULTIPLIER,
  PLATFORM_BILLING_COLLECTION,
  PLATFORM_BILLING_CONFIG_DOC,
  STAMPS_SUBCOLLECTION,
  resolveSmsMarkupMultiplier,
  twilioPriceToCents,
  computeBilledCents,
  shouldBillInbound,
  smsStampDocRef,
  smsStampCol,
  enumerateSmsBillingStampsForTenant,
  computeSmsPeriodTotals,
  // Re-export so callers don't need to also pull from billing-helpers.
  computeFeeBillingPeriodKey,
};
