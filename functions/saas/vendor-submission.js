/* eslint-disable */
// Vendor Order Submission — callables.
//
// Three callables that drive the vendor-order submission flow:
//
//   - submitVendorOrderCallable         Enqueue a submission (async via Pub/Sub).
//   - setVendorCredentialsCallable      Write credentials to locked subcollection.
//   - getVendorCredentialMetaCallable   Read NON-SECRET metadata only (no echo).
//
// Auth model: tenant manager+ for all three (write requires ability to
// place orders / manage vendor accounts). Tenant match is enforced; cross-
// tenant access is rejected.
//
// Submission flow:
//
//   1. Callable validates the request, loads order + items + vendor config,
//      writes a `vendor-submissions/{submissionID}` doc with status="queued",
//      then publishes to the `vendor-order-submissions` Pub/Sub topic.
//      Returns immediately with { success: true, submissionID }.
//
//   2. The Pub/Sub worker (vendor-submission-worker.js) picks up the message,
//      loads credentials from the locked subcollection (clients can never
//      read it), dispatches to a per-vendor handler module, and writes the
//      result back onto the submission doc.
//
// Credentials storage:
//
//   Path: tenants/{tenantID}/stores/{storeID}/vendor-credentials/{vendorID}
//   Access: server-only via Admin SDK (Firestore rule blocks all client
//   reads/writes). Shape is vendor-specific — JBI stores
//   { ftpHost, ftpUsername, ftpPassword, apiKey }; QBP stores its own set.
//   The callable doesn't enforce a shape so handlers can evolve their
//   credential schemas without API churn. UI defines what it sends.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { PubSub } = require("@google-cloud/pubsub");
const crypto = require("crypto");
const {
  assertTenantMatch,
  assertPrivilege,
} = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const SUBMISSION_TOPIC = "vendor-order-submissions";

