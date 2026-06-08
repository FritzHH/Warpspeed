/* eslint-disable */
// Shared helpers for per-store vendor credential storage on the SaaS
// (cadence-pos) deploy.
//
// Storage split:
//   * Firestore  tenants/{tID}/stores/{sID}/vendor_connections/{vendor}
//       Non-secret connection state — account number, contact email,
//       isConnected, lastVerified, etc. Owned by callers; this module
//       only exposes the doc ref builder.
//   * Secret Manager  vendor-{vendor}-{tID}-{sID}
//       Credential material only (API keys, passwords, tokens). The
//       payload is ALWAYS a JSON-stringified object of {key: value}
//       pairs (even for single-key vendors) so load/store is uniform.
//       Vendors with zero secrets (e.g. JBI — FTP + token are platform
//       secrets, not per-store) skip Secret Manager entirely.
//
// Authoritative field partition lives in VENDOR_FIELD_PARTITION below.
// Add a new vendor by adding a row there; the callable layer + worker
// + handlers all read from this single source of truth.
//
// Charset note: tenant IDs are slugified business names ([a-z0-9-],
// pattern-validated in functions/saas/auth-claims.js) and store IDs
// are 13-digit EAN-13 barcodes ([0-9], generated in
// functions/firebase-index.js). Both fit Secret Manager's
// [a-zA-Z0-9_-] requirement directly — no sanitization layer needed.
// GCP label values cap at 63 chars; tenant IDs cap at 64 in the
// rare fallback-suffix case, so the label value is sliced to 60
// defensively (the secret NAME itself has no such cap).
const { HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

const GCP_PROJECT_ID = "cadence-pos";

// ─────────────────────────────────────────────────────────────────────
// VENDOR_FIELD_PARTITION — single source of truth for the storage split.
//
//   connection: keys that live in Firestore vendor_connections (non-secret).
//   secrets:    keys that live in Secret Manager (JSON-blob payload).
//
// The callable layer (setVendorCredentialsCallable) uses this to route
// incoming fields. The worker (loadVendorState below) uses this to
// decide whether to even look in Secret Manager. Handlers expect the
// values back as { connection: {...}, secrets: {...} }.
//
// JBI's FTP + integrator token are Cadence-owned platform secrets
// (declared via defineSecret in functions/vendors/jbi.js) — NOT per-
// store, so they don't appear here.
// ─────────────────────────────────────────────────────────────────────
const VENDOR_FIELD_PARTITION = {
  jbi: {
    connection: ["accountNumber", "contactEmail"],
    secrets: [],
  },
  qbp: {
    connection: ["accountNumber"],
    secrets: ["eftpPassword", "apiKey"],
  },
};

function secretNameFor(vendor, tenantID, storeID) {
  return `vendor-${vendor}-${tenantID}-${storeID}`;
}

function secretManagerRef(vendor, tenantID, storeID) {
  return `projects/${GCP_PROJECT_ID}/secrets/${secretNameFor(vendor, tenantID, storeID)}`;
}

function vendorLabels(vendor, tenantID, storeID) {
  return {
    type: "vendor-creds",
    vendor,
    tenant: tenantID.slice(0, 60),
    store: storeID,
  };
}

function vendorConnectionDocRef(db, tenantID, storeID, vendor) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .doc(storeID)
    .collection("vendor_connections")
    .doc(vendor);
}

let _secretsClient = null;
function secretsClient() {
  if (!_secretsClient) _secretsClient = new SecretManagerServiceClient();
  return _secretsClient;
}

// Creates the per-vendor secret on first provision; adds a new version
// if it already exists (re-provision / credential-rotation case). gRPC
// code 6 is ALREADY_EXISTS — the one case where we fall through
// instead of throwing.
async function storeVendorSecret(vendor, tenantID, storeID, payloadString) {
  const client = secretsClient();
  const parent = `projects/${GCP_PROJECT_ID}`;
  const secretId = secretNameFor(vendor, tenantID, storeID);

  try {
    await client.createSecret({
      parent,
      secretId,
      secret: {
        replication: { automatic: {} },
        labels: vendorLabels(vendor, tenantID, storeID),
      },
    });
  } catch (err) {
    if (err.code !== 6) throw err;
  }

  await client.addSecretVersion({
    parent: `${parent}/secrets/${secretId}`,
    payload: { data: Buffer.from(payloadString, "utf8") },
  });
}

async function loadVendorSecret(vendor, tenantID, storeID) {
  const client = secretsClient();
  const name = `${secretManagerRef(vendor, tenantID, storeID)}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  if (!version || !version.payload || !version.payload.data) {
    throw new HttpsError(
      "internal",
      `No secret version for vendor=${vendor} tenant=${tenantID} store=${storeID}.`,
    );
  }
  return version.payload.data.toString("utf8");
}

// Permanently deletes the per-vendor secret. Called when a tenant
// disconnects a vendor or when a store is torn down. Safe to call
// when the secret doesn't exist — gRPC NOT_FOUND (code 5) is
// swallowed so cleanup paths can re-run on partial failure.
async function destroyVendorSecret(vendor, tenantID, storeID) {
  const client = secretsClient();
  try {
    await client.deleteSecret({
      name: secretManagerRef(vendor, tenantID, storeID),
    });
  } catch (err) {
    if (err && err.code === 5) return;
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────
// loadVendorState — one-shot loader for everything a handler needs.
//
// Returns { connection, secrets, partition }:
//   connection: vendor_connections.connection map (always an object;
//               empty if the doc doesn't exist).
//   secrets:    parsed Secret Manager JSON blob (always an object;
//               empty when partition.secrets is empty, i.e. JBI).
//   partition:  the VENDOR_FIELD_PARTITION row for this vendor, so
//               callers don't have to re-import the constant.
//
// Throws via HttpsError for an unknown vendor (callable-friendly).
// A missing Secret Manager entry for a vendor that DOES expect secrets
// propagates as an HttpsError "internal" from loadVendorSecret — the
// caller decides whether to treat that as a hard failure.
// ─────────────────────────────────────────────────────────────────────
async function loadVendorState(db, vendor, tenantID, storeID) {
  const partition = VENDOR_FIELD_PARTITION[vendor];
  if (!partition) {
    throw new HttpsError(
      "invalid-argument",
      `Vendor "${vendor}" has no field partition configured.`,
    );
  }
  const snap = await vendorConnectionDocRef(
    db,
    tenantID,
    storeID,
    vendor,
  ).get();
  const docData = (snap.exists && snap.data()) || {};
  const connection = docData.connection || {};

  let secrets = {};
  if (partition.secrets.length > 0) {
    const raw = await loadVendorSecret(vendor, tenantID, storeID);
    secrets = JSON.parse(raw);
  }
  return { connection, secrets, partition };
}

module.exports = {
  GCP_PROJECT_ID,
  VENDOR_FIELD_PARTITION,
  secretNameFor,
  secretManagerRef,
  vendorLabels,
  vendorConnectionDocRef,
  storeVendorSecret,
  loadVendorSecret,
  destroyVendorSecret,
  loadVendorState,
};
