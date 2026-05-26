/* eslint-disable */
// Shared helpers for the SaaS Twilio integration.
//
// All Twilio-* function modules (subaccounts, numbers, webhooks, send, A2P)
// share the same secret definitions, Firestore path builders, and Secret
// Manager access patterns. Centralizing them here keeps the per-tenant
// authentication flow consistent across modules and ensures a single source
// of truth for the `defineSecret` references (Firebase de-dupes by name, but
// re-declaring everywhere risks drift).
const { HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const twilio = require("twilio");

// IMPORTANT — deploy-time workaround for Stage 1/2.
// Firebase deploys validate that every defineSecret() reference exists in
// Secret Manager at deploy time. While the RSS LLC / production Twilio
// master account doesn't exist yet, ANY deploy from this repo (even of
// unrelated Bonita functions in the same project) will be blocked if these
// secrets are missing. Workaround already in effect on this project:
// the secrets were created with placeholder/gibberish values so deploys
// succeed. Real master credentials will be added as new versions when the
// LLC is set up (Stage 3) — defineSecret resolves to the LATEST version on
// every cold start, so no code change is needed at that point.
const TWILIO_MASTER_ACCOUNT_SID = defineSecret("TWILIO_MASTER_ACCOUNT_SID");
const TWILIO_MASTER_AUTH_TOKEN = defineSecret("TWILIO_MASTER_AUTH_TOKEN");

// SaaS deploy target. Per-tenant secrets live under projects/cadence-pos/.
const GCP_PROJECT_ID = "cadence-pos";

// Webhook URLs configured on every purchased number. The functions themselves
// land in Phase 3; numbers purchased before that deploy will simply 404 on
// inbound until the webhook ships. Keeping the URLs constant here means the
// Phase 2 purchase flow doesn't need to change when Phase 3 lands.
const INBOUND_WEBHOOK_URL =
  `https://us-central1-${GCP_PROJECT_ID}.cloudfunctions.net/twilioInboundWebhook`;
const STATUS_CALLBACK_URL =
  `https://us-central1-${GCP_PROJECT_ID}.cloudfunctions.net/twilioStatusCallbackWebhook`;

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

// Phase 6 — permission helpers for SaaS Twilio callables.
//
// Every Twilio callable must verify (a) the caller belongs to the tenant they
// claim to be acting on, and (b) for mutating ops, the caller's permission
// level is high enough. We check (a) cheaply against custom claims set on the
// Firebase token (tenantID/storeID, populated by createAppUserCallable in
// firebase-index.js at signup) and only Firestore-read the user doc for (b)
// when a level threshold is required.
//
// Permission level scale (data.js): Owner=5, Admin=4, Manager=3, Editor=2,
// User=1. The user doc lives at tenants/{tid}/stores/{sid}/users/{uid} with
// `permissions: { level: N }`.
async function requireTenantMember(tenantID, request, opts = {}) {
  const auth = requireAuth(request);
  if (!tenantID) {
    throw new HttpsError("invalid-argument", "tenantID is required.");
  }
  const token = auth.token || {};
  if (token.tenantID !== tenantID) {
    throw new HttpsError(
      "permission-denied",
      "Caller does not belong to this tenant."
    );
  }
  if (opts.storeID && token.storeID !== opts.storeID) {
    throw new HttpsError(
      "permission-denied",
      "Caller does not belong to this store."
    );
  }
  return auth;
}

async function requireTenantMemberWithLevel(tenantID, request, minLevel, opts = {}) {
  const auth = await requireTenantMember(tenantID, request, opts);
  const token = auth.token || {};
  const storeID = opts.storeID || token.storeID;
  if (!storeID) {
    throw new HttpsError(
      "failed-precondition",
      "Caller's auth token has no storeID claim."
    );
  }
  const db = getFirestore();
  const userSnap = await db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("users").doc(auth.uid).get();
  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User record not found under this store."
    );
  }
  const userData = userSnap.data() || {};
  const level =
    (userData.permissions && typeof userData.permissions.level === "number")
      ? userData.permissions.level
      : 0;
  if (level < minLevel) {
    throw new HttpsError(
      "permission-denied",
      `Requires permission level ${minLevel}; caller has ${level}.`
    );
  }
  return { auth, user: userData, level };
}

