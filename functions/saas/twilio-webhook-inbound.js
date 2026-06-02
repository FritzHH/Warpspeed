/* eslint-disable */
// Phase 3 — Inbound Twilio webhook (single endpoint, multi-tenant fan-out).
//
// All purchased / ported numbers across every tenant point their SMS webhook
// here. The handler resolves tenantID/storeID from the destination number,
// verifies the Twilio signature against the SUBACCOUNT auth token (not the
// master), publishes the message envelope to the `twilio-inbound` Pub/Sub
// topic, and returns an empty TwiML response so Twilio doesn't auto-reply.
//
// Critical separation: signature verification uses the SUBACCOUNT auth token
// because the inbound webhook fires from the subaccount that owns the number.
// We look up routing FIRST (untrusted) to resolve which subaccount's token to
// load, then verify, then publish. Body fields outside the signed set are not
// trusted for routing.
//
// Latency budget: routing lookup (~50-100ms) + Secret Manager read (~30-100ms
// cold, <10ms warm) + Pub/Sub publish (~20-50ms) + 200 return.
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");
const twilio = require("twilio");
const common = require("./twilio-common");

if (!admin.apps.length) admin.initializeApp();

const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  INBOUND_WEBHOOK_URL,
  routingDocRef,
  loadSubaccountAuthToken,
} = common;

const INBOUND_TOPIC = "twilio-inbound";
const SMS_BILLING_TOPIC = "sms-billing-events";

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

// Empty TwiML — instructs Twilio "received, no reply needed".
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

