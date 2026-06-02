/* eslint-disable */
// Phase 2 — SMS billing Pub/Sub subscriber + DLQ ingestor.
//
// Subscribes to `sms-billing-events`. Each envelope carries enough info to
// compute a billing stamp for ONE Twilio message (inbound or outbound
// terminal). The subscriber:
//
//   1. Atomically claims the stamp doc at
//      tenants/{tid}/sms-billing-stamps/{messageSid} — dedupe gate.
//   2. For inbound, calls shouldBillInbound() (stub today; spam-filter hook).
//   3. Fetches the Twilio Message resource for the authoritative Price.
//      Webhook payloads MAY include Price for outbound terminal events but
//      NOT for inbound — fetching unifies the path and gives us the final
//      number regardless of when the webhook fired.
//   4. Computes billedCents = round(|twilioPrice| * 100 * markupMultiplier).
//   5. Writes the final stamp doc with smsBillingPeriodKey ("YYYY-MM-1H" /
//      "YYYY-MM-2H", America/Chicago) so the invoicer can range-query it.
//
// Idempotency: stamp doc create() throws on duplicate (gRPC code 6); we
// catch that and ack-and-drop. A subscriber failure after create deletes
// the marker so retries can re-run.
//
// Routing to DLQ: same MAX_DELIVERY_ATTEMPTS=5 + dedicated DLQ topic
// pattern as the Stripe billing subscriber.

const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");

const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  getTenantTwilioClient,
} = require("./twilio-common");

const {
  resolveSmsMarkupMultiplier,
  twilioPriceToCents,
  computeBilledCents,
  shouldBillInbound,
  smsStampDocRef,
  computeFeeBillingPeriodKey,
} = require("./sms-billing-helpers");

if (!admin.apps.length) admin.initializeApp();

const MAX_DELIVERY_ATTEMPTS = 5;
const DLQ_TOPIC = "sms-billing-events-dlq";

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

exports.handler = onMessagePublished(
  {
    topic: "sms-billing-events",
    region: "us-central1",
    timeoutSeconds: 120,
    retry: true,
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async (event) => {
    const envelope = event.data.message.json || {};
    const {
      messageSid,
      tenantID,
      storeID,
      direction,
      from,
      to,
      subaccountSid,
      twilioPriceHint,
      twilioPriceUnitHint,
      duringSuspension,
    } = envelope;
    const deliveryAttempt = event.data.deliveryAttempt || 1;

    if (!messageSid || !tenantID || !storeID || !direction) {
      logger.error("smsBillingStamper: envelope missing required fields", {
        envelope,
      });
      return;
    }

    if (deliveryAttempt > MAX_DELIVERY_ATTEMPTS) {
      logger.warn("smsBillingStamper: max delivery attempts, routing to DLQ", {
        messageSid,
        tenantID,
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
    const stampRef = smsStampDocRef(db, tenantID, messageSid);

    try {
      await stampRef.create({
        messageSid,
        tenantID,
        storeID,
        direction,
        from: from || null,
        to: to || null,
        status: "processing",
        deliveryAttempt,
        receivedAt: FieldValue.serverTimestamp(),
        receivedAtMs: Date.now(),
      });
    } catch (err) {
      if (err && err.code === 6) {
        logger.info("smsBillingStamper: stamp already exists (dedup ack)", {
          messageSid,
          tenantID,
        });
        return;
      }
      throw err;
    }

    try {
      // ── Spam-filter hook (inbound only). Future feature; today returns
      // {bill: true} unconditionally. See
      // memory/project-sms-inbound-spam-flagging.md.
      let billDecision = { bill: true };
      if (direction === "inbound") {
        billDecision = shouldBillInbound(envelope) || { bill: true };
      }

      // ── Fetch Twilio Message resource for the authoritative Price ──
      // Fall back to webhook hint if the API fetch fails — for inbound,
      // Price is populated immediately on Twilio's side; for outbound
      // terminal status, Price is set when status transitions to
      // delivered/undelivered/failed.
      let twilioPriceStr = null;
      let twilioPriceUnit = twilioPriceUnitHint || "USD";
      try {
        const client = await getTenantTwilioClient(tenantID);
        const msg = await client.messages(messageSid).fetch();
        if (msg && msg.price !== undefined && msg.price !== null) {
          twilioPriceStr = String(msg.price);
        }
        if (msg && msg.priceUnit) {
          twilioPriceUnit = msg.priceUnit;
        }
      } catch (err) {
        logger.warn("smsBillingStamper: Twilio message fetch failed, using hint", {
          messageSid,
          tenantID,
          error: err && err.message,
        });
        if (twilioPriceHint) twilioPriceStr = String(twilioPriceHint);
      }

      const twilioCostFractionalCents = twilioPriceToCents(twilioPriceStr);
      const markupMultiplier = await resolveSmsMarkupMultiplier(db, tenantID);
      const billedCents = billDecision.bill
        ? computeBilledCents(twilioCostFractionalCents, markupMultiplier)
        : 0;

      const smsBillingPeriodKey = computeFeeBillingPeriodKey(Date.now());

      const update = {
        status: "success",
        billed: billDecision.bill === true && billedCents > 0,
        billReason: billDecision.bill === false ? (billDecision.reason || null) : null,
        twilioPrice: twilioPriceStr,
        twilioPriceUnit,
        twilioCostFractionalCents,
        markupMultiplier,
        billedCents,
        smsBillingPeriodKey,
        subaccountSid: subaccountSid || null,
        duringSuspension: duringSuspension === true,
        stampedAt: FieldValue.serverTimestamp(),
        stampedAtMs: Date.now(),
      };

      await stampRef.set(update, { merge: true });

      logger.info("smsBillingStamper: stamped", {
        messageSid,
        tenantID,
        storeID,
        direction,
        billed: update.billed,
        billedCents,
        markupMultiplier,
        smsBillingPeriodKey,
      });
    } catch (err) {
      logger.error("smsBillingStamper: handler failed, clearing marker", {
        messageSid,
        tenantID,
        error: err && err.message,
      });
      try {
        await stampRef.delete();
      } catch (_) {
        // best effort
      }
      throw err;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// DLQ ingestor — persists dead-lettered SMS billing events into the shared
// `saas-dlq` collection (eventSource: "sms-billing") for the DLQ admin UI.
// ─────────────────────────────────────────────────────────────────────────
exports.ingestor = onMessagePublished(
  {
    topic: "sms-billing-events-dlq",
    region: "us-central1",
    timeoutSeconds: 60,
    retry: false,
  },
  async (event) => {
    const envelope = event.data.message.json || {};
    const messageSid = envelope.messageSid || "unknown";
    const tenantID = envelope.tenantID || null;
    const direction = envelope.direction || null;

    logger.error("SMS billing DLQ entry received", {
      messageSid,
      tenantID,
      direction,
      failureReason: envelope.failureReason,
      deliveryAttempt: envelope.deliveryAttempt,
    });

    const db = getFirestore();
    await db.collection("saas-dlq").add({
      eventSource: "sms-billing",
      messageSid,
      tenantID,
      direction,
      failureReason: envelope.failureReason || "unknown",
      deliveryAttempt: envelope.deliveryAttempt || null,
      eventPayload: envelope,
      firstSeenAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
      status: "new",
      retryCount: 0,
    });
  }
);
