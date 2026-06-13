/* eslint-disable */
// Bonita-only road calling — outbound bridge + inbound expectation-window
// routing for the dedicated on-the-road number (+12393453980).
//
// roadCallInitiate (onCall):
//   1. Look up the calling user's personal cell from settings.users[userID]
//   2. Twilio calls.create rings the user's cell; once they answer, the
//      attached TwiML <Dial> bridges to the customer with caller ID set to
//      ROAD_NUMBER (customer sees the road number, not the user's cell)
//   3. Write call-expectations/{customerE164} so a callback within the
//      window routes back to this same user
//
// roadVoiceInbound (webhook on ROAD_NUMBER):
//   - Resolve tenantID/storeID from query params (single number, single
//     store on Bonita)
//   - Look up call-expectations/{From}; if matched + not expired, <Dial>
//     the user's cell and auto-extend the window
//   - Otherwise play the rejection message and hang up

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const twilio = require("twilio");

if (!admin.apps.length) admin.initializeApp();

const twilioSecretKey = defineSecret("twilioSecretKey");
const twilioSecretAccountNumber = defineSecret("twilioSecretAccountNum");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "warpspeed-bonitabikes";
const FUNCTIONS_BASE_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;

// V1: hardcoded. SaaS port will move these to a per-tenant Firestore config.
const ROAD_NUMBER = "+12393453980";
const CALLBACK_WINDOW_MS = 30 * 60 * 1000;
const REJECTION_MESSAGE =
  "This number is for outgoing delivery and pickup calls only. Please call Bonita Bikes at 239-317-1234.";

const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function log(...args) {
  logger.log(...args);
}

function sendTwiML(response, xml) {
  response.set("Content-Type", "text/xml");
  return response.status(200).send(xml);
}

function normalizeToE164(raw) {
  let s = String(raw || "").trim();
  const hasPlus = s.startsWith("+");
  s = s.replace(/\D/g, "");
  if (!s) return "";
  if (hasPlus) return `+${s}`;
  if (s.length === 11 && s.startsWith("1")) return `+${s}`;
  if (s.length === 10) return `+1${s}`;
  return "";
}

function validateTwilioSignature(request, authToken, functionName) {
  const sig = request.headers["x-twilio-signature"];
  if (!sig) return false;
  const queryString = request.originalUrl.includes("?")
    ? request.originalUrl.substring(request.originalUrl.indexOf("?"))
    : "";
  const url = `${FUNCTIONS_BASE_URL}/${functionName}${queryString}`;
  return twilio.validateRequest(authToken.trim(), sig, url, request.body || {});
}

function callExpectationPath(tenantID, storeID, customerE164) {
  return `tenants/${tenantID}/stores/${storeID}/call-expectations/${customerE164}`;
}

// ═══════════════════════════════════════════════════════════════
// Callable: roadCallInitiate
// ═══════════════════════════════════════════════════════════════
exports.roadCallInitiate = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    secrets: [twilioSecretKey, twilioSecretAccountNumber],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const data = request.data || {};
    const tenantID = String(data.tenantID || "").trim();
    const storeID = String(data.storeID || "").trim();
    const userID = String(data.userID || "").trim();
    const customerPhoneRaw = String(data.customerPhone || "").trim();
    const customerName = String(data.customerName || "").trim();
    const customerID = String(data.customerID || "").trim();

    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required.");
    }
    if (!userID) {
      throw new HttpsError("invalid-argument", "userID is required.");
    }
    const customerE164 = normalizeToE164(customerPhoneRaw);
    if (!customerE164) {
      throw new HttpsError("invalid-argument", "customerPhone is not a valid number.");
    }

    const db = getFirestore();

    const settingsSnap = await db
      .doc(`tenants/${tenantID}/stores/${storeID}/settings/settings`)
      .get();
    if (!settingsSnap.exists) {
      throw new HttpsError("not-found", "Store settings not found.");
    }
    const settings = settingsSnap.data() || {};
    const users = Array.isArray(settings.users) ? settings.users : [];
    const callingUser = users.find((u) => u && u.id === userID);
    if (!callingUser) {
      throw new HttpsError("not-found", "Calling user not found in store users.");
    }
    const userCell = normalizeToE164(callingUser.phone);
    if (!userCell) {
      throw new HttpsError(
        "failed-precondition",
        "Calling user has no personal cell number on file."
      );
    }

    // Build the bridge TwiML for leg 2 (Twilio → customer once user answers).
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const bridgeTwiML = new VoiceResponse();
    const dial = bridgeTwiML.dial({ callerId: ROAD_NUMBER, answerOnBridge: true });
    dial.number(customerE164);

    const client = twilio(
      twilioSecretAccountNumber.value().trim(),
      twilioSecretKey.value().trim()
    );

    let call;
    try {
      call = await client.calls.create({
        to: userCell,
        from: ROAD_NUMBER,
        twiml: bridgeTwiML.toString(),
      });
    } catch (err) {
      log("roadCallInitiate: Twilio API error", {
        message: err.message,
        code: err.code,
        userID,
        customerE164,
      });
      throw new HttpsError("internal", `Twilio call failed: ${err.message}`);
    }

    const now = Date.now();
    const expiresAt = now + CALLBACK_WINDOW_MS;
    const expectation = {
      userID,
      userCell,
      customerPhone: customerE164,
      customerName: customerName || "",
      customerID: customerID || "",
      setBy: "outbound",
      setAt: now,
      expiresAt,
      callSid: call.sid,
    };

    await db
      .doc(callExpectationPath(tenantID, storeID, customerE164))
      .set(expectation);

    log("roadCallInitiate: success", {
      callSid: call.sid,
      userID,
      customerE164,
      expiresAt,
    });

    return {
      success: true,
      callSid: call.sid,
      expiresAt,
      customerPhone: customerE164,
    };
  }
);

