/* eslint-disable */
// Pub/Sub subscriber for the stripe-events topic.
//
// Phase 1 scaffold: receives the event, dedupes via processed-events/{eventID},
// dispatches by event.type to a stub handler, and routes to the DLQ topic on
// delivery-attempt exhaustion. Real per-event handlers ship in later phases.
//
// Idempotency contract: subscribers may receive the same message more than
// once (Pub/Sub at-least-once delivery). The atomic create on
// processed-events/{stripeEventID} is the gate.
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");
const Stripe = require("stripe");

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");
const MAX_DELIVERY_ATTEMPTS = 5;
const DLQ_TOPIC = "stripe-events-dlq";

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

if (!admin.apps.length) admin.initializeApp();

exports.handler = onMessagePublished(
  {
    topic: "stripe-events",
    region: "us-central1",
    timeoutSeconds: 60,
    retry: true,
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (event) => {
    const envelope = event.data.message.json || {};
    const stripeEventID = envelope.stripeEventID;
    const eventType = envelope.eventType;
    const deliveryAttempt = event.data.deliveryAttempt || 1;

    if (!stripeEventID) {
      logger.error("subscriber: message missing stripeEventID — ack-and-drop", { envelope });
      return;
    }

    logger.info("subscriber: received", { stripeEventID, eventType, deliveryAttempt });

    if (deliveryAttempt > MAX_DELIVERY_ATTEMPTS) {
      logger.warn("subscriber: max delivery attempts exceeded, routing to DLQ", {
        stripeEventID,
        deliveryAttempt,
      });
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
    const eventDoc = db.collection("processed-events").doc(stripeEventID);

    try {
      await eventDoc.create({
        receivedAt: FieldValue.serverTimestamp(),
        eventType: eventType || null,
        deliveryAttempt,
        status: "processing",
      });
    } catch (err) {
      if (err && err.code === 6) {
        logger.info("subscriber: event already processed, dedup ack", { stripeEventID });
        return;
      }
      throw err;
    }

    try {
      await dispatchByEventType(eventType, envelope);
      await eventDoc.set(
        { status: "success", processedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      logger.error("subscriber: handler failed, deleting idempotency marker and rethrowing", {
        stripeEventID,
        eventType,
        error: err && err.message,
      });
      try {
        await eventDoc.delete();
      } catch (_) {
        // best effort
      }
      throw err;
    }
  }
);

async function dispatchByEventType(eventType, envelope) {
  switch (eventType) {
    case "account.updated":
      await handleAccountUpdated(envelope);
      return;
    case "account.application.deauthorized":
      await handleAccountDeauthorized(envelope);
      return;
    case "payout.paid":
      await handlePayout(envelope, "paid");
      return;
    case "payout.failed":
      await handlePayout(envelope, "failed");
      return;
    case "terminal.reader.action_succeeded":
      await handleTerminalActionSucceeded(envelope);
      return;
    case "terminal.reader.action_failed":
      await handleTerminalActionFailed(envelope);
      return;
    case "charge.refunded":
      await handleChargeRefunded(envelope);
      return;
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated":
      await handleChargeDispute(envelope, eventType);
      return;
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(envelope);
      return;
    case "checkout.session.expired":
      await handleCheckoutSessionExpired(envelope);
      return;
    default:
      // Unhandled types still ack successfully so we don't DLQ Stripe
      // events we just haven't wired yet.
      logger.info("dispatchByEventType: no handler for event type (ack)", { eventType });
      return;
  }
}

let _stripeClient = null;
function getStripeClient() {
  if (_stripeClient) return _stripeClient;
  _stripeClient = new Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
  return _stripeClient;
}

async function loadPaymentIntentCache(paymentIntentID) {
  const db = getFirestore();
  const snap = await db.collection("payment-intents").doc(paymentIntentID).get();
  if (!snap.exists) return null;
  return snap.data() || null;
}

async function handleTerminalActionSucceeded(envelope) {
  const readerObj =
    envelope.eventPayload &&
    envelope.eventPayload.data &&
    envelope.eventPayload.data.object;
  const action = readerObj && readerObj.action;
  if (!action || !action.process_payment_intent) {
    logger.info("terminal.reader.action_succeeded: not a PI action, skipping");
    return;
  }

  const paymentIntentID = action.process_payment_intent.payment_intent;
  const readerID = readerObj.id;
  if (!paymentIntentID || !readerID) {
    logger.warn("terminal.reader.action_succeeded: missing piID or readerID");
    return;
  }

  const cache = await loadPaymentIntentCache(paymentIntentID);
  if (!cache) {
    logger.warn("terminal.reader.action_succeeded: payment-intents cache miss", {
      paymentIntentID,
    });
    return;
  }
  const { tenantID, storeID, connectAccountID, transactionID, salesTax } = cache;
  if (!tenantID || !storeID || !connectAccountID) {
    logger.warn("terminal.reader.action_succeeded: cache entry incomplete", {
      paymentIntentID,
      cache,
    });
    return;
  }

  const stripe = getStripeClient();
  const stripeOpts = { stripeAccount: connectAccountID };
  const db = getFirestore();

  // ── Charge enrichment ──
  let charge = null;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentID, stripeOpts);
    if (pi.latest_charge) {
      charge = await stripe.charges.retrieve(pi.latest_charge, stripeOpts);
    }
  } catch (err) {
    logger.error("terminal.reader.action_succeeded: charge fetch failed", {
      paymentIntentID,
      error: err && err.message,
    });
  }

  // ── Write enriched updates/current (overwrites the ingestion-time write) ──
  if (charge) {
    await db
      .collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("payment-processing").doc(readerID)
      .collection("payments").doc(paymentIntentID)
      .collection("updates").doc("current")
      .set({
        ...charge,
        status: "succeeded",
        timestamp: FieldValue.serverTimestamp(),
        readerID,
        paymentIntentID,
      });
  }

  // ── Write transaction doc ──
  if (charge && transactionID) {
    const card = charge.payment_method_details && charge.payment_method_details.card_present;
    const txnDoc = {
      id: transactionID,
      method: "card",
      millis: Date.now(),
      amountCaptured: charge.amount_captured || 0,
      amountTendered: 0,
      salesTax: salesTax || 0,
      last4: (card && card.last4) || "",
      expMonth: (card && card.exp_month) || "",
      expYear: (card && card.exp_year) || "",
      cardType: (card && card.description) || "",
      cardIssuer:
        (card && card.receipt && card.receipt.application_preferred_name) || "Unknown",
      paymentProcessor: "stripe",
      paymentIntentID: paymentIntentID || "",
      chargeID: charge.id || "",
      authorizationCode:
        (card && card.receipt && card.receipt.authorization_code) || "",
      networkTransactionID: (card && card.network_transaction_id) || "",
      receiptURL: charge.receipt_url || "",
      refunds: [],
      connectAccountID,
    };
    try {
      await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("transactions").doc(transactionID)
        .set(txnDoc);
    } catch (err) {
      logger.error("terminal.reader.action_succeeded: transaction write failed", {
        transactionID,
        error: err && err.message,
      });
    }
  }

  // ── Reset reader (best-effort cleanup) ──
  try {
    await stripe.terminal.readers.cancelAction(readerID, stripeOpts);
  } catch (err) {
    // The action is already complete on the reader side; cancelAction often
    // 400s after success. Log and continue.
    logger.info("terminal.reader.action_succeeded: cancelAction returned non-ok (expected)", {
      readerID,
      error: err && err.message,
    });
  }

  logger.info("terminal.reader.action_succeeded: processed", {
    paymentIntentID,
    tenantID,
    storeID,
    transactionID,
  });
}

async function handleTerminalActionFailed(envelope) {
  const readerObj =
    envelope.eventPayload &&
    envelope.eventPayload.data &&
    envelope.eventPayload.data.object;
  const action = readerObj && readerObj.action;
  if (!action || !action.process_payment_intent) {
    logger.info("terminal.reader.action_failed: not a PI action, skipping");
    return;
  }

  const paymentIntentID = action.process_payment_intent.payment_intent;
  const readerID = readerObj.id;
  if (!paymentIntentID || !readerID) {
    logger.warn("terminal.reader.action_failed: missing piID or readerID");
    return;
  }

  const cache = await loadPaymentIntentCache(paymentIntentID);
  if (!cache) {
    logger.warn("terminal.reader.action_failed: payment-intents cache miss", {
      paymentIntentID,
    });
    return;
  }
  const { tenantID, storeID, connectAccountID } = cache;
  if (!tenantID || !storeID) {
    logger.warn("terminal.reader.action_failed: cache entry incomplete", {
      paymentIntentID,
    });
    return;
  }

  const db = getFirestore();
  await db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("payment-processing").doc(readerID)
    .collection("payments").doc(paymentIntentID)
    .collection("updates").doc("current")
    .set(
      {
        ...action,
        status: "failed",
        failure_code: action.failure_code || null,
        failure_message: action.failure_message || null,
        timestamp: FieldValue.serverTimestamp(),
        readerID,
        paymentIntentID,
      },
      { merge: true }
    );

  // Reset reader so the next action can run.
  if (connectAccountID) {
    try {
      const stripe = getStripeClient();
      await stripe.terminal.readers.cancelAction(readerID, {
        stripeAccount: connectAccountID,
      });
    } catch (err) {
      logger.info("terminal.reader.action_failed: cancelAction non-ok (continuing)", {
        readerID,
        error: err && err.message,
      });
    }
  }

  logger.info("terminal.reader.action_failed: processed", {
    paymentIntentID,
    tenantID,
    storeID,
    failureCode: action.failure_code,
  });
}

async function handleAccountUpdated(envelope) {
  const account =
    envelope.eventPayload &&
    envelope.eventPayload.data &&
    envelope.eventPayload.data.object;
  if (!account || !account.id) {
    logger.warn("account.updated: missing account object in payload", {
      stripeEventID: envelope.stripeEventID,
    });
    return;
  }

  const db = getFirestore();
  const indexSnap = await db
    .collection("connect-accounts-index")
    .doc(account.id)
    .get();
  if (!indexSnap.exists) {
    logger.warn("account.updated: no index entry for account; skipping", {
      stripeAccountID: account.id,
    });
    return;
  }
  const { tenantID } = indexSnap.data();
  if (!tenantID) {
    logger.warn("account.updated: index entry missing tenantID", {
      stripeAccountID: account.id,
    });
    return;
  }

  const requirements = account.requirements || {};
  await db
    .collection("tenants")
    .doc(tenantID)
    .collection("connect-accounts")
    .doc(account.id)
    .set(
      {
        stripeAccountID: account.id,
        chargesEnabled: account.charges_enabled === true,
        payoutsEnabled: account.payouts_enabled === true,
        detailsSubmitted: account.details_submitted === true,
        capabilities: account.capabilities || {},
        requirementsCurrentlyDue: requirements.currently_due || [],
        requirementsPastDue: requirements.past_due || [],
        requirementsEventuallyDue: requirements.eventually_due || [],
        requirementsDisabledReason: requirements.disabled_reason || null,
        requirementsCurrentDeadline: requirements.current_deadline || null,
        businessProfile: account.business_profile || {},
        payoutSchedule:
          (account.settings && account.settings.payouts && account.settings.payouts.schedule) ||
          null,
        // Clear any prior `deauthorized` flag — receiving an account.updated
        // event means Stripe still talks to us about this account.
        status: "active",
        lastWebhookEventAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  logger.info("account.updated: synced to Firestore", {
    stripeAccountID: account.id,
    tenantID,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    requirementsCurrentlyDue: requirements.currently_due || [],
    disabledReason: requirements.disabled_reason || null,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// account.application.deauthorized — the connected account revoked our
// platform's access (or Stripe-side action did it). Mark the account as
// deauthorized so the PI callable refuses new charges. Reconnecting later
// would mean a fresh onboarding flow.
// ─────────────────────────────────────────────────────────────────────────
async function handleAccountDeauthorized(envelope) {
  const stripeAccountID = envelope.stripeAccountID;
  if (!stripeAccountID) {
    logger.warn("account.application.deauthorized: missing stripeAccountID on envelope", {
      stripeEventID: envelope.stripeEventID,
    });
    return;
  }

  const db = getFirestore();
  const indexSnap = await db
    .collection("connect-accounts-index")
    .doc(stripeAccountID)
    .get();
  if (!indexSnap.exists) {
    logger.warn("account.application.deauthorized: no index entry for account; skipping", {
      stripeAccountID,
    });
    return;
  }
  const { tenantID } = indexSnap.data();
  if (!tenantID) {
    logger.warn("account.application.deauthorized: index entry missing tenantID", {
      stripeAccountID,
    });
    return;
  }

  await db
    .collection("tenants")
    .doc(tenantID)
    .collection("connect-accounts")
    .doc(stripeAccountID)
    .set(
      {
        status: "deauthorized",
        chargesEnabled: false,
        payoutsEnabled: false,
        deauthorizedAt: FieldValue.serverTimestamp(),
        lastWebhookEventAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  logger.warn("account.application.deauthorized: account marked deauthorized", {
    stripeAccountID,
    tenantID,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// payout.paid / payout.failed — write a per-payout record to
// `tenants/{tenantID}/connect-accounts/{accountID}/payouts/{payoutID}` so
// the admin UI can render payout history. Failed payouts also bump a flag
// on the parent connect-account doc so the dashboard can show a warning
// banner.
// ─────────────────────────────────────────────────────────────────────────
async function handlePayout(envelope, status) {
  const payout =
    envelope.eventPayload &&
    envelope.eventPayload.data &&
    envelope.eventPayload.data.object;
  if (!payout || !payout.id) {
    logger.warn("payout: missing payout object", {
      stripeEventID: envelope.stripeEventID,
    });
    return;
  }

  const stripeAccountID = envelope.stripeAccountID;
  if (!stripeAccountID) {
    logger.warn("payout: envelope missing stripeAccountID", {
      stripeEventID: envelope.stripeEventID,
      payoutID: payout.id,
    });
    return;
  }

  const db = getFirestore();
  const indexSnap = await db
    .collection("connect-accounts-index")
    .doc(stripeAccountID)
    .get();
  if (!indexSnap.exists) {
    logger.warn("payout: no index entry for account; skipping", {
      stripeAccountID,
      payoutID: payout.id,
    });
    return;
  }
  const { tenantID } = indexSnap.data();
  if (!tenantID) {
    logger.warn("payout: index entry missing tenantID", { stripeAccountID });
    return;
  }

  const accountRef = db
    .collection("tenants")
    .doc(tenantID)
    .collection("connect-accounts")
    .doc(stripeAccountID);

  const payoutRef = accountRef.collection("payouts").doc(payout.id);

  const payoutDoc = {
    stripePayoutID: payout.id,
    amount: payout.amount,
    currency: payout.currency,
    arrivalDate: payout.arrival_date || null,
    method: payout.method || null,
    type: payout.type || null,
    status,
    description: payout.description || null,
    statementDescriptor: payout.statement_descriptor || null,
    failureCode: payout.failure_code || null,
    failureMessage: payout.failure_message || null,
    livemode: payout.livemode === true,
    lastWebhookEventAt: FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.set(payoutRef, payoutDoc, { merge: true });

  // Bump a flag on the parent account doc so the dashboard can surface a
  // banner without needing to scan the payouts subcollection on every load.
  const accountUpdate = { lastWebhookEventAt: FieldValue.serverTimestamp() };
  if (status === "failed") {
    accountUpdate.lastPayoutFailureAt = FieldValue.serverTimestamp();
    accountUpdate.lastPayoutFailureCode = payout.failure_code || null;
    accountUpdate.lastPayoutFailureMessage = payout.failure_message || null;
  } else if (status === "paid") {
    accountUpdate.lastPayoutPaidAt = FieldValue.serverTimestamp();
    accountUpdate.lastPayoutAmount = payout.amount;
  }
  batch.set(accountRef, accountUpdate, { merge: true });

  await batch.commit();

  logger[status === "failed" ? "warn" : "info"]("payout: recorded", {
    stripeAccountID,
    tenantID,
    payoutID: payout.id,
    status,
    amount: payout.amount,
    failureCode: payout.failure_code || null,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// charge.refunded — fires for both full and partial refunds, including
// refunds issued from the Stripe Dashboard (not via our callable). The
// payload's `charge.refunds.data` array holds every refund on the charge;
// we mirror that into the transaction doc and write a workorder changelog
// entry per new refund. This handler closes the bug noted in MEMORY.md:
// "Missing changelog entry for card refunds on active sales."
// ─────────────────────────────────────────────────────────────────────────
async function handleChargeRefunded(envelope) {
  const charge =
    envelope.eventPayload &&
    envelope.eventPayload.data &&
    envelope.eventPayload.data.object;
  if (!charge || !charge.id) {
    logger.warn("charge.refunded: missing charge object");
    return;
  }

  const paymentIntentID = charge.payment_intent;
  if (!paymentIntentID) {
    logger.warn("charge.refunded: charge has no payment_intent, cannot route", {
      chargeID: charge.id,
    });
    return;
  }

  const cache = await loadPaymentIntentCache(paymentIntentID);
  if (!cache) {
    logger.warn("charge.refunded: payment-intents cache miss", { paymentIntentID });
    return;
  }
  const { tenantID, storeID, transactionID, workorderID } = cache;
  if (!tenantID || !storeID) {
    logger.warn("charge.refunded: cache entry incomplete", { paymentIntentID });
    return;
  }

  const db = getFirestore();
  const refundsArray = (charge.refunds && charge.refunds.data) || [];

  // ── Mirror full refunds array onto the transaction doc ──
  if (transactionID) {
    try {
      await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("transactions").doc(transactionID)
        .set(
          {
            refunds: refundsArray.map((r) => ({
              id: r.id,
              amount: r.amount,
              status: r.status,
              reason: r.reason || null,
              created: r.created,
            })),
            amountRefunded: charge.amount_refunded || 0,
            fullyRefunded: charge.refunded === true,
            lastRefundEventAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (err) {
      logger.error("charge.refunded: transaction update failed", {
        transactionID,
        error: err && err.message,
      });
    }
  }

  // ── Workorder changelog entry per refund ──
  // We append entries idempotently by checking which refund IDs are already
  // present in changelogArr. This survives webhook redelivery without
  // double-logging.
  if (workorderID) {
    try {
      await appendRefundChangelogEntries(
        db,
        tenantID,
        storeID,
        workorderID,
        refundsArray
      );
    } catch (err) {
      logger.error("charge.refunded: changelog append failed", {
        workorderID,
        error: err && err.message,
      });
    }
  }

  logger.info("charge.refunded: processed", {
    chargeID: charge.id,
    tenantID,
    storeID,
    transactionID,
    refundCount: refundsArray.length,
    amountRefunded: charge.amount_refunded,
  });
}

async function appendRefundChangelogEntries(db, tenantID, storeID, workorderID, refundsArray) {
  // Workorder may live in open-workorders OR completed-workorders. Try open
  // first (the common active-sale case), fall back to completed.
  const openRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("open-workorders").doc(workorderID);
  const completedRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("completed-workorders").doc(workorderID);

  let woRef = openRef;
  let woSnap = await openRef.get();
  if (!woSnap.exists) {
    woSnap = await completedRef.get();
    woRef = completedRef;
  }
  if (!woSnap.exists) {
    logger.warn("appendRefundChangelogEntries: workorder not found", {
      workorderID,
    });
    return;
  }

  const wo = woSnap.data() || {};
  const existingChangelog = Array.isArray(wo.changelogArr) ? wo.changelogArr : [];
  const alreadyLoggedRefundIDs = new Set(
    existingChangelog
      .filter((e) => e && e.refundID)
      .map((e) => e.refundID)
  );

  const newEntries = refundsArray
    .filter((r) => !alreadyLoggedRefundIDs.has(r.id))
    .map((r) => ({
      action: "recorded",
      field: "payment",
      to: `Card payment refunded $${(r.amount / 100).toFixed(2)}`,
      millis: Date.now(),
      userID: "system",
      userName: "Stripe webhook",
      refundID: r.id,
    }));

  if (newEntries.length === 0) {
    return;
  }

  await woRef.update({
    changelogArr: FieldValue.arrayUnion(...newEntries),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Dispute events — created, updated, closed, funds withdrawn/reinstated.
// We mirror the current dispute state onto the transaction doc so the
// admin UI can surface "this transaction is in dispute" without polling
// Stripe.
// ─────────────────────────────────────────────────────────────────────────
async function handleChargeDispute(envelope, eventType) {
  const dispute =
    envelope.eventPayload &&
    envelope.eventPayload.data &&
    envelope.eventPayload.data.object;
  if (!dispute || !dispute.id || !dispute.charge) {
    logger.warn("charge.dispute: missing dispute object or charge ref");
    return;
  }

  const stripe = getStripeClient();

  // Disputes carry the connected account ID in envelope.stripeAccountID
  // (because the webhook destination is scoped to Connect). We still need
  // it for the charges.retrieve call.
  const stripeAccountID = envelope.stripeAccountID;
  if (!stripeAccountID) {
    logger.warn("charge.dispute: no stripeAccountID on envelope, cannot retrieve charge", {
      disputeID: dispute.id,
    });
    return;
  }

  let charge;
  try {
    charge = await stripe.charges.retrieve(dispute.charge, {
      stripeAccount: stripeAccountID,
    });
  } catch (err) {
    logger.error("charge.dispute: charge fetch failed", {
      chargeID: dispute.charge,
      error: err && err.message,
    });
    return;
  }

  const paymentIntentID = charge.payment_intent;
  if (!paymentIntentID) {
    logger.warn("charge.dispute: charge has no payment_intent", { chargeID: charge.id });
    return;
  }

  const cache = await loadPaymentIntentCache(paymentIntentID);
  if (!cache) {
    logger.warn("charge.dispute: payment-intents cache miss", { paymentIntentID });
    return;
  }
  const { tenantID, storeID, transactionID, workorderID } = cache;
  if (!tenantID || !storeID) {
    logger.warn("charge.dispute: cache entry incomplete", { paymentIntentID });
    return;
  }

  const db = getFirestore();

  // ── Mirror dispute state onto the transaction doc ──
  if (transactionID) {
    try {
      await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("transactions").doc(transactionID)
        .set(
          {
            dispute: {
              id: dispute.id,
              status: dispute.status,
              reason: dispute.reason,
              amount: dispute.amount,
              currency: dispute.currency,
              isChargeRefundable: dispute.is_charge_refundable === true,
              evidenceDueBy:
                (dispute.evidence_details && dispute.evidence_details.due_by) || null,
            },
            lastDisputeEventAt: FieldValue.serverTimestamp(),
            lastDisputeEventType: eventType,
          },
          { merge: true }
        );
    } catch (err) {
      logger.error("charge.dispute: transaction update failed", {
        transactionID,
        error: err && err.message,
      });
    }
  }

  // ── Changelog entry on the workorder (idempotent on disputeID + eventType) ──
  if (workorderID) {
    try {
      await appendDisputeChangelogEntry(db, tenantID, storeID, workorderID, {
        disputeID: dispute.id,
        eventType,
        status: dispute.status,
        reason: dispute.reason,
        amount: dispute.amount,
      });
    } catch (err) {
      logger.error("charge.dispute: changelog append failed", {
        workorderID,
        error: err && err.message,
      });
    }
  }

  logger.info("charge.dispute: processed", {
    disputeID: dispute.id,
    eventType,
    status: dispute.status,
    tenantID,
    storeID,
    transactionID,
  });
}

async function appendDisputeChangelogEntry(db, tenantID, storeID, workorderID, info) {
  const openRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("open-workorders").doc(workorderID);
  const completedRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("completed-workorders").doc(workorderID);

  let woRef = openRef;
  let woSnap = await openRef.get();
  if (!woSnap.exists) {
    woSnap = await completedRef.get();
    woRef = completedRef;
  }
  if (!woSnap.exists) {
    logger.warn("appendDisputeChangelogEntry: workorder not found", { workorderID });
    return;
  }

  const wo = woSnap.data() || {};
  const existingChangelog = Array.isArray(wo.changelogArr) ? wo.changelogArr : [];

  // Dedup on (disputeID + eventType) so each lifecycle event logs once.
  const dedupKey = `${info.disputeID}:${info.eventType}`;
  const alreadyLogged = existingChangelog.some(
    (e) => e && e.disputeEventKey === dedupKey
  );
  if (alreadyLogged) return;

  const description = describeDisputeEvent(info);
  await woRef.update({
    changelogArr: FieldValue.arrayUnion({
      action: "recorded",
      field: "dispute",
      to: description,
      millis: Date.now(),
      userID: "system",
      userName: "Stripe webhook",
      disputeID: info.disputeID,
      disputeEventKey: dedupKey,
    }),
  });
}

function describeDisputeEvent(info) {
  const amountStr = `$${(info.amount / 100).toFixed(2)}`;
  switch (info.eventType) {
    case "charge.dispute.created":
      return `Chargeback opened (${info.reason}) for ${amountStr}`;
    case "charge.dispute.updated":
      return `Chargeback updated (status: ${info.status})`;
    case "charge.dispute.closed":
      return `Chargeback closed (status: ${info.status}) for ${amountStr}`;
    case "charge.dispute.funds_withdrawn":
      return `Funds withdrawn from account due to chargeback ${amountStr}`;
    case "charge.dispute.funds_reinstated":
      return `Funds reinstated after chargeback resolution ${amountStr}`;
    default:
      return `Chargeback event: ${info.eventType}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// checkout.session.completed — the customer paid through a LinkToPay URL.
// Reads the routing cache written by stripeConnectCreateCheckoutSessionV2,
// writes the resulting PaymentIntent into `payment-intents/{piID}` (so any
// later refund/dispute events route correctly), and flips the active-sales
// doc to paid.
// ─────────────────────────────────────────────────────────────────────────
async function handleCheckoutSessionCompleted(envelope) {
  const session =
    envelope.eventPayload &&
    envelope.eventPayload.data &&
    envelope.eventPayload.data.object;
  if (!session || !session.id) {
    logger.warn("checkout.session.completed: missing session in payload", {
      stripeEventID: envelope.stripeEventID,
    });
    return;
  }

  const db = getFirestore();
  const cacheSnap = await db
    .collection("checkout-sessions")
    .doc(session.id)
    .get();

  // Fall back to session.metadata if the cache is missing (shouldn't happen
  // for sessions we created, but a sanity guard in case Stripe replays an
  // event after we've cleaned the cache).
  let routing = null;
  if (cacheSnap.exists) {
    routing = cacheSnap.data();
  } else if (session.metadata) {
    routing = {
      tenantID: session.metadata.tenantID,
      storeID: session.metadata.storeID,
      connectAccountID: session.metadata.connectAccountID,
      saleID: session.metadata.saleID || null,
      workorderID: session.metadata.workorderID || null,
      customerID: session.metadata.customerID || null,
    };
  }
  if (!routing || !routing.tenantID || !routing.storeID) {
    logger.warn("checkout.session.completed: no routing for session", {
      sessionID: session.id,
    });
    return;
  }

  const { tenantID, storeID, connectAccountID, saleID, workorderID, customerID } = routing;
  const paymentIntentID = session.payment_intent || null;

  // Write a payment-intents cache entry so future charge.refunded /
  // charge.dispute.* events can route to this tenant/store without hitting
  // Stripe. Matches what stripe-connect-payment-intent.js writes for
  // Terminal PIs.
  if (paymentIntentID) {
    await db
      .collection("payment-intents")
      .doc(paymentIntentID)
      .set(
        {
          tenantID,
          storeID,
          connectAccountID: connectAccountID || envelope.stripeAccountID || null,
          saleID: saleID || null,
          workorderID: workorderID || null,
          customerID: customerID || null,
          amount: session.amount_total || routing.amount || null,
          applicationFeeAmount: routing.applicationFeeAmount || 0,
          status: session.payment_status || "paid",
          source: "checkout-session-v2",
          checkoutSessionID: session.id,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  // Update the active sale: payment is in. The client will read this and
  // either finalize the workorder or display the "paid" state.
  if (saleID) {
    const saleRef = db
      .collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("active-sales").doc(saleID);

    const paymentRecord = {
      type: "card",
      method: "checkout-session",
      amount: session.amount_total || routing.amount || 0,
      currency: session.currency || routing.currency || "usd",
      paymentIntentID: paymentIntentID || null,
      checkoutSessionID: session.id,
      timestamp: Date.now(),
      receiptEmail: session.customer_details && session.customer_details.email,
    };

    await saleRef.set(
      {
        paymentComplete: true,
        amountCaptured: session.amount_total || routing.amount || 0,
        status: "paid",
        paidAt: FieldValue.serverTimestamp(),
        checkoutSessionStatus: "completed",
        payments: FieldValue.arrayUnion(paymentRecord),
      },
      { merge: true }
    );
  }

  // Flip the cache to completed so the expired handler doesn't double-process
  // if a stale expired event arrives later.
  await db.collection("checkout-sessions").doc(session.id).set(
    {
      status: "completed",
      paymentIntentID: paymentIntentID || null,
      completedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Write a workorder changelog entry so the sale's history reflects the
  // remote payment. Open-workorders first, then fall back to
  // completed-workorders if the workorder has already been closed.
  if (workorderID) {
    await appendCheckoutSessionChangelogEntry(db, {
      tenantID,
      storeID,
      workorderID,
      session,
      paymentIntentID,
      amount: session.amount_total || routing.amount || 0,
    });
  }

  logger.info("checkout.session.completed: session synced", {
    sessionID: session.id,
    tenantID,
    storeID,
    saleID: saleID || null,
    paymentIntentID,
  });
}

async function appendCheckoutSessionChangelogEntry(db, ctx) {
  const { tenantID, storeID, workorderID, session, paymentIntentID, amount } = ctx;
  const amountUSD = (amount / 100).toFixed(2);
  const changelogEntry = {
    action: "recorded",
    field: "payment",
    to: `Remote card payment received $${amountUSD}`,
    millis: Date.now(),
    userID: "system",
    userName: "LinkToPay",
    sessionID: session.id,
    paymentIntentID: paymentIntentID || null,
  };

  const openRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("open-workorders").doc(workorderID);

  const openSnap = await openRef.get();
  if (openSnap.exists) {
    const existing = (openSnap.data() && openSnap.data().changelog) || [];
    if (existing.some((e) => e && e.sessionID === session.id)) {
      return; // dedup
    }
    await openRef.set(
      { changelog: FieldValue.arrayUnion(changelogEntry) },
      { merge: true }
    );
    return;
  }

  // Workorder may already be closed — try completed-workorders.
  const completedRef = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("completed-workorders").doc(workorderID);
  const completedSnap = await completedRef.get();
  if (completedSnap.exists) {
    const existing = (completedSnap.data() && completedSnap.data().changelog) || [];
    if (existing.some((e) => e && e.sessionID === session.id)) {
      return;
    }
    await completedRef.set(
      { changelog: FieldValue.arrayUnion(changelogEntry) },
      { merge: true }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// checkout.session.expired — link timed out (24h default). Mark the sale
// expired so the UI can offer to send a fresh link.
// ─────────────────────────────────────────────────────────────────────────
async function handleCheckoutSessionExpired(envelope) {
  const session =
    envelope.eventPayload &&
    envelope.eventPayload.data &&
    envelope.eventPayload.data.object;
  if (!session || !session.id) {
    logger.warn("checkout.session.expired: missing session in payload", {
      stripeEventID: envelope.stripeEventID,
    });
    return;
  }

  const db = getFirestore();
  const cacheSnap = await db.collection("checkout-sessions").doc(session.id).get();
  if (!cacheSnap.exists) {
    logger.warn("checkout.session.expired: no cache entry for session", {
      sessionID: session.id,
    });
    return;
  }
  const routing = cacheSnap.data() || {};

  // If the session already completed (race condition where expired fires
  // after completed somehow), don't overwrite the paid state.
  if (routing.status === "completed") {
    logger.info("checkout.session.expired: session already completed; ignoring", {
      sessionID: session.id,
    });
    return;
  }

  await db.collection("checkout-sessions").doc(session.id).set(
    {
      status: "expired",
      expiredAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (routing.saleID && routing.tenantID && routing.storeID) {
    await db
      .collection("tenants").doc(routing.tenantID)
      .collection("stores").doc(routing.storeID)
      .collection("active-sales").doc(routing.saleID)
      .set(
        {
          checkoutSessionStatus: "expired",
          checkoutSessionExpiredAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  logger.info("checkout.session.expired: session marked expired", {
    sessionID: session.id,
    tenantID: routing.tenantID || null,
    saleID: routing.saleID || null,
  });
}
