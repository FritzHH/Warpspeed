/* eslint-disable */
const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
// const ftp = require("basic-ftp");cd..
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const { onInit } = require("firebase-functions/v2/core");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const fetch = require("node-fetch");
const sharp = require("sharp");
const twilio = require("twilio");
const { printBuilder: sharedPrintBuilder } = require("./shared/printBuilder");
const {
  generateSaleReceiptPDF,
  generateRefundReceiptPDF,
  generateCreditReceiptPDF,
  generateGiftCardReceiptPDF,
  generateWorkorderTicketPDF,
  generateTransactionReceiptPDF,
} = require("./pdfGenerator");
const {
  findTemplateByType,
  applyVars,
  buildEmailFromTemplate,
  getTemplateType,
  getDefaultSMSMessage,
} = require("./communicationUtils");
const {
  withFeatureTracking,
  withFeatureTrackingHttp,
  withFeatureTrackingSchedule,
} = require("./usageTracking");

// ═══════════════════════════════════════════════════════════════
// DEPLOY TARGET RESOLUTION
// ═══════════════════════════════════════════════════════════════
// Resolves which tenant's codebase to load: "bonita" (single-tenant
// direct charges) or "saas" (multi-tenant Connect + Pub/Sub).
//
// 1. If DEPLOY_TARGET is set (emulator/CI override), use it.
// 2. Otherwise derive from the Firebase project ID — firebase-tools
//    strips parent env vars when spawning the discovery loader, but
//    it always sets GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT, and Google
//    sets the same vars in the live Cloud Functions runtime.
//
// The parent-side verify-deploy-target.js script guards against
// alias/target mismatch before the deploy ever reaches this file.
function _resolveDeployTarget() {
  if (process.env.DEPLOY_TARGET) return process.env.DEPLOY_TARGET;

  let projectId =
    process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || null;
  if (!projectId && process.env.FIREBASE_CONFIG) {
    try {
      projectId = JSON.parse(process.env.FIREBASE_CONFIG).projectId || null;
    } catch (_) {
      // ignore parse failure, fall through to error below
    }
  }

  if (projectId === "warpspeed-bonitabikes") return "bonita";
  if (projectId === "cadence-pos") return "saas";

  throw new Error(
    "Cannot resolve DEPLOY_TARGET. No DEPLOY_TARGET env var was set, " +
      "and the Firebase project ID did not match a known target. " +
      "Got projectId=" +
      JSON.stringify(projectId)
  );
}
const DEPLOY_TARGET = _resolveDeployTarget();

// ═══════════════════════════════════════════════════════════════
// BONITA-SPECIFIC EXPORTS (direct charges, single-tenant secrets)
// Everything below until the matching closing brace at EOF is the
// existing single-tenant function set. SaaS-side functions live
// further below in the `if (DEPLOY_TARGET === "saas")` block.
// ═══════════════════════════════════════════════════════════════
if (DEPLOY_TARGET === "bonita") {

// ═══════════════════════════════════════════════════════════════
// PROJECT CONFIG
// ═══════════════════════════════════════════════════════════════
const PROJECT_ID = "warpspeed-bonitabikes";
const RTDB_URL = `https://${PROJECT_ID}-default-rtdb.firebaseio.com`;
const STORAGE_BUCKET = `${PROJECT_ID}.firebasestorage.app`;
const FUNCTIONS_BASE_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;
const WEB_APP_URL = `https://${PROJECT_ID}.web.app`;

// Branded short-link domain registered with the 10DLC campaign. When set,
// forwarded SMS includes a `/r/{id}` link on this domain (carriers whitelist
// branded domains; *.web.app gets filtered as 30007). The Firebase Hosting
// rewrite for /r/** → shortLinkRedirector handles the actual 302.
// Leave empty during 10DLC review or if forwarding links aren't wanted —
// the SMS goes out without a link instead of with a filtered link.
const SHORT_LINK_PUBLIC_DOMAIN = ""; // Carrier-filtered (30007) even with branded domain. Re-enable after A2P campaign URL allowlist update.

// Firebase Admin SDK - initialize once at module load (don't delete/recreate)
let DB = null;
let adminInitialized = false;

// Helper function to get initialized Firestore DB with service account credentials
async function getDB(serviceAccountSecret = null) {
  try {
    // Return existing DB if already initialized
    if (DB && adminInitialized) {
      return DB;
    }

    // Initialize only once - NEVER delete the app (breaks Firebase Functions SDK)
    if (!adminInitialized) {
      if (serviceAccountSecret) {
        // Initialize with service account from Secret Manager
        const serviceAccountJSON = serviceAccountSecret.value();
        const serviceAccount = JSON.parse(serviceAccountJSON);

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: RTDB_URL,
        });

        log("✅ Firebase Admin initialized with service account from Secret Manager");
      } else {
        // Fallback to default credentials
        admin.initializeApp({
          databaseURL: RTDB_URL,
        });
        log("⚠️ Firebase Admin initialized with default credentials");
      }

      adminInitialized = true;
      DB = admin.firestore();
      log("DB instance created successfully");
    }

    return DB;
  } catch (error) {
    // If app already exists, just use it
    if (error.code === "app/duplicate-app") {
      log("⚠️ Admin app already exists, using existing app");
      adminInitialized = true;
      DB = admin.firestore();
      return DB;
    }

    log("❌ Error initializing Firebase Admin", {
      error: error.message,
      code: error.code,
      hasSecret: !!serviceAccountSecret,
      appsLength: admin.apps.length,
      adminInitialized: adminInitialized,
    });

    throw error;
  }
}

// Check if running in emulator mode
// const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

// If running in emulator, connect to local Firestore emulator
// if (isEmulator) {
//   process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
// }

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const twilioSecretKey = defineSecret("twilioSecretKey");
const twilioSecretAccountNumber = defineSecret("twilioSecretAccountNum");
const firebaseServiceAccountKey = defineSecret("SERVICE_ACCOUNT_KEY");
const lightspeedClientId = defineSecret("LIGHTSPEED_CLIENT_ID");
const lightspeedClientSecret = defineSecret("LIGHTSPEED_CLIENT_SECRET");
const googleTranslateApiKey = defineSecret("GOOGLE_TRANSLATE_API_KEY");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
const stripeWebhookSecret = defineSecret("STRIPE_LINK_TO_PAY_WEBHOOK");
const stripeTerminalWebhookSecret = defineSecret("STRIPE_CHECKOUT_WEBHOOK_SECRET");
const gmailOAuthClientId = defineSecret("GMAIL_OAUTH_CLIENT_ID");
const gmailOAuthClientSecret = defineSecret("GMAIL_OAUTH_CLIENT_SECRET");

// initialization
var stripe;
var twilioClient;
let isAdminInitializedWithCredentials = false;

onInit(async () => {
  // Note: Admin SDK is already initialized above with default credentials
  // The onInit can't reinitialize it, but we can log the status
  log("onInit fired - Admin SDK status", {
    appsInitialized: admin.apps.length,
    hasServiceAccountSecret: !!firebaseServiceAccountKey.value(),
  });

  // stripe = Stripe(stripeSecretKey.value()); // Stripe secret key
  // try {
  //   twilioClient = require("twilio")(
  //     twilioSecretAccountNumber,
  //     twilioSecretKey
  //   );
  // } catch (e) {
  //   log("error fetching Twilio client", e);
  // }
}, [stripeSecretKey, firebaseServiceAccountKey]);

const SMS_PROTO = {
  phoneNumber: "",
  canRespond: false,
  millis: "",
  message: "",
  customerID: "",
  read: false,
  id: "",
};


async function compressImageServer(inputBuffer, contentType) {
  const compressibleTypes = ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/avif"];
  if (!compressibleTypes.some(t => contentType.startsWith(t))) {
    return { compressedBuffer: null, thumbnailBuffer: null };
  }
  if (inputBuffer.length < 100000) {
    return { compressedBuffer: null, thumbnailBuffer: null };
  }
  try {
    const compressedBuffer = await sharp(inputBuffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 65 })
      .toBuffer();
    const thumbnailBuffer = await sharp(inputBuffer)
      .resize(300, 300, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 50 })
      .toBuffer();
    return { compressedBuffer, thumbnailBuffer };
  } catch (error) {
    return { compressedBuffer: null, thumbnailBuffer: null };
  }
}

function log(one, two) {
  let str = "[MY LOG ====>] ";

  if (typeof one === "object") {
    logger.log(str + JSON.stringify(one) + two || "");
    return;
  }

  if (typeof two === "object") {
    logger.log(str + one + " : " + JSON.stringify(two));
    return;
  }

  if (one) {
    str += one;
  }
  if (two) {
    str += "  :  ";
    str += two;
  } else {
    // str = "log: " + str;
  }
  logger.log(str);
}

// ═══════════════════════════════════════════════════════════════
// SECURITY HELPERS
// ═══════════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  WEB_APP_URL,
  "http://localhost:3000",
];

function setCorsHeaders(res, req) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function requireCallableAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  return request.auth;
}

function requireTenantMatch(request, tenantID, storeID) {
  const auth = requireCallableAuth(request);
  const claims = auth.token || {};
  if (!claims.tenantID || !claims.storeID) {
    throw new HttpsError("permission-denied", "User has no tenant/store assignment.");
  }
  if (claims.tenantID !== tenantID) {
    throw new HttpsError("permission-denied", "Tenant access denied.");
  }
  if (storeID && claims.storeID !== storeID) {
    throw new HttpsError("permission-denied", "Store access denied.");
  }
  return auth;
}

async function requireHTTPAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return null;
  }
  try {
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    res.status(401).json({ success: false, message: "Invalid or expired token." });
    return null;
  }
}

function validateTwilioWebhook(request, authToken, functionName) {
  const sig = request.headers["x-twilio-signature"];
  if (!sig) {
    log("validateTwilioWebhook: no x-twilio-signature header found");
    return false;
  }
  const queryString = request.originalUrl.includes('?') ? request.originalUrl.substring(request.originalUrl.indexOf('?')) : '';
  const url = `${FUNCTIONS_BASE_URL}/${functionName}${queryString}`;
  const body = request.body || {};
  log("validateTwilioWebhook debug", {
    url,
    sig,
    originalUrl: request.originalUrl,
    contentType: request.headers["content-type"],
    bodyKeys: Object.keys(body),
    bodyType: typeof body,
    authTokenLength: authToken ? authToken.length : 0,
  });
  const result = twilio.validateRequest(authToken.trim(), sig, url, body);
  log("validateTwilioWebhook result", { result });
  return result;
}

async function setUserCustomClaims(uid, tenantID, storeID) {
  try {
    const claims = { tenantID };
    if (storeID) claims.storeID = storeID;
    await admin.auth().setCustomUserClaims(uid, claims);
    log("Custom claims set", { uid, tenantID, storeID });
  } catch (error) {
    log("Error setting custom claims", { uid, error: error.message });
  }
}

// server driven Stripe payments

exports.getAvailableStripeReaders = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    setCorsHeaders(res, req);
    const decodedToken = await requireHTTPAuth(req, res);
    if (!decodedToken) return;
    log("Incoming get available Stripe readers body", req.body);
    const readers = await stripe.terminal.readers.list({});
    log("available Stripe readers", readers);
    sendSuccessfulResult(res, readers);
  }
);

exports.initiatePaymentIntent = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    setCorsHeaders(res, req);
    const decodedToken = await requireHTTPAuth(req, res);
    if (!decodedToken) return;
    log("Incoming process Stripe server-driven payment", req.body);

    let amount = req.body.amount;
    let readerID = req.body.readerID;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number in cents.",
      });
    }

    if (!readerID || typeof readerID !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "Reader ID must be provided." });
    }

    try {
      // first check to see if the reader is in use. It is possible to override another user's payment intent which causes havoc
      const reader = await stripe.terminal.readers.retrieve(readerID);

      // Offline/unreachable check
      if (reader.status && reader.status !== "online") {
        return res.status(503).send(
          JSON.stringify({
            success: false,
            message: "📴 Terminal is offline or unreachable.",
            type: "StripeTerminalOfflineError",
            code: "reader_offline",
            readerStatus: reader.status,
          })
        );
      }

      // Busy check: reader.action indicates the reader is currently doing something
      // If it's processing a payment, it will have action.type === "process_payment_intent"
      const action = reader.action;
      if (action && action.type) {
        // Treat ANY in-progress action as busy. For payment specifically, include the current PI ID if present.
        if (action.type === "process_payment_intent") {
          const currentPiId =
            action.process_payment_intent?.payment_intent || null;
          return res.status(409).send(
            JSON.stringify({
              success: false,
              message: currentPiId
                ? `⏳ Reader is currently processing a different payment (PaymentIntent ${currentPiId}).`
                : "⏳ Reader is currently processing a different payment.",
              type: "StripeTerminalReaderBusyError",
              code: "reader_busy",
              currentPaymentIntentId: currentPiId,
            })
          );
        } else {
          // Could be "install_update", "collect_input", etc. — still busy.
          return res.status(409).send(
            JSON.stringify({
              success: false,
              message: `⏳ Reader is busy (${action.type}). Please wait or cancel current action on the reader.`,
              type: "StripeTerminalReaderBusyError",
              code: "reader_busy",
              activeActionType: action.type,
            })
          );
        }
      }

      // 1. Create the PaymentIntent
      let paymentIntent;
      // check to see if we are reusing an old payment attempt
      if (!req.body.paymentIntentID) {
        // we are not
        log("Getting a new payment intent");
        paymentIntent = await stripe.paymentIntents.create({
          amount,
          payment_method_types: ["card_present", "card", "link", "cashapp"],
          capture_method: req.body.captureMethod || "automatic",
          currency: "usd",
        });
        paymentIntentID = paymentIntent.id;
        log(
          "Payment intent gathered, processing Stripe server-driven payment intent",
          paymentIntent
        );
      } else {
        // we are reusing
        log("Recycling the previous payment intent");
        paymentIntentID = req.body.paymentIntentID;
      }

      // 2. Process the PaymentIntent with the reader
      const processedIntent =
        await stripe.terminal.readers.processPaymentIntent(readerID, {
          payment_intent: paymentIntent.id,
        });

      // 3. Return success with client-side polling configuration
      const paymentIntentID =
        processedIntent.action.process_payment_intent.payment_intent;
      log("Stripe payment successfully started", processedIntent);

      return res.status(200).send(
        JSON.stringify({
          success: true,
          message: `✅ Payment of $${(amount / 100).toFixed(
            2
          )} processed successfully.`,
          paymentIntentID: paymentIntentID,
          readerID: processedIntent.id,
          status: processedIntent.status,
          // Client-side polling configuration
          pollingConfig: {
            enabled: true,
            databasePath: `PAYMENT-PROCESSING/${readerID}/${paymentIntentID}`,
            pollingInterval: 3000, // 3 seconds
            maxPollingTime: 300000, // 5 minutes
            timeoutMessage:
              "Payment processing timeout - please check reader status",
            fallbackEnabled: true,
            // Expected database structure for monitoring
            expectedNodes: {
              update: "PAYMENT-PROCESSING/{readerID}/{paymentIntentID}/update/",
              complete:
                "PAYMENT-PROCESSING/{readerID}/{paymentIntentID}/complete/",
            },
          },
        })
      );
    } catch (error) {
      let message;

      switch (error.type) {
        case "StripeCardError":
          message = `❌ Card error: ${error.message}`;
          break;
        case "StripeInvalidRequestError":
          message = `⚠️ Invalid request: ${error.message}`;
          break;
        case "StripeAPIError":
          message = `⚠️ Stripe API error: ${error.message}`;
          break;
        case "StripeConnectionError":
          message = `📡 Network error: Could not connect to Stripe.`;
          break;
        case "StripeAuthenticationError":
          message = `🔐 Authentication error: Please check your Stripe credentials.`;
          break;
        case "StripePermissionError":
          message = `🔒 Permission error: Not allowed to process this payment.`;
          break;
        case "StripeTerminalReaderBusyError":
          message = `⏳ Reader is busy. Try again in a moment.`;
          break;
        case "StripeTerminalOfflineError":
          message = `📴 Terminal is offline or unreachable.`;
          break;
        default:
          message = `❗ Unexpected error: ${error.message}`;
          break;
      }
      res.status(500).send(JSON.stringify({ success: false, message }));
    }
  }
);

exports.stripeCheckoutWebhook_Terminal = onRequest(
  {
    cors: true,
    secrets: [
      stripeSecretKey,
      stripeTerminalWebhookSecret,
      firebaseServiceAccountKey,
      twilioSecretKey,
      twilioSecretAccountNumber,
      gmailAppPassword,
    ],
  },
  async (req, res) => {
    setCorsHeaders(res, req);

    // ── Verify webhook signature ──
    const stripeClient = Stripe(stripeSecretKey.value());
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripeClient.webhooks.constructEvent(
        req.rawBody,
        sig,
        stripeTerminalWebhookSecret.value()
      );
    } catch (err) {
      log("stripeEventWebhook: signature verification failed", err.message);
      return res.status(400).send("Webhook signature verification failed");
    }

    log("stripeEventWebhook: event type", event.type);

    let message = "";
    let error = false;

    const readerObj = event.data.object;
    const action = readerObj?.action;

    if (!action || !action.process_payment_intent) {
      return res.status(200).json({ received: true, skipped: true });
    }

    const paymentIntentID = action.process_payment_intent.payment_intent;
    const readerID = readerObj.id;

    if (!paymentIntentID || !readerID) {
      return res.status(400).json({
        success: false,
        message: "Missing paymentIntentID or readerID.",
      });
    }

    try {
      // Ensure DB is initialized before any Firestore operations
      await getDB(firebaseServiceAccountKey);

      // Extract tenant/store context from payment intent metadata
      const paymentIntent = await stripeClient.paymentIntents.retrieve(
        paymentIntentID
      );
      const tenantID = paymentIntent.metadata?.tenantID;
      const storeID = paymentIntent.metadata?.storeID;
      const saleID = paymentIntent.metadata?.saleID;
      const customerID = paymentIntent.metadata?.customerID;
      const transactionID = paymentIntent.metadata?.transactionID;
      const metadataSalesTax = parseInt(paymentIntent.metadata?.salesTax || "0", 10) || 0;

      if (!tenantID || !storeID) {
        throw new Error(
          `Payment intent ${paymentIntentID} missing required tenant/store metadata`
        );
      }

      // Update database with action data using Firestore
      const updateRef = DB.collection("tenants")
        .doc(tenantID)
        .collection("stores")
        .doc(storeID)
        .collection("payment-processing")
        .doc(readerID)
        .collection("payments")
        .doc(paymentIntentID)
        .collection("updates")
        .doc("current");

      await updateRef.set({
        ...action,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        readerID,
        paymentIntentID,
      });

      // Handle successful payment — write enriched data to updates/current
      if (action.status === "succeeded") {
        log("stripeEventWebhook: payment succeeded", { paymentIntentID });

        try {
          const paymentIntentComplete =
            await stripeClient.paymentIntents.retrieve(paymentIntentID);

          if (!paymentIntentComplete.latest_charge) {
            throw new Error("No charge found for successful payment intent");
          }

          const chargeID = paymentIntentComplete.latest_charge;
          const charge = await stripeClient.charges.retrieve(chargeID);

          // Write charge to updates/current (overwrites initial action write)
          await updateRef.set({
            ...charge,
            status: "succeeded",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            readerID,
            paymentIntentID,
          });
          log("stripeEventWebhook: charge written to updates/current", { chargeID });

          // ── Write transaction document ──
          if (transactionID) {
            try {
              const card = charge?.payment_method_details?.card_present;
              const txnDoc = {
                id: transactionID,
                method: "card",
                millis: Date.now(),
                amountCaptured: charge.amount_captured || 0,
                amountTendered: 0,
                salesTax: metadataSalesTax,
                last4: card?.last4 || "",
                expMonth: card?.exp_month || "",
                expYear: card?.exp_year || "",
                cardType: card?.description || "",
                cardIssuer: card?.receipt?.application_preferred_name || "Unknown",
                paymentProcessor: "stripe",
                paymentIntentID: paymentIntentComplete.id || "",
                chargeID: charge.id || "",
                authorizationCode: card?.receipt?.authorization_code || "",
                networkTransactionID: card?.network_transaction_id || "",
                receiptURL: charge.receipt_url || "",
                refunds: [],
              };
              await DB.collection("tenants").doc(tenantID)
                .collection("stores").doc(storeID)
                .collection("transactions").doc(transactionID)
                .set(txnDoc);
              log("stripeCheckoutWebhook_Terminal: transaction written", { transactionID, salesTax: metadataSalesTax });
            } catch (txnError) {
              log("stripeCheckoutWebhook_Terminal: transaction write error", txnError.message);
            }
          }
        } catch (stripeError) {
          log("stripeEventWebhook: error retrieving payment details", stripeError);
        }
      } else if (action.status === "failed") {
        log("stripeEventWebhook: payment failed", action);

        // Build enriched failure data and write to updates/current (overwrites initial action write)
        let failureData = {
          status: "failed",
          failure_code: action.failure_code || "unknown",
          failure_message: action.failure_message || "Payment failed",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          readerID,
          paymentIntentID,
        };

        try {
          const pi = await stripeClient.paymentIntents.retrieve(paymentIntentID);
          if (pi.last_payment_error) {
            failureData.decline_code = pi.last_payment_error.decline_code || "";
            failureData.error_message = pi.last_payment_error.message || "";
            failureData.error_code = pi.last_payment_error.code || "";
            failureData.error_type = pi.last_payment_error.type || "";
          }
        } catch (piError) {
          log("stripeEventWebhook: error retrieving decline details", piError);
        }

        await updateRef.set(failureData);
      }

      // Cancel reader action to clean up
      try {
        await stripeClient.terminal.readers.cancelAction(readerID);
        log("stripeEventWebhook: reader action cancelled", { readerID });
      } catch (cancelError) {
        log("stripeEventWebhook: error cancelling reader", cancelError.message);
      }
    } catch (err) {
      error = true;
      message =
        err instanceof Error
          ? `Webhook processing error: ${err.message}`
          : "Webhook processing error: An unknown error occurred.";
      log("stripeEventWebhook: processing error", err.message);
    }

    if (error) {
      return res.status(500).json({ success: false, message });
    }
    return res.status(200).json({ success: true, message: "Webhook processed" });
  }
);

exports.cancelServerDrivenStripePayment = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    setCorsHeaders(res, req);
    const decodedToken = await requireHTTPAuth(req, res);
    if (!decodedToken) return;

    const readerId = req.body.readerID;

    if (!readerId || typeof readerId !== "string") {
      return res.status(400).json({
        success: false,
        message: "Reader ID must be provided and must be a string.",
      });
    }

    try {
      // (Optional, but helpful) Verify the reader is online before attempting cancelAction
      const readerBefore = await stripe.terminal.readers.retrieve(readerId);
      if (readerBefore.status !== "online") {
        return res.status(503).json({
          success: false,
          message: "📴 Reader is offline or unreachable.",
          type: "StripeTerminalOfflineError",
          code: "reader_offline",
          readerStatus: readerBefore.status,
        });
      }

      const activeActionType = readerBefore.action?.type ?? null;
      log("[cancelServerDrivenStripePayment] Reader status before cancel:", {
        status: readerBefore.status,
        activeActionType,
      });

      // Reset the reader (cancel whatever action it's doing)
      const readerAfter = await stripe.terminal.readers.cancelAction(readerId);

      log("[cancelServerDrivenStripePayment] Reader reset complete:", {
        readerId: readerAfter.id,
        status: readerAfter.status,
        actionAfter: readerAfter.action?.type ?? null,
      });

      // Respond success (do NOT cancel the PaymentIntent)
      return res.status(200).json({
        success: true,
        message: `🧹 Reader reset complete!`,
        readerId,
        readerStatus: readerAfter.status,
        reader: readerAfter, // full reader object for client if needed
      });
    } catch (error) {
      let message;

      switch (error.type) {
        case "StripeInvalidRequestError":
          message = `⚠️ Invalid request: ${error.message}`;
          break;
        case "StripeAPIError":
          message = `⚠️ Stripe API error: ${error.message}`;
          break;
        case "StripeConnectionError":
          message = "📡 Network error: Could not connect to Stripe.";
          break;
        case "StripeAuthenticationError":
          message =
            "🔐 Authentication error: Please check your Stripe credentials.";
          break;
        case "StripePermissionError":
          message = "🔒 Permission error: Not allowed to reset this reader.";
          break;
        case "StripeTerminalOfflineError":
          message = "📴 Reader is offline or unreachable.";
          break;
        case "StripeTerminalReaderBusyError":
          message = "⏳ Reader is busy. Try again in a moment.";
          break;
        default:
          message = `❗ Unexpected error: ${error.message}`;
          break;
      }

      log("[cancelServerDrivenStripePayment] Error resetting reader:", {
        errorType: error.type,
        errorMessage: error.message,
      });

      return res.status(500).json({
        success: false,
        message,
        type: error.type || "UnknownError",
      });
    }
  }
);

// users /////////////////////////////////////////////////////////////////////

/////////////////////////////////////////////////////////////////////////////////
// messaging

/**
 * Enhanced SMS sending function with comprehensive error handling
 * HTTPS callable function for sending SMS messages with proper validation and error handling
 */
