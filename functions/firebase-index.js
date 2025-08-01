/* eslint-disable */
const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
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
exports.processServerDrivenStripePayment = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    log("Incoming process Stripe server-driven payment", req.body);
    let readerResult = await stripe.terminal.readers.retrieve(
      req.body.readerID
    );
    log("Requested card reader object", readerResult);
    if (req.body.warmUp) {
      log("warming up!");
      try {
        sendSuccessfulResult(res, readerResult);
      } catch (e) {
        log("Error warming up card reader", e);
      }
      return;
    }

    // check to see if reader is in use
    if (readerResult?.action?.status) {
      sendSuccessfulResult(res, readerResult.action.status);
      return;
    }
    try {
      let paymentIntent;
      let paymentIntentID;

      // check to see if we are reusing an old payment attempt
      if (!req.body.paymentIntentID) {
        // we are not
        log("Getting a new payment intent");
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(Number(req.body.amount) * 100),
          payment_method_types: ["card_present", "card", "link"],
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
        log("Recycling the previous payment intent!");
        paymentIntentID = req.body.paymentIntentID;
      }
      var attempt = 0;
      const tries = 3;
      log("Payment intent ID being used", paymentIntentID);
      while (true) {
        attempt++;
        try {
          readerResult = await stripe.terminal.readers.processPaymentIntent(
            req.body.readerID,
            {
              payment_intent: paymentIntentID,
            }
          );
          log("Stripe server-driven payment process complete!", readerResult);
          if (!req.body.paymentIntentID) {
            let ref = RDB.ref("PAYMENT_PROCESSING/" + paymentIntentID);
            ref.set({ paymentIntent: paymentIntent, updates: [] });
          }
          return sendSuccessfulResult(res, {
            readerResult,
            paymentIntentID,
          });
        } catch (error) {
          log("Stripe server-driven payment process ERROR ERROR ERROR!", error);
          if (attempt == tries) {
            sendSuccessfulResult(res, error);
            return;
          }
          if (error.code != "terminal_reader_timeout") {
            sendSuccessfulResult(res, error);
            return;
          }
        }
      }
    } catch (error) {
      log("stripe server driven payment attempt error", error.message);
      return sendUnsuccessfulResult(res, error);
    }
  }
);

exports.cancelServerDrivenStripePayment = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    log("Incoming cancel Stripe payment cancellation body", req.body);
    const readerResult = await stripe.terminal.readers.cancelAction(
      req.body.readerID
    );
    stripe.paymentIntents.cancel(req.body.paymentIntentID);
    let ref = RDB.ref("PAYMENT_PROCESSING/" + req.body.paymentIntentID);
    ref.set(null);
    log("reader cancellation result", readerResult);
    sendSuccessfulResult(res, readerResult);
  }
);

exports.refundStripePayment = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    log("Incoming refund Stripe payment", req.body);
    const refund = await stripe.refunds.create({
      payment_intent: req.body.paymentIntentID,
      amount: req.body.amount,
    });
    sendSuccessfulResult(res, readerResult);
  }
);

exports.getAvailableStripeReaders = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    log("Incoming get available Stripe readers body", req.body);
    const readers = await stripe.terminal.readers.list({
      limit: 3,
    });
    log("available Stripe readers", readers);
    sendSuccessfulResult(res, readers);
  }
);

exports.stripeEventWebhook = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (req, res) => {
    log("Incoming Stripe webhook event body", req.body);
    let paymentIntentID =
      req.body.data.object.action.process_payment_intent.payment_intent;
    log("payment intent id", paymentIntentID);

    let action = req.body.data.object.action;
    action.randomVal = Math.random();

    let dbRef = RDB.ref("PAYMENT_PROCESSING/" + paymentIntentID + "/update");
    dbRef.set(action);

    log("data package to show reader ID", req.body.data);
    if (action.status == "succeeded") {
      log("Payment attempt succeeded");
      const paymentIntentComplete = await stripe.paymentIntents.retrieve(
        paymentIntentID
      );
      let chargeID = paymentIntentComplete.latest_charge;
      log("Payment Intent complete obj", paymentIntentComplete);
      log("Charge ID", chargeID);
      const charge = await stripe.charges.retrieve(chargeID);
      dbRef = RDB.ref("PAYMENT_PROCESSING/" + paymentIntentID + "/complete");
      dbRef.set(charge);
      log("Card charge object", charge);
    }

    const readerResult = await stripe.terminal.readers.cancelAction(
      req.body.data.object.id
    );
    log(
      "Result of canceling reader after a card was declined or payment approved or any other update just to be safe",
      readerResult
    );
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
  let body = request.body;
  log("Incoming SMS body from APP", body);

  let res = await sendTwilioMessage(body);
  let dbRef = RDB.ref("OUTGOING_MESSAGES/" + body.customerID);
  if (res.status != 400) dbRef.update({ [body.id]: { ...body } });

  sendSuccessfulResult(response, res);
});

