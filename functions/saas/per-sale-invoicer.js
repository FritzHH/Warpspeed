/* eslint-disable */
// Semi-monthly per_sale invoicer.
//
// Runs at 01:00 America/Chicago on the 1st and 16th of each month. The
// 1st-of-month run bills the prior month's 2H period (16th-EOM); the
// 16th-of-month run bills the current month's 1H period (1st-15th).
// Each run iterates all per_sale tenants, sums fees from completed-sales
// keyed by feeBillingPeriodKey, applies the monthly floor, and creates a
// one-off Stripe invoice on the platform account using the tenant's
// saved default payment method.
//
// Idempotency: a single `platform-billing-periods/{tenantID}_{periodKey}` doc is
// atomically claimed at the start of per-tenant processing. Re-runs skip
// tenants already at status "complete". Manual replay can pass
// `force: true` (super-admin only) to bypass the skip check.
//
// Monthly floor: $10/month. The 1H run bills computed (no floor); the
// 2H run looks up the same month's 1H billed amount and tops up so the
// monthly total reaches $10. A tenant who billed $7 in 1H and computes
// $0 in 2H pays $3 in 2H; one who billed $0 in 1H and $0 in 2H pays $10
// in the 2H run. Adjust FLOOR_CENTS_PER_MONTH below to change.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");

const {
  enumeratePeriodSalesForTenant,
  computePeriodFeeCents,
} = require("./per-sale-accumulation");
const {
  enumerateSmsBillingStampsForTenant,
  computeSmsPeriodTotals,
} = require("./sms-billing-helpers");
const { assertPlatformAdmin } = require("./auth-guards");

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");

if (!admin.apps.length) admin.initializeApp();

const FLOOR_CENTS_PER_MONTH = 1000;
const BILLING_PERIODS_COLLECTION = "platform-billing-periods";

// ─── Period selection ────────────────────────────────────────────────────────

