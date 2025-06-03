/* eslint-disable */
const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
// var serviceAccount = require("./creds.json");
const cors = require("cors")({ origin: true });
const { serviceAccount } = require("./creds.js");
// const handlePayment = require("./payments.js");
const { databaseURL, twilioObj } = require("./creds.js");

// firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: databaseURL,
});
const RDB = admin.database();
const DB = getFirestore();

// twilio

const twilioClient = require("twilio")(
  twilioObj.twilioaccountSid,
  twilioObj.twilioauthToken
);

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
      from: twilioObj.twilioPhoneNumber,
    })
    .then((res) => {
      log("It appears that sending SMS is complete", res);
      return res;
    })
    .catch((e) => {
      log("ERROR SENDING TWILIO SMS", e);
      return e;
    });
};

exports.sendSMS = onRequest({ cors: true }, async (request, response) => {
  let body = request.body;
  log("Incoming SMS body from APP", body);

  let dbRef = RDB.ref("OUTGOING_MESSAGES/" + body.customerID);
  dbRef.update({ [body.id]: { ...body } });

  let res = await sendTwilioMessage(body);
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
