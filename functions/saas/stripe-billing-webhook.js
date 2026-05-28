/* eslint-disable */
// Phase 3 — Stripe Billing webhook (platform-account events).
//
// Receives invoice.* + customer.subscription.* events from the cadence-pos
// platform Stripe account (NOT Connect). Verifies signature with
// STRIPE_BILLING_WEBHOOK_SECRET, writes the critical tenant-doc fields
// synchronously, publishes the event to Pub/Sub for async enrichment,
// returns 200.
//
// Sync-critical writes:
//   - customer.subscription.created/updated → subscriptionStatus,
//     stripeSubscriptionID, stripeSubscriptionPriceID, clear grace if active
//   - customer.subscription.deleted        → subscriptionStatus=canceled,
//     null out subscriptionID + priceID
//   - invoice.paid                         → subscriptionStatus=active,
//     clear grace, store invoice snapshot
//   - invoice.payment_failed               → subscriptionStatus=past_due,
//     set grace if currently null (preserve original grace start across
//     retries), store invoice snapshot
//   - invoice.payment_action_required      → same as payment_failed for
//     status (client surfaces SCA prompt in Phase 4)
//
// Idempotency: dedupe is owned by the Pub/Sub subscriber via
// processed-billing-events/{eventID}. The sync write here is idempotent on
// its own fields (status flips, mirrors of Stripe state) so a redelivered
// event re-applying the same write is safe.
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");
const Stripe = require("stripe");

if (!admin.apps.length) admin.initializeApp();

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");
const STRIPE_BILLING_WEBHOOK_SECRET = defineSecret("STRIPE_BILLING_WEBHOOK_SECRET");

const EVENTS_TOPIC = "stripe-billing-events";
const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

exports.handler = onRequest(
  {
    region: "us-central1",
    cors: false,
    secrets: [STRIPE_PLATFORM_SECRET_KEY, STRIPE_BILLING_WEBHOOK_SECRET],
    timeoutSeconds: 30,
  },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_BILLING_WEBHOOK_SECRET.value()
      );
    } catch (err) {
      logger.error("stripeWebhookV2_Billing: signature verification failed", {
        error: err.message,
      });
      return res
        .status(400)
        .send(`Webhook signature verification failed: ${err.message}`);
    }

    const stripeEventID = event.id;
    const eventType = event.type;
    const livemode = event.livemode === true;

    logger.info("stripeWebhookV2_Billing: received", {
      stripeEventID,
      eventType,
      livemode,
    });

    const db = getFirestore();

    // ── Critical synchronous write — tenant-doc state mirror ──
    let criticalWriteOutcome = null;
    try {
      criticalWriteOutcome = await applyCriticalUpdate(db, event);
    } catch (err) {
      // Log but don't 500 — we still want to publish to Pub/Sub so the
      // subscriber gets its shot at enrichment. Returning 500 would cause
      // Stripe to retry, which would re-deliver the same publish.
      logger.error(
        "stripeWebhookV2_Billing: critical write failed (continuing to publish)",
        { stripeEventID, eventType, error: err.message }
      );
      criticalWriteOutcome = { error: err.message };
    }

    // ── Publish to Pub/Sub for async enrichment ──
    try {
      await pubsub()
        .topic(EVENTS_TOPIC)
        .publishMessage({
          json: {
            stripeEventID,
            eventType,
            livemode,
            publishedAt: new Date().toISOString(),
            ingestionFunctionVersion: "1.0",
            eventPayload: event,
          },
        });
    } catch (err) {
      logger.error("stripeWebhookV2_Billing: pub/sub publish failed", {
        stripeEventID,
        eventType,
        error: err.message,
      });
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
// Routes a billing event to its critical writer. Each writer resolves
// the tenantID (via subscription/invoice metadata or customer-ID lookup)
// and updates the tenant doc with the new mirrored state.
// ─────────────────────────────────────────────────────────────────────────
async function applyCriticalUpdate(db, event) {
  const eventType = event.type;
  switch (eventType) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return handleSubscriptionUpsert(db, event);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(db, event);
    case "invoice.paid":
      return handleInvoicePaid(db, event);
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
      return handleInvoiceFailed(db, event, eventType);
    default:
      return { skipped: "no critical writer for event type", eventType };
  }
}

