/* eslint-disable */
// Vendor Order Submission — callables.
//
// Three callables that drive the vendor-order submission flow:
//
//   - submitVendorOrderCallable         Enqueue a submission (async via Pub/Sub).
//   - setVendorCredentialsCallable      Persist per-store vendor credentials.
//   - getVendorCredentialMetaCallable   Read NON-SECRET metadata only (no echo).
//
// Auth model: tenant manager+ for all three (write requires ability to
// place orders / manage vendor accounts). Tenant match is enforced; cross-
// tenant access is rejected.
//
// Storage shape (post-refactor):
//
//   * Firestore  tenants/{tID}/stores/{sID}/vendor_connections/{vendor}
//       Non-secret connection state: accountNumber, contactEmail,
//       isConnected, lastVerified, fieldsConfigured (the union of
//       connection + secret keys, for UI display only). Client read
//       is blocked by Firestore rules; the only path in or out is
//       through these callables.
//
//   * Secret Manager  vendor-{vendor}-{tID}-{sID}
//       Credential strings. Single-string vendors store the raw value;
//       multi-string vendors (QBP — eftpPassword + apiKey) store a
//       JSON blob. See functions/saas/vendor-creds.js for the helper.
//
// Submission flow:
//
//   1. submitVendorOrderCallable validates the request, loads order +
//      items + the vendor_connections doc, writes a
//      vendor-submissions/{submissionID} doc with status="queued", then
//      publishes to the `vendor-order-submissions` Pub/Sub topic.
//      Returns immediately with { success: true, submissionID }.
//
//   2. The Pub/Sub worker (vendor-submission-worker.js) loads connection
//      state from Firestore and secret material from Secret Manager,
//      dispatches to a per-vendor handler, and writes the result back
//      onto the submission doc.

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
const {
  VENDOR_FIELD_PARTITION,
  vendorConnectionDocRef,
  storeVendorSecret,
  destroyVendorSecret,
} = require("./vendor-creds");

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

function submissionDocPath(tenantID, storeID, submissionID) {
  return `tenants/${tenantID}/stores/${storeID}/vendor-submissions/${submissionID}`;
}

function orderDocPath(tenantID, storeID, orderID) {
  return `tenants/${tenantID}/stores/${storeID}/vendor-orders/${orderID}`;
}

