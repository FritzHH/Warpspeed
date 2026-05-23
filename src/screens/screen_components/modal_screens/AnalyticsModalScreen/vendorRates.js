/*eslint-disable*/
/**
 * Vendor rate constants for cost analytics.
 *
 * All rates expressed in cents (USD) to avoid float drift.
 * Source-of-truth: vendor pricing pages, captured 2026-05.
 *
 * If a vendor changes their pricing, update here. Analytics dashboard reads
 * these to project costs from instrumented usage-events.
 *
 * Reconciliation: actual vendor invoices flow into the same Firestore tenant
 * via usage_vendor_totals; the Reconciliation tab compares projected vs actual.
 */

export const VENDOR_RATES = {
  twilio: {
    label: "Twilio SMS",
    smsSegmentCents: 0.79,
    mmsCents: 2.0,
    inboundSegmentCents: 0.75,
    phoneNumberMonthlyCents: 115,
  },
  stripe: {
    label: "Stripe Terminal",
    cardPresentPercent: 0.027,
    cardPresentFixedCents: 5,
    cardOnlinePercent: 0.029,
    cardOnlineFixedCents: 30,
    radarPerTxnCents: 5,
    disputeCents: 1500,
  },
  firestore: {
    label: "Firestore",
    readsPer100kCents: 6,
    writesPer100kCents: 18,
    deletesPer100kCents: 2,
    storedGiBMonthCents: 18,
    networkEgressGiBCents: 12,
  },
  cloudFunctions: {
    label: "Cloud Functions (Gen 2)",
    invocationsPerMillionCents: 40,
    gbSecondCents: 0.000250,
    cpuVCpuSecondCents: 0.001000,
    networkEgressGiBCents: 12,
  },
  cloudStorage: {
    label: "Cloud Storage",
    storedGiBMonthCents: 2.6,
    classAOpsPer10kCents: 5,
    classBOpsPer10kCents: 0.4,
    networkEgressGiBCents: 12,
  },
  translate: {
    label: "Google Translate v2",
    perMillionCharsCents: 2000,
  },
  gmail: {
    label: "Gmail API",
    perCallCents: 0,
    notes: "Free within quota (1B units/day). Costs only via Workspace seats.",
  },
};

/**
 * Cost dimension keys → (rateLookup, vendor) used to project per-event cost.
 * Each row says: "for each unit of dim, charge this many cents."
 */
export const DIMENSION_RATES = {
  twilioSegments:        { vendor: "twilio",        cents: () => VENDOR_RATES.twilio.smsSegmentCents,                       label: "SMS segments sent" },
  twilioInboundSegments: { vendor: "twilio",        cents: () => VENDOR_RATES.twilio.inboundSegmentCents,                   label: "SMS segments received" },
  twilioMms:             { vendor: "twilio",        cents: () => VENDOR_RATES.twilio.mmsCents,                              label: "MMS messages" },
  stripeFeesCents:       { vendor: "stripe",        cents: () => 1,                                                          label: "Stripe fees (already cents)" },
  firestoreReads:        { vendor: "firestore",     cents: () => VENDOR_RATES.firestore.readsPer100kCents / 100000,         label: "Firestore reads" },
  firestoreWrites:       { vendor: "firestore",     cents: () => VENDOR_RATES.firestore.writesPer100kCents / 100000,        label: "Firestore writes" },
  firestoreDeletes:      { vendor: "firestore",     cents: () => VENDOR_RATES.firestore.deletesPer100kCents / 100000,       label: "Firestore deletes" },
  cloudFunctionInvocations: { vendor: "cloudFunctions", cents: () => VENDOR_RATES.cloudFunctions.invocationsPerMillionCents / 1000000, label: "Function invocations" },
  cloudFunctionGbSeconds:   { vendor: "cloudFunctions", cents: () => VENDOR_RATES.cloudFunctions.gbSecondCents,             label: "Function GB-sec" },
  translateCharacters:   { vendor: "translate",     cents: () => VENDOR_RATES.translate.perMillionCharsCents / 1000000,     label: "Translate characters" },
  translateApiCalls:     { vendor: "translate",     cents: () => 0,                                                          label: "Translate API calls (charged by chars)" },
  gmailApiCalls:         { vendor: "gmail",         cents: () => VENDOR_RATES.gmail.perCallCents,                            label: "Gmail API calls" },
  gmailMessagesSent:     { vendor: "gmail",         cents: () => 0,                                                          label: "Gmail messages sent (free in quota)" },
  pdfBytes:              { vendor: "cloudStorage",  cents: () => 0,                                                          label: "PDF bytes (counted via Storage egress separately)" },
};

/**
 * Estimated Cloud Function runtime cost per event (a usage-event tracker.finish()
 * always writes 1 Firestore doc, plus a structured log line).
 *
 * Currently we count the analytics' own writes here. If we add per-event log
 * volume to GCP billing, update.
 */
export const ANALYTICS_PER_EVENT_CENTS = (() => {
  const fsWrite = VENDOR_RATES.firestore.writesPer100kCents / 100000;
  return fsWrite;
})();

/**
 * Estimated daily scheduler cost (pullVendorTotals + reconcileUsageEvents).
 * Conservative — adjust if scheduler reads grow.
 */
export const ANALYTICS_SCHEDULER_DAILY_CENTS = (() => {
  const fsReadsPerDay = 200;
  const fsWritesPerDay = 50;
  const invocations = 2;
  const gbSec = 0.5;
  const readCost  = fsReadsPerDay  * (VENDOR_RATES.firestore.readsPer100kCents  / 100000);
  const writeCost = fsWritesPerDay * (VENDOR_RATES.firestore.writesPer100kCents / 100000);
  const invCost   = invocations    * (VENDOR_RATES.cloudFunctions.invocationsPerMillionCents / 1000000);
  const gbCost    = gbSec          * VENDOR_RATES.cloudFunctions.gbSecondCents;
  return readCost + writeCost + invCost + gbCost;
})();

/**
 * Convert cents to display dollars (with 4-decimal precision for tiny amounts).
 */
export function centsToDisplay(cents, opts = {}) {
  if (cents == null || isNaN(cents)) return "$0.00";
  const abs = Math.abs(cents);
  let dollars;
  if (abs < 1)        dollars = (cents / 100).toFixed(4);
  else if (abs < 100) dollars = (cents / 100).toFixed(3);
  else                dollars = (cents / 100).toFixed(2);
  if (opts.signed && cents > 0) return "+$" + dollars;
  if (cents < 0)                return "-$" + dollars.replace("-", "");
  return "$" + dollars;
}
