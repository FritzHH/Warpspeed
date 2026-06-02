/* eslint-disable */
// Semi-monthly SMS-only invoicer for monthly_sub tenants.
//
// monthly_sub tenants pay $50/mo via Stripe Subscription. SMS is billed
// per-text on top (no included volume per locked decisions in
// project-saas-billing-model-locked.md). This invoicer iterates monthly_sub
// tenants on the same 1st/16th cadence as the per_sale invoicer, sums
// SMS stamps for the closed period, and creates a one-off Stripe invoice
// with a single SMS line item. No monthly floor — the $50 subscription
// already covers that.
//
// Idempotency: platform-billing-periods doc keyed `{tenantID}_{periodKey}_sms` so
// it doesn't collide with per_sale invoicer claims (which use
// `{tenantID}_{periodKey}`). Per-sale tenants get SMS bundled into their
// existing invoice and never enter this code path.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");

const {
  enumerateSmsBillingStampsForTenant,
  computeSmsPeriodTotals,
} = require("./sms-billing-helpers");
const { assertPlatformAdmin } = require("./auth-guards");

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");

if (!admin.apps.length) admin.initializeApp();

const BILLING_PERIODS_COLLECTION = "platform-billing-periods";

// ─── Period picker — mirrors per-sale-invoicer for the same cadence ────────

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
  const endDay = new Date(Date.UTC(parseInt(year, 10), monthNum, 0)).getUTCDate();
  return `${monthLabel} 16–${endDay}, ${year}`;
}

// ─── Per-tenant SMS invoice ─────────────────────────────────────────────────

async function claimSmsPeriodForTenant(db, tenantID, periodKey, force) {
  const docID = `${tenantID}_${periodKey}_sms`;
  const ref = db.collection(BILLING_PERIODS_COLLECTION).doc(docID);
  return await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (snap.exists) {
      const existingData = snap.data() || {};
      const existingStatus = existingData.status;
      if (existingStatus === "complete" && !force) {
        return { claimed: false, existingStatus, existingData };
      }
      txn.update(ref, {
        status: "processing",
        retryAt: FieldValue.serverTimestamp(),
      });
      return { claimed: true, existingStatus, existingData };
    }
    txn.set(ref, {
      tenantID,
      periodKey,
      kind: "sms_per_text",
      status: "processing",
      startedAt: FieldValue.serverTimestamp(),
    });
    return { claimed: true, existingStatus: null, existingData: null };
  });
}

async function createSmsInvoiceForTenant({
  stripe,
  tenantID,
  customerID,
  periodKey,
  periodLabel,
  smsTotals,
  billedCents,
}) {
  if (billedCents <= 0) return null;
  await stripe.invoiceItems.create({
    customer: customerID,
    amount: billedCents,
    currency: "usd",
    description: `SMS messaging — ${periodLabel} (${smsTotals.outboundCount} outbound, ${smsTotals.inboundCount} inbound)`,
    metadata: {
      tenantID,
      periodKey,
      kind: "sms_per_text",
      outboundCount: String(smsTotals.outboundCount),
      inboundCount: String(smsTotals.inboundCount),
    },
  });

  const invoice = await stripe.invoices.create({
    customer: customerID,
    collection_method: "charge_automatically",
    auto_advance: false,
    description: `Cadence POS SMS — ${periodLabel}`,
    metadata: {
      tenantID,
      periodKey,
      source: "sms_per_text",
    },
  });
  return await stripe.invoices.finalizeInvoice(invoice.id);
}

