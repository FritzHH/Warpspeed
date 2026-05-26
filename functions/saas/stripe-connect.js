/* eslint-disable */
// Stripe Connect Express helpers.
//
// Thin wrappers around the Stripe SDK that own the platform-side Connect
// API surface: create connected accounts, generate account links, fetch
// account state. Callable functions in stripe-connect-callables.js do the
// auth checks and Firestore writes; this module stays I/O-only against
// Stripe.
const Stripe = require("stripe");

let _client = null;

function getClient(secret) {
  if (_client) return _client;
  const key = (secret && secret.value && secret.value()) || process.env.STRIPE_PLATFORM_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_PLATFORM_SECRET_KEY is not configured. Set it via " +
        "`firebase functions:secrets:set STRIPE_PLATFORM_SECRET_KEY --project=cadence-pos`."
    );
  }
  _client = new Stripe(key);
  return _client;
}

async function createConnectedAccount(secret, { email, businessName }) {
  const stripe = getClient(secret);
  const payload = {
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  };
  if (businessName) {
    payload.business_profile = { name: businessName };
  }
  return stripe.accounts.create(payload);
}

async function createAccountLink(secret, { accountID, returnURL, refreshURL }) {
  const stripe = getClient(secret);
  return stripe.accountLinks.create({
    account: accountID,
    refresh_url: refreshURL,
    return_url: returnURL,
    type: "account_onboarding",
  });
}

async function retrieveAccount(secret, accountID) {
  const stripe = getClient(secret);
  return stripe.accounts.retrieve(accountID);
}

module.exports = {
  createConnectedAccount,
  createAccountLink,
  retrieveAccount,
};
