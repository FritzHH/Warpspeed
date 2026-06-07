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
// │  live in functions/ secrets, NOT in per-store config:           │
// │                                                                 │
// │    JBI_FTP_USERNAME      = "Cadence"                            │
// │    JBI_FTP_PASSWORD      = (Cadence integrator FTP password)    │
// │    JBI_FTP_HOST          = (JBI FTP host)                       │
// │    JBI_PLATFORM_API_KEY  = (integrator <Token> for XML body)    │
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
// │  The FTP login and integrator token are Cadence-owned, set      │
// │  once in Firebase secrets, and reused for every dealer. The     │
// │  dealer never sees or types them.                               │
// └─────────────────────────────────────────────────────────────────┘
//
// Credentials shape (resolved server-side, not entered by dealer):
//   { ftpHost, ftpUsername, ftpPassword, apiKey }
//
// vendorConfig (settings.vendors.jbi) — per-store:
//   { displayName, dealerAccountNumber, contactEmail, customerPONumber?, shipToAddress? }
//
// Return shape (written to submission.result):
//   { channel: "ftp", uploadedAt, itemCount, remoteFileName }

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
    upc:
      (it.catalogSnapshot &&
        (it.catalogSnapshot.primaryBarcode || it.catalogSnapshot.primaryUpc)) ||
      "",
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
