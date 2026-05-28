/* eslint-disable */
// Phase 3 — Pub/Sub subscribers for the stripe-billing-events topic.
//
// Mirrors the Connect-events subscriber pattern (pubsub-subscriber.js):
//   - Dedupes via processed-billing-events/{stripeEventID}
//   - Dispatches by event.type to a handler
//   - Routes to stripe-billing-events-dlq on delivery-attempt exhaustion
//
// The webhook (stripe-billing-webhook.js) already does the critical
// tenant-doc state mirror synchronously. The subscriber here is for
// enrichment that doesn't block the merchant-visible signal: audit logs,
// owner-email notifications, analytics, anything Stripe-API-heavy that
// might fail or run long.
//
// All handlers here are idempotent — webhook redelivery + Pub/Sub
// at-least-once means a single event may be processed multiple times; the
// processed-billing-events marker is the gate.
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");

if (!admin.apps.length) admin.initializeApp();

const MAX_DELIVERY_ATTEMPTS = 5;
const DLQ_TOPIC = "stripe-billing-events-dlq";

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

exports.handler = onMessagePublished(
  {
    topic: "stripe-billing-events",
    region: "us-central1",
    timeoutSeconds: 60,
    retry: true,
  },
  async (event) => {
    const envelope = event.data.message.json || {};
    const stripeEventID = envelope.stripeEventID;
    const eventType = envelope.eventType;
    const deliveryAttempt = event.data.deliveryAttempt || 1;

    if (!stripeEventID) {
      logger.error("billing subscriber: message missing stripeEventID — ack-and-drop", {
        envelope,
      });
      return;
    }

    logger.info("billing subscriber: received", {
      stripeEventID,
      eventType,
      deliveryAttempt,
    });

    if (deliveryAttempt > MAX_DELIVERY_ATTEMPTS) {
      logger.warn(
        "billing subscriber: max delivery attempts exceeded, routing to DLQ",
        { stripeEventID, deliveryAttempt }
      );
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
      return;
    }

    const db = getFirestore();
    const eventDoc = db.collection("processed-billing-events").doc(stripeEventID);

    try {
      await eventDoc.create({
        receivedAt: FieldValue.serverTimestamp(),
        eventType: eventType || null,
        deliveryAttempt,
        status: "processing",
      });
    } catch (err) {
      if (err && err.code === 6) {
        logger.info("billing subscriber: event already processed, dedup ack", {
          stripeEventID,
        });
        return;
      }
      throw err;
    }

    try {
      await dispatchByEventType(db, eventType, envelope);
      await eventDoc.set(
        { status: "success", processedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      logger.error(
        "billing subscriber: handler failed, deleting idempotency marker and rethrowing",
        { stripeEventID, eventType, error: err && err.message }
      );
      try {
        await eventDoc.delete();
      } catch (_) {
        // best effort
      }
      throw err;
    }
  }
);

async function dispatchByEventType(db, eventType, envelope) {
  switch (eventType) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(db, envelope);
      return;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(db, envelope);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(db, envelope);
      return;
    case "invoice.paid":
      await handleInvoicePaid(db, envelope);
      return;
    case "invoice.payment_failed":
      await handleInvoiceFailed(db, envelope, "payment_failed");
      return;
    case "invoice.payment_action_required":
      await handleInvoiceFailed(db, envelope, "payment_action_required");
      return;
    default:
      logger.info(
        "billing dispatchByEventType: no handler for event type (ack)",
        { eventType }
      );
      return;
  }
}

function readTenantIDFromMetadata(obj) {
  const md = (obj && obj.metadata) || {};
  return md.tenantID || null;
}

async function resolveTenantIDForCustomer(db, customerID) {
  if (!customerID) return null;
  const snap = await db
    .collection("tenants")
    .where("stripeBillingCustomerID", "==", customerID)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

// Write a billing changelog entry on the tenant doc — idempotent on
// (eventID + entryKind). Kept as a subcollection so the tenant doc stays
// lean and the changelog supports unbounded growth.
async function appendBillingChangelog(db, tenantID, entry) {
  if (!tenantID || !entry || !entry.eventID || !entry.kind) return;
  const ref = db
    .collection("tenants")
    .doc(tenantID)
    .collection("billing-changelog")
    .doc(`${entry.eventID}:${entry.kind}`);

  // create() throws on duplicate — we catch and treat as dedup ack.
  try {
    await ref.create({
      ...entry,
      writtenAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (err && err.code === 6) {
      // already-exists — redelivery, ignore
      return;
    }
    throw err;
  }
}

async function handleSubscriptionCreated(db, envelope) {
  const sub =
    envelope.eventPayload && envelope.eventPayload.data && envelope.eventPayload.data.object;
  if (!sub || !sub.id) return;
  let tenantID = readTenantIDFromMetadata(sub);
  if (!tenantID) tenantID = await resolveTenantIDForCustomer(db, sub.customer);
  if (!tenantID) {
    logger.warn("subscriber subscription.created: no tenantID resolved", {
      subscriptionID: sub.id,
    });
    return;
  }

  const priceID =
    sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price
      ? sub.items.data[0].price.id
      : null;

  await appendBillingChangelog(db, tenantID, {
    kind: "subscription_created",
    eventID: envelope.stripeEventID,
    subscriptionID: sub.id,
    status: sub.status,
    priceID,
    millis: Date.now(),
  });

  logger.info("subscriber subscription.created: changelog written", {
    tenantID,
    subscriptionID: sub.id,
  });
}

async function handleSubscriptionUpdated(db, envelope) {
  const sub =
    envelope.eventPayload && envelope.eventPayload.data && envelope.eventPayload.data.object;
  if (!sub || !sub.id) return;
  let tenantID = readTenantIDFromMetadata(sub);
  if (!tenantID) tenantID = await resolveTenantIDForCustomer(db, sub.customer);
  if (!tenantID) {
    logger.warn("subscriber subscription.updated: no tenantID resolved", {
      subscriptionID: sub.id,
    });
    return;
  }

  // Detect tier change by diffing the previous_attributes payload Stripe
  // sends on `.updated` events. Skip changelog if there was no items change.
  const prev = envelope.eventPayload && envelope.eventPayload.data && envelope.eventPayload.data.previous_attributes;
  const itemsChanged = prev && prev.items;
  if (!itemsChanged && !prev?.cancel_at_period_end && !prev?.status) {
    return;
  }

  const priceID =
    sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price
      ? sub.items.data[0].price.id
      : null;

  await appendBillingChangelog(db, tenantID, {
    kind: itemsChanged ? "subscription_tier_changed" : "subscription_updated",
    eventID: envelope.stripeEventID,
    subscriptionID: sub.id,
    status: sub.status,
    priceID,
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    millis: Date.now(),
  });
}

async function handleSubscriptionDeleted(db, envelope) {
  const sub =
    envelope.eventPayload && envelope.eventPayload.data && envelope.eventPayload.data.object;
  if (!sub || !sub.id) return;
  let tenantID = readTenantIDFromMetadata(sub);
  if (!tenantID) tenantID = await resolveTenantIDForCustomer(db, sub.customer);
  if (!tenantID) return;

  await appendBillingChangelog(db, tenantID, {
    kind: "subscription_canceled",
    eventID: envelope.stripeEventID,
    subscriptionID: sub.id,
    millis: Date.now(),
  });
}

async function handleInvoicePaid(db, envelope) {
  const inv =
    envelope.eventPayload && envelope.eventPayload.data && envelope.eventPayload.data.object;
  if (!inv || !inv.id) return;
  let tenantID = readTenantIDFromMetadata(inv);
  if (!tenantID && inv.subscription_details) {
    tenantID =
      (inv.subscription_details.metadata && inv.subscription_details.metadata.tenantID) ||
      null;
  }
  if (!tenantID) tenantID = await resolveTenantIDForCustomer(db, inv.customer);
  if (!tenantID) return;

  await appendBillingChangelog(db, tenantID, {
    kind: "invoice_paid",
    eventID: envelope.stripeEventID,
    invoiceID: inv.id,
    amountPaid: inv.amount_paid || 0,
    currency: inv.currency || "usd",
    millis: Date.now(),
  });
}

async function handleInvoiceFailed(db, envelope, kind) {
  const inv =
    envelope.eventPayload && envelope.eventPayload.data && envelope.eventPayload.data.object;
  if (!inv || !inv.id) return;
  let tenantID = readTenantIDFromMetadata(inv);
  if (!tenantID && inv.subscription_details) {
    tenantID =
      (inv.subscription_details.metadata && inv.subscription_details.metadata.tenantID) ||
      null;
  }
  if (!tenantID) tenantID = await resolveTenantIDForCustomer(db, inv.customer);
  if (!tenantID) return;

  await appendBillingChangelog(db, tenantID, {
    kind: kind === "payment_action_required" ? "invoice_action_required" : "invoice_failed",
    eventID: envelope.stripeEventID,
    invoiceID: inv.id,
    amountDue: inv.amount_due || 0,
    currency: inv.currency || "usd",
    attemptCount: inv.attempt_count || null,
    millis: Date.now(),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// DLQ ingestor — persists dead-lettered billing events into Firestore for
// the DLQ admin UI (shared collection `saas-dlq` with Connect-side entries;
// differentiated by `eventSource: "billing"`).
// ─────────────────────────────────────────────────────────────────────────
exports.ingestor = onMessagePublished(
  {
    topic: "stripe-billing-events-dlq",
    region: "us-central1",
    timeoutSeconds: 60,
    retry: false,
  },
  async (event) => {
    const envelope = event.data.message.json || {};
    const stripeEventID = envelope.stripeEventID || "unknown";
    const eventType = envelope.eventType || "unknown";

    logger.error("Billing DLQ entry received", {
      stripeEventID,
      eventType,
      failureReason: envelope.failureReason,
      deliveryAttempt: envelope.deliveryAttempt,
    });

    const db = getFirestore();
    await db.collection("saas-dlq").add({
      eventSource: "billing",
      stripeEventID,
      eventType,
      livemode: envelope.livemode === true,
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