exports.sendSMSEnhanced = onCall(
  {
    secrets: [
      twilioSecretKey,
      twilioSecretAccountNumber,
      firebaseServiceAccountKey,
    ],
  },
  withFeatureTracking("sms.send", async (request, tracker) => {
    log("Incoming enhanced SMS callable request", request.data);
    requireCallableAuth(request);

    try {
      // Initialize Firestore with service account
      const db = await getDB(firebaseServiceAccountKey);
      // Input validation
      const {
        message,
        phoneNumber,
        tenantID,
        storeID,
        customerID,
        messageID,
        imageUrl = "",
        mediaUrls: mediaUrlsParam = [],
        canRespond: canRespondParam = false,
        forwardTo: forwardToParam = null,
        fromNumber,
        customerFirst = "",
        customerLast = "",
        senderID = "",
        originalMessage = "",
        translatedFrom = "",
        translatedTo = "",
      } = request.data;

      if (tenantID && storeID) requireTenantMatch(request, tenantID, storeID);

      // Validate required fields
      if (
        (!message || typeof message !== "string" || message.trim().length === 0) && !imageUrl && !(mediaUrlsParam.length > 0)
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Message content or image URL is required"
        );
      }

      if (!phoneNumber || typeof phoneNumber !== "string") {
        throw new HttpsError(
          "invalid-argument",
          "Phone number is required and must be a string"
        );
      }

      // Validate phone number format (US format: 10 digits)
      const cleanPhoneNumber = phoneNumber.replace(/\D/g, ""); // Remove non-digits
      if (cleanPhoneNumber.length !== 10) {
        throw new HttpsError(
          "invalid-argument",
          "Phone number must be 10 digits (US format)"
        );
      }

      if (!tenantID || typeof tenantID !== "string") {
        throw new HttpsError("invalid-argument", "Tenant ID is required");
      }

      if (!storeID || typeof storeID !== "string") {
        throw new HttpsError("invalid-argument", "Store ID is required");
      }

      if (!fromNumber || typeof fromNumber !== "string") {
        throw new HttpsError("failed-precondition", "No texting number configured in store settings");
      }

      // Message length validation (SMS limit)
      if (message && message.length > 1600) {
        // Twilio SMS limit
        throw new HttpsError(
          "invalid-argument",
          "Message exceeds SMS character limit (1600 characters)"
        );
      }

      // Initialize Twilio client with secrets
      if (!twilioClient) {
        try {
          twilioClient = require("twilio")(
            twilioSecretAccountNumber.value(),
            twilioSecretKey.value()
          );
        } catch (twilioInitError) {
          log("Error initializing Twilio client", twilioInitError);
          throw new HttpsError("internal", "Failed to initialize SMS service");
        }
      }

      // Send SMS via Twilio
      // Separate videos (sent as text links) from images/audio (sent as MMS attachments)
      const imageMediaUrls = mediaUrlsParam.length > 0
        ? mediaUrlsParam.filter((m) => !(m.contentType || "").startsWith("video/")).map((m) => m.url || m)
        : imageUrl ? [imageUrl] : [];
      const videoLinks = mediaUrlsParam.length > 0
        ? mediaUrlsParam.filter((m) => (m.contentType || "").startsWith("video/")).map((m) => m.url || m)
        : [];

      let bodyText = (message || "").trim();
      if (videoLinks.length > 0) {
        let linkText = videoLinks.join("\n");
        bodyText = bodyText ? `${bodyText}\n\n${linkText}` : linkText;
      }

      const callbackParams = messageID ? `?tenantID=${tenantID}&storeID=${storeID}&phone=${cleanPhoneNumber}&messageID=${messageID}` : "";
      const statusCallbackUrl = messageID ? `${FUNCTIONS_BASE_URL}/smsStatusCallback${callbackParams}` : "";

      let twilioResponse;

      // Send each image as a separate MMS for reliable carrier delivery
      if (imageMediaUrls.length > 1) {
        // First message: text body + first image
        twilioResponse = await twilioClient.messages.create({
          body: bodyText,
          to: `+1${cleanPhoneNumber}`,
          from: fromNumber,
          mediaUrl: [imageMediaUrls[0]],
          ...(statusCallbackUrl ? { statusCallback: statusCallbackUrl } : {}),
        });
        log("SMS sent (1/" + imageMediaUrls.length + ")", { messageSid: twilioResponse.sid, status: twilioResponse.status });
        tracker.bump("twilioSegments", Number(twilioResponse.numSegments) || 1);
        tracker.bump("twilioMms");
        tracker.setContext({ correlationID: twilioResponse.sid });

        // Remaining images: no text body, just the image
        for (let i = 1; i < imageMediaUrls.length; i++) {
          let extraResponse = await twilioClient.messages.create({
            body: "",
            to: `+1${cleanPhoneNumber}`,
            from: fromNumber,
            mediaUrl: [imageMediaUrls[i]],
          });
          log("SMS sent (" + (i + 1) + "/" + imageMediaUrls.length + ")", { messageSid: extraResponse.sid, status: extraResponse.status });
          tracker.bump("twilioSegments", Number(extraResponse.numSegments) || 1);
          tracker.bump("twilioMms");
        }
      } else {
        // Single image, text-only, or video links only
        twilioResponse = await twilioClient.messages.create({
          body: bodyText,
          to: `+1${cleanPhoneNumber}`,
          from: fromNumber,
          ...(imageMediaUrls.length > 0 ? { mediaUrl: imageMediaUrls } : {}),
          ...(statusCallbackUrl ? { statusCallback: statusCallbackUrl } : {}),
        });
        log("SMS sent successfully", { messageSid: twilioResponse.sid, to: twilioResponse.to, status: twilioResponse.status });
        tracker.bump("twilioSegments", Number(twilioResponse.numSegments) || 1);
        if (imageMediaUrls.length > 0) tracker.bump("twilioMms");
        tracker.setContext({ correlationID: twilioResponse.sid });
      }

      // Store message in Firestore if messageID provided
      if (messageID) {
        try {
          const conversationRef = db
            .collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("sms-messages").doc(cleanPhoneNumber);

          // Read forwardTo from the parent doc (canonical source of truth)
          const parentDoc = await conversationRef.get();
          tracker.bump("firestoreReads");
          let currentForwardTo = parentDoc.exists ? (parentDoc.data().forwardTo || []) : [];

          // If caller passed an array, overwrite; otherwise leave as-is
          if (Array.isArray(forwardToParam)) {
            currentForwardTo = forwardToParam;
          }

          // Store outgoing message in sms-messages (no forwardTo on individual messages)
          const messageRef = conversationRef.collection("messages").doc(messageID);

          await messageRef.set({
            id: messageID,
            customerID: customerID || "",
            message: (message || "").trim(),
            phoneNumber: cleanPhoneNumber,
            messageSid: twilioResponse.sid,
            status: twilioResponse.status,
            fromNumber: fromNumber,
            tenantID: tenantID,
            storeID: storeID,
            type: "outgoing",
            millis: Date.now(),
            canRespond: canRespondParam || null,
            ...(mediaUrlsParam.length > 0 ? { mediaUrls: mediaUrlsParam } : {}),
            ...(imageUrl && !mediaUrlsParam.length ? { imageUrl: imageUrl } : {}),
            ...(originalMessage ? { originalMessage } : {}),
            ...(translatedFrom ? { translatedFrom } : {}),
            ...(translatedTo ? { translatedTo } : {}),
          });
          tracker.bump("firestoreWrites");

          // Update conversation root with denormalized thread metadata
          await conversationRef.set({
            canRespond: canRespondParam || false,
            lastMessage: (message || "").trim(),
            lastMillis: Date.now(),
            lastType: "outgoing",
            hasMedia: mediaUrlsParam.length > 0 || !!imageUrl,
            threadStatus: "open",
            lastOutgoingMessageID: messageID,
            lastOutgoingMessageStatus: twilioResponse.status || "queued",
            lastOutgoingMillis: Date.now(),
            lastOutgoingSenderID: senderID || "",
            forwardTo: currentForwardTo,
            translatedTo: translatedTo || "",
            ...(customerFirst ? { customerFirst } : {}),
            ...(customerLast ? { customerLast } : {}),
          }, { merge: true });
          tracker.bump("firestoreWrites");

          log("Outgoing message stored", {
            messageID,
            customerID: customerID || "",
            phone: cleanPhoneNumber,
            path: `tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhoneNumber}/messages/${messageID}`,
          });

        } catch (firestoreError) {
          log("Error storing outgoing message in Firestore", {
            error: firestoreError.message,
            messageID,
            customerID,
          });
          // Don't fail the entire request if Firestore storage fails
          // The SMS was sent successfully
        }
      }

      // Return success response
      return {
        success: true,
        message: "SMS sent successfully",
        data: {
          messageSid: twilioResponse.sid,
          status: twilioResponse.status,
          to: twilioResponse.to,
          from: twilioResponse.from,
          messageLength: message.length,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      log("Error in sendSMSEnhanced", error);

      // Handle specific Twilio errors
      let errorMessage = "An unexpected error occurred while sending SMS";
      let httpsErrorCode = "internal";

      if (error.code) {
        switch (error.code) {
          case 21211:
            errorMessage = "Invalid phone number format";
            httpsErrorCode = "invalid-argument";
            break;
          case 21214:
            errorMessage = "Phone number is not a valid mobile number";
            httpsErrorCode = "invalid-argument";
            break;
          case 21408:
            errorMessage = "Permission denied - invalid 'from' phone number";
            httpsErrorCode = "permission-denied";
            break;
          case 21610:
            errorMessage = "Message cannot be sent to unsubscribed number";
            httpsErrorCode = "invalid-argument";
            break;
          case 21614:
            errorMessage = "Message body is required";
            httpsErrorCode = "invalid-argument";
            break;
          case 30001:
            errorMessage = "Queue overflow - too many messages in queue";
            httpsErrorCode = "resource-exhausted";
            break;
          case 30003:
            errorMessage = "Account suspended";
            httpsErrorCode = "permission-denied";
            break;
          case 30004:
            errorMessage = "Message sending failed";
            httpsErrorCode = "internal";
            break;
          case 30005:
            errorMessage = "Unknown error";
            httpsErrorCode = "internal";
            break;
          case 30006:
            errorMessage = "Message delivery failed - invalid number";
            httpsErrorCode = "invalid-argument";
            break;
          case 30007:
            errorMessage = "Message delivery failed - carrier violation";
            httpsErrorCode = "invalid-argument";
            break;
          case 30008:
            errorMessage = "Message delivery failed - unknown error";
            httpsErrorCode = "internal";
            break;
          default:
            errorMessage = `Twilio error: ${error.message}`;
            httpsErrorCode = "internal";
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      throw new HttpsError(httpsErrorCode, errorMessage);
    }
  })
);

/**
 * SMS Status Callback — receives delivery status updates from Twilio
 * Updates the outgoing message doc in Firestore with the latest status
 * (queued, sending, sent, delivered, undelivered, failed)
 */
exports.smsStatusCallback = onRequest(
  { cors: true, secrets: [firebaseServiceAccountKey, twilioSecretKey] },
  withFeatureTrackingHttp("sms.status", async (request, response, tracker) => {
    try {
      if (!validateTwilioWebhook(request, twilioSecretKey.value(), "smsStatusCallback")) {
        log("smsStatusCallback: invalid Twilio signature");
        return response.status(403).send("Forbidden");
      }

      const { MessageSid, MessageStatus, ErrorCode } = request.body || {};
      const { tenantID, storeID, phone, messageID } = request.query || {};
      tracker.setContext({ tenantID, storeID, correlationID: MessageSid });
      if (MessageStatus) tracker.set("messageStatus", MessageStatus);
      if (ErrorCode) tracker.set("twilioErrorCode", ErrorCode);

      if (!MessageStatus || !tenantID || !storeID || !phone || !messageID) {
        log("smsStatusCallback: missing params", { MessageSid, MessageStatus, tenantID, storeID, phone, messageID });
        return response.status(200).send("OK");
      }

      // Priority order - higher index wins, never downgrade
      const STATUS_PRIORITY = ["queued", "accepted", "sending", "sent", "delivered", "undelivered", "failed"];

      const db = await getDB(firebaseServiceAccountKey);
      const messageRef = db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("sms-messages").doc(phone)
        .collection("messages").doc(messageID);

      // Read current status and skip if incoming is lower priority
      const doc = await messageRef.get();
      tracker.bump("firestoreReads");
      if (doc.exists) {
        const currentStatus = doc.data().status || "";
        const currentPriority = STATUS_PRIORITY.indexOf(currentStatus);
        const incomingPriority = STATUS_PRIORITY.indexOf(MessageStatus);
        if (incomingPriority >= 0 && currentPriority >= 0 && incomingPriority < currentPriority) {
          log("smsStatusCallback: skipped downgrade", { messageID, current: currentStatus, incoming: MessageStatus });
          return response.status(200).send("OK");
        }
      }

      const updateData = { status: MessageStatus };
      if (ErrorCode) updateData.errorCode = ErrorCode;

      await messageRef.update(updateData);
      tracker.bump("firestoreWrites");

      // Also write delivery status to the parent thread doc so the client can display it in real-time
      const conversationRef = db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("sms-messages").doc(phone);
      const parentDoc = await conversationRef.get();
      tracker.bump("firestoreReads");
      const parentData = parentDoc.exists ? parentDoc.data() : {};
      // Only update if this message is the current last outgoing, or no last outgoing is tracked yet
      if (!parentData.lastOutgoingMessageID || parentData.lastOutgoingMessageID === messageID) {
        await conversationRef.set({
          lastOutgoingMessageID: messageID,
          lastOutgoingMessageStatus: MessageStatus,
        }, { merge: true });
        tracker.bump("firestoreWrites");
      }

      log("smsStatusCallback: updated", { messageID, status: MessageStatus, ErrorCode: ErrorCode || null });
    } catch (error) {
      log("smsStatusCallback error", error.message);
    }
    return response.status(200).send("OK");
  })
);

/**
 * Enhanced incoming SMS webhook handler with comprehensive error handling
 * Processes incoming SMS messages from Twilio with proper validation and response management
 *
 * Features:
 * - Validates Twilio webhook signature for security
 * - Comprehensive input validation
 * - Optimized customer lookup with caching
 * - Thread management with auto-response handling
 * - Proper HTTP responses with TwiML
 * - Complete error tracking and logging
 * - Message analytics and metadata
 */
exports.incomingSMSEnhanced = onRequest(
  {
    cors: true,
    memory: "512MiB",
    secrets: [
      twilioSecretKey,
      twilioSecretAccountNumber,
      firebaseServiceAccountKey,
      googleTranslateApiKey,
    ],
  },
  withFeatureTrackingHttp("sms.inbound", async (request, response, tracker) => {
    const requestStartTime = Date.now();
    if (request.body && request.body.MessageSid) {
      tracker.setContext({ correlationID: request.body.MessageSid });
    }

    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");

    // Initialize Firestore with service account
    const db = await getDB(firebaseServiceAccountKey);

    try {
      // ============================================================================
      // STEP 1: VALIDATE TWILIO WEBHOOK & EXTRACT DATA
      // ============================================================================

      if (!validateTwilioWebhook(request, twilioSecretKey.value(), "incomingSMSEnhanced")) {
        log("incomingSMSEnhanced: invalid Twilio signature");
        return response.status(403).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      const twilioData = request.body;

      // Validate required Twilio parameters
      if (
        !twilioData ||
        !twilioData.From ||
        (!twilioData.Body && twilioData.Body !== "" && !parseInt(twilioData.NumMedia || "0", 10)) ||
        !twilioData.MessageSid
      ) {
        log("Invalid Twilio webhook - missing required parameters", twilioData);
        return response
          .status(400)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // Extract and normalize phone number (remove +1 country code)
      const rawPhoneNumber = twilioData.From;
      const normalizedPhone = rawPhoneNumber
        .replace(/^\+1/, "")
        .replace(/\D/g, "");

      // Validate phone number format
      if (normalizedPhone.length !== 10 || !/^\d{10}$/.test(normalizedPhone)) {
        log("Invalid phone number format", { rawPhoneNumber, normalizedPhone });
        return response
          .status(400)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      const incomingMessage = twilioData.Body.trim();
      const messageSid = twilioData.MessageSid;
      const messageStatus = twilioData.SmsStatus || "received";
      const numMedia = parseInt(twilioData.NumMedia || "0", 10);

      log("Processing incoming SMS", {
        phone: normalizedPhone,
        messageSid,
        messageLength: incomingMessage.length,
        hasMedia: numMedia > 0,
        status: messageStatus,
      });

      // ============================================================================
      // STEP 2: RESOLVE STORE FROM TWILIO NUMBER (store_phones lookup)
      // ============================================================================

      const rawStorePhone = twilioData.To || "";
      const normalizedStorePhone = rawStorePhone.replace(/^\+1/, "").replace(/\D/g, "");
      let tenantID = null;
      let storeID = null;

      try {
        if (normalizedStorePhone.length !== 10) {
          log("Invalid store phone number format", { rawStorePhone, normalizedStorePhone });
          return response.status(400).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        const storePhoneDoc = await db.collection("store_phones").doc(normalizedStorePhone).get();
        if (!storePhoneDoc.exists) {
          log("No store_phones entry found", { storePhone: normalizedStorePhone });
          return response.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        const storePhoneData = storePhoneDoc.data();
        tenantID = storePhoneData.tenantId || storePhoneData.tentantId;
        storeID = storePhoneData.storeId;

        if (!tenantID || !storeID) {
          log("store_phones doc missing tenantId or storeId", { normalizedStorePhone, storePhoneData });
          return response.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        log("Store resolved via store_phones", { tenantID, storeID, storePhone: normalizedStorePhone });
      } catch (error) {
        log("Error looking up store_phones", { error: error.message, storePhone: normalizedStorePhone });
        return response.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // Helper: sms-messages conversation root ref
      const conversationRef = db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("sms-messages").doc(normalizedPhone);

      // Helper: sms-messages/{phone}/messages/{msgId} ref
      const messageDocRef = (msgId) => conversationRef.collection("messages").doc(msgId);

      // ============================================================================
      // EARLY: LOAD STORE SETTINGS (used by staff-reply detection AND thread-status check below)
      // ============================================================================

      let storeSettings = {};
      try {
        const settingsDocEarly = await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("settings").doc("settings")
          .get();
        storeSettings = settingsDocEarly.exists ? settingsDocEarly.data() : {};
      } catch (settingsErr) {
        log("Error loading store settings (non-fatal)", { error: settingsErr.message });
      }

      // ============================================================================
      // STAFF-PHONE-REPLY DETECTION & ROUTING — PAUSED 2026-05-25
      //
      // Original design: an SMS from a staff phone (matches a user.phone in
      // settings.users) was routed as an outbound reply to whatever customer
      // was last forwarded to that staff member (via user-sms-pointers/{userID}).
      //
      // Why paused: stale pointers route legitimate staff-to-shop SMS to the
      // wrong customer. Real-world scenario: shop texts staff via Custom Phone
      // Mode → staff's natural reply (e.g. "9am") gets sent to whatever customer
      // was last forwarded to that staff. Not just a testing edge case.
      //
      // Before re-enabling, the design must include AT LEAST:
      //   1. TTL on user-sms-pointers — auto-expire after N hours of inactivity,
      //      renewed on each new customer message in the pointed thread.
      //   2. Validation that the staff member was the most recent outgoing
      //      sender on the pointed-at customer thread (otherwise the pointer is
      //      stale relative to the staff's intent).
      //   3. Optional opt-out prefix (e.g. `!new`) so staff can deliberately
      //      send a fresh message to the shop without leaking to a customer.
      //
      // The detection block below is preserved (gated by a constant) so it can
      // be re-enabled cleanly once the safeguards above are in place.
      // ============================================================================

      const STAFF_PHONE_REPLY_ENABLED = false; // PAUSED 2026-05-25 — see comment above

      const settingsUsers = Array.isArray(storeSettings.users) ? storeSettings.users : [];
      const staffUser = settingsUsers.find((u) => (u?.phone || "").replace(/\D/g, "") === normalizedPhone);

      // Labeled block so the "nothing to reply to" branches can `break` out and
      // fall through to normal customer-message handling below, instead of
      // dropping the message. Lets a staff member text the store from their
      // own phone (e.g., for self-testing) without losing the message.
      staffReplyBlock: if (STAFF_PHONE_REPLY_ENABLED && staffUser) {
        if (storeSettings.allowStaffPhoneReply === false) {
          log("Staff phone detected but allowStaffPhoneReply is off - dropping silently", {
            userID: staffUser.id,
          });
          return response.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }
        try {
          log("Incoming SMS is from a staff phone - routing as reply", {
            userID: staffUser.id,
            userName: `${staffUser.first || ""} ${staffUser.last || ""}`.trim(),
          });

          const pointerRef = db
            .collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("user-sms-pointers").doc(staffUser.id);
          const pointerDoc = await pointerRef.get();

          if (!pointerDoc.exists) {
            log("No staff-reply pointer found - falling through to customer-message handling", { userID: staffUser.id });
            break staffReplyBlock;
          }

          const pointer = pointerDoc.data();
          const custPhone = (pointer.custPhone || "").replace(/\D/g, "");
          if (custPhone.length !== 10) {
            log("Staff-reply pointer has invalid custPhone - falling through to customer-message handling", { userID: staffUser.id, custPhone: pointer.custPhone });
            break staffReplyBlock;
          }

          const targetConvRef = db
            .collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("sms-messages").doc(custPhone);
          const targetConvDoc = await targetConvRef.get();
          const targetConv = targetConvDoc.exists ? targetConvDoc.data() : null;

          if (!targetConv) {
            log("Target thread missing - falling through to customer-message handling", { custPhone });
            break staffReplyBlock;
          }

          const targetForwardTo = Array.isArray(targetConv.forwardTo) ? targetConv.forwardTo : [];
          if (targetForwardTo.length > 1) {
            log("Target thread has multi-staff forwardTo - dropping silently (must use app)", {
              custPhone,
              forwardCount: targetForwardTo.length,
            });
            // TODO: When multi-staff replies become possible via the app deep-link,
            // also fan out a "team echo" Twilio SMS to other users in forwardTo.
            return response.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
          }

          // Build outgoing message data (matches the shape used by sendSMS path)
          const outgoingMessageData = {
            id: messageSid,
            customerID: targetConv.customerInfo?.id || "",
            message: incomingMessage,
            phoneNumber: custPhone,
            messageSid,
            fromNumber: twilioData.To || "",
            tenantID,
            storeID,
            type: "outgoing",
            millis: Date.now(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            canRespond: true,
            origin: "staff-phone",
            senderUserID: staffUser.id,
            senderFirst: staffUser.first || "",
            senderLast: staffUser.last || "",
          };

          // Download/store any media from Twilio so we can echo it to the
          // customer AND keep it in Cloud Storage for the in-app thread view.
          let staffMediaPublicUrls = [];
          if (numMedia > 0) {
            const mediaUrls = [];
            const bucket = admin.storage().bucket(STORAGE_BUCKET);
            const accountSid = twilioSecretAccountNumber.value();
            const authToken = twilioSecretKey.value();
            const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

            for (let i = 0; i < numMedia; i++) {
              const twilioUrl = twilioData[`MediaUrl${i}`];
              const contentType = twilioData[`MediaContentType${i}`] || "application/octet-stream";
              if (!twilioUrl) continue;
              try {
                const mediaResponse = await fetch(twilioUrl, { headers: { Authorization: authHeader } });
                if (!mediaResponse.ok) throw new Error(`Twilio fetch failed: ${mediaResponse.status}`);
                const arrayBuffer = await mediaResponse.arrayBuffer();
                const rawBuffer = Buffer.from(arrayBuffer);
                const { compressedBuffer, thumbnailBuffer } = await compressImageServer(rawBuffer, contentType);
                if (compressedBuffer && thumbnailBuffer) {
                  const mainPath = `${tenantID}/${storeID}/sms-media/${custPhone}/${messageSid}_${i}.jpg`;
                  const thumbPath = `${tenantID}/${storeID}/sms-media/${custPhone}/thumbnails/${messageSid}_${i}.jpg`;
                  const mainFile = bucket.file(mainPath);
                  await mainFile.save(compressedBuffer, { contentType: "image/jpeg", metadata: { contentType: "image/jpeg" } });
                  await mainFile.makePublic();
                  const mainUrl = `https://storage.googleapis.com/${bucket.name}/${mainPath}`;
                  const thumbFile = bucket.file(thumbPath);
                  await thumbFile.save(thumbnailBuffer, { contentType: "image/jpeg", metadata: { contentType: "image/jpeg" } });
                  await thumbFile.makePublic();
                  const thumbUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`;
                  mediaUrls.push({ url: mainUrl, thumbnailUrl: thumbUrl, contentType: "image/jpeg" });
                } else {
                  const ext = contentType.startsWith("image/jpeg") ? ".jpg"
                    : contentType.startsWith("image/png") ? ".png"
                    : contentType.startsWith("image/gif") ? ".gif"
                    : contentType.startsWith("video/mp4") ? ".mp4"
                    : contentType.startsWith("application/pdf") ? ".pdf"
                    : "";
                  const storagePath = `${tenantID}/${storeID}/sms-media/${custPhone}/${messageSid}_${i}${ext}`;
                  const file = bucket.file(storagePath);
                  await file.save(rawBuffer, { contentType, metadata: { contentType } });
                  await file.makePublic();
                  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
                  mediaUrls.push({ url: publicUrl, contentType });
                }
              } catch (mediaError) {
                log("Error downloading staff-reply media from Twilio", { index: i, error: mediaError.message });
              }
            }
            outgoingMessageData.mediaUrls = mediaUrls;
            staffMediaPublicUrls = mediaUrls.map((m) => m.url);
          }

          await targetConvRef.collection("messages").doc(messageSid).set(outgoingMessageData);

          // Update thread parent - re-open if was closed
          await targetConvRef.set({
            canRespond: true,
            lastMessage: incomingMessage,
            lastMillis: Date.now(),
            lastType: "outgoing",
            hasMedia: numMedia > 0,
            threadStatus: "open",
            lastOutgoingMessageID: messageSid,
            lastOutgoingMessageStatus: "queued",
            lastOutgoingMillis: Date.now(),
            lastOutgoingSenderID: staffUser.id,
          }, { merge: true });

          // Send to customer via Twilio
          if (!twilioClient) {
            twilioClient = require("twilio")(
              twilioSecretAccountNumber.value(),
              twilioSecretKey.value().trim()
            );
          }
          const _tnStaff = (storeSettings?.storeInfo?.textingNumber || "").replace(/\D/g, "");
          const staffFromNumber = twilioData.To || (_tnStaff.length === 10 ? `+1${_tnStaff}` : "");
          if (!staffFromNumber) {
            log("No from number for staff-reply outbound - message stored in thread but not sent");
            return response.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
          }
          const twilioPayload = {
            body: incomingMessage,
            to: `+1${custPhone}`,
            from: staffFromNumber,
          };
          if (staffMediaPublicUrls.length > 0) twilioPayload.mediaUrl = staffMediaPublicUrls;
          await twilioClient.messages.create(twilioPayload);

          log("Staff-phone reply sent to customer", {
            senderID: staffUser.id,
            custPhone,
            messageSid,
            hasMedia: numMedia > 0,
          });

          return response.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        } catch (staffReplyError) {
          log("Error in staff-phone-reply branch - dropping silently", {
            error: staffReplyError.message,
            stack: staffReplyError.stack,
          });
          return response.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }
      }

      // ============================================================================
      // STEP 3: OPTIONAL CUSTOMER LOOKUP (metadata only, not for routing)
      // ============================================================================

      let customerData = { id: "", first: "Unknown", last: "", customerCell: normalizedPhone };

      try {
        const customersSnapshot = await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("customers")
          .where("customerCell", "==", normalizedPhone)
          .limit(1)
          .get();

        if (!customersSnapshot.empty) {
          const cust = customersSnapshot.docs[0].data();
          customerData = {
            id: cust.id || "",
            first: cust.first || "Unknown",
            last: cust.last || "",
            customerCell: cust.customerCell || normalizedPhone,
          };
          log("Customer found for incoming SMS", {
            customerID: customerData.id,
            customerName: `${customerData.first} ${customerData.last}`,
          });
        } else {
          log("No customer found - treating as unknown sender", { phone: normalizedPhone });
        }
      } catch (error) {
        log("Error looking up customer (non-fatal)", { error: error.message, phone: normalizedPhone });
      }

      // ============================================================================
      // STEP 4: CHECK THREAD STATUS & TIMEOUT
      // ============================================================================

      let canRespond = false;
      let threadStatus = "closed";
      let conversationData = {};

      try {
        // (storeSettings already loaded earlier for staff-reply detection)

        // Read thread state from parent doc (canonical source for canRespond and forwardTo)
        const parentDoc = await conversationRef.get();
        const parentData = parentDoc.exists ? parentDoc.data() : null;

        if (parentData && parentData.lastOutgoingMessageID) {
          canRespond = parentData.canRespond !== undefined ? !!parentData.canRespond : true;
          conversationData = { forwardTo: Array.isArray(parentData.forwardTo) ? parentData.forwardTo : [], translatedTo: parentData.translatedTo || "" };
          const lastOutgoingMillis = parentData.lastOutgoingMillis || parentData.lastMillis || 0;

          // Apply timeout check
          const lockTimeoutDays = storeSettings.smsConversationLockTimeout || 2;
          const lockTimeoutMs = lockTimeoutDays * 86400000;
          if (canRespond && lastOutgoingMillis > 0 && (lastOutgoingMillis + lockTimeoutMs < Date.now())) {
            canRespond = false;
            log("Conversation auto-closed due to timeout", {
              lastOutgoingMillis,
              lockTimeoutDays,
              elapsed: Date.now() - lastOutgoingMillis,
            });
          }
        } else {
          // No outgoing messages yet — new contact or incoming-only thread.
          // Allow through so the store can see the message and decide.
          canRespond = true;
          log("No outgoing messages found - allowing message through", { phone: normalizedPhone });
        }

        threadStatus = canRespond ? "open" : "closed";

        log("Thread status determined", { canRespond, threadStatus });
      } catch (error) {
        log("Error checking thread status", { error: error.message, customerID: customerData.id });
        // Continue processing - default to closed thread
      }

      // ============================================================================
      // STEP 5: HANDLE CLOSED THREAD - SEND AUTO-RESPONSE
      // ============================================================================

      if (!canRespond) {
        log("Thread closed - sending auto-response", { customerID: customerData.id, threadStatus });

        // Update parent doc so the app UI reflects the closed state
        try {
          await conversationRef.set({ canRespond: false, threadStatus: "closed" }, { merge: true });
        } catch (updateErr) {
          log("Error updating parent doc canRespond on auto-close", { error: updateErr.message });
        }

        // Send auto-response using TwiML
        let _si = storeSettings?.storeInfo || {};
        let _closedPhone = (_si.phone || "").replace(/\D/g, "");
        let _closedPhoneFmt = _closedPhone.length === 10 ? `(${_closedPhone.slice(0,3)}) ${_closedPhone.slice(3,6)}-${_closedPhone.slice(6)}` : "";
        let _closedEmail = _si.supportEmail || "";
        let _closedName = _si.displayName || "us";
        let closedMsg = storeSettings?.smsClosedThreadMessage || `Thank you for messaging ${_closedName}. Due to staffing limitations, we cannot keep messaging open for all return responses.${_closedPhoneFmt ? ` For immediate service please call ${_closedPhoneFmt}.` : ""}${_closedEmail ? ` You can also email us at ${_closedEmail}.` : ""} Thank you and we'll chat soon!`;
        const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${closedMsg}</Message>
</Response>`;

        return response.status(200).type("text/xml").send(twimlResponse);
      }

      // ============================================================================
      // STEP 6: STORE INCOMING MESSAGE (OPEN THREAD)
      // ============================================================================

      const incomingMessageData = {
        id: messageSid,
        customerID: customerData.id,
        firstName: customerData.first || "",
        lastName: customerData.last || "",
        phoneNumber: normalizedPhone,
        message: incomingMessage,
        millis: Date.now(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: "incoming",
        threadStatus: "open",
        read: false,
        hasMedia: numMedia > 0,
        numMedia,
        messageStatus,
        tenantID,
        storeID,
        messageSid,
        to: twilioData.From,
        from: twilioData.To,
      };

      // Download media from Twilio and store in Cloud Storage
      if (numMedia > 0) {
        const mediaUrls = [];
        const bucket = admin.storage().bucket(STORAGE_BUCKET);
        const accountSid = twilioSecretAccountNumber.value();
        const authToken = twilioSecretKey.value();
        const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

        for (let i = 0; i < numMedia; i++) {
          const twilioUrl = twilioData[`MediaUrl${i}`];
          const contentType = twilioData[`MediaContentType${i}`] || "application/octet-stream";
          if (!twilioUrl) continue;
          try {
            const mediaResponse = await fetch(twilioUrl, { headers: { Authorization: authHeader } });
            if (!mediaResponse.ok) throw new Error(`Twilio fetch failed: ${mediaResponse.status}`);
            const arrayBuffer = await mediaResponse.arrayBuffer();
            const rawBuffer = Buffer.from(arrayBuffer);

            const { compressedBuffer, thumbnailBuffer } = await compressImageServer(rawBuffer, contentType);

            if (compressedBuffer && thumbnailBuffer) {
              const mainPath = `${tenantID}/${storeID}/sms-media/${normalizedPhone}/${messageSid}_${i}.jpg`;
              const thumbPath = `${tenantID}/${storeID}/sms-media/${normalizedPhone}/thumbnails/${messageSid}_${i}.jpg`;
              const mainFile = bucket.file(mainPath);
              await mainFile.save(compressedBuffer, { contentType: "image/jpeg", metadata: { contentType: "image/jpeg" } });
              await mainFile.makePublic();
              const mainUrl = `https://storage.googleapis.com/${bucket.name}/${mainPath}`;
              const thumbFile = bucket.file(thumbPath);
              await thumbFile.save(thumbnailBuffer, { contentType: "image/jpeg", metadata: { contentType: "image/jpeg" } });
              await thumbFile.makePublic();
              const thumbUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`;
              mediaUrls.push({ url: mainUrl, thumbnailUrl: thumbUrl, contentType: "image/jpeg" });
              log("Compressed media saved", { index: i, originalSize: rawBuffer.length, compressedSize: compressedBuffer.length, thumbSize: thumbnailBuffer.length });
            } else {
              const ext = contentType.startsWith("image/jpeg") ? ".jpg"
                : contentType.startsWith("image/png") ? ".png"
                : contentType.startsWith("image/gif") ? ".gif"
                : contentType.startsWith("video/mp4") ? ".mp4"
                : contentType.startsWith("application/pdf") ? ".pdf"
                : "";
              const storagePath = `${tenantID}/${storeID}/sms-media/${normalizedPhone}/${messageSid}_${i}${ext}`;
              const file = bucket.file(storagePath);
              await file.save(rawBuffer, { contentType, metadata: { contentType } });
              await file.makePublic();
              const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
              mediaUrls.push({ url: publicUrl, contentType });
              log("Raw media saved (not compressed)", { index: i, storagePath, contentType });
            }
          } catch (mediaError) {
            log("Error downloading media from Twilio", { index: i, error: mediaError.message });
            mediaUrls.push({ url: twilioUrl, contentType, storageFailed: true });
          }
        }
        incomingMessageData.mediaUrls = mediaUrls;
      }

      try {
        await messageDocRef(messageSid).set(incomingMessageData);

        // Update conversation root with denormalized thread metadata
        await conversationRef.set({
          customerInfo: { id: customerData.id, first: customerData.first || "", last: customerData.last || "" },
          canRespond: canRespond,
          lastMessage: incomingMessage,
          lastMillis: Date.now(),
          lastType: "incoming",
          hasMedia: numMedia > 0,
          threadStatus: threadStatus,
          ...(customerData.first ? { customerFirst: customerData.first } : {}),
          ...(customerData.last ? { customerLast: customerData.last } : {}),
        }, { merge: true });

        log("Incoming message stored successfully", {
          phone: normalizedPhone,
          messageSid,
          customerID: customerData.id,
          path: `tenants/${tenantID}/stores/${storeID}/sms-messages/${normalizedPhone}/messages/${messageSid}`,
        });
      } catch (error) {
        log("Error storing incoming message", { error: error.message, messageSid, customerID: customerData.id });
        return response.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // ============================================================================
      // STEP 7: FLAG WORKORDERS & FORWARD SMS
      // ============================================================================

      try {
        // 7a: Set hasNewSMS on all open workorders for this customer
        if (customerData.id) {
          const woQuery = await db
            .collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("open-workorders")
            .where("customerID", "==", customerData.id)
            .get();

          if (!woQuery.empty) {
            const batch = db.batch();
            woQuery.docs.forEach((doc) => {
              batch.update(doc.ref, { hasNewSMS: true });
            });
            await batch.commit();
            log("Flagged workorders with hasNewSMS", { count: woQuery.size, customerID: customerData.id });
          }
        }

        // 7b: Forward SMS to all users in the forwardTo array
        const forwardTo = Array.isArray(conversationData.forwardTo) ? conversationData.forwardTo : [];
        if (forwardTo.length > 0) {
          if (!twilioClient) {
            twilioClient = require("twilio")(
              twilioSecretAccountNumber.value(),
              twilioSecretKey.value().trim()
            );
          }

          // Translate the incoming message to English if the conversation was using translation
          let forwardMessageText = incomingMessage;
          const conversationTranslatedTo = conversationData.translatedTo || "";
          if (conversationTranslatedTo && conversationTranslatedTo !== "en" && incomingMessage) {
            try {
              const { Translate } = require("@google-cloud/translate").v2;
              const translate = new Translate({ key: googleTranslateApiKey.value() });
              const [translated] = await translate.translate(incomingMessage, { to: "en", from: conversationTranslatedTo });
              forwardMessageText = translated;
              log("Translated incoming message for forwarding", { from: conversationTranslatedTo, to: "en", original: incomingMessage, translated });
            } catch (translateError) {
              log("Error translating for forward - using original", { error: translateError.message });
            }
          }

          let fwdFirst = (customerData.first || "").charAt(0).toUpperCase() + (customerData.first || "").slice(1).toLowerCase();
          let fwdLast = (customerData.last || "").charAt(0).toUpperCase() + (customerData.last || "").slice(1).toLowerCase();

          // ────────────────────────────────────────────────────────────────
          // APP LINK — branded short domain, gated on SHORT_LINK_PUBLIC_DOMAIN.
          // History: *.web.app short links were filtered by US carriers as
          // spam (Twilio 30007). Re-enabled 2026-05-25 with the requirement
          // that the link host is a branded domain registered with the 10DLC
          // campaign. When SHORT_LINK_PUBLIC_DOMAIN is empty the SMS goes out
          // without a link, so this is safe to deploy before the domain is
          // live.
          // ────────────────────────────────────────────────────────────────
          let appLink = "";
          if (SHORT_LINK_PUBLIC_DOMAIN) {
            try {
              appLink = await createShortLink(db, {
                tenantID,
                storeID,
                destination: `/phone?conv=${encodeURIComponent(normalizedPhone)}`,
              });
            } catch (linkErr) {
              log("Error creating short link (non-fatal, sending without link)", {
                error: linkErr.message,
              });
            }
          }

          let customerName = `${fwdFirst} ${fwdLast}`.trim();
          if (!customerName) customerName = "Customer";

          let forwardBody = `REPLY FROM ${customerName}:`;
          if (forwardMessageText) {
            forwardBody += `\n\n${forwardMessageText}\n`;
          }
          if (
            incomingMessageData.mediaUrls &&
            incomingMessageData.mediaUrls.length > 0
          ) {
            const mediaLinks = incomingMessageData.mediaUrls
              .map((m) => m.url)
              .join("\n");
            forwardBody += `\n${mediaLinks}`;
          }
          if (appLink) {
            forwardBody += `\n\nOpen in app: ${appLink}`;
          }

          let _tnFwd = (storeSettings?.storeInfo?.textingNumber || "").replace(/\D/g, "");
          const fromNumber = twilioData.To || (_tnFwd.length === 10 ? `+1${_tnFwd}` : "");
          if (!fromNumber) { log("No from number for forwarding, skipping"); return; }
          await Promise.all(forwardTo.map(async (entry) => {
            try {
              if (!entry || !entry.phone) return;
              await twilioClient.messages.create({
                body: forwardBody,
                to: `+1${entry.phone}`,
                from: fromNumber,
              });
              log("Forwarded SMS to user", { userID: entry.userID, userName: entry.first });

              // Write/overwrite the user-sms-pointer so this staff member can
              // reply via SMS from their phone (single-staff threads only;
              // multi-staff threads are gated off in the staff-reply branch).
              if (entry.userID) {
                try {
                  await db
                    .collection("tenants").doc(tenantID)
                    .collection("stores").doc(storeID)
                    .collection("user-sms-pointers").doc(entry.userID)
                    .set({
                      custPhone: normalizedPhone,
                      threadPath: `tenants/${tenantID}/stores/${storeID}/sms-messages/${normalizedPhone}`,
                      forwardedAtMs: Date.now(),
                    });
                } catch (pointerError) {
                  log("Error writing user-sms-pointer (non-fatal)", { userID: entry.userID, error: pointerError.message });
                }
              }
            } catch (fwdError) {
              log("Error forwarding SMS to user", { userID: entry?.userID, error: fwdError.message });
            }
          }));
        }
      } catch (step7Error) {
        log("Error in STEP 7 (flag/forward)", { error: step7Error.message, customerID: customerData.id });
      }

      // ============================================================================
      // STEP 8: RETURN SUCCESS RESPONSE
      // ============================================================================

      log("Incoming SMS processed successfully", {
        messageSid,
        customerID: customerData.id,
        processingTimeMs: Date.now() - requestStartTime,
        threadStatus: "open",
        storagePath: `tenants/${tenantID}/stores/${storeID}/sms-messages/${normalizedPhone}/messages/${messageSid}`,
      });

      // Return empty TwiML response (no auto-reply for open threads)
      return response
        .status(200)
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error) {
      // ============================================================================
      // GLOBAL ERROR HANDLER
      // ============================================================================

      log("Unhandled error in incomingSMSEnhanced", {
        error: error.message,
        stack: error.stack,
        requestBody: request.body,
      });

      // Log critical error for monitoring
      try {
        await db.collection("error-logs").add({
          function: "incomingSMSEnhanced",
          error: {
            message: error.message,
            stack: error.stack,
            code: error.code || "unknown",
          },
          requestData: request.body,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          severity: "critical",
        });
      } catch (logError) {
        log("Failed to log error to Firestore", logError);
      }

      // Return success to Twilio to prevent retries
      return response
        .status(200)
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  })
);

///////////////////////////////////////////////////////////////////////////////
// Short-link helpers + redirector
//
// SMS bodies include a `/r/{id}` URL that 302s to the real in-app destination
// (e.g., /phone?conv=<custPhone>). Keeps the SMS short and lets us change the
// landing URL format later without breaking already-sent links.
//
// Docs live in the top-level `short-links` collection. Each doc has an
// `expiresAt` Timestamp; a Firestore TTL policy on that field auto-deletes
// old docs (must be enabled manually in the console — code can't set TTL).
const SHORT_LINK_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SHORT_LINK_ID_LENGTH = 6;
const SHORT_LINK_TTL_DAYS = 30;

function generateShortLinkId() {
  const cryptoMod = require("crypto");
  const bytes = cryptoMod.randomBytes(SHORT_LINK_ID_LENGTH);
  let id = "";
  for (let i = 0; i < SHORT_LINK_ID_LENGTH; i++) {
    id += SHORT_LINK_ALPHABET[bytes[i] % SHORT_LINK_ALPHABET.length];
  }
  return id;
}

async function createShortLink(db, { tenantID, storeID, destination, ttlDays }) {
  const id = generateShortLinkId();
  const days = ttlDays || SHORT_LINK_TTL_DAYS;
  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + days * 24 * 60 * 60 * 1000);
  await db.collection("short-links").doc(id).set({
    destination,
    tenantID: tenantID || "",
    storeID: storeID || "",
    createdAtMs: nowMs,
    expiresAt,
  });
  const linkHost = SHORT_LINK_PUBLIC_DOMAIN || WEB_APP_URL;
  return `${linkHost}/r/${id}`;
}

exports.shortLinkRedirector = onRequest(
  {
    cors: false,
    secrets: [firebaseServiceAccountKey],
  },
  async (request, response) => {
    try {
      const db = await getDB(firebaseServiceAccountKey);

      // Hosting rewrite passes the original path through as request.path.
      // Accept either `/r/{id}` or bare `/{id}` for flexibility.
      const path = request.path || "";
      const match =
        path.match(/^\/?r\/([A-Za-z0-9]+)\/?$/) ||
        path.match(/^\/?([A-Za-z0-9]+)\/?$/);
      if (!match) {
        log("shortLinkRedirector: invalid path", { path });
        return response.redirect(302, `${WEB_APP_URL}/phone?error=invalid-link`);
      }
      const id = match[1];

      const docSnap = await db.collection("short-links").doc(id).get();
      if (!docSnap.exists) {
        log("shortLinkRedirector: link not found", { id });
        return response.redirect(302, `${WEB_APP_URL}/phone?error=expired-link`);
      }

      const data = docSnap.data() || {};
      const expiresAt = data.expiresAt;
      const expiresMs =
        expiresAt && typeof expiresAt.toMillis === "function"
          ? expiresAt.toMillis()
          : 0;
      if (expiresMs && expiresMs < Date.now()) {
        log("shortLinkRedirector: link expired", { id });
        return response.redirect(302, `${WEB_APP_URL}/phone?error=expired-link`);
      }

      const destination = data.destination || "/phone";
      const fullDestination = destination.startsWith("http")
        ? destination
        : `${WEB_APP_URL}${destination}`;

      log("shortLinkRedirector: redirecting", { id, destination: fullDestination });
      return response.redirect(302, fullDestination);
    } catch (err) {
      log("shortLinkRedirector: error", {
        error: err.message,
        stack: err.stack,
      });
      return response.redirect(302, `${WEB_APP_URL}/phone?error=link-error`);
    }
  }
);

///////////////////////////////////////////////////////////////////////////////
// utils
const sendSuccessfulResult = (response, body) =>
  response.status(200).send(JSON.stringify(body));

const sendUnsuccessfulResult = (response, body) =>
  response.status(500).send(JSON.stringify(body));

////////////////////////////////////////////////////////////////////////

function ftpReader() {
  // ftp reader
  // exports.readFTPFile = onRequest(
  //   { cors: true, secrets: [stripeSecretKey] },
  //   async (req, res) => {
  //     log("Incoming FTP read request");
  //     const client = new ftp.Client();
  //     client.ftp.verbose = true; // Optional: for debug logging
  //     //     Server                   : ftp.jbi.bike
  //     // Login name         : 121080
  //     // Password            : [REDACTED]
  //     try {
  //       // Connect to FTP server
  //       await client.access({
  //         host: "ftp.jbi.bike",
  //         user: "121080",
  //         password: "[REDACTED]",
  //         secure: false, // Set to true if using FTPS
  //       });
  //       // List files in the root directory
  //       log("Directory listing for FTP host:");
  //       const list = await client.list();
  //       list.forEach((item) => console.log(item.name));
  //       // Download a file (change 'file.txt' to your file name)
  //       await client.downloadTo("local-file.txt", "file.txt");
  //       log("File downloaded!");
  //       // Read the downloaded file
  //       const content = fs.readFileSync("local-file.txt", "utf8");
  //       log("File content for FTP transfer:");
  //       log(content);
  //     } catch (err) {
  //       console.error(err);
  //     }
  //     client.close();
  // );
  //   }
}
function ean13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function generateEAN13Barcode() {
  const arr = require('crypto').randomBytes(12);
  const digits = Array.from(arr, b => b % 10);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return digits.join('') + String(checkDigit);
}

// ============================================================================
// HTTPS CALLABLE VERSIONS OF ALL EXPORTED FUNCTIONS
// ============================================================================

/**
 * Callable version of getAvailableStripeReaders
 */
exports.getAvailableStripeReadersCallable = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    log("Incoming get available Stripe readers callable request", request.data);
    requireCallableAuth(request);

    try {
      const readers = await stripe.terminal.readers.list({});
      log("available Stripe readers", readers);

      return {
        success: true,
        data: readers,
        message: "Stripe readers retrieved successfully",
      };
    } catch (error) {
      log("Error getting Stripe readers", error);
      throw new HttpsError("internal", "Failed to retrieve Stripe readers");
    }
  }
);

/**
 * Callable version of initiateRefund
 */
exports.initiateRefundCallable = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    log("Incoming refund callable request", request.data);
    requireCallableAuth(request);

    const { paymentIntentID, amount } = request.data;

    if (!paymentIntentID || typeof paymentIntentID !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Payment Intent ID must be provided and must be a string."
      );
    }

    if (amount !== undefined && (typeof amount !== "number" || amount <= 0)) {
      throw new HttpsError(
        "invalid-argument",
        "If provided, refund amount must be a positive number in cents."
      );
    }

    try {
      // Create the refund using payment intent ID (Stripe recommended)
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentID,
        ...(amount ? { amount } : {}), // Optional partial refund
      });

      return {
        success: true,
        message: `✅ Refund ${
          amount ? `$${(amount / 100).toFixed(2)}` : "for full amount"
        } processed successfully.`,
        data: {
          refundId: refund.id,
          status: refund.status,
        },
      };
    } catch (error) {
      log("Error processing refund", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to process refund"
      );
    }
  }
);

/**
 * Callable version of initiatePaymentIntent
 */
exports.initiatePaymentIntentCallable = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    log(
      "Incoming process Stripe server-driven payment callable request",
      request.data
    );
    requireCallableAuth(request);

    const { amount, readerID, paymentIntentID, captureMethod } = request.data;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "Amount must be a positive number in cents."
      );
    }

    if (!readerID || typeof readerID !== "string") {
      throw new HttpsError("invalid-argument", "Reader ID must be provided.");
    }

    try {
      // first check to see if the reader is in use
      const reader = await stripe.terminal.readers.retrieve(readerID);

      // Offline/unreachable check
      if (reader.status && reader.status !== "online") {
        throw new HttpsError(
          "unavailable",
          "📴 Terminal is offline or unreachable."
        );
      }

      // Busy check
      const action = reader.action;
      if (action && action.type) {
        if (action.type === "process_payment_intent") {
          const currentPiId =
            action.process_payment_intent?.payment_intent || null;
          throw new HttpsError(
            "resource-exhausted",
            currentPiId
              ? `⏳ Reader is currently processing a different payment (PaymentIntent ${currentPiId}).`
              : "⏳ Reader is currently processing a different payment."
          );
        } else {
          throw new HttpsError(
            "resource-exhausted",
            `⏳ Reader is busy (${action.type}). Please wait or cancel current action on the reader.`
          );
        }
      }

      // 1. Create or reuse the PaymentIntent
      let paymentIntent;
      let finalPaymentIntentID;

      if (!paymentIntentID) {
        log("Getting a new payment intent");
        paymentIntent = await stripe.paymentIntents.create({
          amount,
          payment_method_types: ["card_present", "card", "link", "cashapp"],
          capture_method: captureMethod || "automatic",
          currency: "usd",
        });
        finalPaymentIntentID = paymentIntent.id;
      } else {
        log("Recycling the previous payment intent");
        finalPaymentIntentID = paymentIntentID;
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentID);
      }

      // 2. Process the PaymentIntent with the reader
      const processedIntent =
        await stripe.terminal.readers.processPaymentIntent(readerID, {
          payment_intent: paymentIntent.id,
        });

      // 3. Return success with client-side polling configuration
      const processedPaymentIntentID =
        processedIntent.action.process_payment_intent.payment_intent;
      log("Stripe payment successfully started", processedIntent);

      return {
        success: true,
        message: `✅ Payment of $${(amount / 100).toFixed(
          2
        )} processed successfully.`,
        data: {
          paymentIntentID: processedPaymentIntentID,
          readerID: processedIntent.id,
          status: processedIntent.status,
          pollingConfig: {
            enabled: true,
            databasePath: `PAYMENT-PROCESSING/${readerID}/${processedPaymentIntentID}`,
            pollingInterval: 3000,
            maxPollingTime: 300000,
            timeoutMessage:
              "Payment processing timeout - please check reader status",
            fallbackEnabled: true,
          },
        },
      };
    } catch (error) {
      log("Error processing payment intent", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to process payment intent"
      );
    }
  }
);

/**
 * Callable version of cancelServerDrivenStripePayment
 */
exports.cancelServerDrivenStripePaymentCallable = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    log(
      "Incoming cancel server driven Stripe payment callable request",
      request.data
    );
    requireCallableAuth(request);

    const { readerID } = request.data;

    if (!readerID || typeof readerID !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Reader ID must be provided and must be a string."
      );
    }

    try {
      // Verify the reader is online before attempting cancelAction
      const readerBefore = await stripe.terminal.readers.retrieve(readerID);
      if (readerBefore.status !== "online") {
        throw new HttpsError(
          "unavailable",
          "📴 Reader is offline or unreachable."
        );
      }

      const activeActionType = readerBefore.action?.type ?? null;
      log("Reader status before cancel:", {
        status: readerBefore.status,
        activeActionType,
      });

      // Reset the reader
      const readerAfter = await stripe.terminal.readers.cancelAction(readerID);

      log("Reader reset complete:", {
        readerId: readerAfter.id,
        status: readerAfter.status,
        actionAfter: readerAfter.action?.type ?? null,
      });

      return {
        success: true,
        message: `🧹 Reader reset complete!`,
        data: {
          readerId,
          readerStatus: readerAfter.status,
          reader: readerAfter,
        },
      };
    } catch (error) {
      log("Error resetting reader", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to reset reader"
      );
    }
  }
);

/**
 * Callable version of loginAppUser
 */
exports.loginAppUserCallable = onCall(
  { secrets: [firebaseServiceAccountKey] },
  async (request) => {
    log("Incoming login callable request");
    const auth = requireCallableAuth(request);

    // Initialize Firestore with service account
    const db = await getDB(firebaseServiceAccountKey);

    const email = auth.token.email;
    if (!email) {
      throw new HttpsError("invalid-argument", "Auth token missing email.");
    }

    try {
      // Look up user by their authenticated email
      const userRecord = await admin.auth().getUserByEmail(email);

      if (userRecord.disabled) {
        throw new HttpsError(
          "permission-denied",
          "❌ User account has been disabled."
        );
      }

      const userID = userRecord.uid;
      log("loginAppUserCallable looking up email_users for uid:", userID);

      // Look up user in email_users index (query by id field, fallback to doc ID)
      const emailUsersRef = db.collection("email_users");
      let emailUsersSnap = await emailUsersRef.where("id", "==", userID).limit(1).get();

      if (emailUsersSnap.empty) {
        // Fallback: try document ID = uid
        const directDoc = await emailUsersRef.doc(userID).get();
        if (!directDoc.exists) {
          log("email_users lookup failed for uid:", userID, "- not found by field or doc ID");
          throw new HttpsError("not-found", "❌ User or tenant not found.");
        }
        emailUsersSnap = { empty: false, docs: [directDoc] };
      }

      const userIndexData = emailUsersSnap.docs[0].data();
      log("loginAppUserCallable found user data:", JSON.stringify(userIndexData));
      const tenantID = userIndexData.tenantID;
      const storeID = userIndexData.storeID;

      if (!tenantID) {
        throw new HttpsError(
          "not-found",
          "❌ User is not associated with any tenant."
        );
      }

      if (!storeID) {
        throw new HttpsError(
          "not-found",
          "❌ User is not associated with any store."
        );
      }

      // Backfill custom claims if not already set
      const currentUser = await admin.auth().getUser(userID);
      const currentClaims = currentUser.customClaims || {};
      if (currentClaims.tenantID !== tenantID || currentClaims.storeID !== storeID) {
        await setUserCustomClaims(userID, tenantID, storeID);
        log("Claims set for user", { userID, tenantID, storeID });
      } else {
        log("Claims already current", { userID, tenantID, storeID });
      }

      // Read settings server-side (Admin SDK bypasses rules)
      const settingsDoc = await db.collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("settings").doc("settings").get();
      const settings = settingsDoc.exists ? settingsDoc.data() : null;

      return { success: true, tenantID, storeID, settings };
    } catch (error) {
      log("Error during login", error);

      if (error.code === "auth/user-not-found") {
        throw new HttpsError(
          "not-found",
          "❌ No account found with this email address."
        );
      } else if (error.code === "auth/wrong-password") {
        throw new HttpsError("unauthenticated", "❌ Incorrect password.");
      } else if (error.code === "auth/invalid-email") {
        throw new HttpsError(
          "invalid-argument",
          "❌ Invalid email address format."
        );
      } else if (error.code === "auth/user-disabled") {
        throw new HttpsError(
          "permission-denied",
          "❌ This account has been disabled."
        );
      } else if (error.code === "auth/too-many-requests") {
        throw new HttpsError(
          "resource-exhausted",
          "❌ Too many failed login attempts. Please try again later."
        );
      } else if (error.code === "permission-denied") {
        throw new HttpsError(
          "permission-denied",
          "❌ Insufficient permissions to access user data."
        );
      } else if (error.code === "not-found") {
        throw new HttpsError("not-found", "❌ User or tenant not found.");
      } else {
        throw new HttpsError(
          "internal",
          `❗ Unexpected error: ${error.message}`
        );
      }
    }
  }
);

/**
 * Callable version of createAppUser
 */
exports.createAppUserCallable = onCall(
  { secrets: [firebaseServiceAccountKey] },
  async (request) => {
    log("Incoming create app user callable request", request.data);
    requireCallableAuth(request);

    // Initialize Firestore with service account
    const db = await getDB(firebaseServiceAccountKey);

    const { email, password, tenantID, storeID, permissions } = request.data;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      throw new HttpsError(
        "invalid-argument",
        "Valid email address is required."
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "Password must be at least 6 characters long."
      );
    }

    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "Tenant ID is required.");
    }

    if (!storeID || typeof storeID !== "string") {
      throw new HttpsError("invalid-argument", "Store ID is required.");
    }

    requireTenantMatch(request, tenantID, storeID);

    try {


      // Check if tenant exists
      const tenantRef = db.collection("tenants").doc(tenantID);
      const tenantDoc = await tenantRef.get();

      if (!tenantDoc.exists) {
        throw new HttpsError("not-found", "Tenant not found.");
      }

      // Check if user already exists with this email
      const existingUserQuery = await db
        .collection("tenants")
        .doc(tenantID)
        .collection("stores")
        .doc(storeID)
        .collection("users")
        .where("email", "==", email)
        .get();

      if (!existingUserQuery.empty) {
        throw new HttpsError(
          "already-exists",
          "User with this email already exists in this tenant."
        );
      }

      // Create Firebase Auth user
      const userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: email,
        emailVerified: false,
      });

      const userID = userRecord.uid;

      // Create user document in Firestore under tenant
      const userData = {
        id: userID,
        email: email,
        displayName: email,
        tenantID: tenantID,
        permissions: permissions || {
          level: 1,
          canCreateUsers: false,
          canManageInventory: false,
          canProcessPayments: false,
          canViewReports: false,
        },
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: "system",
        lastLogin: null,
        emailVerified: false,
        metadata: {
          timezone: "America/New_York",
          language: "en",
          department: null,
          role: "user",
        },
      };

      await db
        .collection("tenants")
        .doc(tenantID)
        .collection("stores")
        .doc(storeID)
        .collection("users")
        .doc(userID)
        .set(userData);

      // Set custom claims for tenant isolation
      await setUserCustomClaims(userID, tenantID, storeID);

      // Create user index entry for quick lookup
      await db.collection("email_users").doc(userID).set({
        id: userID,
        email: email,
        tenantID: tenantID,
        storeID: storeID,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "active",
      });

      // Update tenant's user count
      await tenantRef.update({
        userCount: admin.firestore.FieldValue.increment(1),
        lastUserCreated: admin.firestore.FieldValue.serverTimestamp(),
      });

      log("App user created successfully", {
        userID,
        email,
        tenantID,
      });

      return {
        success: true,
        message: `✅ User ${email} created successfully for tenant ${tenantID}.`,
        data: {
          user: {
            id: userID,
            email: email,
            displayName: email,
            tenantID: tenantID,
            storeID: storeID,
            permissions: userData.permissions,
            status: "active",
            createdAt: userData.createdAt,
          },
        },
      };
    } catch (error) {
      log("Error creating app user", error);

      if (error.code === "auth/email-already-exists") {
        throw new HttpsError(
          "already-exists",
          "❌ User with this email already exists in Firebase Auth."
        );
      } else if (error.code === "auth/invalid-email") {
        throw new HttpsError(
          "invalid-argument",
          "❌ Invalid email address format."
        );
      } else if (error.code === "auth/weak-password") {
        throw new HttpsError(
          "invalid-argument",
          "❌ Password is too weak. Please use a stronger password."
        );
      } else if (error.code === "auth/operation-not-allowed") {
        throw new HttpsError(
          "permission-denied",
          "❌ Email/password accounts are not enabled."
        );
      } else if (error.code === "permission-denied") {
        throw new HttpsError(
          "permission-denied",
          "❌ Insufficient permissions to create user."
        );
      } else if (error.code === "not-found") {
        throw new HttpsError("not-found", "❌ Tenant not found.");
      } else {
        throw new HttpsError(
          "internal",
          `❗ Unexpected error: ${error.message}`
        );
      }
    }
  }
);

/**
 * Callable version of createStore
 */
exports.createStoreCallable = onCall(
  { secrets: [firebaseServiceAccountKey] },
  async (request) => {
    log("Incoming create store callable request", request.data);
    requireCallableAuth(request);

    // Initialize Firestore with service account
    const db = await getDB(firebaseServiceAccountKey);

    const { tenantID, storeID, storeName, createdBy } = request.data;

    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "Tenant ID is required.");
    }

    if (!storeID || typeof storeID !== "string") {
      throw new HttpsError("invalid-argument", "Store ID is required.");
    }

    if (!storeName || typeof storeName !== "string") {
      throw new HttpsError("invalid-argument", "Store name is required.");
    }

    requireTenantMatch(request, tenantID, storeID);

    try {


      // Check if tenant exists
      const tenantRef = db.collection("tenants").doc(tenantID);
      const tenantDoc = await tenantRef.get();

      if (!tenantDoc.exists) {
        throw new HttpsError("not-found", "Tenant not found.");
      }

      // Check if store already exists
      const storeRef = db
        .collection("tenants")
        .doc(tenantID)
        .collection("stores")
        .doc(storeID);
      const storeDoc = await storeRef.get();

      if (storeDoc.exists) {
        throw new HttpsError(
          "already-exists",
          "Store with this ID already exists in this tenant."
        );
      }

      // Create initial SETTINGS_OBJ data (abbreviated for brevity)
      const initialSettings = {
        storeID: storeID,
        storeName: storeName,
        tenantID: tenantID,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: createdBy || "system",
        status: "active",
        // ... other default settings would go here
      };

      // Create store document in Firestore
      await storeRef.set(initialSettings);

      // Update tenant's store count
      await tenantRef.update({
        storeCount: admin.firestore.FieldValue.increment(1),
        lastStoreCreated: admin.firestore.FieldValue.serverTimestamp(),
      });

      log("Store created successfully", {
        tenantID,
        storeID,
        storeName,
      });

      return {
        success: true,
        message: `✅ Store ${storeName} created successfully for tenant ${tenantID}.`,
        data: {
          store: {
            id: storeID,
            name: storeName,
            tenantID: tenantID,
            status: "active",
            createdAt: initialSettings.createdAt,
            settings: initialSettings,
          },
        },
      };
    } catch (error) {
      log("Error creating store", error);

      if (error.code === "permission-denied") {
        throw new HttpsError(
          "permission-denied",
          "❌ Insufficient permissions to create store."
        );
      } else if (error.code === "not-found") {
        throw new HttpsError("not-found", "❌ Tenant not found.");
      } else if (error.code === "already-exists") {
        throw new HttpsError(
          "already-exists",
          "❌ Store with this ID already exists."
        );
      } else {
        throw new HttpsError(
          "internal",
          `❗ Unexpected error: ${error.message}`
        );
      }
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// NEW CHECKOUT SYSTEM — Cloud Functions
// Prefix: newCheckout
// ═══════════════════════════════════════════════════════════════

/**
 * newCheckoutGetAvailableReadersCallable
 * Lists all Stripe Terminal readers and their status.
 */
exports.newCheckoutGetAvailableReadersCallable = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    log("newCheckout: get available readers request", request.data);
    requireCallableAuth(request);

    try {
      const stripeClient = Stripe(stripeSecretKey.value());
      const readers = await stripeClient.terminal.readers.list({});
      return {
        success: true,
        data: readers,
        message: "Readers retrieved successfully",
      };
    } catch (error) {
      log("newCheckout: error getting readers", error.message);
      throw new HttpsError("internal", "Failed to retrieve Stripe readers");
    }
  }
);

/**
 * newCheckoutInitiatePaymentIntentCallable
 * Creates a PaymentIntent and processes it on the specified reader.
 * Input: { amount (cents), readerID, paymentIntentID? }
 */
exports.newCheckoutInitiatePaymentIntentCallable = onCall(
  { secrets: [stripeSecretKey], minInstances: 1 },
  async (request) => {
    log("newCheckout: initiate payment intent request", request.data);

    const { amount, readerID, paymentIntentID, tenantID, storeID, saleID, customerID, customerEmail, transactionID, salesTax } = request.data;
    requireTenantMatch(request, tenantID, storeID);

    if (!amount || typeof amount !== "number" || amount <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "Amount must be a positive number in cents."
      );
    }

    if (!readerID || typeof readerID !== "string") {
      throw new HttpsError("invalid-argument", "Reader ID must be provided.");
    }

    if (!tenantID || !storeID) {
      throw new HttpsError(
        "invalid-argument",
        "Tenant and store IDs must be provided."
      );
    }

    try {
      const stripeClient = Stripe(stripeSecretKey.value());

      // Check reader status
      const reader = await stripeClient.terminal.readers.retrieve(readerID);

      if (reader.status && reader.status !== "online") {
        throw new HttpsError(
          "unavailable",
          "Terminal is offline or unreachable."
        );
      }

      // Check if reader is busy
      const action = reader.action;
      if (action && action.type) {
        if (action.type === "process_payment_intent") {
          const currentPiId =
            action.process_payment_intent?.payment_intent || null;
          throw new HttpsError(
            "resource-exhausted",
            currentPiId
              ? `Reader is currently processing payment ${currentPiId}.`
              : "Reader is currently processing a different payment."
          );
        } else {
          throw new HttpsError(
            "resource-exhausted",
            `Reader is busy (${action.type}). Please wait or cancel current action.`
          );
        }
      }

      // Create or reuse PaymentIntent
      let paymentIntent;
      let finalPaymentIntentID;

      if (!paymentIntentID) {
        const piParams = {
          amount,
          payment_method_types: ["card_present"],
          capture_method: "automatic",
          currency: "usd",
          metadata: { tenantID, storeID, saleID: saleID || "", customerID: customerID || "", transactionID: transactionID || "", salesTax: String(salesTax || 0) },
        };
        if (customerEmail) piParams.receipt_email = customerEmail;
        paymentIntent = await stripeClient.paymentIntents.create(piParams);
        finalPaymentIntentID = paymentIntent.id;
      } else {
        finalPaymentIntentID = paymentIntentID;
        paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentID);
      }

      // Process the PaymentIntent with the reader
      const processedIntent =
        await stripeClient.terminal.readers.processPaymentIntent(readerID, {
          payment_intent: paymentIntent.id,
        });

      const processedPaymentIntentID =
        processedIntent.action.process_payment_intent.payment_intent;

      log("newCheckout: payment started successfully", processedIntent);

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
            timeoutMessage:
              "Payment processing timeout - please check reader status",
            fallbackEnabled: true,
          },
        },
      };
    } catch (error) {
      log("newCheckout: error initiating payment", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        error.message || "Failed to initiate payment"
      );
    }
  }
);

/**
 * newCheckoutProcessRefundCallable
 * Processes a refund for a given payment intent.
 * Input: { paymentIntentID, amount (cents, optional for partial) }
 * Optional (new architecture): { transactionID, tenantID, storeID, refundId, method, salesTax, workorderLines, notes }
 * If transactionID is provided, writes the refund object to the payment transaction in Firestore.
 */
exports.newCheckoutProcessRefundCallable = onCall(
  { secrets: [stripeSecretKey, firebaseServiceAccountKey] },
  async (request) => {
    log("newCheckout: process refund request", request.data);
    requireCallableAuth(request);

    const { paymentIntentID, chargeID, amount, transactionID, tenantID, storeID, refundId, method, salesTax, workorderLines, notes } = request.data;

    if (tenantID && storeID) {
      requireTenantMatch(request, tenantID, storeID);
    }

    if ((!paymentIntentID || typeof paymentIntentID !== "string") && (!chargeID || typeof chargeID !== "string")) {
      throw new HttpsError(
        "invalid-argument",
        "Payment Intent ID or Charge ID must be provided."
      );
    }

    if (amount !== undefined && (typeof amount !== "number" || amount <= 0)) {
      throw new HttpsError(
        "invalid-argument",
        "If provided, refund amount must be a positive number in cents."
      );
    }

    try {
      const stripeClient = Stripe(stripeSecretKey.value());

      // Validate refund amount against original charge before processing
      if (amount) {
        let charge;
        if (chargeID) {
          charge = await stripeClient.charges.retrieve(chargeID);
        } else {
          const pi = await stripeClient.paymentIntents.retrieve(paymentIntentID);
          if (pi.latest_charge) {
            charge = await stripeClient.charges.retrieve(pi.latest_charge);
          }
        }
        if (charge) {
          const refundable = charge.amount - charge.amount_refunded;
          if (amount > refundable) {
            throw new HttpsError("invalid-argument", `Refund amount (${amount}) exceeds refundable balance (${refundable}).`);
          }
        }
      }

      const refundParams = { ...(amount ? { amount } : {}) };
      if (paymentIntentID) {
        refundParams.payment_intent = paymentIntentID;
      } else {
        refundParams.charge = chargeID;
      }
      const refund = await stripeClient.refunds.create(refundParams);

      // If transactionID provided, write refund to the transaction document
      let refundObj = null;
      if (transactionID && tenantID && storeID) {
        const db = await getDB(firebaseServiceAccountKey);
        const txnRef = db.collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("transactions").doc(transactionID);

        const txnSnap = await txnRef.get();
        if (txnSnap.exists) {
          const txnData = txnSnap.data();
          refundObj = {
            id: refundId || "",
            transactionID,
            amount: amount || refund.amount,
            method: method || "card",
            millis: Date.now(),
            salesTax: salesTax || 0,
            stripeRefundID: refund.id,
            workorderLines: workorderLines || [],
            notes: notes || "",
          };
          const refunds = txnData.refunds || [];
          refunds.push(refundObj);

          // Retry Firestore write up to 3 times
          let written = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await txnRef.update({ refunds });
              written = true;
              break;
            } catch (writeErr) {
              log(`newCheckout: refund write attempt ${attempt}/3 failed:`, writeErr.message);
            }
          }
          if (!written) log("newCheckout: refund write failed after 3 attempts", { transactionID, refundId });
        } else {
          log("newCheckout: transaction not found for refund write:", transactionID);
        }
      }

      return {
        success: true,
        message: `Refund ${
          amount ? `$${(amount / 100).toFixed(2)}` : "for full amount"
        } processed successfully.`,
        data: {
          refundId: refund.id,
          status: refund.status,
          refundObj,
        },
      };
    } catch (error) {
      log("newCheckout: error processing refund", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to process refund"
      );
    }
  }
);

/**
 * processCashRefundCallable
 * Server-side validation and persistence for cash refunds.
 * Validates refund amount against original cash transaction before writing.
 */
exports.processCashRefundCallable = onCall(
  { secrets: [firebaseServiceAccountKey] },
  async (request) => {
    log("processCashRefund: request", request.data);

    const { transactionID, refundObj, tenantID, storeID } = request.data;
    requireTenantMatch(request, tenantID, storeID);

    if (!transactionID || typeof transactionID !== "string") {
      throw new HttpsError("invalid-argument", "Transaction ID is required.");
    }
    if (!refundObj || typeof refundObj !== "object" || !refundObj.amount || refundObj.amount <= 0) {
      throw new HttpsError("invalid-argument", "Valid refund object with positive amount is required.");
    }
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "Tenant and store IDs are required.");
    }

    const db = await getDB(firebaseServiceAccountKey);

    const txnRef = db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("transactions").doc(transactionID);

    const txnSnap = await txnRef.get();
    if (!txnSnap.exists) {
      throw new HttpsError("not-found", "Transaction not found.");
    }

    const txnData = txnSnap.data();
    const existingRefunds = txnData.refunds || [];
    const alreadyRefunded = existingRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
    const refundable = (txnData.amountCaptured || 0) - alreadyRefunded;

    if (refundObj.amount > refundable) {
      throw new HttpsError("invalid-argument", `Refund amount (${refundObj.amount}) exceeds refundable balance (${refundable}).`);
    }

    existingRefunds.push(refundObj);

    let written = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await txnRef.update({ refunds: existingRefunds });
        written = true;
        break;
      } catch (writeErr) {
        log(`processCashRefund: write attempt ${attempt}/3 failed:`, writeErr.message);
      }
    }

    if (!written) {
      throw new HttpsError("internal", "Failed to write refund after 3 attempts.");
    }

    return { success: true, totalRefunds: existingRefunds.length };
  }
);

/**
 * newCheckoutCancelPaymentCallable
 * Cancels the current action on a Stripe Terminal reader.
 * Input: { readerID }
 */
exports.newCheckoutCancelPaymentCallable = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    log("newCheckout: cancel payment request", request.data);
    requireCallableAuth(request);

    const { readerID } = request.data;

    if (!readerID || typeof readerID !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Reader ID must be provided."
      );
    }

    try {
      const stripeClient = Stripe(stripeSecretKey.value());

      const readerBefore = await stripeClient.terminal.readers.retrieve(readerID);
      if (readerBefore.status !== "online") {
        throw new HttpsError(
          "unavailable",
          "Reader is offline or unreachable."
        );
      }

      const readerAfter = await stripeClient.terminal.readers.cancelAction(readerID);

      return {
        success: true,
        message: "Reader reset complete.",
        data: {
          readerId: readerAfter.id,
          readerStatus: readerAfter.status,
          reader: readerAfter,
        },
      };
    } catch (error) {
      log("newCheckout: error cancelling payment", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        error.message || "Failed to reset reader"
      );
    }
  }
);

// ── Manual Card Entry (keyed-in card payment, no terminal reader) ──────────

exports.newCheckoutManualCardPaymentCallable = onCall(
  { secrets: [stripeSecretKey, firebaseServiceAccountKey] },
  async (request) => {
    log("newCheckout: manual card payment request", {
      amount: request.data?.amount,
      saleID: request.data?.saleID,
    });

    const { amount, paymentMethodID, tenantID, storeID, saleID, customerID, customerEmail, transactionID } = request.data;
    requireTenantMatch(request, tenantID, storeID);

    if (!amount || typeof amount !== "number" || amount < 50) {
      throw new HttpsError("invalid-argument", "Amount must be at least $0.50 (50 cents).");
    }
    if (!paymentMethodID) {
      throw new HttpsError("invalid-argument", "Payment method ID is required.");
    }
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "Tenant and store IDs are required.");
    }

    // Validate payment amount against sale total when available
    if (saleID) {
      const db = await getDB(firebaseServiceAccountKey);
      const saleSnap = await db.collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("active-sales").doc(saleID).get();
      if (saleSnap.exists) {
        const sale = saleSnap.data();
        const remaining = (sale.total || 0) - (sale.amountCaptured || 0);
        if (amount > remaining && remaining > 0) {
          throw new HttpsError("invalid-argument", `Payment amount (${amount}) exceeds remaining balance (${remaining}).`);
        }
      }
    }

    const stripeClient = Stripe(stripeSecretKey.value());

    try {
      // Create + confirm PaymentIntent with client-tokenized PaymentMethod
      const piParams = {
        amount: Number(amount),
        currency: "usd",
        payment_method: paymentMethodID,
        payment_method_types: ["card"],
        confirm: true,
        capture_method: "automatic",
        metadata: {
          tenantID,
          storeID,
          saleID: saleID || "",
          customerID: customerID || "",
          transactionID: transactionID || "",
          entryMethod: "manual",
        },
      };
      if (customerEmail) piParams.receipt_email = customerEmail;
      const paymentIntent = await stripeClient.paymentIntents.create(piParams);

      // 3. Handle result
      if (paymentIntent.status === "succeeded") {
        const chargeID = paymentIntent.latest_charge;
        const charge = await stripeClient.charges.retrieve(chargeID);

        log("newCheckout: manual card payment succeeded", { chargeID, paymentIntentID: paymentIntent.id });

        return {
          success: true,
          data: {
            charge,
            paymentIntentID: paymentIntent.id,
          },
        };
      }

      // requires_action, requires_payment_method, etc.
      return {
        success: false,
        message: "Card requires additional verification — use the physical reader instead.",
        status: paymentIntent.status,
      };
    } catch (error) {
      log("newCheckout: manual card payment error", error.message);

      // Return Stripe error details so the client can display them
      return {
        success: false,
        message: error.message || "Payment failed",
        code: error.code || "",
        decline_code: error.decline_code || "",
        type: error.type || "",
      };
    }
  }
);

// ============================================================================
// LIGHTSPEED RETAIL R-SERIES API INTEGRATION
// ============================================================================

const LIGHTSPEED_OAUTH_URL = "https://cloud.lightspeedapp.com/auth/oauth/authorize";
const LIGHTSPEED_TOKEN_URL = "https://cloud.lightspeedapp.com/auth/oauth/token";
const LIGHTSPEED_API_BASE = "https://api.lightspeedapp.com/API/V3/Account";
const LIGHTSPEED_CALLBACK_URL = `${FUNCTIONS_BASE_URL}/lightspeedOAuthCallback`;

// --- Lightspeed Helpers (internal) ---

async function refreshLightspeedToken(db, tenantID, storeID) {
  const docRef = db.collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("integrations").doc("lightspeed");
  const doc = await docRef.get();
  if (!doc.exists) throw new Error("No Lightspeed integration found");

  const data = doc.data();
  const res = await fetch(LIGHTSPEED_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refreshToken,
      client_id: lightspeedClientId.value(),
      client_secret: lightspeedClientSecret.value(),
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    log("Lightspeed token refresh failed", errText);
    throw new Error("Token refresh failed: " + errText);
  }

  const tokens = await res.json();
  const updated = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || data.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in * 1000),
  };
  await docRef.update(updated);
  return updated.accessToken;
}

async function getLightspeedToken(db, tenantID, storeID) {
  const docRef = db.collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("integrations").doc("lightspeed");
  const doc = await docRef.get();
  if (!doc.exists) throw new Error("No Lightspeed integration found");

  const data = doc.data();
  if (Date.now() >= data.expiresAt - 60000) {
    return await refreshLightspeedToken(db, tenantID, storeID);
  }
  return data.accessToken;
}

async function lightspeedGet(accessToken, accountID, endpoint, params = {}) {
  const url = new URL(`${LIGHTSPEED_API_BASE}/${accountID}/${endpoint}.json`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Rate limit handling
  const bucketLevel = res.headers.get("x-ls-api-bucket-level");
  if (bucketLevel) {
    const [current, max] = bucketLevel.split("/").map(Number);
    if (current > 80) {
      log("Lightspeed rate limit high, waiting 5s", bucketLevel);
      await new Promise(r => setTimeout(r, 5000));
    } else if (current > 70) {
      log("Lightspeed rate limit approaching, waiting 2s", bucketLevel);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lightspeed API error ${res.status}: ${errText}`);
  }

  return await res.json();
}

async function lightspeedGetAll(accessToken, accountID, endpoint, params = {}) {
  let allItems = [];
  const limit = 100;
  const key = endpoint.replace(/\?.*/g, "");

  // First request uses the normal URL
  let nextUrl = null;
  let isFirst = true;

  while (true) {
    let data;
    if (isFirst) {
      data = await lightspeedGet(accessToken, accountID, endpoint, {
        ...params,
        limit: limit.toString(),
      });
      isFirst = false;
    } else {
      // Subsequent requests use the "next" URL directly
      const res = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const bucketLevel = res.headers.get("x-ls-api-bucket-level");
      if (bucketLevel) {
        const [current] = bucketLevel.split("/").map(Number);
        if (current > 80) await new Promise(r => setTimeout(r, 5000));
        else if (current > 70) await new Promise(r => setTimeout(r, 2000));
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Lightspeed API error ${res.status}: ${errText}`);
      }
      data = await res.json();
    }

    const items = data[key];
    if (!items) break;

    const arr = Array.isArray(items) ? items : [items];
    allItems = allItems.concat(arr);

    const attrs = data["@attributes"];
    const total = attrs?.count || "?";
    log("[" + key + "] Fetched " + allItems.length + " / " + total + " records");
    if (!attrs || allItems.length >= parseInt(attrs.count)) break;

    // Use cursor-based "next" URL for pagination
    if (attrs.next) {
      nextUrl = attrs.next;
    } else {
      break;
    }
  }

  return allItems;
}

function buildCSV(headers, rows) {
  function escapeCell(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    return '"' + str.replace(/"/g, '""') + '"';
  }
  const headerLine = headers.map(escapeCell).join(",");
  const dataLines = rows.map(row => row.map(escapeCell).join(","));
  return [headerLine, ...dataLines].join("\n");
}

async function uploadCSVToStorage(csvString, storagePath) {
  const bucket = admin.storage().bucket(STORAGE_BUCKET);
  const file = bucket.file(storagePath);
  await file.save(csvString, {
    contentType: "text/csv",
    metadata: { contentDisposition: `attachment; filename="${storagePath.split("/").pop()}"` },
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${STORAGE_BUCKET}/${storagePath}`;
}

async function streamLightspeedCSVToStorage(accessToken, accountID, endpoint, params, headers, rowMapper, storagePath, lsLog) {
  const bucket = admin.storage().bucket(STORAGE_BUCKET);
  const file = bucket.file(storagePath);
  const writeStream = file.createWriteStream({
    contentType: "text/csv",
    metadata: { contentDisposition: `attachment; filename="${storagePath.split("/").pop()}"` },
    resumable: false,
  });

  function escapeCell(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    return '"' + str.replace(/"/g, '""') + '"';
  }

  writeStream.write(headers.map(escapeCell).join(",") + "\n");

  let totalRows = 0;
  const limit = 1000;
  const key = endpoint.replace(/\?.*/g, "");
  let nextUrl = null;
  let isFirst = true;
  let pageNum = 0;

  while (true) {
    let data;
    if (isFirst) {
      data = await lightspeedGet(accessToken, accountID, endpoint, { ...params, limit: limit.toString() });
      isFirst = false;
    } else {
      const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const bucketLevel = res.headers.get("x-ls-api-bucket-level");
      if (bucketLevel) {
        const [current] = bucketLevel.split("/").map(Number);
        if (current > 80) await new Promise(r => setTimeout(r, 5000));
        else if (current > 70) await new Promise(r => setTimeout(r, 2000));
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Lightspeed API error ${res.status}: ${errText}`);
      }
      data = await res.json();
    }

    const items = data[key];
    if (!items) break;

    const arr = Array.isArray(items) ? items : [items];
    for (const item of arr) {
      const row = rowMapper(item);
      writeStream.write(row.map(escapeCell).join(",") + "\n");
    }
    totalRows += arr.length;
    pageNum++;
    await lsLog("Page " + pageNum + ": " + arr.length + " rows (" + totalRows + " total)...");

    const attrs = data["@attributes"];
    if (!attrs || totalRows >= parseInt(attrs.count)) break;
    if (attrs.next) {
      nextUrl = attrs.next.replace(/limit=\d+/, "limit=" + limit);
    } else {
      break;
    }
  }

  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    writeStream.end();
  });

  await file.makePublic();
  const url = `https://storage.googleapis.com/${STORAGE_BUCKET}/${storagePath}`;
  return { url, totalRows };
}

function lsCleanPhone(str) {
  if (!str) return "";
  const digits = str.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") return digits.slice(1);
  return digits.length === 10 ? digits : "";
}

// --- Lightspeed OAuth: Initiate ---

exports.lightspeedInitiateAuth = onCall(
  { secrets: [lightspeedClientId, firebaseServiceAccountKey] },
  async (request) => {
    log("Lightspeed: initiate auth", request.data);
    const { tenantID, storeID } = request.data;
    requireTenantMatch(request, tenantID, storeID);
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID required");
    }

    const state = Buffer.from(JSON.stringify({ tenantID, storeID })).toString("base64");
    const authUrl = `${LIGHTSPEED_OAUTH_URL}?response_type=code&client_id=${lightspeedClientId.value()}&scope=employee:all&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(LIGHTSPEED_CALLBACK_URL)}`;

    return { success: true, authUrl };
  }
);

// --- Lightspeed OAuth: Callback (HTTP endpoint) ---

exports.lightspeedOAuthCallback = onRequest(
  { cors: true, secrets: [lightspeedClientId, lightspeedClientSecret, firebaseServiceAccountKey] },
  async (req, res) => {
    log("Lightspeed: OAuth callback", { query: req.query });

    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send("Missing code or state parameter");
    }

    let tenantID, storeID;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
      tenantID = decoded.tenantID;
      storeID = decoded.storeID;
    } catch (e) {
      return res.status(400).send("Invalid state parameter");
    }

    // Exchange code for tokens
    const tokenRes = await fetch(LIGHTSPEED_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: lightspeedClientId.value(),
        client_secret: lightspeedClientSecret.value(),
        redirect_uri: LIGHTSPEED_CALLBACK_URL,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      log("Lightspeed: token exchange failed", errText);
      return res.status(500).send("Token exchange failed: " + errText);
    }

    const tokens = await tokenRes.json();
    log("Lightspeed: token exchange success", { hasAccess: !!tokens.access_token });

    // Get account ID from the token response or from an API call
    let accountID = "";
    try {
      const accountRes = await fetch(`${LIGHTSPEED_API_BASE}.json`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const accountData = await accountRes.json();
      if (accountData.Account) {
        accountID = Array.isArray(accountData.Account)
          ? accountData.Account[0].accountID
          : accountData.Account.accountID;
      }
    } catch (e) {
      log("Lightspeed: could not fetch account ID", e.message);
    }

    // Save tokens to Firestore
    const db = await getDB(firebaseServiceAccountKey);
    await db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("integrations").doc("lightspeed")
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
        accountID,
        connectedAt: Date.now(),
      });

    log("Lightspeed: tokens saved to Firestore", { tenantID, storeID, accountID });

    res.status(200).send(`
      <html>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <div style="text-align:center;">
            <h2>Connected to Lightspeed!</h2>
            <p>You can close this tab and return to the app.</p>
          </div>
        </body>
      </html>
    `);
  }
);

// --- Lightspeed: Check Connection ---

exports.lightspeedCheckConnection = onCall(
  { secrets: [lightspeedClientId, lightspeedClientSecret, firebaseServiceAccountKey] },
  async (request) => {
    log("Lightspeed: check connection", request.data);
    const { tenantID, storeID } = request.data;
    requireTenantMatch(request, tenantID, storeID);
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID required");
    }

    const db = await getDB(firebaseServiceAccountKey);
    const docRef = db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("integrations").doc("lightspeed");
    const doc = await docRef.get();

    if (!doc.exists) {
      return { connected: false, error: "Not connected" };
    }

    try {
      const accessToken = await getLightspeedToken(db, tenantID, storeID);
      const data = doc.data();
      const accountRes = await lightspeedGet(accessToken, data.accountID, "");
      const accountName = accountRes.Account ? accountRes.Account.name : "";
      return { connected: true, accountName };
    } catch (e) {
      log("Lightspeed: connection check failed", e.message);
      return { connected: false, error: e.message };
    }
  }
);

// --- Lightspeed: Import Data ---

exports.lightspeedImportData = onCall(
  {
    secrets: [lightspeedClientId, lightspeedClientSecret, firebaseServiceAccountKey],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (request) => {
    log("Lightspeed: import data", request.data);
    const { tenantID, storeID, importType, saveToDB, resetLogs } = request.data;
    requireTenantMatch(request, tenantID, storeID);
    if (!tenantID || !storeID || !importType) {
      throw new HttpsError("invalid-argument", "tenantID, storeID, and importType required");
    }

    const db = await getDB(firebaseServiceAccountKey);
    const docData = (await db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("integrations").doc("lightspeed").get()).data();

    if (!docData) throw new HttpsError("not-found", "Lightspeed not connected");

    const accessToken = await getLightspeedToken(db, tenantID, storeID);
    const accountID = docData.accountID;
    const basePath = `tenants/${tenantID}/stores/${storeID}`;

    let result = { success: true };

    // --- Dev logging to Firestore for real-time frontend streaming ---
    const logDocRef = db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("dev-logs").doc("lightspeed-import");
    const logDoc = await logDocRef.get();
    if (!logDoc.exists) {
      await logDocRef.set({ logs: [], status: "running", startedAt: Date.now() });
    } else {
      await logDocRef.update({ status: "running" });
    }

    async function lsLog(message, type = "info") {
      try {
        log("Lightspeed:", message);
        await logDocRef.update({
          logs: admin.firestore.FieldValue.arrayUnion({
            t: Date.now(),
            msg: message,
            type,
          }),
        });
      } catch (e) { /* don't let logging errors break the import */ }
    }

    // Pick N random unique indices from an array, return { indices, items }
    function pickRandomSample(arr, count = 5) {
      const indices = [];
      const max = arr.length;
      while (indices.length < Math.min(count, max)) {
        const i = Math.floor(Math.random() * max);
        if (!indices.includes(i)) indices.push(i);
      }
      indices.sort((a, b) => a - b);
      return { indices, items: indices.map(i => arr[i]) };
    }

    try {

    // =====================================================================
    // CUSTOMERS IMPORT
    // =====================================================================
    if (importType === "customers") {
      await lsLog("Fetching customers from Lightspeed API...");
      const lsCustomers = await lightspeedGetAll(accessToken, accountID, "Customer", {
        load_relations: "all",
      });
      await lsLog("Fetched " + lsCustomers.length + " customers");

      // Sample 5 raw objects for Cloud Console debug
      const rawSample = pickRandomSample(lsCustomers, 5);
      log("Lightspeed RAW CUSTOMERS (5 random):", JSON.stringify(rawSample.items, null, 2));

      // Map to app proto
      const mapped = [];
      for (const c of lsCustomers) {
        let customerCell = "";
        let customerLandline = "";

        if (c.Contact && c.Contact.Phones && c.Contact.Phones.ContactPhone) {
          const phones = Array.isArray(c.Contact.Phones.ContactPhone)
            ? c.Contact.Phones.ContactPhone
            : [c.Contact.Phones.ContactPhone];
          for (const p of phones) {
            const clean = lsCleanPhone(p.number);
            if (!clean) continue;
            if (!customerCell) { customerCell = clean; }
            else if (!customerLandline) { customerLandline = clean; break; }
          }
        }

        let email = "";
        if (c.Contact && c.Contact.Emails && c.Contact.Emails.ContactEmail) {
          const emails = Array.isArray(c.Contact.Emails.ContactEmail)
            ? c.Contact.Emails.ContactEmail
            : [c.Contact.Emails.ContactEmail];
          if (emails.length > 0 && emails[0].address) {
            email = emails[0].address;
          }
        }

        let streetAddress = "", city = "", state = "", zip = "", unit = "";
        if (c.Contact && c.Contact.Addresses && c.Contact.Addresses.ContactAddress) {
          const addrs = Array.isArray(c.Contact.Addresses.ContactAddress)
            ? c.Contact.Addresses.ContactAddress
            : [c.Contact.Addresses.ContactAddress];
          if (addrs.length > 0) {
            const a = addrs[0];
            streetAddress = a.address1 || "";
            unit = a.address2 || "";
            city = a.city || "";
            state = a.state || "";
            zip = a.zip || "";
          }
        }

        const id = db.collection("_").doc().id;

        mapped.push({
          first: (c.firstName || "").toLowerCase(),
          last: (c.lastName || "").toLowerCase(),
          customerCell,
          customerLandline,
          contactRestriction: "",
          email,
          streetAddress,
          unit,
          city,
          state,
          zip,
          addressNotes: "",
          id,
          interactionRating: "",
          workorders: [],
          previousBikes: [],
          sales: [],
          millisCreated: c.createTime ? new Date(c.createTime).getTime() : "",
        });
      }

      // Deduplicate by phone
      const phoneMap = new Map();
      const noPhone = [];
      for (const cust of mapped) {
        if (!cust.customerCell) { noPhone.push(cust); continue; }
        if (phoneMap.has(cust.customerCell)) {
          const existing = phoneMap.get(cust.customerCell);
          const existingFilled = Object.values(existing).filter(v => v !== "" && v !== 0).length;
          const newFilled = Object.values(cust).filter(v => v !== "" && v !== 0).length;
          if (newFilled > existingFilled) {
            cust.id = existing.id;
            phoneMap.set(cust.customerCell, cust);
          }
        } else {
          phoneMap.set(cust.customerCell, cust);
        }
      }
      const deduped = [...phoneMap.values(), ...noPhone];
      const duplicatesRemoved = mapped.length - deduped.length;
      await lsLog("Mapped " + mapped.length + " customers, " + duplicatesRemoved + " duplicates removed, " + deduped.length + " unique");

      // Log the same 5 samples post-mapping
      log("Lightspeed MAPPED CUSTOMERS (same 5):", JSON.stringify(rawSample.indices.map(i => mapped[i]), null, 2));

      // Save to Firestore if requested
      if (saveToDB) {
        await lsLog("Saving " + deduped.length + " customers to Firestore...");
        for (const cust of deduped) {
          await db.collection(`${basePath}/customers`).doc(cust.id).set(cust);
        }
        await lsLog("Customers saved to DB", "success");
      } else {
        await lsLog("Save to DB not selected — skipping write", "warn");
      }

      result.customerCount = deduped.length;
      result.duplicatesRemoved = duplicatesRemoved;
    }

    // =====================================================================
    // WORKORDERS IMPORT (also fetches customers for linking)
    // =====================================================================
    if (importType === "workorders") {
      // === DEV MODE: Fetch specific workorders by ID ===
      const DEV_WORKORDER_IDS = ["11930"];
      await lsLog("DEV MODE: Fetching " + DEV_WORKORDER_IDS.length + " workorders...");

      const lsWorkorders = [];
      const serializedMap = new Map();
      const itemMap = new Map();
      const saleMap = new Map();

      for (const woID of DEV_WORKORDER_IDS) {
        try {
          log("--- Fetching workorder " + woID + " ---", "");

          // Fetch workorder
          const woData = await lightspeedGet(accessToken, accountID, `Workorder/${woID}`, {
            load_relations: '["WorkorderLines","WorkorderStatus","Customer"]',
          });
          const wo = woData.Workorder;
          lsWorkorders.push(wo);
          await lsLog("WORKORDER " + woID + ": " + JSON.stringify(wo, null, 2));

          // Fetch its Serialized object
          let serialized = null;
          if (wo.serializedID && wo.serializedID !== "0") {
            const serData = await lightspeedGet(accessToken, accountID, `Serialized/${wo.serializedID}`, {});
            serialized = serData.Serialized || null;
            serializedMap.set(wo.serializedID, serialized);
            await lsLog("SERIALIZED " + woID + ": " + JSON.stringify(serialized, null, 2));
          } else {
            await lsLog("No serializedID on workorder " + woID, "warn");
          }

          // Fetch the Item linked to the Serialized
          let item = null;
          if (serialized && serialized.itemID && serialized.itemID !== "0") {
            const itemData = await lightspeedGet(accessToken, accountID, `Item/${serialized.itemID}`, {});
            item = itemData.Item || null;
            itemMap.set(serialized.itemID, item);
            await lsLog("ITEM " + woID + ": " + JSON.stringify(item, null, 2));
          } else {
            await lsLog("No itemID for workorder " + woID, "warn");
          }

          // Fetch the Sale with SaleLines
          let sale = null;
          if (wo.saleID && wo.saleID !== "0") {
            const saleData = await lightspeedGet(accessToken, accountID, `Sale/${wo.saleID}`, {
              load_relations: '["SaleLines"]',
            });
            sale = saleData.Sale || null;
            saleMap.set(wo.saleID, sale);
            await lsLog("SALE " + woID + ": " + JSON.stringify(sale, null, 2));
          } else {
            await lsLog("No saleID on workorder " + woID, "warn");
          }

          // Fetch WorkorderItems (inventory items on the workorder)
          const woItemsData = await lightspeedGet(accessToken, accountID, "WorkorderItem", {
            workorderID: woID,
          });
          const woItems = woItemsData.WorkorderItem;
          const woItemsArr = !woItems ? [] : Array.isArray(woItems) ? woItems : [woItems];
          log("WORKORDER ITEMS " + woID + ":", JSON.stringify(woItemsArr, null, 2));
          await lsLog("WORKORDER ITEMS " + woID + ": " + JSON.stringify(woItemsArr, null, 2));

          // Fetch each Item referenced by WorkorderItems
          for (const woItem of woItemsArr) {
            if (woItem.itemID && woItem.itemID !== "0") {
              try {
                const wiItemData = await lightspeedGet(accessToken, accountID, `Item/${woItem.itemID}`, {});
                const wiItem = wiItemData.Item || null;
                if (wiItem) itemMap.set(wiItem.itemID, wiItem);
                log("WORKORDER ITEM -> ITEM " + woItem.itemID + ":", JSON.stringify(wiItem, null, 2));
                await lsLog("WORKORDER ITEM -> ITEM " + woItem.itemID + ": " + JSON.stringify(wiItem, null, 2));
              } catch (e) {
                log("ERROR fetching item " + woItem.itemID + ":", e.message);
                await lsLog("ERROR fetching item " + woItem.itemID + ": " + e.message, "error");
              }
            }
          }

          // Fetch the full Customer object
          if (wo.customerID && wo.customerID !== "0") {
            try {
              const custData = await lightspeedGet(accessToken, accountID, `Customer/${wo.customerID}`, {
                load_relations: '["Contact"]',
              });
              const customer = custData.Customer || null;
              log("CUSTOMER " + woID + ":", JSON.stringify(customer, null, 2));
              await lsLog("CUSTOMER " + woID + ": " + JSON.stringify(customer, null, 2));
            } catch (e) {
              log("ERROR fetching customer " + wo.customerID + ":", e.message);
              await lsLog("ERROR fetching customer " + wo.customerID + ": " + e.message, "error");
            }
          } else {
            await lsLog("No customerID on workorder " + woID, "warn");
          }
        } catch (e) {
          log("ERROR fetching workorder " + woID + ":", e.message);
          await lsLog("ERROR fetching workorder " + woID + ": " + e.message, "error");
        }
      }

      // DEV: Customer fetch disabled — empty map so mapping doesn't error
      const customerNameMap = new Map();

      // Step 5: Load statuses from settings
      const settingsDoc = await db.collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("settings").doc("settings").get();
      const settingsData = settingsDoc.exists ? settingsDoc.data() : {};
      const appStatuses = settingsData.statuses || [];
      const statusMap = new Map();
      for (const s of appStatuses) {
        if (s.label) statusMap.set(s.label.toLowerCase(), s);
      }
      await lsLog("Loaded " + appStatuses.length + " statuses from settings");

      // Color extraction helpers
      const colorLabels = [
        "White", "Blue", "Light-blue", "Red", "Green", "Black", "Yellow",
        "Orange", "Maroon", "Brown", "Silver", "Tan", "Beige", "Pink",
        "Purple", "Grey", "Gray",
      ];
      const colorMap = {
        "white": { textColor: "black", backgroundColor: "whitesmoke", label: "White" },
        "blue": { textColor: "white", backgroundColor: "blue", label: "Blue" },
        "light-blue": { textColor: "black", backgroundColor: "lightblue", label: "Light-blue" },
        "red": { textColor: "white", backgroundColor: "red", label: "Red" },
        "green": { textColor: "white", backgroundColor: "green", label: "Green" },
        "black": { textColor: "whitesmoke", backgroundColor: "black", label: "Black" },
        "yellow": { textColor: "black", backgroundColor: "yellow", label: "Yellow" },
        "orange": { textColor: "white", backgroundColor: "orange", label: "Orange" },
        "maroon": { textColor: "white", backgroundColor: "maroon", label: "Maroon" },
        "brown": { textColor: "white", backgroundColor: "rgb(139,69,19)", label: "Brown" },
        "silver": { textColor: "black", backgroundColor: "rgb(192,192,192)", label: "Silver" },
        "tan": { textColor: "black", backgroundColor: "tan", label: "Tan" },
        "beige": { textColor: "black", backgroundColor: "beige", label: "Beige" },
        "pink": { textColor: "black", backgroundColor: "pink", label: "Pink" },
        "purple": { textColor: "white", backgroundColor: "purple", label: "Purple" },
        "grey": { textColor: "black", backgroundColor: "grey", label: "Grey" },
        "gray": { textColor: "black", backgroundColor: "grey", label: "Grey" },
      };
      colorLabels.sort((a, b) => b.length - a.length);

      function extractColors(text) {
        if (!text) return [];
        const found = [];
        for (const label of colorLabels) {
          const regex = new RegExp(`\\b${label}\\b`, "i");
          if (regex.test(text) && found.length < 2) {
            const key = label.toLowerCase();
            if (colorMap[key] && !found.find(f => f.label === colorMap[key].label)) {
              found.push({ ...colorMap[key] });
            }
          }
        }
        return found;
      }

      // Step 6: Filter out archived workorders
      const lsActive = lsWorkorders.filter(wo => wo.archived !== "true");
      await lsLog("Filtered out " + (lsWorkorders.length - lsActive.length) + " archived workorders, " + lsActive.length + " remaining");

      // Step 7: Map workorders
      await lsLog("Mapping workorders to app format...");
      const woMapped = [];
      let linked = 0, unlinked = 0;

      for (const wo of lsActive) {
        const id = db.collection("_").doc().id;

        // Build description from internalNote + workorder line notes
        let description = wo.internalNote || "";
        if (wo.WorkorderLines && wo.WorkorderLines.WorkorderLine) {
          const lines = Array.isArray(wo.WorkorderLines.WorkorderLine)
            ? wo.WorkorderLines.WorkorderLine
            : [wo.WorkorderLines.WorkorderLine];
          for (const line of lines) {
            if (line.note) {
              description += (description ? " | " : "") + line.note;
            }
          }
        }

        // Map customerNotes from wo.note (public-facing note)
        let customerNotes = [];
        if (wo.note && wo.note.trim()) {
          customerNotes.push({ id: db.collection("_").doc().id, text: wo.note.trim(), millis: Date.now() });
        }

        // Map internalNotes from wo.internalNote
        let internalNotes = [];
        if (wo.internalNote && wo.internalNote.trim()) {
          internalNotes.push({ id: db.collection("_").doc().id, text: wo.internalNote.trim(), millis: Date.now() });
        }

        let customerID = "", customerFirst = "", customerLast = "", customerCell = "";
        if (wo.Customer) {
          customerFirst = (wo.Customer.firstName || "").toLowerCase();
          customerLast = (wo.Customer.lastName || "").toLowerCase();
          const nameKey = (customerFirst + " " + customerLast).trim();
          const match = customerNameMap.get(nameKey);
          if (match) {
            customerID = match.id;
            customerCell = match.customerCell || match.cell || "";
            linked++;
          } else {
            unlinked++;
          }
        } else {
          unlinked++;
        }

        let status = "";
        let lsStatusName = "";
        if (wo.WorkorderStatus) {
          lsStatusName = (wo.WorkorderStatus.name || "").toLowerCase();
          const matchedStatus = statusMap.get(lsStatusName);
          status = matchedStatus ? matchedStatus.id : "";
        }

        let allItemText = description;
        let partOrdered = "";
        let partSource = "";
        const partMatch = allItemText.match(/([A-Z][A-Z0-9 /-]*?)\s+-([A-Z][A-Z0-9]+)\s*$/);
        if (partMatch) {
          partOrdered = partMatch[1].trim();
          partSource = partMatch[2].trim();
        }

        // Map Serialized fields → brand, model, color1, legacy.description
        const ser = serializedMap.get(wo.serializedID) || null;
        let legacyDescription = ser ? (ser.description || "") : "";
        let brand = "";
        let model = "";
        let color1 = { textColor: "", backgroundColor: "", label: "" };
        const color2 = { textColor: "", backgroundColor: "", label: "" };

        // Start with Serialized.colorName as default color1
        if (ser && ser.colorName) {
          const cKey = ser.colorName.toLowerCase();
          if (colorMap[cKey]) {
            color1 = { ...colorMap[cKey] };
          } else {
            color1 = { textColor: "black", backgroundColor: "whitesmoke", label: ser.colorName };
          }
        }

        // Process Serialized.description for brand/model extraction
        if (legacyDescription) {
          let working = legacyDescription.trim();

          // Search for color names in description — if found, extract to color1 and remove
          for (const label of colorLabels) {
            const regex = new RegExp(`\\b${label}\\b`, "i");
            const match = working.match(regex);
            if (match) {
              const cKey = label.toLowerCase();
              if (colorMap[cKey]) {
                color1 = { ...colorMap[cKey] };
              } else {
                color1 = { textColor: "black", backgroundColor: "whitesmoke", label: match[0] };
              }
              // Remove the color from the working string
              working = working.replace(regex, "").replace(/\s{2,}/g, " ").trim();
              break; // only extract first color found
            }
          }

          // Split remaining: last word → model, rest → brand
          const words = working.split(/\s+/).filter(w => w);
          if (words.length > 1) {
            model = words[words.length - 1];
            brand = words.slice(0, -1).join(" ");
          } else if (words.length === 1) {
            brand = words[0];
          }
        }

        woMapped.push({
          workorderNumber: wo.workorderID || "",
          paymentComplete: false,
          amountPaid: 0,
          activeSaleID: "",
          sales: [],
          saleID: "",
          id,
          customerID,
          customerFirst,
          customerLast,
          customerCell,
          model,
          brand,
          description,
          legacyDescription,
          color1,
          color2,
          waitTime: "",
          changeLog: [],
          startedBy: wo.employeeID || "",
          startedOnMillis: wo.timeIn ? new Date(wo.timeIn).getTime() : "",
          finishedOnMillis: "",
          partOrdered,
          partSource,
          workorderLines: [],
          internalNotes,
          customerNotes,
          status,
          taxFree: wo.saleID && saleMap.has(wo.saleID)
            ? (parseFloat(saleMap.get(wo.saleID).calcTax1 || "0") + parseFloat(saleMap.get(wo.saleID).calcTax2 || "0")) === 0
            : false,
          archived: wo.archived === "true",
          _lsStatusName: lsStatusName, // temp field for sampling, removed before save
        });
      }

      await lsLog("Mapped " + woMapped.length + " workorders (" + linked + " linked to customers, " + unlinked + " unlinked)");

      // Step 8: Log mapped workorders
      await lsLog("MAPPED WORKORDERS: " + JSON.stringify(woMapped, null, 2));

      // Step 9: Build 25-workorder sample for DB save
      // 5 "Done & Paid", 5 "Finished - No Auto Text", 5 "Part Ordered", 10 random from remainder
      const statusBuckets = {
        "done & paid": [],
        "finished - no auto text": [],
        "part ordered": [],
      };
      const remainder = [];

      for (const wo of woMapped) {
        const sName = wo._lsStatusName;
        if (statusBuckets[sName] && statusBuckets[sName].length < 5) {
          statusBuckets[sName].push(wo);
        } else {
          remainder.push(wo);
        }
      }

      // Shuffle remainder and take up to 10
      for (let i = remainder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainder[i], remainder[j]] = [remainder[j], remainder[i]];
      }
      const randomSample = remainder.slice(0, 10);

      const saveSet = [
        ...statusBuckets["done & paid"],
        ...statusBuckets["finished - no auto text"],
        ...statusBuckets["part ordered"],
        ...randomSample,
      ];

      await lsLog("Sample breakdown: " +
        statusBuckets["done & paid"].length + " Done & Paid, " +
        statusBuckets["finished - no auto text"].length + " Finished - No Auto Text, " +
        statusBuckets["part ordered"].length + " Part Ordered, " +
        randomSample.length + " random = " + saveSet.length + " total");

      // Save sampled workorders to Firestore
      // DEV: always save 25 sample — revert to `if (saveToDB)` for production
      if (true) {
        await lsLog("Saving " + saveSet.length + " sampled workorders to Firestore...");
        for (const wo of saveSet) {
          const { _lsStatusName, ...woClean } = wo; // remove temp field
          await db.collection(`${basePath}/open-workorders`).doc(woClean.id).set(woClean);
        }
        await lsLog("Workorders saved to DB (" + saveSet.length + " of " + woMapped.length + " total)", "success");
      } else {
        await lsLog("Save to DB not selected — skipping write", "warn");
      }

      result.workorderCount = woMapped.length;
      result.savedCount = saveSet.length;
      result.linked = linked;
      result.unlinked = unlinked;
    }

    // =====================================================================
    // INVENTORY IMPORT (from Lightspeed Item endpoint)
    // =====================================================================
    if (importType === "inventory") {
      await lsLog("Fetching items from Lightspeed API...");
      const lsItems = await lightspeedGetAll(accessToken, accountID, "Item", {});
      await lsLog("Fetched " + lsItems.length + " items");

      // Filter out archived items
      const lsActive = lsItems.filter(item => item.archived !== "true");
      await lsLog("Filtered out " + (lsItems.length - lsActive.length) + " archived items, " + lsActive.length + " remaining");

      // Log 5 random raw items
      const rawSample = pickRandomSample(lsActive, 5);
      log("Lightspeed RAW ITEMS (5 random):", JSON.stringify(rawSample.items, null, 2));

      // Map to app inventory format
      await lsLog("Mapping items to app inventory format...");
      const mapped = [];
      for (const item of lsActive) {
        const price = Math.round(parseFloat(item.defaultCost || "0") * 100); // dollars to cents
        const formalName = item.description || "";
        const isLabor = formalName.toLowerCase().includes("labor");

        mapped.push({
          formalName,
          informalName: "",
          brand: "",
          price: 0,
          salePrice: 0,
          category: isLabor ? "Labor" : "Item",
          id: db.collection("_").doc().id,
          cost: price,
          upc: item.upc || "",
          ean: item.ean || "",
          customSku: item.customSku || "",
          manufacturerSku: item.manufacturerSku || "",
          minutes: 0,
          customPart: false,
          customLabor: false,
        });
      }

      await lsLog("Mapped " + mapped.length + " inventory items");

      // Log 5 random mapped items
      log("Lightspeed MAPPED INVENTORY (same 5, post-mapping):", JSON.stringify(rawSample.indices.map(i => mapped[i]), null, 2));

      // Save to Firestore
      if (saveToDB) {
        await lsLog("Saving " + mapped.length + " inventory items to Firestore...");
        for (const item of mapped) {
          await db.collection(`${basePath}/inventory`).doc(item.id).set(item);
        }
        await lsLog("Inventory saved to DB", "success");
      } else {
        await lsLog("Save to DB not selected — skipping write", "warn");
      }

      result.inventoryCount = mapped.length;
    }

    // =====================================================================
    // CSV EXPORTS
    // =====================================================================

    if (importType === "csv-workorders") {
      await lsLog("Fetching workorders from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "Workorder", {
        load_relations: '["WorkorderLines","WorkorderStatus","Customer"]',
      });
      await lsLog("Fetched " + data.length + " workorders. Building CSV...");

      const headers = ["workorderID", "customerID", "customerFirstName", "customerLastName", "serializedID", "saleID", "saleLineID", "employeeID", "statusName", "statusID", "note", "internalNote", "timeIn", "etaOut", "timeStamp", "tax", "warranty", "archived", "hookIn", "workorderLinesJSON"];
      const rows = data.map(wo => [
        wo.workorderID, wo.customerID, wo.Customer?.firstName || "", wo.Customer?.lastName || "",
        wo.serializedID, wo.saleID, wo.saleLineID, wo.employeeID,
        wo.WorkorderStatus?.name || "", wo.workorderStatusID,
        wo.note || "", wo.internalNote || "", wo.timeIn || "", wo.etaOut || "", wo.timeStamp || "",
        wo.tax, wo.warranty, wo.archived, wo.hookIn || "",
        JSON.stringify(wo.WorkorderLines?.WorkorderLine || []),
      ]);

      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_workorders.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "workorders", url, filename: "lightspeed_workorders.csv", rowCount: rows.length }), "csv-download");
      await lsLog("Workorders CSV exported: " + rows.length + " rows", "success");
    }

    if (importType === "csv-workorderitems") {
      await lsLog("Fetching workorder items from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "WorkorderItem", {});
      await lsLog("Fetched " + data.length + " workorder items. Building CSV...");

      const headers = ["workorderItemID", "workorderID", "itemID", "unitQuantity", "unitPrice", "unitCost", "note", "tax", "approved", "warranty", "isSpecialOrder", "saleLineID", "saleID", "employeeID", "discountID", "timeStamp"];
      const rows = data.map(wi => [
        wi.workorderItemID, wi.workorderID, wi.itemID, wi.unitQuantity, wi.unitPrice, wi.unitCost,
        wi.note || "", wi.tax, wi.approved, wi.warranty, wi.isSpecialOrder,
        wi.saleLineID, wi.saleID, wi.employeeID, wi.discountID, wi.timeStamp || "",
      ]);

      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_workorderitems.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "workorderitems", url, filename: "lightspeed_workorderitems.csv", rowCount: rows.length }), "csv-download");
      await lsLog("WorkorderItems CSV exported: " + rows.length + " rows", "success");
    }

    if (importType === "csv-serialized") {
      await lsLog("Fetching serialized items from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "Serialized", {});
      await lsLog("Fetched " + data.length + " serialized items. Building CSV...");

      const headers = ["serializedID", "itemID", "description", "serial", "colorName", "sizeName", "customerID", "saleLineID", "timeStamp"];
      const rows = data.map(s => [
        s.serializedID, s.itemID, s.description || "", s.serial || "", s.colorName || "", s.sizeName || "",
        s.customerID, s.saleLineID, s.timeStamp || "",
      ]);

      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_serialized.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "serialized", url, filename: "lightspeed_serialized.csv", rowCount: rows.length }), "csv-download");
      await lsLog("Serialized CSV exported: " + rows.length + " rows", "success");
    }

    if (importType === "csv-items") {
      await lsLog("Fetching items from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "Item", {});
      await lsLog("Fetched " + data.length + " items. Building CSV...");

      const headers = ["itemID", "description", "defaultCost", "avgCost", "upc", "ean", "customSku", "manufacturerSku", "categoryID", "taxClassID", "itemType", "archived", "timeStamp"];
      const rows = data.map(item => [
        item.itemID, item.description || "", item.defaultCost || "", item.avgCost || "",
        item.upc || "", item.ean || "", item.customSku || "", item.manufacturerSku || "",
        item.categoryID, item.taxClassID, item.itemType || "", item.archived, item.timeStamp || "",
      ]);

      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_items.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "items", url, filename: "lightspeed_items.csv", rowCount: rows.length }), "csv-download");
      await lsLog("Items CSV exported: " + rows.length + " rows", "success");
    }

    if (importType === "csv-customers") {
      await lsLog("Fetching customers from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "Customer", {
        load_relations: '["Contact"]',
      });
      await lsLog("Fetched " + data.length + " customers. Building CSV...");

      const headers = ["customerID", "firstName", "lastName", "title", "company", "createTime", "archived", "phone1", "phone2", "email", "address1", "address2", "city", "state", "zip"];
      const rows = data.map(c => {
        let phone1 = "", phone2 = "";
        if (c.Contact?.Phones?.ContactPhone) {
          const phones = Array.isArray(c.Contact.Phones.ContactPhone) ? c.Contact.Phones.ContactPhone : [c.Contact.Phones.ContactPhone];
          for (const p of phones) {
            const clean = lsCleanPhone(p.number);
            if (!clean) continue;
            if (!phone1) phone1 = clean;
            else if (!phone2) { phone2 = clean; break; }
          }
        }
        let email = "";
        if (c.Contact?.Emails?.ContactEmail) {
          const emails = Array.isArray(c.Contact.Emails.ContactEmail) ? c.Contact.Emails.ContactEmail : [c.Contact.Emails.ContactEmail];
          if (emails.length > 0 && emails[0].address) email = emails[0].address;
        }
        let address1 = "", address2 = "", city = "", state = "", zip = "";
        if (c.Contact?.Addresses?.ContactAddress) {
          const addrs = Array.isArray(c.Contact.Addresses.ContactAddress) ? c.Contact.Addresses.ContactAddress : [c.Contact.Addresses.ContactAddress];
          if (addrs.length > 0) {
            address1 = addrs[0].address1 || "";
            address2 = addrs[0].address2 || "";
            city = addrs[0].city || "";
            state = addrs[0].state || "";
            zip = addrs[0].zip || "";
          }
        }
        return [c.customerID, c.firstName || "", c.lastName || "", c.title || "", c.company || "", c.createTime || "", c.archived, phone1, phone2, email, address1, address2, city, state, zip];
      });

      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_customers.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "customers", url, filename: "lightspeed_customers.csv", rowCount: rows.length }), "csv-download");
      await lsLog("Customers CSV exported: " + rows.length + " rows", "success");
    }

    if (importType === "csv-sales") {
      // --- getAll approach (testing for speed) ---
      await lsLog("Fetching all sales from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "Sale", {});
      await lsLog("Fetched " + data.length + " sales. Building CSV...");
      const headers = ["saleID", "customerID", "employeeID", "completed", "completeTime", "createTime", "calcSubtotal", "calcTotal", "calcTax1", "calcTax2", "calcDiscount", "calcPayments", "referenceNumber", "archived", "voided"];
      const rows = data.map(s => [
        s.saleID, s.customerID, s.employeeID, s.completed, s.completeTime || "", s.createTime || "",
        s.calcSubtotal || "", s.calcTotal || "", s.calcTax1 || "", s.calcTax2 || "",
        s.calcDiscount || "", s.calcPayments || "", s.referenceNumber || "",
        s.archived, s.voided,
      ]);
      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_sales.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "sales", url, filename: "lightspeed_sales.csv", rowCount: rows.length }), "csv-download");
      await lsLog("Sales CSV exported: " + rows.length + " rows", "success");
      // --- streamed approach (kept for reference) ---
      // const rowMapper = (s) => [
      //   s.saleID, s.customerID, s.employeeID, s.completed, s.completeTime || "", s.createTime || "",
      //   s.calcSubtotal || "", s.calcTotal || "", s.calcTax1 || "", s.calcTax2 || "",
      //   s.calcDiscount || "", s.calcPayments || "", s.referenceNumber || "",
      //   s.archived, s.voided,
      // ];
      // const { url, totalRows } = await streamLightspeedCSVToStorage(accessToken, accountID, "Sale", {}, headers, rowMapper, path, lsLog);
      // await lsLog(JSON.stringify({ csvType: "sales", url, filename: "lightspeed_sales.csv", rowCount: totalRows }), "csv-download");
      // await lsLog("Sales CSV exported: " + totalRows + " rows", "success");
    }

    if (importType === "csv-salelines") {
      // --- getAll approach (testing for speed) ---
      await lsLog("Fetching all sale lines from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "SaleLine", {});
      await lsLog("Fetched " + data.length + " sale lines. Building CSV...");
      const headers = ["saleLineID", "saleID", "itemID", "unitQuantity", "unitPrice", "avgCost", "discountAmount", "discountPercent", "tax", "taxClassID", "note", "isWorkorder", "createTime"];
      const rows = data.map(sl => [
        sl.saleLineID, sl.saleID, sl.itemID, sl.unitQuantity || "", sl.unitPrice || "",
        sl.avgCost || "", sl.discountAmount || "", sl.discountPercent || "",
        sl.tax || "", sl.taxClassID || "", sl.note || "",
        sl.isWorkorder || "", sl.createTime || "",
      ]);
      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_salelines.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "salelines", url, filename: "lightspeed_salelines.csv", rowCount: rows.length }), "csv-download");
      await lsLog("Sale Lines CSV exported: " + rows.length + " rows", "success");
      // --- streamed approach (kept for reference) ---
      // const rowMapper = (sl) => [
      //   sl.saleLineID, sl.saleID, sl.itemID, sl.unitQuantity || "", sl.unitPrice || "",
      //   sl.avgCost || "", sl.discountAmount || "", sl.discountPercent || "",
      //   sl.tax || "", sl.taxClassID || "", sl.note || "",
      //   sl.isWorkorder || "", sl.createTime || "",
      // ];
      // const { url, totalRows } = await streamLightspeedCSVToStorage(accessToken, accountID, "SaleLine", {}, headers, rowMapper, path, lsLog);
      // await lsLog(JSON.stringify({ csvType: "salelines", url, filename: "lightspeed_salelines.csv", rowCount: totalRows }), "csv-download");
      // await lsLog("Sale Lines CSV exported: " + totalRows + " rows", "success");
    }

    if (importType === "csv-salepayments") {
      await lsLog("Fetching all sale payments from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "SalePayment", {
        load_relations: '["PaymentType","CCCharge"]',
      });
      await lsLog("Fetched " + data.length + " sale payments. Building CSV...");
      const headers = [
        "salePaymentID", "saleID", "amount", "tipAmount", "createTime",
        "paymentTypeName", "paymentTypeType",
        "ccChargeID", "cardType", "cardLast4", "authCode", "entryMethod",
        "archived"
      ];
      const rows = data.map(sp => [
        sp.salePaymentID, sp.saleID, sp.amount || "", sp.tipAmount || "", sp.createTime || "",
        sp.PaymentType?.name || "", sp.PaymentType?.type || "",
        sp.ccChargeID || "", sp.CCCharge?.cardType || "", sp.CCCharge?.xnum || "",
        sp.CCCharge?.authCode || "", sp.CCCharge?.entryMethod || "",
        sp.archived,
      ]);
      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_salepayments.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "salepayments", url, filename: "lightspeed_salepayments.csv", rowCount: rows.length }), "csv-download");
      await lsLog("Sale Payments CSV exported: " + rows.length + " rows", "success");
    }

    if (importType === "csv-employees") {
      await lsLog("Fetching employees from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "Employee", {});
      await lsLog("Fetched " + data.length + " employees. Building CSV...");
      const headers = ["employeeID", "firstName", "lastName"];
      const rows = data.map(e => [
        e.employeeID, e.firstName || "", e.lastName || "",
      ]);
      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_employees.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "employees", url, filename: "lightspeed_employees.csv", rowCount: rows.length }), "csv-download");
      await lsLog("Employees CSV exported: " + rows.length + " rows", "success");
    }

    if (importType === "csv-employeehours") {
      await lsLog("Fetching employee hours (punch history) from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "EmployeeHours", {});
      await lsLog("Fetched " + data.length + " punch records. Building CSV...");
      const headers = ["employeeHoursID", "employeeID", "checkIn", "checkOut", "shopID"];
      const rows = data.map(h => [
        h.employeeHoursID, h.employeeID, h.checkIn || "", h.checkOut || "", h.shopID || "",
      ]);
      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_employeehours.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "employeehours", url, filename: "lightspeed_employeehours.csv", rowCount: rows.length }), "csv-download");
      await lsLog("Employee Hours CSV exported: " + rows.length + " rows", "success");
    }

    if (importType === "csv-cccharges") {
      await lsLog("Fetching all CC charges from Lightspeed API...");
      const data = await lightspeedGetAll(accessToken, accountID, "CCCharge", {});
      await lsLog("Fetched " + data.length + " CC charges. Building CSV...");
      const headers = [
        "ccChargeID", "saleID", "gatewayTransID", "xnum", "cardType",
        "amount", "refunded", "authCode", "exp", "entryMethod",
        "isDebit", "cardholderName", "voided", "declined", "authOnly", "timeStamp"
      ];
      const rows = data.map(cc => [
        cc.ccChargeID, cc.saleID, cc.gatewayTransID || "", cc.xnum || "", cc.cardType || "",
        cc.amount || "", cc.refunded || "", cc.authCode || "", cc.exp || "", cc.entryMethod || "",
        cc.isDebit || "", cc.cardholderName || "", cc.voided, cc.declined, cc.authOnly, cc.timeStamp || "",
      ]);
      const csv = buildCSV(headers, rows);
      await lsLog("CSV built: " + rows.length + " rows. Uploading to Cloud Storage...");
      const path = `${tenantID}/${storeID}/lightspeed-exports/${Date.now()}_cccharges.csv`;
      const url = await uploadCSVToStorage(csv, path);
      await lsLog(JSON.stringify({ csvType: "cccharges", url, filename: "lightspeed_cccharges.csv", rowCount: rows.length }), "csv-download");
      await lsLog("CC Charges CSV exported: " + rows.length + " rows", "success");
    }

    await lsLog("Import complete!", "success");
    await logDocRef.update({ status: "complete" });
    log("Lightspeed: import complete", result);
    return result;

    } catch (importError) {
      await lsLog("Import failed: " + (importError.message || "Unknown error"), "error");
      await logDocRef.update({ status: "error" });
      throw importError;
    }
  }
);

