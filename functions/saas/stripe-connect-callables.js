/* eslint-disable */
// Phase 2 — Connect Express onboarding backend.
//
// Three callables for the tenant-facing onboarding flow:
//   - stripeConnectAccountCreate         creates a new Express acct + records
//   - stripeConnectAccountLinkCreate     returns a one-time onboarding URL
//   - stripeConnectAccountStatusCallable forces a fresh state pull from Stripe
//
// Webhook-driven state updates live in pubsub-subscriber.js
// (handleAccountUpdated). These callables write the initial record + index
// entry; the webhook keeps the record in sync afterward.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const stripeConnect = require("./stripe-connect");
const {
  assertTenantMatch,
  assertPrivilege,
  lookupTenantForConnectAccount,
} = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");

// Stub URLs; the actual onboarding landing pages will be wired later.
// Stripe redirects merchants here after they finish (return) or hit refresh.
const ONBOARDING_REFRESH_URL = "https://cadence-pos.web.app/onboarding/refresh";
const ONBOARDING_RETURN_URL = "https://cadence-pos.web.app/onboarding/complete";

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

function accountSummary(account) {
  return {
    stripeAccountID: account.id,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    capabilities: account.capabilities || {},
    requirementsCurrentlyDue:
      (account.requirements && account.requirements.currently_due) || [],
    businessProfile: account.business_profile || {},
  };
}

exports.stripeConnectAccountCreate = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const { tenantID, email, businessName } = request.data || {};
    if (!tenantID || !email) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID and email are required."
      );
    }
    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "owner");

    logger.info("stripeConnectAccountCreate: starting", {
      tenantID,
      email,
      uid: auth.uid,
    });

    const account = await stripeConnect.createConnectedAccount(
      STRIPE_PLATFORM_SECRET_KEY,
      { email, businessName }
    );

    const db = getFirestore();
    const batch = db.batch();

    const tenantAccountRef = db
      .collection("tenants")
      .doc(tenantID)
      .collection("connect-accounts")
      .doc(account.id);
    batch.set(tenantAccountRef, {
      ...accountSummary(account),
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
      lastWebhookEventAt: null,
    });

    const indexRef = db.collection("connect-accounts-index").doc(account.id);
    batch.set(indexRef, {
      tenantID,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    logger.info("stripeConnectAccountCreate: account created", {
      stripeAccountID: account.id,
      tenantID,
    });

    return { stripeAccountID: account.id };
  }
);

exports.stripeConnectAccountLinkCreate = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const { stripeAccountID } = request.data || {};
    if (!stripeAccountID) {
      throw new HttpsError(
        "invalid-argument",
        "stripeAccountID is required."
      );
    }
    const ownerTenantID = await lookupTenantForConnectAccount(stripeAccountID);
    assertTenantMatch(auth, ownerTenantID);
    assertPrivilege(auth, "owner");

    logger.info("stripeConnectAccountLinkCreate: starting", {
      stripeAccountID,
      uid: auth.uid,
    });

    const link = await stripeConnect.createAccountLink(
      STRIPE_PLATFORM_SECRET_KEY,
      {
        accountID: stripeAccountID,
        returnURL: ONBOARDING_RETURN_URL,
        refreshURL: ONBOARDING_REFRESH_URL,
      }
    );

    return { url: link.url, expiresAt: link.expires_at };
  }
);

exports.stripeConnectAccountStatusCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const { stripeAccountID, tenantID } = request.data || {};
    if (!stripeAccountID) {
      throw new HttpsError(
        "invalid-argument",
        "stripeAccountID is required."
      );
    }
    const ownerTenantID = await lookupTenantForConnectAccount(stripeAccountID);
    assertTenantMatch(auth, ownerTenantID);
    assertPrivilege(auth, "owner");
    if (tenantID && tenantID !== ownerTenantID) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID does not match the Connect account's owning tenant."
      );
    }

    logger.info("stripeConnectAccountStatusCallable: fetching", {
      stripeAccountID,
      tenantID,
      uid: auth.uid,
    });

    const account = await stripeConnect.retrieveAccount(
      STRIPE_PLATFORM_SECRET_KEY,
      stripeAccountID
    );
    const summary = accountSummary(account);

    // If tenantID was supplied, sync the cache on the way out so the next
    // read in the UI sees the fresh state without waiting for a webhook.
    if (tenantID) {
      const db = getFirestore();
      await db
        .collection("tenants")
        .doc(tenantID)
        .collection("connect-accounts")
        .doc(stripeAccountID)
        .set(
          { ...summary, lastWebhookEventAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
    }

    return summary;
  }
);