// Lookup the tenantID this event belongs to. Two paths:
//   1. Subscription/invoice metadata carries tenantID — preferred.
//   2. Fall back to customer ID → tenants where stripeBillingCustomerID==X.
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

function readTenantIDFromMetadata(obj) {
  const md = (obj && obj.metadata) || {};
  return md.tenantID || null;
}

async function handleSubscriptionUpsert(db, event) {
  const sub = event.data && event.data.object;
  if (!sub || !sub.id) {
    return { skipped: "no subscription object" };
  }
  let tenantID = readTenantIDFromMetadata(sub);
  if (!tenantID) {
    tenantID = await resolveTenantIDForCustomer(db, sub.customer);
  }
  if (!tenantID) {
    logger.warn("subscription.upsert: no tenantID resolved", {
      subscriptionID: sub.id,
      customerID: sub.customer,
    });
    return { skipped: "no tenantID resolved", subscriptionID: sub.id };
  }

  const tenantRef = db.collection("tenants").doc(tenantID);
  const snap = await tenantRef.get();
  if (!snap.exists) {
    logger.warn("subscription.upsert: tenant doc not found", { tenantID });
    return { skipped: "tenant not found", tenantID };
  }

  const priceID =
    sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price
      ? sub.items.data[0].price.id
      : null;

  const update = {
    subscriptionStatus: sub.status,
    stripeSubscriptionID: sub.id,
    stripeSubscriptionPriceID: priceID,
    subscriptionCancelAtPeriodEnd: sub.cancel_at_period_end === true,
    subscriptionCurrentPeriodEnd: sub.current_period_end || null,
    lastBillingEventAt: FieldValue.serverTimestamp(),
  };
  // Clear grace only when fully active. past_due/incomplete should keep
  // any grace already started.
  if (sub.status === "active") {
    update.subscriptionGraceUntil = null;
  }

  await tenantRef.set(update, { merge: true });

  return {
    written: true,
    tenantID,
    subscriptionID: sub.id,
    status: sub.status,
    priceID,
  };
}

