/* eslint-disable */
// Voice fallback for SMS-only numbers.
//
// Every Twilio US phone number has a voice slot, even if we only use it for
// SMS. Without a voiceUrl set, an inbound call hits Twilio's default
// "this application is not configured" Twimlet — which sounds broken to the
// customer. This function returns a polite SMS-only TwiML response.
//
// No auth required (Twilio fetches it directly). No tenant-scoping needed —
// the message is identical for every number across every tenant. If we ever
// want per-tenant branding ("you've reached Bonita Bikes — please text us"),
// route through the AccountSid form param to look up the tenant.
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");

exports.handler = onRequest(
  { region: "us-central1" },
  (req, res) => {
    const accountSid = (req.body && req.body.AccountSid) || req.query.AccountSid;
    const from = (req.body && req.body.From) || req.query.From;
    logger.info("twilioVoiceFallback: inbound call", {
      accountSid: accountSid || null,
      from: from || null,
    });
    res.set("Content-Type", "text/xml");
    res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        `<Say voice="alice">` +
        `This phone number receives text messages only. ` +
        `Please send a text message instead. Goodbye.` +
        `</Say>` +
        `<Hangup/>` +
        `</Response>`
    );
  }
);
