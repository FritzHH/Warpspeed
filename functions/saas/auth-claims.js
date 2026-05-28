/* eslint-disable */
// Auth claims provisioning callables (Phase 1 of auth-claims rollout)
// plus the platform-admin tenant-list callable used by cadence-dashboard.
//
//   - platformAdminCreateTenantCallable
//       Platform-admin only. Creates a brand-new tenant + provisions its
//       first owner. Writes tenants/{tenantID}, stamps {tenantID, privilege:
//       "owner"} claims on the owner's Auth user, returns a sign-in link
//       the caller can hand to the owner via any channel (email, SMS, copy
//       in person). The platformAdmin claim itself is set manually for fritz
//       via a one-off admin-SDK script — never via a callable.
//
//   - platformAdminCreateStoreCallable
//       Platform-admin only. Adds a second-or-later store under an existing
//       tenant. Two modes:
//         "fresh"  — clone SETTINGS_OBJ, regenerate generated-IDs
//         "copy"   — clone an existing store's settings doc, keep its IDs
//       Appends the new storeID to the owner's claims.stores (best-effort —
//       isOwner rule short-circuits store access anyway).
//
//   - listTenantsCallable
//       Platform-admin only. Returns the tenant roster with provisioning-
//       status flags inline (Twilio subaccount + A2P, Stripe Connect, store
//       count) so the dashboard list view can render "needs X" badges
//       without N follow-up reads.
//
//   - tenantAdminInviteUserCallable
//       Owner-only. Creates an invite doc keyed by random token, returns a
//       Firebase email-link sign-in URL for the invited address. Invite
//       carries the intended {tenantID, privilege, stores} — redemption
//       reads it back and stamps the claims.
//
//   - redeemInviteCallable
//       Any signed-in user. Reads invites/{token}, verifies the invited
//       email matches the signed-in email, stamps claims, marks the invite
//       redeemed. Client must force getIdToken(true) on return to pick up
//       the new claims without waiting for the 1-hour token refresh.
//
// Invite docs live at the top level (not under tenants/{tenantID}/) so
// redemption doesn't need a tenantID at lookup time — only the token.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");
const {
  PRIVILEGES,
  PRIVILEGE_RANK,
  assertPrivilege,
  assertPlatformAdmin,
  setUserClaims,
} = require("./auth-guards");
const { SETTINGS_OBJ } = require("../shared/data");
const { generateEAN13Barcode } = require("../shared/idGen");
const { numberWebhooksAreCurrent } = require("./twilio-common");
const { getTierDoc } = require("./billing-helpers");

if (!admin.apps.length) admin.initializeApp();

const INVITE_LANDING_URL = "https://cadence-pos.web.app/invite-accept";
const INVITE_TTL_DAYS = 7;
const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return null;
  return email.trim().toLowerCase();
}

function normalizeName(name) {
  if (!name || typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) return null;
  return trimmed;
}

// Returns E.164 (e.g. "+15551234567") or null. Strips formatting; assumes US
// (+1) for bare 10-digit numbers, accepts already-prefixed international.
function normalizePhone(phone) {
  if (!phone || typeof phone !== "string") return null;
  const raw = phone.trim();
  if (!raw) return null;
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function generateInviteToken() {
  return crypto.randomBytes(24).toString("base64url");
}

// Action-code settings for Firebase email-link sign-in. The invite token is
// appended as a query param so the landing page can read it client-side and
// call redeemInviteCallable. handleCodeInApp must be true so the link routes
// to the SaaS web app instead of Firebase's hosted page.
function buildActionCodeSettings(inviteToken) {
  return {
    url: `${INVITE_LANDING_URL}?token=${encodeURIComponent(inviteToken)}`,
    handleCodeInApp: true,
  };
}

function normalizeStoreString(value, maxLen) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function normalizeOptionalStoreString(value, maxLen) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLen) return null;
  return trimmed;
}