// Helper for callables that want a plain object of trimmed non-empty
// string entries. Anything non-string or empty-after-trim is dropped.
function pickStringEntries(obj, allowedKeys) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const key of allowedKeys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      out[key] = value.trim();
    }
  }
  return out;
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

    // ── Vendor must have a connected vendor_connections doc ──
    const connectionSnap = await vendorConnectionDocRef(
      db,
      tenantID,
      storeID,
      vendorID,
    ).get();
    if (!connectionSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        `Vendor ${vendorID} is not configured for this store.`,
      );
    }
    const connection = connectionSnap.data() || {};
    if (connection.isConnected !== true) {
      throw new HttpsError(
        "failed-precondition",
        `Vendor ${vendorID} credentials are not marked connected.`,
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
// Splits incoming creds into Firestore non-secret state + Secret Manager
// secret material per VENDOR_FIELD_PARTITION. Either half can be omitted
// (e.g. JBI has no secrets; QBP could update connection fields without
// rotating the secret).
//
// PAYLOAD:
//   {
//     tenantID, storeID, vendorID,
//     connection: { accountNumber?, contactEmail?, ... },
//     secrets:    { eftpPassword?, apiKey?, ... },
//   }
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

    const partition = VENDOR_FIELD_PARTITION[vendorID];
    if (!partition) {
      throw new HttpsError(
        "invalid-argument",
        `Vendor "${vendorID}" has no field partition configured.`,
      );
    }

    const incomingConnection = pickStringEntries(
      data.connection,
      partition.connection,
    );
    const incomingSecrets = pickStringEntries(data.secrets, partition.secrets);

    const db = getFirestore();
    const ref = vendorConnectionDocRef(db, tenantID, storeID, vendorID);
    const existingSnap = await ref.get();
    const existing = (existingSnap.exists && existingSnap.data()) || {};
    const existingConnection = existing.connection || {};
    const existingFieldsConfigured = Array.isArray(existing.fieldsConfigured)
      ? existing.fieldsConfigured
      : [];

    // Merge incoming connection over existing. Empty/missing keys leave
    // prior values untouched; UI sends a key with an empty string only
    // when the user explicitly clears it (validation strips that
    // upstream in pickStringEntries — empty string == "not provided").
    const mergedConnection = { ...existingConnection, ...incomingConnection };

    // Track which keys are "configured" so the UI can render a checkmark
    // without seeing the secret values. Once a secret key has been
    // written it stays in this list across subsequent saves that only
    // update the connection half.
    const fieldSet = new Set(existingFieldsConfigured);
    Object.keys(mergedConnection).forEach((k) => fieldSet.add(k));
    Object.keys(incomingSecrets).forEach((k) => fieldSet.add(k));
    const mergedFieldsConfigured = Array.from(fieldSet).sort();

    if (Object.keys(incomingSecrets).length > 0) {
      // Single-secret vendors store the raw value; multi-secret vendors
      // store JSON. We always JSON.stringify so the helper stays uniform
      // — the loader does JSON.parse on read.
      await storeVendorSecret(
        vendorID,
        tenantID,
        storeID,
        JSON.stringify(incomingSecrets),
      );
    }

    const nowMs = Date.now();
    // isConnected: true once we have at least one connection field AND
    // (no secret keys exist for this vendor OR at least one secret has
    // been written at some point — tracked via fieldsConfigured).
    const requiredSecretsEverSet = partition.secrets.every((k) =>
      fieldSet.has(k),
    );
    const hasConnectionFields = Object.keys(mergedConnection).length > 0;
    const isConnected = hasConnectionFields && requiredSecretsEverSet;

    await ref.set(
      {
        vendorID,
        connection: mergedConnection,
        fieldsConfigured: mergedFieldsConfigured,
        isConnected,
        lastUpdatedMillis: nowMs,
        lastUpdatedByUID: auth.uid,
        lastVerifiedMillis: isConnected ? nowMs : (existing.lastVerifiedMillis || 0),
        createdMillis: existing.createdMillis || nowMs,
      },
      { merge: true },
    );

    logger.info("setVendorCredentialsCallable: saved", {
      tenantID,
      storeID,
      vendorID,
      connectionKeys: Object.keys(incomingConnection),
      secretKeysReceived: Object.keys(incomingSecrets).length,
      isConnected,
    });

    return {
      success: true,
      fieldsConfigured: mergedFieldsConfigured,
      isConnected,
      lastUpdatedMillis: nowMs,
    };
  }
);

// ────────────────────────────────────────────────────────────────────────
// clearVendorCredentialsCallable
//
// Deletes the vendor_connections doc AND destroys the Secret Manager
// entry (if any). Used when a tenant disconnects a vendor entirely.
//
// PAYLOAD:
//   { tenantID, storeID, vendorID }
// RETURN:
//   { success: true }
// ────────────────────────────────────────────────────────────────────────

exports.clearVendorCredentialsCallable = onCall(
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
    await vendorConnectionDocRef(db, tenantID, storeID, vendorID)
      .delete()
      .catch(() => {});
    await destroyVendorSecret(vendorID, tenantID, storeID);

    logger.info("clearVendorCredentialsCallable: cleared", {
      tenantID,
      storeID,
      vendorID,
    });
    return { success: true };
  },
);

// ────────────────────────────────────────────────────────────────────────
// getVendorCredentialMetaCallable
//
// Returns *metadata* only — NEVER echoes secret values. Connection
// fields are surfaced because they're non-secret (account number, email)
// and the UI may want to display them with a "stored" indicator. Secret
// keys are reported by name only, in `fieldsConfigured`.
//
// PAYLOAD:
//   { tenantID, storeID, vendorID }
// RETURN:
//   {
//     success: true,
//     hasCredentials, isConnected,
//     connection,            // non-secret values, ok to echo
//     fieldsConfigured,      // names of all keys ever written
//     lastUpdatedMillis,
//   }
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
    const snap = await vendorConnectionDocRef(
      db,
      tenantID,
      storeID,
      vendorID,
    ).get();
    if (!snap.exists) {
      return {
        success: true,
        hasCredentials: false,
        isConnected: false,
        connection: {},
        fieldsConfigured: [],
        lastUpdatedMillis: 0,
      };
    }
    const docData = snap.data() || {};
    const fieldsConfigured = Array.isArray(docData.fieldsConfigured)
      ? docData.fieldsConfigured
      : [];
    return {
      success: true,
      hasCredentials: fieldsConfigured.length > 0,
      isConnected: docData.isConnected === true,
      connection: docData.connection || {},
      fieldsConfigured,
      lastUpdatedMillis: docData.lastUpdatedMillis || 0,
    };
  }
);
