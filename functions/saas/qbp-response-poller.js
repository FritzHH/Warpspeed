/* eslint-disable */
// QBP .por response poller — SaaS (cadence-pos).
//
// Runs on a 3-minute schedule. Uses a collectionGroup query to find every
// pending-qbp-responses doc across every tenant + store, groups by
// (tenantID, storeID), loads each store's QBP creds via loadVendorState
// (connection.accountNumber from Firestore vendor_connections/qbp,
// eftpPassword from Secret Manager), derives the EFTP login server-side,
// then opens one FTP connection per store to drain matching .por files
// from /in.
//
// Same logic as the Bonita poller (functions/bonita/qbp-response-poller.js);
// only difference is multi-tenant cred sourcing. The shared parse/upload
// helpers live in functions/vendors/qbp.js.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { Writable } = require("stream");

const qbpHandler = require("../vendors/qbp");
const { loadVendorState } = require("./vendor-creds");

if (!admin.apps.length) admin.initializeApp();

const RESPONSE_TIMEOUT_HOURS = 6;

exports.qbpResponsePollerSaas = onSchedule(
  {
    schedule: "every 3 minutes",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const db = getFirestore();

    const pendingSnap = await db
      .collectionGroup("pending-qbp-responses")
      .get();
    if (pendingSnap.empty) return;

    const pendings = pendingSnap.docs.map((d) => ({
      id: d.id,
      ref: d.ref,
      data: d.data() || {},
    }));

    logger.info("qbp-response-poller-saas: pending entries", {
      count: pendings.length,
    });

    // Stale partition first — these need no FTP work.
    const now = Date.now();
    const staleCutoff = now - RESPONSE_TIMEOUT_HOURS * 3600 * 1000;
    const fresh = [];
    const stale = [];
    for (const p of pendings) {
      const uploadedMillis = Number(p.data.uploadedMillis) || 0;
      if (uploadedMillis && uploadedMillis < staleCutoff) stale.push(p);
      else fresh.push(p);
    }

    for (const s of stale) {
      try {
        await markSubmissionFailure(db, s, {
          reason: `QBP response timeout (>${RESPONSE_TIMEOUT_HOURS}h with no .por in /in).`,
        });
        await s.ref.delete();
        logger.warn("qbp-response-poller-saas: stale entry cleaned", {
          eftpFilename: s.id,
          tenantID: s.data.tenantID,
          submissionID: s.data.submissionID,
        });
      } catch (err) {
        logger.error("qbp-response-poller-saas: stale cleanup failed", {
          eftpFilename: s.id,
          error: err && err.message,
        });
      }
    }

    if (fresh.length === 0) return;

    // Group fresh entries by tenant+store so we open one FTP connection per
    // store, not per pending entry. Map<"tid|sid", entries[]>.
    const groups = new Map();
    for (const p of fresh) {
      const key = `${p.data.tenantID || ""}|${p.data.storeID || ""}`;
      if (!key.includes("|") || key === "|") continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }

    // Process groups sequentially. Could parallelize at the cost of more
    // concurrent FTP sockets; 3-min cadence makes serial fine for now.
    for (const [key, entries] of groups.entries()) {
      const [tenantID, storeID] = key.split("|");
      try {
        await processStoreGroup(db, tenantID, storeID, entries);
      } catch (err) {
        logger.error("qbp-response-poller-saas: store group failed", {
          tenantID,
          storeID,
          error: err && err.message,
        });
      }
    }
  }
);

async function processStoreGroup(db, tenantID, storeID, entries) {
  // Load split state via the same helper the worker uses. Connection has
  // accountNumber; secrets has eftpPassword. EFTP login is the account
  // number with leading zeros stripped — derived here, never stored.
  let connection;
  let secrets;
  try {
    const state = await loadVendorState(db, "qbp", tenantID, storeID);
    connection = state.connection;
    secrets = state.secrets;
  } catch (err) {
    logger.warn("qbp-response-poller-saas: load creds failed, skipping group", {
      tenantID,
      storeID,
      count: entries.length,
      error: err && err.message,
    });
    return;
  }

  const accountNumber = String(connection.accountNumber || "").replace(/\D/g, "");
  const eftpUser = accountNumber.replace(/^0+/, "");
  const eftpPassword = secrets.eftpPassword;
  if (!eftpUser || !eftpPassword) {
    logger.warn("qbp-response-poller-saas: incomplete creds for store, skipping group", {
      tenantID,
      storeID,
      count: entries.length,
    });
    return;
  }

  let client;
  try {
    client = await qbpHandler.openFtpClient({ eftpUser, eftpPassword });
  } catch (err) {
    logger.error("qbp-response-poller-saas: FTP connect failed", {
      tenantID,
      storeID,
      error: err && err.message,
    });
    return;
  }

  try {
    const inListing = await client.list("/in").catch(() => []);
    const porNames = new Set(
      inListing
        .filter((f) => f && f.name && /\.por$/i.test(f.name))
        .map((f) => f.name.toLowerCase())
    );

    for (const p of entries) {
      const expected = `${p.id}.por`.toLowerCase();
      if (!porNames.has(expected)) {
        try {
          await p.ref.set(
            {
              attempts: (Number(p.data.attempts) || 0) + 1,
              lastPolledMillis: Date.now(),
            },
            { merge: true }
          );
        } catch (_) {}
        continue;
      }

      try {
        const body = await downloadFile(client, `/in/${p.id}.por`);
        const parsed = qbpHandler.parsePorBody(body);

        await stampSubmissionWithResponse(db, p, parsed);
        await qbpHandler.deletePorFromIn(client, p.id);
        await p.ref.delete();

        logger.info("qbp-response-poller-saas: response processed", {
          tenantID,
          storeID,
          eftpFilename: p.id,
          submissionID: p.data.submissionID,
          ok: parsed.ok,
          warningCount: parsed.warningCodes.length,
          fatalCount: parsed.fatalCodes.length,
        });
      } catch (err) {
        logger.error("qbp-response-poller-saas: per-entry failure", {
          tenantID,
          storeID,
          eftpFilename: p.id,
          error: err && err.message,
        });
      }
    }
  } finally {
    client.close();
  }
}

async function downloadFile(client, remotePath) {
  const chunks = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
  });
  await client.downloadTo(sink, remotePath);
  return Buffer.concat(chunks).toString("utf8");
}

async function stampSubmissionWithResponse(db, pending, parsed) {
  const { tenantID, storeID, submissionID } = pending.data;
  if (!tenantID || !storeID || !submissionID) return;

  const submissionRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("vendor-submissions").doc(submissionID);

  await submissionRef.set(
    {
      status: parsed.ok ? "success-confirmed" : "failure",
      vendorResponse: {
        receivedMillis: Date.now(),
        resultCodes: parsed.resultCodes,
        warningCodes: parsed.warningCodes,
        fatalCodes: parsed.fatalCodes,
        raw: parsed.raw,
      },
      ...(parsed.ok
        ? {}
        : {
            error: `QBP rejected order: ${parsed.fatalCodes
              .map((c) => `${c.code}:${c.field}`)
              .join(", ")}`,
            lastErrorMillis: Date.now(),
          }),
    },
    { merge: true }
  );
}

async function markSubmissionFailure(db, pending, { reason }) {
  const { tenantID, storeID, submissionID } = pending.data;
  if (!tenantID || !storeID || !submissionID) return;

  const submissionRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("vendor-submissions").doc(submissionID);

  await submissionRef.set(
    {
      status: "failure",
      error: reason,
      lastErrorMillis: Date.now(),
    },
    { merge: true }
  );
}