// ═══════════════════════════════════════════════════════════════
// Webhook: roadVoiceInbound
// Configure in Twilio Console on ROAD_NUMBER's voice URL with the
// tenantID + storeID query params (single number, single store on Bonita).
// ═══════════════════════════════════════════════════════════════
exports.roadVoiceInbound = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    secrets: [twilioSecretKey],
  },
  async (request, response) => {
    try {
      if (!validateTwilioSignature(request, twilioSecretKey.value(), "roadVoiceInbound")) {
        log("roadVoiceInbound: invalid Twilio signature");
        return response.status(403).send(EMPTY_TWIML);
      }

      const twilioData = request.body || {};
      const callSid = twilioData.CallSid || "no-sid";
      const rawFrom = twilioData.From || "";

      const tenantID = String(request.query.tenantID || "").trim();
      const storeID = String(request.query.storeID || "").trim();
      if (!tenantID || !storeID) {
        log("roadVoiceInbound: missing tenantID/storeID query params", { callSid });
        return sendTwiML(response, EMPTY_TWIML);
      }

      const VoiceResponse = twilio.twiml.VoiceResponse;
      const resp = new VoiceResponse();
      const fromE164 = normalizeToE164(rawFrom);

      if (!fromE164) {
        log("roadVoiceInbound: unparseable From", { callSid, rawFrom });
        resp.say({ voice: "Polly.Joanna" }, REJECTION_MESSAGE);
        resp.hangup();
        return sendTwiML(response, resp.toString());
      }

      const db = getFirestore();
      const expectationRef = db.doc(callExpectationPath(tenantID, storeID, fromE164));
      const expectationSnap = await expectationRef.get();
      const data = expectationSnap.exists ? expectationSnap.data() : null;
      const now = Date.now();
      const matched = data && data.expiresAt && data.expiresAt > now && data.userCell;

      if (matched) {
        log("roadVoiceInbound: matched expectation, bridging", {
          callSid,
          from: fromE164,
          userCell: data.userCell,
          userID: data.userID,
        });

        // Auto-extend so an immediate re-callback after hangup still routes.
        await expectationRef.update({
          expiresAt: now + CALLBACK_WINDOW_MS,
          consumedAt: now,
        });

        // No callerId → Twilio passes through the actual caller's number,
        // so the user's cell shows the customer (not the road number).
        const dial = resp.dial({ answerOnBridge: true });
        dial.number(data.userCell);
        return sendTwiML(response, resp.toString());
      }

      let siblingDocIds = [];
      try {
        const colSnap = await db
          .collection(`tenants/${tenantID}/stores/${storeID}/call-expectations`)
          .limit(10)
          .get();
        siblingDocIds = colSnap.docs.map((d) => d.id);
      } catch (e) {
        siblingDocIds = [`(listing failed: ${e.message})`];
      }
      log("roadVoiceInbound: no matching expectation, rejecting", {
        callSid,
        from: fromE164,
        hadDoc: !!data,
        expired: data ? data.expiresAt <= now : null,
        tenantID,
        storeID,
        lookupPath: callExpectationPath(tenantID, storeID, fromE164),
        userCellPresent: data ? !!data.userCell : null,
        siblingDocIds,
      });
      resp.say({ voice: "Polly.Joanna" }, REJECTION_MESSAGE);
      resp.hangup();
      return sendTwiML(response, resp.toString());
    } catch (err) {
      log("roadVoiceInbound: unexpected error", { error: err.message, stack: err.stack });
      return sendTwiML(response, EMPTY_TWIML);
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// Callable: roadCallCancel
// Aborts an in-flight outbound road call by SID. Used when the
// user dismisses the "Calling..." dialog before answering their
// own cell. Also clears the call-expectation doc so an unrelated
// inbound from the same customer doesn't route here.
// ═══════════════════════════════════════════════════════════════
exports.roadCallCancel = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    secrets: [twilioSecretKey, twilioSecretAccountNumber],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const data = request.data || {};
    const tenantID = String(data.tenantID || "").trim();
    const storeID = String(data.storeID || "").trim();
    const callSid = String(data.callSid || "").trim();
    const customerPhoneRaw = String(data.customerPhone || "").trim();

    if (!callSid) {
      throw new HttpsError("invalid-argument", "callSid is required.");
    }

    const client = twilio(
      twilioSecretAccountNumber.value().trim(),
      twilioSecretKey.value().trim()
    );

    let cancelled = false;
    try {
      await client.calls(callSid).update({ status: "canceled" });
      cancelled = true;
    } catch (err) {
      log("roadCallCancel: Twilio cancel failed", {
        message: err.message,
        code: err.code,
        callSid,
      });
    }

    if (tenantID && storeID) {
      const customerE164 = normalizeToE164(customerPhoneRaw);
      if (customerE164) {
        try {
          const db = getFirestore();
          const ref = db.doc(callExpectationPath(tenantID, storeID, customerE164));
          const snap = await ref.get();
          if (snap.exists && snap.data()?.callSid === callSid) {
            await ref.delete();
          }
        } catch (err) {
          log("roadCallCancel: expectation cleanup failed", {
            message: err.message,
            callSid,
          });
        }
      }
    }

    return { success: true, cancelled, callSid };
  }
);

// Exported for unit tests
exports._internal = {
  normalizeToE164,
  callExpectationPath,
  ROAD_NUMBER,
  CALLBACK_WINDOW_MS,
  REJECTION_MESSAGE,
};
