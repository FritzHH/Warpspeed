// Cadence Chrome Extension — service worker (MV3).
//
// Holds the only signed-in identity for the extension. Content scripts and
// popup talk to it via chrome.runtime.sendMessage; they never see the raw
// refresh token. Tokens persist in chrome.storage.local across browser
// restarts (Firebase JS SDK's indexedDBLocalPersistence equivalent in REST
// land — same survival profile, less code).
//
// MV3 service workers wake on demand and may be killed at any time. We do
// NOT cache state in module scope — every handler reads from chrome.storage
// fresh. The auth object format is documented at AUTH_KEY below.

import { ACTIVE_PROJECT, PROJECT_CONFIGS, CALLABLES } from "./config.js";

const AUTH_KEY = "auth";
// auth shape in chrome.storage.local:
// {
//   project:      "warpspeed-bonitabikes" | "cadence-pos"
//   idToken:      string  (Firebase ID token, ~1hr lifetime)
//   refreshToken: string  (long-lived, can re-issue idTokens)
//   expiresAt:    number  (unix ms when idToken expires)
//   uid:          string
//   email:        string
// }

const REFRESH_LEEWAY_MS = 60_000; // refresh 60s before expiry

// ────────────────────────────────────────────────────────────────────
// Firebase Auth REST helpers
// ────────────────────────────────────────────────────────────────────

async function signInWithPassword({ email, password, project }) {
  const cfg = PROJECT_CONFIGS[project];
  if (!cfg) throw new Error(`Unknown project: ${project}`);
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok) {
    const code = body && body.error && body.error.message;
    throw new Error(code || `signIn failed (${res.status})`);
  }
  const expiresIn = Number(body.expiresIn || 3600);
  return {
    project,
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    uid: body.localId,
    email: body.email,
  };
}

