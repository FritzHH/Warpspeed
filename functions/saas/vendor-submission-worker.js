/* eslint-disable */
// Vendor Order Submission — Pub/Sub worker.
//
// Subscribes to the `vendor-order-submissions` topic. For each message:
//
//   1. Idempotency gate: atomic create on
//      vendor-submissions-processing/{submissionID}. If the doc already
//      exists, this is a redelivery — ack-and-drop.
//   2. Load the submission doc, the order header, items subcollection,
//      and the vendor's split state (connection from Firestore
//      vendor_connections/{vendor}, secrets from Secret Manager) via
//      loadVendorState (see functions/saas/vendor-creds.js).
//   3. Resolve a handler from the registry (functions/vendors/) and call
//      handler.submit({ order, items, connection, secrets, ctx }).
//   4. Write the result back onto the submission doc with status
//      "success" | "failure" and either `result` or `error`.
//   5. On exception with delivery-attempt > MAX_DELIVERY_ATTEMPTS, route
//      the original envelope to the `vendor-order-submissions-dlq` topic
//      (admin DLQ ingestor takes it from there).
//
// Note: vendor handlers run with extended timeout (FTP/HTTP can be slow).
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");
const vendorRegistry = require("../vendors");
const { loadVendorState } = require("./vendor-creds");

if (!admin.apps.length) admin.initializeApp();

const MAX_DELIVERY_ATTEMPTS = 5;
const DLQ_TOPIC = "vendor-order-submissions-dlq";

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

function submissionRef(db, tenantID, storeID, submissionID) {
  return db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("vendor-submissions").doc(submissionID);
}

function processingRef(db, submissionID) {
  return db.collection("vendor-submissions-processing").doc(submissionID);
}

