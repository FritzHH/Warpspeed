/* eslint-disable */
// QBP .por response poller — Bonita.
//
// Runs on a 3-minute schedule. For every pending .poi upload tracked at
//   tenants/bonita/stores/bonita/pending-qbp-responses/{eftpFilename}
// it opens one FTP connection to eftp.qbp.com, lists /in, and for any
// matching .por:
//
//   1. Downloads the body.
//   2. Parses RSLT codes via shared parsePorBody (functions/vendors/qbp.js).
//   3. Updates the original submission doc with vendorResponse + final
//      status (success-confirmed | failure).
//   4. Deletes the .por from /in so the dealer's directory doesn't fill up.
//   5. Deletes the pending tracking doc.
//
// Stale handling: pending entries older than QBP_RESPONSE_TIMEOUT_HOURS get
// their submission flipped to failure + tracking doc cleaned up. Default 6h
// — QBP processing rarely exceeds 30 min; 6h is "definitely lost or QBP is
// down for the day."
//
// One FTP connection per run regardless of pending count. The connection is
// reused for list + download + delete on every match before close.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { Writable } = require("stream");

const qbpHandler = require("../vendors/qbp");

if (!admin.apps.length) admin.initializeApp();

const QBP_EFTP_USER = defineSecret("QBP_EFTP_USER");
const QBP_EFTP_PASSWORD = defineSecret("QBP_EFTP_PASSWORD");

const BONITA_TENANT_ID = "bonita";
const BONITA_STORE_ID = "bonita";
const RESPONSE_TIMEOUT_HOURS = 6;

exports.qbpResponsePollerBonita = onSchedule(
  {
    schedule: "every 3 minutes",
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "256MiB",
    secrets: [QBP_EFTP_USER, QBP_EFTP_PASSWORD],
  },
  async () => {
    const db = getFirestore();
    const pendingCol = db
      .collection("tenants").doc(BONITA_TENANT_ID)
      .collection("stores").doc(BONITA_STORE_ID)
      .collection("pending-qbp-responses");

    const pendingSnap = await pendingCol.get();
    if (pendingSnap.empty) {
      return;
    }

    const pendings = pendingSnap.docs.map((d) => ({
      id: d.id,
      ref: d.ref,
      data: d.data() || {},
    }));

    logger.info("qbp-response-poller-bonita: pending entries", {
      count: pendings.length,
    });

    // Split into fresh vs stale buckets — stale entries don't need FTP work.
    const now = Date.now();
    const staleCutoff = now - RESPONSE_TIMEOUT_HOURS * 3600 * 1000;
    const fresh = [];
    const stale = [];
    for (const p of pendings) {
      const uploadedMillis = Number(p.data.uploadedMillis) || 0;
      if (uploadedMillis && uploadedMillis < staleCutoff) {
        stale.push(p);
      } else {
        fresh.push(p);
      }
    }

    // Stale: flip submission to failure, drop the pending doc.
    for (const s of stale) {
      try {
        await markSubmissionFailure(db, s, {
          reason: `QBP response timeout (>${RESPONSE_TIMEOUT_HOURS}h with no .por in /in).`,
        });
        await s.ref.delete();
        logger.warn("qbp-response-poller-bonita: stale entry cleaned", {
          eftpFilename: s.id,
          submissionID: s.data.submissionID,
        });
      } catch (err) {
        logger.error("qbp-response-poller-bonita: stale cleanup failed", {
          eftpFilename: s.id,
          error: err && err.message,
        });
      }
    }

    if (fresh.length === 0) return;

    const creds = {
      eftpUser: QBP_EFTP_USER.value() || "",
      eftpPassword: QBP_EFTP_PASSWORD.value() || "",
    };
    if (!creds.eftpUser || !creds.eftpPassword) {
      logger.error(
        "qbp-response-poller-bonita: QBP_EFTP_USER / QBP_EFTP_PASSWORD secrets not set"
      );
      return;
    }

    let client;
    try {
      client = await qbpHandler.openFtpClient(creds);
    } catch (err) {
      logger.error("qbp-response-poller-bonita: FTP connect failed", {
        error: err && err.message,
      });
      return;
    }

    try {
      const inListing = await listInDirectory(client);
      const porNames = new Set(
        inListing
          .filter((f) => f && f.name && /\.por$/i.test(f.name))
          .map((f) => f.name.toLowerCase())
      );

      for (const p of fresh) {
        const expected = `${p.id}.por`.toLowerCase();
        if (!porNames.has(expected)) {
          // Bump attempts so we can see polling cadence in Firestore.
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

          logger.info("qbp-response-poller-bonita: response processed", {
            eftpFilename: p.id,
            submissionID: p.data.submissionID,
            ok: parsed.ok,
            warningCount: parsed.warningCodes.length,
            fatalCount: parsed.fatalCodes.length,
          });
        } catch (err) {
          logger.error("qbp-response-poller-bonita: per-entry failure", {
            eftpFilename: p.id,
            error: err && err.message,
          });
        }
      }
    } finally {
      client.close();
    }
  }
);

function listInDirectory(client) {
  // /in may not exist on first contact; tolerate that.
  return client.list("/in").catch(() => []);
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
      // If fatal, also write a top-level error string so the UI's existing
      // error-display logic picks it up.
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
