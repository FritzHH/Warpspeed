/* eslint-disable */
// Gmail integration: OAuth, sync, send, label modify, watch renewal, push handler.
//
// Tenant-scoped: every doc lives under tenants/{tenantID}/* with an optional
// assignedStoreID field on email-auth/email-accounts so a single inbox can be
// shared across all stores in a tenant or scoped to one store. Visibility is
// enforced at the field level by the frontend; data layout is single-shape.
//
// Schema:
//   tenants/{tenantID}/email-accounts/{accountKey}  config (email, displayName, signature, assignedStoreID)
//   tenants/{tenantID}/email-auth/{accountKey}      OAuth runtime state (tokens, watchExpiration, historyId)
//   tenants/{tenantID}/emails/{messageId}           inbound + sent cache
//   tenants/{tenantID}/email-lookup/{address}       per-tenant rich lookup (accountKey, assignedStoreID)
//   email-tenant-index/{address}                    GLOBAL routing: { tenantID } — needed because Gmail's
//                                                   Pub/Sub push payload only carries the email address.
//
// register() is called from firebase-index.js with deploy-target-specific
// deps (projectId, storageBucket, guards, secrets, getDB, feature-tracking
// wrappers). Bonita passes a no-op guards bundle (single-tenant — assertTenantMatch
// would always fail because tokens have no tenantID claim). SaaS passes the real
// guards from ./saas/auth-guards.js.

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

function _log(...args) {
  console.log("[gmail]", ...args);
}

function _requireAuth(auth) {
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
}