// ==================== SEND EMAIL ====================
exports.sendEmailCallable = onCall(
  {
    secrets: [firebaseServiceAccountKey, gmailAppPassword],
  },
  withFeatureTracking("email.send", async (request, tracker) => {
    log("Incoming email callable request", request.data);
    requireCallableAuth(request);

    try {
      const { to, subject, htmlBody, tenantID, storeID, attachments } = request.data;

      if (!to || typeof to !== "string" || !to.includes("@")) {
        throw new HttpsError("invalid-argument", "Valid email address is required");
      }
      if (!subject || typeof subject !== "string") {
        throw new HttpsError("invalid-argument", "Email subject is required");
      }
      if (!htmlBody || typeof htmlBody !== "string") {
        throw new HttpsError("invalid-argument", "Email body is required");
      }
      if (!tenantID || typeof tenantID !== "string") {
        throw new HttpsError("invalid-argument", "Tenant ID is required");
      }
      if (!storeID || typeof storeID !== "string") {
        throw new HttpsError("invalid-argument", "Store ID is required");
      }

      requireTenantMatch(request, tenantID, storeID);

      const db = await getDB(firebaseServiceAccountKey);
      const _emailSettingsDoc = await db.collection("tenants").doc(tenantID).collection("stores").doc(storeID).collection("settings").doc("settings").get();
      const _emailSettings = _emailSettingsDoc.exists ? _emailSettingsDoc.data() : {};
      const _sendFromEmail = _emailSettings?.storeInfo?.supportEmail || "";
      const _sendFromName = _emailSettings?.storeInfo?.displayName || "";

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: _sendFromEmail,
          pass: gmailAppPassword.value(),
        },
      });

      const mailOptions = {
        from: `"${_sendFromName}" <${_sendFromEmail}>`,
        to: to,
        subject: subject,
        html: htmlBody,
      };
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      const info = await transporter.sendMail(mailOptions);
      tracker.bump("nodemailerSends", 1);
      tracker.bump("firestoreReads", 1);
      tracker.set("emailBytes", (htmlBody || "").length);
      tracker.set("attachmentCount", (attachments && attachments.length) || 0);
      if (info && info.messageId) tracker.setContext({ correlationID: info.messageId });

      log("Email sent successfully", {
        messageId: info.messageId,
        to: to,
      });

      return {
        success: true,
        message: "Email sent successfully",
        data: {
          messageId: info.messageId,
          to: to,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      log("Error in sendEmailCallable", error);

      if (error instanceof HttpsError) throw error;

      throw new HttpsError(
        "internal",
        "Failed to send email: " + (error.message || "Unknown error")
      );
    }
  })
);

