/* eslint-disable */
// Phase 3 — DLQ ingestor for the twilio-events-dlq topic.
//
// Persists dead-lettered Twilio envelopes (inbound + outbound status both
// share this DLQ topic) into the `saas-twilio-dlq` Firestore collection so
// the admin portal can surface them for manual replay.
//
// retry: false — the DLQ ingest must not loop. If this write fails we
// accept the loss; Cloud Logging is the durable backstop.
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!admin.apps.length) admin.initializeApp();

exports.ingestor = onMessagePublished(
  {
    topic: "twilio-events-dlq",
    region: "us-central1",
    timeoutSeconds: 60,
    retry: false,
  },
  async (event) => {
    const envelope = event.data.message.json || {};
    const messageSid = envelope.messageSid || "unknown";
    const source = envelope.source || "unknown";

    logger.error("Twilio DLQ entry received", {
      messageSid,
      source,
      tenantID: envelope.tenantID,
      storeID: envelope.storeID,
      failureReason: envelope.failureReason,
      deliveryAttempt: envelope.deliveryAttempt,
    });

    const db = getFirestore();
    await db.collection("saas-twilio-dlq").add({
      messageSid,
      source,
      tenantID: envelope.tenantID || null,
      storeID: envelope.storeID || null,
      from: envelope.from || null,
      to: envelope.to || null,
      messageStatus: envelope.messageStatus || null,
      errorCode: envelope.errorCode || null,
      failureReason: envelope.failureReason || "unknown",
      deliveryAttempt: envelope.deliveryAttempt || null,
      envelope,
      firstSeenAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
      status: "new",
      retryCount: 0,
    });
  }
);
