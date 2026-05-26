/* eslint-disable */
/**
 * Vendor Totals + Reconciliation
 *
 * Two scheduled functions:
 *   1. pullVendorTotals     — Daily at 02:00 PT. Calls each vendor's billing
 *                              API and writes per-day totals to Firestore.
 *   2. reconcileUsageEvents — Daily at 03:00 PT (after totals are pulled).
 *                              Sums instrumented dimensions for the day from
 *                              usage-events, compares to vendor totals, writes
 *                              deltas. Flags when delta > 20%.
 *
 * Skeleton lives here. API calls themselves are TODOs guarded behind feature
 * flags — most vendors require account setup or service-account credentials
 * that are not yet in place (Stripe especially).
 *
 * Firestore layout:
 *   tenants/{tenantID}/stores/{storeID}/usage-daily-totals/{yyyy-mm-dd}
 *     - vendor: "twilio" | "stripe" | "gcp" | "gmail" | "translate"
 *     - day, ts, dimensions: { ... }
 *   tenants/{tenantID}/stores/{storeID}/usage-reconciliation/{yyyy-mm-dd}
 *     - day, ts, perVendor: { vendor: { instrumented, vendor, deltaPct, flagged } }
 */

const { logger } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const twilio = require("twilio");
const { withFeatureTrackingSchedule } = require("./usageTracking");

// SaaS deploy gates Twilio reconciliation. Bonita has no `private/twilio`
// subaccount docs, so the puller would early-return there anyway — but
// pinning the secret-manager project ID here keeps Bonita deploys from
// even constructing a (futile) reference.
const SAAS_PROJECT_ID = "cadence-pos";
function isSaasDeploy() {
  const id = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  return id === SAAS_PROJECT_ID;
}

let _secretsClient = null;
function secretsClient() {
  if (!_secretsClient) _secretsClient = new SecretManagerServiceClient();
  return _secretsClient;
}

