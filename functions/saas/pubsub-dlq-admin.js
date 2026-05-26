/* eslint-disable */
// Phase 9 — DLQ admin functions: retry, status update, escalation.
//
// Three functions, all backed by the `saas-dlq` Firestore collection that
// `pubsub-dead-letter.js` populates whenever the subscriber sends an event
// to the dead-letter topic after exhausting retries:
//
//   - dlqRetryCallable          Republishes a DLQ entry back to the main
//                               `stripe-events` topic so the subscriber
//                               can retry. Bumps `retryCount`, stamps
//                               `lastRetryAt`.
//
//   - dlqUpdateStatusCallable   Moves an entry through its lifecycle:
//                               new → acknowledged → resolved (or directly
//                               to resolved). Optional note + actor audit.
//
//   - dlqEscalationCheckScheduled
//                               Every 30 min, scans for `status == "new"`
//                               entries older than 1h. Stamps the entry
//                               with `escalated: true` + bumps a counter
//                               so the admin UI can render a "critical"
//                               badge. SMS hookup deferred until a SaaS
//                               admin phone number is configured.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");

if (!admin.apps.length) admin.initializeApp();

const EVENTS_TOPIC = "stripe-events";
const ESCALATION_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const ESCALATION_BATCH_LIMIT = 50;

const ALLOWED_STATUSES = new Set(["new", "acknowledged", "resolved", "ignored"]);

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

exports.dlqRetryCallable = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    const auth = requireAuth(request);

    const { dlqDocID } = request.data || {};
    if (!dlqDocID || typeof dlqDocID !== "string") {
      throw new HttpsError("invalid-argument", "dlqDocID is required.");
    }

    const db = getFirestore();
    const dlqRef = db.collection("saas-dlq").doc(dlqDocID);
    const snap = await dlqRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", `DLQ entry ${dlqDocID} not found.`);
    }
    const dlqDoc = snap.data() || {};

    if (dlqDoc.status === "resolved" || dlqDoc.status === "ignored") {
      throw new HttpsError(
        "failed-precondition",
        `DLQ entry is already in terminal state '${dlqDoc.status}'.`
      );
    }

    const eventPayload = dlqDoc.eventPayload;
    if (!eventPayload || typeof eventPayload !== "object") {
      throw new HttpsError("failed-precondition", "DLQ entry has no replayable payload.");
    }

    const republishEnvelope = {
      stripeEventID: dlqDoc.stripeEventID || (eventPayload && eventPayload.id) || "unknown",
      eventType: dlqDoc.eventType || (eventPayload && eventPayload.type) || "unknown",
      livemode: dlqDoc.livemode === true,
      stripeAccountID: dlqDoc.stripeAccountID || (eventPayload && eventPayload.account) || null,
      publishedAt: new Date().toISOString(),
      ingestionFunctionVersion: "dlq-retry-1.0",
      eventPayload,
      isDLQRetry: true,
      dlqDocID,
      dlqRetryByUID: auth.uid,
    };

    logger.info("dlqRetryCallable: republishing event", {
      dlqDocID,
      stripeEventID: republishEnvelope.stripeEventID,
      eventType: republishEnvelope.eventType,
      uid: auth.uid,
    });

    let messageID;
    try {
      messageID = await pubsub()
        .topic(EVENTS_TOPIC)
        .publishMessage({ json: republishEnvelope });
    } catch (err) {
      logger.error("dlqRetryCallable: republish failed", {
        dlqDocID,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Republish failed.");
    }

    await dlqRef.set(
      {
        retryCount: FieldValue.increment(1),
        lastRetryAt: FieldValue.serverTimestamp(),
        lastRetryByUID: auth.uid,
        lastRetryMessageID: messageID,
      },
      { merge: true }
    );

    // IMPORTANT: subscriber dedup uses `processed-events/{stripeEventID}`.
    // If the original event ran far enough to write that dedup record
    // before failing, a naive retry will be ignored. Clear that record
    // here so the retry actually exercises the handler.
    if (republishEnvelope.stripeEventID && republishEnvelope.stripeEventID !== "unknown") {
      try {
        await db
          .collection("processed-events")
          .doc(republishEnvelope.stripeEventID)
          .delete();
      } catch (err) {
        logger.warn("dlqRetryCallable: could not clear processed-events record", {
          stripeEventID: republishEnvelope.stripeEventID,
          error: err && err.message,
        });
      }
    }

    return {
      success: true,
      messageID,
      dlqDocID,
    };
  }
);

exports.dlqUpdateStatusCallable = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    const auth = requireAuth(request);

    const { dlqDocID, status, note } = request.data || {};
    if (!dlqDocID || typeof dlqDocID !== "string") {
      throw new HttpsError("invalid-argument", "dlqDocID is required.");
    }
    if (!status || !ALLOWED_STATUSES.has(status)) {
      throw new HttpsError(
        "invalid-argument",
        `status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}.`
      );
    }

    const db = getFirestore();
    const dlqRef = db.collection("saas-dlq").doc(dlqDocID);
    const snap = await dlqRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", `DLQ entry ${dlqDocID} not found.`);
    }

    const auditEntry = {
      action: "status-change",
      fromStatus: (snap.data() || {}).status || null,
      toStatus: status,
      note: note || null,
      uid: auth.uid,
      at: Date.now(),
    };

    const updates = {
      status,
      statusUpdatedAt: FieldValue.serverTimestamp(),
      statusUpdatedByUID: auth.uid,
      audit: FieldValue.arrayUnion(auditEntry),
    };
    if (note) updates.lastNote = note;
    if (status === "resolved") {
      updates.resolvedAt = FieldValue.serverTimestamp();
      updates.resolvedByUID = auth.uid;
    }

    await dlqRef.set(updates, { merge: true });

    logger.info("dlqUpdateStatusCallable: status updated", {
      dlqDocID,
      status,
      uid: auth.uid,
    });

    return { success: true, dlqDocID, status };
  }
);

exports.dlqEscalationCheckScheduled = onSchedule(
  {
    schedule: "every 30 minutes",
    region: "us-central1",
    timeZone: "UTC",
    timeoutSeconds: 120,
  },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromDate(new Date(Date.now() - ESCALATION_THRESHOLD_MS));

    // Stale "new" entries: untouched for >1h. These are the ones that need
    // a human looking at them.
    const staleSnap = await db
      .collection("saas-dlq")
      .where("status", "==", "new")
      .where("firstSeenAt", "<=", cutoff)
      .limit(ESCALATION_BATCH_LIMIT)
      .get();

    if (staleSnap.empty) {
      logger.info("dlqEscalationCheckScheduled: no stale DLQ entries");
      return;
    }

    logger.warn("dlqEscalationCheckScheduled: stale DLQ entries detected", {
      count: staleSnap.size,
    });

    const batch = db.batch();
    staleSnap.forEach((doc) => {
      batch.set(
        doc.ref,
        {
          escalated: true,
          escalationCount: FieldValue.increment(1),
          lastEscalatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();

    // SMS hookup deferred until SaaS admin phone number is configured.
    // For now, the dashboard's "needs attention" badge surfaces these.
  }
);
