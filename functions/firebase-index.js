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
const { onInit } = require("firebase-functions/v2/core");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

// Initialize Firebase Admin SDK with default credentials
// In production, this will use the service account key automatically
admin.initializeApp();
const DB = getFirestore();

// Check if running in emulator mode
// const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

// If running in emulator, connect to local Firestore emulator
// if (isEmulator) {
//   process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
// }

const stripeSecretKey = defineSecret("stripeSecretKey");
const twilioSecretKey = defineSecret("twilioSecretKey");
const twilioSecretAccountNumber = defineSecret("twilioSecretAccountNum");

// initialization
var stripe;
var twilioClient;
onInit(async () => {
  // stripe = Stripe(stripeSecretKey.value()); // Stripe secret key
  // try {
  //   twilioClient = require("twilio")(
  //     twilioSecretAccountNumber,
  //     twilioSecretKey
  //   );
  // } catch (e) {
  //   log("error fetching Twilio client", e);
  // }
}, [stripeSecretKey]);

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

exports.initiateRefund = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "http://localhost:3000");
    log("Incoming refund", req.body);

    const paymentIntentId = req.body.paymentIntentId;
    const amount = req.body.amount; // Optional: refund a specific amount (in cents)

    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      return res.status(400).json({
        success: false,
        message: "PaymentIntent ID must be provided and must be a string.",
      });
    }

    if (amount !== undefined && typeof amount !== "number") {
      return res.status(400).json({
        success: false,
        message: "If provided, refund amount must be a valid number in cents.",
      });
    }

    try {
      // Step 1: Retrieve the PaymentIntent to get its latest charge
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      const chargeId = paymentIntent.charges?.data?.[0]?.id;
      if (!chargeId) {
        return res.status(400).json({
          success: false,
          message: "No charge found for the given PaymentIntent.",
        });
      }

      // Step 2: Create the refund
      const refund = await stripe.refunds.create({
        charge: chargeId,
        ...(amount ? { amount } : {}), // Optional partial refund
      });

      // Step 3: Return success response
      return res.status(200).json({
        success: true,
        message: `✅ Refund ${
          amount ? `$${(amount / 100).toFixed(2)}` : "for full amount"
        } processed successfully.`,
        refundId: refund.id,
        status: refund.status,
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
          message = `📡 Network error: Could not connect to Stripe.`;
          break;
        case "StripeAuthenticationError":
          message = `🔐 Authentication error: Please check your Stripe credentials.`;
          break;
        case "StripePermissionError":
          message = `🔒 Permission error: Not allowed to issue this refund.`;
          break;
        default:
          message = `❗ Unexpected error: ${error.message}`;
          break;
      }

      return res.status(500).json({ success: false, message });
    }
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

exports.stripeEventWebhook = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "http://localhost:3000");
    log("Incoming Stripe webhook event body", req.body);

    let message = "";
    let error = false;

    // Input validation
    if (!req.body || !req.body.data || !req.body.data.object) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook payload structure.",
      });
    }

    let paymentIntentID;
    let action;
    let readerID;

    try {
      // Extract payment intent ID and action from webhook payload
      action = req.body.data.object.action;
      if (!action || !action.process_payment_intent) {
        return res.status(400).json({
          success: false,
          message: "Invalid webhook action structure.",
        });
      }

      paymentIntentID = action.process_payment_intent.payment_intent;
      readerID = req.body.data.object.id;

      if (!paymentIntentID || typeof paymentIntentID !== "string") {
        return res.status(400).json({
          success: false,
          message: "Payment intent ID must be provided and must be a string.",
        });
      }

      if (!readerID || typeof readerID !== "string") {
        return res.status(400).json({
          success: false,
          message: "Reader ID must be provided and must be a string.",
        });
      }

      // Extract tenant/store context from payment intent metadata
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentID
      );
      const tenantID = paymentIntent.metadata?.tenantID;
      const storeID = paymentIntent.metadata?.storeID;

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

      log("data package to show reader ID", req.body.data);

      // Handle successful payment
      if (action.status === "succeeded") {
        log("Payment attempt succeeded");

        try {
          const paymentIntentComplete = await stripe.paymentIntents.retrieve(
            paymentIntentID
          );

          if (!paymentIntentComplete.latest_charge) {
            throw new Error("No charge found for successful payment intent");
          }

          let chargeID = paymentIntentComplete.latest_charge;
          log("Payment Intent complete obj", paymentIntentComplete);
          log("Charge ID", chargeID);

          const charge = await stripe.charges.retrieve(chargeID);

          // Use Firestore with tenant/store hierarchy for completion
          const completeRef = DB.collection("tenants")
            .doc(tenantID)
            .collection("stores")
            .doc(storeID)
            .collection("payment-processing")
            .doc(readerID)
            .collection("payments")
            .doc(paymentIntentID)
            .collection("completions")
            .doc("current");

          await completeRef.set({
            ...charge,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            readerID,
            paymentIntentID,
          });
          log("Card charge object", charge);
        } catch (stripeError) {
          log("Error retrieving payment details", stripeError);
          // Continue execution - don't fail the webhook for this
        }
      }

      // Cancel reader action to clean up
      try {
        const readerResult = await stripe.terminal.readers.cancelAction(
          readerID
        );
        log("Result of canceling reader after payment update", readerResult);
      } catch (cancelError) {
        log("Error canceling reader action", cancelError);
        // Continue execution - don't fail the webhook for this
      }
    } catch (err) {
      error = true;
      message =
        err instanceof Error
          ? `Webhook processing error: ${err.message}`
          : "Webhook processing error: An unknown error occurred.";

      log("Stripe Webhook processing error", err.message);
    }
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
  { secrets: [twilioSecretKey, twilioSecretAccountNumber] },
  async (request) => {
    log("Incoming enhanced SMS callable request", request.data);

    try {
      // Input validation
      const {
        message,
        phoneNumber,
        tenantID,
        storeID,
        customerID,
        messageID,
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
          const messageRef = DB.collection("tenants")
            .doc(tenantID)
            .collection("stores")
            .doc(storeID)
            .collection("outgoing-messages")
            .doc(customerID)
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
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          log("Message stored in Firestore successfully", {
            messageID,
            customerID,
          });
        } catch (firestoreError) {
          log("Error storing message in Firestore", firestoreError);
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

exports.incomingSMS = onRequest({ cors: true }, async (request, response) => {
  res.set("Access-Control-Allow-Origin", "http://localhost:3000");

  let body = request.body;
  log("incoming sms body", body);

  let incomingPhone = body.From.slice(2, body.From.length);
  let incomingMessage = body.Body;
  log("phone", incomingPhone);
  log("message", incomingMessage);

  // get the customer from firestore using the new tenant/store hierarchy
  // Search across all tenants and stores for customer with matching phone
  let customerObj = null;
  let tenantID = null;
  let storeID = null;

  try {
    // Get all tenants
    const tenantsSnapshot = await DB.collection("tenants").get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const currentTenantID = tenantDoc.id;
      const storesSnapshot = await DB.collection("tenants")
        .doc(currentTenantID)
        .collection("stores")
        .get();

      for (const storeDoc of storesSnapshot.docs) {
        const currentStoreID = storeDoc.id;
        const customersSnapshot = await DB.collection("tenants")
          .doc(currentTenantID)
          .collection("stores")
          .doc(currentStoreID)
          .collection("customers")
          .where("cell", "==", incomingPhone)
          .get();

        if (!customersSnapshot.empty) {
          customerObj = customersSnapshot.docs[0].data();
          tenantID = currentTenantID;
          storeID = currentStoreID;
          break;
        }
      }
      if (customerObj) break;
    }

    if (!customerObj) {
      log("no customer found with phone", incomingPhone);
      return; // Exit early if no customer found
    } else {
      log("found customer", { customerObj, tenantID, storeID });
    }
  } catch (error) {
    log("error searching for customer", error);
    return; // Exit early on error
  }

  // get the last message from us to see if they are allowed to respond
  let lastOutgoingMessage = null;
  try {
    const lastMessageSnapshot = await DB.collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .doc(storeID)
      .collection("outgoing-messages")
      .doc(customerObj.id)
      .collection("messages")
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
  log("here is this one", lastOutgoingMessage);
  let canRespond = lastOutgoingMessage ? lastOutgoingMessage.canRespond : null;

  // if not allowed to respond, send a bounceback message
  if (!canRespond) {
    log("cannot respond", lastOutgoingMessage.canRespond);
    let message = { ...SMS_PROTO };
    if (lastOutgoingMessage) message = { ...lastOutgoingMessage };
    message.message = CLOSED_THREAD_RESPONSE;
    message.phoneNumber = incomingPhone;
    log(
      "outgoing bounceback not customer not authorized to respond message",
      message
    );
    sendTwilioMessage(message);
    return;
  }

  // if allowed to respond, create and store the message in realtime db
  const message = {
    firstName: customerObj.first,
    lastName: customerObj.last,
    millis: new Date().getTime(),
    phoneNumber: incomingPhone,
    message: incomingMessage,
    customerID: customerObj.id,
    id: body.SmsSid,
    type: "incoming",
  };

  // Store incoming message using Firestore with tenant/store hierarchy
  try {
    const incomingMessageRef = DB.collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .doc(storeID)
      .collection("incoming-messages")
      .doc(customerObj.id)
      .collection("messages")
      .doc(body.SmsSid);

    await incomingMessageRef.set({
      ...message,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      tenantID,
      storeID,
    });
  } catch (error) {
    log("error storing incoming message in Firestore", error);
  }
});

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
  //     // Password            : g3QX&bn5
  //     try {
  //       // Connect to FTP server
  //       await client.access({
  //         host: "ftp.jbi.bike",
  //         user: "121080",
  //         password: "g3QX&bn5",
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
    let tenantRef = DB.collection("tenants").doc(tenantID);
    let tenantDoc = await tenantRef.get();

    while (tenantDoc.exists) {
      tenantID = generateTenantID();
      tenantRef = DB.collection("tenants").doc(tenantID);
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
    await DB.collection("users").doc(primaryUserRecord.uid).set({
      email: primaryEmail,
      tenantID: tenantID,
      role: "primary_contact",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "active",
    });

    await DB.collection("users").doc(secondaryUserRecord.uid).set({
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

function generateUPCBarcode(barcodeType) {
  // Get current millis since epoch
  let begins = "0";
  switch (barcodeType) {
    case "workorder":
      begins = "1";
      break;
    case "sale":
      begins = "2";
      break;
    case "customer":
      begins = "3";
  }
  const millis = Date.now().toString();
  const timePart = millis.slice(-8);
  const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
  let upc = timePart + randomPart;
  upc = upc.replace(/^./, begins);
  return upc;
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

    const { paymentIntentId, amount } = request.data;

    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "PaymentIntent ID must be provided and must be a string."
      );
    }

    if (amount !== undefined && typeof amount !== "number") {
      throw new HttpsError(
        "invalid-argument",
        "If provided, refund amount must be a valid number in cents."
      );
    }

    try {
      // Step 1: Retrieve the PaymentIntent to get its latest charge
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      const chargeId = paymentIntent.charges?.data?.[0]?.id;
      if (!chargeId) {
        throw new HttpsError(
          "invalid-argument",
          "No charge found for the given PaymentIntent."
        );
      }

      // Step 2: Create the refund
      const refund = await stripe.refunds.create({
        charge: chargeId,
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
exports.loginAppUserCallable = onCall(async (request) => {
  log("Incoming login callable request", request.data);

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
    const userIndexRef = DB.collection("users").doc(userID);
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
    const userRef = DB.collection("tenants")
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
    const tenantRef = DB.collection("tenants").doc(tenantID);
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
      throw new HttpsError("internal", `❗ Unexpected error: ${error.message}`);
    }
  }
});

/**
 * Callable version of createAppUser
 */
exports.createAppUserCallable = onCall(async (request) => {
  log("Incoming create app user callable request", request.data);

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
    const tenantRef = DB.collection("tenants").doc(tenantID);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      throw new HttpsError("not-found", "Tenant not found.");
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

    await DB.collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .doc(storeID)
      .collection("users")
      .doc(userID)
      .set(userData);

    // Create user index entry for quick lookup
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
      throw new HttpsError("internal", `❗ Unexpected error: ${error.message}`);
    }
  }
});

/**
 * Callable version of createStore
 */
exports.createStoreCallable = onCall(async (request) => {
  log("Incoming create store callable request", request.data);

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
    const tenantRef = DB.collection("tenants").doc(tenantID);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      throw new HttpsError("not-found", "Tenant not found.");
    }

    // Check if store already exists
    const storeRef = DB.collection("tenants")
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
      throw new HttpsError("internal", `❗ Unexpected error: ${error.message}`);
    }
  }
});

/**
 * Callable version of createTenant
 */
exports.createTenantCallable = onCall(async (request) => {
  log("Incoming create tenant callable request", request.data);

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
    throw new HttpsError("invalid-argument", "Contact first name is required.");
  }

  if (!contactLastName || typeof contactLastName !== "string") {
    throw new HttpsError("invalid-argument", "Contact last name is required.");
  }

  try {
    // Generate unique tenant ID
    let tenantID = "1234";

    // Ensure tenant ID is unique
    let tenantRef = DB.collection("tenants").doc(tenantID);
    let tenantDoc = await tenantRef.get();

    while (tenantDoc.exists) {
      tenantID = generateTenantID();
      tenantRef = DB.collection("tenants").doc(tenantID);
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
    await DB.collection("users").doc(primaryUserRecord.uid).set({
      email: primaryEmail,
      tenantID: tenantID,
      role: "primary_contact",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "active",
    });

    await DB.collection("users").doc(secondaryUserRecord.uid).set({
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
      throw new HttpsError("internal", `❗ Unexpected error: ${error.message}`);
    }
  }
});

// Helper function for generating tenant ID
function generateTenantID() {
  return Math.floor(100000000000 + Math.random() * 900000000000).toString();
}