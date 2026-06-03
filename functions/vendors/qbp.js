/* eslint-disable */
// QBP vendor submission handler.
//
// QBP accepts orders as plain-text `.poi` files dropped via FTP into the
// dealer account's /out directory on eftp.qbp.com. QBP's EFTP processor
// scans /out on a roughly-1-minute interval, ingests each .poi, and emits
// a .por response file into /in. Processing time is variable — sometimes
// under a minute, sometimes 5+ minutes — so we cannot wait synchronously.
//
// Fire-and-forget model:
//
//   1. Build the .poi payload (FT/FV header, H* address block, L* lines).
//   2. Connect to FTP, upload to /out/{filename}.poi.
//   3. Register a Firestore tracking doc at
//        tenants/{tid}/stores/{sid}/pending-qbp-responses/{filename}
//      so the scheduled response poller (functions/saas/qbp-response-poller.js
//      + functions/bonita/qbp-response-poller.js) can match the .por back
//      to this submission later.
//   4. Return the awaiting-response result immediately.
//
// The submission doc is stamped `status: "success"` by the worker / sync
// callable on return (meaning "we handed off to vendor"). The poller later
// updates the same doc with `result.vendorResponse` and may flip to
// `status: "failure"` if the .por reports a fatal QBP error code.
//
// Filename is derived deterministically from submissionID so a Pub/Sub
// retry uploads to the same /out path — FTP overwrites, QBP processes once,
// no double-orders.
//
// Credentials (creds, passed by the worker / callable):
//   { eftpUser, eftpPassword, eftpHost?, apiKey? }
//
// vendorConfig (settings.vendors.qbp):
//   {
//     displayName,
//     accountNumber,    // 10-digit HACN (e.g. "0000115882")
//     contactEmail,     // HEMA — receives QBP order-reconciliation email
//     contactName,      // HCTN
//     shipToID,         // 10-digit HSTO (from /customer ship-to list)
//     shipViaCode,      // HSVT (e.g. "U4" = UPS Ground)
//     paymentTerms,     // HTRM (e.g. "N30:I" = Net 30, ACH US)
//     submitAsCart,     // boolean: true → CSUB=NO (cart-only test),
//                       //          false/missing → CSUB=YES + OSOR=YES (live)
//     shipDateOffsetDays, // optional override for default ship-date (5)
//   }

const ftp = require("basic-ftp");
const crypto = require("node:crypto");
const { Readable } = require("stream");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!admin.apps.length) admin.initializeApp();

const DEFAULT_EFTP_HOST = "eftp.qbp.com";
const DEFAULT_EFTP_PORT = 21;
const FTP_TIMEOUT_MS = 60_000;