function tenantTwilioDocRef(db, tenantID) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection("private")
    .doc("twilio");
}

function tenantAuditCol(db, tenantID) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection("twilio-audit-events");
}

function storeNumberDocRef(db, tenantID, storeID, phoneNumberSid) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .doc(storeID)
    .collection("twilio")
    .doc(phoneNumberSid);
}

function routingDocRef(db, e164Number) {
  return db.collection("twilio-number-routing").doc(e164Number);
}

async function writeAuditEvent(db, tenantID, event) {
  await tenantAuditCol(db, tenantID).add({
    ...event,
    timestamp: FieldValue.serverTimestamp(),
  });
}

function secretNameForTenant(tenantID) {
  return `twilio-subaccount-${tenantID}`;
}

function secretManagerRef(tenantID) {
  return `projects/${GCP_PROJECT_ID}/secrets/${secretNameForTenant(tenantID)}`;
}

let _secretsClient = null;
function secretsClient() {
  if (!_secretsClient) _secretsClient = new SecretManagerServiceClient();
  return _secretsClient;
}

// Creates the per-tenant secret on first provision; adds a new version if it
// already exists (re-provision / token-rotation case). gRPC code 6 is
// ALREADY_EXISTS — the one case where we fall through instead of throwing.
async function storeSubaccountAuthToken(tenantID, authToken) {
  const client = secretsClient();
  const parent = `projects/${GCP_PROJECT_ID}`;
  const secretId = secretNameForTenant(tenantID);

  try {
    await client.createSecret({
      parent,
      secretId,
      secret: {
        replication: { automatic: {} },
        labels: { tenantid: tenantID, service: "twilio-subaccount" },
      },
    });
  } catch (err) {
    if (err.code !== 6) throw err;
  }

  await client.addSecretVersion({
    parent: `${parent}/secrets/${secretId}`,
    payload: { data: Buffer.from(authToken, "utf8") },
  });
}

async function loadSubaccountAuthToken(tenantID) {
  const client = secretsClient();
  const name = `${secretManagerRef(tenantID)}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  if (!version || !version.payload || !version.payload.data) {
    throw new HttpsError("internal", `No secret version for tenant ${tenantID}.`);
  }
  return version.payload.data.toString("utf8");
}

function masterTwilioClient() {
  return twilio(
    TWILIO_MASTER_ACCOUNT_SID.value(),
    TWILIO_MASTER_AUTH_TOKEN.value()
  );
}

// Loads a Twilio client scoped to the tenant's subaccount. Required for any
// operation that should be billed/owned by the subaccount (number purchase,
// outbound send, subaccount-scoped resource lookups). Reads Firestore once
// for the SID, Secret Manager once for the auth token.
async function getTenantTwilioClient(tenantID) {
  const db = getFirestore();
  const snap = await tenantTwilioDocRef(db, tenantID).get();
  if (!snap.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Tenant ${tenantID} has no Twilio subaccount.`
    );
  }
  const { subaccountSid, status } = snap.data() || {};
  if (!subaccountSid) {
    throw new HttpsError("internal", `Subaccount SID missing for ${tenantID}.`);
  }
  if (status !== "active") {
    throw new HttpsError(
      "failed-precondition",
      `Subaccount for ${tenantID} is ${status || "in unknown state"}.`
    );
  }
  const authToken = await loadSubaccountAuthToken(tenantID);
  return twilio(subaccountSid, authToken);
}

module.exports = {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  GCP_PROJECT_ID,
  INBOUND_WEBHOOK_URL,
  STATUS_CALLBACK_URL,
  requireAuth,
  requireTenantMember,
  requireTenantMemberWithLevel,
  tenantTwilioDocRef,
  tenantAuditCol,
  storeNumberDocRef,
  routingDocRef,
  writeAuditEvent,
  secretNameForTenant,
  secretManagerRef,
  storeSubaccountAuthToken,
  loadSubaccountAuthToken,
  masterTwilioClient,
  getTenantTwilioClient,
};
