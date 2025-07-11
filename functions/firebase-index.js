/* eslint-disable */
const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./creds.json");
const Stripe = require("stripe");

// firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com/",
});
const RDB = admin.database();
const DB = getFirestore();

// twilio
const twilioClient = require("twilio")(
  "AC8a368bba2aac361fb084b3e117069d62",
  "1a405e19658914851cb3ac6f96863f9f"
);

// Stripe
const stripe = Stripe("sk_test_..."); // Replace with your Stripe secret key

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

exports.connectionToken = onRequest({ cors: true }, async (req, res) => {
  try {
    const connectionToken = await stripe.terminal.connectionTokens.create();
    res.json({ secret: connectionToken.secret });
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

// Create a PaymentIntent for in-person payments
exports.createPaymentIntent = onRequest({ cors: true }, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_types: ["card_present"],
      capture_method: "manual",
    });
    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

// Capture a PaymentIntent after collecting payment
exports.capturePaymentIntent = onRequest({ cors: true }, async (req, res) => {
  try {
    const { payment_intent_id } = req.body;
    const paymentIntent = await stripe.paymentIntents.capture(
      payment_intent_id
    );
    res.json(paymentIntent);
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

// exports.capturePaymentIntent = onRequest((req, res) => {});

exports.sendSMS = onRequest({ cors: true }, async (request, response) => {
  let body = request.body;
  log("Incoming SMS body from APP", body);

  let res = await sendTwilioMessage(body);
  let dbRef = RDB.ref("OUTGOING_MESSAGES/" + body.customerID);
  if (res.status != 400) dbRef.update({ [body.id]: { ...body } });

  sendResult(response, res);
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

const sendResult = (response, body) =>
  response.status(200).send(JSON.stringify(body));