exports.submit = async function qbpSubmit({
  order,
  items,
  vendorConfig,
  creds,
  ctx,
}) {
  const { tenantID, storeID, orderID, submissionID, logger } = ctx;

  if (!creds || !creds.eftpUser || !creds.eftpPassword) {
    throw new Error(
      "QBP: missing EFTP credentials (need eftpUser + eftpPassword)."
    );
  }
  if (!vendorConfig || !vendorConfig.accountNumber) {
    throw new Error("QBP: vendor settings missing accountNumber (HACN).");
  }
  if (!vendorConfig.contactEmail) {
    throw new Error("QBP: vendor settings missing contactEmail (HEMA).");
  }
  if (!vendorConfig.shipToID) {
    throw new Error("QBP: vendor settings missing shipToID (HSTO).");
  }
  if (!vendorConfig.shipViaCode) {
    throw new Error("QBP: vendor settings missing shipViaCode (HSVT).");
  }
  if (!vendorConfig.paymentTerms) {
    throw new Error("QBP: vendor settings missing paymentTerms (HTRM).");
  }

  // Filter to QBP-tagged items. Items from other catalogs end up in the
  // same order doc when the user is consolidating; only our own go to QBP.
  const qbpItems = (items || []).filter(
    (it) => it && it.vendorCatalogID === "qbp" && it.vendorItemID
  );
  if (qbpItems.length === 0) {
    throw new Error("QBP: no QBP-tagged items in this order.");
  }

  const eftpFilename = buildFilename(submissionID);
  const remotePath = `/out/${eftpFilename}.poi`;
  const poiBody = buildPoiFile({
    order,
    items: qbpItems,
    vendorConfig,
    submissionID,
  });

  logger.info("QBP submit: uploading .poi", {
    submissionID,
    orderID,
    eftpFilename,
    itemCount: qbpItems.length,
    csub: poiBody.includes("CSUB,YES") ? "YES" : "NO",
  });

  // 1. Upload .poi
  const client = new ftp.Client(FTP_TIMEOUT_MS);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: creds.eftpHost || DEFAULT_EFTP_HOST,
      port: creds.eftpPort || DEFAULT_EFTP_PORT,
      user: creds.eftpUser,
      password: creds.eftpPassword,
      secure: false,
    });
    const stream = Readable.from([Buffer.from(poiBody, "utf8")]);
    await client.uploadFrom(stream, remotePath);
  } catch (err) {
    throw new Error(
      `QBP: FTP upload failed: ${err && err.message ? err.message : err}`
    );
  } finally {
    client.close();
  }

  // 2. Register pending response. Set-with-merge so a Pub/Sub retry on the
  // same submissionID is idempotent (same filename, same doc).
  const db = getFirestore();
  const pendingRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("pending-qbp-responses").doc(eftpFilename);

  try {
    await pendingRef.set(
      {
        tenantID,
        storeID,
        submissionID,
        orderID,
        eftpFilename,
        accountNumber: vendorConfig.accountNumber,
        uploadedAt: FieldValue.serverTimestamp(),
        uploadedMillis: Date.now(),
        attempts: 0,
        status: "awaiting-vendor-response",
      },
      { merge: true }
    );
  } catch (err) {
    // .poi is already on the wire; failing the handler now would cause the
    // worker to retry and re-upload. Log loudly and accept the orphan —
    // QBP will still process the cart, and an admin can resolve manually.
    logger.error("QBP submit: pending-response write failed (.poi orphaned)", {
      submissionID,
      eftpFilename,
      error: err && err.message,
    });
  }

  const uploadedAt = new Date().toISOString();
  return {
    channel: "ftp",
    uploadedAt,
    itemCount: qbpItems.length,
    eftpFilename,
    remotePath,
    awaitingVendorResponse: true,
    // The poller updates the submission doc later with the parsed .por.
    note: "QBP processes asynchronously; response will appear in this submission doc when the .por lands in /in.",
  };
};

// .poi filename: 1–8 alphanumeric chars per QBP spec. Hash the submissionID
// so retries hit the same filename (idempotent), prefix "p" to guarantee a
// leading letter (some FTP processors are picky), 7 hex chars of entropy.
function buildFilename(submissionID) {
  const hash = crypto
    .createHash("sha256")
    .update(String(submissionID || `${Date.now()}`))
    .digest("hex");
  return `p${hash.slice(0, 7)}`;
}

