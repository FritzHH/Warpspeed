/* eslint-disable */
// Phase 3 — Inbound Twilio Pub/Sub subscriber.
//
// Reads from `twilio-inbound`, dedupes via tenants/{tid}/twilio-processed-
// messages/{messageSid}, writes the message into the per-store inbox at
// tenants/{tid}/stores/{sid}/incoming-messages/{messageSid}, and downloads
// any MMS media to Cloud Storage at {tid}/{sid}/sms-media/{messageSid}/.
//
// Idempotency: at-least-once delivery is guaranteed by Pub/Sub. The atomic
// create on the processed-messages doc is the gate. Media downloads run
// AFTER the idempotency marker is written, so a redelivery sees the marker
// and short-circuits without re-downloading.
//
// Failure / retry: any throw causes Pub/Sub to redeliver. After
// MAX_DELIVERY_ATTEMPTS attempts the envelope is routed to the
// `twilio-events-dlq` topic for the DLQ ingestor.
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");
const common = require("./twilio-common");

if (!admin.apps.length) admin.initializeApp();

const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  loadSubaccountAuthToken,
} = common;

const MAX_DELIVERY_ATTEMPTS = 5;
const DLQ_TOPIC = "twilio-events-dlq";

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

exports.handler = onMessagePublished(
  {
    topic: "twilio-inbound",
    region: "us-central1",
    timeoutSeconds: 120,
    retry: true,
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async (event) => {
    const envelope = event.data.message.json || {};
    const {
      messageSid,
      accountSid,
      tenantID,
      storeID,
      from,
      to,
      body,
      numMedia,
      numSegments,
      rawParams,
      duringSuspension,
    } = envelope;
    const deliveryAttempt = event.data.deliveryAttempt || 1;

    if (!messageSid || !tenantID || !storeID) {
      logger.error("twilioInboundSubscriber: envelope missing required fields", {
        envelope,
      });
      return;
    }

    logger.info("twilioInboundSubscriber: received", {
      messageSid,
      tenantID,
      storeID,
      from,
      to,
      numMedia,
      deliveryAttempt,
    });

    if (deliveryAttempt > MAX_DELIVERY_ATTEMPTS) {
      logger.warn("twilioInboundSubscriber: max delivery attempts, routing to DLQ", {
        messageSid,
        deliveryAttempt,
      });
      await pubsub()
        .topic(DLQ_TOPIC)
        .publishMessage({
          json: {
            ...envelope,
            source: "twilio-inbound",
            failureReason: "max-delivery-attempts-exceeded",
            deliveryAttempt,
            routedAt: new Date().toISOString(),
          },
        });
      return;
    }

    const db = getFirestore();
    const processedRef = db
      .collection("tenants").doc(tenantID)
      .collection("twilio-processed-messages").doc(messageSid);

    try {
      await processedRef.create({
        receivedAt: FieldValue.serverTimestamp(),
        direction: "inbound",
        storeID,
        from,
        to,
        deliveryAttempt,
        status: "processing",
      });
    } catch (err) {
      if (err && err.code === 6) {
        logger.info("twilioInboundSubscriber: already processed (dedup ack)", {
          messageSid,
        });
        return;
      }
      throw err;
    }

    try {
      // ── Write inbox doc (best-effort body now; media URLs added after
      // download). ──
      const inboxRef = db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("incoming-messages").doc(messageSid);

      await inboxRef.set({
        messageSid,
        accountSid: accountSid || null,
        direction: "inbound",
        from,
        to,
        body: body || "",
        numMedia: numMedia || 0,
        numSegments: numSegments || 1,
        media: [],
        mediaStatus: numMedia > 0 ? "pending" : "none",
        read: false,
        // Inbound during a post-churn grace window. UI surfaces query on this
        // flag to suppress user-visible notifications (and to surface in an
        // admin audit view); doc itself is still written so opt-out events
        // are auditable.
        duringSuspension: duringSuspension === true,
        suppressNotification: duringSuspension === true,
        receivedAt: FieldValue.serverTimestamp(),
        twilioReceivedAt: envelope.receivedAt || null,
      });

      // ── MMS media download (if any) ──
      if (numMedia > 0) {
        try {
          const mediaRecords = await downloadAndStoreMmsMedia({
            tenantID,
            storeID,
            messageSid,
            numMedia,
            rawParams: rawParams || {},
          });
          await inboxRef.set(
            {
              media: mediaRecords,
              mediaStatus: "complete",
              mediaCompletedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (err) {
          // Media download failure is logged but not fatal — the text body
          // (if any) is already saved. Re-running the subscriber via DLQ
          // replay would overwrite mediaStatus.
          logger.error("twilioInboundSubscriber: media download failed", {
            messageSid,
            tenantID,
            error: err && err.message,
          });
          await inboxRef.set(
            {
              mediaStatus: "failed",
              mediaError: err && err.message ? err.message : "unknown",
            },
            { merge: true }
          );
        }
      }

      await processedRef.set(
        { status: "success", processedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );

      logger.info("twilioInboundSubscriber: processed", {
        messageSid,
        tenantID,
        storeID,
      });
    } catch (err) {
      logger.error("twilioInboundSubscriber: handler failed", {
        messageSid,
        tenantID,
        error: err && err.message,
      });
      // Clear the idempotency marker so a retry can re-run.
      try {
        await processedRef.delete();
      } catch (_) {
        // best effort
      }
      throw err;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// downloadAndStoreMmsMedia — fetch each MediaUrlN with HTTP Basic auth
// (subaccount SID + auth token), upload to Cloud Storage, return an array
// of media records (contentType, storagePath, gcsUri, size).
//
// Twilio media URLs require basic auth and serve the raw bytes. Once we
// download them, we own the persistence — the Twilio URLs eventually 410.
// ─────────────────────────────────────────────────────────────────────────
async function downloadAndStoreMmsMedia({
  tenantID,
  storeID,
  messageSid,
  numMedia,
  rawParams,
}) {
  const authToken = await loadSubaccountAuthToken(tenantID);
  const bucket = admin.storage().bucket();

  const results = [];
  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = rawParams[`MediaUrl${i}`];
    const contentType = rawParams[`MediaContentType${i}`] || "application/octet-stream";
    if (!mediaUrl) continue;

    // Resolve subaccount SID from the rawParams.AccountSid (already signed
    // and verified at the webhook).
    const accountSid = rawParams.AccountSid;
    const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const resp = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${basic}` },
      redirect: "follow",
    });
    if (!resp.ok) {
      throw new Error(
        `Media fetch ${i} failed: ${resp.status} ${resp.statusText}`
      );
    }
    const arrayBuf = await resp.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    const ext = extensionFromContentType(contentType);
    const storagePath = `${tenantID}/${storeID}/sms-media/${messageSid}/${i}${ext}`;
    const file = bucket.file(storagePath);
    await file.save(buf, {
      contentType,
      resumable: false,
      metadata: {
        metadata: {
          messageSid,
          tenantID,
          storeID,
          mediaIndex: String(i),
        },
      },
    });

    results.push({
      index: i,
      contentType,
      size: buf.length,
      storagePath,
      gcsUri: `gs://${bucket.name}/${storagePath}`,
    });
  }
  return results;
}

function extensionFromContentType(contentType) {
  // Best-effort extension. Used purely for human friendliness in storage paths;
  // the contentType metadata is what readers should rely on.
  const map = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/3gpp": ".3gp",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/amr": ".amr",
    "application/pdf": ".pdf",
  };
  return map[(contentType || "").toLowerCase()] || "";
}
