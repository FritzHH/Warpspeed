/* eslint-disable */
/**
 * Usage Tracking — feature-level cost analytics.
 *
 * Wraps onCall / onRequest handlers to capture:
 *   - feature label (e.g. "sms.send", "stripe.payment.complete")
 *   - duration (ms)
 *   - tenantID / storeID / userID / correlationID / parentEventId
 *   - cost dimensions (twilioSegments, stripeAmountCents, pdfBytes, etc.) via tracker.bump()
 *   - success / error
 *
 * Emits ONE event per invocation to:
 *   1. Cloud Logging (always — structured `usage.feature` log line)
 *   2. Firestore at tenants/{tenantID}/stores/{storeID}/usage-events/{auto-id}
 *      (best-effort; failures swallowed and logged)
 *
 * The handler receives `tracker` as a second argument and calls
 * `tracker.bump("twilioSegments", n)` etc. as it does billable work.
 */

const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

// ─────────────────────────────────────────────────────────────────────────────
// Named admin app for analytics writes
// Isolated from the default app so analytics init never conflicts with the
// service-account-creds default app initialized inside getDB().
// ─────────────────────────────────────────────────────────────────────────────
let _analyticsApp = null;
function getAnalyticsApp() {
  if (_analyticsApp) return _analyticsApp;
  const existing = admin.apps.find((a) => a && a.name === "analytics");
  if (existing) {
    _analyticsApp = existing;
    return _analyticsApp;
  }
  _analyticsApp = admin.initializeApp({}, "analytics");
  return _analyticsApp;
}

function getAnalyticsDB() {
  return getAnalyticsApp().firestore();
}