function normalizeZip(zip) {
  if (!zip || typeof zip !== "string") return null;
  const trimmed = zip.trim();
  if (!/^\d{5}(-\d{4})?$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeSalesTaxPercent(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return num;
}

const BILLING_MODELS = ["per_sale", "monthly_sub"];
const DEFAULT_PLATFORM_FEE_PERCENT = 0.5;
const PLATFORM_FEE_PERCENT_MAX = 10;

function normalizeBillingModel(value) {
  if (typeof value !== "string") return null;
  return BILLING_MODELS.includes(value) ? value : null;
}

// platformFeePercent is stored as a percent (0.5 = 0.5%), not a fraction.
// Only meaningful when billingModel === "per_sale". Capped at 10% as a sanity
// guard — anything higher would be a typo, not a real fee.
function normalizePlatformFeePercent(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PLATFORM_FEE_PERCENT;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > PLATFORM_FEE_PERCENT_MAX) {
    return null;
  }
  return num;
}

function formatUSPhoneForDisplay(e164) {
  const m = (e164 || "").match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (!m) return e164 || "";
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

function buildShopContactBlurb({ street, unit, city, state, zip, phone }) {
  const line1 = unit ? `${street}, ${unit}` : street;
  const line2 = `${city}, ${state} ${zip}`;
  const line3 = formatUSPhoneForDisplay(phone);
  return `${line1}\n${line2}\n${line3}`;
}

function regenIDsForArr(arr) {
  return (arr || []).map((item) => ({ ...item, id: generateEAN13Barcode() }));
}

// NONREMOVABLE_STATUSES keep their fixed string IDs (tenant code branches on
// them by ID); only `removable: true` entries get fresh IDs.
function regenStatusIDs(statuses) {
  return (statuses || []).map((s) =>
    s.removable === true ? { ...s, id: generateEAN13Barcode() } : s
  );
}

function regenNestedCategoryIDs(categories) {
  return (categories || []).map((cat) => ({
    ...cat,
    id: generateEAN13Barcode(),
    items: (cat.items || []).map((i) => ({ ...i, id: generateEAN13Barcode() })),
  }));
}

// Mutates `settings` in place with the per-store substitutions that apply to
// both fresh-bootstrap and copy-from-source paths. Returns the same object for
// chaining.
//
// `storeAddress`, `storeDisplayName`, and `salesTaxPercent` may all be null
// for stub-mode bootstraps (tenant created before the owner completes
// onboarding). In that case storeInfo gets empty strings + shopContactBlurb
// is cleared, and salesTaxPercent stays at whatever SETTINGS_OBJ defaults to.
function applyStoreOverrides(settings, {
  tenantID,
  storeID,
  storeDisplayName,
  storeAddress,
  salesTaxPercent,
}) {
  settings.tenantID = tenantID;
  settings.storeID = storeID;
  if (settings.amazonExtension) {
    settings.amazonExtension.storeId = storeID;
  }
  if (storeAddress) {
    settings.storeInfo = {
      ...settings.storeInfo,
      displayName: storeDisplayName || "",
      street: storeAddress.street,
      unit: storeAddress.unit,
      city: storeAddress.city,
      state: storeAddress.state,
      zip: storeAddress.zip,
      phone: storeAddress.phone,
    };
    settings.shopContactBlurb = buildShopContactBlurb(storeAddress);
  } else {
    settings.storeInfo = {
      ...settings.storeInfo,
      displayName: "",
      street: "",
      unit: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
    };
    settings.shopContactBlurb = "";
  }
  if (typeof salesTaxPercent === "number") {
    settings.salesTaxPercent = salesTaxPercent;
  }
  return settings;
}

// Fresh-store settings — clone of SETTINGS_OBJ with per-store overrides AND
// regenerated generated-IDs (statuses, discounts, etc.). Used when creating a
// new tenant's first store and when adding a store in "fresh" mode.
function buildBootstrapSettings({
  tenantID,
  storeID,
  storeDisplayName,
  storeAddress,
  salesTaxPercent,
}) {
  // Deep clone — SETTINGS_OBJ is pure data (no functions/Dates/Maps).
  const settings = JSON.parse(JSON.stringify(SETTINGS_OBJ));

  applyStoreOverrides(settings, {
    tenantID,
    storeID,
    storeDisplayName,
    storeAddress,
    salesTaxPercent,
  });

  settings.thankYouBlurb = "Thank you for your business!";
  settings.quickItemButtons = [];

  settings.statuses = regenStatusIDs(settings.statuses);
  settings.discounts = regenIDsForArr(settings.discounts);
  settings.waitTimeLabelCategories = regenIDsForArr(settings.waitTimeLabelCategories);
  settings.waitTimes = regenIDsForArr(settings.waitTimes);
  if (settings.storeHours) {
    settings.storeHours.standard = regenIDsForArr(settings.storeHours.standard);
    settings.storeHours.special = regenIDsForArr(settings.storeHours.special);
  }
  settings.noteHelpers = regenNestedCategoryIDs(settings.noteHelpers);
  settings.customerQuickNotes = regenNestedCategoryIDs(settings.customerQuickNotes);

  return settings;
}

// Copied-store settings — clone of an existing store's settings doc with
// per-store overrides applied but generated-IDs left intact. Used in
// platformAdminCreateStoreCallable's "copy" mode so the new store keeps the
// source's curated statuses, discounts, quickItemButtons, templates, etc.
function buildCopiedSettings({
  sourceSettings,
  tenantID,
  storeID,
  storeDisplayName,
  storeAddress,
  salesTaxPercent,
}) {
  const settings = JSON.parse(JSON.stringify(sourceSettings));
  applyStoreOverrides(settings, {
    tenantID,
    storeID,
    storeDisplayName,
    storeAddress,
    salesTaxPercent,
  });
  return settings;
}

exports.platformAdminCreateTenantCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const {
      tenantID,
      tenantName,
      ownerEmail,
      ownerFirstName,
      ownerLastName,
      ownerPhone,
      tenantStreet,
      tenantUnit,
      tenantCity,
      tenantState,
      tenantZip,
      billingModel,
      platformFeePercent,
      subscriptionTierID,
    } = request.data || {};

    if (!tenantID || !TENANT_ID_PATTERN.test(tenantID)) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID must be lowercase alphanumeric with optional dashes, 3-64 chars."
      );
    }
    if (!tenantName || typeof tenantName !== "string") {
      throw new HttpsError("invalid-argument", "tenantName is required.");
    }
    const normalizedEmail = normalizeEmail(ownerEmail);
    if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "ownerEmail is required.");
    }
    const normalizedFirstName = normalizeName(ownerFirstName);
    if (!normalizedFirstName) {
      throw new HttpsError("invalid-argument", "ownerFirstName is required.");
    }
    const normalizedLastName = normalizeName(ownerLastName);
    if (!normalizedLastName) {
      throw new HttpsError("invalid-argument", "ownerLastName is required.");
    }
    const normalizedPhone = normalizePhone(ownerPhone);
    if (!normalizedPhone) {
      throw new HttpsError(
        "invalid-argument",
        "ownerPhone is required and must be a valid 10-digit US number or E.164 international format."
      );
    }

    // Tenant address: the supervising-authority address. Per-store operational
    // address is collected later from the owner via the cadence-pos onboarding
    // flow. Tenant phone is the ownerPhone; tax % is per-store.
    const normalizedStreet = normalizeStoreString(tenantStreet, 200);
    if (!normalizedStreet) {
      throw new HttpsError("invalid-argument", "tenantStreet is required (≤200 chars).");
    }
    const normalizedUnit = normalizeOptionalStoreString(tenantUnit, 50);
    if (normalizedUnit === null) {
      throw new HttpsError("invalid-argument", "tenantUnit must be a string ≤50 chars.");
    }
    const normalizedCity = normalizeStoreString(tenantCity, 100);
    if (!normalizedCity) {
      throw new HttpsError("invalid-argument", "tenantCity is required (≤100 chars).");
    }
    const normalizedState = normalizeStoreString(tenantState, 2);
    if (!normalizedState || !/^[A-Za-z]{2}$/.test(normalizedState)) {
      throw new HttpsError("invalid-argument", "tenantState must be a 2-letter code.");
    }
    const normalizedZip = normalizeZip(tenantZip);
    if (!normalizedZip) {
      throw new HttpsError("invalid-argument", "tenantZip must be 5 digits or ZIP+4.");
    }

    const normalizedBillingModel = normalizeBillingModel(billingModel);
    if (!normalizedBillingModel) {
      throw new HttpsError(
        "invalid-argument",
        `billingModel is required and must be one of: ${BILLING_MODELS.join(", ")}.`
      );
    }
    const normalizedFeePercent =
      normalizedBillingModel === "per_sale"
        ? normalizePlatformFeePercent(platformFeePercent)
        : null;
    if (normalizedBillingModel === "per_sale" && normalizedFeePercent === null) {
      throw new HttpsError(
        "invalid-argument",
        `platformFeePercent must be a number between 0 and ${PLATFORM_FEE_PERCENT_MAX}.`
      );
    }

    const db = getFirestore();

    // monthly_sub tenants must be created against a specific tier from the
    // catalog. We validate the tier exists + is active here so a tenant
    // can't land in a "monthly_sub but no tier" state. per_sale tenants
    // ignore subscriptionTierID entirely.
    let normalizedTierID = null;
    if (normalizedBillingModel === "monthly_sub") {
      if (!subscriptionTierID || typeof subscriptionTierID !== "string") {
        throw new HttpsError(
          "invalid-argument",
          "subscriptionTierID is required for monthly_sub tenants."
        );
      }
      const tier = await getTierDoc(db, subscriptionTierID, { allowArchived: false });
      normalizedTierID = tier.tierID;
    }

    const tenantRef = db.collection("tenants").doc(tenantID);
    const existing = await tenantRef.get();
    if (existing.exists) {
      throw new HttpsError(
        "already-exists",
        `Tenant ${tenantID} already exists.`
      );
    }

    // Get or create the owner's Auth user. If a user with this email exists,
    // we reuse it — claims will be added (or overwritten). If not, we create
    // a passwordless user; the email-link sign-in establishes the session.
    // On a NEW user we stamp displayName from the provided first/last; on an
    // existing user we don't overwrite their current displayName.
    const displayName = `${normalizedFirstName} ${normalizedLastName}`;
    let ownerUser;
    try {
      ownerUser = await admin.auth().getUserByEmail(normalizedEmail);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        ownerUser = await admin.auth().createUser({
          email: normalizedEmail,
          emailVerified: false,
          displayName,
        });
      } else {
        throw err;
      }
    }

    // Reject if the user is already a member of any tenant — claim collision
    // means they'd need a separate Auth account (per the one-user-one-tenant
    // design). The platform-admin must use a different email.
    const existingClaims = ownerUser.customClaims || {};
    if (existingClaims.tenantID) {
      throw new HttpsError(
        "already-exists",
        `User ${normalizedEmail} is already a member of tenant ${existingClaims.tenantID}.`
      );
    }

    const storeID = generateEAN13Barcode();

    await setUserClaims(ownerUser.uid, {
      tenantID,
      privilege: "owner",
      stores: [storeID],
    });

    // Tenant doc: supervising authority. Holds owner identity, tenant address
    // (the legal/billing address), and billing-model state. Tier is per-store
    // — moved to the store doc below so each store under a multi-store tenant
    // can sit on its own tier (one Stripe Subscription, N Subscription Items).
    await tenantRef.set({
      name: tenantName,
      ownerUID: ownerUser.uid,
      ownerEmail: normalizedEmail,
      ownerFirstName: normalizedFirstName,
      ownerLastName: normalizedLastName,
      ownerPhone: normalizedPhone,
      street: normalizedStreet,
      unit: normalizedUnit,
      city: normalizedCity,
      state: normalizedState.toUpperCase(),
      zip: normalizedZip,
      billingModel: normalizedBillingModel,
      platformFeePercent: normalizedFeePercent,
      subscriptionStatus: null,
      stripeBillingCustomerID: null,
      stripeSubscriptionID: null,
      subscriptionGraceUntil: null,
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
    });

    // Store doc: operational unit. Stubbed with null ops fields — the owner
    // fills these in via the cadence-pos /welcome onboarding flow. Tier is set
    // by the platform admin at create time and is the one thing the tenant
    // owner cannot self-serve. `isSetupComplete: false` gates the rest of the
    // app until onboarding finishes.
    const storeRef = tenantRef.collection("stores").doc(storeID);
    await storeRef.set({
      displayName: null,
      legalName: null,
      street: null,
      unit: null,
      city: null,
      state: null,
      zip: null,
      phone: null,
      supportEmail: null,
      officeEmail: null,
      salesTaxPercent: null,
      logoURL: null,
      subscriptionTierID: normalizedTierID,
      stripeSubscriptionItemID: null,
      stripeSubscriptionPriceID: null,
      isSetupComplete: false,
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
    });

    // Settings doc: SETTINGS_OBJ clone with regenerated IDs but null/empty
    // store-specific overrides. Owner-completion will populate storeInfo +
    // shopContactBlurb + salesTaxPercent.
    const settingsDoc = buildBootstrapSettings({
      tenantID,
      storeID,
      storeDisplayName: null,
      storeAddress: null,
      salesTaxPercent: null,
    });
    await storeRef.collection("settings").doc("settings").set(settingsDoc);

    const signInLink = await admin
      .auth()
      .generateSignInWithEmailLink(normalizedEmail, {
        url: `${INVITE_LANDING_URL}?bootstrap=1`,
        handleCodeInApp: true,
      });

    logger.info("platformAdminCreateTenantCallable: tenant created", {
      tenantID,
      storeID,
      ownerUID: ownerUser.uid,
      createdByUID: auth.uid,
    });

    return {
      success: true,
      tenantID,
      storeID,
      ownerUID: ownerUser.uid,
      ownerEmail: normalizedEmail,
      signInLink,
    };
  }
);

