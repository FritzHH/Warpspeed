/* eslint-disable */
// Phase 7 — Alerting metric emitters.
//
// Cloud Logging covers the "did this error fire" signal for free — every
// `logger.error(...)` call shows up as a log entry that an alert policy can
// match on. What logs CAN'T tell you is "how many DLQ entries are unresolved
// right now," because the answer lives in Firestore, not the log stream.
//
// This emitter runs daily, queries the DLQ collection's unresolved count,
// and emits a structured `logger.info("twilioDlqDepth", { count, ... })`
// record so a log-based metric can extract `jsonPayload.count` for the
// alert policy threshold. Setup script lives in `alerts/setup-alerts.sh`.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

if (!admin.apps.length) admin.initializeApp();

exports.scheduledTwilioDLQDepthEmitter = onSchedule(
  {
    schedule: "every day 06:00",
    timeZone: "America/New_York",
    region: "us-central1",
    timeoutSeconds: 60,
  },
  async () => {
    const db = getFirestore();

    // .count() is a server-side aggregate — no doc reads billed, just one
    // aggregate query. Cheap enough to run daily even at scale.
    const snap = await db
      .collection("saas-twilio-dlq")
      .where("status", "==", "new")
      .count()
      .get();

    const count = snap.data().count || 0;

    // Structured log: the alerting policy extracts `jsonPayload.count` via
    // a DISTRIBUTION-typed log-based metric.
    logger.info("twilioDlqDepth", {
      count,
      emittedAt: new Date().toISOString(),
    });
  }
);
