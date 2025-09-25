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
const creds = require("./creds.json");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp({
  credential: admin.credential.cert(creds),
  databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com/",
});
const RDB = admin.database();
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

      // Update database with action data
      let dbRef = RDB.ref(
        "PAYMENT-PROCESSING/" + readerID + "/" + paymentIntentID + "/update/"
      );
      await dbRef.set(action);

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
          dbRef = RDB.ref(
            "PAYMENT-PROCESSING/" + paymentIntentID + "/complete/"
          );
          await dbRef.set(charge);
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
const sendTwilioMessage = (messageObj) => {
  return twilioClient.messages
    .create({
      body: messageObj.message,
      to: "+1" + messageObj.phoneNumber,
      from: "+12393171234",
    })
    .then((res) => {
      log("It appears that sending SMS is complete", res);
      return res;
    })
    .catch((e) => {
      log("ERROR SENDING TWILIO SMS", e);
      return null;
    });
};

exports.sendSMS = onRequest({ cors: true }, async (request, response) => {
  res.set("Access-Control-Allow-Origin", "http://localhost:3000");

  let body = request.body;
  log("Incoming SMS body from APP", body);

  let res = await sendTwilioMessage(body);
  let dbRef = RDB.ref("OUTGOING_MESSAGES/" + body.customerID);
  if (res.status != 400) dbRef.update({ [body.id]: { ...body } });

  sendSuccessfulResult(response, res);
});

exports.incomingSMS = onRequest({ cors: true }, async (request, response) => {
  res.set("Access-Control-Allow-Origin", "http://localhost:3000");

  let body = request.body;
  log("incoming sms body", body);

  let incomingPhone = body.From.slice(2, body.From.length);
  let incomingMessage = body.Body;
  log("phone", incomingPhone);
  log("message", incomingMessage);

  // get the customer from firestore
  let customerRef = DB.collection("CUSTOMERS");
  let snapshot = await customerRef.where("cell", "==", incomingPhone).get();
  let customerObj;
  if (!snapshot | snapshot.empty) {
    log("no customer snapshot found", snapshot);
  } else {
    let arr = [];
    snapshot.forEach((snap) => arr.push(snap.data()));
    log("here is the arrary", arr);
    customerObj = arr[0];
  }
  log("here is the customer obj", customerObj);

  let lastOutgoingMessage;
  if (customerObj) {
    // get the last message from us to see if they are allowed to respond
    lastOutgoingMessageObj = await RDB.ref(
      "OUTGOING_MESSAGES/" + customerObj.id
    )
      .orderByChild("millis")
      .limitToLast(1)
      .once("value")
      .then((snap) => {
        return snap.val();
      });

    lastOutgoingMessage = lastOutgoingMessageObj
      ? Object.values(lastOutgoingMessageObj)[0]
      : null;
    log("last outgoing message", lastOutgoingMessage);
  }
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

  let dbRef = RDB.ref("INCOMING_MESSAGES/" + customerObj.id);
  dbRef.update({ [body.SmsSid]: { ...message } });
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