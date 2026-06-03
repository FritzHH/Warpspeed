/* eslint-disable */
// Bonita-only phone voice webhook handlers.
//
// `phoneVoiceInbound` is the Twilio "A CALL COMES IN" webhook target. It:
//   1. Validates the Twilio signature
//   2. Resolves tenant/store from the `To` number via `store_phones`
//   3. Reads phone-config + settings (storeHours, storeInfo)
//   4. Decides open/closed:
//        - phoneConfig.manualOverride ∈ {"auto","open","closed"}
//        - "auto" → derive timezone from storeInfo.zip, check storeHours
//   5. Returns TwiML:
//        - Closed:  <Say>after-hours greeting</Say><Hangup/>
//        - Open:    <Say>open greeting</Say>
//                   <Dial answerOnBridge timeout=N action=phoneVoiceDialAction>
//                       <Sip>...</Sip>  // one per configured endpoint
//                   </Dial>
//
// `phoneVoiceDialAction` is the action callback Twilio hits after the
// `<Dial>` block completes. If the call was bridged (answered/completed) we
// just <Hangup>. Otherwise (no-answer/busy/failed/canceled) we play the
// "no answer" greeting and hang up. No voicemail.
//
// Multi-call: Twilio has no per-number concurrent-call cap. Each incoming
// call runs this webhook independently and rings all SIP endpoints; SIP 486
// (busy here) from a busy endpoint falls through to the action callback.

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const twilio = require("twilio");
const zipToTz = require("zipcode-to-timezone");

if (!admin.apps.length) admin.initializeApp();

const twilioSecretKey = defineSecret("twilioSecretKey");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "warpspeed-bonitabikes";
const FUNCTIONS_BASE_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;

const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function log(...args) {
  logger.log(...args);
}

