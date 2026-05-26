/* eslint-disable */
// Phase 5 — Refund callable for Stripe Connect direct charges.
//
// Issues a refund against a charge on a connected account. The actual
// state updates (transactions doc refunds array, workorder changelog
// entry) happen in the subscriber via the `charge.refunded` webhook
// handler so that refunds issued directly from the Stripe Dashboard
// (not via this callable) also stay in sync.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const Stripe = require("stripe");
const { assertTenantMatch, lookupTenantForConnectAccount } = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

exports.stripeRefundChargeCallable_V2 = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const {
      chargeID,
      connectAccountID,
      amount,
      reason,
      refundApplicationFee,
      tenantID,
      storeID,
      transactionID,
      workorderID,
    } = request.data || {};

    if (!chargeID || typeof chargeID !== "string") {
      throw new HttpsError("invalid-argument", "chargeID is required.");
    }
    if (!connectAccountID || typeof connectAccountID !== "string") {
      throw new HttpsError("invalid-argument", "connectAccountID is required.");
    }
    if (amount != null && (typeof amount !== "number" || amount <= 0)) {
      throw new HttpsError(
        "invalid-argument",
        "amount, if provided, must be a positive number in cents."
      );
    }
    if (reason && !["duplicate", "fraudulent", "requested_by_customer"].includes(reason)) {
      throw new HttpsError(
        "invalid-argument",
        "reason must be one of: duplicate, fraudulent, requested_by_customer."
      );
    }
    const ownerTenantID = await lookupTenantForConnectAccount(connectAccountID);
    assertTenantMatch(auth, ownerTenantID);
    if (tenantID && tenantID !== ownerTenantID) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID does not match the Connect account's owning tenant."
      );
    }

    logger.info("stripeRefundChargeCallable_V2: starting", {
      chargeID,
      connectAccountID,
      amount: amount || "full",
      reason: reason || null,
      uid: auth.uid,
    });

    const stripe = new Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
    const stripeOpts = { stripeAccount: connectAccountID };

    const refundParams = {
      charge: chargeID,
      metadata: {
        tenantID: tenantID || "",
        storeID: storeID || "",
        transactionID: transactionID || "",
        workorderID: workorderID || "",
        issuedByUID: auth.uid,
      },
    };
    if (amount) refundParams.amount = amount;
    if (reason) refundParams.reason = reason;
    if (refundApplicationFee != null) {
      refundParams.refund_application_fee = refundApplicationFee === true;
    }

    let refund;
    try {
      refund = await stripe.refunds.create(refundParams, stripeOpts);
    } catch (err) {
      logger.error("stripeRefundChargeCallable_V2: stripe refund failed", {
        chargeID,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Refund failed.");
    }

    logger.info("stripeRefundChargeCallable_V2: refund issued", {
      refundID: refund.id,
      chargeID,
      amount: refund.amount,
      status: refund.status,
    });

    return {
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason,
        created: refund.created,
        charge: refund.charge,
      },
    };
  }
);
