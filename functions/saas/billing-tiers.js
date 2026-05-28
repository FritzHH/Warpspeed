/* eslint-disable */
// Phase 3 — Billing tier catalog (platform-admin CRUD).
//
// Tiers live at `platform-billing-tiers/{tierID}` and reference an immutable
// Stripe Price object via `stripePriceID`. To "change a tier's price", create
// a NEW Price in Stripe → register a NEW tier doc → migrate tenants → archive
// the old tier (we never delete; archived tier docs survive because tenants
// may still reference them historically).
//
// All callables here are platform-admin only.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const Stripe = require("stripe");
const { assertPlatformAdmin } = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");

const TIER_COLLECTION = "platform-billing-tiers";
const LABEL_MAX = 60;
const DESC_MAX = 500;
const SORT_MAX = 10000;
const AMOUNT_MIN_CENTS = 1;
const AMOUNT_MAX_CENTS = 100_000_00; // $100k/mo sanity ceiling

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

function getStripe() {
  return new Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
}

function generateTierID() {
  // Random 24-char hex — distinct from tenant/store IDs which are EAN-13.
  return crypto.randomBytes(12).toString("hex");
}

function normalizeString(value, maxLen, { required = true, fieldName = "value" } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new HttpsError("invalid-argument", `${fieldName} is required.`);
    }
    return "";
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  if (trimmed.length > maxLen) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be ≤${maxLen} chars.`
    );
  }
  return trimmed;
}

function normalizePriceID(value) {
  const id = normalizeString(value, 100, { fieldName: "stripePriceID" });
  if (!/^price_[A-Za-z0-9]+$/.test(id)) {
    throw new HttpsError(
      "invalid-argument",
      "stripePriceID must look like 'price_xxx' (from Stripe Dashboard)."
    );
  }
  return id;
}

function normalizeAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new HttpsError(
      "invalid-argument",
      "monthlyAmount must be an integer number of cents."
    );
  }
  if (num < AMOUNT_MIN_CENTS || num > AMOUNT_MAX_CENTS) {
    throw new HttpsError(
      "invalid-argument",
      `monthlyAmount must be between ${AMOUNT_MIN_CENTS} and ${AMOUNT_MAX_CENTS} cents.`
    );
  }
  return num;
}

function normalizeCurrency(value) {
  if (value === undefined || value === null || value === "") return "usd";
  const c = normalizeString(value, 3, { fieldName: "currency" });
  return c.toLowerCase();
}

function normalizeSortOrder(value) {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new HttpsError("invalid-argument", "sortOrder must be an integer.");
  }
  if (num < 0 || num > SORT_MAX) {
    throw new HttpsError(
      "invalid-argument",
      `sortOrder must be between 0 and ${SORT_MAX}.`
    );
  }
  return num;
}

function serializeTier(doc) {
  const data = doc.data() || {};
  return {
    tierID: doc.id,
    label: data.label || "",
    description: data.description || "",
    stripePriceID: data.stripePriceID || "",
    monthlyAmount: typeof data.monthlyAmount === "number" ? data.monthlyAmount : 0,
    currency: data.currency || "usd",
    active: data.active === true,
    archived: data.archived === true,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    createdAt:
      data.createdAt && typeof data.createdAt.toMillis === "function"
        ? data.createdAt.toMillis()
        : null,
    updatedAt:
      data.updatedAt && typeof data.updatedAt.toMillis === "function"
        ? data.updatedAt.toMillis()
        : null,
  };
}

exports.platformAdminListBillingTiersCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const db = getFirestore();
    const snap = await db
      .collection(TIER_COLLECTION)
      .orderBy("sortOrder", "asc")
      .get();

    const tiers = snap.docs.map(serializeTier);

    logger.info("platformAdminListBillingTiersCallable: returned tiers", {
      count: tiers.length,
      uid: auth.uid,
    });

    return { success: true, tiers };
  }
);

// Lists active recurring Prices on the platform Stripe account, expanded with
// their parent Product. Used by the dashboard tier-form to populate a picker
// so admins don't transcribe Price IDs by hand. Returns prices of any
// recurring interval; the form filters to monthly itself.
exports.platformAdminListStripePricesCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const stripe = getStripe();
    const all = [];
    let startingAfter;
    // Defensive pagination cap: 5 pages × 100 = 500 Prices. A platform with
    // more recurring Prices than that should narrow the picker server-side.
    for (let i = 0; i < 5; i++) {
      const params = {
        limit: 100,
        active: true,
        type: "recurring",
        expand: ["data.product"],
      };
      if (startingAfter) params.starting_after = startingAfter;
      const page = await stripe.prices.list(params);
      all.push(...page.data);
      if (!page.has_more) break;
      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    const prices = all.map((p) => {
      const product = typeof p.product === "object" ? p.product : null;
      return {
        id: p.id,
        productID: product?.id || (typeof p.product === "string" ? p.product : ""),
        productName: product?.name || "",
        productDescription: product?.description || "",
        productActive: product?.active !== false,
        unitAmount: typeof p.unit_amount === "number" ? p.unit_amount : null,
        currency: p.currency || "",
        interval: p.recurring?.interval || "",
        intervalCount: p.recurring?.interval_count || 1,
        nickname: p.nickname || "",
        livemode: p.livemode === true,
      };
    });

    logger.info("platformAdminListStripePricesCallable: returned prices", {
      count: prices.length,
      uid: auth.uid,
    });

    return { success: true, prices };
  }
);

// Create a new tier. Validates the Stripe Price exists on the platform account
// and matches `monthlyAmount` + `currency`. We refuse on amount mismatch so an
// admin can't accidentally bind a tier label to a Price with the wrong amount.
exports.platformAdminCreateBillingTierCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const data = request.data || {};
    const label = normalizeString(data.label, LABEL_MAX, { fieldName: "label" });
    const description = normalizeString(data.description, DESC_MAX, {
      required: false,
      fieldName: "description",
    });
    const stripePriceID = normalizePriceID(data.stripePriceID);
    const monthlyAmount = normalizeAmount(data.monthlyAmount);
    const currency = normalizeCurrency(data.currency);
    const sortOrder = normalizeSortOrder(data.sortOrder);

    const stripe = getStripe();
    let price;
    try {
      price = await stripe.prices.retrieve(stripePriceID);
    } catch (err) {
      logger.error("platformAdminCreateBillingTierCallable: price retrieve failed", {
        stripePriceID,
        error: err && err.message,
      });
      throw new HttpsError(
        "failed-precondition",
        `Stripe Price ${stripePriceID} not found on the platform account: ${err.message || err}`
      );
    }

    if (price.active !== true) {
      throw new HttpsError(
        "failed-precondition",
        `Stripe Price ${stripePriceID} is not active. Activate it in Stripe Dashboard first.`
      );
    }
    if (!price.recurring || price.recurring.interval !== "month") {
      throw new HttpsError(
        "failed-precondition",
        "Stripe Price must be a monthly recurring price."
      );
    }
    if (price.unit_amount !== monthlyAmount) {
      throw new HttpsError(
        "failed-precondition",
        `Stripe Price amount (${price.unit_amount}) does not match monthlyAmount (${monthlyAmount}).`
      );
    }
    if (price.currency !== currency) {
      throw new HttpsError(
        "failed-precondition",
        `Stripe Price currency (${price.currency}) does not match currency (${currency}).`
      );
    }

    const db = getFirestore();

    // Refuse if any existing tier already binds this Price ID — duplicate
    // tiers pointing at the same Price are user error and confuse the picker.
    const dupeSnap = await db
      .collection(TIER_COLLECTION)
      .where("stripePriceID", "==", stripePriceID)
      .limit(1)
      .get();
    if (!dupeSnap.empty) {
      throw new HttpsError(
        "already-exists",
        `A tier already binds stripePriceID ${stripePriceID}. Edit or archive the existing tier instead.`
      );
    }

    const tierID = generateTierID();
    const tierRef = db.collection(TIER_COLLECTION).doc(tierID);
    await tierRef.set({
      label,
      description,
      stripePriceID,
      monthlyAmount,
      currency,
      active: true,
      archived: false,
      sortOrder,
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const snap = await tierRef.get();
    logger.info("platformAdminCreateBillingTierCallable: tier created", {
      tierID,
      stripePriceID,
      monthlyAmount,
      uid: auth.uid,
    });

    return { success: true, tier: serializeTier(snap) };
  }
);

// Edit a tier's label/description/sortOrder/active. stripePriceID and
// monthlyAmount are deliberately NOT editable — to change the price, create
// a new tier and archive this one.
exports.platformAdminUpdateBillingTierCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const data = request.data || {};
    const tierID = normalizeString(data.tierID, 100, { fieldName: "tierID" });

    const db = getFirestore();
    const tierRef = db.collection(TIER_COLLECTION).doc(tierID);
    const snap = await tierRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", `Tier ${tierID} not found.`);
    }
    const current = snap.data() || {};

    const updates = { updatedAt: FieldValue.serverTimestamp() };
    if (data.label !== undefined) {
      updates.label = normalizeString(data.label, LABEL_MAX, { fieldName: "label" });
    }
    if (data.description !== undefined) {
      updates.description = normalizeString(data.description, DESC_MAX, {
        required: false,
        fieldName: "description",
      });
    }
    if (data.sortOrder !== undefined) {
      updates.sortOrder = normalizeSortOrder(data.sortOrder);
    }
    if (data.active !== undefined) {
      if (typeof data.active !== "boolean") {
        throw new HttpsError("invalid-argument", "active must be boolean.");
      }
      if (data.active === true && current.archived === true) {
        throw new HttpsError(
          "failed-precondition",
          "Cannot activate an archived tier. Create a new tier instead."
        );
      }
      updates.active = data.active;
    }

    await tierRef.update(updates);
    const fresh = await tierRef.get();

    logger.info("platformAdminUpdateBillingTierCallable: tier updated", {
      tierID,
      updates: Object.keys(updates),
      uid: auth.uid,
    });

    return { success: true, tier: serializeTier(fresh) };
  }
);

// Archive a tier — sets archived: true, active: false. Never deletes the doc
// because tenants may still reference it historically (subscriptionTierID
// preserves audit trail).
exports.platformAdminArchiveBillingTierCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const data = request.data || {};
    const tierID = normalizeString(data.tierID, 100, { fieldName: "tierID" });

    const db = getFirestore();
    const tierRef = db.collection(TIER_COLLECTION).doc(tierID);
    const snap = await tierRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", `Tier ${tierID} not found.`);
    }
    const current = snap.data() || {};
    if (current.archived === true) {
      return { success: true, tier: serializeTier(snap), alreadyArchived: true };
    }

    await tierRef.update({
      archived: true,
      active: false,
      archivedAt: FieldValue.serverTimestamp(),
      archivedByUID: auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const fresh = await tierRef.get();

    logger.info("platformAdminArchiveBillingTierCallable: tier archived", {
      tierID,
      uid: auth.uid,
    });

    return { success: true, tier: serializeTier(fresh) };
  }
);
