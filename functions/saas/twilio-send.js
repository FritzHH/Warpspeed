/* eslint-disable */
// Phase 4 — Outbound SMS / MMS send for SaaS tenants.
//
// Two surfaces:
//   1. `sendTwilioMessageInternal` — top-level helper that does routing
//      verification + Twilio send + outgoing-messages writes. Reusable by
//      any callable that already established its own auth/membership
//      context (e.g. `sendReceiptCallable` for SaaS).
//   2. `sendTwilioMessage` — onCall wrapper that adds requireAuth +
//      requireTenantMember + arg validation, then delegates.
//
// The helper does NOT perform caller-identity checks (the calling
// callable owns that). It still enforces the routing-ownership invariant
// because the routing doc is the source of truth for which subaccount /
// store owns a number, and that is independent of caller identity.
//
// Status transitions (queued → sent → delivered, or → failed) land in
// the outgoing-messages doc via twilioStatusCallbackWebhook (Phase 3).
//
// "From company only" display rule: this code does NOT prepend the
// company name. The UI composer is responsible for formatting the body
// before sending — keeps both this helper and the callable policy-free.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const common = require("./twilio-common");
const { withFeatureTracking } = require("../usageTracking");

if (!admin.apps.length) admin.initializeApp();

const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  STATUS_CALLBACK_URL,
  requireAuth,
  requireTenantMember,
  routingDocRef,
  getTenantTwilioClient,
} = common;

const _noopTracker = {
  bump: () => {},
  set: () => {},
  setContext: () => {},
};

/**
 * Internal Twilio send helper. Does routing verification, message send,
 * and outgoing-messages doc writes. No caller-identity check — the caller
 * is responsible for verifying that `authUid` is allowed to send from
 * (tenantID, storeID) before invoking this.
 *
 * Required: db, tenantID, storeID, fromPhoneNumber, to, authUid.
 * One of body / mediaUrls must be non-empty.
 *
 * Returns: { messageSids, primaryMessageSid, status, numSegments, numMedia }.
 */
