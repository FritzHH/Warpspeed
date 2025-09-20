/* eslint-disable */
export const firebaseConfig = {
  apiKey: "AIzaSyCUjRH7Yi9fNNDAUTyYzD-P-tUGGMvfPPM",
  authDomain: "warpspeed-bonitabikes.firebaseapp.com",
  databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com",
  projectId: "warpspeed-bonitabikes",
  storageBucket: "warpspeed-bonitabikes.firebasestorage.app",
  messagingSenderId: "357992532514",
  appId: "1:357992532514:web:dc7d8f6408ea96ea72187b",
  measurementId: "G-HE8GCTBEEK",
};

// firebase functions URL
export const SMS_URL =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/sendSMS";

export const STRIPE_CONNECTION_TOKEN_FIREBASE_URL =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/createStripeConnectionToken";

export const STRIPE_INITIATE_PAYMENT_INTENT_URL =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/initiatePaymentIntent";

export const STRIPE_CANCEL_PAYMENT_INTENT_URL =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/cancelServerDrivenStripePayment";

export const STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/getAvailableStripeReaders";
