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
const crypto = require("crypto");

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
// Voice fallback for SMS-only numbers. A customer who calls one of these
// numbers hits a polite "this is SMS only" TwiML response served by the
// twilioVoiceFallback HTTPS function — better than Twilio's default
// "application not configured" Twimlet.
const VOICE_URL =
  `https://us-central1-${GCP_PROJECT_ID}.cloudfunctions.net/twilioVoiceFallback`;

// Single source of truth for per-number webhook configuration. Used by the
// purchase callable (passed into incomingPhoneNumbers.create), the
// configure-webhooks helper (passed into .update), and the drift detector
// (compared against the per-number doc's stored urls). When a URL changes
// here, every number's stored webhooks become "drifted" until reconfigured
// via the bulk callable.
const CURRENT_WEBHOOK_CONFIG = {
  smsUrl: INBOUND_WEBHOOK_URL,
  smsMethod: "POST",
  statusCallback: STATUS_CALLBACK_URL,
  statusCallbackMethod: "POST",
  voiceUrl: VOICE_URL,
  voiceMethod: "POST",
};

// Returns true if the per-number doc's stored `webhooks` block matches the
// current source-of-truth URLs. Missing block, missing fields, and mismatched
// values all count as drift. Used by getTenantCallable to compute the
// per-store drifted count surfaced in the UI.
function numberWebhooksAreCurrent(stored) {
  if (!stored) return false;
  return (
    stored.smsUrl === CURRENT_WEBHOOK_CONFIG.smsUrl &&
    stored.statusCallback === CURRENT_WEBHOOK_CONFIG.statusCallback &&
    stored.voiceUrl === CURRENT_WEBHOOK_CONFIG.voiceUrl
  );
}

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
        labels: { type: "twilio-auth", tenant: tenantID },
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

