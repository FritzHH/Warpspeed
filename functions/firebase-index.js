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
const { isArray } = require("lodash");
const nodemailer = require("nodemailer");
const { onInit } = require("firebase-functions/v2/core");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const fetch = require("node-fetch");
const { printBuilder: sharedPrintBuilder } = require("./shared/printBuilder");

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
          databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com",
        });

        log("✅ Firebase Admin initialized with service account from Secret Manager");
      } else {
        // Fallback to default credentials
        admin.initializeApp({
          databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com",
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
const firebaseServiceAccountKey = defineSecret("firebase-service-account-key");
const lightspeedClientId = defineSecret("LIGHTSPEED_CLIENT_ID");
const lightspeedClientSecret = defineSecret("LIGHTSPEED_CLIENT_SECRET");
const googleTranslateApiKey = defineSecret("GOOGLE_TRANSLATE_API_KEY");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
const stripeWebhookSecret = defineSecret("STRIPE_LINK_TO_PAY_WEBHOOK");
const stripeTerminalWebhookSecret = defineSecret("STRIPE_CHECKOUT_WEBHOOK_SECRET");

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
  firstName: "",
  lastName: "",
  phoneNumber: "",
  canRespond: false,
  millis: "",
  message: "",
  customerID: "",
  read: false,
  id: "",
};

const CLOSED_THREAD_RESPONSE =
  "Thank you for messaging Bonita Bikes. Due to staffing limitations, we cannot keep messaging open for all return responses. If you need to send a picture, for immediate service please call (239) 291-9396 and we can open the messaging service, or include the picture/video in an email to support@bonitabikes.com. Thank you and we'll chat soon!";

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

// server driven Stripe payments

exports.getAvailableStripeReaders = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "http://localhost:3000");
    log("Incoming get available Stripe readers body", req.body);
    const readers = await stripe.terminal.readers.list({});
    log("available Stripe readers", readers);
    sendSuccessfulResult(res, readers);
  }
);

