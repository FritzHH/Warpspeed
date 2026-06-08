/* eslint-disable */
// JBI vendor submission handler.
//
// JBI accepts orders via FTP — drop an XML file into the integrator's
// /Orders/ subfolder on JBI's FTP host. The file is named
//   JBI-{CustomerOrderNo}-{AccountNumber}.xml
// and must follow JBI's strict element-order schema (Header → Token →
// AccountNumber → CustomerOrderNo → DropShip → SingleLocation →
// DeliveryAddress → LineItems). Missing or out-of-order elements cause
// the parser to silently consume nothing past that point — a known
// failure mode that produced an empty cart in test runs until the
// DeliveryAddress block was added.
//
// Response codes:
//   Code 99 = success                Code 02 = token invalid
//   Code 03 = duplicate filename     other  = see JBI XML Ordering spec
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  INTEGRATOR MODEL — confirmed by JBI 2026-06-05                 │
// │                                                                 │
// │  JBI now treats Cadence as a single integrator, not a dealer.   │
// │  Credentials are SHARED across all Cadence-using dealers and    │
// │  live in platform-level Firebase secrets, NOT in per-store      │
// │  config:                                                        │
// │                                                                 │
// │    JBI_FTP_USERNAME      = "Cadence"                            │
// │    JBI_FTP_PASSWORD      = (Cadence integrator FTP password)    │
// │    JBI_FTP_HOST          = (JBI FTP host)                       │
// │    JBI_PLATFORM_API_KEY  = (integrator <Token> for XML body)    │
// │                                                                 │
// │  These are loaded via .value() inside this handler — declared   │
// │  via defineSecret below + re-exported in `secrets` so the       │
// │  Pub/Sub worker (functions/saas/vendor-submission-worker.js)    │
// │  can declare them in its onCall options.                        │
// │                                                                 │
// │  Per-dealer authorization is server-side at JBI: they flip an   │
// │  enable bit for each dealer account number before that dealer   │
// │  can submit via Cadence. No dealer-specific FTP login.          │
// └─────────────────────────────────────────────────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  ONBOARDING INPUTS — what the dealer actually types in Cadence  │
// │                                                                 │
// │  ONLY TWO THINGS:                                               │
// │    1. JBI account number (dealer's HACN-equivalent at JBI)      │
// │    2. Contact email (for JBI ack notifications)                 │
// │                                                                 │
// │  Both live in Firestore vendor_connections/jbi.connection. The  │
// │  FTP login and integrator token are Cadence-owned, set once in  │
// │  Firebase secrets, and reused for every dealer. The dealer      │
// │  never sees or types them.                                      │
// └─────────────────────────────────────────────────────────────────┘
//
// Handler input (passed by the worker / sync callable):
//   {
//     order, items,                  // see worker
//     connection: {                  // Firestore vendor_connections/jbi
//       accountNumber, contactEmail,
//     },
//     secrets: {},                   // JBI has NO per-store secrets
//     ctx,                           // { tenantID, storeID, vendorID, orderID, submissionID, logger }
//   }
//
// Return shape (written to submission.result):
//   { channel: "ftp" | "api", uploadedAt, itemCount, ... }

const fetch = require("node-fetch");
const ftp = require("basic-ftp");
const { Readable } = require("stream");
const { defineSecret } = require("firebase-functions/params");

// Platform-level secrets — shared across every Cadence tenant. Set on
// cadence-pos via:
//   firebase functions:secrets:set JBI_FTP_HOST --project=cadence-pos --account=fritz@retailsoftsystems.com
//   firebase functions:secrets:set JBI_FTP_USERNAME --project=cadence-pos --account=fritz@retailsoftsystems.com
//   firebase functions:secrets:set JBI_FTP_PASSWORD --project=cadence-pos --account=fritz@retailsoftsystems.com
//   firebase functions:secrets:set JBI_PLATFORM_API_KEY --project=cadence-pos --account=fritz@retailsoftsystems.com
// (Already set on warpspeed-bonitabikes for the Bonita sync callable.)
const JBI_FTP_HOST = defineSecret("JBI_FTP_HOST");
const JBI_FTP_USERNAME = defineSecret("JBI_FTP_USERNAME");
const JBI_FTP_PASSWORD = defineSecret("JBI_FTP_PASSWORD");
const JBI_PLATFORM_API_KEY = defineSecret("JBI_PLATFORM_API_KEY");

// Exported for the worker's onCall `secrets:` option via ALL_HANDLER_SECRETS
// in functions/vendors/index.js. Without this, .value() throws at runtime.
exports.secrets = [
  JBI_FTP_HOST,
  JBI_FTP_USERNAME,
  JBI_FTP_PASSWORD,
  JBI_PLATFORM_API_KEY,
];

// Placeholder endpoint — replace once JBI confirms the dealer API surface.
const JBI_API_URL = "https://api.jbi.bike/v1/orders";