function _parseGmailMessage(msg) {
  const headers = msg.payload?.headers || [];
  const getHeader = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const getAllHeaders = (name) =>
    headers.filter((h) => h.name.toLowerCase() === name.toLowerCase()).map((h) => h.value);

  const fromRaw = getHeader("From");
  const fromMatch = fromRaw.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
  const fromName = fromMatch?.[1]?.trim() || fromRaw;
  const from = fromMatch?.[2]?.trim() || fromRaw;

  const toRaw = getHeader("To");
  const toList = toRaw
    ? toRaw.split(",").map((s) => {
        const m = s.trim().match(/<([^>]+)>/);
        return m ? m[1] : s.trim();
      })
    : [];

  const ccRaw = getHeader("Cc");
  const ccList = ccRaw
    ? ccRaw.split(",").map((s) => {
        const m = s.trim().match(/<([^>]+)>/);
        return m ? m[1] : s.trim();
      })
    : [];

  let bodyHtml = "";
  let bodyText = "";

  function extractBody(part) {
    if (part.mimeType === "text/html" && part.body?.data) {
      bodyHtml = Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.mimeType === "text/plain" && part.body?.data) {
      bodyText = Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.parts) part.parts.forEach(extractBody);
  }
  if (msg.payload) extractBody(msg.payload);

  const attachments = [];
  function extractAttachments(part) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
        storageUrl: "",
      });
    }
    if (part.parts) part.parts.forEach(extractAttachments);
  }
  if (msg.payload) extractAttachments(msg.payload);

  const labelIds = msg.labelIds || [];

  return {
    id: msg.id,
    threadId: msg.threadId,
    from,
    fromName,
    to: toList,
    cc: ccList,
    bcc: [],
    replyTo: getHeader("Reply-To"),
    subject: getHeader("Subject"),
    snippet: msg.snippet || "",
    bodyText: bodyText.length < 500000 ? bodyText : "",
    bodyHtml: bodyHtml.length < 500000 ? bodyHtml : "",
    hasLargeBody: bodyHtml.length >= 500000,
    labelIds,
    isUnread: labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    internalDate: parseInt(msg.internalDate) || 0,
    receivedAt: Date.now(),
    attachments,
    messageIdHeader: getHeader("Message-ID") || getHeader("Message-Id"),
    inReplyTo: getHeader("In-Reply-To"),
    references: getHeader("References"),
    deliveredTo: getAllHeaders("Delivered-To"),
    xForwardedFor: getHeader("X-Forwarded-For"),
    xForwardedTo: getHeader("X-Forwarded-To"),
    resentFrom: getHeader("Resent-From"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// register({ projectId, storageBucket, getDB, secrets, guards,
//            withFeatureTracking, withFeatureTrackingHttp, withFeatureTrackingSchedule })
//
//   projectId            string  — Firebase project ID for the Pub/Sub topic path
//   storageBucket        string  — bucket for email-attachment uploads
//   getDB                fn      — returns initialized admin Firestore instance
//   secrets              { gmailOAuthClientId, gmailOAuthClientSecret }
//                        Admin SDK uses the function's runtime service-account
//                        credentials (Application Default Credentials) — no key
//                        secret is needed inside Cloud Functions.
//   guards               { assertTenantMatch }  — assertTenantMatch(auth, tenantID) or no-op
//   withFeatureTracking* — usage-tracking wrappers from ./usageTracking
//
// Returns an object whose keys are the function names to be exported.
// ─────────────────────────────────────────────────────────────────────────────
function register(deps) {
  const {
    projectId,
    storageBucket,
    getDB,
    secrets,
    guards,
    withFeatureTracking,
    withFeatureTrackingHttp,
    withFeatureTrackingSchedule,
  } = deps;

  const {
    gmailOAuthClientId,
    gmailOAuthClientSecret,
  } = secrets;

  const WATCH_TOPIC = `projects/${projectId}/topics/gmail-push-notifications`;
  const OAUTH_REDIRECT_URI = `https://us-central1-${projectId}.cloudfunctions.net/gmailOAuthCallback`;

  function _authDocRef(db, tenantID, accountKey) {
    return db
      .collection("tenants").doc(tenantID)
      .collection("email-auth").doc(accountKey);
  }
  function _accountsDocRef(db, tenantID, accountKey) {
    return db
      .collection("tenants").doc(tenantID)
      .collection("email-accounts").doc(accountKey);
  }
  function _emailsCollection(db, tenantID) {
    return db
      .collection("tenants").doc(tenantID)
      .collection("emails");
  }
  function _lookupDocRef(db, tenantID, emailAddress) {
    return db
      .collection("tenants").doc(tenantID)
      .collection("email-lookup").doc(emailAddress.toLowerCase());
  }
  function _tenantIndexDocRef(db, emailAddress) {
    return db.collection("email-tenant-index").doc(emailAddress.toLowerCase());
  }

  async function getGmailAccessToken(db, tenantID, accountKey) {
    const docRef = _authDocRef(db, tenantID, accountKey);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "No Gmail auth for " + accountKey);
    }
    const data = snap.data();
    if (!data.refreshToken) {
      throw new HttpsError("failed-precondition", "No refresh token");
    }

    if (Date.now() < (data.expiresAt || 0) - 60000) {
      return data.accessToken;
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: data.refreshToken,
        client_id: gmailOAuthClientId.value(),
        client_secret: gmailOAuthClientSecret.value(),
      }).toString(),
    });

    if (!res.ok) {
      const errBody = await res.text();
      _log("Gmail token refresh failed", errBody);
      await docRef.update({ status: "error" });
      throw new HttpsError("unauthenticated", "Gmail token refresh failed");
    }

    const tokens = await res.json();
    const updated = {
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      status: "connected",
    };
    await docRef.update(updated);
    return updated.accessToken;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // gmailInitiateAuth — issue OAuth URL. The state param carries tenantID,
  // accountKey, and assignedStoreID through to the callback.
  // ───────────────────────────────────────────────────────────────────────────
  const gmailInitiateAuth = onCall(
    { secrets: [gmailOAuthClientId] },
    withFeatureTracking("gmail.auth.initiate", async (request, tracker) => {
      _requireAuth(request.auth);
      const { tenantID, accountKey, assignedStoreID } = request.data;
      if (!tenantID || !accountKey) {
        throw new HttpsError("invalid-argument", "tenantID and accountKey required");
      }
      guards.assertTenantMatch(request.auth, tenantID);

      const statePayload = {
        tenantID,
        accountKey,
        assignedStoreID: assignedStoreID || null,
      };
      const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(gmailOAuthClientId.value())}` +
        `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(GMAIL_SCOPES)}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${state}`;

      tracker.set("accountKey", accountKey);
      return { success: true, authUrl };
    })
  );

  // ───────────────────────────────────────────────────────────────────────────
  // gmailOAuthCallback — Google redirects here after consent. Trusts the state
  // we issued (HMAC signing is a future hardening); writes auth doc, populates
  // per-tenant email-lookup and global email-tenant-index, registers Gmail watch.
  // ───────────────────────────────────────────────────────────────────────────
  const gmailOAuthCallback = onRequest(
    {
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
      cors: true,
    },
    withFeatureTrackingHttp("gmail.auth.callback", async (req, res, tracker) => {
      try {
        const { code, state } = req.query;
        if (!code || !state) {
          res.status(400).send("Missing code or state");
          return;
        }

        const { tenantID, accountKey, assignedStoreID } = JSON.parse(
          Buffer.from(state, "base64url").toString()
        );
        tracker.setContext({ tenantID, storeID: assignedStoreID || "_shared" });
        tracker.set("accountKey", accountKey);

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: gmailOAuthClientId.value(),
            client_secret: gmailOAuthClientSecret.value(),
            redirect_uri: OAUTH_REDIRECT_URI,
            grant_type: "authorization_code",
          }).toString(),
        });

        if (!tokenRes.ok) {
          const err = await tokenRes.text();
          _log("Gmail OAuth token exchange failed", err);
          res.status(500).send("Token exchange failed");
          return;
        }

        const tokens = await tokenRes.json();
        const accessToken = tokens.access_token;

        const profileRes = await fetch(`${GMAIL_API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profile = await profileRes.json();
        _log("Gmail profile response", JSON.stringify(profile));

        if (!profileRes.ok || !profile.emailAddress) {
          _log("Gmail profile fetch failed", JSON.stringify(profile));
          res
            .status(500)
            .send("Failed to retrieve Gmail profile. Check Cloud Function logs.");
          return;
        }

        const db = await getDB();
        const authDocRef = _authDocRef(db, tenantID, accountKey);
        const emailAddress = profile.emailAddress.toLowerCase();

        await authDocRef.set({
          email: emailAddress,
          assignedStoreID: assignedStoreID || null,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || "",
          expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
          historyId: profile.historyId || "",
          connectedAt: Date.now(),
          connectedBy: "",
          status: "connected",
          unreadCount: 0,
          lastSyncedAt: 0,
          watchExpiration: 0,
        });

        // Mirror assignedStoreID onto the account-config doc if it exists so
        // the frontend can render the scope without joining against auth.
        try {
          await _accountsDocRef(db, tenantID, accountKey).set(
            { assignedStoreID: assignedStoreID || null, email: emailAddress },
            { merge: true }
          );
        } catch (e) {
          _log("email-accounts doc merge failed (non-fatal)", e.message);
        }

        await _lookupDocRef(db, tenantID, emailAddress).set({
          tenantID,
          accountKey,
          assignedStoreID: assignedStoreID || null,
        });

        // Global thin routing index — Gmail Pub/Sub push only carries the
        // email address, so we need a global hop to resolve tenantID before
        // we can read the per-tenant lookup.
        await _tenantIndexDocRef(db, emailAddress).set({ tenantID });

        try {
          const watchRes = await fetch(`${GMAIL_API_BASE}/watch`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              topicName: WATCH_TOPIC,
              labelIds: ["INBOX"],
            }),
          });
          if (watchRes.ok) {
            const watchData = await watchRes.json();
            _log("Gmail watch registered successfully:", JSON.stringify(watchData));
            await authDocRef.update({
              historyId: watchData.historyId || profile.historyId,
              watchExpiration: parseInt(watchData.expiration) || 0,
            });
          } else {
            const watchErrText = await watchRes.text();
            _log("Gmail watch setup failed:", watchRes.status, watchErrText);
          }
        } catch (watchErr) {
          _log("Gmail watch setup error (non-fatal)", watchErr);
        }

        try {
          const emailsCollection = _emailsCollection(db, tenantID);
          const fullResult = await _syncFull(
            db, accessToken, tenantID, accountKey, emailsCollection, authDocRef
          );
          _log("Initial backfill complete", {
            synced: fullResult.synced,
            unreadCount: fullResult.unreadCount,
          });
        } catch (syncErr) {
          _log("Initial backfill error (non-fatal)", syncErr);
        }

        res.send(`
          <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
              <h2 style="color:#2E7D32">Gmail Connected!</h2>
              <p>You can close this tab and return to the app.</p>
              <script>setTimeout(()=>window.close(),3000)</script>
            </div>
          </body></html>
        `);
      } catch (error) {
        _log("gmailOAuthCallback error", error);
        res.status(500).send("OAuth callback failed: " + error.message);
      }
    })
  );

  // ───────────────────────────────────────────────────────────────────────────
  // gmailDisconnect — revoke token + delete auth, lookup, and tenant-index docs.
  // The account-config doc (email-accounts) is preserved so the admin can re-auth
  // the same accountKey without re-entering email/displayName.
  // ───────────────────────────────────────────────────────────────────────────
  const gmailDisconnect = onCall(
    {
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
    },
    withFeatureTracking("gmail.disconnect", async (request, tracker) => {
      _requireAuth(request.auth);
      const { tenantID, accountKey } = request.data;
      if (!tenantID || !accountKey) {
        throw new HttpsError("invalid-argument", "tenantID and accountKey required");
      }
      guards.assertTenantMatch(request.auth, tenantID);

      const db = await getDB();
      const authRef = _authDocRef(db, tenantID, accountKey);

      const snap = await authRef.get();
      tracker.bump("firestoreReads", 1);
      if (snap.exists) {
        const data = snap.data();
        if (data.accessToken) {
          try {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${data.accessToken}`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
          } catch (e) {
            _log("Token revoke error (non-fatal)", e);
          }
        }
        if (data.email) {
          await _lookupDocRef(db, tenantID, data.email).delete();
          await _tenantIndexDocRef(db, data.email).delete();
          tracker.bump("firestoreWrites", 2);
        }
        await authRef.delete();
        tracker.bump("firestoreWrites", 1);
      }

      tracker.set("accountKey", accountKey);
      return { success: true };
    })
  );

  async function _syncFull(db, accessToken, tenantID, accountKey, emailsCollection, authRef) {
    let synced = 0;
    const allMessageIds = new Set();
    const labels = ["INBOX", "SENT", "DRAFT", "TRASH", "SPAM"];
    for (const label of labels) {
      const listRes = await fetch(
        `${GMAIL_API_BASE}/messages?maxResults=50&labelIds=${label}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        (listData.messages || []).forEach((m) => allMessageIds.add(m.id));
      }
    }
    const messageIds = [...allMessageIds];

    const BATCH_SIZE = 20;
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE);
      const messages = await Promise.all(
        batch.map(async (msgId) => {
          const msgRes = await fetch(
            `${GMAIL_API_BASE}/messages/${msgId}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!msgRes.ok) return null;
          return msgRes.json();
        })
      );
      const writeBatch = db.batch();
      for (const msg of messages) {
        if (!msg) continue;
        const parsed = _parseGmailMessage(msg);
        parsed.accountKey = accountKey;
        writeBatch.set(emailsCollection.doc(parsed.id), parsed, { merge: true });
        synced++;
      }
      await writeBatch.commit();
    }

    const profileRes = await fetch(`${GMAIL_API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();
    const unreadSnap = await emailsCollection
      .where("accountKey", "==", accountKey)
      .where("isUnread", "==", true)
      .where("labelIds", "array-contains", "INBOX")
      .get();
    await authRef.update({
      historyId: profile.historyId,
      unreadCount: unreadSnap.size,
      lastSyncedAt: Date.now(),
    });
    return { success: true, synced, unreadCount: unreadSnap.size };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // gmailSyncEmails — full or incremental sync. Full pulls 50 per label across
  // INBOX/SENT/DRAFT/TRASH/SPAM; incremental walks the history API from the
  // stored historyId and falls back to full on 404 (history expired).
  // ───────────────────────────────────────────────────────────────────────────
  const gmailSyncEmails = onCall(
    {
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
      timeoutSeconds: 300,
      memory: "512MiB",
    },
    withFeatureTracking("gmail.sync", async (request, tracker) => {
      _requireAuth(request.auth);
      const { tenantID, accountKey, fullSync } = request.data;
      if (!tenantID || !accountKey) {
        throw new HttpsError("invalid-argument", "tenantID and accountKey required");
      }
      guards.assertTenantMatch(request.auth, tenantID);

      tracker.set("accountKey", accountKey);
      tracker.set("syncType", fullSync ? "full" : "incremental");
      _log("gmailSyncEmails called", { tenantID, accountKey, fullSync });

      const db = await getDB();
      const accessToken = await getGmailAccessToken(db, tenantID, accountKey);

      const authRef = _authDocRef(db, tenantID, accountKey);
      const authSnap = await authRef.get();
      const authData = authSnap.data();
      tracker.bump("firestoreReads", 1);

      const emailsCollection = _emailsCollection(db, tenantID);

      let synced = 0;

      if (fullSync || !authData.historyId) {
        _log("gmailSyncEmails - doing full sync");
        const allMessageIds = new Set();
        const labels = ["INBOX", "SENT", "DRAFT", "TRASH", "SPAM"];
        for (const label of labels) {
          const listRes = await fetch(
            `${GMAIL_API_BASE}/messages?maxResults=50&labelIds=${label}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          tracker.bump("gmailApiCalls", 1);
          if (listRes.ok) {
            const listData = await listRes.json();
            (listData.messages || []).forEach((m) => allMessageIds.add(m.id));
          }
        }
        const messageIds = [...allMessageIds];

        const BATCH_SIZE = 20;
        for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
          const batch = messageIds.slice(i, i + BATCH_SIZE);
          const messages = await Promise.all(
            batch.map(async (msgId) => {
              const msgRes = await fetch(
                `${GMAIL_API_BASE}/messages/${msgId}?format=full`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (!msgRes.ok) return null;
              return msgRes.json();
            })
          );
          tracker.bump("gmailApiCalls", batch.length);

          const writeBatch = db.batch();
          let batchWrites = 0;
          for (const msg of messages) {
            if (!msg) continue;
            const parsed = _parseGmailMessage(msg);
            parsed.accountKey = accountKey;
            writeBatch.set(emailsCollection.doc(parsed.id), parsed, { merge: true });
            synced++;
            batchWrites++;
          }
          await writeBatch.commit();
          tracker.bump("firestoreWrites", batchWrites);

          if (i + BATCH_SIZE < messageIds.length) {
            await new Promise((r) => setTimeout(r, 100));
          }
        }

        const profileRes = await fetch(`${GMAIL_API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        tracker.bump("gmailApiCalls", 1);
        const profile = await profileRes.json();
        await authRef.update({ historyId: profile.historyId || authData.historyId });
        tracker.bump("firestoreWrites", 1);
      } else {
        let pageToken = "";
        let historyId = authData.historyId;
        let allChangedIds = new Set();

        do {
          const url = `${GMAIL_API_BASE}/history?startHistoryId=${historyId}&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved&historyTypes=messageDeleted${
            pageToken ? "&pageToken=" + pageToken : ""
          }`;
          const histRes = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          tracker.bump("gmailApiCalls", 1);

          if (!histRes.ok) {
            const status = histRes.status;
            if (status === 404) {
              return await _syncFull(
                db, accessToken, tenantID, accountKey, emailsCollection, authRef
              );
            }
            throw new HttpsError("internal", "History list failed");
          }

          const histData = await histRes.json();
          if (histData.history) {
            for (const h of histData.history) {
              (h.messagesAdded || []).forEach((m) => allChangedIds.add(m.message.id));
              (h.labelsAdded || []).forEach((m) => allChangedIds.add(m.message.id));
              (h.labelsRemoved || []).forEach((m) => allChangedIds.add(m.message.id));
            }
          }

          pageToken = histData.nextPageToken || "";
          if (histData.historyId) historyId = histData.historyId;
        } while (pageToken);

        const changedIds = [...allChangedIds];
        const BATCH_SIZE = 20;
        for (let i = 0; i < changedIds.length; i += BATCH_SIZE) {
          const batch = changedIds.slice(i, i + BATCH_SIZE);
          const messages = await Promise.all(
            batch.map(async (msgId) => {
              const msgRes = await fetch(
                `${GMAIL_API_BASE}/messages/${msgId}?format=full`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (!msgRes.ok) return null;
              return msgRes.json();
            })
          );
          tracker.bump("gmailApiCalls", batch.length);

          const writeBatch = db.batch();
          let batchWrites = 0;
          for (const msg of messages) {
            if (!msg) continue;
            const parsed = _parseGmailMessage(msg);
            parsed.accountKey = accountKey;
            writeBatch.set(emailsCollection.doc(parsed.id), parsed, { merge: true });
            synced++;
            batchWrites++;
          }
          await writeBatch.commit();
          tracker.bump("firestoreWrites", batchWrites);
        }

        await authRef.update({ historyId });
        tracker.bump("firestoreWrites", 1);
      }

      const unreadSnap = await emailsCollection
        .where("accountKey", "==", accountKey)
        .where("isUnread", "==", true)
        .where("labelIds", "array-contains", "INBOX")
        .get();
      tracker.bump("firestoreReads", unreadSnap.size || 1);
      await authRef.update({
        unreadCount: unreadSnap.size,
        lastSyncedAt: Date.now(),
      });
      tracker.bump("firestoreWrites", 1);
      tracker.set("messagesSynced", synced);

      return { success: true, synced, unreadCount: unreadSnap.size };
    })
  );

  // ───────────────────────────────────────────────────────────────────────────
  // gmailPushHandler — Pub/Sub delivery target. Resolves tenantID via the global
  // email-tenant-index, then processes the history delta for that tenant's
  // email-auth doc. Cannot use auth-guards (no caller identity); relies on
  // Pub/Sub's own delivery auth.
  // ───────────────────────────────────────────────────────────────────────────
  const gmailPushHandler = onRequest(
    {
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
    },
    withFeatureTrackingHttp("gmail.push.handler", async (req, res, tracker) => {
      try {
        _log("gmailPushHandler called, body:", JSON.stringify(req.body || {}).substring(0, 500));
        const message = req.body?.message;
        if (!message?.data) {
          _log("gmailPushHandler: no message data");
          res.status(200).send("No data");
          return;
        }

        const decoded = JSON.parse(Buffer.from(message.data, "base64").toString());
        _log("gmailPushHandler decoded:", JSON.stringify(decoded));
        const emailAddress = decoded.emailAddress?.toLowerCase();
        if (!emailAddress) {
          _log("gmailPushHandler: no emailAddress in decoded data");
          res.status(200).send("No email");
          return;
        }
        if (message.messageId) tracker.setContext({ correlationID: message.messageId });

        const db = await getDB();

        // Step 1: global routing index → tenantID
        const indexSnap = await _tenantIndexDocRef(db, emailAddress).get();
        tracker.bump("firestoreReads", 1);
        if (!indexSnap.exists) {
          _log("gmailPushHandler: no tenant-index doc for", emailAddress);
          res.status(200).send("Unknown email");
          return;
        }
        const { tenantID } = indexSnap.data();
        if (!tenantID) {
          _log("gmailPushHandler: tenant-index doc has no tenantID");
          res.status(200).send("Index missing tenantID");
          return;
        }

        // Step 2: per-tenant lookup → accountKey, assignedStoreID
        const lookupSnap = await _lookupDocRef(db, tenantID, emailAddress).get();
        tracker.bump("firestoreReads", 1);
        if (!lookupSnap.exists) {
          _log("gmailPushHandler: tenant-index pointed at tenant but per-tenant lookup is missing", { tenantID, emailAddress });
          res.status(200).send("Per-tenant lookup missing");
          return;
        }

        const { accountKey } = lookupSnap.data();
        tracker.setContext({ tenantID });
        tracker.set("accountKey", accountKey);
        const accessToken = await getGmailAccessToken(db, tenantID, accountKey);
        const authRef = _authDocRef(db, tenantID, accountKey);
        const authSnap = await authRef.get();
        const authData = authSnap.data();
        tracker.bump("firestoreReads", 1);
        const emailsCollection = _emailsCollection(db, tenantID);

        let historyId = authData.historyId;
        if (!historyId) {
          res.status(200).send("No historyId");
          return;
        }

        let allChangedIds = new Set();
        let pageToken = "";
        do {
          const url = `${GMAIL_API_BASE}/history?startHistoryId=${historyId}&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved${
            pageToken ? "&pageToken=" + pageToken : ""
          }`;
          const histRes = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          tracker.bump("gmailApiCalls", 1);
          if (!histRes.ok) break;
          const histData = await histRes.json();
          if (histData.history) {
            for (const h of histData.history) {
              (h.messagesAdded || []).forEach((m) => allChangedIds.add(m.message.id));
              (h.labelsAdded || []).forEach((m) => allChangedIds.add(m.message.id));
              (h.labelsRemoved || []).forEach((m) => allChangedIds.add(m.message.id));
            }
          }
          pageToken = histData.nextPageToken || "";
          if (histData.historyId) historyId = histData.historyId;
        } while (pageToken);

        const changedIds = [...allChangedIds];
        const BATCH_SIZE = 20;
        for (let i = 0; i < changedIds.length; i += BATCH_SIZE) {
          const batch = changedIds.slice(i, i + BATCH_SIZE);
          const messages = await Promise.all(
            batch.map(async (msgId) => {
              const msgRes = await fetch(
                `${GMAIL_API_BASE}/messages/${msgId}?format=full`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (!msgRes.ok) return null;
              return msgRes.json();
            })
          );
          tracker.bump("gmailApiCalls", batch.length);
          const writeBatch = db.batch();
          let batchWrites = 0;
          for (const msg of messages) {
            if (!msg) continue;
            const parsed = _parseGmailMessage(msg);
            parsed.accountKey = accountKey;
            writeBatch.set(emailsCollection.doc(parsed.id), parsed, { merge: true });
            batchWrites++;
          }
          await writeBatch.commit();
          tracker.bump("firestoreWrites", batchWrites);
        }

        const unreadSnap = await emailsCollection
          .where("accountKey", "==", accountKey)
          .where("isUnread", "==", true)
          .where("labelIds", "array-contains", "INBOX")
          .get();
        tracker.bump("firestoreReads", unreadSnap.size || 1);
        await authRef.update({
          historyId,
          unreadCount: unreadSnap.size,
          lastSyncedAt: Date.now(),
        });
        tracker.bump("firestoreWrites", 1);
        tracker.set("messagesSynced", changedIds.length);

        _log("gmailPushHandler success:", changedIds.length, "messages synced for", emailAddress);
        res.status(200).send("OK");
      } catch (error) {
        _log("gmailPushHandler error", error);
        res.status(200).send("Error handled");
      }
    })
  );

  // ───────────────────────────────────────────────────────────────────────────
  // gmailSendEmail — compose + send via Gmail API; mirrors the sent message
  // into the per-tenant emails cache.
  // ───────────────────────────────────────────────────────────────────────────
  const gmailSendEmail = onCall(
    {
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    withFeatureTracking("gmail.send", async (request, tracker) => {
      _requireAuth(request.auth);
      const {
        tenantID,
        accountKey,
        to, cc, bcc,
        subject, bodyHtml, bodyText,
        threadId, inReplyTo, references,
        attachments, videoStorageUrl,
      } = request.data;

      tracker.set("accountKey", accountKey);
      tracker.set("recipientCount", (to?.length || 0) + (cc?.length || 0) + (bcc?.length || 0));
      tracker.set("attachmentCount", attachments?.length || 0);
      tracker.set("hasVideo", videoStorageUrl ? 1 : 0);

      if (!tenantID || !accountKey) {
        throw new HttpsError("invalid-argument", "tenantID and accountKey required");
      }
      if (!to || !to.length) {
        throw new HttpsError("invalid-argument", "At least one recipient required");
      }
      guards.assertTenantMatch(request.auth, tenantID);

      const db = await getDB();
      const accessToken = await getGmailAccessToken(db, tenantID, accountKey);
      const authRef = _authDocRef(db, tenantID, accountKey);
      const authData = (await authRef.get()).data();
      tracker.bump("firestoreReads", 1);
      const fromEmail = authData.email;

      let htmlContent = bodyHtml || "";
      if (videoStorageUrl) {
        htmlContent += `<br/><p><a href="${videoStorageUrl}">📎 Video attachment</a></p>`;
      }

      const boundary = "boundary_" + Date.now().toString(36);
      const mixedBoundary = "mixed_" + Date.now().toString(36);
      const hasAttachments = attachments && attachments.length > 0;

      let rawHeaders = [`From: ${fromEmail}`, `To: ${to.join(", ")}`];
      if (cc?.length) rawHeaders.push(`Cc: ${cc.join(", ")}`);
      if (bcc?.length) rawHeaders.push(`Bcc: ${bcc.join(", ")}`);
      rawHeaders.push(`Subject: ${subject || ""}`);
      if (inReplyTo) rawHeaders.push(`In-Reply-To: ${inReplyTo}`);
      if (references) rawHeaders.push(`References: ${references}`);
      rawHeaders.push(`MIME-Version: 1.0`);

      let rawMessage;
      if (hasAttachments) {
        rawHeaders.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
        let parts = rawHeaders.join("\r\n") + "\r\n\r\n";
        parts += `--${mixedBoundary}\r\n`;
        parts += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
        if (bodyText) {
          parts += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${bodyText}\r\n`;
        }
        parts += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${htmlContent}\r\n`;
        parts += `--${boundary}--\r\n`;

        for (const att of attachments) {
          parts += `--${mixedBoundary}\r\n`;
          parts += `Content-Type: ${att.mimeType || "application/octet-stream"}; name="${att.filename}"\r\n`;
          parts += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
          parts += `Content-Transfer-Encoding: base64\r\n\r\n`;
          parts += att.content + "\r\n";
        }
        parts += `--${mixedBoundary}--`;
        rawMessage = parts;
      } else {
        rawHeaders.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
        let parts = rawHeaders.join("\r\n") + "\r\n\r\n";
        if (bodyText) {
          parts += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${bodyText}\r\n`;
        }
        parts += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${htmlContent}\r\n`;
        parts += `--${boundary}--`;
        rawMessage = parts;
      }

      const encodedMessage = Buffer.from(rawMessage)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const sendBody = { raw: encodedMessage };
      if (threadId) sendBody.threadId = threadId;

      const sendRes = await fetch(`${GMAIL_API_BASE}/messages/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sendBody),
      });
      tracker.bump("gmailApiCalls", 1);
      tracker.bump("gmailMessagesSent", 1);
      tracker.bump("emailBytesSent", rawMessage.length);

      if (!sendRes.ok) {
        const errBody = await sendRes.text();
        _log("Gmail send failed", errBody);
        throw new HttpsError("internal", "Failed to send email");
      }

      const sentMsg = await sendRes.json();
      tracker.setContext({ correlationID: sentMsg.id });

      const msgRes = await fetch(
        `${GMAIL_API_BASE}/messages/${sentMsg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      tracker.bump("gmailApiCalls", 1);
      if (msgRes.ok) {
        const fullMsg = await msgRes.json();
        const parsed = _parseGmailMessage(fullMsg);
        parsed.accountKey = accountKey;
        await _emailsCollection(db, tenantID).doc(parsed.id).set(parsed, { merge: true });
        tracker.bump("firestoreWrites", 1);
      }

      return { success: true, messageId: sentMsg.id, threadId: sentMsg.threadId };
    })
  );

  // ───────────────────────────────────────────────────────────────────────────
  // gmailModifyLabels — batch label modify + local cache update.
  // ───────────────────────────────────────────────────────────────────────────
  const gmailModifyLabels = onCall(
    {
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
    },
    withFeatureTracking("gmail.modifyLabels", async (request, tracker) => {
      _requireAuth(request.auth);
      const { tenantID, accountKey, messageIds, addLabelIds, removeLabelIds } = request.data;
      if (!tenantID || !accountKey || !messageIds?.length) {
        throw new HttpsError("invalid-argument", "Missing required fields");
      }
      guards.assertTenantMatch(request.auth, tenantID);

      tracker.set("accountKey", accountKey);
      tracker.set("messageCount", messageIds.length);

      const db = await getDB();
      const accessToken = await getGmailAccessToken(db, tenantID, accountKey);

      const modifyRes = await fetch(`${GMAIL_API_BASE}/messages/batchModify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: messageIds,
          addLabelIds: addLabelIds || [],
          removeLabelIds: removeLabelIds || [],
        }),
      });
      tracker.bump("gmailApiCalls", 1);

      if (!modifyRes.ok) {
        const errBody = await modifyRes.text();
        _log("Gmail batchModify failed", errBody);
        throw new HttpsError("internal", "Failed to modify labels");
      }

      const emailsCollection = _emailsCollection(db, tenantID);

      const writeBatch = db.batch();
      let batchWrites = 0;
      for (const msgId of messageIds) {
        const docRef = emailsCollection.doc(msgId);
        const snap = await docRef.get();
        tracker.bump("firestoreReads", 1);
        if (!snap.exists) continue;
        const data = snap.data();
        let labels = [...(data.labelIds || [])];
        (removeLabelIds || []).forEach((l) => {
          labels = labels.filter((x) => x !== l);
        });
        (addLabelIds || []).forEach((l) => {
          if (!labels.includes(l)) labels.push(l);
        });
        writeBatch.update(docRef, {
          labelIds: labels,
          isUnread: labels.includes("UNREAD"),
        });
        batchWrites++;
      }
      await writeBatch.commit();
      tracker.bump("firestoreWrites", batchWrites);

      const unreadSnap = await emailsCollection
        .where("accountKey", "==", accountKey)
        .where("isUnread", "==", true)
        .where("labelIds", "array-contains", "INBOX")
        .get();
      tracker.bump("firestoreReads", unreadSnap.size || 1);
      const authRef = _authDocRef(db, tenantID, accountKey);
      await authRef.update({ unreadCount: unreadSnap.size });
      tracker.bump("firestoreWrites", 1);

      return { success: true, unreadCount: unreadSnap.size };
    })
  );

  // ───────────────────────────────────────────────────────────────────────────
  // gmailGetAttachment — fetch attachment bytes from Gmail, store to Cloud
  // Storage under tenants/{tenantID}/email-attachments/..., update the email
  // doc with the signed URL.
  // ───────────────────────────────────────────────────────────────────────────
  const gmailGetAttachment = onCall(
    {
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
    },
    withFeatureTracking("gmail.attachment.fetch", async (request, tracker) => {
      _requireAuth(request.auth);
      const { tenantID, accountKey, messageId, attachmentId, filename } = request.data;
      if (!tenantID || !accountKey || !messageId || !attachmentId) {
        throw new HttpsError("invalid-argument", "Missing required fields");
      }
      guards.assertTenantMatch(request.auth, tenantID);

      tracker.set("accountKey", accountKey);
      tracker.setContext({ correlationID: messageId });

      const db = await getDB();
      const accessToken = await getGmailAccessToken(db, tenantID, accountKey);

      const attRes = await fetch(
        `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      tracker.bump("gmailApiCalls", 1);

      if (!attRes.ok) {
        throw new HttpsError("internal", "Failed to get attachment");
      }

      const attData = await attRes.json();
      const fileBuffer = Buffer.from(attData.data, "base64url");
      tracker.bump("storageBytesAdded", fileBuffer.length);
      tracker.set("attachmentBytes", fileBuffer.length);

      const bucket = admin.storage().bucket(storageBucket);
      const storagePath = `${tenantID}/email-attachments/${messageId}/${filename || "attachment"}`;
      const file = bucket.file(storagePath);

      await file.save(fileBuffer, {
        metadata: { contentType: "application/octet-stream" },
      });

      const [downloadUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      const emailsCollection = _emailsCollection(db, tenantID);
      const emailDoc = await emailsCollection.doc(messageId).get();
      tracker.bump("firestoreReads", 1);
      if (emailDoc.exists) {
        const emailData = emailDoc.data();
        const updatedAttachments = (emailData.attachments || []).map((att) =>
          att.attachmentId === attachmentId ? { ...att, storageUrl: downloadUrl } : att
        );
        await emailsCollection.doc(messageId).update({ attachments: updatedAttachments });
        tracker.bump("firestoreWrites", 1);
      }

      return { success: true, downloadUrl };
    })
  );

  // ───────────────────────────────────────────────────────────────────────────
  // gmailSetupWatch / gmailReconnectWatch — manual watch refresh.
  // ───────────────────────────────────────────────────────────────────────────
  const gmailSetupWatch = onCall(
    {
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
    },
    withFeatureTracking("gmail.watch.setup", async (request, tracker) => {
      _requireAuth(request.auth);
      const { tenantID, accountKey } = request.data;
      if (!tenantID || !accountKey) {
        throw new HttpsError("invalid-argument", "tenantID and accountKey required");
      }
      guards.assertTenantMatch(request.auth, tenantID);

      tracker.set("accountKey", accountKey);

      const db = await getDB();
      const accessToken = await getGmailAccessToken(db, tenantID, accountKey);
      const authRef = _authDocRef(db, tenantID, accountKey);

      const watchRes = await fetch(`${GMAIL_API_BASE}/watch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topicName: WATCH_TOPIC, labelIds: ["INBOX"] }),
      });
      tracker.bump("gmailApiCalls", 1);

      if (!watchRes.ok) {
        const errText = await watchRes.text();
        _log("gmailSetupWatch failed", errText);
        throw new HttpsError("internal", "Watch setup failed: " + errText);
      }

      const watchData = await watchRes.json();
      await authRef.update({
        watchExpiration: parseInt(watchData.expiration) || 0,
        historyId: watchData.historyId,
      });
      tracker.bump("firestoreWrites", 1);

      return { success: true, expiration: watchData.expiration };
    })
  );

  const gmailReconnectWatch = onCall(
    {
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
      timeoutSeconds: 300,
      memory: "512MiB",
    },
    withFeatureTracking("gmail.watch.reconnect", async (request, tracker) => {
      _requireAuth(request.auth);
      const { tenantID, accountKey } = request.data;
      if (!tenantID || !accountKey) {
        throw new HttpsError("invalid-argument", "tenantID and accountKey required");
      }
      guards.assertTenantMatch(request.auth, tenantID);

      tracker.set("accountKey", accountKey);

      const db = await getDB();
      const accessToken = await getGmailAccessToken(db, tenantID, accountKey);
      const authRef = _authDocRef(db, tenantID, accountKey);

      const watchRes = await fetch(`${GMAIL_API_BASE}/watch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topicName: WATCH_TOPIC, labelIds: ["INBOX"] }),
      });
      tracker.bump("gmailApiCalls", 1);

      if (!watchRes.ok) {
        const errText = await watchRes.text();
        _log("gmailReconnectWatch failed", errText);
        throw new HttpsError("internal", "Watch setup failed: " + errText);
      }

      const watchData = await watchRes.json();
      await authRef.update({
        watchExpiration: parseInt(watchData.expiration) || 0,
        historyId: watchData.historyId,
      });
      tracker.bump("firestoreWrites", 1);

      const emailsCollection = _emailsCollection(db, tenantID);
      const fullResult = await _syncFull(
        db, accessToken, tenantID, accountKey, emailsCollection, authRef
      );
      tracker.set("backfillSynced", fullResult.synced);

      return {
        success: true,
        expiration: watchData.expiration,
        historyId: watchData.historyId,
        synced: fullResult.synced,
        unreadCount: fullResult.unreadCount,
      };
    })
  );

  // ───────────────────────────────────────────────────────────────────────────
  // gmailRenewWatch — scheduled daily. CollectionGroup query across all tenants
  // in the deploy; renews any watch within 2 days of expiry.
  // ───────────────────────────────────────────────────────────────────────────
  const gmailRenewWatch = onSchedule(
    {
      schedule: "0 0 * * *",
      secrets: [gmailOAuthClientId, gmailOAuthClientSecret],
      timeoutSeconds: 120,
    },
    withFeatureTrackingSchedule("gmail.watch.renew", async (event, tracker) => {
      _log("[gmailRenewWatch] === START ===", {
        now: Date.now(),
        nowIso: new Date().toISOString(),
      });
      let stats = {
        accounts: 0,
        skippedNotConnected: 0,
        skippedFresh: 0,
        attempted: 0,
        renewed: 0,
        watchFetchFailed: 0,
        exceptions: 0,
      };

      try {
        const db = await getDB();
        // Status==connected filters out partial/error rows; watchExpiration
        // ordering lets us walk imminently-expiring ones first. The
        // composite index is in firestore.indexes.json.
        const twoDaysFromNow = Date.now() + 2 * 24 * 60 * 60 * 1000;
        const groupSnap = await db
          .collectionGroup("email-auth")
          .where("status", "==", "connected")
          .where("watchExpiration", "<=", twoDaysFromNow)
          .get();
        _log(`[gmailRenewWatch] accounts needing renewal: ${groupSnap.size}`);

        for (const authDoc of groupSnap.docs) {
          stats.accounts++;
          const data = authDoc.data();

          const pathParts = authDoc.ref.path.split("/");
          // tenants/{tenantID}/email-auth/{accountKey}
          const tenantID = pathParts[1];
          const accountKey = pathParts[3];

          const ctx = {
            tenant: tenantID,
            account: accountKey,
            email: data.email,
            status: data.status,
            watchExpiration: data.watchExpiration,
            watchExpirationIso: data.watchExpiration
              ? new Date(data.watchExpiration).toISOString()
              : null,
            historyId: data.historyId,
          };
          _log("[gmailRenewWatch] evaluating account:", ctx);

          stats.attempted++;
          try {
            const accessToken = await getGmailAccessToken(db, tenantID, accountKey);
            const watchRes = await fetch(`${GMAIL_API_BASE}/watch`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ topicName: WATCH_TOPIC, labelIds: ["INBOX"] }),
            });
            tracker.bump("gmailApiCalls", 1);

            if (watchRes.ok) {
              const watchData = await watchRes.json();
              await authDoc.ref.update({
                watchExpiration: parseInt(watchData.expiration) || 0,
                historyId: watchData.historyId || data.historyId,
              });
              tracker.bump("firestoreWrites", 1);
              stats.renewed++;
              _log("[gmailRenewWatch] ✅ RENEWED:", {
                email: data.email,
                expiration: watchData.expiration,
              });
            } else {
              stats.watchFetchFailed++;
              const errBody = await watchRes.text();
              _log("[gmailRenewWatch] ❌ watch fetch FAILED:", {
                email: data.email,
                status: watchRes.status,
                body: errBody.substring(0, 500),
              });
            }
          } catch (e) {
            stats.exceptions++;
            _log("[gmailRenewWatch] ❌ EXCEPTION for", data.email, {
              message: e.message,
              code: e.code,
            });
          }
        }
      } catch (outerErr) {
        _log("[gmailRenewWatch] ❌ OUTER EXCEPTION:", {
          message: outerErr.message,
          code: outerErr.code,
        });
      }

      tracker.set("accountsScanned", stats.accounts);
      tracker.set("watchesRenewed", stats.renewed);
      tracker.set("watchFailures", stats.watchFetchFailed + stats.exceptions);
      _log("[gmailRenewWatch] === END ===", stats);
    })
  );

  return {
    gmailInitiateAuth,
    gmailOAuthCallback,
    gmailDisconnect,
    gmailSyncEmails,
    gmailPushHandler,
    gmailSendEmail,
    gmailModifyLabels,
    gmailGetAttachment,
    gmailSetupWatch,
    gmailReconnectWatch,
    gmailRenewWatch,
  };
}

module.exports = { register };