// Given "now" (in millis), pick the period to bill. Day >= 16 → bill this
// month's 1H (just closed today). Day 1-15 → bill prior month's 2H. Cron
// fires at 1AM on the 1st and 16th, so the picker is robust to either
// firing date and gives the same answer on a manual same-day re-run.
function pickPeriodToBillFromNow(nowMs, timeZone = "America/Chicago") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  let year = "";
  let month = "";
  let day = "";
  for (const p of parts) {
    if (p.type === "year") year = p.value;
    else if (p.type === "month") month = p.value;
    else if (p.type === "day") day = p.value;
  }
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum) || !Number.isFinite(dayNum)) {
    return null;
  }

  if (dayNum >= 16) {
    return `${year}-${month}-1H`;
  }
  const prevMonth = monthNum === 1 ? 12 : monthNum - 1;
  const prevYear = monthNum === 1 ? yearNum - 1 : yearNum;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-2H`;
}

// "2026-01-1H" → "Jan 1–15, 2026"; "2026-01-2H" → "Jan 16–31, 2026"
function formatPeriodLabel(periodKey) {
  const m = periodKey && periodKey.match(/^(\d{4})-(\d{2})-(1H|2H)$/);
  if (!m) return periodKey || "";
  const year = m[1];
  const monthNum = parseInt(m[2], 10);
  const half = m[3];
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthLabel = monthNames[monthNum - 1] || m[2];
  if (half === "1H") return `${monthLabel} 1–15, ${year}`;
  // 2H end-day = last day of the month
  const endDay = new Date(Date.UTC(parseInt(year, 10), monthNum, 0)).getUTCDate();
  return `${monthLabel} 16–${endDay}, ${year}`;
}

// ─── Floor logic ─────────────────────────────────────────────────────────────

async function lookupFirstHalfBilledCents(db, tenantID, periodKey) {
  const half = periodKey.slice(-2);
  if (half !== "2H") return 0;
  const yearMonth = periodKey.slice(0, 7);
  const firstHalfKey = `${yearMonth}-1H`;
  const docID = `${tenantID}_${firstHalfKey}`;
  const snap = await db.collection(BILLING_PERIODS_COLLECTION).doc(docID).get();
  if (!snap.exists) return 0;
  const data = snap.data() || {};
  return Number(data.billedCents) || 0;
}

function applyMonthlyFloor({ periodKey, computedFeeCents, firstHalfBilledCents }) {
  const half = periodKey.slice(-2);
  if (half === "1H") {
    return { billedCents: computedFeeCents, floorTopUpCents: 0 };
  }
  const monthlyTotal = firstHalfBilledCents + computedFeeCents;
  if (monthlyTotal >= FLOOR_CENTS_PER_MONTH) {
    return { billedCents: computedFeeCents, floorTopUpCents: 0 };
  }
  const floorTopUpCents = FLOOR_CENTS_PER_MONTH - monthlyTotal;
  return {
    billedCents: computedFeeCents + floorTopUpCents,
    floorTopUpCents,
  };
}

// ─── Per-tenant invoice ──────────────────────────────────────────────────────

// Atomically claim the period for this tenant. Returns {claimed: bool,
// existingStatus, existingData}. Caller skips if !claimed unless force.
async function claimPeriodForTenant(db, tenantID, periodKey, force) {
  const docID = `${tenantID}_${periodKey}`;
  const ref = db.collection(BILLING_PERIODS_COLLECTION).doc(docID);
  return await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (snap.exists) {
      const existingData = snap.data() || {};
      const existingStatus = existingData.status;
      if (existingStatus === "complete" && !force) {
        return { claimed: false, existingStatus, existingData };
      }
      // Re-claim (processing-stuck or force replay)
      txn.update(ref, {
        status: "processing",
        retryAt: FieldValue.serverTimestamp(),
      });
      return { claimed: true, existingStatus, existingData };
    }
    txn.set(ref, {
      tenantID,
      periodKey,
      status: "processing",
      startedAt: FieldValue.serverTimestamp(),
    });
    return { claimed: true, existingStatus: null, existingData: null };
  });
}

// Aggregate line items by store so the Stripe invoice carries one line
// per store (audit + tenant clarity), rather than hundreds of per-sale
// items. Returns Array<{storeID, saleCount, baseCents, feeCents}>.
function aggregateLineItemsByStore(lineItems) {
  const byStore = new Map();
  for (const li of lineItems) {
    const key = li.storeID || "(no-store)";
    if (!byStore.has(key)) {
      byStore.set(key, { storeID: key, saleCount: 0, baseCents: 0, feeCents: 0 });
    }
    const agg = byStore.get(key);
    agg.saleCount += 1;
    agg.baseCents += li.baseCents;
    agg.feeCents += li.feeCents;
  }
  return Array.from(byStore.values()).sort((a, b) =>
    a.storeID < b.storeID ? -1 : 1
  );
}

async function createStripeInvoiceForTenant({
  stripe,
  tenantID,
  customerID,
  periodKey,
  periodLabel,
  perStoreLines,
  floorTopUpCents,
  smsLineCents,
  smsTotals,
  billedCents,
}) {
  if (billedCents <= 0) return null;

  for (const agg of perStoreLines) {
    if (agg.feeCents <= 0) continue;
    await stripe.invoiceItems.create({
      customer: customerID,
      amount: agg.feeCents,
      currency: "usd",
      description: `Per-sale fees — store ${agg.storeID} — ${periodLabel} (${agg.saleCount} sales, base $${(agg.baseCents / 100).toFixed(2)})`,
      metadata: {
        tenantID,
        periodKey,
        storeID: agg.storeID,
        kind: "per_store_fees",
      },
    });
  }

  if (smsLineCents > 0) {
    const ob = smsTotals ? smsTotals.outboundCount : 0;
    const ib = smsTotals ? smsTotals.inboundCount : 0;
    await stripe.invoiceItems.create({
      customer: customerID,
      amount: smsLineCents,
      currency: "usd",
      description: `SMS messaging — ${periodLabel} (${ob} outbound, ${ib} inbound)`,
      metadata: {
        tenantID,
        periodKey,
        kind: "sms_per_text",
        outboundCount: String(ob),
        inboundCount: String(ib),
      },
    });
  }

  if (floorTopUpCents > 0) {
    await stripe.invoiceItems.create({
      customer: customerID,
      amount: floorTopUpCents,
      currency: "usd",
      description: `Monthly minimum fee adjustment — ${periodLabel}`,
      metadata: { tenantID, periodKey, kind: "monthly_floor_topup" },
    });
  }

  const invoice = await stripe.invoices.create({
    customer: customerID,
    collection_method: "charge_automatically",
    auto_advance: false,
    description: `Cadence POS — ${periodLabel}`,
    metadata: {
      tenantID,
      periodKey,
      source: "per_sale_accumulation",
    },
  });

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  return finalized;
}

async function invoiceTenantForPeriod({
  db,
  stripe,
  tenantID,
  tenantData,
  periodKey,
  dryRun,
  force,
}) {
  const customerID = tenantData.stripeBillingCustomerID || null;
  const periodLabel = formatPeriodLabel(periodKey);

  // Claim period (or skip)
  const claim = await claimPeriodForTenant(db, tenantID, periodKey, !!force);
  if (!claim.claimed) {
    return {
      tenantID,
      status: "skipped_already_complete",
      existingBilledCents: claim.existingData?.billedCents || 0,
    };
  }

  const docID = `${tenantID}_${periodKey}`;
  const ref = db.collection(BILLING_PERIODS_COLLECTION).doc(docID);

  try {
    // Enumerate + compute (per-sale fees + SMS stamps in parallel)
    const [sales, smsStamps] = await Promise.all([
      enumeratePeriodSalesForTenant(db, tenantID, periodKey),
      enumerateSmsBillingStampsForTenant(db, tenantID, periodKey),
    ]);
    const { baseRevenueCents, computedFeeCents, lineItems } =
      computePeriodFeeCents({ sales });
    const smsTotals = computeSmsPeriodTotals(smsStamps);
    const smsLineCents = smsTotals.totalSmsCents;

    // Floor applies to per-sale fees + SMS combined (monthly minimum is a
    // tenant-level floor, not per-revenue-stream).
    const firstHalfBilledCents = await lookupFirstHalfBilledCents(
      db,
      tenantID,
      periodKey
    );
    const { billedCents: feesPlusSmsCents, floorTopUpCents } = applyMonthlyFloor({
      periodKey,
      computedFeeCents: computedFeeCents + smsLineCents,
      firstHalfBilledCents,
    });
    const billedCents = feesPlusSmsCents;

    const perStoreLines = aggregateLineItemsByStore(lineItems);

    if (dryRun) {
      await ref.update({
        status: "dry_run",
        baseRevenueCents,
        computedFeeCents,
        smsLineCents,
        smsStampCount: smsTotals.billedStampCount,
        smsOutboundCount: smsTotals.outboundCount,
        smsInboundCount: smsTotals.inboundCount,
        flooredFeeCents: billedCents,
        floorTopUpCents,
        firstHalfBilledCents,
        billedCents: 0,
        invoiceID: null,
        saleCount: lineItems.length,
        perStoreLines,
        completedAt: FieldValue.serverTimestamp(),
      });
      return {
        tenantID,
        status: "dry_run",
        baseRevenueCents,
        computedFeeCents,
        smsLineCents,
        billedCents,
        saleCount: lineItems.length,
      };
    }

    if (!customerID) {
      await ref.update({
        status: "skipped_no_customer",
        baseRevenueCents,
        computedFeeCents,
        smsLineCents,
        smsStampCount: smsTotals.billedStampCount,
        flooredFeeCents: billedCents,
        billedCents: 0,
        saleCount: lineItems.length,
        completedAt: FieldValue.serverTimestamp(),
        error: "Tenant has no stripeBillingCustomerID — no card on file.",
      });
      return { tenantID, status: "skipped_no_customer" };
    }

    let invoice = null;
    try {
      invoice = await createStripeInvoiceForTenant({
        stripe,
        tenantID,
        customerID,
        periodKey,
        periodLabel,
        perStoreLines,
        floorTopUpCents,
        smsLineCents,
        smsTotals,
        billedCents,
      });
    } catch (stripeErr) {
      await ref.update({
        status: "failed",
        baseRevenueCents,
        computedFeeCents,
        smsLineCents,
        smsStampCount: smsTotals.billedStampCount,
        flooredFeeCents: billedCents,
        floorTopUpCents,
        firstHalfBilledCents,
        billedCents: 0,
        invoiceID: null,
        saleCount: lineItems.length,
        perStoreLines,
        completedAt: FieldValue.serverTimestamp(),
        error: stripeErr && stripeErr.message,
      });
      logger.error("invoiceTenantForPeriod: Stripe failed", {
        tenantID,
        periodKey,
        error: stripeErr && stripeErr.message,
      });
      return { tenantID, status: "failed", error: stripeErr && stripeErr.message };
    }

    await ref.update({
      status: "complete",
      baseRevenueCents,
      computedFeeCents,
      smsLineCents,
      smsStampCount: smsTotals.billedStampCount,
      smsOutboundCount: smsTotals.outboundCount,
      smsInboundCount: smsTotals.inboundCount,
      flooredFeeCents: billedCents,
      floorTopUpCents,
      firstHalfBilledCents,
      billedCents,
      invoiceID: invoice ? invoice.id : null,
      saleCount: lineItems.length,
      perStoreLines,
      completedAt: FieldValue.serverTimestamp(),
    });

    logger.info("invoiceTenantForPeriod: billed", {
      tenantID,
      periodKey,
      billedCents,
      smsLineCents,
      invoiceID: invoice ? invoice.id : null,
      saleCount: lineItems.length,
    });

    return {
      tenantID,
      status: "complete",
      baseRevenueCents,
      computedFeeCents,
      smsLineCents,
      billedCents,
      invoiceID: invoice ? invoice.id : null,
      saleCount: lineItems.length,
    };
  } catch (err) {
    await ref.update({
      status: "failed",
      completedAt: FieldValue.serverTimestamp(),
      error: err && err.message,
    });
    logger.error("invoiceTenantForPeriod: failed", {
      tenantID,
      periodKey,
      error: err && err.message,
    });
    return { tenantID, status: "failed", error: err && err.message };
  }
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

async function listPerSaleTenants(db) {
  const snap = await db
    .collection("tenants")
    .where("billingModel", "==", "per_sale")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function runInvoicerForPeriod({ db, stripe, periodKey, dryRun, force }) {
  if (!periodKey) {
    throw new Error("runInvoicerForPeriod: periodKey is required.");
  }
  const tenants = await listPerSaleTenants(db);
  logger.info("runInvoicerForPeriod: starting", {
    periodKey,
    tenantCount: tenants.length,
    dryRun: !!dryRun,
    force: !!force,
  });

  const results = [];
  for (const t of tenants) {
    const r = await invoiceTenantForPeriod({
      db,
      stripe,
      tenantID: t.id,
      tenantData: t,
      periodKey,
      dryRun: !!dryRun,
      force: !!force,
    });
    results.push(r);
  }

  const summary = {
    periodKey,
    tenantCount: tenants.length,
    completeCount: results.filter((r) => r.status === "complete").length,
    skippedCount: results.filter((r) => r.status?.startsWith("skipped")).length,
    failedCount: results.filter((r) => r.status === "failed").length,
    dryRunCount: results.filter((r) => r.status === "dry_run").length,
    totalBilledCents: results.reduce(
      (a, r) => a + (Number(r.billedCents) || 0),
      0
    ),
  };

  logger.info("runInvoicerForPeriod: done", summary);
  return { summary, results };
}

// ─── Entry points ────────────────────────────────────────────────────────────

exports.runPerSaleInvoicerScheduledFn = onSchedule(
  {
    schedule: "0 1 1,16 * *",
    timeZone: "America/Chicago",
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const periodKey = pickPeriodToBillFromNow(Date.now());
    if (!periodKey) {
      logger.error("runPerSaleInvoicerScheduledFn: could not derive periodKey");
      return;
    }
    const stripe = Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
    await runInvoicerForPeriod({
      db: admin.firestore(),
      stripe,
      periodKey,
      dryRun: false,
      force: false,
    });
  }
);

// Manual replay / dry-run. Super-admin only. Pass periodKey to target a
// specific period; pass dryRun to compute without invoicing; pass force
// to override the "already complete" idempotency skip (used when fixing
// a bad run — the prior platform-billing-periods doc is overwritten).
exports.runPerSaleInvoicerManualCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    assertPlatformAdmin(request.auth);
    const periodKey =
      (request.data && request.data.periodKey) ||
      pickPeriodToBillFromNow(Date.now());
    if (!periodKey) {
      throw new HttpsError("invalid-argument", "Could not derive periodKey.");
    }
    const dryRun = !!(request.data && request.data.dryRun);
    const force = !!(request.data && request.data.force);
    const stripe = Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
    return await runInvoicerForPeriod({
      db: admin.firestore(),
      stripe,
      periodKey,
      dryRun,
      force,
    });
  }
);

exports._internals = {
  pickPeriodToBillFromNow,
  formatPeriodLabel,
  applyMonthlyFloor,
  aggregateLineItemsByStore,
  FLOOR_CENTS_PER_MONTH,
};