async function loadSubaccountAuthToken(tenantID) {
  const name = `projects/${SAAS_PROJECT_ID}/secrets/twilio-subaccount-${tenantID}/versions/latest`;
  const [version] = await secretsClient().accessSecretVersion({ name });
  if (!version || !version.payload || !version.payload.data) {
    throw new Error(`No secret version for tenant ${tenantID}.`);
  }
  return version.payload.data.toString("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Named admin app (matches usageTracking.js — analytics writes are isolated
// from the default app's service-account-creds initialization)
// ─────────────────────────────────────────────────────────────────────────────
let _analyticsApp = null;
function getAnalyticsApp() {
  if (_analyticsApp) return _analyticsApp;
  const existing = admin.apps.find((a) => a && a.name === "analytics");
  if (existing) {
    _analyticsApp = existing;
    return _analyticsApp;
  }
  _analyticsApp = admin.initializeApp({}, "analytics");
  return _analyticsApp;
}

function getDB() {
  return getAnalyticsApp().firestore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function ymd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

async function forEachStore(db, fn) {
  const tenants = await db.collection("tenants").get();
  for (const tDoc of tenants.docs) {
    const stores = await tDoc.ref.collection("stores").get();
    for (const sDoc of stores.docs) {
      await fn(tDoc.id, sDoc.id, sDoc);
    }
  }
}

async function writeDailyTotals(db, tenantID, storeID, day, vendor, dimensions) {
  const docRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("usage-daily-totals").doc(day);
  await docRef.set({
    [vendor]: dimensions,
    day,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: Date.now(),
  }, { merge: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-vendor pullers — skeletons.
// Each returns { dimensions, ok, error? } for one tenant/store/day.
// Until credentials are wired up, ok=false signals "deferred".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Twilio: Usage Records API
 *   GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Usage/Records/Daily.json?Category=sms&StartDate=...
 *
 * Twilio bills per subaccount (one per tenant), not per store. For multi-
 * store tenants we fetch once per (tenantID, day) — cached at module scope
 * so the outer forEachStore loop hits the Twilio API once per tenant per
 * scheduled run — and allocate proportionally to each store based on its
 * share of SMS-bearing usage-events that day. If no events were recorded
 * tenant-wide, falls back to an even split across stores.
 *
 * Dimensions captured (matches src/.../vendorRates.js):
 *   - twilioSegments         — outbound SMS segments (Twilio `usage` field)
 *   - twilioInboundSegments  — inbound SMS segments
 *   - twilioMms              — outbound MMS message count (Twilio `count`)
 *
 * Returns { ok:false, error:"..." } for:
 *   - non-SaaS deploys (Bonita has no subaccount layer)
 *   - tenants without a provisioned subaccount
 *   - suspended/closed subaccounts (can't pull historical usage)
 *   - Secret Manager / Twilio API failures (error includes the cause)
 */
const _twilioFetchCache = new Map();

async function pullTwilioTotals(tenantID, storeID, day /* , settings */) {
  if (!isSaasDeploy()) {
    return { ok: false, dimensions: {}, error: "non_saas_deploy" };
  }
  const cacheKey = `${tenantID}|${day}`;
  if (!_twilioFetchCache.has(cacheKey)) {
    _twilioFetchCache.set(cacheKey, fetchAndAllocateTwilio(tenantID, day));
  }
  const cached = await _twilioFetchCache.get(cacheKey);
  if (!cached.ok) {
    return { ok: false, dimensions: {}, error: cached.error };
  }
  const dims = cached.storeShares[storeID];
  if (!dims) {
    return { ok: false, dimensions: {}, error: "store_not_in_tenant" };
  }
  return { ok: true, dimensions: dims };
}

async function fetchAndAllocateTwilio(tenantID, day) {
  const db = getDB();

  const twilioDoc = await db
    .collection("tenants").doc(tenantID)
    .collection("private").doc("twilio").get();
  if (!twilioDoc.exists) {
    return { ok: false, error: "no_twilio_subaccount" };
  }
  const data = twilioDoc.data() || {};
  const subaccountSid = data.subaccountSid;
  const subaccountStatus = data.status;
  if (!subaccountSid) {
    return { ok: false, error: "no_twilio_subaccount" };
  }
  if (subaccountStatus !== "active") {
    return { ok: false, error: `subaccount_${subaccountStatus || "unknown"}` };
  }

  let twilioClient;
  try {
    const authToken = await loadSubaccountAuthToken(tenantID);
    twilioClient = twilio(subaccountSid, authToken);
  } catch (err) {
    return { ok: false, error: `secret_or_auth_failed: ${(err && err.message) || err}` };
  }

  // Twilio Daily Usage Records — one call per (tenant, day). Subcategories
  // like sms-outbound-longcode/shortcode/tollfree are summed into the parent
  // dimension since our analytics events don't distinguish route types.
  let outboundSegs = 0;
  let inboundSegs = 0;
  let mmsCount = 0;
  try {
    const records = await twilioClient.usage.records.daily.list({
      startDate: day,
      endDate: day,
    });
    for (const r of records) {
      const cat = String(r.category || "");
      const usage = Number(r.usage) || 0;
      const count = Number(r.count) || 0;
      if (cat.startsWith("sms-outbound")) {
        outboundSegs += usage;
      } else if (cat.startsWith("sms-inbound")) {
        inboundSegs += usage;
      } else if (cat.startsWith("mms-outbound")) {
        mmsCount += count;
      }
    }
  } catch (err) {
    return { ok: false, error: `twilio_usage_api_failed: ${(err && err.message) || err}` };
  }

  // Per-store allocation share = SMS-bearing event count for the day.
  const storesSnap = await db
    .collection("tenants").doc(tenantID)
    .collection("stores").get();
  const storeIDs = storesSnap.docs.map((d) => d.id);
  if (storeIDs.length === 0) {
    return { ok: true, storeShares: {} };
  }
  const { start, end } = dayMillisRange(day);
  const perStoreCounts = {};
  let totalCount = 0;
  await Promise.all(storeIDs.map(async (sid) => {
    const evSnap = await db
      .collection("tenants").doc(tenantID)
      .collection("stores").doc(sid)
      .collection("usage-events")
      .where("createdAtMs", ">=", start)
      .where("createdAtMs", "<", end)
      .get();
    let n = 0;
    for (const ev of evSnap.docs) {
      const d = ev.data() || {};
      if ((Number(d.twilioSegments) || 0) > 0 ||
          (Number(d.twilioInboundSegments) || 0) > 0 ||
          (Number(d.twilioMms) || 0) > 0) {
        n++;
      }
    }
    perStoreCounts[sid] = n;
    totalCount += n;
  }));

  const storeShares = {};
  for (const sid of storeIDs) {
    const share = totalCount > 0
      ? perStoreCounts[sid] / totalCount
      : 1 / storeIDs.length;
    storeShares[sid] = {
      twilioSegments: Math.round(outboundSegs * share * 100) / 100,
      twilioInboundSegments: Math.round(inboundSegs * share * 100) / 100,
      twilioMms: Math.round(mmsCount * share * 100) / 100,
    };
  }

  return { ok: true, storeShares };
}

/**
 * Stripe: Balance Transactions API + Payment Intents
 *   GET https://api.stripe.com/v1/balance_transactions?created[gte]=...&created[lt]=...
 *
 * Pull all transactions for the day. Aggregate:
 *   - stripeChargeCount
 *   - stripeRefundCount
 *   - stripeGrossCents
 *   - stripeFeeCents (Stripe processing fees we eat / customer eats)
 *   - stripeNetCents
 *
 * NOTE: deferred until Stripe account is set up (RSS LLC blocker — see
 * project-rss-llc-blocker memory). Bonita's existing Stripe account works
 * fine for instrumenting today, but the multi-tenant version needs Stripe
 * Connect, which depends on RSS Business verification.
 */
async function pullStripeTotals(/* tenantID, storeID, day, settings */) {
  // TODO: implement Stripe Balance Transactions pull.
  return { ok: false, dimensions: {}, error: "stripe_account_pending" };
}

/**
 * GCP Cloud Billing: Service-level cost detail export to BigQuery, or
 * Cloud Billing API GetCost (alpha).
 *
 * Simpler alternative for daily attribution: use Cloud Monitoring metrics
 * (cloudfunctions.googleapis.com/function/execution_count, etc.) and apply
 * GCP's published unit prices. This is what this puller will do.
 *
 * Dimensions to capture per Cloud Function:
 *   - executions
 *   - executionTimeMs (sum)
 *   - networkEgressBytes
 *
 * Firestore reads/writes per day (project-wide; can't attribute per store
 * from Cloud Monitoring — for that, use our instrumented dimensions):
 *   - firestoreReads
 *   - firestoreWrites
 *   - firestoreDeletes
 *
 * NOTE: Cloud Monitoring API requires Application Default Credentials with
 * monitoring.metricDescriptors.list permission. Run-time service account
 * needs the Monitoring Viewer role on the project.
 */
async function pullGcpTotals(/* tenantID, storeID, day */) {
  // TODO: implement Cloud Monitoring API pull (project-level metrics, then
  // attribute via instrumented usage-events for per-store breakdown).
  return { ok: false, dimensions: {}, error: "not_implemented" };
}

/**
 * Gmail Workspace: Reports API (if customer is on Workspace) gives daily
 * gmail:num_emails_sent etc.
 *
 *   GET https://admin.googleapis.com/admin/reports/v1/usage/users/{userKey}/dates/{date}
 *
 * For consumer Gmail (no Workspace), no Reports API access — rely purely on
 * instrumented gmail.send / gmail.sync counts.
 *
 * Per-store mapping is via the connected email account (tenants/{...}/email-auth/{accountKey}).
 */
async function pullGmailTotals(/* tenantID, storeID, day */) {
  // TODO: implement Workspace Reports API pull if connected accounts use
  // a Workspace domain; otherwise rely on instrumented counts only.
  return { ok: false, dimensions: {}, error: "not_implemented" };
}

/**
 * Google Cloud Translation API: priced per million characters
 *   GET https://cloudbilling.googleapis.com/v1/services/{translateServiceId}/skus
 *
 * Per-day character totals come from Cloud Monitoring metric
 *   translate.googleapis.com/api/request_count
 * but that's request count, not chars. For chars, instrument-side count is
 * authoritative; here we record any vendor-reported number for sanity.
 */
async function pullTranslateTotals(/* tenantID, storeID, day */) {
  // TODO: implement once needed (low volume today)
  return { ok: false, dimensions: {}, error: "not_implemented" };
}

// ─────────────────────────────────────────────────────────────────────────────
// pullVendorTotals — Daily 02:00 PT
// ─────────────────────────────────────────────────────────────────────────────
exports.pullVendorTotals = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "America/Los_Angeles",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  withFeatureTrackingSchedule("system.pullVendorTotals", async (event, tracker) => {
    const day = ymd(yesterdayUTC());
    tracker.set("day", day);
    logger.info("pullVendorTotals start", { day });

    const db = getDB();
    let storeCount = 0;
    let vendorOks = 0;
    let vendorFails = 0;

    await forEachStore(db, async (tenantID, storeID) => {
      storeCount++;

      const settingsSnap = await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("settings").doc("settings").get();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};

      const results = await Promise.all([
        pullTwilioTotals(tenantID, storeID, day, settings),
        pullStripeTotals(tenantID, storeID, day, settings),
        pullGcpTotals(tenantID, storeID, day),
        pullGmailTotals(tenantID, storeID, day),
        pullTranslateTotals(tenantID, storeID, day),
      ]);

      const vendors = ["twilio", "stripe", "gcp", "gmail", "translate"];
      for (let i = 0; i < vendors.length; i++) {
        const r = results[i];
        const v = vendors[i];
        if (r.ok) {
          vendorOks++;
          await writeDailyTotals(db, tenantID, storeID, day, v, r.dimensions);
        } else {
          vendorFails++;
          logger.info(`pullVendorTotals ${v} deferred`, {
            tenantID, storeID, day, reason: r.error,
          });
        }
      }
    });

    tracker.set("storesProcessed", storeCount);
    tracker.set("vendorOks", vendorOks);
    tracker.set("vendorFails", vendorFails);
    logger.info("pullVendorTotals done", { day, storeCount, vendorOks, vendorFails });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// reconcileUsageEvents — Daily 03:00 PT
//
// For each tenant/store/day:
//   1. Load all usage-events where ts is in [day 00:00, day 24:00) UTC
//      (or, more practically, where createdAtMs is in that range — cheaper)
//   2. Aggregate instrumented dimensions per vendor
//   3. Diff against vendor totals from usage-daily-totals
//   4. Write reconciliation doc with per-vendor delta + flagged flag
//
// "Vendor totals" are authoritative for billing; instrumented counts are our
// runtime tally. A delta > 20% means we're missing instrumentation somewhere
// (or counting too aggressively).
// ─────────────────────────────────────────────────────────────────────────────

function dayMillisRange(day /* "yyyy-mm-dd" */) {
  const [y, m, d] = day.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const end = start + 24 * 60 * 60 * 1000;
  return { start, end };
}

const RECONCILE_FLAG_THRESHOLD = 0.20; // 20% delta triggers a flag

// Maps a vendor → list of instrumented dimension keys to sum for comparison.
// Add to these as more dimensions land.
const VENDOR_DIMENSIONS = {
  twilio: ["twilioSegments", "twilioInboundSegments", "twilioMms"],
  stripe: ["stripeAmountCents", "stripeFeesCents"],
  gcp: ["firestoreReads", "firestoreWrites", "executionTimeMs"],
  gmail: ["gmailApiCalls", "gmailMessagesSent"],
  translate: ["translateApiCalls", "translateCharacters"],
};

async function reconcileOneStore(db, tenantID, storeID, day) {
  const { start, end } = dayMillisRange(day);

  // Pull events for the day
  const eventsSnap = await db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("usage-events")
    .where("createdAtMs", ">=", start)
    .where("createdAtMs", "<", end)
    .get();

  // Sum each tracked dimension
  const instrumented = {};
  for (const doc of eventsSnap.docs) {
    const data = doc.data();
    for (const key of Object.keys(data)) {
      if (typeof data[key] === "number") {
        instrumented[key] = (instrumented[key] || 0) + data[key];
      }
    }
  }

  // Pull vendor totals for the day
  const totalsSnap = await db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("usage-daily-totals").doc(day).get();
  const vendorTotals = totalsSnap.exists ? totalsSnap.data() : {};

  // Compute per-vendor deltas
  const perVendor = {};
  for (const [vendor, dimKeys] of Object.entries(VENDOR_DIMENSIONS)) {
    const vendorDoc = vendorTotals[vendor] || {};
    const dims = {};
    for (const key of dimKeys) {
      const instr = instrumented[key] || 0;
      const vend = vendorDoc[key];
      const hasVendor = typeof vend === "number";
      const deltaPct = hasVendor && vend > 0
        ? (instr - vend) / vend
        : null;
      dims[key] = {
        instrumented: instr,
        vendor: hasVendor ? vend : null,
        deltaPct,
        flagged: deltaPct !== null && Math.abs(deltaPct) > RECONCILE_FLAG_THRESHOLD,
      };
    }
    perVendor[vendor] = dims;
  }

  await db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("usage-reconciliation").doc(day).set({
      day,
      perVendor,
      eventCount: eventsSnap.size,
      computedAt: admin.firestore.FieldValue.serverTimestamp(),
      computedAtMs: Date.now(),
    });

  return { eventCount: eventsSnap.size, perVendor };
}

exports.reconcileUsageEvents = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "America/Los_Angeles",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  withFeatureTrackingSchedule("system.reconcileUsageEvents", async (event, tracker) => {
    const day = ymd(yesterdayUTC());
    tracker.set("day", day);
    logger.info("reconcileUsageEvents start", { day });

    const db = getDB();
    let storeCount = 0;
    let flaggedStores = 0;

    await forEachStore(db, async (tenantID, storeID) => {
      storeCount++;
      try {
        const { perVendor } = await reconcileOneStore(db, tenantID, storeID, day);
        const anyFlagged = Object.values(perVendor).some((dims) =>
          Object.values(dims).some((d) => d.flagged)
        );
        if (anyFlagged) {
          flaggedStores++;
          logger.warn("reconcileUsageEvents flagged", { tenantID, storeID, day, perVendor });
        }
      } catch (err) {
        logger.error("reconcileUsageEvents failed for store", {
          tenantID, storeID, day, error: err && err.message,
        });
      }
    });

    tracker.set("storesProcessed", storeCount);
    tracker.set("flaggedStores", flaggedStores);
    logger.info("reconcileUsageEvents done", { day, storeCount, flaggedStores });
  })
);
