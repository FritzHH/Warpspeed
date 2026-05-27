/* eslint-disable */
// Platform-admin email callables for the cadence-dashboard host site.
//
// Three callables, all gated on platformAdmin: true:
//   - platformAdminGetTenantEmailStatus  { tenantID }
//       Returns the full per-account roster from email-auth + email-accounts,
//       enriched with a derived status ("ok" / "watchStale" / "watchExpired" /
//       "error" / "disconnected"). Pure Firestore read — no Gmail API ping.
//
//   - platformAdminReconnectEmailWatch   { tenantID, accountKey }
//       Refreshes the OAuth access token using the stored refresh token, then
//       re-registers the Gmail watch subscription. Used when a watch has
//       expired (Gmail expires watches every 7d) or stalled and the
//       scheduled daily renew didn't catch it.
//
//   - platformAdminForceEmailSync        { tenantID, accountKey }
//       Triggers a full sync (pulls 50 most recent per label). Used when a
//       support ticket reports missing messages or after re-connecting a
//       watch that lapsed long enough for history to be unrecoverable.
//
// Re-authing OAuth itself (full consent flow) is NOT possible from platform
// admin — only the tenant owner can complete Google's consent screen. The UI
// surfaces this as "tenant must sign in again" when refresh-token errors
// out; the platform admin's only recourse is to delete the account and let
// the tenant re-add it from their own UI.
//
// Helper logic for OAuth refresh + watch setup mirrors the closure-scoped
// implementation in gmail.js (kept independent so platform-admin operations
// don't need to thread through gmail.js's register(deps) shape — same
// helper-extract pattern Twilio/Connect use for their platform-admin
// surfaces).
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const fetch = require("node-fetch");
const { assertPlatformAdmin } = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const GMAIL_OAUTH_CLIENT_ID = defineSecret("GMAIL_OAUTH_CLIENT_ID");
const GMAIL_OAUTH_CLIENT_SECRET = defineSecret("GMAIL_OAUTH_CLIENT_SECRET");

const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const WATCH_TOPIC = `projects/cadence-pos/topics/gmail-push-notifications`;

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

async function loadTenantOrThrow(db, tenantID) {
  const snap = await db.collection("tenants").doc(tenantID).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
  }
  return snap.data() || {};
}

function authDocRef(db, tenantID, accountKey) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection("email-auth")
    .doc(accountKey);
}

function accountsDocRef(db, tenantID, accountKey) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection("email-accounts")
    .doc(accountKey);
}

function emailsCollection(db, tenantID) {
  return db.collection("tenants").doc(tenantID).collection("emails");
}

function deriveStatus(authData) {
  const now = Date.now();
  const watchExp = Number(authData.watchExpiration) || 0;
  if (authData.status === "error") return "error";
  if (authData.status !== "connected") return "disconnected";
  if (!watchExp || watchExp < now) return "watchExpired";
  if (watchExp - now < TWO_DAYS_MS) return "watchStale";
  return "ok";
}

// Refreshes the OAuth access token if expired (or about to). Mirrors
// gmail.js's getGmailAccessToken — kept here so platform-admin callables
// don't need to wire through gmail.js's register(deps) closure shape.
async function refreshAccessToken(db, tenantID, accountKey) {
  const ref = authDocRef(db, tenantID, accountKey);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      `No email-auth doc for ${tenantID}/${accountKey}.`
    );
  }
  const data = snap.data() || {};
  if (!data.refreshToken) {
    throw new HttpsError(
      "failed-precondition",
      `Account ${accountKey} has no refresh token. Tenant must re-authorize Gmail.`
    );
  }
  if (Date.now() < (data.expiresAt || 0) - 60000 && data.accessToken) {
    return { accessToken: data.accessToken, authData: data };
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refreshToken,
      client_id: GMAIL_OAUTH_CLIENT_ID.value(),
      client_secret: GMAIL_OAUTH_CLIENT_SECRET.value(),
    }).toString(),
  });
  if (!res.ok) {
    const errBody = await res.text();
    await ref.update({ status: "error", lastError: errBody.substring(0, 500) });
    throw new HttpsError(
      "unauthenticated",
      `Gmail token refresh failed for ${accountKey}. Tenant must re-authorize.`
    );
  }
  const tokens = await res.json();
  const updated = {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    status: "connected",
    lastError: FieldValue.delete(),
  };
  await ref.update(updated);
  return { accessToken: tokens.access_token, authData: { ...data, ...updated } };
}

