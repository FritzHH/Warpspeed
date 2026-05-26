/* eslint-disable */
// Phase 8 — LinkToPay V2 (Stripe Checkout Session via Connect direct charges).
//
// Creates a Stripe Checkout Session on a connected account so a customer
// can pay remotely via a link (sent over SMS/email by the caller). The
// session's resulting PaymentIntent is platform-aware: application_fee_amount
// carves out the platform cut, refunds & disputes route through the same
// `stripeAccount` header.
//
// Backend-only scope: this callable owns the Stripe session + a routing
// cache. The caller is responsible for: writing the sale doc, sending the
// link via SMS/email, displaying success/cancel pages. Keeps the function
// focused on the Connect primitive.
//
// On `checkout.session.completed`, the subscriber (pubsub-subscriber.js)
// reads the routing cache, writes a `payment-intents/{piID}` entry (so any
// subsequent refunds/disputes route correctly), and updates the sale doc.
// On `checkout.session.expired`, the subscriber flips the sale to expired.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");
const { assertTenantMatch } = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");

const DEFAULT_EXPIRY_SECONDS = 86400; // 24h — matches Stripe min/default
const DEFAULT_SUCCESS_URL = "https://cadence-pos.web.app/payment-success";
const DEFAULT_CANCEL_URL = "https://cadence-pos.web.app/payment-cancelled";

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

exports.stripeConnectCreateCheckoutSessionV2 = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const {
      connectAccountID,
      tenantID,
      storeID,
      amount,
      currency,
      productName,
      saleID,
      workorderID,
      customerID,
      customerEmail,
      applicationFeeAmount,
      successURL,
      cancelURL,
      expiresInSeconds,
    } = request.data || {};

    if (!connectAccountID || typeof connectAccountID !== "string") {
      throw new HttpsError("invalid-argument", "connectAccountID is required.");
    }
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required.");
    }
    assertTenantMatch(auth, tenantID);
    if (!amount || typeof amount !== "number" || amount <= 0) {
      throw new HttpsError("invalid-argument", "amount (positive cents) is required.");
    }
    if (!productName || typeof productName !== "string") {
      throw new HttpsError("invalid-argument", "productName is required.");
    }
    if (
      applicationFeeAmount != null &&
      (typeof applicationFeeAmount !== "number" ||
        applicationFeeAmount < 0 ||
        applicationFeeAmount >= amount)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "applicationFeeAmount must be a non-negative number less than amount."
      );
    }

    const db = getFirestore();

    // Same deauthorize gate as the PI callable — refuse to issue a checkout
    // session if Stripe has revoked our access to this connected account.
    const accountDocSnap = await db
      .collection("tenants")
      .doc(tenantID)
      .collection("connect-accounts")
      .doc(connectAccountID)
      .get();
    if (accountDocSnap.exists) {
      const accountDoc = accountDocSnap.data() || {};
      if (accountDoc.status === "deauthorized") {
        throw new HttpsError(
          "failed-precondition",
          "Connected account has been deauthorized. Reconnect Stripe to accept payments."
        );
      }
    }

    const stripe = getStripe();
    const stripeOpts = { stripeAccount: connectAccountID };

    const expiresAtUnix =
      Math.floor(Date.now() / 1000) + (expiresInSeconds || DEFAULT_EXPIRY_SECONDS);

    const piMetadata = {
      tenantID,
      storeID,
      connectAccountID,
      saleID: saleID || "",
      workorderID: workorderID || "",
      customerID: customerID || "",
      originatedByUID: auth.uid,
      source: "checkout-session-v2",
    };

    const sessionParams = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency || "usd",
            unit_amount: amount,
            product_data: { name: productName },
          },
          quantity: 1,
        },
      ],
      metadata: {
        tenantID,
        storeID,
        connectAccountID,
        saleID: saleID || "",
        workorderID: workorderID || "",
        customerID: customerID || "",
      },
      payment_intent_data: {
        metadata: piMetadata,
      },
      expires_at: expiresAtUnix,
      success_url: successURL || DEFAULT_SUCCESS_URL,
      cancel_url: cancelURL || DEFAULT_CANCEL_URL,
    };
    if (applicationFeeAmount && applicationFeeAmount > 0) {
      sessionParams.payment_intent_data.application_fee_amount = applicationFeeAmount;
    }
    if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    logger.info("stripeConnectCreateCheckoutSessionV2: creating", {
      connectAccountID,
      tenantID,
      storeID,
      amount,
      saleID: saleID || null,
      workorderID: workorderID || null,
      uid: auth.uid,
    });

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams, stripeOpts);
    } catch (err) {
      logger.error("stripeConnectCreateCheckoutSessionV2: stripe create failed", {
        connectAccountID,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Checkout session create failed.");
    }

    // Routing cache — keyed by sessionID so the webhook subscriber can look
    // up tenant/store/sale/workorder without re-reading session metadata or
    // calling Stripe back.
    await db
      .collection("checkout-sessions")
      .doc(session.id)
      .set({
        tenantID,
        storeID,
        connectAccountID,
        saleID: saleID || null,
        workorderID: workorderID || null,
        customerID: customerID || null,
        amount,
        applicationFeeAmount: applicationFeeAmount || 0,
        currency: currency || "usd",
        productName,
        expiresAt: expiresAtUnix,
        status: "open",
        createdAt: FieldValue.serverTimestamp(),
        createdByUID: auth.uid,
      });

    logger.info("stripeConnectCreateCheckoutSessionV2: session created", {
      sessionID: session.id,
      tenantID,
      storeID,
      url: session.url,
    });

    return {
      success: true,
      sessionID: session.id,
      url: session.url,
      expiresAt: expiresAtUnix,
    };
  }
);
