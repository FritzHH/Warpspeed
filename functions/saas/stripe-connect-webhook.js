/* eslint-disable */
// Phase 4 — Option B Stripe Connect webhook ingestion.
//
// Receives Connect-event webhooks from Stripe, verifies the signature,
// looks up tenant/store routing from `payment-intents/{piID}` cache (set
// by stripe-connect-payment-intent.js at PI creation time), writes the
// single critical Firestore field that the UI listens to, publishes the
// full event to the `stripe-events` Pub/Sub topic, returns 200.
//
// Idempotency, charge enrichment, transaction-doc writes, reader cancel
// actions, refund finalization, account-state sync all happen in the
// subscriber (pubsub-subscriber.js).
//
// Latency budget (Option B target ≤300ms function-time):
//   signature verify      ~5-10ms
//   cache lookup          ~50-100ms (one Firestore read)
//   critical write        ~50-100ms (one Firestore write)
//   pub/sub publish       ~20-50ms
//   return 200            ~5ms
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");
const Stripe = require("stripe");

if (!admin.apps.length) admin.initializeApp();

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");
const STRIPE_CONNECT_WEBHOOK_SECRET = defineSecret("STRIPE_CONNECT_WEBHOOK_SECRET");

const EVENTS_TOPIC = "stripe-events";

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

exports.handler = onRequest(
  {
    region: "us-central1",
    cors: false,
    secrets: [STRIPE_PLATFORM_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET],
    timeoutSeconds: 30,
    // TODO(production): re-enable `minInstances: 1` before going live —
    // cold start eats the Option B latency budget (~250-550ms target).
  },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_CONNECT_WEBHOOK_SECRET.value()
      );
    } catch (err) {
      logger.error("stripeWebhookV2_Connect: signature verification failed", {
        error: err.message,
      });
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    const stripeEventID = event.id;
    const eventType = event.type;
    const livemode = event.livemode === true;
    const stripeAccountID = event.account || null;

    logger.info("stripeWebhookV2_Connect: received", {
      stripeEventID,
      eventType,
      livemode,
      stripeAccountID,
    });

    const db = getFirestore();

    // ── Critical synchronous write: PI-routed Terminal events ──
    // Only terminal.reader.action_* events drive the UI's "Payment Complete"
    // signal today. Everything else is enrichment and can happen in the
    // subscriber without blocking the merchant-visible signal.
    let criticalWriteOutcome = null;
    if (eventType === "terminal.reader.action_succeeded" || eventType === "terminal.reader.action_failed") {
      try {
        criticalWriteOutcome = await writeTerminalCriticalUpdate(db, event);
      } catch (err) {
        // Log but don't 500 — we still want to publish to Pub/Sub so the
        // subscriber gets its shot. Returning 500 would cause Stripe to
        // retry, which is fine, but we lose the publish on the first try.
        logger.error("stripeWebhookV2_Connect: critical write failed (continuing to publish)", {
          stripeEventID,
          eventType,
          error: err.message,
        });
        criticalWriteOutcome = { error: err.message };
      }
    }

    // ── Publish full event to Pub/Sub for async processing ──
    try {
      await pubsub()
        .topic(EVENTS_TOPIC)
        .publishMessage({
          json: {
            stripeEventID,
            eventType,
            livemode,
            stripeAccountID,
            publishedAt: new Date().toISOString(),
            ingestionFunctionVersion: "1.0",
            eventPayload: event,
          },
        });
    } catch (err) {
      logger.error("stripeWebhookV2_Connect: pub/sub publish failed", {
        stripeEventID,
        eventType,
        error: err.message,
      });
      // Return 500 so Stripe retries — better to over-deliver and rely on
      // subscriber dedup than to drop an event entirely.
      return res.status(500).send("pub/sub publish failed");
    }

    return res.status(200).json({
      received: true,
      stripeEventID,
      eventType,
      criticalWriteOutcome,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Critical write for Terminal reader-action events. Reads payment-intents
// cache to resolve tenant/store, then writes the action to
// `tenants/{tenantID}/stores/{storeID}/payment-processing/{readerID}/
//  payments/{paymentIntentID}/updates/current`.
// The UI's Firestore listener on that doc fires the "Payment Complete!" /
// "Payment Failed" signal.
// ─────────────────────────────────────────────────────────────────────────
async function writeTerminalCriticalUpdate(db, event) {
  const readerObj = event.data && event.data.object;
  const action = readerObj && readerObj.action;
  if (!action || !action.process_payment_intent) {
    return { skipped: "no process_payment_intent on reader action" };
  }

  const paymentIntentID = action.process_payment_intent.payment_intent;
  const readerID = readerObj.id;
  if (!paymentIntentID || !readerID) {
    return { skipped: "missing paymentIntentID or readerID" };
  }

  const cacheSnap = await db.collection("payment-intents").doc(paymentIntentID).get();
  if (!cacheSnap.exists) {
    logger.warn("writeTerminalCriticalUpdate: payment-intents cache miss", {
      paymentIntentID,
    });
    return { skipped: "cache miss", paymentIntentID };
  }

  const cache = cacheSnap.data() || {};
  const { tenantID, storeID } = cache;
  if (!tenantID || !storeID) {
    logger.warn("writeTerminalCriticalUpdate: cache entry missing tenantID/storeID", {
      paymentIntentID,
      cache,
    });
    return { skipped: "cache missing tenantID/storeID", paymentIntentID };
  }

  await db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .doc(storeID)
    .collection("payment-processing")
    .doc(readerID)
    .collection("payments")
    .doc(paymentIntentID)
    .collection("updates")
    .doc("current")
    .set({
      ...action,
      timestamp: FieldValue.serverTimestamp(),
      readerID,
      paymentIntentID,
    });

  return { written: true, tenantID, storeID, paymentIntentID };
}
