/* eslint-disable */
const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
// const ftp = require("basic-ftp");cd..
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const Stripe = require("stripe");
const { isArray } = require("lodash");
const { onInit } = require("firebase-functions/v2/core");
const creds = require("./creds.json");

var stripe;
var twilioClient;

admin.initializeApp({
  credential: admin.credential.cert(creds),
  databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com/",
});

const RDB = admin.database();
const DB = getFirestore();
const stripeSecretKey = defineSecret("stripeSecretKey");
const twilioSecretKey = defineSecret("twilioSecretKey");
const twilioSecretAccountNumber = defineSecret("twilioSecretAccountNum");

// initialization
onInit(async () => {
  stripe = Stripe(stripeSecretKey.value()); // Stripe secret key
  // try {
  //   twilioClient = require("twilio")(
  //     twilioSecretAccountNumber,
  //     twilioSecretKey
  //   );
  // } catch (e) {
  //   log("error fetching Twilio client", e);
  // }
});

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
  let str = "[MY LOG ========>] ";

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
//   }
// );
