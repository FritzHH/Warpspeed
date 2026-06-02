/* eslint-disable */
// Platform-wide billing config doc at `platform-billing/config`.
//
// Read by all SaaS billing pipelines that need a platform default
// (currently SMS markup; future per-sale fee defaults, etc.). Per-tenant
// overrides live on the tenant doc and are edited on the tenant detail
// screen — this file is for the platform defaults only.
//
// Both callables are platform-admin only. The doc is created lazily on
// first write via `set(..., { merge: true })`; if the doc doesn't exist
// when read, the pipeline falls back to hardcoded defaults from
// sms-billing-helpers.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { assertPlatformAdmin } = require("./auth-guards");
const {
  PLATFORM_BILLING_COLLECTION,
  PLATFORM_BILLING_CONFIG_DOC,
  DEFAULT_SMS_MARKUP_MULTIPLIER,
} = require("./sms-billing-helpers");

if (!admin.apps.length) admin.initializeApp();

const SMS_MARKUP_MULTIPLIER_MAX = 5;

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

function serializeConfig(snap) {
  const data = (snap && snap.exists && snap.data()) || {};
  const smsRaw = Number(data.smsMarkupMultiplier);
  const smsMarkupMultiplier =
    Number.isFinite(smsRaw) && smsRaw > 0 ? smsRaw : null;
  return {
    smsMarkupMultiplier,
    smsMarkupMultiplierDefault: DEFAULT_SMS_MARKUP_MULTIPLIER,
    smsMarkupMultiplierMax: SMS_MARKUP_MULTIPLIER_MAX,
    updatedAt:
      data.updatedAt && typeof data.updatedAt.toMillis === "function"
        ? data.updatedAt.toMillis()
        : null,
    updatedBy: data.updatedBy || null,
  };
}

function normalizeSmsMarkupMultiplier(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || num > SMS_MARKUP_MULTIPLIER_MAX) {
    return null;
  }
  return num;
}

exports.platformAdminGetBillingConfigCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);
    const db = getFirestore();
    const snap = await db
      .collection(PLATFORM_BILLING_COLLECTION)
      .doc(PLATFORM_BILLING_CONFIG_DOC)
      .get();
    return { success: true, config: serializeConfig(snap) };
  }
);

exports.platformAdminUpdateBillingConfigCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const data = request.data || {};
    const update = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: auth.uid,
    };
    const touched = [];

    if (Object.prototype.hasOwnProperty.call(data, "smsMarkupMultiplier")) {
      const v = data.smsMarkupMultiplier;
      if (v === undefined || v === null || v === "") {
        update.smsMarkupMultiplier = FieldValue.delete();
      } else {
        const normalized = normalizeSmsMarkupMultiplier(v);
        if (normalized === null) {
          throw new HttpsError(
            "invalid-argument",
            `smsMarkupMultiplier must be a number between 0 (exclusive) and ${SMS_MARKUP_MULTIPLIER_MAX}, or empty to inherit the hardcoded default of ${DEFAULT_SMS_MARKUP_MULTIPLIER}.`
          );
        }
        update.smsMarkupMultiplier = normalized;
      }
      touched.push("smsMarkupMultiplier");
    }

    if (touched.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "No editable fields provided."
      );
    }

    const db = getFirestore();
    const ref = db
      .collection(PLATFORM_BILLING_COLLECTION)
      .doc(PLATFORM_BILLING_CONFIG_DOC);
    await ref.set(update, { merge: true });
    const snap = await ref.get();
    logger.info("platformAdminUpdateBillingConfigCallable: updated config", {
      uid: auth.uid,
      fields: touched,
    });
    return { success: true, config: serializeConfig(snap) };
  }
);
