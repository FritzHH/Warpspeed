/* eslint-disable */
// Tenant-isolation + privilege guards for SaaS callables.
//
// Three layers of authorization, all driven by the ID token's custom claims:
//
//   1. Tenant match — every tenant-scoped callable must verify the caller's
//      `tenantID` claim matches the resource it's acting on. Otherwise any
//      signed-in user from tenant A could pass tenantID="B" in request.data
//      and act on tenant B's data.
//        - assertTenantMatch(auth, tenantID)         direct (caller passes tenantID)
//        - lookupTenantForConnectAccount(stripeID)   indirect (resolve via index)
//
//   2. Privilege — tenant-owner-only callables (Stripe Connect onboarding,
//      billing, user invites) check the caller's `privilege` claim. The
//      hierarchy from highest to lowest: owner > admin > manager > editor >
//      user. assertPrivilege requires the caller's rank ≥ the required rank.
//        - assertPrivilege(auth, "owner")
//
//   3. Platform admin — cross-tenant operations (creating new tenants,
//      DLQ admin retry/status, anything touching `connect-accounts-index`
//      or `saas-dlq` collections) require the `platformAdmin: true` claim.
//      Set manually for fritz's account; never grantable via callable.
//        - assertPlatformAdmin(auth)
//
// Claim shape (per project-auth-claims-design.md):
//   { tenantID, privilege, stores: [...] }    tenant users
//   { platformAdmin: true }                   platform operators (fritz)
//
// setUserClaims is the internal helper auth-claims.js callables use to write
// claims; not exposed as a callable itself.
const { HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const PRIVILEGES = ["user", "editor", "manager", "admin", "owner"];
const PRIVILEGE_RANK = PRIVILEGES.reduce((acc, name, idx) => {
  acc[name] = idx + 1;
  return acc;
}, {});

function getTokenTenantID(auth) {
  const claim = auth && auth.token && auth.token.tenantID;
  if (!claim) {
    throw new HttpsError(
      "permission-denied",
      "Token is missing the tenantID claim. Sign out and back in."
    );
  }
  return claim;
}

function assertTenantMatch(auth, tenantID) {
  const claim = getTokenTenantID(auth);
  if (!tenantID) {
    throw new HttpsError("invalid-argument", "tenantID is required.");
  }
  if (claim !== tenantID) {
    throw new HttpsError(
      "permission-denied",
      "Cross-tenant access is not allowed."
    );
  }
}

function assertPrivilege(auth, minPrivilege) {
  const tokenPrivilege = auth && auth.token && auth.token.privilege;
  const need = PRIVILEGE_RANK[minPrivilege];
  if (!need) {
    throw new HttpsError(
      "internal",
      `assertPrivilege called with unknown level ${minPrivilege}.`
    );
  }
  const have = PRIVILEGE_RANK[tokenPrivilege];
  if (!have) {
    throw new HttpsError(
      "permission-denied",
      "Token is missing the privilege claim. Sign out and back in."
    );
  }
  if (have < need) {
    throw new HttpsError(
      "permission-denied",
      `Requires ${minPrivilege} privilege or higher.`
    );
  }
}

function assertPlatformAdmin(auth) {
  const flag = auth && auth.token && auth.token.platformAdmin === true;
  if (!flag) {
    throw new HttpsError(
      "permission-denied",
      "Platform-admin privilege required."
    );
  }
}

async function lookupTenantForConnectAccount(stripeAccountID) {
  if (!stripeAccountID) {
    throw new HttpsError("invalid-argument", "stripeAccountID is required.");
  }
  const db = getFirestore();
  const snap = await db
    .collection("connect-accounts-index")
    .doc(stripeAccountID)
    .get();
  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      `Connect account ${stripeAccountID} is not registered with the platform.`
    );
  }
  const data = snap.data() || {};
  if (!data.tenantID) {
    throw new HttpsError(
      "failed-precondition",
      `Connect account ${stripeAccountID} has no tenantID in the index.`
    );
  }
  return data.tenantID;
}

// Writes the SaaS custom-claim shape onto a user. `stores` is honored as
// passed for every privilege level — owners are NOT auto-emptied; their
// stores list must be maintained by callers (e.g. platformAdminCreate*).
// Defaults to [] if not supplied. Throws if `privilege` is unrecognized so
// a caller can't accidentally grant a typo'd role.
async function setUserClaims(uid, { tenantID, privilege, stores }) {
  if (!uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }
  if (!tenantID) {
    throw new HttpsError("invalid-argument", "tenantID is required.");
  }
  if (!PRIVILEGE_RANK[privilege]) {
    throw new HttpsError(
      "invalid-argument",
      `privilege must be one of: ${PRIVILEGES.join(", ")}.`
    );
  }
  const claims = {
    tenantID,
    privilege,
    stores: Array.isArray(stores) ? stores.filter(Boolean) : [],
  };
  await admin.auth().setCustomUserClaims(uid, claims);
  return claims;
}

module.exports = {
  PRIVILEGES,
  PRIVILEGE_RANK,
  getTokenTenantID,
  assertTenantMatch,
  assertPrivilege,
  assertPlatformAdmin,
  lookupTenantForConnectAccount,
  setUserClaims,
};