async function registerWatch(accessToken) {
  const res = await fetch(`${GMAIL_API_BASE}/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topicName: WATCH_TOPIC, labelIds: ["INBOX"] }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new HttpsError(
      "internal",
      `Gmail watch.register failed: ${errText.substring(0, 300)}`
    );
  }
  return res.json();
}

exports.platformAdminGetTenantEmailStatus = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID } = request.data || {};
    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    await loadTenantOrThrow(db, tenantID);

    const tenantRef = db.collection("tenants").doc(tenantID);
    const [authSnap, accountsSnap] = await Promise.all([
      tenantRef.collection("email-auth").get(),
      tenantRef.collection("email-accounts").get(),
    ]);

    const accountsByKey = new Map();
    accountsSnap.docs.forEach((d) => {
      accountsByKey.set(d.id, d.data() || {});
    });

    const accounts = authSnap.docs.map((d) => {
      const data = d.data() || {};
      const cfg = accountsByKey.get(d.id) || {};
      return {
        accountKey: d.id,
        email: data.email || cfg.email || "",
        displayName: cfg.displayName || "",
        assignedStoreID: data.assignedStoreID || cfg.assignedStoreID || null,
        status: data.status || null,
        derivedStatus: deriveStatus(data),
        watchExpiration: Number(data.watchExpiration) || null,
        lastSyncedAt: data.lastSyncedAt || null,
        connectedAt: data.connectedAt || null,
        unreadCount: Number(data.unreadCount) || 0,
        lastError: data.lastError || null,
        hasRefreshToken: Boolean(data.refreshToken),
      };
    });

    // Surface email-accounts rows that have no email-auth (admin added the
    // account config but the tenant never completed OAuth). Useful for
    // diagnosing "I connected but it's not working" tickets.
    accountsSnap.docs.forEach((d) => {
      if (authSnap.docs.find((a) => a.id === d.id)) return;
      const cfg = d.data() || {};
      accounts.push({
        accountKey: d.id,
        email: cfg.email || "",
        displayName: cfg.displayName || "",
        assignedStoreID: cfg.assignedStoreID || null,
        status: null,
        derivedStatus: "neverConnected",
        watchExpiration: null,
        lastSyncedAt: null,
        connectedAt: null,
        unreadCount: 0,
        lastError: null,
        hasRefreshToken: false,
      });
    });

    logger.info("platformAdminGetTenantEmailStatus: returned roster", {
      tenantID,
      accountCount: accounts.length,
      byUID: auth.uid,
    });

    return { success: true, accounts };
  }
);

exports.platformAdminReconnectEmailWatch = onCall(
  {
    region: "us-central1",
    secrets: [GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, accountKey } = request.data || {};
    if (!tenantID || !accountKey) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID and accountKey are required."
      );
    }

    const db = getFirestore();
    await loadTenantOrThrow(db, tenantID);

    const { accessToken } = await refreshAccessToken(db, tenantID, accountKey);
    const watchData = await registerWatch(accessToken);

    const ref = authDocRef(db, tenantID, accountKey);
    await ref.update({
      watchExpiration: parseInt(watchData.expiration) || 0,
      historyId: watchData.historyId || "",
      status: "connected",
      lastError: FieldValue.delete(),
    });

    logger.info("platformAdminReconnectEmailWatch: watch renewed", {
      tenantID,
      accountKey,
      expiration: watchData.expiration,
      byUID: auth.uid,
    });

    return {
      success: true,
      watchExpiration: parseInt(watchData.expiration) || 0,
      historyId: watchData.historyId || "",
    };
  }
);

exports.platformAdminForceEmailSync = onCall(
  {
    region: "us-central1",
    secrets: [GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, accountKey } = request.data || {};
    if (!tenantID || !accountKey) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID and accountKey are required."
      );
    }

    const db = getFirestore();
    await loadTenantOrThrow(db, tenantID);

    const { accessToken } = await refreshAccessToken(db, tenantID, accountKey);

    // Full-sync: list 50 most-recent per label, fetch full messages in
    // batches of 20, merge into emails collection. Mirrors gmail.js's
    // _syncFull but inlined here so we don't have to wire gmail.js's
    // closure-scoped helpers into the admin namespace.
    const labels = ["INBOX", "SENT", "DRAFT", "TRASH", "SPAM"];
    const allIds = new Set();
    for (const label of labels) {
      const r = await fetch(
        `${GMAIL_API_BASE}/messages?maxResults=50&labelIds=${label}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (r.ok) {
        const data = await r.json();
        (data.messages || []).forEach((m) => allIds.add(m.id));
      }
    }
    const ids = [...allIds];

    let synced = 0;
    const emailsRef = emailsCollection(db, tenantID);
    const BATCH = 20;
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const messages = await Promise.all(
        slice.map(async (mid) => {
          const r = await fetch(
            `${GMAIL_API_BASE}/messages/${mid}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!r.ok) return null;
          return r.json();
        })
      );
      const writeBatch = db.batch();
      for (const msg of messages) {
        if (!msg) continue;
        // Minimal merge — preserves any existing body/attachments from prior
        // full-content syncs. Admin-initiated sync is for "is the pipeline
        // alive" diagnostics; the tenant's own sync handles full bodies.
        writeBatch.set(
          emailsRef.doc(msg.id),
          {
            id: msg.id,
            threadId: msg.threadId,
            accountKey,
            labelIds: msg.labelIds || [],
            snippet: msg.snippet || "",
            internalDate: Number(msg.internalDate) || 0,
          },
          { merge: true }
        );
        synced++;
      }
      await writeBatch.commit();
    }

    const profileRes = await fetch(`${GMAIL_API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};

    await authDocRef(db, tenantID, accountKey).update({
      historyId: profile.historyId || "",
      lastSyncedAt: Date.now(),
    });

    logger.info("platformAdminForceEmailSync: synced", {
      tenantID,
      accountKey,
      synced,
      byUID: auth.uid,
    });

    return { success: true, synced };
  }
);