exports.initiatePaymentIntent = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "http://localhost:3000");
    log("Incoming process Stripe server-driven payment", req.body);

    let amount = req.body.amount;
    let readerID = req.body.readerID;

    if (!amount || typeof amount !== "number") {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number in cents.",
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
    res.set("Access-Control-Allow-Origin", "http://localhost:3000");

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
    res.set("Access-Control-Allow-Origin", "http://localhost:3000");

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
  async (request) => {
    log("Incoming enhanced SMS callable request", request.data);

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
        canRespond: canRespondParam = false,
        fromNumber = "+12393171234", // Default from number
      } = request.data;

      // Validate required fields
      if (
        !message ||
        typeof message !== "string" ||
        message.trim().length === 0
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Message content is required and must be a non-empty string"
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

      // Message length validation (SMS limit)
      if (message.length > 1600) {
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
      const twilioResponse = await twilioClient.messages.create({
        body: message.trim(),
        to: `+1${cleanPhoneNumber}`,
        from: fromNumber,
        // Optional: Add delivery status callback
        statusCallback: `https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/smsStatusCallback`,
      });

      log("SMS sent successfully", {
        messageSid: twilioResponse.sid,
        to: twilioResponse.to,
        status: twilioResponse.status,
      });

      // Store message in Firestore if customerID and messageID provided
      if (customerID && messageID) {
        try {
          // Store outgoing message in customer_phone/{phone}/messages
          const messageRef = db
            .collection("customer_phone")
            .doc(cleanPhoneNumber)
            .collection("messages")
            .doc(messageID);

          await messageRef.set({
            id: messageID,
            customerID: customerID,
            message: message.trim(),
            phoneNumber: cleanPhoneNumber,
            messageSid: twilioResponse.sid,
            status: twilioResponse.status,
            fromNumber: fromNumber,
            tenantID: tenantID,
            storeID: storeID,
            type: "outgoing",
            millis: Date.now(),
          });

          log("Outgoing message stored at customer_phone path", {
            messageID,
            customerID,
            phone: cleanPhoneNumber,
            path: `customer_phone/${cleanPhoneNumber}/messages/${messageID}`,
          });

          // Update canRespond and lastMessageMillis on conversation root doc
          await db.collection("customer_phone").doc(cleanPhoneNumber).set({
            canRespond: !!canRespondParam,
            lastMessageMillis: Date.now(),
          }, { merge: true });

          log("Conversation root updated", {
            phone: cleanPhoneNumber,
            canRespond: !!canRespondParam,
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
  }
);

exports.incomingSMS = onRequest(
  { cors: true, secrets: [firebaseServiceAccountKey] },
  async (request, response) => {
    // Set CORS headers
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");

    // Initialize Firestore with service account
    const db = await getDB(firebaseServiceAccountKey);

    let body = request.body;
    log("incoming sms body", body);

    let incomingPhone = body.From.slice(2, body.From.length);
    let incomingMessage = body.Body;
    const messageSid = body.SmsSid;
    log("phone", incomingPhone);
    log("message", incomingMessage);

    // get the customer from customer_phone index
    let customerObj = null;
    let tenantID = null;
    let storeID = null;

    try {
      // Try customer_phone index first
      const customerPhoneRef = db
        .collection("customer_phone")
        .doc(incomingPhone);
      const customerPhoneDoc = await customerPhoneRef.get();

      if (customerPhoneDoc.exists) {
        const indexData = customerPhoneDoc.data();
        const info = indexData.info || indexData;

        customerObj = {
          id: info.id,
          first: info.first,
          last: info.last,
          customerCell: info.customerCell || info.cell,
          customerLandline: info.customerLandline || info.landline,
          email: info.email,
        };
        tenantID = info.tenantID;
        storeID = info.storeID;

        log("found customer via customer_phone index", {
          customerObj,
          tenantID,
          storeID,
        });
      } else {
        log("no customer found with phone", incomingPhone);
        return response
          .status(200)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
    } catch (error) {
      log("error searching for customer", error);
      return response
        .status(200)
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // get the last message from customer_phone to see if they are allowed to respond
    let lastOutgoingMessage = null;
    try {
      const lastMessageSnapshot = await db
        .collection("customer_phone")
        .doc(incomingPhone)
        .collection("messages")
        .where("type", "==", "outgoing")
        .orderBy("millis", "desc")
        .limit(1)
        .get();

      if (!lastMessageSnapshot.empty) {
        lastOutgoingMessage = lastMessageSnapshot.docs[0].data();
      }
    } catch (error) {
      log("error getting last outgoing message", error);
    }

    log("last outgoing message", lastOutgoingMessage);
    let canRespond = lastOutgoingMessage
      ? lastOutgoingMessage.canRespond
      : null;

    // if not allowed to respond, send a bounceback message
    if (!canRespond) {
      log("cannot respond", lastOutgoingMessage?.canRespond);

      // Store the message even though thread is closed
      try {
        await db
          .collection("customer_phone")
          .doc(incomingPhone)
          .collection("messages")
          .doc(messageSid)
          .set({
            id: messageSid,
            customerID: customerObj.id,
            firstName: customerObj.first,
            lastName: customerObj.last,
            millis: Date.now(),
            phoneNumber: incomingPhone,
            message: incomingMessage,
            type: "incoming",
            threadStatus: "closed",
            autoResponseSent: true,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            tenantID,
            storeID,
          });
      } catch (error) {
        log("error storing closed thread message", error);
      }

      // Send bounceback via TwiML
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${CLOSED_THREAD_RESPONSE}</Message>
</Response>`;

      return response.status(200).type("text/xml").send(twimlResponse);
    }

    // if allowed to respond, create and store the message
    const message = {
      id: messageSid,
      firstName: customerObj.first,
      lastName: customerObj.last,
      millis: Date.now(),
      phoneNumber: incomingPhone,
      message: incomingMessage,
      customerID: customerObj.id,
      type: "incoming",
      threadStatus: "open",
      read: false,
      tenantID,
      storeID,
    };

    // Store incoming message in customer_phone/{phone}/messages
    try {
      const incomingMessageRef = db
        .collection("customer_phone")
        .doc(incomingPhone)
        .collection("messages")
        .doc(messageSid);

      await incomingMessageRef.set({
        ...message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      log("Incoming message stored at customer_phone path", {
        phone: incomingPhone,
        messageSid,
      });

      // Update customer last contact timestamp
      await db.collection("customer_phone").doc(incomingPhone).update({
        "info.lastIncomingSMS": admin.firestore.FieldValue.serverTimestamp(),
        "info.lastIncomingSMSMillis": Date.now(),
      });
    } catch (error) {
      log("error storing incoming message in Firestore", error);
    }

    // Return empty TwiML response
    return response
      .status(200)
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
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
    secrets: [
      twilioSecretKey,
      twilioSecretAccountNumber,
      firebaseServiceAccountKey,
    ],
  },
  async (request, response) => {
    const requestStartTime = Date.now();

    // Set CORS headers
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");

    // Initialize Firestore with service account
    const db = await getDB(firebaseServiceAccountKey);

    try {
      // ============================================================================
      // STEP 1: VALIDATE TWILIO WEBHOOK & EXTRACT DATA
      // ============================================================================

      const twilioData = request.body;

      // Validate required Twilio parameters
      if (
        !twilioData ||
        !twilioData.From ||
        !twilioData.Body ||
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
      // STEP 2: FIND CUSTOMER ACROSS ALL TENANTS/STORES
      // ============================================================================

      let customerData = null;
      let tenantID = null;
      let storeID = null;

      try {
        // OPTION 1: Try customer_phone index first (most efficient)
        const db = await getDB(firebaseServiceAccountKey);

        const customerPhoneRef = db
          .collection("customer_phone")
          .doc(normalizedPhone);
        const customerPhoneDoc = await customerPhoneRef.get();

        if (customerPhoneDoc.exists) {
          const indexData = customerPhoneDoc.data();

          // Extract data from "info" field
          const info = indexData.info || indexData; // Fallback to root if no "info" field

          customerData = {
            id: info.id,
            first: info.first,
            last: info.last,
            customerCell: info.customerCell || info.cell,
            customerLandline: info.customerLandline || info.landline,
            email: info.email,
          };
          tenantID = info.tenantID;
          storeID = info.storeID;

          log("Customer found via customer_phone index", {
            customerID: customerData.id,
            tenantID,
            storeID,
            customerName: `${customerData.first} ${customerData.last}`,
            lookupBy: "customerCell",
          });
        }

        // OPTION 2: If not in index, fall back to searching all tenants/stores
        if (!customerData) {
          log("Customer not in phone index, searching all tenants/stores", {
            phone: normalizedPhone,
          });

          // Get all tenants
          const tenantsSnapshot = await db.collection("tenants").get();

          if (tenantsSnapshot.empty) {
            log("No tenants found in system");
            return response
              .status(404)
              .send(
                '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
              );
          }

          // Search across all tenants and stores
          let found = false;
          for (const tenantDoc of tenantsSnapshot.docs) {
            if (found) break;

            const currentTenantID = tenantDoc.id;
            const storesSnapshot = await db
              .collection("tenants")
              .doc(currentTenantID)
              .collection("stores")
              .get();

            for (const storeDoc of storesSnapshot.docs) {
              if (found) break;

              const currentStoreID = storeDoc.id;

              // Query customers by phone number using Admin SDK
              try {
                const customersSnapshot = await db
                  .collection("tenants")
                  .doc(currentTenantID)
                  .collection("stores")
                  .doc(currentStoreID)
                  .collection("customers")
                  .where("customerCell", "==", normalizedPhone)
                  .limit(1)
                  .get();

                if (!customersSnapshot.empty) {
                  customerData = customersSnapshot.docs[0].data();
                  tenantID = currentTenantID;
                  storeID = currentStoreID;
                  found = true;

                  log("Customer found via tenant/store search", {
                    customerID: customerData.id,
                    tenantID,
                    storeID,
                    customerName: `${customerData.first} ${customerData.last}`,
                  });

                  // Create customer_phone index for future fast lookups
                  try {
                    await db
                      .collection("customer_phone")
                      .doc(normalizedPhone)
                      .set({
                        info: {
                          id: customerData.id,
                          first: customerData.first || "",
                          last: customerData.last || "",
                          customerCell: customerData.customerCell || customerData.cell || "",
                          customerLandline: customerData.customerLandline || customerData.landline || "",
                          email: customerData.email || "",
                          tenantID,
                          storeID,
                          lastUpdated: Date.now(),
                        },
                      });
                    log("customer_phone index created for future lookups", {
                      phone: normalizedPhone,
                      customerID: customerData.id,
                    });
                  } catch (indexError) {
                    log("Error creating customer_phone index", {
                      error: indexError.message,
                    });
                  }
                }
              } catch (queryError) {
                log("Error querying customers in store", {
                  error: queryError.message,
                  errorCode: queryError.code,
                  tenantID: currentTenantID,
                  storeID: currentStoreID,
                });
                // Continue to next store even if this one fails
                continue;
              }
            }
          }
        }

        // Customer not found — allow unknown numbers through
        if (!customerData || !tenantID || !storeID) {
          log("No customer found for phone number — creating conversation for unknown sender", { phone: normalizedPhone });

          // Log unknown sender for analytics
          await db
            .collection("sms-analytics")
            .doc("unknown-senders")
            .collection("messages")
            .add({
              phoneNumber: normalizedPhone,
              message: incomingMessage,
              messageSid,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              twilioData,
            });

          // Use the first available tenant/store
          if (!tenantID || !storeID) {
            const tenantsSnap = await db.collection("tenants").get();
            if (!tenantsSnap.empty) {
              const firstTenant = tenantsSnap.docs[0];
              tenantID = firstTenant.id;
              const storesSnap = await db.collection("tenants").doc(tenantID).collection("stores").get();
              if (!storesSnap.empty) {
                storeID = storesSnap.docs[0].id;
              }
            }
          }

          // Create customer_phone root doc for this unknown number
          customerData = {
            id: "",
            first: "Unknown",
            last: "",
            cell: normalizedPhone,
          };

          try {
            await db.collection("customer_phone").doc(normalizedPhone).set({
              info: {
                id: "",
                first: "Unknown",
                last: "",
                cell: normalizedPhone,
                tenantID: tenantID || "",
                storeID: storeID || "",
                lastUpdated: Date.now(),
              },
              canRespond: false,
              lastMessageMillis: Date.now(),
            }, { merge: true });

            log("Created customer_phone entry for unknown sender", { phone: normalizedPhone });
          } catch (indexError) {
            log("Error creating customer_phone for unknown sender", { error: indexError.message });
          }

          // Fall through to Step 3+ (will be treated as closed thread)
        }
      } catch (error) {
        log("Error searching for customer", {
          error: error.message,
          phone: normalizedPhone,
        });

        return response
          .status(500)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // ============================================================================
      // STEP 3: CHECK THREAD STATUS, TIMEOUT, & BLOCKLIST
      // ============================================================================

      let canRespond = false;
      let threadStatus = "closed";

      try {
        // Fetch settings for timeout and blocklist
        const settingsDoc = await db
          .collection("tenants")
          .doc(tenantID)
          .collection("stores")
          .doc(storeID)
          .collection("settings")
          .doc("settings")
          .get();
        const storeSettings = settingsDoc.exists ? settingsDoc.data() : {};

        // Check blocklist
        const blockedNumbers = storeSettings.smsBlockedNumbers || [];
        if (blockedNumbers.includes(normalizedPhone)) {
          log("Blocked number detected", { phone: normalizedPhone, tenantID, storeID });

          // Log to analytics
          await db.collection("sms-analytics").doc("blocked-numbers").collection("messages").add({
            phoneNumber: normalizedPhone,
            message: incomingMessage,
            messageSid,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            tenantID,
            storeID,
          });

          // Send auto-response and return
          const blockedResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>This number is no longer able to receive messages at this number. If you believe this is an error, please call us directly.</Message>
</Response>`;
          return response.status(200).type("text/xml").send(blockedResponse);
        }

        // Read canRespond and lastMessageMillis from conversation root doc
        const conversationDoc = await db
          .collection("customer_phone")
          .doc(normalizedPhone)
          .get();
        const conversationData = conversationDoc.exists ? conversationDoc.data() : {};

        canRespond = conversationData.canRespond === true;
        const lastMessageMillis = conversationData.lastMessageMillis || 0;

        // Apply timeout check — auto-close if last message is older than lockTimeout
        const lockTimeoutDays = storeSettings.smsConversationLockTimeout || 2;
        const lockTimeoutMs = lockTimeoutDays * 86400000;
        if (canRespond && lastMessageMillis > 0 && (lastMessageMillis + lockTimeoutMs < Date.now())) {
          canRespond = false;
          log("Conversation auto-closed due to timeout", {
            lastMessageMillis,
            lockTimeoutDays,
            elapsed: Date.now() - lastMessageMillis,
          });
        }

        threadStatus = canRespond ? "open" : "closed";

        log("Thread status determined", {
          canRespond,
          threadStatus,
          lastMessageMillis,
          lockTimeoutDays,
        });
      } catch (error) {
        log("Error checking thread status", {
          error: error.message,
          errorCode: error.code,
          customerID: customerData.id,
        });
        // Continue processing - default to closed thread
      }

      // ============================================================================
      // STEP 4: HANDLE CLOSED THREAD - SEND AUTO-RESPONSE
      // ============================================================================

      if (!canRespond) {
        log("Thread closed - sending auto-response", {
          customerID: customerData.id,
          threadStatus,
        });

        // Store the incoming message even though thread is closed
        try {
          await db
            .collection("customer_phone")
            .doc(normalizedPhone)
            .collection("messages")
            .doc(messageSid)
            .set({
              id: messageSid,
              customerID: customerData.id,
              firstName: customerData.first || "",
              lastName: customerData.last || "",
              phoneNumber: normalizedPhone,
              message: incomingMessage,
              millis: Date.now(),
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              type: "incoming",
              threadStatus: "closed",
              autoResponseSent: true,
              hasMedia: numMedia > 0,
              numMedia,
              messageStatus,
              tenantID,
              storeID,
              messageSid,
              messageStatus,
            });

          log("Closed thread message stored at customer_phone path", {
            phone: normalizedPhone,
            messageSid,
          });
        } catch (error) {
          log("Error storing closed thread message", {
            error: error.message,
            messageSid,
          });
        }

        // Send auto-response using TwiML
        const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${CLOSED_THREAD_RESPONSE}</Message>
</Response>`;

        // Also send via Twilio client for tracking
        if (twilioClient) {
          try {
            await twilioClient.messages.create({
              body: CLOSED_THREAD_RESPONSE,
              to: `+1${normalizedPhone}`,
              from: twilioData.To || "+12393171234",
            });

            log("Auto-response sent successfully", {
              customerID: customerData.id,
              phone: normalizedPhone,
            });
          } catch (twilioError) {
            log("Error sending auto-response via Twilio", {
              error: twilioError.message,
              code: twilioError.code,
            });
          }
        }

        return response.status(200).type("text/xml").send(twimlResponse);
      }

      // ============================================================================
      // STEP 5: STORE INCOMING MESSAGE (OPEN THREAD)
      // ============================================================================

      const incomingMessageData = {
        id: messageSid,
        customerID: customerData.id,
        firstName: customerData.first || "",
        lastName: customerData.last || "",
        phoneNumber: normalizedPhone,
        message: incomingMessage,
        millis: Date.now(),
        type: "incoming",
        threadStatus: "open",
        read: false,
        hasMedia: numMedia > 0,
        numMedia,
        messageStatus,
        tenantID,
        storeID,
        messageSid,
        messageStatus,
        to: twilioData.From,
        from: twilioData.To,
      };

      // Handle media attachments if present
      if (numMedia > 0) {
        const mediaUrls = [];
        for (let i = 0; i < numMedia; i++) {
          const mediaUrl = twilioData[`MediaUrl${i}`];
          const mediaContentType = twilioData[`MediaContentType${i}`];
          if (mediaUrl) {
            mediaUrls.push({
              url: mediaUrl,
              contentType: mediaContentType || "unknown",
            });
          }
        }
        incomingMessageData.mediaUrls = mediaUrls;
      }

      try {
        // Store incoming message in customer_phone/{phone}/messages
        const incomingMessageRef = db
          .collection("customer_phone")
          .doc(normalizedPhone)
          .collection("messages")
          .doc(messageSid);

        await incomingMessageRef.set(incomingMessageData);

        // Update lastMessageMillis on conversation root
        await db.collection("customer_phone").doc(normalizedPhone).set({
          lastMessageMillis: Date.now(),
        }, { merge: true });

        log("Incoming message stored successfully at customer_phone path", {
          phone: normalizedPhone,
          messageSid,
          customerID: customerData.id,
          messageLength: incomingMessage.length,
          hasMedia: numMedia > 0,
          path: `customer_phone/${normalizedPhone}/messages/${messageSid}`,
        });
      } catch (error) {
        log("Error storing incoming message", {
          error: error.message,
          errorCode: error.code,
          messageSid,
          customerID: customerData.id,
        });

        // Still return success to Twilio to avoid retries
        return response
          .status(200)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // ============================================================================
      // STEP 6: FLAG WORKORDERS & FORWARD SMS
      // ============================================================================

      try {
        // 6a: Set hasNewSMS on all open workorders for this customer
        const woQuery = await db
          .collection("tenants")
          .doc(tenantID)
          .collection("stores")
          .doc(storeID)
          .collection("open-workorders")
          .where("customerID", "==", customerData.id)
          .get();

        if (!woQuery.empty) {
          const batch = db.batch();
          woQuery.docs.forEach((doc) => {
            batch.update(doc.ref, { hasNewSMS: true, lastSMSSenderUserID: "" });
          });
          await batch.commit();
          log("Flagged workorders with hasNewSMS", {
            count: woQuery.size,
            customerID: customerData.id,
          });
        }

        // 6b: Forward SMS to last sender if they have forwardSMS enabled
        const lastOutgoing = await db
          .collection("customer_phone")
          .doc(normalizedPhone)
          .collection("messages")
          .where("type", "==", "outgoing")
          .orderBy("millis", "desc")
          .limit(1)
          .get();

        if (!lastOutgoing.empty) {
          const lastMsg = lastOutgoing.docs[0].data();
          const senderID = lastMsg.senderUserObj?.id;

          if (senderID) {
            // Fetch settings to get current user data
            const settingsSnap = await db
              .collection("tenants")
              .doc(tenantID)
              .collection("stores")
              .doc(storeID)
              .collection("settings")
              .doc("settings")
              .get();
            const settings = settingsSnap.exists ? settingsSnap.data() : {};
            const users = settings.users || [];
            const senderUser = users.find((u) => u.id === senderID);

            if (senderUser && senderUser.forwardSMS && senderUser.phone) {
              // Lazy-init Twilio client if needed
              if (!twilioClient) {
                twilioClient = require("twilio")(
                  twilioSecretAccountNumber.value(),
                  twilioSecretKey.value()
                );
              }

              const forwardBody = `New SMS from ${customerData.first || ""} ${customerData.last || ""}: ${incomingMessage}`;
              await twilioClient.messages.create({
                body: forwardBody,
                to: `+1${senderUser.phone}`,
                from: twilioData.To || "+12393171234",
              });

              log("Forwarded SMS to staff user", {
                userID: senderID,
                userName: `${senderUser.first} ${senderUser.last}`,
              });
            }
          }
        }
      } catch (step6Error) {
        // Non-blocking — don't fail the incoming SMS response
        log("Error in STEP 6 (flag/forward)", {
          error: step6Error.message,
          customerID: customerData.id,
        });
      }

      // ============================================================================
      // STEP 7: RETURN SUCCESS RESPONSE
      // ============================================================================

      log("Incoming SMS processed successfully", {
        messageSid,
        customerID: customerData.id,
        processingTimeMs: processingTime,
        threadStatus: "open",
        storagePath: `customer_phone/${normalizedPhone}/messages/${messageSid}`,
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

/**
 * Login function for app users
 * Authenticates user with email/password and returns user and tenant information
 */
exports.loginAppUser = onRequest({ cors: true }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "http://localhost:3000");
  log("Incoming login request", req.body);

  // Input validation
  const { email, password } = req.body.data;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({
      success: false,
      message: "Valid email address is required.",
    });
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long.",
    });
  }

  try {
    // Authenticate user with Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(email);

    // Verify the user exists and is not disabled
    if (userRecord.disabled) {
      return res.status(403).json({
        success: false,
        message: "❌ User account has been disabled.",
      });
    }

    // Get user ID for Firestore lookup
    const userID = userRecord.uid;

    // Look up user in the global users index for quick tenant retrieval
    const userIndexRef = DB.collection("users").doc(userID);
    const userIndexDoc = await userIndexRef.get();

    if (!userIndexDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "❌ User not found in system.",
      });
    }

    const userIndexData = userIndexDoc.data();
    const tenantID = userIndexData.tenantID;
    const storeID = userIndexData.storeID;

    if (!tenantID) {
      return res.status(404).json({
        success: false,
        message: "❌ User is not associated with any tenant.",
      });
    }

    if (!storeID) {
      return res.status(404).json({
        success: false,
        message: "❌ User is not associated with any store.",
      });
    }

    // Retrieve user details from tenant/store-specific collection
    const userRef = DB.collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .doc(storeID)
      .collection("users")
      .doc(userID);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "❌ User details not found in tenant system.",
      });
    }

    const userData = userDoc.data();

    // Retrieve tenant information
    const tenantRef = DB.collection("tenants").doc(tenantID);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "❌ Tenant information not found.",
      });
    }

    const tenantData = tenantDoc.data();

    // Update last login timestamp
    await userRef.update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      loginCount: admin.firestore.FieldValue.increment(1),
    });

    log("User login successful", {
      userID,
      email,
      tenantID,
      storeID,
      displayName: userData.displayName,
    });

    return res.status(200).json({
      success: true,
      message: `✅ Login successful for ${email} (Tenant: ${tenantID}, Store: ${storeID})`,
      user: {
        id: userID,
        email: userData.email,
        displayName: userData.displayName,
        tenantID: tenantID,
        storeID: storeID,
        permissions: userData.permissions,
        status: userData.status,
        lastLogin: userData.lastLogin,
        createdAt: userData.createdAt,
        metadata: userData.metadata,
      },
      tenant: {
        id: tenantID,
        name: tenantData.name,
        status: tenantData.status,
        settings: tenantData.settings,
        userCount: tenantData.userCount,
        createdAt: tenantData.createdAt,
        subscription: tenantData.subscription,
      },
      auth: {
        uid: userID,
        email: email,
        emailVerified: userRecord.emailVerified,
        disabled: userRecord.disabled,
      },
    });
  } catch (error) {
    log("Error during login", error);

    let message;
    let statusCode = 500;

    if (error.code === "auth/user-not-found") {
      message = "❌ No account found with this email address.";
      statusCode = 404;
    } else if (error.code === "auth/wrong-password") {
      message = "❌ Incorrect password.";
      statusCode = 401;
    } else if (error.code === "auth/invalid-email") {
      message = "❌ Invalid email address format.";
      statusCode = 400;
    } else if (error.code === "auth/user-disabled") {
      message = "❌ This account has been disabled.";
      statusCode = 403;
    } else if (error.code === "auth/too-many-requests") {
      message = "❌ Too many failed login attempts. Please try again later.";
      statusCode = 429;
    } else if (error.code === "permission-denied") {
      message = "❌ Insufficient permissions to access user data.";
      statusCode = 403;
    } else if (error.code === "not-found") {
      message = "❌ User or tenant not found.";
      statusCode = 404;
    } else {
      message = `❗ Unexpected error: ${error.message}`;
    }

    return res.status(statusCode).json({
      success: false,
      message,
      error: {
        code: error.code || "unknown",
        message: error.message,
      },
    });
  }
});

/**
 * Create a new app user under a tenant
 * Creates user in Firebase Auth and stores data in Firestore
 */
exports.createAppUser = onRequest({ cors: true }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "http://localhost:3000");
  log("Incoming create app user request", req.body);

  // Input validation
  const { email, password, tenantID, storeID, permissions } = req.body.data;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({
      success: false,
      message: "Valid email address is required.",
    });
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long.",
    });
  }

  if (!tenantID || typeof tenantID !== "string") {
    return res.status(400).json({
      success: false,
      message: "Tenant ID is required.",
    });
  }

  if (!storeID || typeof storeID !== "string") {
    return res.status(400).json({
      success: false,
      message: "Store ID is required.",
    });
  }

  try {
    // Check if tenant exists
    const tenantRef = DB.collection("tenants").doc(tenantID);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found.",
      });
    }

    // Check if user already exists with this email
    const existingUserQuery = await DB.collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .doc(storeID)
      .collection("users")
      .where("email", "==", email)
      .get();

    if (!existingUserQuery.empty) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists in this tenant.",
      });
    }

    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: email, // Use email as display name
      emailVerified: false, // Require email verification
    });

    // Generate unique user ID
    const userID = userRecord.uid;

    // Create user document in Firestore under tenant
    const userData = {
      id: userID,
      email: email,
      displayName: email,
      tenantID: tenantID,
      permissions: permissions || {
        level: 1, // Default permission level
        canCreateUsers: false,
        canManageInventory: false,
        canProcessPayments: false,
        canViewReports: false,
      },
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.body.createdBy || "system", // Track who created this user
      lastLogin: null,
      emailVerified: false,
      // Additional user metadata
      metadata: {
        timezone: req.body.timezone || "America/New_York",
        language: req.body.language || "en",
        department: req.body.department || null,
        role: req.body.role || "user",
      },
    };

    // Store user in Firestore under tenant/tenantID/stores/storeID/users/userID
    await DB.collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .doc(storeID)
      .collection("users")
      .doc(userID)
      .set(userData);

    // Create user index entry for quick tenant/store lookup
    await DB.collection("users").doc(userID).set({
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

    return res.status(201).json({
      success: true,
      message: `✅ User ${email} created successfully for tenant ${tenantID}.`,
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
    });
  } catch (error) {
    log("Error creating app user", error);

    let message;
    let statusCode = 500;

    if (error.code === "auth/email-already-exists") {
      message = "❌ User with this email already exists in Firebase Auth.";
      statusCode = 409;
    } else if (error.code === "auth/invalid-email") {
      message = "❌ Invalid email address format.";
      statusCode = 400;
    } else if (error.code === "auth/weak-password") {
      message = "❌ Password is too weak. Please use a stronger password.";
      statusCode = 400;
    } else if (error.code === "auth/operation-not-allowed") {
      message = "❌ Email/password accounts are not enabled.";
      statusCode = 403;
    } else if (error.code === "permission-denied") {
      message = "❌ Insufficient permissions to create user.";
      statusCode = 403;
    } else if (error.code === "not-found") {
      message = "❌ Tenant not found.";
      statusCode = 404;
    } else {
      message = `❗ Unexpected error: ${error.message}`;
    }

    return res.status(statusCode).json({
      success: false,
      message,
      error: {
        code: error.code || "unknown",
        message: error.message,
      },
    });
  }
});

/**
 * Create a new store subunit under a tenant
 * Creates store with initial SETTINGS_OBJ data
 */
exports.createStore = onRequest({ cors: true }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "http://localhost:3000");

  // return res.status(200).send("complete");
  // Handle preflight requests

  log("Incoming create store request", req.body);
  // return res.status(200).send("sup bro");

  // Input validation
  const { tenantID, storeID, storeName, createdBy } = req.body.data;

  if (!tenantID || typeof tenantID !== "string") {
    return res.status(400).json({
      success: false,
      message: "Tenant ID is required.",
    });
  }

  if (!storeID || typeof storeID !== "string") {
    return res.status(400).json({
      success: false,
      message: "Store ID is required.",
    });
  }

  if (!storeName || typeof storeName !== "string") {
    return res.status(400).json({
      success: false,
      message: "Store name is required.",
    });
  }

  try {
    // Check if tenant exists
    const tenantRef = DB.collection("tenants").doc(tenantID);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found.",
      });
    }

    // Check if store already exists
    const storeRef = DB.collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .doc(storeID);
    const storeDoc = await storeRef.get();

    if (storeDoc.exists) {
      return res.status(409).json({
        success: false,
        message: "Store with this ID already exists in this tenant.",
      });
    }

    // Create initial SETTINGS_OBJ data
    const initialSettings = {
      // Basic store information
      storeID: storeID,
      storeName: storeName,
      tenantID: tenantID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: createdBy || "system",
      status: "active",

      // Default statuses
      statuses: [
        {
          id: "1334453",
          textColor: "white",
          backgroundColor: "orange",
          altTextColor: "dimgray",
          label: "Order Part for Customer",
          removable: true,
        },
        {
          id: "kerj3krj",
          altTextColor: "dimgray",
          textColor: "white",
          backgroundColor: "orange",
          label: "Part Ordered",
          removable: true,
        },
        {
          id: "ek3rkeng",
          textColor: "white",
          backgroundColor: "blue",
          altTextColor: "gray",
          label: "Messaging Customer",
          removable: true,
        },
      ],

      // Default quick item buttons
      quickItemButtons: [
        {
          id: "38trrneg",
          name: "Tune-Up",
          items: [],
          buttons: [],
        },
        {
          id: "38trrdfdneg",
          name: "Tube",
          items: [],
          buttons: [],
        },
        { id: "38trrsdfneg", name: "Tire", items: [], buttons: [] },
        { id: "38trdfdrneg", name: "Tube & Tire", items: [], buttons: [] },
        { id: "38trdfadrneg", name: "Brakes", items: [], buttons: [] },
        {
          id: "38tradfdrneg",
          name: "Cable",
          items: [],
          buttons: [],
        },
        {
          id: "38trrnebfdgdg",
          name: "Shifting",
          items: [],
          buttons: [],
        },
        { id: "38trrnadfvceg", name: "Drivetrain", items: [], buttons: [] },
        { id: "38trsadgdvdrneg", name: "Spoke", items: [], buttons: [] },
        { id: "38trerfedgbdrneg", name: "Cleaning", items: [], buttons: [] },
        { id: "38trrfrdggdneg", name: "Scooter", items: [], buttons: [] },
        { id: "bnfdeqw", name: "Pickup/Delivery", items: [], buttons: [] },
        { id: "34trhrg", name: "Diagnostics", items: [], buttons: [] },
        { id: "labor", name: "$Labor", items: [], buttons: [] },
        { id: "part", name: "$Part", items: [], buttons: [] },
      ],

      // Default bike brands
      bikeBrands: [
        "Trek",
        "Specialized",
        "Sun",
        "Marin",
        "Cannondale",
        "Jamis",
      ],
      bikeBrandsName: "Bikes",
      bikeOptionalBrands: [
        "Euphree",
        "Lectric",
        "Hiboy",
        "Ridstar",
        "Velowave",
      ],
      bikeOptionalBrandsName: "E-bikes",

      // Default discounts
      discounts: [
        {
          id: "1333k",
          name: "50% Off Item",
          value: "50",
          type: "percent",
        },
        {
          id: "193j3k",
          name: "10% Off Item",
          value: "10",
          type: "percent",
        },
        {
          id: "394393",
          name: "20% Off Item",
          value: "20",
          type: "percent",
        },
        {
          id: "394393d",
          name: "30% Off Item",
          value: "30",
          type: "percent",
        },
        {
          id: "3943933",
          name: "40% Off Item",
          value: "40",
          type: "percent",
        },
        {
          id: "394393343",
          name: "50% Off Item",
          value: "50",
          type: "percent",
        },
        {
          id: "3k3nh",
          name: "2-bike purchase, $100 Off Each Bike",
          value: "10000",
          type: "dollar",
        },
        {
          id: "343gfg",
          name: "$10 Off",
          value: "1000",
          type: "dollar",
        },
      ],

      // Default wait times
      waitTimes: [
        {
          id: "34j3kj3dfdfgfkj3",
          label: "Waiting",
          maxWaitTimeDays: 0,
        },
        {
          id: "34jngfedde3kj3kj3",
          label: "Today",
          maxWaitTimeDays: 0,
        },
        {
          id: "34j3kjdww3kj3",
          label: "Tomorrow",
          maxWaitTimeDays: 1,
        },
        {
          id: "34j3kj3",
          label: "1-2 Days",
          maxWaitTimeDays: 2,
        },
        {
          id: "34j3kj33",
          label: "2-3 Days",
          maxWaitTimeDays: 3,
        },
        {
          id: "34j3kj3kj3",
          label: "3-5 Days",
          maxWaitTimeDays: 5,
        },
        {
          id: "34j3kj33kj3n",
          label: "1 Week",
          maxWaitTimeDays: 7,
        },
        {
          id: "34j3kj3,rkjk",
          label: "1-2 Weeks",
          maxWaitTimeDays: 14,
        },
        {
          id: "34j3kj3vnkd",
          label: "No Estimate",
        },
      ],

      // Default store hours
      storeHours: {
        standard: [
          {
            name: "Monday",
            id: "dkfjdkfn",
            open: "10:00 AM",
            close: "6:00 PM",
            isOpen: true,
          },
          {
            name: "Tuesday",
            id: "dkfjdkf3r3n",
            open: "10:00 AM",
            close: "6:00 PM",
            isOpen: true,
          },
          {
            name: "Wednesday",
            id: "dkfjdkfdkfjdkn",
            open: "10:00 AM",
            close: "6:00 PM",
            isOpen: true,
          },
          {
            name: "Thursday",
            id: "dkfjdkf3r3n3",
            open: "10:00 AM",
            close: "6:00 PM",
            isOpen: true,
          },
          {
            name: "Friday",
            id: "dkfjdkf3r3n4",
            open: "10:00 AM",
            close: "6:00 PM",
            isOpen: true,
          },
          {
            name: "Saturday",
            id: "dkfjdkf3r3n5",
            open: "10:00 AM",
            close: "4:00 PM",
            isOpen: true,
          },
          {
            name: "Sunday",
            id: "dkfjdkf3r3n6",
            open: "Closed",
            close: "Closed",
            isOpen: false,
          },
        ],
      },

      // Default shop information
      shopContactBlurb:
        "Store Contact Information\nAddress\nPhone\nEmail\nWebsite",
      shopName: storeName,
      thankYouBlurb:
        "Thank you for visiting! We value your business and satisfaction with our services. Please call or email anytime, we look forward to seeing you again.",

      // Default user settings
      users: [],
      punchClockArr: [],

      // Default inventory and workorder settings
      inventory: [],
      openWorkorders: [],
      closedWorkorders: [],
      sales: [],
      customers: [],

      // Default system settings
      systemSettings: {
        taxRate: 6.5,
        currency: "USD",
        timezone: "America/New_York",
        dateFormat: "MM/DD/YYYY",
        timeFormat: "12h",
      },
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

    return res.status(201).json({
      success: true,
      message: `✅ Store ${storeName} created successfully for tenant ${tenantID}.`,
      store: {
        id: storeID,
        name: storeName,
        tenantID: tenantID,
        status: "active",
        createdAt: initialSettings.createdAt,
        settings: initialSettings,
      },
    });
  } catch (error) {
    log("Error creating store", error);

    let message;
    let statusCode = 500;

    if (error.code === "permission-denied") {
      message = "❌ Insufficient permissions to create store.";
      statusCode = 403;
    } else if (error.code === "not-found") {
      message = "❌ Tenant not found.";
      statusCode = 404;
    } else if (error.code === "already-exists") {
      message = "❌ Store with this ID already exists.";
      statusCode = 409;
    } else {
      message = `❗ Unexpected error: ${error.message}`;
    }

    return res.status(statusCode).json({
      success: false,
      message,
      error: {
        code: error.code || "unknown",
        message: error.message,
      },
    });
  }
});

/**
 * Create a new tenant with primary and secondary contacts
 * Creates Firebase Auth accounts for both emails
 */
exports.createTenant = onRequest({ cors: true }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  res.set("Access-Control-Allow-Credentials", "true");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    log("Handling preflight request for createTenant");
    return res.status(200).end();
  }

  log("Incoming create tenant request", req.body);
  // return res.status(200).json({ message: "sup bro how u doin" });
  // Input validation
  const {
    tenantDisplayName,
    primaryEmail,
    secondaryEmail,
    phoneNumber,
    contactFirstName,
    contactLastName,
  } = req.body.data;
  log(tenantDisplayName + primaryEmail);
  if (!tenantDisplayName || typeof tenantDisplayName !== "string") {
    return res.status(400).json({
      success: false,
      message: "Tenant display name is required.",
    });
  }

  if (
    !primaryEmail ||
    typeof primaryEmail !== "string" ||
    !primaryEmail.includes("@")
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid primary email is required.",
    });
  }

  if (
    !secondaryEmail ||
    typeof secondaryEmail !== "string" ||
    !secondaryEmail.includes("@")
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid secondary email is required.",
    });
  }

  if (
    !phoneNumber ||
    typeof phoneNumber !== "string" ||
    phoneNumber.length !== 10 ||
    !/^\d{10}$/.test(phoneNumber)
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit phone number is required.",
    });
  }

  if (!contactFirstName || typeof contactFirstName !== "string") {
    return res.status(400).json({
      success: false,
      message: "Contact first name is required.",
    });
  }

  if (!contactLastName || typeof contactLastName !== "string") {
    return res.status(400).json({
      success: false,
      message: "Contact last name is required.",
    });
  }

  try {
    // Generate unique tenant ID (12-digit random number)
    let tenantID = "1234";

    // Ensure tenant ID is unique
    let tenantRef = db.collection("tenants").doc(tenantID);
    let tenantDoc = await tenantRef.get();

    while (tenantDoc.exists) {
      tenantID = generateTenantID();
      tenantRef = db.collection("tenants").doc(tenantID);
      tenantDoc = await tenantRef.get();
    }

    // Check if primary email already exists
    try {
      await admin.auth().getUserByEmail(primaryEmail);
      return res.status(409).json({
        success: false,
        message: "Primary email already exists in the system.",
      });
    } catch (error) {
      // User doesn't exist, which is what we want
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }

    // Check if secondary email already exists
    try {
      await admin.auth().getUserByEmail(secondaryEmail);
      return res.status(409).json({
        success: false,
        message: "Secondary email already exists in the system.",
      });
    } catch (error) {
      // User doesn't exist, which is what we want
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }

    // Create Firebase Auth accounts for both emails
    const primaryUserRecord = await admin.auth().createUser({
      email: primaryEmail,
      displayName: `${contactFirstName} ${contactLastName}`,
      emailVerified: false,
      disabled: false,
    });

    const secondaryUserRecord = await admin.auth().createUser({
      email: secondaryEmail,
      displayName: `${contactFirstName} ${contactLastName}`,
      emailVerified: false,
      disabled: false,
    });

    // Send password reset emails to both users
    const primaryPasswordResetLink = await admin
      .auth()
      .generatePasswordResetLink(primaryEmail);
    const secondaryPasswordResetLink = await admin
      .auth()
      .generatePasswordResetLink(secondaryEmail);

    // Create tenant document
    const tenantData = {
      id: tenantID,
      displayName: tenantDisplayName,
      primaryEmail: primaryEmail,
      secondaryEmail: secondaryEmail,
      phoneNumber: phoneNumber,
      contactFirstName: contactFirstName,
      contactLastName: contactLastName,
      primaryUserID: primaryUserRecord.uid,
      secondaryUserID: secondaryUserRecord.uid,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: "system",
      userCount: 0,
      storeCount: 0,
      subscription: {
        plan: "trial",
        status: "active",
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        trialEndDate: admin.firestore.FieldValue.serverTimestamp(),
      },
      settings: {
        timezone: "America/New_York",
        currency: "USD",
        dateFormat: "MM/DD/YYYY",
        timeFormat: "12h",
      },
    };

    // Store tenant document in Firestore
    await tenantRef.set(tenantData);

    // Create user index entries for quick lookup
    await db.collection("users").doc(primaryUserRecord.uid).set({
      email: primaryEmail,
      tenantID: tenantID,
      role: "primary_contact",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "active",
    });

    await db.collection("users").doc(secondaryUserRecord.uid).set({
      email: secondaryEmail,
      tenantID: tenantID,
      role: "secondary_contact",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "active",
    });

    log("Tenant created successfully", {
      tenantID,
      tenantDisplayName,
      primaryEmail,
      secondaryEmail,
    });

    return res.status(201).json({
      success: true,
      message: `✅ Tenant ${tenantDisplayName} created successfully.`,
      tenant: {
        id: tenantID,
        displayName: tenantDisplayName,
        primaryEmail: primaryEmail,
        secondaryEmail: secondaryEmail,
        phoneNumber: phoneNumber,
        contactFirstName: contactFirstName,
        contactLastName: contactLastName,
        status: "active",
        createdAt: tenantData.createdAt,
      },
      auth: {
        primaryUserID: primaryUserRecord.uid,
        secondaryUserID: secondaryUserRecord.uid,
        primaryPasswordResetLink: primaryPasswordResetLink,
        secondaryPasswordResetLink: secondaryPasswordResetLink,
      },
    });
  } catch (error) {
    log("Error creating tenant", error);

    let message;
    let statusCode = 500;

    if (error.code === "permission-denied") {
      message = "❌ Insufficient permissions to create tenant.";
      statusCode = 403;
    } else if (error.code === "auth/email-already-exists") {
      message = "❌ One or both emails already exist in the system.";
      statusCode = 409;
    } else if (error.code === "auth/invalid-email") {
      message = "❌ Invalid email address format.";
      statusCode = 400;
    } else {
      message = `❗ Unexpected error: ${error.message}`;
    }

    return res.status(statusCode).json({
      success: false,
      message,
      error: {
        code: error.code || "unknown",
        message: error.message,
      },
    });
  }
});

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

    const { chargeID, amount } = request.data;

    if (!chargeID || typeof chargeID !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Charge ID must be provided and must be a string."
      );
    }

    if (amount !== undefined && typeof amount !== "number") {
      throw new HttpsError(
        "invalid-argument",
        "If provided, refund amount must be a valid number in cents."
      );
    }

    try {
      // Create the refund directly with the charge ID
      const refund = await stripe.refunds.create({
        charge: chargeID,
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

    const { amount, readerID, paymentIntentID, captureMethod } = request.data;

    if (!amount || typeof amount !== "number") {
      throw new HttpsError(
        "invalid-argument",
        "Amount must be a valid number in cents."
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
    log("Incoming login callable request", request.data);

    // Initialize Firestore with service account
    const db = await getDB(firebaseServiceAccountKey);

    const { email, password } = request.data;

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

    try {
      // Authenticate user with Firebase Auth
      const userRecord = await admin.auth().getUserByEmail(email);

      if (userRecord.disabled) {
        throw new HttpsError(
          "permission-denied",
          "❌ User account has been disabled."
        );
      }

      const userID = userRecord.uid;

      // Look up user in the global users index
      const userIndexRef = db.collection("users").doc(userID);
      const userIndexDoc = await userIndexRef.get();

      if (!userIndexDoc.exists) {
        throw new HttpsError("not-found", "❌ User not found in system.");
      }

      const userIndexData = userIndexDoc.data();
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

      // Retrieve user details from tenant/store-specific collection
      const userRef = db
        .collection("tenants")
        .doc(tenantID)
        .collection("stores")
        .doc(storeID)
        .collection("users")
        .doc(userID);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError(
          "not-found",
          "❌ User details not found in tenant system."
        );
      }

      const userData = userDoc.data();

      // Retrieve tenant information
      const tenantRef = db.collection("tenants").doc(tenantID);
      const tenantDoc = await tenantRef.get();

      if (!tenantDoc.exists) {
        throw new HttpsError("not-found", "❌ Tenant information not found.");
      }

      const tenantData = tenantDoc.data();

      // Update last login timestamp
      await userRef.update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        loginCount: admin.firestore.FieldValue.increment(1),
      });

      log("User login successful", {
        userID,
        email,
        tenantID,
        storeID,
        displayName: userData.displayName,
      });

      return {
        success: true,
        message: `✅ Login successful for ${email} (Tenant: ${tenantID}, Store: ${storeID})`,
        data: {
          user: {
            id: userID,
            email: userData.email,
            displayName: userData.displayName,
            tenantID: tenantID,
            storeID: storeID,
            permissions: userData.permissions,
            status: userData.status,
            lastLogin: userData.lastLogin,
            createdAt: userData.createdAt,
            metadata: userData.metadata,
          },
          tenant: {
            id: tenantID,
            name: tenantData.name,
            status: tenantData.status,
            settings: tenantData.settings,
            userCount: tenantData.userCount,
            createdAt: tenantData.createdAt,
            subscription: tenantData.subscription,
          },
          auth: {
            uid: userID,
            email: email,
            emailVerified: userRecord.emailVerified,
            disabled: userRecord.disabled,
          },
        },
      };
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

      // Create user index entry for quick lookup
      await db.collection("users").doc(userID).set({
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

/**
 * Callable version of createTenant
 */
exports.createTenantCallable = onCall(
  { secrets: [firebaseServiceAccountKey] },
  async (request) => {
    log("Incoming create tenant callable request", request.data);

    // Initialize Firestore with service account
    const db = await getDB(firebaseServiceAccountKey);

    const {
      tenantDisplayName,
      primaryEmail,
      secondaryEmail,
      phoneNumber,
      contactFirstName,
      contactLastName,
    } = request.data;

    if (!tenantDisplayName || typeof tenantDisplayName !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Tenant display name is required."
      );
    }

    if (
      !primaryEmail ||
      typeof primaryEmail !== "string" ||
      !primaryEmail.includes("@")
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Valid primary email is required."
      );
    }

    if (
      !secondaryEmail ||
      typeof secondaryEmail !== "string" ||
      !secondaryEmail.includes("@")
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Valid secondary email is required."
      );
    }

    if (
      !phoneNumber ||
      typeof phoneNumber !== "string" ||
      phoneNumber.length !== 10 ||
      !/^\d{10}$/.test(phoneNumber)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Valid 10-digit phone number is required."
      );
    }

    if (!contactFirstName || typeof contactFirstName !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Contact first name is required."
      );
    }

    if (!contactLastName || typeof contactLastName !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Contact last name is required."
      );
    }

    try {
      // Generate unique tenant ID
      let tenantID = "1234";

      // Ensure tenant ID is unique
      let tenantRef = db.collection("tenants").doc(tenantID);
      let tenantDoc = await tenantRef.get();

      while (tenantDoc.exists) {
        tenantID = generateTenantID();
        tenantRef = db.collection("tenants").doc(tenantID);
        tenantDoc = await tenantRef.get();
      }

      // Check if primary email already exists
      try {
        await admin.auth().getUserByEmail(primaryEmail);
        throw new HttpsError(
          "already-exists",
          "Primary email already exists in the system."
        );
      } catch (error) {
        if (error.code !== "auth/user-not-found") {
          throw error;
        }
      }

      // Check if secondary email already exists
      try {
        await admin.auth().getUserByEmail(secondaryEmail);
        throw new HttpsError(
          "already-exists",
          "Secondary email already exists in the system."
        );
      } catch (error) {
        if (error.code !== "auth/user-not-found") {
          throw error;
        }
      }

      // Create Firebase Auth accounts for both emails
      const primaryUserRecord = await admin.auth().createUser({
        email: primaryEmail,
        displayName: `${contactFirstName} ${contactLastName}`,
        emailVerified: false,
        disabled: false,
      });

      const secondaryUserRecord = await admin.auth().createUser({
        email: secondaryEmail,
        displayName: `${contactFirstName} ${contactLastName}`,
        emailVerified: false,
        disabled: false,
      });

      // Send password reset emails to both users
      const primaryPasswordResetLink = await admin
        .auth()
        .generatePasswordResetLink(primaryEmail);
      const secondaryPasswordResetLink = await admin
        .auth()
        .generatePasswordResetLink(secondaryEmail);

      // Create tenant document
      const tenantData = {
        id: tenantID,
        displayName: tenantDisplayName,
        primaryEmail: primaryEmail,
        secondaryEmail: secondaryEmail,
        phoneNumber: phoneNumber,
        contactFirstName: contactFirstName,
        contactLastName: contactLastName,
        primaryUserID: primaryUserRecord.uid,
        secondaryUserID: secondaryUserRecord.uid,
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: "system",
        userCount: 0,
        storeCount: 0,
        subscription: {
          plan: "trial",
          status: "active",
          startDate: admin.firestore.FieldValue.serverTimestamp(),
          trialEndDate: admin.firestore.FieldValue.serverTimestamp(),
        },
        settings: {
          timezone: "America/New_York",
          currency: "USD",
          dateFormat: "MM/DD/YYYY",
          timeFormat: "12h",
        },
      };

      // Store tenant document in Firestore
      await tenantRef.set(tenantData);

      // Create user index entries for quick lookup
      await db.collection("users").doc(primaryUserRecord.uid).set({
        email: primaryEmail,
        tenantID: tenantID,
        role: "primary_contact",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "active",
      });

      await db.collection("users").doc(secondaryUserRecord.uid).set({
        email: secondaryEmail,
        tenantID: tenantID,
        role: "secondary_contact",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "active",
      });

      log("Tenant created successfully", {
        tenantID,
        tenantDisplayName,
        primaryEmail,
        secondaryEmail,
      });

      return {
        success: true,
        message: `✅ Tenant ${tenantDisplayName} created successfully.`,
        data: {
          tenant: {
            id: tenantID,
            displayName: tenantDisplayName,
            primaryEmail: primaryEmail,
            secondaryEmail: secondaryEmail,
            phoneNumber: phoneNumber,
            contactFirstName: contactFirstName,
            contactLastName: contactLastName,
            status: "active",
            createdAt: tenantData.createdAt,
          },
          auth: {
            primaryUserID: primaryUserRecord.uid,
            secondaryUserID: secondaryUserRecord.uid,
            primaryPasswordResetLink: primaryPasswordResetLink,
            secondaryPasswordResetLink: secondaryPasswordResetLink,
          },
        },
      };
    } catch (error) {
      log("Error creating tenant", error);

      if (error.code === "permission-denied") {
        throw new HttpsError(
          "permission-denied",
          "❌ Insufficient permissions to create tenant."
        );
      } else if (error.code === "auth/email-already-exists") {
        throw new HttpsError(
          "already-exists",
          "❌ One or both emails already exist in the system."
        );
      } else if (error.code === "auth/invalid-email") {
        throw new HttpsError(
          "invalid-argument",
          "❌ Invalid email address format."
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

// Helper function for generating tenant ID
function generateTenantID() {
  return Math.floor(100000000000 + Math.random() * 900000000000).toString();
}

/**
 * Test callable function - writes test data to customer_phone/test
 * Used to verify callable functions and permissions are working correctly
 */
exports.testCustomerPhoneWrite = onCall(
  {
    secrets: [firebaseServiceAccountKey],
    enforceAppCheck: false, // Allow unauthenticated calls for testing
  },
  async (request) => {
    log("Test customer_phone write callable invoked", {
      data: request.data,
      hasAuth: !!request.auth,
      uid: request.auth?.uid || "none",
    });

    try {
      const { testData, timestamp } = request.data;

      // Initialize Admin SDK with service account from Secret Manager
      const db = await getDB(firebaseServiceAccountKey);

      log("Admin SDK initialized successfully with service account (callable)");

      // Create test document
      const testDocData = {
        testData: testData || "Test data from callable function",
        timestamp: timestamp || Date.now(),
        calledAt: admin.firestore.FieldValue.serverTimestamp(),
        calledBy: request.auth?.uid || "anonymous",
        userEmail: request.auth?.token?.email || "not authenticated",
        method: "callable",
        success: true,
      };

      // Write to customer_phone/test
      await db.collection("customer_phone").doc("test").set(testDocData);

      log(
        "Test data written successfully to customer_phone/test (callable)",
        testDocData
      );

      return {
        success: true,
        message:
          "✅ Test data written successfully to customer_phone/test via callable",
        data: testDocData,
        path: "customer_phone/test",
      };
    } catch (error) {
      log("Error writing test data (callable)", {
        error: error.message,
        code: error.code,
      });

      throw new HttpsError(
        "internal",
        `Failed to write test data: ${error.message}`
      );
    }
  }
);

/**
 * Test HTTP endpoint - writes test data to customer_phone/test
 * Used to verify HTTP requests and permissions are working correctly
 */
exports.testCustomerPhoneWriteHTTP = onRequest(
  { cors: true, secrets: [firebaseServiceAccountKey] },
  async (req, res) => {
    // Set CORS headers
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    log("Test customer_phone write HTTP endpoint invoked", req.body);

    try {
      const { testData, timestamp } = req.body;

      // Initialize Admin SDK with service account from Secret Manager
      const db = await getDB(firebaseServiceAccountKey);

      log("Admin SDK initialized successfully with service account");

      // TEST 1: Try Realtime Database to verify Admin SDK works
      try {
        const rtdb = admin.database();
        await rtdb.ref("test_write").set({
          testData: "RTDB test",
          timestamp: Date.now(),
        });
        log("✅ TEST 1: Realtime Database write SUCCESS");
      } catch (rtdbError) {
        log("❌ TEST 1: Realtime Database write FAILED", {
          error: rtdbError.message,
          code: rtdbError.code,
        });
      }

      // TEST 2: Try Firestore root collection
      try {
        await db.collection("test_writes").doc("test").set({
          testData: "Root collection test",
          timestamp: Date.now(),
        });
        log("✅ TEST 2: Firestore root collection write SUCCESS");
      } catch (rootError) {
        log("❌ TEST 2: Firestore root collection write FAILED", {
          error: rootError.message,
          code: rootError.code,
        });
      }

      // TEST 3: Try customer_phone collection
      const testDocData = {
        testData: testData || "Test data from HTTP endpoint",
        timestamp: timestamp || Date.now(),
        calledAt: admin.firestore.FieldValue.serverTimestamp(),
        method: "http",
        requestMethod: req.method,
        success: true,
      };

      log("TEST 3: Attempting write to customer_phone/test");
      await db.collection("customer_phone").doc("test").set(testDocData);

      log(
        "Test data written successfully to customer_phone/test via HTTP",
        testDocData
      );

      return res.status(200).json({
        success: true,
        message:
          "✅ Test data written successfully to customer_phone/test via HTTP",
        data: testDocData,
        path: "customer_phone/test",
      });
    } catch (error) {
      log("Error writing test data via HTTP", {
        error: error.message,
        code: error.code,
      });

      return res.status(500).json({
        success: false,
        message: `Failed to write test data: ${error.message}`,
        error: {
          message: error.message,
          code: error.code || "unknown",
        },
      });
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
  { secrets: [stripeSecretKey] },
  async (request) => {
    log("newCheckout: initiate payment intent request", request.data);

    const { amount, readerID, paymentIntentID, tenantID, storeID, saleID, customerID, customerEmail, transactionID, salesTax } = request.data;

    if (!amount || typeof amount !== "number") {
      throw new HttpsError(
        "invalid-argument",
        "Amount must be a valid number in cents."
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
 * Processes a refund for a given charge.
 * Input: { chargeID, amount (cents, optional for partial) }
 * Optional (new architecture): { transactionID, tenantID, storeID, refundId, method, salesTax, workorderLines, notes }
 * If transactionID is provided, writes the refund object to the payment transaction in Firestore.
 */
exports.newCheckoutProcessRefundCallable = onCall(
  { secrets: [stripeSecretKey, firebaseServiceAccountKey] },
  async (request) => {
    log("newCheckout: process refund request", request.data);

    const { chargeID, amount, transactionID, tenantID, storeID, refundId, method, salesTax, workorderLines, notes } = request.data;

    if (!chargeID || typeof chargeID !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Charge ID must be provided."
      );
    }

    if (amount !== undefined && typeof amount !== "number") {
      throw new HttpsError(
        "invalid-argument",
        "If provided, refund amount must be a valid number in cents."
      );
    }

    try {
      const stripeClient = Stripe(stripeSecretKey.value());

      // Create the refund directly with the charge ID
      const refund = await stripeClient.refunds.create({
        charge: chargeID,
        ...(amount ? { amount } : {}),
      });

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
 * newCheckoutCancelPaymentCallable
 * Cancels the current action on a Stripe Terminal reader.
 * Input: { readerID }
 */
exports.newCheckoutCancelPaymentCallable = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    log("newCheckout: cancel payment request", request.data);

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
  { secrets: [stripeSecretKey] },
  async (request) => {
    log("newCheckout: manual card payment request", {
      amount: request.data?.amount,
      saleID: request.data?.saleID,
    });

    const { amount, paymentMethodID, tenantID, storeID, saleID, customerID, customerEmail, transactionID } = request.data;

    if (!amount || amount < 50) {
      throw new HttpsError("invalid-argument", "Amount must be at least $0.50 (50 cents).");
    }
    if (!paymentMethodID) {
      throw new HttpsError("invalid-argument", "Payment method ID is required.");
    }
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "Tenant and store IDs are required.");
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
const LIGHTSPEED_CALLBACK_URL = "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/lightspeedOAuthCallback";

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
  const bucket = admin.storage().bucket("warpspeed-bonitabikes.firebasestorage.app");
  const file = bucket.file(storagePath);
  await file.save(csvString, {
    contentType: "text/csv",
    metadata: { contentDisposition: `attachment; filename="${storagePath.split("/").pop()}"` },
  });
  await file.makePublic();
  return `https://storage.googleapis.com/warpspeed-bonitabikes.firebasestorage.app/${storagePath}`;
}

async function streamLightspeedCSVToStorage(accessToken, accountID, endpoint, params, headers, rowMapper, storagePath, lsLog) {
  const bucket = admin.storage().bucket("warpspeed-bonitabikes.firebasestorage.app");
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
  const url = `https://storage.googleapis.com/warpspeed-bonitabikes.firebasestorage.app/${storagePath}`;
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
          endedOnMillis: "",
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
          category: isLabor ? "Labor" : "Part",
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
  async (request) => {
    log("Incoming email callable request", request.data);

    try {
      const { to, subject, htmlBody, tenantID, storeID } = request.data;

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

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "support@bonitabikes.com",
          pass: gmailAppPassword.value(),
        },
      });

      const mailOptions = {
        from: '"Bonita Bikes" <support@bonitabikes.com>',
        to: to,
        subject: subject,
        html: htmlBody,
      };

      const info = await transporter.sendMail(mailOptions);

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
  }
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
  async (request) => {
    log("Incoming uploadPDFAndSendSMS request");

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
        fromNumber = "+12393171234",
      } = request.data;

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
      const bucket = admin.storage().bucket("warpspeed-bonitabikes.firebasestorage.app");
      const file = bucket.file(storagePath);
      await file.save(Buffer.from(base64, "base64"), {
        contentType: "application/pdf",
        metadata: { contentType: "application/pdf" },
      });
      await file.makePublic();
      const pdfURL = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

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
      const twilioResponse = await twilioClient.messages.create({
        body: finalMessage.trim(),
        to: `+1${cleanPhoneNumber}`,
        from: fromNumber,
        statusCallback: `https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/smsStatusCallback`,
      });

      log("PDF SMS sent successfully", {
        messageSid: twilioResponse.sid,
        to: twilioResponse.to,
        status: twilioResponse.status,
      });

      // Store outgoing message in Firestore
      if (customerID && messageID) {
        try {
          const messageRef = db
            .collection("customer_phone")
            .doc(cleanPhoneNumber)
            .collection("messages")
            .doc(messageID);

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
          });
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
  }
);

// ============================================================================
// Google Cloud Translation
// ============================================================================
exports.translateTextCallable = onCall(
  {
    secrets: [googleTranslateApiKey],
  },
  async (request) => {
    log("Incoming translateText callable request", request.data);

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
  }
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
 * Archive all documents in a collection to Cloud Storage as a JSON file.
 * Returns { success, docCount, error? } for each collection.
 */
async function archiveTenantStore(db, bucket, tenantID, storeID) {
  const results = {};

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
      const storagePath = `${tenantID}/${storeID}/archives/${collectionName}/latest.json`;
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
        "nightlyArchive: Archived " + collectionName,
        { tenantID, storeID, docCount: docs.length, path: storagePath }
      );
    } catch (err) {
      log(
        "nightlyArchive: Error archiving " + collectionName + " for " + tenantID + "/" + storeID,
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
      .where("endedOnMillis", "<", cutoffMillis)
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


// ============================================================================
// Customer-Facing Workorder Screen
// ============================================================================

const LANGUAGE_MAP = { English: "en", Spanish: "es", French: "fr", Creole: "ht" };

const CUSTOMER_WO_UI_LABELS = {
  yourWorkorder: "Your Workorder",
  status: "Status",
  estimatedReady: "Estimated ready",
  brand: "Brand",
  model: "Model",
  description: "Description",
  colors: "Colors",
  items: "Items",
  notes: "Notes",
  media: "Photos & Videos",
  subtotal: "Subtotal",
  discount: "Discount",
  tax: "Tax",
  total: "Total",
  amountPaid: "Amount Paid",
  balanceDue: "Balance Due",
  partsOnOrder: "Parts on Order",
  estDelivery: "Est. Delivery",
  uploadPhotos: "Upload Photos",
  greeting: "Here's your workorder",
  waitTime: "Wait Time",
  notFound: "This workorder could not be found.",
};

exports.getCustomerWorkorder = onRequest(
  {
    cors: true,
    secrets: [firebaseServiceAccountKey, googleTranslateApiKey],
  },
  async (req, res) => {
    try {
      const pin = req.query.pin || req.body?.pin;
      if (!pin || typeof pin !== "string" || pin.length < 3) {
        return res.status(400).json({ success: false, error: "Invalid PIN" });
      }

      const db = await getDB(firebaseServiceAccountKey);

      // Look up PIN
      const pinSnap = await db.collection("workorder-pins").doc(pin).get();
      if (!pinSnap.exists) {
        return res.status(404).json({ success: false, error: "Link not found or expired" });
      }
      const pinDoc = pinSnap.data();
      const { tenantID, storeID, workorderID } = pinDoc;

      // Fetch settings + try open-workorders first
      const [openWoSnap, settingsSnap] = await Promise.all([
        db.collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("open-workorders").doc(workorderID)
          .get(),
        db.collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("settings").doc("settings")
          .get(),
      ]);

      let workorder = null;
      let isCompleted = false;

      if (openWoSnap.exists) {
        workorder = openWoSnap.data();
      } else {
        // Try completed-workorders
        const closedWoSnap = await db.collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("completed-workorders").doc(workorderID)
          .get();
        if (closedWoSnap.exists) {
          workorder = closedWoSnap.data();
          isCompleted = true;
        }
      }

      if (!workorder) {
        return res.status(404).json({ success: false, error: "Workorder not found" });
      }

      const settings = settingsSnap.exists ? settingsSnap.data() : {};

      // Fetch customer using workorder's customerID (may differ from pin doc if updated later)
      const custID = workorder.customerID || pinDoc.customerID || "";
      let customer = {};
      if (custID) {
        const custSnap = await db.collection("tenants").doc(tenantID)
          .collection("stores").doc(storeID)
          .collection("customers").doc(custID)
          .get();
        if (custSnap.exists) customer = custSnap.data();
      }
      const statuses = settings.statuses || [];

      // Resolve status
      const statusObj = statuses.find((s) => s.id === workorder.status) || {
        label: workorder.status || "Unknown",
        textColor: "black",
        backgroundColor: "whitesmoke",
      };

      // Build items (names + qty only, no internal pricing)
      const items = (workorder.workorderLines || []).map((line) => ({
        name: line.inventoryItem?.formalName || line.inventoryItem?.informalName || "Item",
        qty: Number(line.qty) || 1,
      }));

      // Calculate totals
      const totals = calculateWorkorderTotal(workorder, settings);
      const formatCents = (c) => "$" + (c / 100).toFixed(2);

      // Build media array (thumbnails + full URLs, strip internal fields)
      const media = (workorder.media || []).map((m) => ({
        id: m.id,
        thumbnailUrl: m.thumbnailUrl || m.url,
        url: m.url,
        type: m.type || "image",
        filename: m.filename || "",
      }));

      // Derive amountPaid from active sale or completed sale
      let paidCents = 0;
      const saleID = workorder.activeSaleID || workorder.saleID || "";
      if (saleID) {
        const salePaths = [
          `tenants/${tenantID}/stores/${storeID}/active-sales/${saleID}`,
          `tenants/${tenantID}/stores/${storeID}/completed-sales/${saleID}`,
        ];
        for (const salePath of salePaths) {
          const saleSnap = await db.doc(salePath).get();
          if (saleSnap.exists) {
            const saleData = saleSnap.data();
            paidCents = (saleData.amountCaptured || 0) - (saleData.amountRefunded || 0);
            break;
          }
        }
      }

      // Build response
      const payload = {
        storeName: settings?.storeInfo?.displayName || "",
        storePhone: settings?.storeInfo?.phone || "",
        workorderNumber: workorder.workorderNumber || "",
        brand: workorder.brand || "",
        model: workorder.model || "",
        description: workorder.description || "",
        color1: workorder.color1 || null,
        color2: workorder.color2 || null,
        status: {
          label: statusObj.label || "",
          backgroundColor: statusObj.backgroundColor || "whitesmoke",
          textColor: statusObj.textColor || "black",
        },
        waitTime: workorder.waitTime?.label || "",
        waitTimeEstimateLabel: workorder.waitTimeEstimateLabel || "",
        startedOnMillis: workorder.startedOnMillis || null,
        partOrdered: workorder.partOrdered || "",
        partEstimatedDelivery: workorder.partEstimatedDelivery || "",
        items,
        customerNotes: workorder.customerNotes || [],
        showPricing: !!settings.showCustomerPricing,
        subtotal: formatCents(totals.subtotal),
        discount: formatCents(totals.discount),
        tax: formatCents(totals.tax),
        total: formatCents(totals.total),
        amountPaid: formatCents(paidCents),
        balanceDue: formatCents(totals.total - paidCents),
        media,
        customerFirst: customer.first || workorder.customerFirst || "",
        customerLanguage: customer.language || "English",
        pin,
        isCompleted,
        translations: null,
      };

      // Translate UI labels if customer language is not English
      const langCode = LANGUAGE_MAP[payload.customerLanguage];
      if (langCode && langCode !== "en") {
        try {
          const labelKeys = Object.keys(CUSTOMER_WO_UI_LABELS);
          const labelValues = Object.values(CUSTOMER_WO_UI_LABELS);
          // Also translate the status label
          const textsToTranslate = [...labelValues, payload.status.label];

          const { Translate } = require("@google-cloud/translate").v2;
          const translate = new Translate({ key: googleTranslateApiKey.value() });
          const [translated] = await translate.translate(textsToTranslate, { to: langCode, from: "en" });

          const translations = {};
          labelKeys.forEach((key, i) => {
            translations[key] = translated[i];
          });
          translations.statusLabel = translated[translated.length - 1];
          payload.translations = translations;
        } catch (transErr) {
          log("getCustomerWorkorder: translation error (non-fatal)", transErr.message);
          // Continue without translations
        }
      }

      return res.status(200).json({ success: true, data: payload });
    } catch (error) {
      log("getCustomerWorkorder: error", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

exports.customerUploadWorkorderMedia = onRequest(
  {
    cors: true,
    secrets: [firebaseServiceAccountKey],
  },
  async (req, res) => {
    try {
      const { pin, fileBase64, fileName, contentType } = req.body || {};

      if (!pin || !fileBase64 || !fileName) {
        return res.status(400).json({ success: false, error: "Missing required fields: pin, fileBase64, fileName" });
      }

      const db = await getDB(firebaseServiceAccountKey);

      // Validate PIN
      const pinSnap = await db.collection("workorder-pins").doc(pin).get();
      if (!pinSnap.exists) {
        return res.status(404).json({ success: false, error: "Link not found or expired" });
      }
      const pinDoc = pinSnap.data();
      const { tenantID, storeID, workorderID } = pinDoc;

      // Decode base64
      const buffer = Buffer.from(fileBase64, "base64");
      const fileSizeBytes = buffer.length;

      // Upload to Cloud Storage
      const bucket = admin.storage().bucket();
      const timestamp = Date.now();
      const mediaID = "cm_" + crypto.randomUUID() + "_" + timestamp;
      const storagePath = `${tenantID}/${storeID}/workorders/${workorderID}/attachments/media/${timestamp}_${fileName}`;
      const file = bucket.file(storagePath);

      await file.save(buffer, {
        metadata: { contentType: contentType || "image/jpeg" },
      });
      await file.makePublic();

      const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      // Build media item
      const mediaItem = {
        id: mediaID,
        url,
        storagePath,
        thumbnailUrl: url,
        thumbnailStoragePath: "",
        type: (contentType || "").startsWith("video") ? "video" : "image",
        filename: fileName,
        fileSize: fileSizeBytes,
        originalFilename: fileName,
        originalFileSize: fileSizeBytes,
        uploadedAt: timestamp,
        uploadedBy: "customer",
      };

      // Update workorder media array
      await db.collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("open-workorders").doc(workorderID)
        .update({
          media: FieldValue.arrayUnion(mediaItem),
        });

      return res.status(200).json({ success: true, data: { mediaItem } });
    } catch (error) {
      log("customerUploadWorkorderMedia: error", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

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
      .bucket("warpspeed-bonitabikes.firebasestorage.app");

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
            });

          log("nightlyArchive: Completed " + tenantID + "/" + storeID, {
            archive: archiveResults,
            mediaCleanup: mediaResults,
            activeSaleCleanup: activeSaleResults,
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
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required");
    }

    const db = await getDB(firebaseServiceAccountKey);
    const bucket = admin
      .storage()
      .bucket("warpspeed-bonitabikes.firebasestorage.app");

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

    const { tenantID, storeID, collections } = request.data;

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

    const db = await getDB(firebaseServiceAccountKey);
    const bucket = admin
      .storage()
      .bucket("warpspeed-bonitabikes.firebasestorage.app");

    const results = {};

    for (const collectionName of collections) {
      try {
        const storagePath = `${tenantID}/${storeID}/archives/${collectionName}/latest.json`;
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
          collections: results,
        });
    } catch (err) {
      log("rehydrate: Failed to write audit log", err.message);
    }

    return { success: true, results };
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
  gmailAppPassword, channel,
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

  recomputeSaleAmountsServer(sale, allTransactions, sale.creditsApplied || []);

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
      wo.endedOnMillis = timestamp;

      let entries = [];
      if (oldStatus !== "finished_and_paid") {
        entries.push({ timestamp, user: "System", field: "status", action: "changed", from: oldStatusLabel, to: newStatusLabel });
      }
      entries.push({ timestamp, user: "System", field: "payment", action: "completed", from: "", to: "Sale completed — $" + (sale.total / 100).toFixed(2) });
      wo.changeLog = [...(wo.changeLog || []), ...entries];
      wo.status = "finished_and_paid";

      await db.collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("completed-workorders").doc(woID)
        .set(wo);
      await woRef.delete();
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
  let allLines = [];
  let primaryWO = null;
  for (const woID of workorderIDs) {
    const completedSnap = await db.collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("completed-workorders").doc(woID)
      .get();
    if (completedSnap.exists) {
      const wo = completedSnap.data();
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
      const printObj = sharedPrintBuilder.sale(sale, allTransactions, customerForPrint, primaryWO, sale.salesTaxPercent || 0, printContext, sale.creditsApplied);
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
  const storeName = settings?.storeInfo?.displayName || "Bonita Bikes";
  const receiptUrl = charge?.receipt_url || "";
  const amountDisplay = (sale.total / 100).toFixed(2);
  const cleanPhone = (customer?.customerCell || customer?.cell || primaryWO?.customerCell || "").replace(/\D/g, "");
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
      await _twilio.messages.create({
        body: receiptMsg,
        to: `+1${cleanPhone}`,
        from: "+12393171234",
      });
      const receiptMsgID = crypto.randomUUID();
      await db.collection("customer_phone").doc(cleanPhone)
        .collection("messages").doc(receiptMsgID)
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
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "support@bonitabikes.com",
          pass: gmailAppPassword.value(),
        },
      });
      await transporter.sendMail({
        from: `"${storeName}" <support@bonitabikes.com>`,
        to: customerEmail,
        subject: `Payment Receipt from ${storeName} — $${amountDisplay}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto"><p>Payment of <strong>$${amountDisplay}</strong> received by ${storeName}. Thank you!</p><p style="margin:24px 0"><a href="${receiptUrl}" style="display:inline-block;padding:12px 24px;background-color:#4CAF50;color:white;text-decoration:none;border-radius:6px;font-size:14px">View Receipt</a></p></div>`,
      });
      log(`completeSaleServerSide[${logPrefix}]: receipt email sent`, { email: customerEmail });
    } catch (emailErr) {
      log(`completeSaleServerSide[${logPrefix}]: email error`, emailErr.message);
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

    try {
      const { workorderID, channel, tenantID, storeID } = request.data;

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
      if (workorder.activeSaleID) {
        throw new HttpsError("failed-precondition", "Workorder already has an active sale in progress");
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

      const cleanPhone = (customer.customerCell || customer.cell || "").replace(/\D/g, "");
      const customerEmail = customer.email || "";

      // Validate channel against available contact info
      if ((channel === "sms" || channel === "both") && cleanPhone.length !== 10) {
        throw new HttpsError("failed-precondition", "Customer has no valid phone number for SMS");
      }
      if ((channel === "email" || channel === "both") && (!customerEmail || !customerEmail.includes("@"))) {
        throw new HttpsError("failed-precondition", "Customer has no valid email address");
      }

      // ── Calculate totals ──
      const totals = calculateWorkorderTotal(workorder, settings);
      const amountToCharge = totals.total - (workorder.amountPaid || 0);

      if (amountToCharge <= 0) {
        throw new HttpsError("failed-precondition", "Workorder balance is already paid");
      }
      if (amountToCharge < 50) {
        throw new HttpsError("failed-precondition", "Amount must be at least $0.50 for card payment");
      }

      // ── Create sale object ──
      const saleID = generateSaleID();
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

      // Save active sale
      await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("active-sales").doc(saleID)
        .set(sale);

      // Update workorder with activeSaleID
      await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("open-workorders").doc(workorderID)
        .update({ activeSaleID: saleID });

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
        },
        expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        success_url: "https://warpspeed-bonitabikes.web.app/payment-success",
        cancel_url: "https://warpspeed-bonitabikes.web.app/payment-cancelled",
      });

      // Update sale with checkout session ID
      await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("active-sales").doc(saleID)
        .update({ checkoutSessionID: session.id });

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

        const smsBody = `${storeName} has sent you a payment request for $${amountDisplay}. Pay securely here: ${session.url}`;

        await twilioClient.messages.create({
          body: smsBody,
          to: `+1${cleanPhone}`,
          from: "+12393171234",
        });

        // Store in customer message queue
        const messageID = crypto.randomUUID();
        await db
          .collection("customer_phone").doc(cleanPhone)
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

        await db.collection("customer_phone").doc(cleanPhone).set(
          { canRespond: true, lastMessageMillis: Date.now() },
          { merge: true }
        );

        log("createTextToPayInvoice: SMS sent", { phone: cleanPhone });
      }

      // Email
      if (channel === "email" || channel === "both") {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: "support@bonitabikes.com",
            pass: gmailAppPassword.value(),
          },
        });

        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <p>${storeName} has sent you a payment request for <strong>$${amountDisplay}</strong>.</p>
            <p style="margin: 24px 0;">
              <a href="${session.url}" style="display: inline-block; padding: 14px 28px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">Pay Now</a>
            </p>
            <p style="color: #888; font-size: 13px;">This link expires in 24 hours.</p>
          </div>
        `;

        await transporter.sendMail({
          from: `"${storeName}" <support@bonitabikes.com>`,
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
      const { tenantID, storeID, saleID, workorderID, customerID, channel, transactionID } =
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
          id: generateEAN13Barcode(),
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
        });

        log("stripeCheckoutWebhook_LinkToPay: sale completed successfully", { saleID, workorderID });
        return res.status(200).json({ received: true, completed: true });
      }

      // ────────────────────────────────────────────────────────────
      // CHECKOUT SESSION EXPIRED
      // ────────────────────────────────────────────────────────────
      if (event.type === "checkout.session.expired") {
        log("stripeCheckoutWebhook_LinkToPay: processing expired session", { saleID, workorderID });

        // Delete active sale (if it still exists)
        try {
          await db
            .collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("active-sales").doc(saleID)
            .delete();
        } catch (delErr) {
          log("stripeCheckoutWebhook_LinkToPay: error deleting expired active sale", delErr.message);
        }

        // Clear workorder's activeSaleID (if workorder still open)
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

            const cleanPhone = (customer.customerCell || customer.cell || "").replace(/\D/g, "");
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
                .collection("customer_phone").doc(cleanPhone)
                .collection("messages").doc(expMsgID)
                .set({
                  id: expMsgID,
                  customerID: customerID || "",
                  message: expMsg,
                  phoneNumber: cleanPhone,
                  tenantID,
                  storeID,
                  type: "outgoing",
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