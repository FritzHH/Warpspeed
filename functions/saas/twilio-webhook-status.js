/* eslint-disable */
// Phase 3 — Outbound message status callback (single endpoint, multi-tenant).
//
// Twilio invokes this URL for every status transition on messages WE sent:
//   queued → sending → sent → delivered
//                   ↘ undelivered / failed
//
// Routing is by the From number (our owned E.164) since outbound messages
// originate from our number to a customer. Signature verification uses the
// subaccount auth token (same model as the inbound webhook).
//
// Processed inline (no Pub/Sub) — these are simple Firestore merges with no
// enrichment. If we need to gate analytics writes on terminal status we'll
// add an outbound-status Pub/Sub topic later.
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");
const twilio = require("twilio");
const common = require("./twilio-common");

if (!admin.apps.length) admin.initializeApp();

const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  STATUS_CALLBACK_URL,
  routingDocRef,
  loadSubaccountAuthToken,
} = common;

const TERMINAL_STATUSES = new Set(["delivered", "undelivered", "failed"]);
const SMS_BILLING_TOPIC = "sms-billing-events";

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

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
    const messageStatus = params.MessageStatus;
    const accountSid = params.AccountSid;
    const fromNumber = params.From;
    const toNumber = params.To;
    const errorCode = params.ErrorCode || null;
    const errorMessage = params.ErrorMessage || null;
    const signature = req.headers["x-twilio-signature"];

    if (!messageSid || !messageStatus || !fromNumber) {
      logger.error("twilioStatusCallbackWebhook: missing required fields", {
        hasMessageSid: !!messageSid,
        hasStatus: !!messageStatus,
        hasFrom: !!fromNumber,
      });
      return res.status(400).send("Missing required fields");
    }

    if (!signature) {
      logger.warn("twilioStatusCallbackWebhook: missing signature header", {
        messageSid,
      });
      return res.status(403).send("Missing signature");
    }

    const db = getFirestore();

    // ── Routing lookup by the From number (our owned E.164) ──
    const routingSnap = await routingDocRef(db, fromNumber).get();
    if (!routingSnap.exists) {
      logger.warn("twilioStatusCallbackWebhook: no routing entry for From", {
        fromNumber,
        messageSid,
      });
      // 200 to stop retries — without routing we can't update anything.
      return res.status(200).send("OK (no routing)");
    }
    const routing = routingSnap.data() || {};
    const { tenantID, storeID, subaccountSid } = routing;
    if (!tenantID || !storeID) {
      logger.error("twilioStatusCallbackWebhook: routing entry incomplete", {
        fromNumber,
        routing,
      });
      return res.status(200).send("OK (incomplete routing)");
    }

    if (subaccountSid && accountSid && subaccountSid !== accountSid) {
      logger.error("twilioStatusCallbackWebhook: AccountSid mismatch", {
        fromNumber,
        routingSubaccountSid: subaccountSid,
        webhookAccountSid: accountSid,
      });
      return res.status(403).send("Account mismatch");
    }

    // ── Signature verification with the subaccount auth token ──
    let authToken;
    try {
      authToken = await loadSubaccountAuthToken(tenantID);
    } catch (err) {
      logger.error("twilioStatusCallbackWebhook: failed to load auth token", {
        tenantID,
        error: err && err.message,
      });
      return res.status(500).send("Auth token unavailable");
    }

    const isValid = twilio.validateRequest(
      authToken,
      signature,
      STATUS_CALLBACK_URL,
      params
    );
    if (!isValid) {
      logger.error("twilioStatusCallbackWebhook: signature invalid", {
        tenantID,
        messageSid,
      });
      return res.status(403).send("Invalid signature");
    }

    // ── Update outgoing-messages doc ──
    // The doc is created by sendTwilioMessage (Phase 4). For an early status
    // update arriving before the send-side write lands, set with merge so we
    // don't lose data, but flag the precondition for diagnostics.
    const msgRef = db
      .collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("outgoing-messages").doc(messageSid);

    const isTerminal = TERMINAL_STATUSES.has(messageStatus);
    const update = {
      messageSid,
      from: fromNumber,
      to: toNumber || null,
      latestStatus: messageStatus,
      lastStatusAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion({
        status: messageStatus,
        at: Date.now(),
        errorCode: errorCode,
      }),
    };
    if (isTerminal) {
      update.terminalStatus = messageStatus;
      update.terminalAt = FieldValue.serverTimestamp();
    }
    if (errorCode) {
      update.errorCode = errorCode;
      update.errorMessage = errorMessage;
    }

    try {
      await msgRef.set(update, { merge: true });
    } catch (err) {
      logger.error("twilioStatusCallbackWebhook: Firestore write failed", {
        messageSid,
        tenantID,
        error: err && err.message,
      });
      // 500 → Twilio retries the status update.
      return res.status(500).send("Write failed");
    }

    logger.info("twilioStatusCallbackWebhook: recorded", {
      messageSid,
      tenantID,
      storeID,
      status: messageStatus,
      errorCode,
      isTerminal,
    });

    // ── Publish to SMS billing topic on terminal status only ──
    // Outbound bills regardless of delivery outcome (Twilio charges us on
    // any terminal state). Publishing only on terminal status means we
    // emit at most one billing event per Twilio message regardless of how
    // many intermediate callbacks fire (queued / sending / sent).
    if (isTerminal) {
      try {
        await pubsub()
          .topic(SMS_BILLING_TOPIC)
          .publishMessage({
            json: {
              messageSid,
              tenantID,
              storeID,
              direction: "outbound",
              from: fromNumber,
              to: toNumber || null,
              subaccountSid: subaccountSid || accountSid || null,
              twilioPriceHint: params.Price || null,
              twilioPriceUnitHint: params.PriceUnit || null,
              terminalStatus: messageStatus,
              publishedAt: new Date().toISOString(),
            },
          });
      } catch (err) {
        logger.error("twilioStatusCallbackWebhook: sms-billing publish failed", {
          messageSid,
          tenantID,
          error: err && err.message,
        });
        // Don't 500 — status was already written. Billing event loss is
        // recoverable via admin reconcile; double-status would corrupt the
        // statusHistory array.
      }
    }

    return res.status(200).send("OK");
  }
);
