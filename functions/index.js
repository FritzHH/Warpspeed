import Stripe from "stripe";
let stripe = "";
//  stripe = new Stripe(
//   "sk_test_51RIH80Ri7F2zMZJPOt5QqWfKdVKIvpbP7yFrEUHEVDgrOV4WnFioBsE8OJL8tNQ9yvTlqsmb8lT7g0fc5089Z8d100ZNNhspEb",
//   {
//     // apiVersion: "2025-03-31.basil",
//   }
// );

import { onRequest } from "firebase-functions/https";
import * as functions from "firebase-functions";
import { log } from "firebase-functions/logger";

function logg(one, two) {
  let str = "[MY LOG] ";
  if (one) {
    str += one;
  }
  if (two) {
    str += "  :  ";
    str += two;
  } else {
    // str = "log: " + str;
  }
  log.info(str);
}

export const t1 = functions.https.onRequest(
  { cors: true },
  async (req, res) => {
    log("creating request");
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "test product name",
            },
            unit_amount: 2000,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      ui_mode: "embedded",
      // The URL of your payment completion page
      return_url: "https://example.com/return?session_id={CHECKOUT_SESSION_ID}",
    });
    log("session", session);
    res.json(session);
    //   res.send(JSON.stringify("Hello from Firebase broooooo!"));
  }
);

// export const createSession = onRequest(async (req, res) => {
//   log("creating request");
//   const session = await stripe.checkout.sessions.create({
//     line_items: [
//       {
//         price_data: {
//           currency: "usd",
//           product_data: {
//             name: "test product name",
//           },
//           unit_amount: 2000,
//         },
//         quantity: 1,
//       },
//     ],
//     mode: "payment",
//     ui_mode: "custom",
//     // The URL of your payment completion page
//     return_url: "https://example.com/return?session_id={CHECKOUT_SESSION_ID}",
//   });
//   log("session", session);
//   res.json({ checkoutSessionClientSecret: session.client_secret });
// });