exports.handler = onMessagePublished(
  {
    topic: "vendor-order-submissions",
    region: "us-central1",
    timeoutSeconds: 540, // up to 9 min — FTP retries / API backoff can be slow
    memory: "512MiB",
    retry: true,
    secrets: vendorRegistry.ALL_HANDLER_SECRETS,
  },
  async (event) => {
    const envelope = (event.data && event.data.message && event.data.message.json) || {};
    const { tenantID, storeID, vendorID, orderID, submissionID } = envelope;
    const deliveryAttempt = (event.data && event.data.deliveryAttempt) || 1;

    if (!tenantID || !storeID || !vendorID || !orderID || !submissionID) {
      logger.error("worker: message missing required fields — ack-and-drop", { envelope });
      return;
    }

    logger.info("worker: received", {
      tenantID,
      storeID,
      vendorID,
      orderID,
      submissionID,
      deliveryAttempt,
    });

    // ── DLQ on too many attempts ──
    if (deliveryAttempt > MAX_DELIVERY_ATTEMPTS) {
      logger.warn("worker: max delivery attempts exceeded, routing to DLQ", {
        submissionID,
        deliveryAttempt,
      });
      try {
        await pubsub()
          .topic(DLQ_TOPIC)
          .publishMessage({
            json: {
              ...envelope,
              failureReason: "max-delivery-attempts-exceeded",
              deliveryAttempt,
              routedAt: new Date().toISOString(),
            },
          });
      } catch (err) {
        logger.error("worker: DLQ publish failed", {
          submissionID,
          error: err && err.message,
        });
      }
      // Mark the submission failed so the UI stops spinning.
      try {
        const db = getFirestore();
        await submissionRef(db, tenantID, storeID, submissionID).set(
          {
            status: "failure",
            error: "Maximum retry attempts exhausted.",
            completedMillis: Date.now(),
            attemptCount: deliveryAttempt,
          },
          { merge: true }
        );
      } catch (err) {
        logger.error("worker: submission DLQ-stamp write failed", {
          submissionID,
          error: err && err.message,
        });
      }
      return;
    }

    const db = getFirestore();

    // ── Idempotency gate ──
    const procRef = processingRef(db, submissionID);
    try {
      await procRef.create({
        startedAt: FieldValue.serverTimestamp(),
        tenantID,
        storeID,
        vendorID,
        orderID,
        deliveryAttempt,
        status: "processing",
      });
    } catch (err) {
      if (err && err.code === 6) {
        // ALREADY_EXISTS — dedup ack.
        logger.info("worker: already processed, dedup ack", { submissionID });
        return;
      }
      throw err;
    }

    try {
      // ── Mark submission running ──
      await submissionRef(db, tenantID, storeID, submissionID).set(
        {
          status: "running",
          startedMillis: Date.now(),
          attemptCount: deliveryAttempt,
        },
        { merge: true }
      );

      // ── Load order + items + vendor split state ──
      const orderRef = db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("vendor-orders").doc(orderID);

      const [orderSnap, itemsSnap, vendorState] = await Promise.all([
        orderRef.get(),
        orderRef.collection("items").get(),
        loadVendorState(db, vendorID, tenantID, storeID),
      ]);

      if (!orderSnap.exists) {
        throw new Error(`Order ${orderID} not found.`);
      }
      const order = orderSnap.data() || {};
      const items = itemsSnap.docs
        .map((d) => d.data() || {})
        .sort((a, b) => Number(a.addedMillis || 0) - Number(b.addedMillis || 0));

      const { connection, secrets } = vendorState;

      // ── Resolve handler ──
      // Locked vendors only — custom vendors are CSV-download on the client
      // and never reach this worker.
      const handler = vendorRegistry.getHandler(vendorID);
      if (!handler) {
        throw new Error(
          `No handler registered for vendor "${vendorID}" — only locked vendors (jbi, qbp) submit through Pub/Sub.`
        );
      }

      // ── Invoke ──
      const ctx = {
        tenantID,
        storeID,
        vendorID,
        orderID,
        submissionID,
        logger,
      };
      const result = await handler.submit({
        order,
        items,
        connection,
        secrets,
        ctx,
      });

      // ── Stamp success ──
      const completedMs = Date.now();
      await submissionRef(db, tenantID, storeID, submissionID).set(
        {
          status: "success",
          result: result || null,
          completedMillis: completedMs,
        },
        { merge: true }
      );

      // Best-effort: flip the source order to submitted so the UI can hide
      // it from "open orders" lists.
      try {
        await orderRef.set(
          {
            status: "submitted",
            submittedMillis: completedMs,
            submittedToVendorID: vendorID,
            submissionID,
          },
          { merge: true }
        );
      } catch (err) {
        logger.warn("worker: order status flip failed (non-fatal)", {
          submissionID,
          orderID,
          error: err && err.message,
        });
      }

      await procRef.set(
        { status: "success", completedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );

      logger.info("worker: submission complete", {
        tenantID,
        storeID,
        vendorID,
        orderID,
        submissionID,
      });
    } catch (err) {
      const errorMessage = (err && err.message) || String(err);
      logger.error("worker: handler failed", {
        submissionID,
        error: errorMessage,
        stack: err && err.stack,
      });

      // Stamp the submission with the error so the UI can show it.
      try {
        await submissionRef(db, tenantID, storeID, submissionID).set(
          {
            status: "failure",
            error: errorMessage,
            failedAttempt: deliveryAttempt,
            lastErrorMillis: Date.now(),
          },
          { merge: true }
        );
      } catch (writeErr) {
        logger.error("worker: submission failure-stamp write failed", {
          submissionID,
          error: writeErr && writeErr.message,
        });
      }

      // Delete the idempotency marker so the next delivery attempt gets to
      // run the handler. Match the stripe-events subscriber pattern.
      try {
        await procRef.delete();
      } catch (_) {
        // best effort
      }

      // Rethrow so Pub/Sub schedules a retry (until MAX_DELIVERY_ATTEMPTS).
      throw err;
    }
  }
);