async function invoiceSmsForTenantForPeriod({
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

  const claim = await claimSmsPeriodForTenant(db, tenantID, periodKey, !!force);
  if (!claim.claimed) {
    return {
      tenantID,
      status: "skipped_already_complete",
      existingBilledCents: claim.existingData?.billedCents || 0,
    };
  }

  const docID = `${tenantID}_${periodKey}_sms`;
  const ref = db.collection(BILLING_PERIODS_COLLECTION).doc(docID);

  try {
    const stamps = await enumerateSmsBillingStampsForTenant(db, tenantID, periodKey);
    const smsTotals = computeSmsPeriodTotals(stamps);
    const billedCents = smsTotals.totalSmsCents;

    if (dryRun) {
      await ref.update({
        status: "dry_run",
        smsStampCount: smsTotals.billedStampCount,
        smsOutboundCount: smsTotals.outboundCount,
        smsInboundCount: smsTotals.inboundCount,
        computedSmsCents: billedCents,
        billedCents: 0,
        invoiceID: null,
        completedAt: FieldValue.serverTimestamp(),
      });
      return { tenantID, status: "dry_run", billedCents, smsTotals };
    }

    if (billedCents <= 0) {
      await ref.update({
        status: "skipped_zero",
        smsStampCount: smsTotals.billedStampCount,
        computedSmsCents: 0,
        billedCents: 0,
        completedAt: FieldValue.serverTimestamp(),
      });
      return { tenantID, status: "skipped_zero" };
    }

    if (!customerID) {
      await ref.update({
        status: "skipped_no_customer",
        smsStampCount: smsTotals.billedStampCount,
        computedSmsCents: billedCents,
        billedCents: 0,
        completedAt: FieldValue.serverTimestamp(),
        error: "Tenant has no stripeBillingCustomerID — no card on file.",
      });
      return { tenantID, status: "skipped_no_customer" };
    }

    let invoice = null;
    try {
      invoice = await createSmsInvoiceForTenant({
        stripe,
        tenantID,
        customerID,
        periodKey,
        periodLabel,
        smsTotals,
        billedCents,
      });
    } catch (stripeErr) {
      await ref.update({
        status: "failed",
        smsStampCount: smsTotals.billedStampCount,
        computedSmsCents: billedCents,
        billedCents: 0,
        invoiceID: null,
        completedAt: FieldValue.serverTimestamp(),
        error: stripeErr && stripeErr.message,
      });
      logger.error("invoiceSmsForTenantForPeriod: Stripe failed", {
        tenantID,
        periodKey,
        error: stripeErr && stripeErr.message,
      });
      return { tenantID, status: "failed", error: stripeErr && stripeErr.message };
    }

    await ref.update({
      status: "complete",
      smsStampCount: smsTotals.billedStampCount,
      smsOutboundCount: smsTotals.outboundCount,
      smsInboundCount: smsTotals.inboundCount,
      computedSmsCents: billedCents,
      billedCents,
      invoiceID: invoice ? invoice.id : null,
      completedAt: FieldValue.serverTimestamp(),
    });

    logger.info("invoiceSmsForTenantForPeriod: billed", {
      tenantID,
      periodKey,
      billedCents,
      invoiceID: invoice ? invoice.id : null,
    });

    return {
      tenantID,
      status: "complete",
      billedCents,
      invoiceID: invoice ? invoice.id : null,
      smsTotals,
    };
  } catch (err) {
    await ref.update({
      status: "failed",
      completedAt: FieldValue.serverTimestamp(),
      error: err && err.message,
    });
    logger.error("invoiceSmsForTenantForPeriod: failed", {
      tenantID,
      periodKey,
      error: err && err.message,
    });
    return { tenantID, status: "failed", error: err && err.message };
  }
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

async function listMonthlySubTenants(db) {
  const snap = await db
    .collection("tenants")
    .where("billingModel", "==", "monthly_sub")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function runSmsInvoicerForPeriod({ db, stripe, periodKey, dryRun, force }) {
  if (!periodKey) {
    throw new Error("runSmsInvoicerForPeriod: periodKey is required.");
  }
  const tenants = await listMonthlySubTenants(db);
  logger.info("runSmsInvoicerForPeriod: starting", {
    periodKey,
    tenantCount: tenants.length,
    dryRun: !!dryRun,
    force: !!force,
  });

  const results = [];
  for (const t of tenants) {
    const r = await invoiceSmsForTenantForPeriod({
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

  logger.info("runSmsInvoicerForPeriod: done", summary);
  return { summary, results };
}

// ─── Entry points ────────────────────────────────────────────────────────────

exports.runSmsInvoicerScheduledFn = onSchedule(
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
      logger.error("runSmsInvoicerScheduledFn: could not derive periodKey");
      return;
    }
    const stripe = Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
    await runSmsInvoicerForPeriod({
      db: admin.firestore(),
      stripe,
      periodKey,
      dryRun: false,
      force: false,
    });
  }
);

exports.runSmsInvoicerManualCallable = onCall(
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
    return await runSmsInvoicerForPeriod({
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
  listMonthlySubTenants,
  invoiceSmsForTenantForPeriod,
};
