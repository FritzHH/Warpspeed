/* eslint-disable */
// JBI vendor submission handler.
//
// JBI accepts orders via two channels:
//   1. SFTP/FTP drop — upload a fixed-format order file to the JBI server
//      under the dealer's account folder.
//   2. HTTPS API — POST a JSON body with the same line items + apiKey auth.
//
// Strategy: prefer the API when apiKey is present; fall back to FTP. Both
// are wired so handlers can switch at runtime if one path 5xx's.
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  NOTE — FORMAT SPEC NEEDS CONFIRMATION                          │
// │  The exact JBI order file format (CSV columns / fixed-width /   │
// │  XML schema) and the exact JBI API endpoint path + JSON body    │
// │  are not in the codebase. The scaffolding below uses a          │
// │  reasonable-looking CSV (`item_number,qty,cost`) and a stub     │
// │  API call. Replace per JBI's published dealer integration spec  │
// │  before going live.                                             │
// └─────────────────────────────────────────────────────────────────┘
//
// Credentials shape:
//   { ftpHost, ftpUsername, ftpPassword, apiKey }
//
// On cadence-pos (SaaS), these come from the per-store Firestore doc
//   tenants/{tid}/stores/{sid}/vendor-credentials/jbi
// and are entered through the per-store vendor config UI.
//
// On Bonita (warpspeed-bonitabikes), the sync callable resolves them from
// platform-level Secret Manager secrets (JBI_FTP_*, JBI_PLATFORM_API_KEY).
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  NOTE — JBI API KEY SCOPE PENDING CONFIRMATION                  │
// │  Currently the API key is treated as platform-level (single key │
// │  for all stores). JBI inquiry out: confirm whether the key is   │
// │  truly platform-wide or per-dealer-account. If per-dealer, move │
// │  apiKey out of platform secrets and into the per-store credentials│
// │  doc on Bonita (same path as cadence-pos).                       │
// └─────────────────────────────────────────────────────────────────┘
//
// vendorConfig (settings.vendors.jbi) may carry:
//   { displayName, dealerAccountNumber, customerPONumber?, shipToAddress? }
//
// Return shape (written to submission.result):
//   { channel: "api"|"ftp", uploadedAt, itemCount, remoteFileName?, apiResponse? }

const fetch = require("node-fetch");
const ftp = require("basic-ftp");
const { Readable } = require("stream");

// Placeholder endpoint — replace once JBI confirms the dealer API surface.
const JBI_API_URL = "https://api.jbi.bike/v1/orders";

exports.submit = async function jbiSubmit({ order, items, vendorConfig, creds, ctx }) {
  const { logger, submissionID } = ctx;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("JBI: order has no items.");
  }

  // Filter to JBI-tagged items only. Items from other catalogs end up in the
  // same order doc when the user is consolidating; we only submit our own.
  const jbiItems = items.filter((it) => {
    if (!it || !it.vendorItemID) return false;
    const cat = it.vendorCatalogID;
    // Match either explicit jbi catalog tag or fallback to any item carrying
    // a JBI-shaped vendorItemID. Strict-only for now to keep the contract
    // simple — tighten if other items leak in.
    return cat === "jbi";
  });

  if (jbiItems.length === 0) {
    throw new Error("JBI: no JBI-tagged items in this order.");
  }

  const orderLines = jbiItems.map((it) => ({
    itemNumber: String(it.vendorItemID || ""),
    qty: Number(it.qty || 0),
    cost: it.sourceCost != null ? String(it.sourceCost) : "",
    upc: (it.catalogSnapshot && it.catalogSnapshot.upc_ean) || "",
  }));

  // Prefer API when we have an apiKey — single-shot, fewer moving parts.
  if (creds.apiKey) {
    return await submitViaAPI({
      apiKey: creds.apiKey,
      order,
      orderLines,
      vendorConfig,
      logger,
      submissionID,
    });
  }

  // Fall back to FTP.
  if (creds.ftpHost && creds.ftpUsername && creds.ftpPassword) {
    return await submitViaFTP({
      ftpHost: creds.ftpHost,
      ftpUsername: creds.ftpUsername,
      ftpPassword: creds.ftpPassword,
      order,
      orderLines,
      vendorConfig,
      logger,
      submissionID,
    });
  }

  throw new Error(
    "JBI: no credentials configured (need apiKey or full FTP set: ftpHost, ftpUsername, ftpPassword)."
  );
};

async function submitViaAPI({ apiKey, order, orderLines, vendorConfig, logger, submissionID }) {
  const body = {
    dealerAccountNumber: vendorConfig.dealerAccountNumber || "",
    customerPONumber: vendorConfig.customerPONumber || order.name || submissionID,
    shipToAddress: vendorConfig.shipToAddress || null,
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
    // not JSON — capture text for diagnostics
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
  order,
  orderLines,
  vendorConfig,
  logger,
  submissionID,
}) {
  // Build a simple CSV body. Replace with the JBI-mandated format once the
  // dealer integration spec is in hand.
  const header = "item_number,quantity,unit_cost,upc";
  const lines = orderLines.map(
    (l) => `${l.itemNumber},${l.qty},${l.cost},${l.upc}`
  );
  const csv = [header, ...lines].join("\r\n") + "\r\n";

  const fileName = `order_${submissionID}.csv`;

  logger.info("JBI FTP submit", {
    submissionID,
    itemCount: orderLines.length,
    host: ftpHost,
    fileName,
  });

  const client = new ftp.Client(30_000); // 30s timeout per op
  client.ftp.verbose = false;
  try {
    await client.access({
      host: ftpHost,
      user: ftpUsername,
      password: ftpPassword,
      secure: false, // explicit FTPS support flagged in vendorConfig if needed
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