async function handleSubscriptionDeleted(db, event) {
  const sub = event.data && event.data.object;
  if (!sub || !sub.id) {
    return { skipped: "no subscription object" };
  }
  let tenantID = readTenantIDFromMetadata(sub);
  if (!tenantID) {
    tenantID = await resolveTenantIDForCustomer(db, sub.customer);
  }
  if (!tenantID) {
    logger.warn("subscription.deleted: no tenantID resolved", {
      subscriptionID: sub.id,
    });
    return { skipped: "no tenantID resolved", subscriptionID: sub.id };
  }

  const tenantRef = db.collection("tenants").doc(tenantID);
  await tenantRef.set(
    {
      subscriptionStatus: "canceled",
      stripeSubscriptionID: null,
      stripeSubscriptionPriceID: null,
      subscriptionCancelAtPeriodEnd: false,
      subscriptionCanceledAt: FieldValue.serverTimestamp(),
      lastBillingEventAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info("subscription.deleted: tenant marked canceled", {
    tenantID,
    subscriptionID: sub.id,
  });

  return { written: true, tenantID, subscriptionID: sub.id };
}

async function handleInvoicePaid(db, event) {
  const inv = event.data && event.data.object;
  if (!inv || !inv.id) {
    return { skipped: "no invoice object" };
  }
  let tenantID = readTenantIDFromMetadata(inv);
  if (!tenantID && inv.subscription_details) {
    tenantID =
      (inv.subscription_details.metadata && inv.subscription_details.metadata.tenantID) ||
      null;
  }
  if (!tenantID) {
    tenantID = await resolveTenantIDForCustomer(db, inv.customer);
  }
  if (!tenantID) {
    logger.warn("invoice.paid: no tenantID resolved", { invoiceID: inv.id });
    return { skipped: "no tenantID resolved", invoiceID: inv.id };
  }

  const tenantRef = db.collection("tenants").doc(tenantID);
  await tenantRef.set(
    {
      subscriptionStatus: "active",
      subscriptionGraceUntil: null,
      lastInvoicePaidAt: FieldValue.serverTimestamp(),
      lastBillingEventAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Write invoice snapshot for the tenant billing UI (Phase 4).
  await tenantRef.collection("billing-invoices").doc(inv.id).set(
    {
      invoiceID: inv.id,
      number: inv.number || null,
      status: inv.status,
      amountPaid: inv.amount_paid || 0,
      amountDue: inv.amount_due || 0,
      currency: inv.currency || "usd",
      created: inv.created || null,
      periodStart: inv.period_start || null,
      periodEnd: inv.period_end || null,
      hostedInvoiceURL: inv.hosted_invoice_url || null,
      invoicePDF: inv.invoice_pdf || null,
      subscriptionID: inv.subscription || null,
      lastEventAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { written: true, tenantID, invoiceID: inv.id, status: "paid" };
}

async function handleInvoiceFailed(db, event, eventType) {
  const inv = event.data && event.data.object;
  if (!inv || !inv.id) {
    return { skipped: "no invoice object" };
  }
  let tenantID = readTenantIDFromMetadata(inv);
  if (!tenantID && inv.subscription_details) {
    tenantID =
      (inv.subscription_details.metadata && inv.subscription_details.metadata.tenantID) ||
      null;
  }
  if (!tenantID) {
    tenantID = await resolveTenantIDForCustomer(db, inv.customer);
  }
  if (!tenantID) {
    logger.warn("invoice.failed: no tenantID resolved", {
      invoiceID: inv.id,
      eventType,
    });
    return { skipped: "no tenantID resolved", invoiceID: inv.id };
  }

  const tenantRef = db.collection("tenants").doc(tenantID);
  const snap = await tenantRef.get();
  const tenantData = snap.exists ? snap.data() || {} : {};

  // Preserve original grace start across retries. Stripe retries failed
  // invoices automatically (default 3-4 times over ~3 weeks); each retry
  // emits another payment_failed, but we want a single 30-day window from
  // the FIRST failure.
  const existingGrace = tenantData.subscriptionGraceUntil;
  const existingGraceMs =
    existingGrace && typeof existingGrace.toMillis === "function"
      ? existingGrace.toMillis()
      : typeof existingGrace === "number"
        ? existingGrace
        : null;

  const update = {
    subscriptionStatus: "past_due",
    lastBillingEventAt: FieldValue.serverTimestamp(),
    lastInvoiceFailedAt: FieldValue.serverTimestamp(),
    lastInvoiceFailureCode: inv.last_finalization_error
      ? inv.last_finalization_error.code || null
      : null,
  };
  if (!existingGraceMs) {
    update.subscriptionGraceUntil = Timestamp.fromMillis(
      Date.now() + GRACE_PERIOD_MS
    );
  }

  await tenantRef.set(update, { merge: true });

  // Write invoice snapshot.
  await tenantRef.collection("billing-invoices").doc(inv.id).set(
    {
      invoiceID: inv.id,
      number: inv.number || null,
      status: inv.status,
      amountPaid: inv.amount_paid || 0,
      amountDue: inv.amount_due || 0,
      currency: inv.currency || "usd",
      created: inv.created || null,
      periodStart: inv.period_start || null,
      periodEnd: inv.period_end || null,
      hostedInvoiceURL: inv.hosted_invoice_url || null,
      invoicePDF: inv.invoice_pdf || null,
      subscriptionID: inv.subscription || null,
      attemptCount: inv.attempt_count || null,
      lastFailureEventType: eventType,
      lastEventAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.warn("invoice.failed: tenant marked past_due", {
    tenantID,
    invoiceID: inv.id,
    eventType,
    graceStarted: !existingGraceMs,
  });

  return {
    written: true,
    tenantID,
    invoiceID: inv.id,
    status: "past_due",
    graceStarted: !existingGraceMs,
  };
}
