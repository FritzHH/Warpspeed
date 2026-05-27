/* eslint-disable */
// Phase 3 — V2 PaymentIntent callables for Stripe Connect direct charges.
//
// Direct-charge pattern: the PI is created on the connected account (via
// the stripeAccount header), application_fee_amount carves out the platform
// cut, the reader (registered to that same connected account) processes it
// naturally. Refunds and cancels use the same stripeAccount header.
//
// At creation time we write a `payment-intents/{piID}` cache entry holding
// the routing info (tenantID, storeID, connectAccountID, saleID, etc.) so
// the Phase 4 webhook can look up where to write status without hitting
// Stripe again.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
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

function getStripe() {
  return new Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
}

exports.stripeConnectInitiatePaymentIntentV2 = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
    // TODO(production): re-enable `minInstances: 1` before going live —
    // keeps one warm instance to avoid cold-start lag on the cashier's
    // critical path.
  },
  async (request) => {
    const auth = requireAuth(request);

    const {
      amount,
      readerID,
      connectAccountID,
      tenantID,
      storeID,
      paymentIntentID,
      saleID,
      workorderID,
      customerID,
      customerEmail,
      transactionID,
      salesTax,
      applicationFeeAmount,
    } = request.data || {};

    if (!amount || typeof amount !== "number" || amount <= 0) {
      throw new HttpsError("invalid-argument", "amount (positive cents) is required.");
    }
    if (!readerID || typeof readerID !== "string") {
      throw new HttpsError("invalid-argument", "readerID is required.");
    }
    if (!connectAccountID || typeof connectAccountID !== "string") {
      throw new HttpsError("invalid-argument", "connectAccountID is required.");
    }
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required.");
    }
    assertTenantMatch(auth, tenantID);
    if (
      applicationFeeAmount != null &&
      (typeof applicationFeeAmount !== "number" || applicationFeeAmount < 0 || applicationFeeAmount >= amount)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "applicationFeeAmount must be a non-negative number less than amount."
      );
    }

    const db = getFirestore();

    // Refuse to create a PI on a deauthorized connected account. The
    // subscriber sets `status: "deauthorized"` on this doc when Stripe
    // fires `account.application.deauthorized`. Any other status (or no
    // doc at all) is allowed through — Stripe will be the final authority
    // if the account is restricted for some other reason.
    const accountDocSnap = await db
      .collection("tenants")
      .doc(tenantID)
      .collection("connect-accounts")
      .doc(connectAccountID)
      .get();
    if (accountDocSnap.exists) {
      const accountDoc = accountDocSnap.data() || {};
      if (accountDoc.status === "deauthorized") {
        logger.warn("stripeConnectInitiatePaymentIntentV2: refusing — account deauthorized", {
          tenantID,
          connectAccountID,
        });
        throw new HttpsError(
          "failed-precondition",
          "Connected account has been deauthorized. Reconnect Stripe to accept payments."
        );
      }
    }

    const stripe = getStripe();
    const stripeOpts = { stripeAccount: connectAccountID };

    logger.info("stripeConnectInitiatePaymentIntentV2: starting", {
      tenantID,
      storeID,
      connectAccountID,
      readerID,
      amount,
      uid: auth.uid,
    });

    let reader;
    try {
      reader = await stripe.terminal.readers.retrieve(readerID, stripeOpts);
    } catch (err) {
      throw new HttpsError("not-found", `Reader ${readerID} not found on connected account.`);
    }

    if (reader.status && reader.status !== "online") {
      throw new HttpsError("unavailable", "Terminal is offline or unreachable.");
    }
    if (reader.action && reader.action.type) {
      const action = reader.action;
      if (action.type === "process_payment_intent") {
        const currentPiID = action.process_payment_intent?.payment_intent || null;
        throw new HttpsError(
          "resource-exhausted",
          currentPiID
            ? `Reader is currently processing payment ${currentPiID}.`
            : "Reader is currently processing a different payment."
        );
      }
      throw new HttpsError(
        "resource-exhausted",
        `Reader is busy (${action.type}). Please wait or cancel current action.`
      );
    }

    let paymentIntent;
    if (!paymentIntentID) {
      const piParams = {
        amount,
        currency: "usd",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        metadata: {
          tenantID,
          storeID,
          connectAccountID,
          saleID: saleID || "",
          workorderID: workorderID || "",
          customerID: customerID || "",
          transactionID: transactionID || "",
          salesTax: String(salesTax || 0),
        },
      };
      if (applicationFeeAmount && applicationFeeAmount > 0) {
        piParams.application_fee_amount = applicationFeeAmount;
      }
      if (customerEmail) piParams.receipt_email = customerEmail;
      paymentIntent = await stripe.paymentIntents.create(piParams, stripeOpts);
    } else {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentID, stripeOpts);
    }

    await db
      .collection("payment-intents")
      .doc(paymentIntent.id)
      .set({
        tenantID,
        storeID,
        connectAccountID,
        readerID,
        saleID: saleID || null,
        workorderID: workorderID || null,
        customerID: customerID || null,
        transactionID: transactionID || null,
        salesTax: salesTax || 0,
        amount,
        applicationFeeAmount: applicationFeeAmount || 0,
        status: paymentIntent.status,
        createdAt: FieldValue.serverTimestamp(),
        createdByUID: auth.uid,
      });

    const processedIntent = await stripe.terminal.readers.processPaymentIntent(
      readerID,
      { payment_intent: paymentIntent.id },
      stripeOpts
    );

    const processedPaymentIntentID =
      processedIntent.action.process_payment_intent.payment_intent;

    logger.info("stripeConnectInitiatePaymentIntentV2: started", {
      paymentIntentID: processedPaymentIntentID,
      tenantID,
      storeID,
    });

    return {
      success: true,
      message: `Payment of $${(amount / 100).toFixed(2)} initiated.`,
      data: {
        paymentIntentID: processedPaymentIntentID,
        readerID: processedIntent.id,
        status: processedIntent.status,
        pollingConfig: {
          enabled: true,
          pollingInterval: 3000,
          maxPollingTime: 300000,
          timeoutMessage: "Payment processing timeout - please check reader status",
          fallbackEnabled: true,
        },
      },
    };
  }
);

