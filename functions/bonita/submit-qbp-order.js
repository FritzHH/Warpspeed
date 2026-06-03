/* eslint-disable */
// Bonita-only QBP order submission — sync callable.
//
// Mirrors the JBI Bonita pattern (functions/bonita/submit-jbi-order.js):
// loads the order + items + settings on the server, calls into the shared
// handler at functions/vendors/qbp.js, and returns the result.
//
// QBP is fire-and-forget at the handler level: the .poi gets uploaded and a
// pending-qbp-responses tracking doc is written, but the .por response lands
// asynchronously (minutes later). The scheduled poller at
// functions/bonita/qbp-response-poller.js completes the submission doc when
// the response arrives.
//
// UI contract:
//   - call returns within seconds with { success: true, result: {
//       awaitingVendorResponse: true, eftpFilename, ... } }
//   - UI shows "Submitted — waiting for QBP confirmation"
//   - UI subscribes to the submission doc; when the poller updates
//     result.vendorResponse, status flips to confirmed (or failure)

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const qbpHandler = require("../vendors/qbp");

if (!admin.apps.length) admin.initializeApp();

// Set on warpspeed-bonitabikes via:
//   firebase functions:secrets:set QBP_EFTP_USER --project=warpspeed-bonitabikes --account=fritz@bonitabikes.com
//   firebase functions:secrets:set QBP_EFTP_PASSWORD --project=warpspeed-bonitabikes --account=fritz@bonitabikes.com
const QBP_EFTP_USER = defineSecret("QBP_EFTP_USER");
const QBP_EFTP_PASSWORD = defineSecret("QBP_EFTP_PASSWORD");

const BONITA_TENANT_ID = "bonita";
const BONITA_STORE_ID = "bonita";

exports.submitQbpOrderCallable = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 120, // upload + Firestore write — no long sync poll
    memory: "512MiB",
    secrets: [QBP_EFTP_USER, QBP_EFTP_PASSWORD],
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

    let order, items, settings;
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
      logger.error("submitQbpOrderCallable: load failed", {
        orderID,
        error: err && err.message,
      });
      throw new HttpsError(
        "internal",
        `Failed to load order: ${err && err.message ? err.message : err}`
      );
    }

    const vendorConfig =
      (settings.vendors && settings.vendors.qbp) || {
        displayName: "QBP",
      };

    const creds = {
      eftpUser: QBP_EFTP_USER.value() || "",
      eftpPassword: QBP_EFTP_PASSWORD.value() || "",
    };

    const submissionID = `bonita-qbp-${Date.now()}`;
    const ctx = {
      tenantID: BONITA_TENANT_ID,
      storeID: BONITA_STORE_ID,
      vendorID: "qbp",
      orderID,
      submissionID,
      logger,
    };

    // Stamp a submission doc so the UI can subscribe to it (same shape as
    // the SaaS worker creates). Status starts as "running" → handler returns
    // → flip to "submitted-pending-vendor". The poller updates it later.
    const submissionRef = db
      .collection("tenants").doc(BONITA_TENANT_ID)
      .collection("stores").doc(BONITA_STORE_ID)
      .collection("vendor-submissions").doc(submissionID);

    await submissionRef.set(
      {
        tenantID: BONITA_TENANT_ID,
        storeID: BONITA_STORE_ID,
        vendorID: "qbp",
        orderID,
        submissionID,
        status: "running",
        startedMillis: Date.now(),
        createdMillis: Date.now(),
      },
      { merge: true }
    );

    let result;
    try {
      result = await qbpHandler.submit({
        order,
        items,
        vendorConfig,
        creds,
        ctx,
      });
    } catch (err) {
      const message = (err && err.message) || String(err);
      logger.error("submitQbpOrderCallable: handler failed", {
        orderID,
        error: message,
      });
      await submissionRef.set(
        {
          status: "failure",
          error: message,
          lastErrorMillis: Date.now(),
        },
        { merge: true }
      );
      throw new HttpsError("internal", message);
    }

    const completedMs = Date.now();

    // Handler always returns awaitingVendorResponse for QBP; mark the
    // submission as "submitted-pending-vendor" so the UI can distinguish
    // "we handed off to QBP, waiting for .por" vs "QBP confirmed".
    await submissionRef.set(
      {
        status: "submitted-pending-vendor",
        result: result || null,
        submittedToVendorMillis: completedMs,
      },
      { merge: true }
    );

    // Flip the source order to submitted so the UI hides it from open lists.
    try {
      await orderRef.set(
        {
          status: "submitted",
          submittedMillis: completedMs,
          submittedToVendorID: "qbp",
          submissionID,
          lastResult: result || null,
        },
        { merge: true }
      );
    } catch (err) {
      logger.warn("submitQbpOrderCallable: order status flip failed (non-fatal)", {
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