// ============================================================================
// Upload PDF to Cloud Storage and Send SMS with link
// ============================================================================
exports.uploadPDFAndSendSMSCallable = onCall(
  {
    secrets: [
      twilioSecretKey,
      twilioSecretAccountNumber,
      firebaseServiceAccountKey,
    ],
  },
  withFeatureTracking("pdf.upload-sms", async (request, tracker) => {
    log("Incoming uploadPDFAndSendSMS request");
    requireCallableAuth(request);

    try {
      const db = await getDB(firebaseServiceAccountKey);

      const {
        base64,
        storagePath,
        message,
        phoneNumber,
        tenantID,
        storeID,
        customerID,
        messageID,
        canRespond,
        forwardTo: forwardToParam = null,
        fromNumber: fromNumberParam,
        senderID = "",
      } = request.data;

      if (tenantID && storeID) requireTenantMatch(request, tenantID, storeID);
      let fromNumber = fromNumberParam;
      if (!fromNumber && tenantID && storeID) {
        const _settingsDoc = await db.collection("tenants").doc(tenantID).collection("stores").doc(storeID).collection("settings").doc("settings").get();
        let _tn = (_settingsDoc.exists ? _settingsDoc.data()?.storeInfo?.textingNumber : "") || "";
        _tn = _tn.replace(/\D/g, "");
        fromNumber = _tn.length === 10 ? `+1${_tn}` : "";
      }
      if (!fromNumber) throw new HttpsError("failed-precondition", "No texting number configured in store settings");

      // Validate required fields
      if (!base64 || typeof base64 !== "string") {
        throw new HttpsError("invalid-argument", "base64 PDF content is required");
      }
      if (!storagePath || typeof storagePath !== "string") {
        throw new HttpsError("invalid-argument", "storagePath is required");
      }
      if (!message || typeof message !== "string") {
        throw new HttpsError("invalid-argument", "message is required");
      }
      if (!phoneNumber || typeof phoneNumber !== "string") {
        throw new HttpsError("invalid-argument", "phoneNumber is required");
      }
      if (!tenantID || typeof tenantID !== "string") {
        throw new HttpsError("invalid-argument", "tenantID is required");
      }
      if (!storeID || typeof storeID !== "string") {
        throw new HttpsError("invalid-argument", "storeID is required");
      }

      const cleanPhoneNumber = phoneNumber.replace(/\D/g, "");
      if (cleanPhoneNumber.length !== 10) {
        throw new HttpsError("invalid-argument", "Phone number must be 10 digits");
      }

      // Upload PDF to Cloud Storage
      const bucket = admin.storage().bucket(STORAGE_BUCKET);
      const file = bucket.file(storagePath);
      const pdfBuffer = Buffer.from(base64, "base64");
      await file.save(pdfBuffer, {
        contentType: "application/pdf",
        metadata: { contentType: "application/pdf" },
      });
      await file.makePublic();
      const pdfURL = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      tracker.bump("storageBytesAdded", pdfBuffer.length);
      tracker.set("pdfBytes", pdfBuffer.length);

      log("PDF uploaded to Cloud Storage", { storagePath, pdfURL });

      // Replace {link} placeholder in message
      const finalMessage = message.replace(/\{link\}/g, pdfURL);

      // Initialize Twilio
      if (!twilioClient) {
        try {
          twilioClient = require("twilio")(
            twilioSecretAccountNumber.value(),
            twilioSecretKey.value()
          );
        } catch (twilioInitError) {
          log("Error initializing Twilio client", twilioInitError);
          throw new HttpsError("internal", "Failed to initialize SMS service");
        }
      }

      // Send SMS
      const pdfCallbackParams = messageID ? `?tenantID=${tenantID}&storeID=${storeID}&phone=${cleanPhoneNumber}&messageID=${messageID}` : "";
      const twilioResponse = await twilioClient.messages.create({
        body: finalMessage.trim(),
        to: `+1${cleanPhoneNumber}`,
        from: fromNumber,
        ...(messageID ? { statusCallback: `${FUNCTIONS_BASE_URL}/smsStatusCallback${pdfCallbackParams}` } : {}),
      });

      log("PDF SMS sent successfully", {
        messageSid: twilioResponse.sid,
        to: twilioResponse.to,
        status: twilioResponse.status,
      });
      tracker.setContext({ correlationID: twilioResponse.sid });
      tracker.bump("twilioMms", 1);
      tracker.bump("twilioSegments", Math.max(1, Math.ceil(finalMessage.length / 160)));

      // Store outgoing message in Firestore
      if (messageID) {
        try {
          const conversationRef = db
            .collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("sms-messages").doc(cleanPhoneNumber);

          // Read forwardTo from the parent doc (canonical source of truth)
          const parentDoc = await conversationRef.get();
          let currentForwardTo = parentDoc.exists ? (parentDoc.data().forwardTo || []) : [];

          // If caller passed an array, overwrite; otherwise leave as-is
          if (Array.isArray(forwardToParam)) {
            currentForwardTo = forwardToParam;
          }

          const messageRef = conversationRef.collection("messages").doc(messageID);

          await messageRef.set({
            id: messageID,
            customerID: customerID || "",
            message: finalMessage.trim(),
            phoneNumber: cleanPhoneNumber,
            messageSid: twilioResponse.sid,
            status: twilioResponse.status,
            fromNumber: fromNumber,
            tenantID: tenantID,
            storeID: storeID,
            type: "outgoing",
            millis: Date.now(),
            canRespond: canRespond || null,
          });

          // Update conversation root with forwardTo and outgoing tracking
          await conversationRef.set({
            lastMessage: finalMessage.trim(),
            lastMillis: Date.now(),
            lastType: "outgoing",
            lastOutgoingMessageID: messageID,
            lastOutgoingMessageStatus: twilioResponse.status || "queued",
            lastOutgoingMillis: Date.now(),
            lastOutgoingSenderID: senderID || "",
            canRespond: canRespond || false,
            forwardTo: currentForwardTo,
            threadStatus: "open",
          }, { merge: true });
          tracker.bump("firestoreReads", 1);
          tracker.bump("firestoreWrites", 2);
        } catch (firestoreError) {
          log("Error storing outgoing message in Firestore", firestoreError.message);
        }
      }

      return {
        success: true,
        url: pdfURL,
        data: {
          messageSid: twilioResponse.sid,
          status: twilioResponse.status,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      log("Error in uploadPDFAndSendSMSCallable", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to upload PDF and send SMS: " + (error.message || "Unknown error"));
    }
  })
);

// ============================================================================
// Generate Receipt PDF, Upload to Storage, Optionally Send SMS
// ============================================================================
exports.generateReceiptPDFCallable = onCall(
  {
    secrets: [
      twilioSecretKey,
      twilioSecretAccountNumber,
      firebaseServiceAccountKey,
      gmailAppPassword,
    ],
  },
  withFeatureTracking("pdf.receipt", async (request, tracker) => {
    log("Incoming generateReceiptPDF request");
    requireCallableAuth(request);

    try {
      const db = await getDB(firebaseServiceAccountKey);

      const {
        receiptType,
        receiptData,
        pdfLabels,
        storagePath,
        tenantID,
        storeID,
        sms: smsParams,
        email: emailParams,
      } = request.data;

      if (tenantID && storeID) requireTenantMatch(request, tenantID, storeID);

      if (!receiptData || typeof receiptData !== "object") {
        throw new HttpsError("invalid-argument", "receiptData is required");
      }
      if (!storagePath || typeof storagePath !== "string") {
        throw new HttpsError("invalid-argument", "storagePath is required");
      }
      if (!tenantID || typeof tenantID !== "string") {
        throw new HttpsError("invalid-argument", "tenantID is required");
      }
      if (!storeID || typeof storeID !== "string") {
        throw new HttpsError("invalid-argument", "storeID is required");
      }

      let base64;
      switch (receiptType) {
        case "sale":
          base64 = generateSaleReceiptPDF(receiptData, pdfLabels || undefined);
          break;
        case "refund":
          base64 = generateRefundReceiptPDF(receiptData);
          break;
        case "credit":
          base64 = generateCreditReceiptPDF(receiptData);
          break;
        case "giftcard":
          base64 = generateGiftCardReceiptPDF(receiptData);
          break;
        case "transaction":
          base64 = generateTransactionReceiptPDF(receiptData);
          break;
        case "workorder":
        case "intake":
          base64 = generateWorkorderTicketPDF(receiptData);
          break;
        default:
          throw new HttpsError("invalid-argument", "Unknown receiptType: " + receiptType);
      }
      tracker.set("pdfReceiptType", receiptType);
      const pdfBuffer = Buffer.from(base64, "base64");
      tracker.set("pdfBytes", pdfBuffer.length);
      tracker.set("storageBytesAdded", pdfBuffer.length);

      const bucket = admin.storage().bucket(STORAGE_BUCKET);
      const file = bucket.file(storagePath);
      await file.save(pdfBuffer, {
        contentType: "application/pdf",
        metadata: { contentType: "application/pdf" },
      });
      await file.makePublic();
      const receiptURL = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      log("Receipt PDF generated and uploaded", { receiptType, storagePath, receiptURL });

      if (smsParams && smsParams.message && smsParams.phoneNumber) {
        const cleanPhoneNumber = smsParams.phoneNumber.replace(/\D/g, "");
        if (cleanPhoneNumber.length === 10) {
          const finalMessage = smsParams.message.replace(/\{link\}/g, receiptURL);
          let _fromNum = smsParams.fromNumber;
          if (!_fromNum && tenantID && storeID) {
            const _sDoc = await db.collection("tenants").doc(tenantID).collection("stores").doc(storeID).collection("settings").doc("settings").get();
            let _tn2 = (_sDoc.exists ? _sDoc.data()?.storeInfo?.textingNumber : "") || "";
            _tn2 = _tn2.replace(/\D/g, "");
            _fromNum = _tn2.length === 10 ? `+1${_tn2}` : "";
          }
          if (!_fromNum) throw new HttpsError("failed-precondition", "No texting number configured in store settings");
          const fromNumber = _fromNum;

          if (!twilioClient) {
            try {
              twilioClient = require("twilio")(
                twilioSecretAccountNumber.value(),
                twilioSecretKey.value()
              );
            } catch (twilioInitError) {
              log("Error initializing Twilio client in generateReceiptPDF", twilioInitError);
              throw new HttpsError("internal", "Failed to initialize SMS service");
            }
          }

          const messageID = smsParams.messageID || null;
          const customerID = smsParams.customerID || "";
          const canRespond = smsParams.canRespond || null;
          const forwardToParam = smsParams.forwardTo || null;
          const smsSenderID = smsParams.senderID || "";

          const pdfCallbackParams = messageID ? `?tenantID=${tenantID}&storeID=${storeID}&phone=${cleanPhoneNumber}&messageID=${messageID}` : "";
          const twilioResponse = await twilioClient.messages.create({
            body: finalMessage.trim(),
            to: `+1${cleanPhoneNumber}`,
            from: fromNumber,
            ...(messageID ? { statusCallback: `${FUNCTIONS_BASE_URL}/smsStatusCallback${pdfCallbackParams}` } : {}),
          });
          tracker.bump("twilioSegments", Number(twilioResponse.numSegments) || 1);
          tracker.bump("twilioReceiptSends");

          log("Receipt SMS sent", { messageSid: twilioResponse.sid, status: twilioResponse.status });

          if (messageID) {
            try {
              const conversationRef = db
                .collection("tenants").doc(tenantID)
                .collection("stores").doc(storeID)
                .collection("sms-messages").doc(cleanPhoneNumber);

              const parentDoc = await conversationRef.get();
              let currentForwardTo = parentDoc.exists ? (parentDoc.data().forwardTo || []) : [];

              if (Array.isArray(forwardToParam)) {
                currentForwardTo = forwardToParam;
              }

              const messageRef = conversationRef.collection("messages").doc(messageID);
              await messageRef.set({
                id: messageID,
                customerID: customerID,
                message: finalMessage.trim(),
                phoneNumber: cleanPhoneNumber,
                messageSid: twilioResponse.sid,
                status: twilioResponse.status,
                fromNumber: fromNumber,
                tenantID: tenantID,
                storeID: storeID,
                type: "outgoing",
                millis: Date.now(),
                canRespond: canRespond,
              });

              await conversationRef.set({
                lastMessage: finalMessage.trim(),
                lastMillis: Date.now(),
                lastType: "outgoing",
                lastOutgoingMessageID: messageID,
                lastOutgoingMessageStatus: twilioResponse.status || "queued",
                lastOutgoingMillis: Date.now(),
                lastOutgoingSenderID: smsSenderID,
                canRespond: canRespond || false,
                forwardTo: currentForwardTo,
                threadStatus: "open",
              }, { merge: true });
            } catch (firestoreError) {
              log("Error storing outgoing message in Firestore (generateReceiptPDF)", firestoreError.message);
            }
          }
        }
      }

      if (emailParams && emailParams.to && emailParams.html) {
        try {
          const emailSubject = (emailParams.subject || "").replace(/\{link\}/g, receiptURL);
          const emailHtml = emailParams.html.replace(/\{link\}/g, receiptURL);
          const _eSettingsDoc = await db.collection("tenants").doc(tenantID).collection("stores").doc(storeID).collection("settings").doc("settings").get();
          const _eSettings = _eSettingsDoc.exists ? _eSettingsDoc.data() : {};
          const _eFromEmail = _eSettings?.storeInfo?.supportEmail || "";
          const _eFromName = _eSettings?.storeInfo?.displayName || "";

          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: _eFromEmail,
              pass: gmailAppPassword.value(),
            },
          });

          await transporter.sendMail({
            from: `"${_eFromName}" <${_eFromEmail}>`,
            to: emailParams.to,
            subject: emailSubject,
            html: emailHtml,
          });
          tracker.bump("gmailMessagesSent");

          log("Receipt email sent", { to: emailParams.to });
        } catch (emailError) {
          log("Error sending receipt email in generateReceiptPDF", emailError.message);
        }
      }

      return {
        success: true,
        receiptURL: receiptURL,
      };
    } catch (error) {
      log("Error in generateReceiptPDFCallable", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to generate receipt PDF: " + (error.message || "Unknown error"));
    }
  })
);

// ============================================================================
// Send Receipt (PDF + SMS + Email) - Fire-and-forget
// ============================================================================
exports.sendReceiptCallable = onCall(
  {
    secrets: [
      twilioSecretKey,
      twilioSecretAccountNumber,
      firebaseServiceAccountKey,
      gmailAppPassword,
      googleTranslateApiKey,
    ],
  },
  withFeatureTracking("receipt.send", async (request, tracker) => {
    log("Incoming sendReceipt request");
    requireCallableAuth(request);

    try {
      const db = await getDB(firebaseServiceAccountKey);

      const {
        receiptType,
        receiptData,
        pdfLabels,
        storagePath,
        tenantID,
        storeID,
        sendSMS,
        sendEmail,
        customerEmail,
        customerCell,
        customerID,
        templateVars,
        smsMessageID,
        canRespond,
        forwardTo: forwardToParam,
        langCode,
        updateWorkorderField,
        senderID = "",
      } = request.data;

      if (tenantID && storeID) requireTenantMatch(request, tenantID, storeID);

      if (!receiptData || typeof receiptData !== "object") {
        throw new HttpsError("invalid-argument", "receiptData is required");
      }
      if (!storagePath || typeof storagePath !== "string") {
        throw new HttpsError("invalid-argument", "storagePath is required");
      }
      if (!tenantID || typeof tenantID !== "string") {
        throw new HttpsError("invalid-argument", "tenantID is required");
      }
      if (!storeID || typeof storeID !== "string") {
        throw new HttpsError("invalid-argument", "storeID is required");
      }

      // Step 1: Read settings
      const settingsDoc = await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("settings").doc("settings")
        .get();
      const settings = settingsDoc.exists ? settingsDoc.data() : {};

      // Step 2: Generate PDF
      let base64;
      switch (receiptType) {
        case "sale":
          base64 = generateSaleReceiptPDF(receiptData, pdfLabels || undefined);
          break;
        case "refund":
          base64 = generateRefundReceiptPDF(receiptData);
          break;
        case "credit":
          base64 = generateCreditReceiptPDF(receiptData);
          break;
        case "giftcard":
          base64 = generateGiftCardReceiptPDF(receiptData);
          break;
        case "transaction":
          base64 = generateTransactionReceiptPDF(receiptData);
          break;
        case "workorder":
        case "intake":
          base64 = generateWorkorderTicketPDF(receiptData);
          break;
        default:
          throw new HttpsError("invalid-argument", "Unknown receiptType: " + receiptType);
      }

      // Step 3: Upload to Cloud Storage
      const bucket = admin.storage().bucket(STORAGE_BUCKET);
      const file = bucket.file(storagePath);
      await file.save(Buffer.from(base64, "base64"), {
        contentType: "application/pdf",
        metadata: { contentType: "application/pdf" },
      });
      await file.makePublic();
      const receiptURL = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      log("Receipt PDF uploaded", { receiptType, storagePath });

      // Step 4: SMS
      if (sendSMS && customerCell) {
        try {
          const cleanPhoneNumber = customerCell.replace(/\D/g, "");
          if (cleanPhoneNumber.length === 10) {
            let smsMessage = null;
            const templateType = getTemplateType(receiptType);

            if (receiptType === "workorder") {
              smsMessage = settings.workorderTicketMessage || "🔧 Hi {firstName}, here is your finalized workorder ticket! {link}";
            } else {
              const smsTemplate = findTemplateByType(settings.smsTemplates || settings.textTemplates, templateType);
              if (smsTemplate) {
                smsMessage = smsTemplate.content || smsTemplate.message || smsTemplate.body || "";
              } else {
                smsMessage = getDefaultSMSMessage(receiptType);
              }
            }

            if (smsMessage) {
              let si = settings?.storeInfo || {};
              let smsPhone = si.phone || "";
              let formattedStorePhone = smsPhone.length === 10
                ? "(" + smsPhone.slice(0, 3) + ") " + smsPhone.slice(3, 6) + "-" + smsPhone.slice(6)
                : smsPhone;
              let smsVars = { ...templateVars, storePhone: formattedStorePhone, storeName: si.displayName || si.name || templateVars?.storeName || "", supportEmail: si.supportEmail || "" };
              smsMessage = applyVars(smsMessage, smsVars);
              let hasReceiptVar = smsMessage.includes("{salesReceipt}") || smsMessage.includes("{intakeReceipt}") || smsMessage.includes("{refundReceipt}");
              smsMessage = smsMessage.replace(/\{salesReceipt\}/g, receiptURL).replace(/\{intakeReceipt\}/g, receiptURL).replace(/\{refundReceipt\}/g, receiptURL);
              if (!hasReceiptVar && !smsMessage.includes("{link}")) smsMessage += " {link}";
              smsMessage = smsMessage.replace(/\{link\}/g, receiptURL);

              if (langCode && receiptType === "sale") {
                try {
                  const { Translate } = require("@google-cloud/translate").v2;
                  const translate = new Translate({ key: googleTranslateApiKey.value() });
                  const [translated] = await translate.translate(smsMessage, { to: langCode });
                  if (translated) smsMessage = translated;
                } catch (translateErr) {
                  log("SMS translation failed, sending in English", translateErr.message);
                }
              }

              if (!twilioClient) {
                try {
                  twilioClient = require("twilio")(
                    twilioSecretAccountNumber.value(),
                    twilioSecretKey.value()
                  );
                } catch (twilioInitError) {
                  log("Error initializing Twilio client in sendReceipt", twilioInitError);
                }
              }

              if (twilioClient) {
                const messageID = smsMessageID || null;
                let _tn = (settings?.storeInfo?.textingNumber || "").replace(/\D/g, "");
                if (_tn.length !== 10) throw new HttpsError("failed-precondition", "No texting number configured in store settings");
                const fromNumber = `+1${_tn}`;
                const pdfCallbackParams = messageID ? `?tenantID=${tenantID}&storeID=${storeID}&phone=${cleanPhoneNumber}&messageID=${messageID}` : "";

                const twilioResponse = await twilioClient.messages.create({
                  body: smsMessage.trim(),
                  to: `+1${cleanPhoneNumber}`,
                  from: fromNumber,
                  ...(messageID ? { statusCallback: `${FUNCTIONS_BASE_URL}/smsStatusCallback${pdfCallbackParams}` } : {}),
                });

                log("Receipt SMS sent", { messageSid: twilioResponse.sid });

                if (messageID) {
                  try {
                    const conversationRef = db
                      .collection("tenants").doc(tenantID)
                      .collection("stores").doc(storeID)
                      .collection("sms-messages").doc(cleanPhoneNumber);

                    const parentDoc = await conversationRef.get();
                    let currentForwardTo = parentDoc.exists ? (parentDoc.data().forwardTo || []) : [];

                    if (Array.isArray(forwardToParam)) {
                      currentForwardTo = forwardToParam;
                    }

                    const messageRef = conversationRef.collection("messages").doc(messageID);
                    await messageRef.set({
                      id: messageID,
                      customerID: customerID || "",
                      message: smsMessage.trim(),
                      phoneNumber: cleanPhoneNumber,
                      messageSid: twilioResponse.sid,
                      status: twilioResponse.status,
                      fromNumber: fromNumber,
                      tenantID: tenantID,
                      storeID: storeID,
                      type: "outgoing",
                      millis: Date.now(),
                      canRespond: canRespond || null,
                    });

                    await conversationRef.set({
                      lastMessage: smsMessage.trim(),
                      lastMillis: Date.now(),
                      lastType: "outgoing",
                      lastOutgoingMessageID: messageID,
                      lastOutgoingMessageStatus: twilioResponse.status || "queued",
                      lastOutgoingMillis: Date.now(),
                      lastOutgoingSenderID: senderID || "",
                      canRespond: canRespond || false,
                      forwardTo: currentForwardTo,
                      threadStatus: "open",
                    }, { merge: true });
                  } catch (firestoreError) {
                    log("Error storing outgoing message in Firestore (sendReceipt)", firestoreError.message);
                  }
                }
              }
            }
          }
        } catch (smsError) {
          log("SMS sending failed in sendReceipt", smsError.message);
        }
      }

      // Step 5: Email
      if (sendEmail && customerEmail && receiptType !== "workorder") {
        try {
          const templateType = getTemplateType(receiptType);
          const emailTemplate = findTemplateByType(settings.emailTemplates, templateType);

          if (emailTemplate) {
            const vars = { ...(templateVars || {}), link: receiptURL };
            let { subject, html } = buildEmailFromTemplate(emailTemplate, settings, vars, receiptURL);

            if (langCode && receiptType === "sale") {
              try {
                const { Translate } = require("@google-cloud/translate").v2;
                const translate = new Translate({ key: googleTranslateApiKey.value() });
                const [translatedArr] = await translate.translate([subject, html], { to: langCode });
                if (translatedArr && translatedArr.length === 2) {
                  subject = translatedArr[0];
                  html = translatedArr[1];
                }
              } catch (translateErr) {
                log("Email translation failed, sending in English", translateErr.message);
              }
            }

            let _rFromEmail = settings?.storeInfo?.supportEmail || "";
            let _rFromName = settings?.storeInfo?.displayName || "";
            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: {
                user: _rFromEmail,
                pass: gmailAppPassword.value(),
              },
            });

            await transporter.sendMail({
              from: `"${_rFromName}" <${_rFromEmail}>`,
              to: customerEmail,
              subject: subject,
              html: html,
            });

            log("Receipt email sent", { to: customerEmail });
          }
        } catch (emailError) {
          log("Email sending failed in sendReceipt", emailError.message);
        }
      }

      // Step 6: Post-processing
      if (updateWorkorderField && updateWorkorderField.workorderID && updateWorkorderField.field) {
        try {
          await db
            .collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("open-workorders").doc(updateWorkorderField.workorderID)
            .set({ [updateWorkorderField.field]: receiptURL }, { merge: true });
          log("Updated workorder field", { workorderID: updateWorkorderField.workorderID, field: updateWorkorderField.field });
        } catch (woError) {
          log("Error updating workorder field in sendReceipt", woError.message);
        }
      }

      return {
        success: true,
        receiptURL: receiptURL,
      };
    } catch (error) {
      log("Error in sendReceiptCallable", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to send receipt: " + (error.message || "Unknown error"));
    }
  })
);

