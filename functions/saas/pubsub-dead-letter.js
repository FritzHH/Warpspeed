/* eslint-disable */
// DLQ ingestor for the stripe-events-dlq topic.
//
// Phase 1 scaffold: persists every dead-lettered event into the saas-dlq
// Firestore collection so it can surface in the SaaS admin portal (Phase 9).
// Cloud Logging gets an error-level record in parallel for audit.
//
// retry: false — the DLQ ingest itself must not loop. If this write fails
// we accept the loss; Cloud Logging is the durable backstop.
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!admin.apps.length) admin.initializeApp();

exports.ingestor = onMessagePublished(
  {
    topic: "stripe-events-dlq",
    region: "us-central1",
    timeoutSeconds: 60,
    retry: false,
  },
  async (event) => {
    const envelope = event.data.message.json || {};
    const stripeEventID = envelope.stripeEventID || "unknown";
    const eventType = envelope.eventType || "unknown";

    logger.error("DLQ entry received", {
      stripeEventID,
      eventType,
      failureReason: envelope.failureReason,
      deliveryAttempt: envelope.deliveryAttempt,
    });

    const db = getFirestore();
    await db.collection("saas-dlq").add({
      stripeEventID,
      eventType,
      livemode: envelope.livemode === true,
      stripeAccountID: envelope.stripeAccountID || null,
      tenantID: envelope.tenantID || null,
      storeID: envelope.storeID || null,
      failureReason: envelope.failureReason || "unknown",
      deliveryAttempt: envelope.deliveryAttempt || null,
      eventPayload: envelope.eventPayload || envelope,
      firstSeenAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
      status: "new",
      retryCount: 0,
    });
  }
);