// Build the .poi body per QBP EFTP spec v4.0.
// Record order matters per the published example; do not reorder casually.
// Newlines: LF only — spec warns "lines including carriage returns may cause
// entire file to be corrupted." See scripts/qbp-eftp-test/2-build-poi.js.
function buildPoiFile({ order, items, vendorConfig, submissionID }) {
  const submitAsCart = vendorConfig.submitAsCart === true;
  const csub = submitAsCart ? "NO" : "YES";
  // OSOR (out-of-stock-on-receipt) only meaningful with CSUB=YES; spec says
  // YES = ship partial, NO = ship none until full. Default YES so a single
  // OOS item doesn't block the whole order.
  const osor = submitAsCart ? "NO" : "YES";
  const hshd = formatShipDate(vendorConfig.shipDateOffsetDays || 5);

  // HCPO: 1–10 alphanumeric. Prefer customer PO from order, fall back to
  // order.name, then submissionID tail.
  const rawPo =
    (order && (order.customerPONumber || order.name)) ||
    submissionID ||
    `PO${Date.now()}`;
  const hcpo = String(rawPo)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10) || "PO";

  const lines = [
    "FT,PO",
    "FV,4.0",
    `HEMA,${vendorConfig.contactEmail}`,
    `HACN,${pad10Digit(vendorConfig.accountNumber)}`,
    `HCTN,${vendorConfig.contactName || "Buyer"}`,
    `HCPO,${hcpo}`,
    `HSHD,${hshd}`,
    `HSTO,${pad10Digit(vendorConfig.shipToID)}`,
    `HSVT,${vendorConfig.shipViaCode}`,
    `HTRM,${vendorConfig.paymentTerms}`,
    `CSUB,${csub}`,
    `OSOR,${osor}`,
    // CREP=ftp asks QBP to drop the .por back into the same EFTP /in
    // directory (vs CREP=email which sends to HEMA only). We poll /in
    // via the response poller; do not change without updating the poller.
    `CREP,ftp`,
    // CFAL=ignore = if a single line item is bad (UPC instead of SKU,
    // discontinued, etc.), QBP skips that line and processes the rest.
    // CFAL=fail = reject the whole PO on any bad line. ignore matches our
    // existing UI behavior (line-level error display, not whole-order).
    `CFAL,ignore`,
    `CLNE,${items.length}`,
  ];

  // L records: L{n},{sku},{qty}
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sku = String(it.vendorItemID || "").trim();
    const qty = Math.max(1, parseInt(it.qty || 1, 10) || 1);
    lines.push(`L${i + 1},${sku},${qty}`);
  }

  return lines.join("\n") + "\n";
}

function pad10Digit(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return digits.padStart(10, "0");
}

function formatShipDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (Number.isFinite(offsetDays) ? offsetDays : 5));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// Exported for the response poller — same parse logic on both sync and async
// paths. Returns { resultCodes, raw, ok }.
exports.parsePorBody = function parsePorBody(text) {
  const raw = String(text || "");
  const codes = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("RSLT,")) continue;
    // RSLT line is colon-separated pairs of code:field, e.g.
    // RSLT,29:HTRM,17:HTRM,01:L1
    const body = trimmed.slice(5); // strip "RSLT,"
    for (const pair of body.split(":")) {
      const [code, field] = pair.split(",");
      if (code) codes.push({ code: code.trim(), field: (field || "").trim() });
    }
  }
  // Known non-fatal warnings (cart was still built). Per EFTP guide page
  // 13-16; extend as we encounter more. Anything outside this set is treated
  // as a fatal error so the submission flips to failure.
  const WARNING_CODES = new Set(["17", "29"]);
  const fatalCodes = codes.filter((c) => !WARNING_CODES.has(c.code));
  return {
    raw,
    resultCodes: codes,
    warningCodes: codes.filter((c) => WARNING_CODES.has(c.code)),
    fatalCodes,
    ok: fatalCodes.length === 0,
  };
};

// Same FTP-access helper the poller uses to download + delete the .por.
exports.openFtpClient = async function openFtpClient(creds) {
  const client = new ftp.Client(FTP_TIMEOUT_MS);
  client.ftp.verbose = false;
  await client.access({
    host: creds.eftpHost || DEFAULT_EFTP_HOST,
    port: creds.eftpPort || DEFAULT_EFTP_PORT,
    user: creds.eftpUser,
    password: creds.eftpPassword,
    secure: false,
  });
  return client;
};

// Best-effort delete of a .por from /in so it doesn't accumulate. QBP does
// not auto-clean /in — without this, every dealer ends up with thousands of
// orphan .por files after a year of operation.
exports.deletePorFromIn = async function deletePorFromIn(client, eftpFilename) {
  try {
    await client.remove(`/in/${eftpFilename}.por`);
    return true;
  } catch (_err) {
    return false;
  }
};

// No `secrets` export — the SaaS path loads creds from the per-store
// vendor-credentials Firestore doc; the Bonita sync callable declares
// QBP_EFTP_USER / QBP_EFTP_PASSWORD secrets in its own onCall options.