// ============================================================================
// Google Cloud Translation
// ============================================================================
exports.translateTextCallable = onCall(
  {
    secrets: [googleTranslateApiKey],
  },
  withFeatureTracking("translate.text", async (request, tracker) => {
    log("Incoming translateText callable request", request.data);
    requireCallableAuth(request);

    try {
      const { text, targetLanguage, sourceLanguage } = request.data;

      const isArray = Array.isArray(text);
      if (
        !text ||
        (isArray && (text.length === 0 || text.some((t) => typeof t !== "string" || !t.trim()))) ||
        (!isArray && (typeof text !== "string" || text.trim().length === 0))
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Text is required and must be a non-empty string or array of non-empty strings"
        );
      }

      if (
        !targetLanguage ||
        typeof targetLanguage !== "string" ||
        targetLanguage.trim().length === 0
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Target language is required (e.g., 'es', 'fr', 'de')"
        );
      }

      const { Translate } = require("@google-cloud/translate").v2;
      const translate = new Translate({
        key: googleTranslateApiKey.value(),
      });

      const options = { to: targetLanguage };
      if (sourceLanguage) {
        options.from = sourceLanguage;
      }

      const [translatedText, apiResponse] = await translate.translate(
        text,
        options
      );

      const translations = isArray
        ? apiResponse?.data?.translations
        : [apiResponse?.data?.translations?.[0]];
      const detectedSourceLanguage =
        translations?.[0]?.detectedSourceLanguage ||
        sourceLanguage ||
        null;

      const charsTranslated = isArray
        ? text.reduce((acc, t) => acc + (t || "").length, 0)
        : (text || "").length;
      tracker.bump("translateApiCalls", 1);
      tracker.bump("translateCharacters", charsTranslated);
      tracker.set("targetLanguage", targetLanguage);
      tracker.set("detectedSourceLanguage", detectedSourceLanguage);
      tracker.set("inputItems", isArray ? text.length : 1);

      log("Translation successful", {
        targetLanguage,
        detectedSourceLanguage,
        inputLength: isArray ? text.length + " items" : text.length,
        outputLength: isArray ? translatedText.length + " items" : translatedText.length,
      });

      return {
        success: true,
        data: {
          translatedText,
          detectedSourceLanguage,
          targetLanguage,
        },
      };
    } catch (error) {
      log("Error in translateTextCallable", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "Failed to translate text: " + (error.message || "Unknown error")
      );
    }
  })
);

