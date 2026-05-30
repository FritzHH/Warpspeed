/* eslint-disable */
// Phase 2 — Connect Express onboarding backend.
//
// Tenant-admin callables (the merchant doing their own onboarding):
//   - stripeConnectAccountCreate         creates a new Express acct + records
//   - stripeConnectAccountLinkCreate     returns a one-time onboarding URL
//   - stripeConnectAccountStatusCallable forces a fresh state pull from Stripe
//
// Platform-admin callables (cadence-dashboard, fritz acting on tenant's
// behalf — common when we're setting up a brand-new tenant manually):
//   - platformAdminStripeConnectAccountCreate     by {tenantID}
//   - platformAdminStripeConnectAccountLinkCreate by {tenantID}
//   - platformAdminStripeConnectAccountStatus     by {tenantID}
//
// Both surfaces delegate to the same internal helpers below — the only
// difference is the guard pattern and how the {tenantID, stripeAccountID}
// pair is resolved.
//
// Webhook-driven state updates live in pubsub-subscriber.js
// (handleAccountUpdated). The create helper writes the initial record + index
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
  assertPlatformAdmin,
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

// Throws not-found if the tenant doc doesn't exist. Used by platform-admin
// variants so a typo'd tenantID surfaces clearly instead of failing deeper
// (e.g. when fetching ownerEmail off an empty doc).
async function loadTenantOrThrow(db, tenantID) {
  const snap = await db.collection("tenants").doc(tenantID).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
  }
  return snap.data() || {};
}