exports.platformAdminCreateStoreCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const {
      tenantID,
      mode,
      sourceStoreID,
      storeDisplayName,
      storeStreet,
      storeUnit,
      storeCity,
      storeState,
      storeZip,
      storePhone,
      salesTaxPercent,
    } = request.data || {};

    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    if (mode !== "fresh" && mode !== "copy") {
      throw new HttpsError(
        "invalid-argument",
        "mode must be 'fresh' or 'copy'."
      );
    }
    if (mode === "copy") {
      if (!sourceStoreID || typeof sourceStoreID !== "string") {
        throw new HttpsError(
          "invalid-argument",
          "sourceStoreID is required when mode is 'copy'."
        );
      }
    }

    const normalizedDisplayName = normalizeStoreString(storeDisplayName, 100);
    if (!normalizedDisplayName) {
      throw new HttpsError(
        "invalid-argument",
        "storeDisplayName is required (≤100 chars)."
      );
    }
    const normalizedStreet = normalizeStoreString(storeStreet, 200);
    if (!normalizedStreet) {
      throw new HttpsError("invalid-argument", "storeStreet is required (≤200 chars).");
    }
    const normalizedUnit = normalizeOptionalStoreString(storeUnit, 50);
    if (normalizedUnit === null) {
      throw new HttpsError("invalid-argument", "storeUnit must be a string ≤50 chars.");
    }
    const normalizedCity = normalizeStoreString(storeCity, 100);
    if (!normalizedCity) {
      throw new HttpsError("invalid-argument", "storeCity is required (≤100 chars).");
    }
    const normalizedState = normalizeStoreString(storeState, 2);
    if (!normalizedState || !/^[A-Za-z]{2}$/.test(normalizedState)) {
      throw new HttpsError("invalid-argument", "storeState must be a 2-letter code.");
    }
    const normalizedZip = normalizeZip(storeZip);
    if (!normalizedZip) {
      throw new HttpsError("invalid-argument", "storeZip must be 5 digits or ZIP+4.");
    }
    const normalizedStorePhone = normalizePhone(storePhone);
    if (!normalizedStorePhone) {
      throw new HttpsError(
        "invalid-argument",
        "storePhone is required and must be a valid 10-digit US number or E.164 international format."
      );
    }
    const normalizedTax = normalizeSalesTaxPercent(salesTaxPercent);
    if (normalizedTax === null) {
      throw new HttpsError(
        "invalid-argument",
        "salesTaxPercent is required and must be a number between 0 and 100."
      );
    }

    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantID);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
    }
    const tenantData = tenantSnap.data() || {};

    let sourceSettings = null;
    if (mode === "copy") {
      const sourceSettingsRef = tenantRef
        .collection("stores")
        .doc(sourceStoreID)
        .collection("settings")
        .doc("settings");
      const sourceSnap = await sourceSettingsRef.get();
      if (!sourceSnap.exists) {
        throw new HttpsError(
          "not-found",
          `Source store ${sourceStoreID} has no settings doc under tenant ${tenantID}.`
        );
      }
      sourceSettings = sourceSnap.data();
    }

    const storeID = generateEAN13Barcode();
    const storeAddress = {
      street: normalizedStreet,
      unit: normalizedUnit,
      city: normalizedCity,
      state: normalizedState.toUpperCase(),
      zip: normalizedZip,
      phone: normalizedStorePhone,
    };

    const overrideParams = {
      tenantID,
      storeID,
      storeDisplayName: normalizedDisplayName,
      storeAddress,
      salesTaxPercent: normalizedTax,
    };
    const settingsDoc =
      mode === "copy"
        ? buildCopiedSettings({ sourceSettings, ...overrideParams })
        : buildBootstrapSettings(overrideParams);

    // Batch the two Firestore writes so a partial store can't exist if the
    // settings write fails. The owner-claims update below is best-effort and
    // not part of this batch (Auth ≠ Firestore).
    const storeRef = tenantRef.collection("stores").doc(storeID);
    const storeMeta = {
      displayName: normalizedDisplayName,
      street: storeAddress.street,
      unit: storeAddress.unit,
      city: storeAddress.city,
      state: storeAddress.state,
      zip: storeAddress.zip,
      phone: storeAddress.phone,
      salesTaxPercent: normalizedTax,
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
    };
    if (mode === "copy") {
      storeMeta.copiedFromStoreID = sourceStoreID;
    }
    const settingsRef = storeRef.collection("settings").doc("settings");
    const batch = db.batch();
    batch.set(storeRef, storeMeta);
    batch.set(settingsRef, settingsDoc);
    await batch.commit();

    // Append the new storeID to the owner's claims.stores. Best-effort —
    // isOwner short-circuits store access in rules, so a flubbed claim
    // update doesn't lock the owner out of the new store.
    let ownerClaimsUpdated = false;
    if (tenantData.ownerUID) {
      try {
        const ownerUser = await admin.auth().getUser(tenantData.ownerUID);
        const existingClaims = ownerUser.customClaims || {};
        const existingStores = Array.isArray(existingClaims.stores)
          ? existingClaims.stores
          : [];
        if (!existingStores.includes(storeID)) {
          await setUserClaims(ownerUser.uid, {
            ...existingClaims,
            stores: [...existingStores, storeID],
          });
          ownerClaimsUpdated = true;
        }
      } catch (err) {
        logger.error(
          "platformAdminCreateStoreCallable: owner claims update failed",
          { tenantID, storeID, ownerUID: tenantData.ownerUID, err }
        );
      }
    }

    logger.info("platformAdminCreateStoreCallable: store created", {
      tenantID,
      storeID,
      mode,
      sourceStoreID: mode === "copy" ? sourceStoreID : null,
      createdByUID: auth.uid,
      ownerClaimsUpdated,
    });

    return {
      success: true,
      tenantID,
      storeID,
      mode,
      ownerClaimsUpdated,
    };
  }
);