function sendTwiML(response, xml) {
  response.set("Content-Type", "text/xml");
  return response.status(200).send(xml);
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

function parseTimeToMinutes(label) {
  // "10:00 AM" / "6:00 PM" / "13:30" → minutes since midnight
  if (!label || typeof label !== "string") return null;
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === "AM" && h === 12) h = 0;
  else if (ampm === "PM" && h !== 12) h += 12;
  if (isNaN(h) || isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function isWithinWindow(currentMin, openLabel, closeLabel) {
  const o = parseTimeToMinutes(openLabel);
  const c = parseTimeToMinutes(closeLabel);
  if (o == null || c == null) return false;
  if (c <= o) return currentMin >= o || currentMin < c; // wraps midnight
  return currentMin >= o && currentMin < c;
}

function getTzPartsForDate(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return parts;
}

function resolveOpenStatus(phoneCfg, settings) {
  const override = (phoneCfg && phoneCfg.manualOverride) || "auto";
  if (override === "open") return { open: true, reason: "override:open" };
  if (override === "closed") return { open: false, reason: "override:closed" };

  const storeHours = (settings && settings.storeHours) || {};
  const standard = Array.isArray(storeHours.standard) ? storeHours.standard : [];
  const special = Array.isArray(storeHours.special) ? storeHours.special : [];

  const zip = (settings && settings.storeInfo && settings.storeInfo.zip) || "";
  const tz = zipToTz.lookup(String(zip).slice(0, 5)) || "America/New_York";

  const now = new Date();
  const parts = getTzPartsForDate(now, tz);
  const weekdayName = parts.weekday; // "Monday"
  const todayKey = `${parts.year}-${parts.month}-${parts.day}`;
  const currentMin = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);

  // Special-day override takes precedence
  for (const sp of special) {
    if (!sp || !sp.dateMillies) continue;
    const spParts = getTzPartsForDate(new Date(sp.dateMillies), tz);
    const spKey = `${spParts.year}-${spParts.month}-${spParts.day}`;
    if (spKey === todayKey) {
      if (!sp.isOpen) return { open: false, reason: "special:closed", tz, weekdayName };
      const within = isWithinWindow(currentMin, sp.open, sp.close);
      return {
        open: within,
        reason: within ? "special:open-window" : "special:outside-window",
        tz,
        weekdayName,
      };
    }
  }

  const todayStd = standard.find((d) => d && d.name === weekdayName);
  if (!todayStd) return { open: false, reason: "no-standard-entry", tz, weekdayName };
  if (!todayStd.isOpen) return { open: false, reason: "standard:closed", tz, weekdayName };
  const within = isWithinWindow(currentMin, todayStd.open, todayStd.close);
  return {
    open: within,
    reason: within ? "standard:open-window" : "standard:outside-window",
    tz,
    weekdayName,
  };
}

function playGreeting(twimlResponse, greeting) {
  if (!greeting) return false;
  if (greeting.type === "audio" && greeting.audioURL) {
    twimlResponse.play(greeting.audioURL);
    return true;
  }
  const text = (greeting.text || "").trim();
  if (text) {
    twimlResponse.say({ voice: "Polly.Joanna" }, text);
    return true;
  }
  return false;
}

async function loadPhoneCfgAndSettings(db, tenantID, storeID) {
  const [phoneSnap, settingsSnap] = await Promise.all([
    db.doc(`tenants/${tenantID}/stores/${storeID}/phone-config/main`).get(),
    db.doc(`tenants/${tenantID}/stores/${storeID}/settings/settings`).get(),
  ]);
  return {
    phoneCfg: phoneSnap.exists ? phoneSnap.data() : {},
    settings: settingsSnap.exists ? settingsSnap.data() : {},
  };
}

async function resolveStoreFromToNumber(db, rawTo) {
  const normalizedTo = String(rawTo || "").replace(/^\+1/, "").replace(/\D/g, "");
  if (normalizedTo.length !== 10) return { error: "invalid-to-number" };
  const snap = await db.collection("store_phones").doc(normalizedTo).get();
  if (!snap.exists) return { error: "no-store_phones-entry" };
  const data = snap.data() || {};
  const tenantID = data.tenantId || data.tentantId;
  const storeID = data.storeId;
  if (!tenantID || !storeID) return { error: "store_phones-missing-ids" };
  return { tenantID, storeID };
}

// ═══════════════════════════════════════════════════════════════
// Webhook: phoneVoiceInbound
// ═══════════════════════════════════════════════════════════════
exports.phoneVoiceInbound = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    secrets: [twilioSecretKey],
  },
  async (request, response) => {
    try {
      if (!validateTwilioSignature(request, twilioSecretKey.value(), "phoneVoiceInbound")) {
        log("phoneVoiceInbound: invalid Twilio signature");
        return response.status(403).send(EMPTY_TWIML);
      }

      const twilioData = request.body || {};
      const callSid = twilioData.CallSid || "no-sid";
      const rawTo = twilioData.To || "";
      const rawFrom = twilioData.From || "";

      const db = getFirestore();

      const resolved = await resolveStoreFromToNumber(db, rawTo);
      if (resolved.error) {
        log("phoneVoiceInbound: store resolution failed", { callSid, rawTo, error: resolved.error });
        return sendTwiML(response, EMPTY_TWIML);
      }
      const { tenantID, storeID } = resolved;

      const { phoneCfg, settings } = await loadPhoneCfgAndSettings(db, tenantID, storeID);
      const status = resolveOpenStatus(phoneCfg, settings);

      log("phoneVoiceInbound: call routing", {
        callSid,
        from: rawFrom,
        to: rawTo,
        tenantID,
        storeID,
        open: status.open,
        reason: status.reason,
        tz: status.tz,
        weekday: status.weekdayName,
      });

      const VoiceResponse = twilio.twiml.VoiceResponse;
      const resp = new VoiceResponse();

      if (!status.open) {
        playGreeting(resp, phoneCfg.greetingAfterHours);
        resp.hangup();
        return sendTwiML(response, resp.toString());
      }

      // Open: play greeting, then dial SIP endpoints in parallel.
      playGreeting(resp, phoneCfg.greetingOpen);

      const sipEndpoints = Array.isArray(phoneCfg.sipEndpoints)
        ? phoneCfg.sipEndpoints.filter((s) => s && typeof s === "string" && s.trim())
        : [];

      if (sipEndpoints.length === 0) {
        // Nothing to ring — play no-answer message and hang up.
        playGreeting(resp, phoneCfg.greetingNoAnswer);
        resp.hangup();
        return sendTwiML(response, resp.toString());
      }

      const timeoutSec = Math.max(5, Math.min(60, Number(phoneCfg.ringTimeoutSeconds) || 20));
      const actionUrl =
        `${FUNCTIONS_BASE_URL}/phoneVoiceDialAction` +
        `?tenantID=${encodeURIComponent(tenantID)}` +
        `&storeID=${encodeURIComponent(storeID)}`;

      const dial = resp.dial({
        answerOnBridge: true,
        timeout: timeoutSec,
        action: actionUrl,
        method: "POST",
      });
      for (const sipUri of sipEndpoints) {
        dial.sip(sipUri.trim());
      }

      return sendTwiML(response, resp.toString());
    } catch (err) {
      log("phoneVoiceInbound: unexpected error", { error: err.message, stack: err.stack });
      return sendTwiML(response, EMPTY_TWIML);
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// Webhook: phoneVoiceDialAction
// Called by Twilio after <Dial> completes (success or fail).
// ═══════════════════════════════════════════════════════════════
exports.phoneVoiceDialAction = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    secrets: [twilioSecretKey],
  },
  async (request, response) => {
    try {
      if (!validateTwilioSignature(request, twilioSecretKey.value(), "phoneVoiceDialAction")) {
        log("phoneVoiceDialAction: invalid Twilio signature");
        return response.status(403).send(EMPTY_TWIML);
      }

      const twilioData = request.body || {};
      const callSid = twilioData.CallSid || "no-sid";
      const dialStatus = String(twilioData.DialCallStatus || "").toLowerCase();

      const VoiceResponse = twilio.twiml.VoiceResponse;
      const resp = new VoiceResponse();

      // Successful bridge: just hang up. Twilio has already played the bridged
      // audio between caller and answerer.
      if (dialStatus === "answered" || dialStatus === "completed") {
        log("phoneVoiceDialAction: bridged call ended", { callSid, dialStatus });
        resp.hangup();
        return sendTwiML(response, resp.toString());
      }

      // Otherwise: play no-answer greeting and hang up. No voicemail.
      const tenantID = String(request.query.tenantID || "");
      const storeID = String(request.query.storeID || "");

      let phoneCfg = {};
      if (tenantID && storeID) {
        const db = getFirestore();
        const snap = await db
          .doc(`tenants/${tenantID}/stores/${storeID}/phone-config/main`)
          .get();
        if (snap.exists) phoneCfg = snap.data();
      }

      log("phoneVoiceDialAction: no answer / busy", { callSid, dialStatus, tenantID, storeID });
      playGreeting(resp, phoneCfg.greetingNoAnswer);
      resp.hangup();
      return sendTwiML(response, resp.toString());
    } catch (err) {
      log("phoneVoiceDialAction: unexpected error", { error: err.message, stack: err.stack });
      return sendTwiML(response, EMPTY_TWIML);
    }
  }
);

// Exported for unit tests.
exports._internal = {
  parseTimeToMinutes,
  isWithinWindow,
  resolveOpenStatus,
  resolveStoreFromToNumber,
};