// Resolve the tenant's Connect account ID. Current design is one account per
// tenant; if that changes we'll need a selector arg. Returns null if no
// account has been created yet — callers decide whether that's an error.
async function findTenantConnectAccountID(db, tenantID) {
  const snap = await db
    .collection("tenants")
    .doc(tenantID)
    .collection("connect-accounts")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

// ---------------------------------------------------------------------------
// Internal helpers — shared by tenant-admin + platform-admin callables.
// ---------------------------------------------------------------------------

async function createAccountInternal({
  secret,
  db,
  tenantID,
  email,
  businessName,
  byUID,
  businessType,
  mcc,
  companyPhone,
  companyAddress,
  representative,
  fullBakeForTest = false,
}) {
  logger.info("stripeConnect.createAccountInternal: starting", {
    tenantID,
    email,
    byUID,
    fullBakeForTest,
  });

  const account = await stripeConnect.createConnectedAccount(secret, {
    email,
    businessName,
    businessType,
    mcc,
    companyPhone,
    companyAddress,
    fullBakeForTest,
  });

  // Best-effort representative pre-fill. If this fails the account still
  // exists; the owner can fill in rep info via Stripe's hosted onboarding.
  let representativeError = null;
  if (representative) {
    try {
      await stripeConnect.createRepresentativePerson(secret, account.id, {
        ...representative,
        fullBakeForTest,
      });
    } catch (err) {
      representativeError = err && err.message ? err.message : String(err);
      logger.error("stripeConnect.createAccountInternal: representative create failed", {
        tenantID,
        stripeAccountID: account.id,
        error: representativeError,
      });
    }
  }

  const batch = db.batch();

  const tenantAccountRef = db
    .collection("tenants")
    .doc(tenantID)
    .collection("connect-accounts")
    .doc(account.id);
  batch.set(tenantAccountRef, {
    ...accountSummary(account),
    createdAt: FieldValue.serverTimestamp(),
    createdByUID: byUID,
    lastWebhookEventAt: null,
  });

  const indexRef = db.collection("connect-accounts-index").doc(account.id);
  batch.set(indexRef, {
    tenantID,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  logger.info("stripeConnect.createAccountInternal: account created", {
    stripeAccountID: account.id,
    tenantID,
    representativeError,
  });

  return { stripeAccountID: account.id, representativeError };
}

async function createAccountLinkInternal({ secret, stripeAccountID }) {
  const link = await stripeConnect.createAccountLink(secret, {
    accountID: stripeAccountID,
    returnURL: ONBOARDING_RETURN_URL,
    refreshURL: ONBOARDING_REFRESH_URL,
  });
  return { url: link.url, expiresAt: link.expires_at };
}

async function getAccountStatusInternal({ secret, db, stripeAccountID, tenantID, syncCache }) {
  const account = await stripeConnect.retrieveAccount(secret, stripeAccountID);
  const summary = accountSummary(account);

  if (syncCache && tenantID) {
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

// Pushes the Stripe Payments Info collected on the owner-bootstrap form to
// the existing connected account. Each Stripe step is best-effort with its
// own try/catch so a single API failure doesn't block the rest of bootstrap
// (the store gets created either way, the owner can retry KYC fields from
// Stripe's hosted onboarding if needed).
//
// Returns { businessUrlError, bankAccountError, representativeKYCError }
// — all null on success. Caller surfaces these in the response so the
// dashboard / owner UI can show which fields still need attention.
async function applyOwnerKYCInternal({
  secret,
  stripeAccountID,
  businessUrl,
  bankRouting,
  bankAccount,
  accountHolderName,
  accountHolderType,
  dob,
  ssnLast4,
  tosIp,
}) {
  const errors = {
    businessUrlError: null,
    bankAccountError: null,
    representativeKYCError: null,
  };

  if (businessUrl) {
    try {
      await stripeConnect.updateBusinessUrl(secret, stripeAccountID, businessUrl);
    } catch (err) {
      errors.businessUrlError = err && err.message ? err.message : String(err);
      logger.error("applyOwnerKYCInternal: business_url update failed", {
        stripeAccountID,
        error: errors.businessUrlError,
      });
    }
  }

  if (bankRouting && bankAccount) {
    try {
      await stripeConnect.addBankAccount(secret, stripeAccountID, {
        routingNumber: bankRouting,
        accountNumber: bankAccount,
        accountHolderName: accountHolderName || "",
        accountHolderType: accountHolderType || "individual",
      });
    } catch (err) {
      errors.bankAccountError = err && err.message ? err.message : String(err);
      logger.error("applyOwnerKYCInternal: bank_account add failed", {
        stripeAccountID,
        error: errors.bankAccountError,
      });
    }
  }

  if (dob || ssnLast4 || tosIp) {
    try {
      const person = await stripeConnect.findRepresentativePerson(
        secret,
        stripeAccountID
      );
      if (!person) {
        throw new Error(
          "No representative person found on connected account; create one first."
        );
      }
      await stripeConnect.updateRepresentativeKYC(secret, stripeAccountID, person.id, {
        dob,
        ssnLast4,
        tosIp,
      });
    } catch (err) {
      errors.representativeKYCError = err && err.message ? err.message : String(err);
      logger.error("applyOwnerKYCInternal: representative KYC update failed", {
        stripeAccountID,
        error: errors.representativeKYCError,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Tenant-admin callables.
// ---------------------------------------------------------------------------

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

    return createAccountInternal({
      secret: STRIPE_PLATFORM_SECRET_KEY,
      db: getFirestore(),
      tenantID,
      email,
      businessName,
      byUID: auth.uid,
    });
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

    return createAccountLinkInternal({
      secret: STRIPE_PLATFORM_SECRET_KEY,
      stripeAccountID,
    });
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

    return getAccountStatusInternal({
      secret: STRIPE_PLATFORM_SECRET_KEY,
      db: getFirestore(),
      stripeAccountID,
      tenantID: tenantID || ownerTenantID,
      syncCache: Boolean(tenantID),
    });
  }
);

// ---------------------------------------------------------------------------
// Platform-admin callables — used by the cadence-dashboard host site.
// All take {tenantID} (more natural for the dashboard's tenant-detail flow);
// the stripeAccountID is looked up from the tenant's connect-accounts.
// ---------------------------------------------------------------------------

// Exposed for callables in other modules (e.g. platformAdminCreateTenantCallable
// bundles Connect Account creation into tenant create). Same helper, same
// post-conditions — uses the same secret + writes the same Firestore records.
exports._internals = {
  createAccountInternal,
  findTenantConnectAccountID,
  applyOwnerKYCInternal,
  STRIPE_PLATFORM_SECRET_KEY,
};

exports.platformAdminStripeConnectAccountCreate = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    const tenantData = await loadTenantOrThrow(db, tenantID);

    const email = tenantData.ownerEmail;
    const businessName = tenantData.name || tenantData.ownerEmail;
    if (!email) {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} has no ownerEmail; cannot create Connect account.`
      );
    }

    const existing = await findTenantConnectAccountID(db, tenantID);
    if (existing) {
      throw new HttpsError(
        "already-exists",
        `Tenant ${tenantID} already has Connect account ${existing}.`
      );
    }

    return createAccountInternal({
      secret: STRIPE_PLATFORM_SECRET_KEY,
      db,
      tenantID,
      email,
      businessName,
      byUID: auth.uid,
    });
  }
);

exports.platformAdminStripeConnectAccountLinkCreate = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    await loadTenantOrThrow(db, tenantID);

    const stripeAccountID = await findTenantConnectAccountID(db, tenantID);
    if (!stripeAccountID) {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} has no Connect account; create one first.`
      );
    }

    logger.info("platformAdminStripeConnectAccountLinkCreate: starting", {
      tenantID,
      stripeAccountID,
      byUID: auth.uid,
    });

    return createAccountLinkInternal({
      secret: STRIPE_PLATFORM_SECRET_KEY,
      stripeAccountID,
    });
  }
);

exports.platformAdminStripeConnectAccountStatus = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    await loadTenantOrThrow(db, tenantID);

    const stripeAccountID = await findTenantConnectAccountID(db, tenantID);
    if (!stripeAccountID) {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} has no Connect account.`
      );
    }

    logger.info("platformAdminStripeConnectAccountStatus: fetching", {
      tenantID,
      stripeAccountID,
      byUID: auth.uid,
    });

    return getAccountStatusInternal({
      secret: STRIPE_PLATFORM_SECRET_KEY,
      db,
      stripeAccountID,
      tenantID,
      syncCache: true,
    });
  }
);