// Permanently deletes the per-tenant subaccount secret. Called from the churn
// cleanup path after the subaccount is closed and all numbers released. Safe
// to call when the secret doesn't exist (NOT_FOUND is swallowed) so the
// scheduled job can re-run on partial-completion without erroring.
async function destroySubaccountSecret(tenantID) {
  const client = secretsClient();
  try {
    await client.deleteSecret({ name: secretManagerRef(tenantID) });
  } catch (err) {
    // gRPC NOT_FOUND code is 5. Treat as already-gone.
    if (err && err.code === 5) return;
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Pre-tenant (setup-doc-keyed) Secret Manager helpers. Mirror the tenant-
// keyed helpers above; used during the signup flow before a tenant doc
// exists. Subaccount is provisioned at card-save time and the auth token
// is parked here, keyed by the prospect's normalized email. On successful
// tenant provisioning the setup-keyed secret is destroyed and the value
// is re-stored under the tenant key (or, more simply, a fresh secret is
// created and the old one is destroyed in the same step).
// ─────────────────────────────────────────────────────────────────────────

// Secret Manager IDs allow [a-zA-Z0-9_-] only. Emails contain `@` and `.`
// (and sometimes `+`); collapse runs of non-alphanumeric to `-`, then
// append a short SHA-1 hash of the original normalized email for
// collision-resistance against weird domain edge cases.
function sanitizeEmailForSecretId(normalizedEmail) {
  const lower = (normalizedEmail || "").toLowerCase();
  const safe = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const prefix = safe.length > 60 ? safe.slice(0, 60) : safe;
  const hash = crypto.createHash("sha1").update(lower).digest("hex").slice(0, 8);
  return `${prefix}-${hash}`;
}

function secretNameForSetup(normalizedEmail) {
  return `twilio-setup-${sanitizeEmailForSecretId(normalizedEmail)}`;
}

function secretManagerRefForSetup(normalizedEmail) {
  return `projects/${GCP_PROJECT_ID}/secrets/${secretNameForSetup(normalizedEmail)}`;
}

async function storeSetupSubaccountAuthToken(normalizedEmail, authToken) {
  const client = secretsClient();
  const parent = `projects/${GCP_PROJECT_ID}`;
  const secretId = secretNameForSetup(normalizedEmail);

  try {
    await client.createSecret({
      parent,
      secretId,
      secret: {
        replication: { automatic: {} },
        labels: { type: "twilio-setup" },
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

async function loadSetupSubaccountAuthToken(normalizedEmail) {
  const client = secretsClient();
  const name = `${secretManagerRefForSetup(normalizedEmail)}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  if (!version || !version.payload || !version.payload.data) {
    throw new HttpsError(
      "internal",
      `No secret version for setup email ${normalizedEmail}.`
    );
  }
  return version.payload.data.toString("utf8");
}

async function destroySetupSubaccountSecret(normalizedEmail) {
  const client = secretsClient();
  try {
    await client.deleteSecret({ name: secretManagerRefForSetup(normalizedEmail) });
  } catch (err) {
    // gRPC NOT_FOUND code is 5. Treat as already-gone.
    if (err && err.code === 5) return;
    throw err;
  }
}

// Loads a Twilio client scoped to the pre-tenant subaccount stored on the
// setup doc. Mirrors getTenantTwilioClient but reads SID + auth token from
// the prospect's setup doc + setup-keyed secret. No allowSuspended branch —
// pre-tenant subaccounts should always be active during signup; if they're
// not, the signup is broken anyway.
async function getSetupTwilioClient(normalizedEmail, { subaccountSid } = {}) {
  if (!subaccountSid) {
    throw new HttpsError(
      "failed-precondition",
      "Subaccount SID missing for setup doc."
    );
  }
  const authToken = await loadSetupSubaccountAuthToken(normalizedEmail);
  return twilio(subaccountSid, authToken);
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
//
// When `opts.allowSuspended` is true the client is built from master
// credentials and scoped to the subaccount via the master Accounts endpoint —
// a suspended subaccount cannot self-auth against the Twilio API, so admin
// teardown (release numbers, close subaccount) must go through the master.
async function getTenantTwilioClient(tenantID, opts = {}) {
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
  if (opts.allowSuspended) {
    if (status !== "active" && status !== "suspended") {
      throw new HttpsError(
        "failed-precondition",
        `Subaccount for ${tenantID} is ${status || "in unknown state"}.`
      );
    }
    // Master credentials, scoped to the subaccount for resource paths.
    return twilio(
      TWILIO_MASTER_ACCOUNT_SID.value(),
      TWILIO_MASTER_AUTH_TOKEN.value(),
      { accountSid: subaccountSid }
    );
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

// Flips routing-doc status for every number owned by a tenant. Used to put
// numbers into "grace" when the subaccount is suspended (inbound still flows,
// outbound blocked) and back to "active" if a tenant is reactivated. The
// scheduled churn cleanup eventually deletes these routing docs entirely.
async function flipTenantRoutingDocs(db, tenantID, fromStatus, toStatus) {
  const snap = await db
    .collection("twilio-number-routing")
    .where("tenantID", "==", tenantID)
    .where("status", "==", fromStatus)
    .get();
  if (snap.empty) return 0;
  // 500-write Firestore batch cap. A single tenant won't realistically own
  // that many numbers — split if it ever happens.
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { status: toStatus }));
  await batch.commit();
  return snap.size;
}

module.exports = {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  GCP_PROJECT_ID,
  INBOUND_WEBHOOK_URL,
  STATUS_CALLBACK_URL,
  VOICE_URL,
  CURRENT_WEBHOOK_CONFIG,
  numberWebhooksAreCurrent,
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
  destroySubaccountSecret,
  sanitizeEmailForSecretId,
  secretNameForSetup,
  secretManagerRefForSetup,
  storeSetupSubaccountAuthToken,
  loadSetupSubaccountAuthToken,
  destroySetupSubaccountSecret,
  getSetupTwilioClient,
  masterTwilioClient,
  getTenantTwilioClient,
  flipTenantRoutingDocs,
};