function getEventCollection(tenantID, storeID) {
  const t = tenantID || "_unknown_tenant";
  const s = storeID || "_unknown_store";
  return getAnalyticsDB()
    .collection("tenants").doc(t)
    .collection("stores").doc(s)
    .collection("usage-events");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracker
// ─────────────────────────────────────────────────────────────────────────────
function makeTracker(feature, ctx = {}) {
  const start = Date.now();
  const counters = {};

  return {
    /** Increment a numeric counter (twilioSegments, firestoreWrites, etc.) */
    bump(key, n = 1) {
      counters[key] = (counters[key] || 0) + n;
    },

    /** Set an arbitrary value on the event (overrides bump for that key) */
    set(key, value) {
      counters[key] = value;
    },

    /** Returns the current counter snapshot (useful for tests / debugging) */
    snapshot() {
      return { feature, ctx: { ...ctx }, counters: { ...counters } };
    },

    /** Mutate ctx mid-flight (e.g. set workorderID once known) */
    setContext(patch) {
      Object.assign(ctx, patch);
    },

    /**
     * Emit the event. Called automatically by withFeatureTracking* wrappers
     * on handler success/failure; do not call manually unless using makeTracker
     * outside a wrapper.
     */
    async finish(ok, extra = {}) {
      const durationMs = Date.now() - start;
      const baseEvent = {
        feature,
        ok,
        durationMs,
        tenantID: ctx.tenantID || null,
        storeID: ctx.storeID || null,
        userID: ctx.userID || null,
        correlationID: ctx.correlationID || null,
        parentEventId: ctx.parentEventId || null,
        sessionID: ctx.sessionID || null,
        workorderID: ctx.workorderID || null,
        customerID: ctx.customerID || null,
        saleID: ctx.saleID || null,
        ...counters,
        ...extra,
      };

      // Cloud Logging — always (free, captures even if Firestore write fails)
      logger.info("usage.feature", baseEvent);

      // Firestore — best effort. Each event we write is itself one analytics
      // Firestore write; we tag it so the dashboard can surface that overhead
      // as a separate line item ("analytics.selfCost") rather than rolling it
      // into the feature it observed.
      try {
        await getEventCollection(ctx.tenantID, ctx.storeID).add({
          ...baseEvent,
          ts: admin.firestore.FieldValue.serverTimestamp(),
          createdAtMs: Date.now(),
          analyticsSelfWrites: 1,
        });
      } catch (err) {
        logger.warn("usage.firestoreWriteFailed", {
          feature,
          error: err && err.message,
        });
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context extraction
// ─────────────────────────────────────────────────────────────────────────────
function extractCallableCtx(request) {
  const data = (request && request.data) || {};
  const auth = (request && request.auth) || {};
  return {
    tenantID: data.tenantID || null,
    storeID: data.storeID || null,
    userID: auth.uid || data.userID || null,
    correlationID: data.correlationID || null,
    parentEventId: data.parentEventId || null,
    sessionID: data.sessionID || null,
    workorderID: data.workorderID || null,
    customerID: data.customerID || null,
    saleID: data.saleID || null,
  };
}

function extractHttpCtx(req) {
  const body = (req && req.body) || {};
  const query = (req && req.query) || {};
  return {
    tenantID: body.tenantID || query.tenantID || null,
    storeID: body.storeID || query.storeID || null,
    userID: body.userID || query.userID || null,
    correlationID:
      body.correlationID ||
      query.correlationID ||
      // Stripe & Twilio canonical IDs in webhook payloads
      body.id ||
      body.MessageSid ||
      null,
    parentEventId: body.parentEventId || query.parentEventId || null,
    sessionID: body.sessionID || query.sessionID || null,
    workorderID: body.workorderID || query.workorderID || null,
    customerID: body.customerID || query.customerID || null,
    saleID: body.saleID || query.saleID || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap an onCall handler with feature tracking.
 *
 *   exports.sendSMSEnhanced = onCall(
 *     { secrets: [...] },
 *     withFeatureTracking("sms.send", async (request, tracker) => {
 *       // ...handler body...
 *       tracker.bump("twilioSegments", n);
 *       tracker.bump("firestoreWrites", 2);
 *       return { ... };
 *     })
 *   );
 */
function withFeatureTracking(feature, handler) {
  return async function trackedCallableHandler(request) {
    const tracker = makeTracker(feature, extractCallableCtx(request));
    try {
      const result = await handler(request, tracker);
      await tracker.finish(true);
      return result;
    } catch (err) {
      await tracker.finish(false, {
        errorCode: (err && err.code) || null,
        errorMessage: (err && err.message) || null,
      });
      throw err;
    }
  };
}

/**
 * Wrap an onRequest handler with feature tracking (webhooks, raw HTTP).
 *
 *   exports.stripeCheckoutWebhook_Terminal = onRequest(
 *     { secrets: [...] },
 *     withFeatureTrackingHttp("stripe.webhook.terminal", async (req, res, tracker) => {
 *       // ...handler body...
 *       tracker.bump("stripeAmountCents", paymentIntent.amount);
 *       res.status(200).send("ok");
 *     })
 *   );
 *
 * NOTE: HTTP handlers don't throw to a wrapper — they call res.status().
 * The wrapper inspects res.statusCode after the handler returns to determine ok.
 */
function withFeatureTrackingHttp(feature, handler) {
  return async function trackedHttpHandler(req, res) {
    const tracker = makeTracker(feature, extractHttpCtx(req));
    let threw = false;
    let errorExtra = {};
    try {
      await handler(req, res, tracker);
    } catch (err) {
      threw = true;
      errorExtra = {
        errorCode: (err && err.code) || null,
        errorMessage: (err && err.message) || null,
      };
      throw err;
    } finally {
      const statusCode = (res && res.statusCode) || 200;
      const ok = !threw && statusCode < 400;
      await tracker.finish(ok, {
        httpStatus: statusCode,
        ...errorExtra,
      });
    }
  };
}

/**
 * Wrap an onSchedule handler with feature tracking.
 *
 *   exports.pullVendorTotals = onSchedule(
 *     { schedule: "0 2 * * *", timeZone: "America/Los_Angeles" },
 *     withFeatureTrackingSchedule("system.pullVendorTotals", async (event, tracker) => {
 *       // ...handler body...
 *     })
 *   );
 *
 * Scheduled functions have no request context, so caller must use
 * tracker.setContext() to populate tenantID / storeID if needed.
 */
function withFeatureTrackingSchedule(feature, handler) {
  return async function trackedScheduleHandler(event) {
    const tracker = makeTracker(feature, {
      tenantID: null,
      storeID: null,
      userID: "system",
      correlationID: (event && event.scheduleTime) || null,
    });
    try {
      const result = await handler(event, tracker);
      await tracker.finish(true);
      return result;
    } catch (err) {
      await tracker.finish(false, {
        errorCode: (err && err.code) || null,
        errorMessage: (err && err.message) || null,
      });
      throw err;
    }
  };
}

module.exports = {
  makeTracker,
  withFeatureTracking,
  withFeatureTrackingHttp,
  withFeatureTrackingSchedule,
  getEventCollection,
  getAnalyticsDB,
};