// Platform-admin: edit a tenant's billing settings. Phase 1 only supports
// editing platformFeePercent on per_sale tenants — switching billingModel
// mid-flight is not allowed here (proration, payment-method state, sub teardown
// are out of scope for this callable). Add a separate flow when that need
// surfaces.
exports.platformAdminUpdateTenantBillingCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, platformFeePercent } = request.data || {};
    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantID);
    const snap = await tenantRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
    }
    const tenantData = snap.data() || {};
    if (tenantData.billingModel !== "per_sale") {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} is on ${tenantData.billingModel || "no"} billing — platformFeePercent only applies to per_sale tenants.`
      );
    }

    const normalized = normalizePlatformFeePercent(platformFeePercent);
    if (normalized === null) {
      throw new HttpsError(
        "invalid-argument",
        `platformFeePercent must be a number between 0 and ${PLATFORM_FEE_PERCENT_MAX}.`
      );
    }

    await tenantRef.update({ platformFeePercent: normalized });

    logger.info("platformAdminUpdateTenantBillingCallable: updated", {
      tenantID,
      platformFeePercent: normalized,
      uid: auth.uid,
    });

    return { success: true, tenantID, platformFeePercent: normalized };
  }
);

// Platform-admin tenant list for the cadence-dashboard host site. Returns up
// to `limit` tenants (default 100, max 500), ordered by createdAt desc, with
// per-tenant provisioning-status flags pulled from the private/* docs and the
// connect-accounts subcollection. The fan-out is small-N parallel reads —
// acceptable while the tenant count is double-digit; revisit if it grows.
const TENANT_LIST_MAX_FETCH = 500;
const TENANT_LIST_DEFAULT_LIMIT = 100;
const TENANT_LIST_SEARCH_MAX = 100;

// Shared builder so list + detail callables return the same shape. The
// dashboard relies on this — list view paints badges from the same fields the
// detail view drives the provisioning controls off of.
async function buildTenantSummary(db, tenantDoc) {
  const tid = tenantDoc.id;
  const tdata = tenantDoc.data() || {};
  const tenantRef = db.collection("tenants").doc(tid);

  // Tier read is conditional — only fan out the extra read when the tenant
  // is actually on a monthly_sub plan with a recorded tierID. Use a direct
  // doc read (not getTierDoc) so archived/deleted tiers don't throw; the
  // dashboard list view needs to render historical state gracefully.
  const [twilioSnap, a2pSnap, connectSnap, storesCountSnap, emailAuthSnap, tierSnap] =
    await Promise.all([
      tenantRef.collection("private").doc("twilio").get(),
      tenantRef.collection("private").doc("twilio-a2p").get(),
      tenantRef.collection("connect-accounts").limit(1).get(),
      tenantRef.collection("stores").count().get(),
      tenantRef.collection("email-auth").get(),
      tdata.subscriptionTierID
        ? db.collection("platform-billing-tiers").doc(tdata.subscriptionTierID).get()
        : Promise.resolve(null),
    ]);

  const twilioData = twilioSnap.exists ? twilioSnap.data() || {} : {};
  const a2pData = a2pSnap.exists ? a2pSnap.data() || {} : {};
  const connectData = connectSnap.empty
    ? null
    : connectSnap.docs[0].data() || {};
  const tierData = tierSnap && tierSnap.exists ? tierSnap.data() || {} : null;

  // Per-account email summary. Status derives from the cached values written
  // by the OAuth callback / sync / renew-watch handlers in gmail.js. We
  // don't live-ping Google here — too expensive for the list view, and the
  // detail-only platformAdminGetTenantEmailStatus does a deeper check.
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const emailAccounts = emailAuthSnap.docs.map((d) => {
    const data = d.data() || {};
    const watchExp = Number(data.watchExpiration) || 0;
    let derivedStatus = "ok";
    if (data.status === "error") {
      derivedStatus = "error";
    } else if (data.status !== "connected") {
      derivedStatus = "disconnected";
    } else if (!watchExp || watchExp < now) {
      derivedStatus = "watchExpired";
    } else if (watchExp - now < TWO_DAYS_MS) {
      derivedStatus = "watchStale";
    }
    return {
      accountKey: d.id,
      email: data.email || "",
      assignedStoreID: data.assignedStoreID || null,
      status: data.status || null,
      derivedStatus,
      watchExpiration: watchExp || null,
      lastSyncedAt: data.lastSyncedAt || null,
      unreadCount: Number(data.unreadCount) || 0,
      connectedAt: data.connectedAt || null,
    };
  });
  const emailHealthyCount = emailAccounts.filter(
    (a) => a.derivedStatus === "ok"
  ).length;
  const emailIssuesCount = emailAccounts.length - emailHealthyCount;

  const createdAt =
    tdata.createdAt && typeof tdata.createdAt.toMillis === "function"
      ? tdata.createdAt.toMillis()
      : null;

  const subscriptionGraceUntil =
    tdata.subscriptionGraceUntil &&
    typeof tdata.subscriptionGraceUntil.toMillis === "function"
      ? tdata.subscriptionGraceUntil.toMillis()
      : null;

  return {
    tenantID: tid,
    name: tdata.name || "",
    ownerEmail: tdata.ownerEmail || "",
    ownerUID: tdata.ownerUID || "",
    ownerFirstName: tdata.ownerFirstName || "",
    ownerLastName: tdata.ownerLastName || "",
    ownerPhone: tdata.ownerPhone || "",
    createdAt,
    storeCount: storesCountSnap.data().count,
    billing: {
      model: tdata.billingModel || null,
      platformFeePercent:
        typeof tdata.platformFeePercent === "number"
          ? tdata.platformFeePercent
          : null,
      subscriptionStatus: tdata.subscriptionStatus || null,
      subscriptionTierID: tdata.subscriptionTierID || null,
      subscriptionTierLabel: tierData ? tierData.label || null : null,
      subscriptionTierMonthlyAmount:
        tierData && typeof tierData.monthlyAmount === "number"
          ? tierData.monthlyAmount
          : null,
      subscriptionTierArchived: tierData ? tierData.archived === true : false,
      stripeBillingCustomerID: tdata.stripeBillingCustomerID || null,
      stripeSubscriptionID: tdata.stripeSubscriptionID || null,
      stripeSubscriptionPriceID: tdata.stripeSubscriptionPriceID || null,
      subscriptionGraceUntil,
    },
    twilio: {
      hasSubaccount: Boolean(twilioData.subaccountSid),
      subaccountSid: twilioData.subaccountSid || null,
      subaccountStatus: twilioData.status || null,
      a2pBrandStatus: a2pData.brandStatus || null,
      a2pCampaignStatus: a2pData.campaignStatus || null,
    },
    stripe: {
      hasConnect: Boolean(connectData),
      stripeAccountID: connectData ? connectData.stripeAccountID || null : null,
      chargesEnabled: connectData
        ? connectData.chargesEnabled === true
        : false,
      payoutsEnabled: connectData
        ? connectData.payoutsEnabled === true
        : false,
      detailsSubmitted: connectData
        ? connectData.detailsSubmitted === true
        : false,
      requirementsCount: connectData
        ? Array.isArray(connectData.requirementsCurrentlyDue)
          ? connectData.requirementsCurrentlyDue.length
          : 0
        : 0,
      requirementsCurrentlyDue: connectData
        ? Array.isArray(connectData.requirementsCurrentlyDue)
          ? connectData.requirementsCurrentlyDue
          : []
        : [],
    },
    email: {
      accountCount: emailAccounts.length,
      healthyCount: emailHealthyCount,
      issuesCount: emailIssuesCount,
      accounts: emailAccounts,
    },
  };
}

exports.listTenantsCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { search, limit } = request.data || {};

    if (search != null) {
      if (typeof search !== "string" || search.length > TENANT_LIST_SEARCH_MAX) {
        throw new HttpsError(
          "invalid-argument",
          `search must be a string ≤${TENANT_LIST_SEARCH_MAX} chars.`
        );
      }
    }
    const searchLower = search ? search.trim().toLowerCase() : "";

    let cappedLimit = TENANT_LIST_DEFAULT_LIMIT;
    if (limit != null) {
      if (typeof limit !== "number" || !Number.isFinite(limit)) {
        throw new HttpsError("invalid-argument", "limit must be a number.");
      }
      cappedLimit = Math.min(Math.max(Math.floor(limit), 1), TENANT_LIST_MAX_FETCH);
    }

    const db = getFirestore();

    // Always cap the initial scan at TENANT_LIST_MAX_FETCH. If search is set,
    // we filter in-memory afterward and slice to cappedLimit.
    const tenantsSnap = await db
      .collection("tenants")
      .orderBy("createdAt", "desc")
      .limit(TENANT_LIST_MAX_FETCH)
      .get();

    let docs = tenantsSnap.docs;
    if (searchLower) {
      docs = docs.filter((d) => {
        const id = d.id.toLowerCase();
        const name = ((d.data() || {}).name || "").toLowerCase();
        return id.includes(searchLower) || name.includes(searchLower);
      });
    }
    docs = docs.slice(0, cappedLimit);

    const tenants = await Promise.all(
      docs.map((tenantDoc) => buildTenantSummary(db, tenantDoc))
    );

    logger.info("listTenantsCallable: returned tenants", {
      count: tenants.length,
      uid: auth.uid,
    });

    return { success: true, tenants };
  }
);

// Detail variant of listTenantsCallable. Same TenantSummary shape, single
// tenant by ID. Used by cadence-dashboard's tenant detail screen to fetch
// fresh state after a provisioning action (provision/deactivate/close)
// without re-pulling the whole roster. Throws not-found rather than
// returning an empty payload so the dashboard can distinguish a typo'd URL
// from a tenant that just hasn't been provisioned.
exports.getTenantCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID } = request.data || {};
    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    const tenantDoc = await db.collection("tenants").doc(tenantID).get();
    if (!tenantDoc.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
    }

    const tenant = await buildTenantSummary(db, tenantDoc);

    // Detail view also needs per-store rows for the Twilio number UI. Kept
    // OFF the list summary to keep that callable cheap — list view only needs
    // the storeCount, detail view needs the per-store roster.
    const storesSnap = await db
      .collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .get();
    const stores = await Promise.all(
      storesSnap.docs.map(async (sDoc) => {
        const sData = sDoc.data() || {};
        // Read per-number docs (not just count) so we can compute webhook
        // drift inline. Tenants are <20 numbers per store in practice — the
        // read cost is fine for detail view.
        const numbersSnap = await sDoc.ref.collection("twilio").get();
        let webhooksDriftedCount = 0;
        numbersSnap.docs.forEach((n) => {
          const data = n.data() || {};
          // Skip port-in placeholders — no real Twilio number to configure yet.
          if (n.id.startsWith("port-") || !data.phoneNumberSid) return;
          if (!numberWebhooksAreCurrent(data.webhooks)) {
            webhooksDriftedCount += 1;
          }
        });
        const sCreatedAt =
          sData.createdAt && typeof sData.createdAt.toMillis === "function"
            ? sData.createdAt.toMillis()
            : null;
        return {
          storeID: sDoc.id,
          name: sData.displayName || sData.name || "",
          city: sData.city || "",
          state: sData.state || "",
          createdAt: sCreatedAt,
          numberCount: numbersSnap.size,
          webhooksDriftedCount,
        };
      })
    );
    stores.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    tenant.stores = stores;

    logger.info("getTenantCallable: returned tenant", {
      tenantID,
      storeCount: stores.length,
      uid: auth.uid,
    });

    return { success: true, tenant };
  }
);

exports.tenantAdminInviteUserCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPrivilege(auth, "owner");

    const { email, privilege, stores } = request.data || {};

    const tenantID = auth.token.tenantID;
    if (!tenantID) {
      throw new HttpsError(
        "failed-precondition",
        "Caller's token is missing tenantID."
      );
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "email is required.");
    }
    if (!PRIVILEGE_RANK[privilege]) {
      throw new HttpsError(
        "invalid-argument",
        `privilege must be one of: ${PRIVILEGES.join(", ")}.`
      );
    }
    if (privilege !== "owner") {
      if (!Array.isArray(stores) || stores.length === 0) {
        throw new HttpsError(
          "invalid-argument",
          "Non-owner invites must specify at least one storeID."
        );
      }
    }

    const db = getFirestore();
    const token = generateInviteToken();
    const expiresAt = Timestamp.fromMillis(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    await db
      .collection("invites")
      .doc(token)
      .set({
        tenantID,
        email: normalizedEmail,
        privilege,
        stores: privilege === "owner" ? [] : stores,
        token,
        createdAt: FieldValue.serverTimestamp(),
        createdByUID: auth.uid,
        expiresAt,
        redeemed: false,
      });

    const signInLink = await admin
      .auth()
      .generateSignInWithEmailLink(
        normalizedEmail,
        buildActionCodeSettings(token)
      );

    logger.info("tenantAdminInviteUserCallable: invite created", {
      tenantID,
      email: normalizedEmail,
      privilege,
      createdByUID: auth.uid,
    });

    return {
      success: true,
      inviteToken: token,
      signInLink,
      expiresAt: expiresAt.toMillis(),
    };
  }
);

exports.redeemInviteCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);

    const { token } = request.data || {};
    if (!token || typeof token !== "string") {
      throw new HttpsError("invalid-argument", "token is required.");
    }

    const callerEmail = normalizeEmail(auth.token && auth.token.email);
    if (!callerEmail) {
      throw new HttpsError(
        "failed-precondition",
        "Signed-in user has no email; redemption requires email-link sign-in."
      );
    }
    if (auth.token && auth.token.email_verified !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Email must be verified before redeeming an invite."
      );
    }

    const db = getFirestore();
    const inviteRef = db.collection("invites").doc(token);
    const snap = await inviteRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Invite not found or already consumed.");
    }
    const invite = snap.data() || {};

    if (invite.redeemed === true) {
      throw new HttpsError("failed-precondition", "Invite already redeemed.");
    }
    if (invite.expiresAt && invite.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError("failed-precondition", "Invite has expired.");
    }
    if (invite.email !== callerEmail) {
      throw new HttpsError(
        "permission-denied",
        "Invite email does not match the signed-in user."
      );
    }

    // Reject if the user already has a tenant claim — one-user-one-tenant
    // means switching tenants requires a separate Auth account.
    const existing = (await admin.auth().getUser(auth.uid)).customClaims || {};
    if (existing.tenantID && existing.tenantID !== invite.tenantID) {
      throw new HttpsError(
        "failed-precondition",
        `User is already a member of tenant ${existing.tenantID}. Use a different email.`
      );
    }

    await setUserClaims(auth.uid, {
      tenantID: invite.tenantID,
      privilege: invite.privilege,
      stores: invite.stores || [],
    });

    await inviteRef.update({
      redeemed: true,
      redeemedAt: FieldValue.serverTimestamp(),
      redeemedByUID: auth.uid,
    });

    logger.info("redeemInviteCallable: invite redeemed", {
      tenantID: invite.tenantID,
      privilege: invite.privilege,
      uid: auth.uid,
    });

    return {
      success: true,
      tenantID: invite.tenantID,
      privilege: invite.privilege,
      stores: invite.stores || [],
    };
  }
);