async function refreshIdToken(auth) {
  const cfg = PROJECT_CONFIGS[auth.project];
  if (!cfg) throw new Error(`Unknown project: ${auth.project}`);
  const url = `https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`;
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", auth.refreshToken);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const body = await res.json();
  if (!res.ok) {
    const code = body && body.error && (body.error.message || body.error);
    throw new Error(code || `refresh failed (${res.status})`);
  }
  const expiresIn = Number(body.expires_in || 3600);
  return {
    ...auth,
    idToken: body.id_token,
    refreshToken: body.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

// Decode the JWT payload (middle segment, base64url-encoded JSON). Returns
// null on malformed input — never throws. Used to read Firebase custom claims
// (tenantID, storeID, stores[]) out of the ID token without an extra RPC.
function decodeJwtPayload(jwt) {
  if (!jwt || typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    // Convert base64url → base64, then decode + parse.
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// Pull tenantID + storeID from custom claims. Handles both claim shapes:
//   - Bonita    (warpspeed-bonitabikes): { tenantID, storeID }
//   - cadence:  (cadence-pos):           { tenantID, privilege, stores: [...] }
// For cadence multi-store users we leave storeID undefined so the popup can
// prompt the user to pick — single-store users get the lone store auto-picked.
function resolveTenantStoreFromClaims(idToken) {
  const claims = decodeJwtPayload(idToken);
  if (!claims) return {};
  const out = {};
  if (typeof claims.tenantID === "string" && claims.tenantID) {
    out.tenantID = claims.tenantID;
  }
  if (typeof claims.storeID === "string" && claims.storeID) {
    out.storeID = claims.storeID;
  } else if (Array.isArray(claims.stores) && claims.stores.length === 1) {
    out.storeID = String(claims.stores[0]);
  }
  return out;
}

// Merge claim-derived tenantID/storeID into existing settings without
// stomping unrelated fields. tenantID is always authoritative when present;
// storeID is only overwritten when the resolver actually produced one (so
// multi-store cadence users whose first sign-in didn't pick a store keep
// whatever the popup wrote previously, or stay empty for the popup to fill).
// Returns the merged settings object; caller writes it.
async function mergeClaimsIntoSettings(idToken) {
  const resolved = resolveTenantStoreFromClaims(idToken);
  const stored = (await chrome.storage.local.get("settings")).settings || {};
  if (!resolved.tenantID && !resolved.storeID) return stored;
  const next = { ...stored };
  if (resolved.tenantID) next.tenantID = resolved.tenantID;
  if (resolved.storeID) next.storeID = resolved.storeID;
  return next;
}

async function getStoredAuth() {
  const out = await chrome.storage.local.get(AUTH_KEY);
  return out[AUTH_KEY] || null;
}

async function setStoredAuth(auth) {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

async function clearStoredAuth() {
  await chrome.storage.local.remove(AUTH_KEY);
}

// Returns a fresh auth object whose idToken is good for at least
// REFRESH_LEEWAY_MS more. Refreshes from refreshToken if needed. Returns
// null if signed out. Throws if refresh fails (caller should treat as signed
// out and prompt re-auth).
async function ensureFreshAuth() {
  const auth = await getStoredAuth();
  if (!auth) return null;
  if (auth.expiresAt - Date.now() > REFRESH_LEEWAY_MS) return auth;
  const fresh = await refreshIdToken(auth);
  await setStoredAuth(fresh);
  return fresh;
}

// ────────────────────────────────────────────────────────────────────
// Generic callable proxy. Every Cadence callable accepts the same envelope:
// { project, idToken, tenantID, ...rest }. cadence-pos users also pass the
// Authorization header so request.auth is populated by the framework; Bonita
// users skip it (the function verifies idToken manually via a second admin
// app). Returns the unwrapped result, or a {success:false, reason:...} on
// auth/transport failure.
// ────────────────────────────────────────────────────────────────────

async function callCallable(url, payload) {
  const auth = await ensureFreshAuth();
  if (!auth) return { success: false, reason: "not_signed_in" };

  const body = {
    data: {
      project: auth.project,
      idToken: auth.idToken,
      ...payload,
    },
  };

  const headers = { "Content-Type": "application/json" };
  if (auth.project === "cadence-pos") {
    headers["Authorization"] = `Bearer ${auth.idToken}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json && json.error && (json.error.message || json.error)) ||
      `HTTP ${res.status}`;
    return { success: false, reason: "callable_error", message: msg };
  }
  return json.result || { success: false, reason: "empty_response" };
}

// ────────────────────────────────────────────────────────────────────
// Message router
// ────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case "signIn": {
          const auth = await signInWithPassword({
            email: msg.email,
            password: msg.password,
            project: msg.project || ACTIVE_PROJECT,
          });
          // Resolve tenant/store from custom claims so the user isn't prompted
          // for IDs they've already proven they own. Write auth + settings in
          // one set() so the storage.onChanged listener fires once with both
          // present (no "Set tenant/store" flash between the two writes).
          const settings = await mergeClaimsIntoSettings(auth.idToken).catch(
            () => null
          );
          const writePayload = { [AUTH_KEY]: auth };
          if (settings) writePayload.settings = settings;
          await chrome.storage.local.set(writePayload);
          sendResponse({ ok: true, auth: redactAuth(auth) });
          return;
        }
        case "signOut": {
          await clearStoredAuth();
          // Drop tenant/store too — a different user signing in next would
          // otherwise inherit them (claims rewrite tenantID, but a stale
          // multi-store storeID could leak across users).
          await chrome.storage.local.remove("settings");
          sendResponse({ ok: true });
          return;
        }
        case "getAuth": {
          const auth = await ensureFreshAuth().catch(() => null);
          sendResponse({ ok: true, auth: auth ? redactAuth(auth) : null });
          return;
        }
        case "addItem": {
          const result = await callCallable(CALLABLES.addItem, msg.payload || {});
          sendResponse({ ok: true, result });
          return;
        }
        case "listOrders": {
          const result = await callCallable(CALLABLES.listOrders, msg.payload || {});
          sendResponse({ ok: true, result });
          return;
        }
        case "getOrder": {
          const result = await callCallable(CALLABLES.getOrder, msg.payload || {});
          sendResponse({ ok: true, result });
          return;
        }
        case "setActiveOrder": {
          const result = await callCallable(CALLABLES.setActiveOrder, msg.payload || {});
          sendResponse({ ok: true, result });
          return;
        }
        case "applyInventoryCost": {
          const result = await callCallable(CALLABLES.applyInventoryCost, msg.payload || {});
          sendResponse({ ok: true, result });
          return;
        }
        default:
          sendResponse({ ok: false, error: "unknown_message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: (err && err.message) || String(err) });
    }
  })();
  return true; // keep the message channel open for the async response
});

function redactAuth(auth) {
  // Callers (popup, content) only need to know identity + project; never the
  // refresh token. appUrl is the per-project Cadence web app URL — content.js
  // uses it for the "Edit in Cadence" deep link.
  const cfg = PROJECT_CONFIGS[auth.project] || {};
  return {
    project: auth.project,
    uid: auth.uid,
    email: auth.email,
    expiresAt: auth.expiresAt,
    appUrl: cfg.appUrl || "",
  };
}