exports.handler = onRequest(
  {
    region: "us-central1",
    cors: false,
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
    timeoutSeconds: 30,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const params = req.body || {};
    const messageSid = params.MessageSid;
    const accountSid = params.AccountSid;
    const fromNumber = params.From;
    const toNumber = params.To;
    const signature = req.headers["x-twilio-signature"];

    if (!messageSid || !toNumber || !fromNumber) {
      logger.error("twilioInboundWebhook: missing required fields", {
        hasMessageSid: !!messageSid,
        hasTo: !!toNumber,
        hasFrom: !!fromNumber,
      });
      // 400 — Twilio won't retry on 4xx, which is what we want for
      // malformed/non-Twilio requests.
      return res.status(400).send("Missing required fields");
    }

    if (!signature) {
      logger.warn("twilioInboundWebhook: missing X-Twilio-Signature header", {
        messageSid,
      });
      return res.status(403).send("Missing signature");
    }

    const db = getFirestore();

    // ── Routing lookup (untrusted; required to resolve which subaccount
    // token to verify against). ──
    const routingSnap = await routingDocRef(db, toNumber).get();
    if (!routingSnap.exists) {
      logger.warn("twilioInboundWebhook: no routing entry for destination", {
        toNumber,
        messageSid,
      });
      // Return 200 to stop Twilio retries — there's nothing we can do without
      // a routing entry, and retrying won't help. The number was likely
      // released or never owned by us.
      res.set("Content-Type", "text/xml");
      return res.status(200).send(EMPTY_TWIML);
    }

    const routing = routingSnap.data() || {};
    const { tenantID, storeID, status: routingStatus, subaccountSid } = routing;
    if (!tenantID || !storeID) {
      logger.error("twilioInboundWebhook: routing entry incomplete", {
        toNumber,
        routing,
      });
      res.set("Content-Type", "text/xml");
      return res.status(200).send(EMPTY_TWIML);
    }

    // "grace" = subaccount suspended, in TCPA opt-out window. We still
    // receive inbound (so consumer STOP messages get logged), but tag the
    // message so the subscriber + UI can suppress notifications. Any other
    // non-active status (pending, failed, suspended-without-grace) is
    // dropped.
    if (routingStatus !== "active" && routingStatus !== "grace") {
      logger.warn("twilioInboundWebhook: routing not active/grace, dropping", {
        toNumber,
        status: routingStatus,
        tenantID,
      });
      res.set("Content-Type", "text/xml");
      return res.status(200).send(EMPTY_TWIML);
    }
    const duringSuspension = routingStatus === "grace";

    // Sanity check — if the routing's recorded subaccount SID doesn't match
    // the AccountSid Twilio is claiming, somebody else is hitting our URL
    // with this number. Refuse rather than trust.
    if (subaccountSid && accountSid && subaccountSid !== accountSid) {
      logger.error("twilioInboundWebhook: AccountSid mismatch — refusing", {
        toNumber,
        routingSubaccountSid: subaccountSid,
        webhookAccountSid: accountSid,
      });
      return res.status(403).send("Account mismatch");
    }

    // ── Signature verification (subaccount auth token) ──
    let authToken;
    try {
      authToken = await loadSubaccountAuthToken(tenantID);
    } catch (err) {
      logger.error("twilioInboundWebhook: failed to load subaccount auth token", {
        tenantID,
        error: err && err.message,
      });
      // 500 → Twilio retries. The token should be there if the routing entry
      // is active; a transient Secret Manager failure is the most likely
      // cause.
      return res.status(500).send("Auth token unavailable");
    }

    const isValid = twilio.validateRequest(
      authToken,
      signature,
      INBOUND_WEBHOOK_URL,
      params
    );
    if (!isValid) {
      logger.error("twilioInboundWebhook: signature verification failed", {
        tenantID,
        toNumber,
        messageSid,
      });
      return res.status(403).send("Invalid signature");
    }

    // ── Publish to Pub/Sub for async processing ──
    try {
      await pubsub()
        .topic(INBOUND_TOPIC)
        .publishMessage({
          json: {
            messageSid,
            accountSid,
            tenantID,
            storeID,
            from: fromNumber,
            to: toNumber,
            body: params.Body || "",
            numMedia: parseInt(params.NumMedia || "0", 10),
            numSegments: parseInt(params.NumSegments || "1", 10),
            fromCity: params.FromCity || null,
            fromState: params.FromState || null,
            fromZip: params.FromZip || null,
            fromCountry: params.FromCountry || null,
            messagingServiceSid: params.MessagingServiceSid || null,
            duringSuspension,
            // Pass the raw params so the subscriber can pull MediaUrl0..N
            // without us hardcoding a media limit here.
            rawParams: params,
            receivedAt: new Date().toISOString(),
          },
        });
    } catch (err) {
      logger.error("twilioInboundWebhook: pub/sub publish failed", {
        messageSid,
        tenantID,
        error: err && err.message,
      });
      // 500 → Twilio retries (better to over-deliver and rely on subscriber
      // dedup than to drop the message).
      return res.status(500).send("Publish failed");
    }

    logger.info("twilioInboundWebhook: published", {
      messageSid,
      tenantID,
      storeID,
      from: fromNumber,
      to: toNumber,
      numMedia: parseInt(params.NumMedia || "0", 10),
    });

    // ── Publish to SMS billing topic ──
    // Inbound is billable (per locked decision); the stamper dedupes by
    // messageSid + applies the spam-filter hook + fetches the authoritative
    // Twilio Price. Publishing here (rather than chaining off the inbound
    // subscriber) keeps the two pipelines independent — a stuck inbound
    // subscriber doesn't block billing, and vice versa. Twilio's inbound
    // webhook payload does NOT include Price, so the stamper fetches it
    // from the Message resource.
    try {
      await pubsub()
        .topic(SMS_BILLING_TOPIC)
        .publishMessage({
          json: {
            messageSid,
            tenantID,
            storeID,
            direction: "inbound",
            from: fromNumber,
            to: toNumber,
            subaccountSid: subaccountSid || accountSid || null,
            duringSuspension,
            publishedAt: new Date().toISOString(),
          },
        });
    } catch (err) {
      logger.error("twilioInboundWebhook: sms-billing publish failed", {
        messageSid,
        tenantID,
        error: err && err.message,
      });
      // Don't 500 — the inbound message itself was already published; we'd
      // rather process the message and lose the billing stamp (admin can
      // reconcile) than retry the whole flow and risk double-delivery to
      // the inbound subscriber.
    }

    res.set("Content-Type", "text/xml");
    return res.status(200).send(EMPTY_TWIML);
  }
);
