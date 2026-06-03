/* eslint-disable */
// QBP .por response poller — SaaS (cadence-pos).
//
// Runs on a 3-minute schedule. Uses a collectionGroup query to find every
// pending-qbp-responses doc across every tenant + store, groups by
// (tenantID, storeID), loads each store's QBP EFTP credentials from
// tenants/{tid}/stores/{sid}/vendor-credentials/qbp.creds, then opens one
// FTP connection per store to drain matching .por files from /in.
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
  // Load creds from vendor-credentials/qbp.creds (same path the worker uses).
  const credsSnap = await db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("vendor-credentials").doc("qbp")
    .get();

  const credsData = credsSnap.exists ? credsSnap.data() : null;
  const creds = (credsData && credsData.creds) || {};
  if (!creds.eftpUser || !creds.eftpPassword) {
    logger.warn("qbp-response-poller-saas: no creds for store, skipping group", {
      tenantID,
      storeID,
      count: entries.length,
    });
    return;
  }

  let client;
  try {
    client = await qbpHandler.openFtpClient(creds);
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
