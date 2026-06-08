/* eslint-disable */
// Bonita-only JBI order submission — synchronous callable.
//
// Bonita Bikes (warpspeed-bonitabikes) hasn't migrated to cadence-pos yet,
// but the user wants vendor ordering to work AS IF it had. cadence-pos uses
// the Pub/Sub fan-out worker (functions/saas/vendor-submission-worker.js)
// to submit asynchronously and write status back onto a submission doc.
//
// For Bonita we keep things simpler: this is a single sync callable. The
// UI invokes it, waits for the result, and shows success/error inline.
// No submission doc, no Pub/Sub, no idempotency processing doc — Bonita
// is single-tenant single-store, so retry/dedup needs are minimal.
//
// Both code paths share the same handler module (functions/vendors/jbi.js)
// so behavior stays in lock-step.
//
// Input (data):
//   { orderID }
//
// Auth requirement:
//   Standard Bonita auth (any signed-in user). Bonita is single-tenant, no
//   tenant-match guard is needed; the tenantID/storeID come from settings
//   on the server side via the same env constants the rest of bonita uses.
//
// Return shape (resolves):
//   { success: true, result: <handler return> }
// Or throws HttpsError("internal", message) on failure — caller surfaces
// the error message in an alert.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const jbiHandler = require("../vendors/jbi");

if (!admin.apps.length) admin.initializeApp();

// Platform-level secrets — set on warpspeed-bonitabikes via:
//   firebase functions:secrets:set JBI_FTP_HOST --project=warpspeed-bonitabikes
//   firebase functions:secrets:set JBI_FTP_USERNAME --project=warpspeed-bonitabikes
//   firebase functions:secrets:set JBI_FTP_PASSWORD --project=warpspeed-bonitabikes
//   firebase functions:secrets:set JBI_PLATFORM_API_KEY --project=warpspeed-bonitabikes
const JBI_FTP_HOST = defineSecret("JBI_FTP_HOST");
const JBI_FTP_USERNAME = defineSecret("JBI_FTP_USERNAME");
const JBI_FTP_PASSWORD = defineSecret("JBI_FTP_PASSWORD");
const JBI_PLATFORM_API_KEY = defineSecret("JBI_PLATFORM_API_KEY");

// Bonita is single-tenant single-store — these are the fixed IDs used
// throughout the Bonita Firestore tree. If Bonita ever onboards a second
// store, fold these into a per-store lookup; until then, hardcoded is fine.
const BONITA_TENANT_ID = "bonita";
const BONITA_STORE_ID = "bonita";

exports.submitJbiOrderCallable = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 540, // FTP retries / API backoff can be slow
    memory: "512MiB",
    secrets: [JBI_FTP_HOST, JBI_FTP_USERNAME, JBI_FTP_PASSWORD, JBI_PLATFORM_API_KEY],
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const orderID = request.data && request.data.orderID;
    if (!orderID || typeof orderID !== "string") {
      throw new HttpsError("invalid-argument", "orderID is required.");
    }

    const db = getFirestore();
    const orderRef = db
      .collection("tenants").doc(BONITA_TENANT_ID)
      .collection("stores").doc(BONITA_STORE_ID)
      .collection("vendor-orders").doc(orderID);

    let order;
    let items;
    let settings;
    try {
      const [orderSnap, itemsSnap, settingsSnap] = await Promise.all([
        orderRef.get(),
        orderRef.collection("items").get(),
        db
          .collection("tenants").doc(BONITA_TENANT_ID)
          .collection("stores").doc(BONITA_STORE_ID)
          .collection("settings").doc("settings")
          .get(),
      ]);

      if (!orderSnap.exists) {
        throw new HttpsError("not-found", `Order ${orderID} not found.`);
      }
      order = orderSnap.data() || {};
      items = itemsSnap.docs
        .map((d) => d.data() || {})
        .sort((a, b) => Number(a.addedMillis || 0) - Number(b.addedMillis || 0));
      settings = (settingsSnap.exists && settingsSnap.data()) || {};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("submitJbiOrderCallable: load failed", {
        orderID,
        error: err && err.message,
      });
      throw new HttpsError("internal", `Failed to load order: ${err && err.message ? err.message : err}`);
    }

    // The JBI handler reads platform creds via .value() on its own
    // defineSecret instances; the onCall `secrets:` option above keeps
    // them available at runtime. The dealer's account number + contact
    // email come from legacy settings.vendors.jbi on Bonita; SaaS reads
    // the same shape from Firestore vendor_connections/jbi.connection.
    const vendorConfig = (settings.vendors && settings.vendors.jbi) || {};
    const connection = {
      accountNumber:
        vendorConfig.accountNumber || vendorConfig.dealerAccountNumber || "",
      contactEmail: vendorConfig.contactEmail || "",
    };

    const submissionID = `bonita-${Date.now()}`;
    const ctx = {
      tenantID: BONITA_TENANT_ID,
      storeID: BONITA_STORE_ID,
      vendorID: "jbi",
      orderID,
      submissionID,
      logger,
    };

    let result;
    try {
      result = await jbiHandler.submit({
        order,
        items,
        connection,
        secrets: {},
        ctx,
      });
    } catch (err) {
      const message = (err && err.message) || String(err);
      logger.error("submitJbiOrderCallable: handler failed", {
        orderID,
        error: message,
      });
      throw new HttpsError("internal", message);
    }

    const completedMs = Date.now();

    // Best-effort: flip the order to submitted so the UI can hide it from
    // "open orders" lists. Matches what the cadence-pos worker does.
    try {
      await orderRef.set(
        {
          status: "submitted",
          submittedMillis: completedMs,
          submittedToVendorID: "jbi",
          submissionID,
          lastResult: result || null,
        },
        { merge: true }
      );
    } catch (err) {
      logger.warn("submitJbiOrderCallable: order status flip failed (non-fatal)", {
        orderID,
        error: err && err.message,
      });
    }

    return {
      success: true,
      submissionID,
      result: result || null,
    };
  }
);