// ============================================================================
// NIGHTLY ARCHIVE & CLEANUP
// ============================================================================

/**
 * Clean up abandoned active sales and their associated workorders.
 * - Deletes all active-sales documents (abandoned checkout sessions)
 * - For workorders with no customerID: deletes from open-workorders
 * - For workorders with a customerID: clears activeSaleID and amountPaid
 */
async function cleanupActiveSales(db, tenantID, storeID) {
  const basePath = `tenants/${tenantID}/stores/${storeID}`;
  let salesDeleted = 0;
  let standaloneWosDeleted = 0;
  let customerWosCleaned = 0;

  try {
    const salesSnap = await db.collection(`${basePath}/active-sales`).get();
    if (salesSnap.empty) return { salesDeleted: 0, standaloneWosDeleted: 0, customerWosCleaned: 0 };

    for (const saleDoc of salesSnap.docs) {
      const sale = saleDoc.data();
      const workorderIDs = sale.workorderIDs || [];

      // Clean up associated workorders
      for (const woID of workorderIDs) {
        try {
          const woRef = db.collection(`${basePath}/open-workorders`).doc(woID);
          const woSnap = await woRef.get();
          if (!woSnap.exists) continue;
          const wo = woSnap.data();
          if (!wo.customerID) {
            // Standalone workorder — delete it
            await woRef.delete();
            standaloneWosDeleted++;
          } else {
            // Customer workorder — clear payment tracking fields
            await woRef.update({ activeSaleID: "", amountPaid: 0 });
            customerWosCleaned++;
          }
        } catch (woErr) {
          log("cleanupActiveSales: Error processing workorder " + woID, woErr.message);
        }
      }

      // Delete the active sale
      await saleDoc.ref.delete();
      salesDeleted++;
    }
  } catch (err) {
    log("cleanupActiveSales: Error for " + tenantID + "/" + storeID, err.message);
    return { success: false, error: err.message };
  }

  if (salesDeleted > 0) {
    log("cleanupActiveSales: Cleaned up " + tenantID + "/" + storeID, {
      salesDeleted, standaloneWosDeleted, customerWosCleaned,
    });
  }

  return { success: true, salesDeleted, standaloneWosDeleted, customerWosCleaned };
}

async function cleanupDeletedWorkorders(db, tenantID, storeID) {
  const basePath = `tenants/${tenantID}/stores/${storeID}`;
  let deleted = 0;

  try {
    const snap = await db.collection(`${basePath}/deleted-workorders`).get();
    if (snap.empty) return { success: true, deleted: 0 };

    const BATCH_LIMIT = 400;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const d of chunk) batch.delete(d.ref);
      await batch.commit();
      deleted += chunk.length;
    }

    log("cleanupDeletedWorkorders: Purged " + deleted + " from " + tenantID + "/" + storeID);
    return { success: true, deleted };
  } catch (err) {
    log("cleanupDeletedWorkorders: Error for " + tenantID + "/" + storeID, err.message);
    return { success: false, error: err.message, deleted };
  }
}

async function cleanupSmsCanRespond(db, tenantID, storeID) {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const cutoffMillis = Date.now() - THREE_DAYS_MS;
  const basePath = `tenants/${tenantID}/stores/${storeID}`;
  let threadsUpdated = 0;

  try {
    const snapshot = await db
      .collection(`${basePath}/sms-messages`)
      .where("canRespond", "==", true)
      .where("lastMillis", "<", cutoffMillis)
      .get();

    if (snapshot.empty) return { success: true, threadsUpdated: 0 };

    const batchSize = 500;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + batchSize);

      for (const doc of chunk) {
        batch.update(doc.ref, { canRespond: false });
      }

      await batch.commit();
      threadsUpdated += chunk.length;
    }

    if (threadsUpdated > 0) {
      log("cleanupSmsCanRespond: Updated " + tenantID + "/" + storeID, { threadsUpdated });
    }

    return { success: true, threadsUpdated };
  } catch (err) {
    log("cleanupSmsCanRespond: Error for " + tenantID + "/" + storeID, err.message);
    return { success: false, threadsUpdated: 0, error: err.message };
  }
}

/**
 * Cull in-app messages stored as a single map document at
 * tenants/{tenantID}/stores/{storeID}/messages/current.
 *
 * Shape: { messages: { [messageID]: { fromUserID, toUserIDs, createdMillis, readBy, deletedBy, ... } } }
 *
 * Deletes a message if EITHER:
 *  1) createdMillis is older than 30 days, OR
 *  2) createdMillis is older than 7 days AND every participant
 *     (fromUserID + every id in toUserIDs) appears as a key in readBy or deletedBy.
 *
 * One read + one write per store regardless of message count.
 */
async function cleanupInAppMessages(db, tenantID, storeID) {
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const hardCutoff = now - THIRTY_DAYS_MS;
  const ackCutoff = now - SEVEN_DAYS_MS;
  const basePath = `tenants/${tenantID}/stores/${storeID}`;

  let examined = 0;
  let deleted = 0;
  const errors = [];

  try {
    const docRef = db.doc(`${basePath}/messages/current`);
    const snap = await docRef.get();
    if (!snap.exists) return { success: true, examined: 0, deleted: 0, errors: [] };

    const data = snap.data() || {};
    const messages = data.messages || {};
    const kept = {};

    for (const [messageID, msg] of Object.entries(messages)) {
      examined++;
      try {
        const createdMillis = Number(msg?.createdMillis);
        if (!Number.isFinite(createdMillis) || createdMillis <= 0) {
          // Malformed — preserve so it can be inspected rather than silently culled.
          kept[messageID] = msg;
          continue;
        }

        if (createdMillis < hardCutoff) {
          deleted++;
          continue;
        }

        if (createdMillis < ackCutoff) {
          const toUserIDs = Array.isArray(msg?.toUserIDs) ? msg.toUserIDs : [];
          const participants = [msg?.fromUserID, ...toUserIDs].filter(Boolean);
          const readBy = msg?.readBy || {};
          const deletedBy = msg?.deletedBy || {};
          const allAcked =
            participants.length > 0 &&
            participants.every((uid) => uid in readBy || uid in deletedBy);
          if (allAcked) {
            deleted++;
            continue;
          }
        }

        kept[messageID] = msg;
      } catch (msgErr) {
        errors.push({ messageID, error: msgErr.message });
        kept[messageID] = msg;
      }
    }

    if (deleted > 0) {
      await docRef.update({ messages: kept });
      log("cleanupInAppMessages: Culled " + tenantID + "/" + storeID, { examined, deleted });
    }

    return { success: true, examined, deleted, errors };
  } catch (err) {
    log("cleanupInAppMessages: Error for " + tenantID + "/" + storeID, err.message);
    return {
      success: false,
      examined,
      deleted,
      errors: [...errors, { error: err.message }],
    };
  }
}

const ARCHIVE_COLLECTIONS = [
  "completed-workorders",
  "completed-sales",
  "customers",
  "open-workorders",
  "inventory",
  "settings",
  "active-sales",
  "punch_clock",
  "punches",
];

/**
 * Archive all documents in ARCHIVE_COLLECTIONS to Cloud Storage as JSON files.
 * @param {string} fileName - file name for the archive (e.g. "latest" or a timestamp)
 * @param {string} [subFolder] - optional subfolder under archives/ (e.g. "hourly")
 * Returns { success, docCount, error? } for each collection.
 */
async function archiveTenantStore(db, bucket, tenantID, storeID, fileName = "latest", subFolder = "") {
  const results = {};
  const logPrefix = subFolder ? subFolder + "Backup" : "nightlyArchive";
  const folderSegment = subFolder ? subFolder + "/" : "";

  for (const collectionName of ARCHIVE_COLLECTIONS) {
    try {
      const snapshot = await db
        .collection("tenants")
        .doc(tenantID)
        .collection("stores")
        .doc(storeID)
        .collection(collectionName)
        .get();

      const docs = snapshot.docs.map((doc) => ({
        _firestoreDocID: doc.id,
        ...doc.data(),
      }));

      const jsonString = JSON.stringify(docs);
      const storagePath = `${tenantID}/${storeID}/archives/${folderSegment}${collectionName}/${fileName}.json`;
      const file = bucket.file(storagePath);

      await file.save(jsonString, {
        contentType: "application/json",
        resumable: false,
        metadata: {
          customMetadata: {
            archivedAt: new Date().toISOString(),
            docCount: String(docs.length),
            tenantID,
            storeID,
          },
        },
      });

      results[collectionName] = { success: true, docCount: docs.length };
      log(
        logPrefix + ": Archived " + collectionName,
        { tenantID, storeID, docCount: docs.length, path: storagePath }
      );
    } catch (err) {
      log(
        logPrefix + ": Error archiving " + collectionName + " for " + tenantID + "/" + storeID,
        err.message
      );
      results[collectionName] = { success: false, docCount: 0, error: err.message };
    }
  }

  return results;
}

/**
 * Delete Cloud Storage media files on completed workorders older than 3 months.
 * Clears the media array on the Firestore doc after deleting files.
 * Returns { success, workordersProcessed, mediaFilesDeleted, error? }.
 */
async function cleanupOldMedia(db, bucket, tenantID, storeID) {
  const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoffMillis = Date.now() - THREE_MONTHS_MS;

  try {
    const snapshot = await db
      .collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .doc(storeID)
      .collection("completed-workorders")
      .where("paidOnMillis", "<", cutoffMillis)
      .get();

    let deletedMediaCount = 0;
    let processedWoCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const media = data.media;

      if (!media || !Array.isArray(media) || media.length === 0) continue;

      processedWoCount++;

      for (const item of media) {
        if (item.storagePath) {
          try {
            await bucket.file(item.storagePath).delete();
            deletedMediaCount++;
          } catch (err) {
            if (err.code !== 404) {
              log("nightlyArchive: Error deleting media file", {
                path: item.storagePath,
                error: err.message,
              });
            }
          }
        }

        if (item.thumbnailStoragePath) {
          try {
            await bucket.file(item.thumbnailStoragePath).delete();
          } catch (err) {
            // skip — not critical
          }
        }
      }

      await doc.ref.update({ media: [] });
    }

    if (processedWoCount > 0) {
      log("nightlyArchive: Media cleanup complete", {
        tenantID,
        storeID,
        workordersProcessed: processedWoCount,
        mediaFilesDeleted: deletedMediaCount,
      });
    }

    return {
      success: true,
      workordersProcessed: processedWoCount,
      mediaFilesDeleted: deletedMediaCount,
    };
  } catch (err) {
    log("nightlyArchive: Error in media cleanup for " + tenantID + "/" + storeID, err.message);
    return { success: false, workordersProcessed: 0, mediaFilesDeleted: 0, error: err.message };
  }
}
/**
 * Nightly scheduled function — runs at 1:00 AM Eastern every day.
 * Archives 4 Firestore collections to Cloud Storage and cleans up old media.
 * Writes an audit log document per tenant/store.
 */
exports.nightlyArchiveAndCleanup = onSchedule(
  {
    schedule: "0 1 * * *",
    timeZone: "America/New_York",
    secrets: [firebaseServiceAccountKey],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    log("nightlyArchiveAndCleanup: Starting nightly archive run");

    const db = await getDB(firebaseServiceAccountKey);
    const bucket = admin
      .storage()
      .bucket(STORAGE_BUCKET);

    let tenantsSnapshot;
    try {
      tenantsSnapshot = await db.collection("tenants").get();
    } catch (err) {
      log("nightlyArchive: Failed to enumerate tenants", err.message);
      return;
    }

    if (tenantsSnapshot.empty) {
      log("nightlyArchive: No tenants found, exiting");
      return;
    }

    for (const tenantDoc of tenantsSnapshot.docs) {
      const tenantID = tenantDoc.id;
      let storesSnapshot;

      try {
        storesSnapshot = await db
          .collection("tenants")
          .doc(tenantID)
          .collection("stores")
          .get();
      } catch (err) {
        log("nightlyArchive: Error fetching stores for tenant " + tenantID, err.message);
        continue;
      }

      for (const storeDoc of storesSnapshot.docs) {
        const storeID = storeDoc.id;

        try {
          const archiveResults = await archiveTenantStore(db, bucket, tenantID, storeID);
          const mediaResults = await cleanupOldMedia(db, bucket, tenantID, storeID);
          const activeSaleResults = await cleanupActiveSales(db, tenantID, storeID);
          const smsCleanupResults = await cleanupSmsCanRespond(db, tenantID, storeID);
          const deletedWorkorderResults = await cleanupDeletedWorkorders(db, tenantID, storeID);
          const inAppMessageResults = await cleanupInAppMessages(db, tenantID, storeID);

          // Write audit log
          const now = Date.now();
          const dateStr = new Date(now).toISOString().split("T")[0];
          await db
            .collection("tenants")
            .doc(tenantID)
            .collection("stores")
            .doc(storeID)
            .collection("archive-logs")
            .doc(String(now))
            .set({
              millis: now,
              date: dateStr,
              type: "nightly-archive",
              archive: archiveResults,
              mediaCleanup: mediaResults,
              activeSaleCleanup: activeSaleResults,
              smsCleanup: smsCleanupResults,
              deletedWorkorderCleanup: deletedWorkorderResults,
              inAppMessageCleanup: inAppMessageResults,
            });

          log("nightlyArchive: Completed " + tenantID + "/" + storeID, {
            archive: archiveResults,
            mediaCleanup: mediaResults,
            activeSaleCleanup: activeSaleResults,
            smsCleanup: smsCleanupResults,
            deletedWorkorderCleanup: deletedWorkorderResults,
            inAppMessageCleanup: inAppMessageResults,
          });
        } catch (err) {
          log(
            "nightlyArchive: Error processing " + tenantID + "/" + storeID,
            err.message
          );
        }
      }
    }

    log("nightlyArchiveAndCleanup: Nightly archive run complete");
  }
);

/**
 * Manual trigger for the nightly archive process.
 * Runs the same archive + cleanup as the scheduled function.
 */
exports.manualArchiveAndCleanup = onCall(
  {
    secrets: [firebaseServiceAccountKey],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (request) => {
    log("manualArchiveAndCleanup: Manual archive triggered");

    const { tenantID, storeID } = request.data || {};
    requireTenantMatch(request, tenantID, storeID);
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required");
    }

    const db = await getDB(firebaseServiceAccountKey);

    const bucket = admin
      .storage()
      .bucket(STORAGE_BUCKET);

    try {
      const archiveResults = await archiveTenantStore(db, bucket, tenantID, storeID);
      const mediaResults = await cleanupOldMedia(db, bucket, tenantID, storeID);
      const activeSaleResults = await cleanupActiveSales(db, tenantID, storeID);

      const now = Date.now();
      const dateStr = new Date(now).toISOString().split("T")[0];
      await db
        .collection("tenants")
        .doc(tenantID)
        .collection("stores")
        .doc(storeID)
        .collection("archive-logs")
        .doc(String(now))
        .set({
          millis: now,
          date: dateStr,
          type: "manual-archive",
          archive: archiveResults,
          mediaCleanup: mediaResults,
          activeSaleCleanup: activeSaleResults,
        });

      log("manualArchiveAndCleanup: Completed", { archive: archiveResults, mediaCleanup: mediaResults, activeSaleCleanup: activeSaleResults });
      return { success: true, archive: archiveResults, mediaCleanup: mediaResults, activeSaleCleanup: activeSaleResults };
    } catch (err) {
      log("manualArchiveAndCleanup: Error", err.message);
      throw new HttpsError("internal", err.message);
    }
  }
);

/**
 * Emergency rehydration — restores Firestore collections from Cloud Storage archives.
 * Called from the app by admin users in case of database corruption.
 */
exports.rehydrateFromArchive = onCall(
  {
    secrets: [firebaseServiceAccountKey],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (request) => {
    log("rehydrateFromArchive: Request received", request.data);

    const { tenantID, storeID, collections, hourlyTimestamp } = request.data;
    requireTenantMatch(request, tenantID, storeID);

    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required");
    }
    if (!storeID || typeof storeID !== "string") {
      throw new HttpsError("invalid-argument", "storeID is required");
    }

    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      throw new HttpsError("invalid-argument", "collections must be a non-empty array");
    }

    for (const c of collections) {
      if (!ARCHIVE_COLLECTIONS.includes(c)) {
        throw new HttpsError("invalid-argument", "Invalid collection name: " + c);
      }
    }

    const source = hourlyTimestamp ? "hourly" : "nightly";
    log("rehydrateFromArchive: Source = " + source, { hourlyTimestamp });

    const db = await getDB(firebaseServiceAccountKey);

    const bucket = admin
      .storage()
      .bucket(STORAGE_BUCKET);

    const results = {};

    for (const collectionName of collections) {
      try {
        const storagePath = hourlyTimestamp
          ? `${tenantID}/${storeID}/archives/hourly/${collectionName}/${hourlyTimestamp}.json`
          : `${tenantID}/${storeID}/archives/${collectionName}/latest.json`;
        const file = bucket.file(storagePath);

        const [exists] = await file.exists();
        if (!exists) {
          results[collectionName] = {
            success: false,
            error: "Archive file not found",
            docCount: 0,
          };
          continue;
        }

        const [buffer] = await file.download();
        const docs = JSON.parse(buffer.toString("utf8"));

        if (!Array.isArray(docs)) {
          results[collectionName] = {
            success: false,
            error: "Archive is not a valid array",
            docCount: 0,
          };
          continue;
        }

        const collectionRef = db
          .collection("tenants")
          .doc(tenantID)
          .collection("stores")
          .doc(storeID)
          .collection(collectionName);

        let batch = db.batch();
        let batchCount = 0;
        let totalWritten = 0;

        for (const doc of docs) {
          const docID = doc._firestoreDocID;
          if (!docID) {
            log("rehydrate: Skipping doc without _firestoreDocID in " + collectionName);
            continue;
          }

          const docData = { ...doc };
          delete docData._firestoreDocID;

          batch.set(collectionRef.doc(docID), docData);
          batchCount++;
          totalWritten++;

          if (batchCount >= 500) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }

        results[collectionName] = { success: true, docCount: totalWritten };
        log("rehydrate: Restored " + collectionName, {
          tenantID,
          storeID,
          docCount: totalWritten,
        });
      } catch (err) {
        log("rehydrate: Error restoring " + collectionName, err.message);
        results[collectionName] = {
          success: false,
          error: err.message,
          docCount: 0,
        };
      }
    }

    // Write audit log for rehydration
    try {
      const now = Date.now();
      const dateStr = new Date(now).toISOString().split("T")[0];
      await db
        .collection("tenants")
        .doc(tenantID)
        .collection("stores")
        .doc(storeID)
        .collection("archive-logs")
        .doc(String(now))
        .set({
          millis: now,
          date: dateStr,
          type: "rehydration",
          source: hourlyTimestamp ? "hourly-" + hourlyTimestamp : "nightly-latest",
          collections: results,
        });
    } catch (err) {
      log("rehydrate: Failed to write audit log", err.message);
    }

    return { success: true, results };
  }
);

