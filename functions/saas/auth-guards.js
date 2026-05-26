/* eslint-disable */
// Tenant-isolation guards for SaaS callables.
//
// All tenant-scoped callables (Connect onboarding, PI, checkout sessions,
// refunds, reader registration) must verify the caller's auth claim matches
// the resource's tenantID. Without this, any signed-in user from tenant A
// could pass tenantID="B" in request.data and act on tenant B's resources.
//
// Two flavors:
//   - assertTenantMatch(auth, tenantID)        Direct: caller passed tenantID
//                                              in the request, compare to
//                                              the auth-token claim.
//   - lookupTenantForConnectAccount(stripeID)  Indirect: caller passed only
//                                              a Stripe account/charge ID;
//                                              resolve owning tenant via
//                                              the platform's index, then
//                                              compare.
//
// Claim source: the App.jsx auth bootstrap reads `tenantID` and `storeID`
// from the ID token claims. createAppUserCallable stamps these claims at
// user creation; if a user predates claim provisioning they'll need to
// re-sign-in to refresh the token.
//
// Out of scope (deferred to the auth-claims design pass):
//   - Super-admin / platform-operator override (DLQ admin, cross-tenant ops)
//   - Store-level granularity (does tenant admin act across all stores?)
//   - Multi-tenant users (user belongs to >1 tenant)
const { HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");

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

module.exports = {
  getTokenTenantID,
  assertTenantMatch,
  lookupTenantForConnectAccount,
};