exports.submit = async function jbiSubmit({ order, items, connection, ctx }) {
  const { logger, submissionID } = ctx;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("JBI: order has no items.");
  }

  const accountNumber = String((connection && connection.accountNumber) || "").trim();
  if (!accountNumber) {
    throw new Error("JBI: connection missing accountNumber.");
  }

  // Filter to JBI-tagged items only. Items from other catalogs end up in the
  // same order doc when the user is consolidating; we only submit our own.
  const jbiItems = items.filter((it) => {
    if (!it || !it.vendorItemID) return false;
    return it.vendorCatalogID === "jbi";
  });

  if (jbiItems.length === 0) {
    throw new Error("JBI: no JBI-tagged items in this order.");
  }

  const orderLines = jbiItems.map((it) => ({
    itemNumber: String(it.vendorItemID || ""),
    qty: Number(it.qty || 0),
    cost: it.sourceCost != null ? String(it.sourceCost) : "",
    upc:
      (it.catalogSnapshot &&
        (it.catalogSnapshot.primaryBarcode || it.catalogSnapshot.primaryUpc)) ||
      "",
  }));

  const apiKey = JBI_PLATFORM_API_KEY.value() || "";
  const ftpHost = JBI_FTP_HOST.value() || "";
  const ftpUsername = JBI_FTP_USERNAME.value() || "";
  const ftpPassword = JBI_FTP_PASSWORD.value() || "";

  // Prefer API when the integrator key is configured — single-shot, fewer
  // moving parts than FTP. Falls back to FTP if API creds are missing.
  if (apiKey) {
    return await submitViaAPI({
      apiKey,
      accountNumber,
      order,
      orderLines,
      logger,
      submissionID,
    });
  }

  if (ftpHost && ftpUsername && ftpPassword) {
    return await submitViaFTP({
      ftpHost,
      ftpUsername,
      ftpPassword,
      accountNumber,
      order,
      orderLines,
      logger,
      submissionID,
    });
  }

  throw new Error(
    "JBI: platform credentials missing (need JBI_PLATFORM_API_KEY or the full FTP set: JBI_FTP_HOST + JBI_FTP_USERNAME + JBI_FTP_PASSWORD).",
  );
};

async function submitViaAPI({
  apiKey,
  accountNumber,
  order,
  orderLines,
  logger,
  submissionID,
}) {
  const body = {
    dealerAccountNumber: accountNumber,
    customerPONumber:
      (order && (order.customerPONumber || order.name)) || submissionID,
    items: orderLines.map((line) => ({
      item_number: line.itemNumber,
      quantity: line.qty,
      unit_cost: line.cost,
    })),
  };

  logger.info("JBI API submit", {
    submissionID,
    itemCount: orderLines.length,
    endpoint: JBI_API_URL,
  });

  let resp;
  try {
    resp = await fetch(JBI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`JBI API request failed: ${err && err.message ? err.message : err}`);
  }

  let respBody = null;
  try {
    respBody = await resp.json();
  } catch (_) {
    try {
      respBody = await resp.text();
    } catch (_) {
      respBody = null;
    }
  }

  if (!resp.ok) {
    const detail =
      respBody && typeof respBody === "object" && respBody.error
        ? respBody.error
        : typeof respBody === "string"
          ? respBody
          : `HTTP ${resp.status}`;
    throw new Error(`JBI API rejected order: ${detail}`);
  }

  return {
    channel: "api",
    uploadedAt: new Date().toISOString(),
    itemCount: orderLines.length,
    apiResponse: respBody,
  };
}

async function submitViaFTP({
  ftpHost,
  ftpUsername,
  ftpPassword,
  accountNumber,
  order,
  orderLines,
  logger,
  submissionID,
}) {
  // Placeholder CSV body — JBI's real spec is XML with strict element
  // ordering (see header comment). The XML builder lives in the deferred
  // discovery + XML work; until then this CSV is sent to a non-production
  // path. The integrator model lookup (per-dealer enable bit at JBI) is
  // also out-of-band.
  const header = "item_number,quantity,unit_cost,upc";
  const lines = orderLines.map(
    (l) => `${l.itemNumber},${l.qty},${l.cost},${l.upc}`,
  );
  const csv = [header, ...lines].join("\r\n") + "\r\n";

  const fileName = `JBI-${submissionID}-${accountNumber}.csv`;

  logger.info("JBI FTP submit", {
    submissionID,
    itemCount: orderLines.length,
    host: ftpHost,
    fileName,
  });

  const client = new ftp.Client(30_000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: ftpHost,
      user: ftpUsername,
      password: ftpPassword,
      secure: false,
    });
    const stream = Readable.from([Buffer.from(csv, "utf8")]);
    await client.uploadFrom(stream, fileName);
  } catch (err) {
    throw new Error(`JBI FTP failed: ${err && err.message ? err.message : err}`);
  } finally {
    client.close();
  }

  return {
    channel: "ftp",
    uploadedAt: new Date().toISOString(),
    itemCount: orderLines.length,
    remoteFileName: fileName,
  };
}