/**
 * Lists available hourly backup timestamps for a tenant/store.
 * Returns a sorted array of { timestamp, archivedAt, docCounts }.
 */
exports.listHourlyBackupsCallable = onCall(
  {
    secrets: [firebaseServiceAccountKey],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const { tenantID, storeID } = request.data || {};
    requireTenantMatch(request, tenantID, storeID);

    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required");
    }

    const bucket = admin
      .storage()
      .bucket(STORAGE_BUCKET);

    const backupMap = {};

    for (const collectionName of ARCHIVE_COLLECTIONS) {
      const prefix = `${tenantID}/${storeID}/archives/hourly/${collectionName}/`;
      const [files] = await bucket.getFiles({ prefix });

      for (const file of files) {
        const fileName = file.name.split("/").pop().replace(".json", "");
        const meta = file.metadata?.metadata || {};

        if (!backupMap[fileName]) {
          backupMap[fileName] = {
            timestamp: fileName,
            archivedAt: meta.archivedAt || null,
            docCounts: {},
          };
        }
        backupMap[fileName].docCounts[collectionName] = Number(meta.docCount) || 0;
      }
    }

    const backups = Object.values(backupMap).sort(
      (a, b) => (b.archivedAt || "").localeCompare(a.archivedAt || "")
    );

    return { success: true, backups };
  }
);

// ============================================================================
// TEXT-TO-PAY / EMAIL-TO-PAY
// ============================================================================

function generateSaleID() {
  return generateEAN13Barcode();
}

// Helper: calculate workorder totals server-side
// Mirrors calculateRunningTotals (utils.js:113) + calculateSaleTotals (newCheckoutUtils.js:51)
function calculateWorkorderTotal(workorder, settings) {
  let subtotal = 0;
  let discount = 0;
  let total = 0;
  let qty = 0;

  (workorder.workorderLines || []).forEach((line) => {
    const lineQty = Number(line.qty) || 1;
    const price = Number(line.inventoryItem?.price) || 0;
    const lineSubtotal = price * lineQty;
    subtotal += lineSubtotal;
    qty += lineQty;

    const discountNewPrice = line.discountObj?.newPrice;
    const discountSavings = line.discountObj?.savings;
    if (discountNewPrice) {
      total += Number(discountNewPrice);
      discount += Number(discountSavings);
    } else {
      total += lineSubtotal;
    }
  });

  // Tax (skip if workorder.taxFree)
  const taxPercent = settings.salesTaxPercent || 0;
  const tax = workorder.taxFree ? 0 : Math.round(total * (taxPercent / 100));

  // Card fee (always applied for remote payment — it's always a card)
  let cardFee = 0;
  const cardFeePercent = settings.useCardFee ? (settings.cardFeePercent || 0) : 0;
  if (cardFeePercent > 0) {
    cardFee = Math.round((total + tax) * (cardFeePercent / 100));
  }

  const grandTotal = total + tax + cardFee;

  return {
    subtotal,
    discount,
    discountedTotal: total,
    tax,
    cardFee,
    cardFeePercent,
    salesTaxPercent: taxPercent,
    total: grandTotal,
    qty,
  };
}

// Helper: find highest-priced item (mirrors newCheckoutFirebaseCalls.js:343)
function findHighestItem(workorderLines) {
  let highestName = "";
  let highestPrice = 0;
  (workorderLines || []).forEach((line) => {
    const lineTotal = (Number(line.qty) || 1) * (Number(line.inventoryItem?.price) || 0);
    if (lineTotal > highestPrice) {
      highestPrice = lineTotal;
      highestName = line.inventoryItem?.formalName || line.inventoryItem?.informalName || "";
    }
  });
  return { highestName, highestPrice };
}

// ─── completeSaleServerSide ──────────────────────────────────────
// Shared helper used by both stripeCheckoutWebhook_Terminal and
// stripeCheckoutWebhook_LinkToPay to complete a sale after payment.
//
// Params:
//   db             — Firestore instance
//   sale           — active sale object (from Firestore)
//   saleID         — sale document ID
//   tenantID       — tenant ID
//   storeID        — store ID
//   customerID     — customer ID (may be "")
//   workorderIDs   — array of workorder IDs to complete
//   payment        — payment object to add to sale
//   charge         — Stripe charge object (for receipt URL)
//   settings       — store settings (fetched before calling)
//   customer       — customer object (fetched before calling)
//   logPrefix      — "Terminal" or "LinkToPay" for log messages
//   twilioClient   — initialized Twilio client (or null)
//   twilioSecretAccountNumber — secret ref
//   twilioSecretKey — secret ref
//   gmailAppPassword — secret ref
//   channel        — "sms" | "email" | "both" | undefined
//
// Returns: { completed: bool, partial: bool }
function recomputeSaleAmountsServer(sale, transactions, credits) {
  let txnTotal = (transactions || []).reduce((sum, t) => sum + (t.amountCaptured || 0), 0);
  let creditTotal = (credits || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  let refundTotal = (transactions || []).reduce((sum, t) => sum + ((t.refunds || []).reduce((rs, r) => rs + (r.amount || 0), 0)), 0);
  sale.amountCaptured = txnTotal + creditTotal;
  sale.amountRefunded = refundTotal;
  let fullyPaid = sale.amountCaptured >= (sale.total || 0) && (sale.total || 0) > 0;
  sale.paymentComplete = fullyPaid;
  return sale;
}

async function completeSaleServerSide({
  db, sale, saleID, tenantID, storeID, customerID,
  workorderIDs, payment, charge, settings, customer,
  logPrefix, twilioClientRef, twilioSecretAccountNumber, twilioSecretKey,
  gmailAppPassword, channel, directPhone,
}) {
  // Compute proportional salesTax for this payment (sale.total/salesTax already set from active sale)
  if (sale.total > 0 && sale.salesTax > 0) {
    payment.salesTax = Math.round(sale.salesTax * (payment.amountCaptured / sale.total));
  } else {
    payment.salesTax = 0;
  }

  // Write payment as a transaction document
  const txnDoc = {
    id: payment.id,
    method: payment.method || "card",
    millis: payment.millis || Date.now(),
    amountCaptured: payment.amountCaptured || 0,
    amountTendered: payment.amountTendered || 0,
    salesTax: payment.salesTax || 0,
    last4: payment.last4 || "",
    expMonth: payment.expMonth || "",
    expYear: payment.expYear || "",
    cardType: payment.cardType || "",
    cardIssuer: payment.cardIssuer || "",
    paymentProcessor: payment.paymentProcessor || "",
    paymentIntentID: payment.paymentIntentID || "",
    chargeID: payment.chargeID || "",
    authorizationCode: payment.authorizationCode || "",
    networkTransactionID: payment.networkTransactionID || "",
    receiptURL: payment.receiptURL || "",
    refunds: [],
  };
  await db.collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("transactions").doc(payment.id)
    .set(txnDoc);

  // Add transaction ID to sale
  sale.transactionIDs = [...(sale.transactionIDs || []), payment.id];

  // Load all transactions for recomputation
  let allTransactions = [];
  for (const txnID of sale.transactionIDs) {
    const txnSnap = await db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("transactions").doc(txnID).get();
    if (txnSnap.exists) allTransactions.push(txnSnap.data());
  }

  recomputeSaleAmountsServer(sale, allTransactions, [...(sale.creditsApplied || []), ...(sale.depositsApplied || [])]);

  // Check if fully paid
  if (!sale.paymentComplete) {
    // Partial payment — update active sale (no inline transactions)
    const { transactions, ...saleToPersist } = sale;
    await db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("active-sales").doc(saleID)
      .set(saleToPersist, { merge: true });
    log(`completeSaleServerSide[${logPrefix}]: partial payment recorded`, {
      saleID, amountCaptured: sale.amountCaptured, total: sale.total,
    });
    return { completed: false, partial: true };
  }

  // ── Sale is fully paid ──
  log(`completeSaleServerSide[${logPrefix}]: sale fully paid, completing`, { saleID });

  // ── Complete workorders ──
  const statuses = settings?.statuses || [];
  const _resolveLabel = (statusId) => {
    if (!statusId || !statuses.length) return "Unknown";
    let match = statuses.find((s) => s.id === statusId);
    return match ? match.label : "Unknown";
  };
  for (let i = 0; i < workorderIDs.length; i++) {
    const woID = workorderIDs[i];
    const woRef = db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("open-workorders").doc(woID);
    const woSnap = await woRef.get();
    if (woSnap.exists) {
      const wo = woSnap.data();
      const timestamp = Date.now();
      const oldStatus = wo.status || "";
      const oldStatusLabel = _resolveLabel(oldStatus);
      const newStatusLabel = _resolveLabel("finished_and_paid");

      wo.paymentComplete = true;
      wo.activeSaleID = "";
      wo.amountPaid = sale.total;
      wo.saleID = sale.id;
      wo.paidOnMillis = timestamp;

      let entries = [];
      if (oldStatus !== "finished_and_paid") {
        entries.push({ timestamp, user: "System", field: "status", action: "changed", from: oldStatusLabel, to: newStatusLabel });
      }
      entries.push({ timestamp, user: "System", field: "payment", action: "completed", from: "", to: "Sale completed — $" + (sale.total / 100).toFixed(2) });
      wo.changeLog = [...(wo.changeLog || []), ...entries];
      wo.status = "finished_and_paid";

      // Link-to-pay completions leave the workorder in the open list with status "finished_and_paid".
      // The product hasn't been picked up yet — staff archives it via the "Save & Archive Workorder" button
      // on the closed-workorder modal once the customer collects it. This mirrors the "Keep Ticket Open"
      // outcome of the in-store checkout pickup-decision modal.
      await woRef.set(wo);
    }
  }

  // ── Write completed sale, delete active sale ──
  // Strip legacy inline transactions field if present (transactions are in their own collection now)
  const { transactions: _legacyTxns, refunds: _legacyRefunds, ...cleanSale } = sale;
  await db.collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("completed-sales").doc(saleID)
    .set(cleanSale);
  await db.collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("active-sales").doc(saleID)
    .delete();

  // ── Add sale ID to customer's sales array ──
  const custID = customerID || sale.customerID;
  if (custID) {
    try {
      const custRef = db.collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("customers").doc(custID);
      const custSnap = await custRef.get();
      if (custSnap.exists) {
        const custData = custSnap.data();
        const custSales = custData.sales || [];
        if (!custSales.includes(saleID)) {
          await custRef.update({ sales: [...custSales, saleID] });
        }
      }
    } catch (e) {
      log(`completeSaleServerSide[${logPrefix}]: failed to update customer sales array`, e);
    }
  }

  // ── Save sales index ──
  // Workorder stays in open-workorders after link-to-pay completion (not archived to completed-workorders).
  let allLines = [];
  let primaryWO = null;
  for (const woID of workorderIDs) {
    const woSnap = await db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("open-workorders").doc(woID)
      .get();
    if (woSnap.exists) {
      const wo = woSnap.data();
      if (!primaryWO) primaryWO = wo;
      allLines = [...allLines, ...(wo.workorderLines || [])];
    }
  }
  const { highestName, highestPrice } = findHighestItem(allLines);
  const hasCash = allTransactions.some((t) => t.method === "cash");
  const hasCard = allTransactions.some((t) => t.method === "card");
  let paymentType = "";
  if (hasCash && hasCard) paymentType = "Split";
  else if (hasCash) paymentType = "Cash";
  else if (hasCard) paymentType = "Card";

  // ── Print receipt (if enabled in settings and sale is complete) ──
  const printerID = settings?.printerCloudId || "";
  if (settings?.autoPrintSalesReceipt && printerID && primaryWO) {
    try {
      const printContext = { currentUser: { first: "System", last: "" }, settings };
      const customerForPrint = {
        first: customer?.first || primaryWO?.customerFirst || "",
        last: customer?.last || primaryWO?.customerLast || "",
        customerCell: customer?.customerCell || customer?.cell || primaryWO?.customerCell || "",
        customerLandline: customer?.customerLandline || "",
        email: customer?.email || primaryWO?.customerEmail || "",
      };
      const printObj = sharedPrintBuilder.sale(sale, allTransactions, customerForPrint, primaryWO, sale.salesTaxPercent || 0, printContext, [...(sale.creditsApplied || []), ...(sale.depositsApplied || [])]);
      printObj.id = crypto.randomUUID();
      printObj.timestamp = Date.now();

      // Remove undefined/null values (Firestore rejects undefined)
      const cleanPrint = JSON.parse(JSON.stringify(printObj));

      await db.collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("printers").doc(printerID)
        .collection("to_print").doc(cleanPrint.id)
        .set(cleanPrint);

      // Auto-delete after 5 seconds (match frontend behavior)
      setTimeout(async () => {
        try {
          await db.collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("printers").doc(printerID)
            .collection("to_print").doc(cleanPrint.id)
            .delete();
        } catch (e) { /* ignore cleanup errors */ }
      }, 5000);

      // Pop cash register if cash change needed
      const hasCashChange = allTransactions.some(
        (t) => t.method === "cash" && t.amountTendered > t.amountCaptured
      );
      if (hasCashChange) {
        const registerObj = { id: crypto.randomUUID(), popCashRegister: true, timestamp: Date.now() };
        await db.collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("printers").doc(printerID)
          .collection("to_print").doc(registerObj.id)
          .set(registerObj);
        setTimeout(async () => {
          try {
            await db.collection("tenants").doc(tenantID)
              .collection("stores").doc(storeID)
              .collection("printers").doc(printerID)
              .collection("to_print").doc(registerObj.id)
              .delete();
          } catch (e) { /* ignore */ }
        }, 5000);
      }

      log(`completeSaleServerSide[${logPrefix}]: print receipt written`, { printerID });
    } catch (printErr) {
      log(`completeSaleServerSide[${logPrefix}]: print error (non-fatal)`, printErr.message);
    }
  }

  // ── Send receipt SMS ──
  const storeName = settings?.storeInfo?.displayName || "";
  const receiptUrl = charge?.receipt_url || "";
  const amountDisplay = (sale.total / 100).toFixed(2);
  const cleanPhone = (directPhone || customer?.customerCell || customer?.cell || primaryWO?.customerCell || "").replace(/\D/g, "");
  const customerEmail = customer?.email || "";

  // SMS: Terminal uses autoSMSSalesReceipt setting; LinkToPay uses channel
  const shouldSMS = channel
    ? (channel === "sms" || channel === "both") && cleanPhone.length === 10
    : settings?.autoSMSSalesReceipt && cleanPhone.length === 10;

  if (shouldSMS) {
    try {
      let _twilio = twilioClientRef;
      if (!_twilio) {
        _twilio = require("twilio")(
          twilioSecretAccountNumber.value(),
          twilioSecretKey.value()
        );
      }
      const receiptMsg = `Payment of $${amountDisplay} received by ${storeName}. Thank you! View your receipt: ${receiptUrl}`;
      const receiptMsgID = crypto.randomUUID();
      const receiptCallbackParams = `?tenantID=${tenantID}&storeID=${storeID}&phone=${cleanPhone}&messageID=${receiptMsgID}`;
      let _tnReceipt = (settings?.storeInfo?.textingNumber || "").replace(/\D/g, "");
      if (_tnReceipt.length !== 10) throw new Error("No texting number configured in store settings");
      let _fromReceipt = `+1${_tnReceipt}`;
      await _twilio.messages.create({
        body: receiptMsg,
        to: `+1${cleanPhone}`,
        from: _fromReceipt,
        statusCallback: `${FUNCTIONS_BASE_URL}/smsStatusCallback${receiptCallbackParams}`,
      });
      const receiptConvRef = db.collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("sms-messages").doc(cleanPhone);
      await receiptConvRef.collection("messages").doc(receiptMsgID)
        .set({
          id: receiptMsgID,
          customerID: customerID || "",
          message: receiptMsg,
          phoneNumber: cleanPhone,
          tenantID,
          storeID,
          type: "outgoing",
          millis: Date.now(),
          paymentConfirmation: true,
          ...(channel ? { textToPay: true } : {}),
        });
      await receiptConvRef.set({
        lastMessage: receiptMsg,
        lastMillis: Date.now(),
        lastType: "outgoing",
        lastOutgoingMessageID: receiptMsgID,
        lastOutgoingMessageStatus: "queued",
        lastOutgoingMillis: Date.now(),
        threadStatus: "open",
      }, { merge: true });
      log(`completeSaleServerSide[${logPrefix}]: receipt SMS sent`, { phone: cleanPhone });
    } catch (smsErr) {
      log(`completeSaleServerSide[${logPrefix}]: SMS error`, smsErr.message);
    }
  }

  // ── Send receipt email ──
  const shouldEmail = channel
    ? (channel === "email" || channel === "both") && customerEmail && customerEmail.includes("@")
    : settings?.autoEmailSalesReceipt && customerEmail && customerEmail.includes("@");

  if (shouldEmail) {
    try {
      let _csFromEmail = settings?.storeInfo?.supportEmail || "";
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: _csFromEmail,
          pass: gmailAppPassword.value(),
        },
      });
      await transporter.sendMail({
        from: `"${storeName}" <${_csFromEmail}>`,
        to: customerEmail,
        subject: `Payment Receipt from ${storeName} — $${amountDisplay}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto"><p>Payment of <strong>$${amountDisplay}</strong> received by ${storeName}. Thank you!</p><p style="margin:24px 0"><a href="${receiptUrl}" style="display:inline-block;padding:12px 24px;background-color:#4CAF50;color:white;text-decoration:none;border-radius:6px;font-size:14px">View Receipt</a></p></div>`,
      });
      log(`completeSaleServerSide[${logPrefix}]: receipt email sent`, { email: customerEmail });
    } catch (emailErr) {
      log(`completeSaleServerSide[${logPrefix}]: email error`, emailErr.message);
    }
  }

  // ── Link-to-pay: send confirmation email to store office ──
  if (logPrefix === "LinkToPay") {
    const officeEmail = settings?.storeInfo?.officeEmail || "";
    if (officeEmail && officeEmail.includes("@")) {
      try {
        let _offFromEmail = settings?.storeInfo?.supportEmail || "";
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: _offFromEmail,
            pass: gmailAppPassword.value(),
          },
        });
        const custName = [customer?.first || primaryWO?.customerFirst || "", customer?.last || primaryWO?.customerLast || ""].filter(Boolean).join(" ") || "Unknown";
        const woID = primaryWO?.id || workorderIDs?.[0] || "";
        await transporter.sendMail({
          from: `"${storeName}" <${_offFromEmail}>`,
          to: officeEmail,
          subject: `Payment Received - $${amountDisplay} - ${custName} - ${woID}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto"><p>A link-to-pay payment of <strong>$${amountDisplay}</strong> was received.</p><p><strong>Customer:</strong> ${custName}</p><p><strong>Workorder:</strong> ${woID}</p><p style="margin:24px 0"><a href="${receiptUrl}" style="display:inline-block;padding:12px 24px;background-color:#4CAF50;color:white;text-decoration:none;border-radius:6px;font-size:14px">View Payment</a></p></div>`,
        });
        log(`completeSaleServerSide[${logPrefix}]: store confirmation email sent`, { officeEmail });
      } catch (officeErr) {
        log(`completeSaleServerSide[${logPrefix}]: store confirmation email error`, officeErr.message);
      }
    }

    // ── Link-to-pay: add confirmation to customer SMS queue ──
    if (cleanPhone.length === 10) {
      try {
        const confirmMsg = `Link-to-pay: Payment of $${amountDisplay} received. View receipt: ${receiptUrl}`;
        const confirmMsgID = crypto.randomUUID();
        const confirmConvRef = db.collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("sms-messages").doc(cleanPhone);
        await confirmConvRef.collection("messages").doc(confirmMsgID)
          .set({
            id: confirmMsgID,
            customerID: customerID || "",
            message: confirmMsg,
            phoneNumber: cleanPhone,
            fromNumber: _fromReceipt,
            tenantID,
            storeID,
            type: "incoming",
            millis: Date.now(),
            textToPay: true,
            paymentConfirmation: true,
          });
        await confirmConvRef.set({
          lastMessage: confirmMsg,
          lastMillis: Date.now(),
          lastType: "incoming",
          threadStatus: "open",
        }, { merge: true });
        log(`completeSaleServerSide[${logPrefix}]: confirmation added to SMS queue`, { phone: cleanPhone });
      } catch (queueErr) {
        log(`completeSaleServerSide[${logPrefix}]: SMS queue error`, queueErr.message);
      }
    }
  }

  log(`completeSaleServerSide[${logPrefix}]: sale completed`, { saleID });
  return { completed: true, partial: false };
}

// ─── createTextToPayInvoice ─────────────────────────────────────
// Creates a Stripe Checkout Session, saves an active sale, and sends
// the payment link via SMS and/or email.

exports.createTextToPayInvoice = onCall(
  {
    secrets: [
      stripeSecretKey,
      firebaseServiceAccountKey,
      twilioSecretKey,
      twilioSecretAccountNumber,
      gmailAppPassword,
    ],
  },
  async (request) => {
    log("createTextToPayInvoice: incoming request", request.data);
    requireCallableAuth(request);

    try {
      const { workorderID, channel, tenantID, storeID, phone: directPhone, email: directEmail, amountCents: requestedAmountCents } = request.data;

      // ── Validate input ──
      if (!workorderID || typeof workorderID !== "string") {
        throw new HttpsError("invalid-argument", "Workorder ID is required");
      }
      if (!channel || !["sms", "email", "both"].includes(channel)) {
        throw new HttpsError("invalid-argument", "Channel must be 'sms', 'email', or 'both'");
      }
      if (!tenantID || !storeID) {
        throw new HttpsError("invalid-argument", "tenantID and storeID are required");
      }
      if (requestedAmountCents !== undefined && requestedAmountCents !== null) {
        if (!Number.isInteger(requestedAmountCents) || requestedAmountCents <= 0) {
          throw new HttpsError("invalid-argument", "amountCents must be a positive integer");
        }
      }

      requireTenantMatch(request, tenantID, storeID);

      const db = await getDB(firebaseServiceAccountKey);
      const stripeClient = Stripe(stripeSecretKey.value());

      // ── Fetch workorder ──
      const woSnap = await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("open-workorders").doc(workorderID)
        .get();

      if (!woSnap.exists) {
        throw new HttpsError("not-found", "Workorder not found");
      }
      const workorder = woSnap.data();

      if (!workorder.workorderLines || workorder.workorderLines.length === 0) {
        throw new HttpsError("failed-precondition", "Workorder has no line items");
      }
      if (workorder.paymentComplete) {
        throw new HttpsError("failed-precondition", "Workorder is already paid");
      }
      // ── Fetch settings ──
      const settingsSnap = await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("settings").doc("settings")
        .get();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const storeName = settings?.storeInfo?.displayName || "Our store";

      // ── Fetch customer ──
      const customerID = workorder.customerID;
      let customer = {};
      if (customerID) {
        const custSnap = await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("customers").doc(customerID)
          .get();
        if (custSnap.exists) customer = custSnap.data();
      }

      const cleanPhone = directPhone ? directPhone.replace(/\D/g, "") : (customer.customerCell || customer.cell || "").replace(/\D/g, "");
      const customerEmail = directEmail || customer.email || "";

      // Validate channel against available contact info
      if ((channel === "sms" || channel === "both") && cleanPhone.length !== 10) {
        throw new HttpsError("failed-precondition", "No valid phone number for SMS");
      }
      if ((channel === "email" || channel === "both") && (!customerEmail || !customerEmail.includes("@"))) {
        throw new HttpsError("failed-precondition", "No valid email address");
      }

      // ── Calculate totals ──
      const totals = calculateWorkorderTotal(workorder, settings);
      let remainingAmount = totals.total - (workorder.amountPaid || 0);

      // If active sale exists, calculate remaining from the sale's captured amount
      let existingSaleID = null;
      if (workorder.activeSaleID) {
        const existingSaleSnap = await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("active-sales").doc(workorder.activeSaleID)
          .get();
        if (existingSaleSnap.exists) {
          const existingSale = existingSaleSnap.data();
          remainingAmount = (existingSale.total || 0) - (existingSale.amountCaptured || 0);
          existingSaleID = workorder.activeSaleID;
        }
      }

      if (remainingAmount <= 0) {
        throw new HttpsError("failed-precondition", "Workorder balance is already paid");
      }

      let amountToCharge = remainingAmount;
      if (requestedAmountCents !== undefined && requestedAmountCents !== null) {
        if (requestedAmountCents > remainingAmount) {
          throw new HttpsError("failed-precondition", "Requested amount exceeds remaining balance");
        }
        amountToCharge = requestedAmountCents;
      }

      if (amountToCharge < 50) {
        throw new HttpsError("failed-precondition", "Amount must be at least $0.50 for card payment");
      }

      // ── Create or reuse sale object ──
      let saleID;
      if (existingSaleID) {
        saleID = existingSaleID;
      } else {
        saleID = await _generateId(db, "sales");
        const sale = {
          id: saleID,
          millis: Date.now(),
          subtotal: totals.subtotal,
          discount: totals.discount > 0 ? totals.discount : null,
          salesTax: totals.tax,
          cardFee: totals.cardFee,
          cardFeePercent: totals.cardFeePercent,
          salesTaxPercent: totals.salesTaxPercent,
          total: totals.total,
          amountCaptured: 0,
          amountRefunded: 0,
          paymentComplete: false,
          workorderIDs: [workorderID],
          payments: [],
          refunds: [],
          status: "pending_remote_payment",
          textToPay: true,
          checkoutSessionID: "",
          customerID: customerID || "",
          channel,
        };

        await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("active-sales").doc(saleID)
          .set(sale);

        await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("open-workorders").doc(workorderID)
          .update({ activeSaleID: saleID });
      }

      // ── Create Stripe Checkout Session ──
      const session = await stripeClient.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amountToCharge,
              product_data: {
                name: `${storeName} — Workorder #${workorder.workorderNumber || workorderID}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          tenantID,
          storeID,
          saleID,
          workorderID,
          customerID: customerID || "",
          channel,
          phone: cleanPhone || "",
        },
        expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        success_url: `${WEB_APP_URL}/payment-success`,
        cancel_url: `${WEB_APP_URL}/payment-cancelled`,
      });

      // Update sale with checkout session ID
      await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("active-sales").doc(saleID)
        .update({ checkoutSessionID: session.id });

      // ── Generate workorder ticket PDF ──
      const pdfData = {
        shopName: storeName,
        shopContactBlurb: settings?.shopContactBlurb || "",
        barcode: workorderID,
        workorderNumber: workorder.workorderNumber || "",
        startedOnMillis: workorder.startedOnMillis || "",
        first: customer?.first || workorder.customerFirst || "",
        last: customer?.last || workorder.customerLast || "",
        customerContact: cleanPhone.length === 10
          ? `(${cleanPhone.slice(0,3)}) ${cleanPhone.slice(3,6)}-${cleanPhone.slice(6)}`
          : (customerEmail || ""),
        brand: workorder.brand || "",
        description: workorder.description || "",
        color1: workorder.color1?.label || "",
        color2: workorder.color2?.label || "",
        workorderLines: (workorder.workorderLines || []).map((line) => {
          const qty = Number(line.qty) || 1;
          const price = Number(line.inventoryItem?.price) || 0;
          return {
            itemName: line.inventoryItem?.formalName || line.inventoryItem?.informalName || "",
            qty,
            price,
            finalPrice: line.discountObj?.newPrice || price * qty,
            discountName: line.discountObj?.name || "",
            discountSavings: line.discountObj?.savings || 0,
            receiptNotes: line.inventoryItem?.receiptNotes || "",
          };
        }),
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        cardFee: totals.cardFee,
        cardFeePercent: totals.cardFeePercent,
        total: totals.total,
        customerNotes: workorder.customerNotes || [],
      };

      const pdfBase64 = generateWorkorderTicketPDF(pdfData);
      const pdfPath = `${tenantID}/${storeID}/workorder-tickets/${workorderID}.pdf`;
      const bucket = admin.storage().bucket(STORAGE_BUCKET);
      const pdfFile = bucket.file(pdfPath);
      await pdfFile.save(Buffer.from(pdfBase64, "base64"), {
        contentType: "application/pdf",
        metadata: { contentType: "application/pdf" },
      });
      await pdfFile.makePublic();
      const ticketURL = `https://storage.googleapis.com/${bucket.name}/${pdfPath}`;

      log("createTextToPayInvoice: workorder ticket PDF uploaded", { ticketURL });

      // ── Send payment link ──
      const amountDisplay = (amountToCharge / 100).toFixed(2);

      // SMS
      if (channel === "sms" || channel === "both") {
        if (!twilioClient) {
          twilioClient = require("twilio")(
            twilioSecretAccountNumber.value(),
            twilioSecretKey.value()
          );
        }

        const smsBody = `💳 ${storeName} has sent you a payment request for $${amountDisplay}. View ticket: ${ticketURL} Pay securely here: ${session.url}`;
        let _tnPay = (settings?.storeInfo?.textingNumber || "").replace(/\D/g, "");
        if (_tnPay.length !== 10) throw new HttpsError("failed-precondition", "No texting number configured in store settings");
        let _fromPay = `+1${_tnPay}`;

        await twilioClient.messages.create({
          body: smsBody,
          to: `+1${cleanPhone}`,
          from: _fromPay,
        });

        // Store in customer message queue
        const messageID = crypto.randomUUID();
        await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("sms-messages").doc(cleanPhone)
          .collection("messages").doc(messageID)
          .set({
            id: messageID,
            customerID: customerID || "",
            message: smsBody,
            phoneNumber: cleanPhone,
            tenantID,
            storeID,
            type: "outgoing",
            millis: Date.now(),
            textToPay: true,
          });

        log("createTextToPayInvoice: SMS sent", { phone: cleanPhone });
      }

      // Email
      if (channel === "email" || channel === "both") {
        let _payFromEmail = settings?.storeInfo?.supportEmail || "";
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: _payFromEmail,
            pass: gmailAppPassword.value(),
          },
        });

        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <p>💳 ${storeName} has sent you a payment request for <strong>$${amountDisplay}</strong>.</p>
            <p style="margin: 16px 0;">
              <a href="${ticketURL}" style="display: inline-block; padding: 10px 20px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">View Ticket</a>
            </p>
            <p style="margin: 24px 0;">
              <a href="${session.url}" style="display: inline-block; padding: 14px 28px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">Pay Now</a>
            </p>
            <p style="color: #888; font-size: 13px;">This link expires in 24 hours.</p>
          </div>
        `;

        await transporter.sendMail({
          from: `"${storeName}" <${_payFromEmail}>`,
          to: customerEmail,
          subject: `Payment Request from ${storeName} — $${amountDisplay}`,
          html: htmlBody,
        });

        log("createTextToPayInvoice: email sent", { email: customerEmail });
      }

      log("createTextToPayInvoice: success", { saleID, sessionID: session.id, amount: amountToCharge });

      return {
        success: true,
        saleID,
        checkoutSessionID: session.id,
        paymentUrl: session.url,
        amountToCharge,
      };
    } catch (error) {
      log("createTextToPayInvoice: error", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to create text-to-pay invoice: " + (error.message || "Unknown error"));
    }
  }
);

// ─── stripeCheckoutWebhook_LinkToPay ────────────────────────────────
// Stripe Checkout Session webhook. Handles:
//   checkout.session.completed → complete sale + workorder, send receipt
//   checkout.session.expired   → clean up active sale + workorder flag

exports.stripeCheckoutWebhook_LinkToPay = onRequest(
  {
    secrets: [
      stripeSecretKey,
      stripeWebhookSecret,
      firebaseServiceAccountKey,
      twilioSecretKey,
      twilioSecretAccountNumber,
      gmailAppPassword,
    ],
  },
  async (req, res) => {
    log("stripeCheckoutWebhook_LinkToPay: incoming event");

    try {
      const stripeClient = Stripe(stripeSecretKey.value());

      // ── Verify webhook signature ──
      const sig = req.headers["stripe-signature"];
      let event;
      try {
        event = stripeClient.webhooks.constructEvent(
          req.rawBody,
          sig,
          stripeWebhookSecret.value()
        );
      } catch (err) {
        log("stripeCheckoutWebhook_LinkToPay: signature verification failed", err.message);
        return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
      }

      log("stripeCheckoutWebhook_LinkToPay: event type", event.type);

      const db = await getDB(firebaseServiceAccountKey);
      const session = event.data.object;
      const { tenantID, storeID, saleID, workorderID, customerID, channel, transactionID, phone: metadataPhone } =
        session.metadata || {};

      if (!tenantID || !storeID || !saleID || !workorderID) {
        log("stripeCheckoutWebhook_LinkToPay: missing metadata, skipping", session.metadata);
        return res.status(200).json({ received: true, skipped: true });
      }

      // ────────────────────────────────────────────────────────────
      // CHECKOUT SESSION COMPLETED
      // ────────────────────────────────────────────────────────────
      if (event.type === "checkout.session.completed") {
        log("stripeCheckoutWebhook_LinkToPay: processing completed session", { saleID, workorderID });

        // Fetch active sale
        const saleSnap = await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("active-sales").doc(saleID)
          .get();

        if (!saleSnap.exists) {
          log("stripeCheckoutWebhook_LinkToPay: active sale not found, may already be processed", { saleID });
          return res.status(200).json({ received: true, alreadyProcessed: true });
        }
        const sale = saleSnap.data();

        // Fetch workorder
        const woSnap = await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("open-workorders").doc(workorderID)
          .get();

        if (!woSnap.exists) {
          log("stripeCheckoutWebhook_LinkToPay: open workorder not found", { workorderID });
          return res.status(200).json({ received: true, workorderMissing: true });
        }
        const workorder = woSnap.data();

        // Fetch customer
        let customer = {};
        if (customerID) {
          const custSnap = await db
            .collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("customers").doc(customerID)
            .get();
          if (custSnap.exists) customer = custSnap.data();
        }

        // Fetch settings (for store name)
        const settingsSnap = await db
          .collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("settings").doc("settings")
          .get();
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        const storeName = settings?.storeInfo?.displayName || "Our store";

        // ── Retrieve Stripe charge for receipt URL + card details ──
        const paymentIntent = await stripeClient.paymentIntents.retrieve(session.payment_intent);
        const chargeID = paymentIntent.latest_charge;
        const charge = await stripeClient.charges.retrieve(chargeID);

        // ── Build payment object (mirrors PAYMENT_OBJECT_PROTO) ──
        const payment = {
          id: transactionID || await _generateId(db, "transactions"),
          type: "payment",
          method: "card",
          amountCaptured: charge.amount_captured,
          amountTendered: 0,
          last4: charge.payment_method_details?.card?.last4 || "",
          cardType: charge.payment_method_details?.card?.brand || "",
          cardIssuer: charge.payment_method_details?.card?.brand || "",
          millis: Date.now(),
          saleID: saleID,
          paymentProcessor: "stripe",
          chargeID: charge.id,
          authorizationCode: "",
          paymentIntentID: paymentIntent.id,
          receiptURL: charge.receipt_url || "",
          expMonth: charge.payment_method_details?.card?.exp_month || "",
          expYear: charge.payment_method_details?.card?.exp_year || "",
          networkTransactionID: charge.payment_method_details?.card?.network_transaction_id || "",
          amountRefunded: 0,
          textToPay: true,
        };

        // Write transaction to transactions collection (new architecture)
        if (transactionID) {
          try {
            const card = charge.payment_method_details?.card;
            const txnDoc = {
              id: transactionID,
              method: "card",
              millis: Date.now(),
              amountCaptured: charge.amount_captured || 0,
              amountTendered: 0,
              salesTax: 0,
              last4: card?.last4 || "",
              expMonth: card?.exp_month || "",
              expYear: card?.exp_year || "",
              cardType: card?.brand || "",
              cardIssuer: card?.brand || "",
              paymentProcessor: "stripe",
              paymentIntentID: paymentIntent.id || "",
              chargeID: charge.id || "",
              authorizationCode: "",
              networkTransactionID: card?.network_transaction_id || "",
              receiptURL: charge.receipt_url || "",
              refunds: [],
            };
            await db.collection("tenants").doc(tenantID)
              .collection("stores").doc(storeID)
              .collection("transactions").doc(transactionID)
              .set(txnDoc);
            log("stripeCheckoutWebhook_LinkToPay: transaction written", { transactionID });
          } catch (txnError) {
            log("stripeCheckoutWebhook_LinkToPay: transaction write error (non-fatal)", txnError.message);
          }
        }

        await completeSaleServerSide({
          db, sale, saleID, tenantID, storeID, customerID,
          workorderIDs: [workorderID],
          payment, charge, settings, customer,
          logPrefix: "LinkToPay",
          twilioClientRef: twilioClient,
          twilioSecretAccountNumber, twilioSecretKey, gmailAppPassword,
          channel,
          directPhone: metadataPhone,
        });

        log("stripeCheckoutWebhook_LinkToPay: sale completed successfully", { saleID, workorderID });
        return res.status(200).json({ received: true, completed: true });
      }

      // ────────────────────────────────────────────────────────────
      // CHECKOUT SESSION EXPIRED
      // ────────────────────────────────────────────────────────────
      if (event.type === "checkout.session.expired") {
        log("stripeCheckoutWebhook_LinkToPay: processing expired session", { saleID, workorderID });

        // Check if the sale has existing payments (partial payment scenario)
        const saleRef = db.collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("active-sales").doc(saleID);
        const expSaleSnap = await saleRef.get();
        const hasExistingPayments = expSaleSnap.exists && (expSaleSnap.data().amountCaptured || 0) > 0;

        if (hasExistingPayments) {
          // Sale has partial payments — just clear the checkout session, keep the sale
          await saleRef.update({ checkoutSessionID: "" });
          log("stripeCheckoutWebhook_LinkToPay: cleared expired session from active sale (partial payment exists)", { saleID });
        } else {
          // No payments — delete active sale and clear workorder reference
          try {
            await saleRef.delete();
          } catch (delErr) {
            log("stripeCheckoutWebhook_LinkToPay: error deleting expired active sale", delErr.message);
          }
          try {
            const woRef = db
              .collection("tenants").doc(tenantID)
              .collection("stores").doc(storeID)
              .collection("open-workorders").doc(workorderID);
            const woSnap = await woRef.get();
            if (woSnap.exists) {
              await woRef.update({ activeSaleID: "" });
            }
          } catch (woErr) {
            log("stripeCheckoutWebhook_LinkToPay: error clearing workorder activeSaleID", woErr.message);
          }
        }

        // Inject expiration message into SMS queue
        if (channel === "sms" || channel === "both") {
          try {
            // Fetch customer for phone number
            let customer = {};
            if (customerID) {
              const custSnap = await db
                .collection("tenants").doc(tenantID)
                .collection("stores").doc(storeID)
                .collection("customers").doc(customerID)
                .get();
              if (custSnap.exists) customer = custSnap.data();
            }

            const cleanPhone = (metadataPhone || customer.customerCell || customer.cell || "").replace(/\D/g, "");
            if (cleanPhone.length === 10) {
              // Fetch settings for store name
              const settingsSnap = await db
                .collection("tenants").doc(tenantID)
                .collection("stores").doc(storeID)
                .collection("settings").doc("settings")
                .get();
              const storeName = (settingsSnap.exists ? settingsSnap.data() : {})?.storeInfo?.displayName || "Our store";

              const expMsg = `Your payment link from ${storeName} has expired. Please contact us if you'd like a new one.`;
              const expMsgID = crypto.randomUUID();
              await db
                .collection("tenants").doc(tenantID)
                .collection("stores").doc(storeID)
                .collection("sms-messages").doc(cleanPhone)
                .collection("messages").doc(expMsgID)
                .set({
                  id: expMsgID,
                  customerID: customerID || "",
                  message: expMsg,
                  phoneNumber: cleanPhone,
                  tenantID,
                  storeID,
                  type: "incoming",
                  millis: Date.now(),
                  textToPay: true,
                });

              log("stripeCheckoutWebhook_LinkToPay: expiration message injected", { phone: cleanPhone });
            }
          } catch (expErr) {
            log("stripeCheckoutWebhook_LinkToPay: error sending expiration message", expErr.message);
          }
        }

        log("stripeCheckoutWebhook_LinkToPay: expired session cleaned up", { saleID, workorderID });
        return res.status(200).json({ received: true, expired: true });
      }

      // Unhandled event type — acknowledge receipt
      log("stripeCheckoutWebhook_LinkToPay: unhandled event type", event.type);
      return res.status(200).json({ received: true, unhandled: true });
    } catch (error) {
      log("stripeCheckoutWebhook_LinkToPay: unhandled error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================================================
// SEQUENTIAL ID GENERATION
// ============================================================================

const GENERATE_ID_PREFIXES = { workorders: "1", sales: "2", transactions: "3" };


/**
 * Internal utility for generating sequential 12-digit IDs.
 * Called directly by other cloud functions — not via HTTP.
 * @param {Object} db - Firestore admin instance
 * @param {string} node - "workorders", "sales", or "transactions"
 * @returns {Promise<string>} 13-digit EAN-13 ID string
 */
async function _generateId(db, node) {
  const prefix = GENERATE_ID_PREFIXES[node];
  if (!prefix) {
    throw new Error(
      `_generateId: invalid node "${node}". Must be one of: workorders, sales, transactions`
    );
  }

  const counterRef = db.collection("counters").doc(node);
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const newId = await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const data = counterDoc.exists ? counterDoc.data() : {};

        const current = data.current || 0;
        const next = current + 1;
        transaction.set(counterRef, { current: next }, { merge: true });

        const padded = String(next).padStart(11, "0");
        const reversed = padded.split("").reverse().join("");
        const first12 = prefix + reversed;
        return first12 + String(ean13CheckDigit(first12));
      });

      return newId;
    } catch (error) {
      lastError = error;
      log(`_generateId: attempt ${attempt}/3 failed for ${node}:`, error.message);
      if (attempt < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * Math.pow(4, attempt - 1))
        );
      }
    }
  }

  throw new Error(
    `_generateId: failed after 3 attempts for ${node}: ${lastError?.message}`
  );
}