exports.incomingSMS = onRequest({ cors: true }, async (request, response) => {
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
// client driven (old)
// exports.createPaymentIntent = onRequest({ cors: true }, async (req, res) => {
//   log("payment intent request body", req.body);
//   let body = req.body;
//   try {
//     const paymentIntent = await stripe.paymentIntents.create({
//       amount: Number(body.amount) * 100,
//       payment_method_types: ["card_present", "card", "link"],
//       capture_method: req.body.captureMethod || "automatic",
//       currency: "usd",
//     });
//     res.status(200).send(paymentIntent);
//   } catch (error) {
//     log("stripe error", error.message);
//     res.status(500).send({ error: error.message });
//   }
// });

// exports.createRefund = onRequest({ cors: true }, async (req, res) => {
//   log("creating refund");
//   try {
//     const refund = await stripe.refunds.create({
//       payment_intent: req.body.paymentIntent,
//       amount: Number(req.body.amount),
//     });
//     log("refund successful", refund);
//     res.status(200).send(refund);
//   } catch (e) {
//     res.status(500).send({ error: e.message });
//   }
// });

// exports.getActivePaymentIntents = onRequest(
//   { cors: true },
//   async (req, res) => {
//     log("getting active payment intents");
//     try {
//       let paymentIntents = await stripe.paymentIntents.list();
//       res.status(200).send(paymentIntents);
//     } catch (error) {
//       log("stripe error", error.message);
//       res.status(500).send({ error: error.message });
//     }
//   }
// );

// exports.cancelCardReaderAction = onRequest({ cors: true }, async (req, res) => {
//   try {
//     res = await stripe.terminal.readers.cancelAction(req.body.reader);
//     log("Result canceling card reader action", res);
//     res.status(200).send("Server says finished canceling card reader action!");
//   } catch (e) {
//     log("Error canceling card reader action", e);
//     res
//       .status(500)
//       .send("Server says error canceling card reader action: " + e.message);
//   }
// });

// exports.cancelPaymentIntent = onRequest({ cors: true }, async (req, res) => {
//   try {
//     let intentList = req.body.intentList;
//     if (intentList && isArray(intentList)) {
//       log("canceling these payment intents from APP", intentList);
//       intentList.forEach(async (intentSecret) => {
//         await stripe.paymentIntents.cancel(intentSecret);
//       });
//     } else {
//       log("getting all active payment intents to cancel");
//       let paymentIntents = await stripe.paymentIntents.list();
//       log("payment intents", paymentIntents);
//       // paymentIntents = await paymentIntents;
//       paymentIntents.data.forEach(async (intent) => {
//         log("intent to cancel", intent.id);
//         try {
//           let res = await stripe.paymentIntents.cancel(intent.id);
//           log("Result canceling payment intent", res);
//         } catch (e) {
//           log("Error canceling payment intent", e);
//         }
//       });
//     }
//     res.status(200).send("finished canceling intents");
//   } catch (error) {
//     log("stripe error", error.message);
//     res.status(500).send({ error: error.message });
//   }
// });

// exports.createStripeConnectionToken = onRequest(
//   { cors: true },
//   async (req, res) => {
//     try {
//       const connectionToken = await stripe.terminal.connectionTokens.create();
//       res.status(200).send(connectionToken);
//     } catch (e) {
//       log("stripe error", error.message);
//       res.status(500).send({ error: error.message });
//     }
//   }
// );