// TTPi (Tap to Pay on iPhone) PI creation. Unlike the server-driven flow,
// the JS Terminal SDK on the iPhone collects + processes the PI locally.
// We create the PI on the connected account, write the cache doc so the
// webhook can route status updates, and return the client_secret. No
// `terminal.readers.processPaymentIntent` call — the SDK does that part.
exports.stripeConnectCreateTapToPayPaymentIntentCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const {
      amount,
      connectAccountID,
      tenantID,
      storeID,
      saleID,
      workorderID,
      customerID,
      customerEmail,
      transactionID,
      salesTax,
      applicationFeeAmount,
    } = request.data || {};

    if (!amount || typeof amount !== "number" || amount <= 0) {
      throw new HttpsError("invalid-argument", "amount (positive cents) is required.");
    }
    if (!connectAccountID || typeof connectAccountID !== "string") {
      throw new HttpsError("invalid-argument", "connectAccountID is required.");
    }
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required.");
    }
    assertTenantMatch(auth, tenantID);
    if (
      applicationFeeAmount != null &&
      (typeof applicationFeeAmount !== "number" || applicationFeeAmount < 0 || applicationFeeAmount >= amount)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "applicationFeeAmount must be a non-negative number less than amount."
      );
    }

    const db = getFirestore();

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

    const piParams = {
      amount,
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      metadata: {
        tenantID,
        storeID,
        connectAccountID,
        saleID: saleID || "",
        workorderID: workorderID || "",
        customerID: customerID || "",
        transactionID: transactionID || "",
        salesTax: String(salesTax || 0),
        flow: "tap_to_pay",
      },
    };
    if (applicationFeeAmount && applicationFeeAmount > 0) {
      piParams.application_fee_amount = applicationFeeAmount;
    }
    if (customerEmail) piParams.receipt_email = customerEmail;

    const paymentIntent = await stripe.paymentIntents.create(piParams, stripeOpts);

    await db
      .collection("payment-intents")
      .doc(paymentIntent.id)
      .set({
        tenantID,
        storeID,
        connectAccountID,
        readerID: null,
        flow: "tap_to_pay",
        saleID: saleID || null,
        workorderID: workorderID || null,
        customerID: customerID || null,
        transactionID: transactionID || null,
        salesTax: salesTax || 0,
        amount,
        applicationFeeAmount: applicationFeeAmount || 0,
        status: paymentIntent.status,
        createdAt: FieldValue.serverTimestamp(),
        createdByUID: auth.uid,
      });

    logger.info("stripeConnectCreateTapToPayPaymentIntentCallable: created", {
      paymentIntentID: paymentIntent.id,
      tenantID,
      storeID,
      connectAccountID,
    });

    return {
      success: true,
      message: `Tap to Pay payment intent for $${(amount / 100).toFixed(2)} created.`,
      data: {
        paymentIntentID: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
      },
    };
  }
);

exports.stripeConnectCancelPaymentIntentV2 = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const { readerID, connectAccountID, paymentIntentID } = request.data || {};

    if (!readerID || typeof readerID !== "string") {
      throw new HttpsError("invalid-argument", "readerID is required.");
    }
    if (!connectAccountID || typeof connectAccountID !== "string") {
      throw new HttpsError("invalid-argument", "connectAccountID is required.");
    }
    const ownerTenantID = await lookupTenantForConnectAccount(connectAccountID);
    assertTenantMatch(auth, ownerTenantID);

    const stripe = getStripe();
    const stripeOpts = { stripeAccount: connectAccountID };

    logger.info("stripeConnectCancelPaymentIntentV2: starting", {
      readerID,
      connectAccountID,
      paymentIntentID: paymentIntentID || null,
    });

    const readerBefore = await stripe.terminal.readers.retrieve(readerID, stripeOpts);
    if (readerBefore.status !== "online") {
      throw new HttpsError("unavailable", "Reader is offline or unreachable.");
    }

    const readerAfter = await stripe.terminal.readers.cancelAction(readerID, stripeOpts);

    if (paymentIntentID) {
      try {
        await stripe.paymentIntents.cancel(paymentIntentID, {}, stripeOpts);
      } catch (err) {
        // PI may already be cancelled / not-cancelable; reader-side cancel is the
        // primary outcome we care about. Log and continue.
        logger.warn("stripeConnectCancelPaymentIntentV2: PI cancel failed (continuing)", {
          paymentIntentID,
          error: err && err.message,
        });
      }
    }

    return {
      success: true,
      message: "Reader reset complete.",
      data: {
        readerID: readerAfter.id,
        readerStatus: readerAfter.status,
      },
    };
  }
);