async function sendTwilioMessageInternal({
  db,
  tenantID,
  storeID,
  fromPhoneNumber,
  to,
  body,
  mediaUrls,
  sentByName,
  workorderID,
  customerID,
  authUid,
  tracker,
}) {
  tracker = tracker || _noopTracker;

  if (!db || !tenantID || !storeID || !fromPhoneNumber || !to) {
    throw new HttpsError(
      "invalid-argument",
      "sendTwilioMessageInternal: db, tenantID, storeID, fromPhoneNumber, and to are required."
    );
  }

  // ── Ownership check: routing doc must confirm (from, tenantID, storeID) ──
  const routingSnap = await routingDocRef(db, fromPhoneNumber).get();
  if (!routingSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Number ${fromPhoneNumber} has no routing entry.`
    );
  }
  const routing = routingSnap.data() || {};
  if (routing.tenantID !== tenantID || routing.storeID !== storeID) {
    throw new HttpsError(
      "permission-denied",
      `Number ${fromPhoneNumber} is not owned by this store.`
    );
  }
  if (routing.status !== "active") {
    if (routing.status === "grace") {
      throw new HttpsError(
        "failed-precondition",
        "Subaccount is in the post-churn grace window. Outbound sends are disabled — reactivate the tenant subaccount to resume sending.",
        { routingStatus: "grace" }
      );
    }
    throw new HttpsError(
      "failed-precondition",
      `Number ${fromPhoneNumber} is ${routing.status}.`
    );
  }

  const client = await getTenantTwilioClient(tenantID);

  const mediaList = (mediaUrls || []).filter(Boolean);
  const bodyText = body || "";

  let primaryResponse;
  const sentMessageSids = [];

  try {
    if (mediaList.length > 1) {
      // Multi-image MMS → one Twilio message per image. Matches Bonita's
      // pattern; carriers fragment/reject batched MMS unpredictably so we
      // de-batch on our side.
      primaryResponse = await client.messages.create({
        from: fromPhoneNumber,
        to,
        body: bodyText,
        mediaUrl: [mediaList[0]],
        statusCallback: STATUS_CALLBACK_URL,
      });
      sentMessageSids.push(primaryResponse.sid);
      tracker.bump("twilioSegments", Number(primaryResponse.numSegments) || 1);
      tracker.bump("twilioMms", 1);

      for (let i = 1; i < mediaList.length; i++) {
        const extra = await client.messages.create({
          from: fromPhoneNumber,
          to,
          body: "",
          mediaUrl: [mediaList[i]],
          statusCallback: STATUS_CALLBACK_URL,
        });
        sentMessageSids.push(extra.sid);
        tracker.bump("twilioSegments", Number(extra.numSegments) || 1);
        tracker.bump("twilioMms", 1);
      }
    } else {
      primaryResponse = await client.messages.create({
        from: fromPhoneNumber,
        to,
        body: bodyText,
        ...(mediaList.length === 1 ? { mediaUrl: mediaList } : {}),
        statusCallback: STATUS_CALLBACK_URL,
      });
      sentMessageSids.push(primaryResponse.sid);
      tracker.bump("twilioSegments", Number(primaryResponse.numSegments) || 1);
      if (mediaList.length === 1) tracker.bump("twilioMms", 1);
    }
  } catch (err) {
    logger.error("sendTwilioMessageInternal: Twilio send failed", {
      tenantID,
      storeID,
      from: fromPhoneNumber,
      to,
      twilioCode: err && err.code,
      twilioStatus: err && err.status,
      error: err && err.message,
    });
    throw new HttpsError(
      "internal",
      `Twilio send failed: ${err && err.message}`,
      { twilioCode: err && err.code }
    );
  }

  tracker.setContext({ correlationID: primaryResponse.sid });

  // ── Write outgoing-messages doc(s) — one per sent Twilio message ──
  const writes = [];
  const messagesCol = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("outgoing-messages");

  for (let i = 0; i < sentMessageSids.length; i++) {
    const sid = sentMessageSids[i];
    const isPrimary = i === 0;
    const msgRef = messagesCol.doc(sid);
    const docBody = {
      messageSid: sid,
      accountSid: routing.subaccountSid || null,
      direction: "outbound",
      from: fromPhoneNumber,
      to,
      body: isPrimary ? bodyText : "",
      numMedia: isPrimary ? mediaList.length : (mediaList.length > 1 ? 1 : 0),
      mediaUrlsOriginal: isPrimary
        ? mediaList
        : (mediaList.length > 1 ? [mediaList[i]] : []),
      latestStatus: "queued",
      statusHistory: [{ status: "queued", at: Date.now() }],
      sentByUserID: authUid || null,
      sentByName: sentByName || null,
      workorderID: workorderID || null,
      customerID: customerID || null,
      sentAt: FieldValue.serverTimestamp(),
      primaryMessageSid: sentMessageSids[0],
      sequenceIndex: i,
    };
    writes.push(msgRef.set(docBody));
  }
  await Promise.all(writes);
  tracker.bump("firestoreWrites", writes.length);

  tracker.setContext({
    tenantID,
    storeID,
    userID: authUid || null,
    workorderID: workorderID || null,
    customerID: customerID || null,
  });

  logger.info("sendTwilioMessageInternal: sent", {
    tenantID,
    storeID,
    primaryMessageSid: sentMessageSids[0],
    totalMessages: sentMessageSids.length,
    to,
  });

  return {
    messageSids: sentMessageSids,
    primaryMessageSid: sentMessageSids[0],
    status: primaryResponse.status,
    numSegments: Number(primaryResponse.numSegments) || 1,
    numMedia: mediaList.length,
  };
}

exports.sendTwilioMessageInternal = sendTwilioMessageInternal;

exports.sendTwilioMessage = onCall(
  {
    region: "us-central1",
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
    timeoutSeconds: 60,
  },
  withFeatureTracking("sms.send", async (request, tracker) => {
    const auth = requireAuth(request);

    const {
      tenantID,
      storeID,
      fromPhoneNumber,
      to,
      body,
      mediaUrls,
      sentByName,
      workorderID,
      customerID,
    } = request.data || {};

    if (!tenantID || !storeID || !fromPhoneNumber || !to) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID, storeID, fromPhoneNumber, and to are required."
      );
    }
    if (!body && (!mediaUrls || mediaUrls.length === 0)) {
      throw new HttpsError(
        "invalid-argument",
        "Either body or mediaUrls must be provided."
      );
    }

    // Tenant/store membership check — any active member (level 1+) can send.
    // Routing-ownership check inside the helper independently enforces that
    // the From number belongs to this (tenantID, storeID).
    await requireTenantMember(tenantID, request, { storeID });

    logger.info("sendTwilioMessage: starting", {
      tenantID,
      storeID,
      from: fromPhoneNumber,
      to,
      hasBody: !!body,
      numMedia: (mediaUrls || []).length,
      uid: auth.uid,
    });

    const db = getFirestore();

    return sendTwilioMessageInternal({
      db,
      tenantID,
      storeID,
      fromPhoneNumber,
      to,
      body,
      mediaUrls,
      sentByName,
      workorderID,
      customerID,
      authUid: auth.uid,
      tracker,
    });
  })
);