exports.generateId = onCall(
  { secrets: [firebaseServiceAccountKey] },
  async (request) => {
    log("generateId: request", request.data);
    requireCallableAuth(request);

    const { node } = request.data;

    if (!node || !GENERATE_ID_PREFIXES[node]) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid node "${node}". Must be one of: workorders, sales, transactions`
      );
    }

    const db = await getDB(firebaseServiceAccountKey);

    try {
      const generatedId = await _generateId(db, node);
      log("generateId: success", { node, id: generatedId });
      return { success: true, id: generatedId };
    } catch (error) {
      log("generateId: failed", { node, error: error.message });
      throw new HttpsError(
        "internal",
        `Failed to generate ID for ${node}: ${error.message}`
      );
    }
  }
);

exports.migrateCustomerPhone = onCall(
  { secrets: [firebaseServiceAccountKey] },
  async (request) => {
    const { tenantID, storeID, oldPhone, newPhone, customerID, first, last } = request.data;
    requireTenantMatch(request, tenantID, storeID);
    log("migrateCustomerPhone: start", { tenantID, storeID, oldPhone, newPhone, customerID });

    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required");
    }
    const cleanOld = (oldPhone || "").replace(/\D/g, "");
    const cleanNew = (newPhone || "").replace(/\D/g, "");
    if (cleanOld.length !== 10 || cleanNew.length !== 10) {
      throw new HttpsError("invalid-argument", "Both oldPhone and newPhone must be 10 digits");
    }
    if (cleanOld === cleanNew) {
      return { success: true, migratedCount: 0, message: "Phones are the same, nothing to migrate" };
    }

    const db = await getDB(firebaseServiceAccountKey);
    const basePath = db.collection("tenants").doc(tenantID).collection("stores").doc(storeID);
    const oldConvoRef = basePath.collection("sms-messages").doc(cleanOld);
    const newConvoRef = basePath.collection("sms-messages").doc(cleanNew);

    const oldConvoDoc = await oldConvoRef.get();
    if (!oldConvoDoc.exists) {
      log("migrateCustomerPhone: no old thread found, nothing to migrate");
      return { success: true, migratedCount: 0, message: "No existing thread at old phone" };
    }

    const oldConvoData = oldConvoDoc.data();
    const messagesSnap = await oldConvoRef
      .collection("messages")
      .orderBy("millis", "desc")
      .limit(25)
      .get();

    log("migrateCustomerPhone: found messages to migrate", { count: messagesSnap.size });

    const batch = db.batch();

    messagesSnap.docs.forEach((msgDoc) => {
      const msgData = msgDoc.data();
      const newMsgRef = newConvoRef.collection("messages").doc(msgDoc.id);
      batch.set(newMsgRef, { ...msgData, phoneNumber: cleanNew });
    });

    const customerInfo = { id: customerID || "", first: first || "", last: last || "" };
    const threadMetadata = {};
    const metaFields = [
      "canRespond", "lastMessage", "lastMillis", "lastType", "hasMedia",
      "threadStatus", "lastOutgoingMessageID", "lastOutgoingMessageStatus",
      "lastOutgoingMillis", "forwardTo", "translatedTo",
    ];
    metaFields.forEach((f) => { if (oldConvoData[f] !== undefined) threadMetadata[f] = oldConvoData[f]; });
    threadMetadata.customerInfo = customerInfo;
    threadMetadata.customerFirst = first || "";
    threadMetadata.customerLast = last || "";

    batch.set(newConvoRef, threadMetadata, { merge: true });

    await batch.commit();
    log("migrateCustomerPhone: batch write complete, deleting old thread");

    const allOldMessages = await oldConvoRef.collection("messages").get();
    const deleteBatch = db.batch();
    allOldMessages.docs.forEach((doc) => deleteBatch.delete(doc.ref));
    deleteBatch.delete(oldConvoRef);
    await deleteBatch.commit();

    log("migrateCustomerPhone: done", { migratedCount: messagesSnap.size });
    return { success: true, migratedCount: messagesSnap.size };
  }
);

// ═══════════════════════════════════════════════════════════════
// GMAIL INTEGRATION — extracted to ./gmail.js so the SaaS deploy can wire
// the same handlers with tenant-aware auth-guards. Bonita passes a no-op
// guards bundle (single-tenant Bonita JWTs have no tenantID claim).
// ═══════════════════════════════════════════════════════════════
{
  const _gmail = require("./gmail");
  const _gmailHandlers = _gmail.register({
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
    getDB,
    secrets: {
      gmailOAuthClientId,
      gmailOAuthClientSecret,
    },
    guards: {
      // Bonita is single-tenant — JWTs carry no tenantID claim, so a real
      // tenant-match assertion would always throw. No-op preserves the
      // existing Bonita auth model (signed-in user is enough).
      assertTenantMatch: () => {},
    },
    withFeatureTracking,
    withFeatureTrackingHttp,
    withFeatureTrackingSchedule,
  });
  exports.gmailInitiateAuth = _gmailHandlers.gmailInitiateAuth;
  exports.gmailOAuthCallback = _gmailHandlers.gmailOAuthCallback;
  exports.gmailDisconnect = _gmailHandlers.gmailDisconnect;
  exports.gmailSyncEmails = _gmailHandlers.gmailSyncEmails;
  exports.gmailPushHandler = _gmailHandlers.gmailPushHandler;
  exports.gmailSendEmail = _gmailHandlers.gmailSendEmail;
  exports.gmailModifyLabels = _gmailHandlers.gmailModifyLabels;
  exports.gmailGetAttachment = _gmailHandlers.gmailGetAttachment;
  exports.gmailSetupWatch = _gmailHandlers.gmailSetupWatch;
  exports.gmailReconnectWatch = _gmailHandlers.gmailReconnectWatch;
  exports.gmailRenewWatch = _gmailHandlers.gmailRenewWatch;
}

} // ─── end of if (DEPLOY_TARGET === "bonita") ───

// ============================================================================
// Usage / cost analytics — vendor totals pull + reconciliation
// (definitions live in ./usageVendorTotals.js)
//
// Exported on BOTH deploy targets: each Firebase project iterates its own
// tenants/stores collections, so Bonita reconciles Bonita usage and the SaaS
// project reconciles SaaS usage. The Twilio puller is the only vendor-specific
// piece that's SaaS-only (per-tenant subaccounts don't exist on Bonita) and it
// early-returns ok:false on non-SaaS deploys.
// ============================================================================
const _vendorTotals = require("./usageVendorTotals");
exports.pullVendorTotals = _vendorTotals.pullVendorTotals;
exports.reconcileUsageEvents = _vendorTotals.reconcileUsageEvents;

// ═══════════════════════════════════════════════════════════════
// SAAS EXPORTS (Stripe Connect + Pub/Sub, multi-tenant)
// Deployed only to cadence-pos via yarn functionsrss.
// ═══════════════════════════════════════════════════════════════
if (DEPLOY_TARGET === "saas") {
  // ───────────────────────────────────────────────────────────────
  // SaaS-side project config (Bonita-side equivalents are scoped
  // inside the bonita branch above and not visible here).
  // ───────────────────────────────────────────────────────────────
  const SAAS_PROJECT_ID = "cadence-pos";
  const SAAS_STORAGE_BUCKET = `${SAAS_PROJECT_ID}.firebasestorage.app`;

  // SaaS-side secrets. Same secret names as Bonita; their values live in
  // cadence-pos's Secret Manager. Admin SDK inside Cloud Functions uses
  // Application Default Credentials, so no service-account-key secret is
  // needed for Gmail handlers.
  const saasGmailOAuthClientId = defineSecret("GMAIL_OAUTH_CLIENT_ID");
  const saasGmailOAuthClientSecret = defineSecret("GMAIL_OAUTH_CLIENT_SECRET");

  // SaaS getDB wrapper. The SaaS modules call admin.initializeApp() at
  // module load (see auth-claims.js) so admin.firestore() is ready by
  // the time any handler fires; this just matches the gmail.js deps
  // shape so the same module works on both deploys.
  const _saasGetDB = async () => admin.firestore();

  const _saasAuthGuards = require("./saas/auth-guards");
  const _gmailSaas = require("./gmail");
  const _gmailSaasHandlers = _gmailSaas.register({
    projectId: SAAS_PROJECT_ID,
    storageBucket: SAAS_STORAGE_BUCKET,
    getDB: _saasGetDB,
    secrets: {
      gmailOAuthClientId: saasGmailOAuthClientId,
      gmailOAuthClientSecret: saasGmailOAuthClientSecret,
    },
    guards: {
      assertTenantMatch: _saasAuthGuards.assertTenantMatch,
    },
    withFeatureTracking,
    withFeatureTrackingHttp,
    withFeatureTrackingSchedule,
  });
  exports.gmailInitiateAuth = _gmailSaasHandlers.gmailInitiateAuth;
  exports.gmailOAuthCallback = _gmailSaasHandlers.gmailOAuthCallback;
  exports.gmailDisconnect = _gmailSaasHandlers.gmailDisconnect;
  exports.gmailSyncEmails = _gmailSaasHandlers.gmailSyncEmails;
  exports.gmailPushHandler = _gmailSaasHandlers.gmailPushHandler;
  exports.gmailSendEmail = _gmailSaasHandlers.gmailSendEmail;
  exports.gmailModifyLabels = _gmailSaasHandlers.gmailModifyLabels;
  exports.gmailGetAttachment = _gmailSaasHandlers.gmailGetAttachment;
  exports.gmailSetupWatch = _gmailSaasHandlers.gmailSetupWatch;
  exports.gmailReconnectWatch = _gmailSaasHandlers.gmailReconnectWatch;
  exports.gmailRenewWatch = _gmailSaasHandlers.gmailRenewWatch;

  const authClaims = require("./saas/auth-claims");
  const pubsubSubscriber = require("./saas/pubsub-subscriber");
  const pubsubDeadLetter = require("./saas/pubsub-dead-letter");
  const connectCallables = require("./saas/stripe-connect-callables");
  const connectPI = require("./saas/stripe-connect-payment-intent");
  const connectWebhook = require("./saas/stripe-connect-webhook");
  const connectRefunds = require("./saas/stripe-connect-refunds");
  const connectReaders = require("./saas/stripe-connect-readers");
  const connectCheckoutSession = require("./saas/stripe-connect-checkout-session");
  const dlqAdmin = require("./saas/pubsub-dlq-admin");
  const billingTiers = require("./saas/billing-tiers");
  const stripeBilling = require("./saas/stripe-billing");
  const stripeBillingWebhook = require("./saas/stripe-billing-webhook");
  const pubsubBillingSubscriber = require("./saas/pubsub-billing-subscriber");
  const twilioSubaccounts = require("./saas/twilio-subaccounts");
  const twilioNumbers = require("./saas/twilio-numbers");
  const twilioWebhookInbound = require("./saas/twilio-webhook-inbound");
  const twilioWebhookStatus = require("./saas/twilio-webhook-status");
  const twilioVoiceFallback = require("./saas/twilio-voice-fallback");
  const twilioPubsubInbound = require("./saas/twilio-pubsub-inbound");
  const twilioPubsubDeadLetter = require("./saas/twilio-pubsub-dead-letter");
  const twilioSend = require("./saas/twilio-send");
  const twilioA2P = require("./saas/twilio-a2p");
  const twilioChurn = require("./saas/twilio-churn");
  const twilioAlerts = require("./saas/twilio-alerts");
  const emailAdmin = require("./saas/email-admin-callables");

  // Phase 1 auth-claims — tenant provisioning + invite flow.
  exports.platformAdminCreateTenantCallable =
    authClaims.platformAdminCreateTenantCallable;
  exports.listTenantsCallable = authClaims.listTenantsCallable;
  exports.getTenantCallable = authClaims.getTenantCallable;
  exports.tenantAdminInviteUserCallable =
    authClaims.tenantAdminInviteUserCallable;
  exports.redeemInviteCallable = authClaims.redeemInviteCallable;
  exports.platformAdminCreateStoreCallable =
    authClaims.platformAdminCreateStoreCallable;
  exports.platformAdminUpdateTenantBillingCallable =
    authClaims.platformAdminUpdateTenantBillingCallable;
  exports.platformAdminSendOwnerWelcomeEmailCallable =
    authClaims.platformAdminSendOwnerWelcomeEmailCallable;
  exports.requestOwnerWelcomeResendCallable =
    authClaims.requestOwnerWelcomeResendCallable;
  exports.platformAdminDeleteTenantCallable =
    authClaims.platformAdminDeleteTenantCallable;
  exports.ownerCompleteBootstrapCallable =
    authClaims.ownerCompleteBootstrapCallable;

  // Phase 2 — admin-driven POS user CRUD (Dashboard_Admin user editor).
  exports.tenantCreateUserCallable = authClaims.tenantCreateUserCallable;
  exports.tenantUpdateUserCallable = authClaims.tenantUpdateUserCallable;
  exports.tenantDeleteUserCallable = authClaims.tenantDeleteUserCallable;

  // Phase 3 — passwordless sign-in via emailed code.
  exports.requestSignInCodeCallable = authClaims.requestSignInCodeCallable;
  exports.verifySignInCodeCallable = authClaims.verifySignInCodeCallable;

  exports.pubsubStripeEventSubscriber = pubsubSubscriber.handler;
  exports.pubsubStripeDeadLetterIngestor = pubsubDeadLetter.ingestor;

  exports.provisionTenantTwilioSubaccount =
    twilioSubaccounts.provisionTenantTwilioSubaccount;
  exports.platformAdminProvisionTwilioSubaccount =
    twilioSubaccounts.platformAdminProvisionTwilioSubaccount;
  exports.deactivateTenantTwilioSubaccount =
    twilioSubaccounts.deactivateTenantTwilioSubaccount;
  exports.platformAdminDeactivateTwilioSubaccount =
    twilioSubaccounts.platformAdminDeactivateTwilioSubaccount;
  exports.platformAdminReactivateTwilioSubaccount =
    twilioSubaccounts.platformAdminReactivateTwilioSubaccount;
  exports.closeTenantTwilioSubaccount =
    twilioSubaccounts.closeTenantTwilioSubaccount;
  exports.platformAdminCloseTwilioSubaccount =
    twilioSubaccounts.platformAdminCloseTwilioSubaccount;

  exports.purchaseTwilioNumber = twilioNumbers.purchaseTwilioNumber;
  exports.platformAdminSearchTwilioAvailableNumbers =
    twilioNumbers.platformAdminSearchTwilioAvailableNumbers;
  exports.platformAdminPurchaseTwilioNumber =
    twilioNumbers.platformAdminPurchaseTwilioNumber;
  exports.portInTwilioNumber = twilioNumbers.portInTwilioNumber;
  exports.releaseTwilioNumber = twilioNumbers.releaseTwilioNumber;
  exports.transferNumberBetweenStores =
    twilioNumbers.transferNumberBetweenStores;
  exports.scheduledTwilioPortInPoll = twilioNumbers.scheduledTwilioPortInPoll;
  exports.platformAdminConfigureTenantWebhooks =
    twilioNumbers.platformAdminConfigureTenantWebhooks;

  // Phase 3 — inbound pipeline + outbound status. Function names MUST match
  // the webhook URLs hardcoded in twilio-common.js (every purchased number
  // points to these exact names).
  exports.twilioInboundWebhook = twilioWebhookInbound.handler;
  exports.twilioStatusCallbackWebhook = twilioWebhookStatus.handler;
  exports.twilioVoiceFallback = twilioVoiceFallback.handler;
  exports.pubsubTwilioInboundSubscriber = twilioPubsubInbound.handler;
  exports.pubsubTwilioDeadLetterIngestor = twilioPubsubDeadLetter.ingestor;

  // Phase 4 — outbound send.
  exports.sendTwilioMessage = twilioSend.sendTwilioMessage;

  // Phase 5 — A2P 10DLC registration (ISV/partner model, lives on master).
  exports.submitTenantA2PBrand = twilioA2P.submitTenantA2PBrand;
  exports.submitTenantA2PCampaign = twilioA2P.submitTenantA2PCampaign;
  exports.linkNumberToA2PCampaign = twilioA2P.linkNumberToA2PCampaign;
  exports.unlinkNumberFromA2PCampaign = twilioA2P.unlinkNumberFromA2PCampaign;
  exports.getTenantA2PStatus = twilioA2P.getTenantA2PStatus;
  exports.scheduledA2PStatusPoll = twilioA2P.scheduledA2PStatusPoll;

  // Platform-admin variants — used by cadence-dashboard to punch in tenant
  // business info and bulk-link numbers on the tenant's behalf.
  exports.platformAdminSubmitTenantA2PBrand =
    twilioA2P.platformAdminSubmitTenantA2PBrand;
  exports.platformAdminSubmitTenantA2PCampaign =
    twilioA2P.platformAdminSubmitTenantA2PCampaign;
  exports.platformAdminLinkAllNumbersToA2PCampaign =
    twilioA2P.platformAdminLinkAllNumbersToA2PCampaign;
  exports.platformAdminGetTenantA2PStatus =
    twilioA2P.platformAdminGetTenantA2PStatus;

  // Phase 7 — churn cleanup. Scheduled daily; force-close is SuperUser-only.
  exports.scheduledTwilioChurnCleanup = twilioChurn.scheduledTwilioChurnCleanup;
  exports.forceCloseTenantTwilioSubaccount =
    twilioChurn.forceCloseTenantTwilioSubaccount;

  // Phase 7 — alerting. DLQ depth emitter feeds a log-based metric so an
  // alert policy can page when unresolved entries pile up. See
  // saas/alerts/setup-alerts.sh for the full policy wiring.
  exports.scheduledTwilioDLQDepthEmitter =
    twilioAlerts.scheduledTwilioDLQDepthEmitter;

  exports.stripeConnectAccountCreate = connectCallables.stripeConnectAccountCreate;
  exports.stripeConnectAccountLinkCreate = connectCallables.stripeConnectAccountLinkCreate;
  exports.stripeConnectAccountStatusCallable = connectCallables.stripeConnectAccountStatusCallable;
  exports.platformAdminStripeConnectAccountCreate =
    connectCallables.platformAdminStripeConnectAccountCreate;
  exports.platformAdminStripeConnectAccountLinkCreate =
    connectCallables.platformAdminStripeConnectAccountLinkCreate;
  exports.platformAdminStripeConnectAccountStatus =
    connectCallables.platformAdminStripeConnectAccountStatus;

  exports.platformAdminGetTenantEmailStatus =
    emailAdmin.platformAdminGetTenantEmailStatus;
  exports.platformAdminReconnectEmailWatch =
    emailAdmin.platformAdminReconnectEmailWatch;
  exports.platformAdminForceEmailSync =
    emailAdmin.platformAdminForceEmailSync;

  exports.stripeConnectInitiatePaymentIntentV2 = connectPI.stripeConnectInitiatePaymentIntentV2;
  exports.stripeConnectCancelPaymentIntentV2 = connectPI.stripeConnectCancelPaymentIntentV2;
  exports.stripeConnectCreateTapToPayPaymentIntentCallable =
    connectPI.stripeConnectCreateTapToPayPaymentIntentCallable;

  exports.stripeWebhookV2_Connect = connectWebhook.handler;

  exports.stripeRefundChargeCallable_V2 = connectRefunds.stripeRefundChargeCallable_V2;

  exports.stripeConnectCreateTerminalLocationCallable =
    connectReaders.stripeConnectCreateTerminalLocationCallable;
  exports.stripeConnectRegisterReaderCallable =
    connectReaders.stripeConnectRegisterReaderCallable;
  exports.stripeConnectListReadersCallable =
    connectReaders.stripeConnectListReadersCallable;
  exports.stripeConnectConnectionTokenCallable =
    connectReaders.stripeConnectConnectionTokenCallable;

  exports.stripeConnectCreateCheckoutSessionV2 =
    connectCheckoutSession.stripeConnectCreateCheckoutSessionV2;

  exports.dlqRetryCallable = dlqAdmin.dlqRetryCallable;
  exports.dlqUpdateStatusCallable = dlqAdmin.dlqUpdateStatusCallable;
  exports.dlqEscalationCheckScheduled = dlqAdmin.dlqEscalationCheckScheduled;

  // ───────────────────────────────────────────────────────────────
  // Phase 3 — Stripe Billing on the PLATFORM Stripe account (NOT
  // Connect). Tier catalog CRUD + customer/sub/PM/invoice callables
  // + platform-account webhook + Pub/Sub fan-out + DLQ.
  // ───────────────────────────────────────────────────────────────
  exports.platformAdminListBillingTiersCallable =
    billingTiers.platformAdminListBillingTiersCallable;
  exports.platformAdminListStripePricesCallable =
    billingTiers.platformAdminListStripePricesCallable;
  exports.platformAdminCreateBillingTierCallable =
    billingTiers.platformAdminCreateBillingTierCallable;
  exports.platformAdminUpdateBillingTierCallable =
    billingTiers.platformAdminUpdateBillingTierCallable;
  exports.platformAdminArchiveBillingTierCallable =
    billingTiers.platformAdminArchiveBillingTierCallable;

  exports.stripeBillingCreateCustomerCallable =
    stripeBilling.stripeBillingCreateCustomerCallable;
  exports.stripeBillingCreateSetupIntentCallable =
    stripeBilling.stripeBillingCreateSetupIntentCallable;
  exports.stripeBillingCreateSubscriptionCallable =
    stripeBilling.stripeBillingCreateSubscriptionCallable;
  exports.stripeBillingChangeTenantTierCallable =
    stripeBilling.stripeBillingChangeTenantTierCallable;
  exports.stripeBillingListPaymentMethodsCallable =
    stripeBilling.stripeBillingListPaymentMethodsCallable;
  exports.stripeBillingDetachPaymentMethodCallable =
    stripeBilling.stripeBillingDetachPaymentMethodCallable;
  exports.stripeBillingUpdateDefaultPaymentMethodCallable =
    stripeBilling.stripeBillingUpdateDefaultPaymentMethodCallable;
  exports.stripeBillingListInvoicesCallable =
    stripeBilling.stripeBillingListInvoicesCallable;
  exports.stripeBillingCancelSubscriptionCallable =
    stripeBilling.stripeBillingCancelSubscriptionCallable;

  exports.stripeWebhookV2_Billing = stripeBillingWebhook.handler;
  exports.pubsubStripeBillingEventSubscriber = pubsubBillingSubscriber.handler;
  exports.pubsubStripeBillingDeadLetterIngestor = pubsubBillingSubscriber.ingestor;
}