let _pubsub = null;
function pubsub() {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

function requireStr(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${name} is required.`);
  }
  return value.trim();
}

// Submission doc path. Stored on the store (not the tenant) so it follows
// the order it represents — vendor orders are per-store, not per-tenant.
function submissionDocPath(tenantID, storeID, submissionID) {
  return `tenants/${tenantID}/stores/${storeID}/vendor-submissions/${submissionID}`;
}

function credentialsDocPath(tenantID, storeID, vendorID) {
  return `tenants/${tenantID}/stores/${storeID}/vendor-credentials/${vendorID}`;
}

function orderDocPath(tenantID, storeID, orderID) {
  return `tenants/${tenantID}/stores/${storeID}/vendor-orders/${orderID}`;
}

function settingsDocPath(tenantID, storeID) {
  return `tenants/${tenantID}/stores/${storeID}/settings/settings`;
}

// ────────────────────────────────────────────────────────────────────────
// submitVendorOrderCallable
//
// PAYLOAD:
//   { tenantID, storeID, vendorID, orderID }
// RETURN:
//   { success: true, submissionID, status: "queued" }
// ────────────────────────────────────────────────────────────────────────

exports.submitVendorOrderCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    const data = request.data || {};
    const tenantID = requireStr(data.tenantID, "tenantID");
    const storeID = requireStr(data.storeID, "storeID");
    const vendorID = requireStr(data.vendorID, "vendorID");
    const orderID = requireStr(data.orderID, "orderID");

    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "manager");

    const db = getFirestore();

    // ── Validate the order exists and is not already submitted ──
    const orderRef = db.doc(orderDocPath(tenantID, storeID, orderID));
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", `Order ${orderID} not found.`);
    }
    const order = orderSnap.data() || {};
    if (order.status === "submitted") {
      throw new HttpsError(
        "failed-precondition",
        "Order has already been submitted."
      );
    }

    // ── Resolve the vendor config from settings ──
    const settingsSnap = await db.doc(settingsDocPath(tenantID, storeID)).get();
    const settings = (settingsSnap.exists && settingsSnap.data()) || {};
    const vendors = settings.vendors || {};
    const vendorConfig = vendors[vendorID];
    if (!vendorConfig) {
      throw new HttpsError(
        "not-found",
        `Vendor ${vendorID} is not configured for this store.`
      );
    }

    // ── Validate items exist ──
    const itemsSnap = await orderRef.collection("items").limit(1).get();
    if (itemsSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "Order has no items to submit."
      );
    }

    // ── Write submission doc (status=queued) and publish ──
    const submissionID = crypto.randomUUID();
    const nowMs = Date.now();
    const submissionDoc = {
      id: submissionID,
      tenantID,
      storeID,
      vendorID,
      orderID,
      status: "queued",
      createdMillis: nowMs,
      createdByUID: auth.uid,
      submissionType: vendorConfig.submissionType || vendorID,
      attemptCount: 0,
    };
    await db.doc(submissionDocPath(tenantID, storeID, submissionID)).set(submissionDoc);

    try {
      await pubsub()
        .topic(SUBMISSION_TOPIC)
        .publishMessage({
          json: {
            tenantID,
            storeID,
            vendorID,
            orderID,
            submissionID,
            enqueuedAt: nowMs,
          },
        });
    } catch (err) {
      // If publish fails the submission doc is orphaned in "queued" state.
      // Mark it failed so the UI doesn't spin forever.
      logger.error("submitVendorOrderCallable: pubsub publish failed", {
        submissionID,
        error: err && err.message,
      });
      await db.doc(submissionDocPath(tenantID, storeID, submissionID)).set(
        {
          status: "failure",
          error: `Failed to enqueue: ${err && err.message ? err.message : "unknown"}`,
          completedMillis: Date.now(),
        },
        { merge: true }
      );
      throw new HttpsError(
        "internal",
        "Failed to enqueue submission. Try again."
      );
    }

    logger.info("submitVendorOrderCallable: enqueued", {
      tenantID,
      storeID,
      vendorID,
      orderID,
      submissionID,
    });
    return { success: true, submissionID, status: "queued" };
  }
);

// ────────────────────────────────────────────────────────────────────────
// setVendorCredentialsCallable
//
// PAYLOAD:
//   { tenantID, storeID, vendorID, creds }
//   `creds` is a flat object of string fields. The handler module dictates
//   the shape (e.g. JBI: { ftpHost, ftpUsername, ftpPassword, apiKey }).
//   Any field whose value is empty string / null / undefined is treated as
//   a clear and removed from the doc; non-empty fields overwrite.
// RETURN:
//   { success: true, fieldsConfigured, lastUpdatedMillis }
// ────────────────────────────────────────────────────────────────────────

exports.setVendorCredentialsCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    const data = request.data || {};
    const tenantID = requireStr(data.tenantID, "tenantID");
    const storeID = requireStr(data.storeID, "storeID");
    const vendorID = requireStr(data.vendorID, "vendorID");

    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "manager");

    const creds = data.creds;
    if (!creds || typeof creds !== "object" || Array.isArray(creds)) {
      throw new HttpsError("invalid-argument", "creds must be an object.");
    }

    const db = getFirestore();
    const ref = db.doc(credentialsDocPath(tenantID, storeID, vendorID));

    // Build the write payload: keep only non-empty string values; drop the
    // rest. Caller can pass { fieldX: "" } to clear a specific field.
    const credsToWrite = {};
    const fieldsConfigured = [];
    Object.entries(creds).forEach(([key, value]) => {
      if (typeof value === "string" && value.length > 0) {
        credsToWrite[key] = value;
        fieldsConfigured.push(key);
      }
    });

    const nowMs = Date.now();

    if (fieldsConfigured.length === 0) {
      // Nothing to write — explicit reset. Delete the doc entirely so
      // getVendorCredentialMeta reports hasCredentials=false cleanly.
      await ref.delete().catch(() => {});
      logger.info("setVendorCredentialsCallable: cleared", {
        tenantID,
        storeID,
        vendorID,
      });
      return {
        success: true,
        fieldsConfigured: [],
        lastUpdatedMillis: nowMs,
      };
    }

    // Read existing to merge / preserve fields the caller didn't send.
    const existingSnap = await ref.get();
    const existing = (existingSnap.exists && existingSnap.data()) || {};
    const existingCreds = existing.creds || {};

    const mergedCreds = { ...existingCreds, ...credsToWrite };
    const mergedFields = Object.keys(mergedCreds).sort();

    await ref.set(
      {
        vendorID,
        creds: mergedCreds,
        fieldsConfigured: mergedFields,
        lastUpdatedMillis: nowMs,
        lastUpdatedByUID: auth.uid,
        // First-touch stamp preserved on subsequent writes.
        createdMillis: existing.createdMillis || nowMs,
      },
      { merge: true }
    );

    logger.info("setVendorCredentialsCallable: saved", {
      tenantID,
      storeID,
      vendorID,
      fieldCount: mergedFields.length,
    });

    return {
      success: true,
      fieldsConfigured: mergedFields,
      lastUpdatedMillis: nowMs,
    };
  }
);

// ────────────────────────────────────────────────────────────────────────
// getVendorCredentialMetaCallable
//
// Returns *metadata* only — NEVER echoes the actual secret values. The UI
// uses this to render "Credentials set ✓ (last updated …)" without seeing
// the password / api key.
//
// PAYLOAD:
//   { tenantID, storeID, vendorID }
// RETURN:
//   { success: true, hasCredentials, fieldsConfigured, lastUpdatedMillis }
// ────────────────────────────────────────────────────────────────────────

exports.getVendorCredentialMetaCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    const data = request.data || {};
    const tenantID = requireStr(data.tenantID, "tenantID");
    const storeID = requireStr(data.storeID, "storeID");
    const vendorID = requireStr(data.vendorID, "vendorID");

    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "manager");

    const db = getFirestore();
    const snap = await db.doc(credentialsDocPath(tenantID, storeID, vendorID)).get();
    if (!snap.exists) {
      return {
        success: true,
        hasCredentials: false,
        fieldsConfigured: [],
        lastUpdatedMillis: 0,
      };
    }
    const docData = snap.data() || {};
    return {
      success: true,
      hasCredentials: Array.isArray(docData.fieldsConfigured) && docData.fieldsConfigured.length > 0,
      fieldsConfigured: docData.fieldsConfigured || [],
      lastUpdatedMillis: docData.lastUpdatedMillis || 0,
    };
  }
);
