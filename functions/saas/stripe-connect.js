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

function resolveKey(secret) {
  return (
    (secret && secret.value && secret.value()) ||
    process.env.STRIPE_PLATFORM_SECRET_KEY ||
    ""
  );
}

function getClient(secret) {
  if (_client) return _client;
  const key = resolveKey(secret);
  if (!key) {
    throw new Error(
      "STRIPE_PLATFORM_SECRET_KEY is not configured. Set it via " +
        "`firebase functions:secrets:set STRIPE_PLATFORM_SECRET_KEY --project=cadence-pos`."
    );
  }
  _client = new Stripe(key);
  return _client;
}

// Hard guard: full-bake test data is permitted only against a Stripe test key.
// We refuse to spoof TOS / SSN / bank account against a live key under any
// circumstance, even if the caller asks for it.
function assertTestModeKey(secret) {
  const key = resolveKey(secret);
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "Refusing full-bake test data: STRIPE_PLATFORM_SECRET_KEY is not a test " +
        "key (sk_test_...). Full-bake is only allowed in Stripe test mode."
    );
  }
}

async function createConnectedAccount(secret, {
  email,
  businessName,
  businessType,
  mcc,
  companyPhone,
  companyAddress,
  country,
  fullBakeForTest = false,
}) {
  if (fullBakeForTest) assertTestModeKey(secret);
  const stripe = getClient(secret);
  const normalizedCountry = (country || "US").toUpperCase();
  const payload = {
    type: "express",
    email,
    country: normalizedCountry,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  };
  if (businessType) {
    payload.business_type = businessType;
  }
  const businessProfile = {};
  if (businessName) businessProfile.name = businessName;
  if (mcc) businessProfile.mcc = mcc;
  if (fullBakeForTest) businessProfile.url = "https://example.com";
  if (Object.keys(businessProfile).length > 0) {
    payload.business_profile = businessProfile;
  }
  if (businessType === "company") {
    const company = {};
    if (businessName) company.name = businessName;
    if (companyPhone) company.phone = companyPhone;
    if (companyAddress) company.address = companyAddress;
    if (fullBakeForTest) {
      company.tax_id = "000000000";
      company.owners_provided = true;
      company.directors_provided = true;
      company.executives_provided = true;
    }
    if (Object.keys(company).length > 0) {
      payload.company = company;
    }
  }
  if (fullBakeForTest) {
    payload.tos_acceptance = {
      date: Math.floor(Date.now() / 1000),
      ip: "127.0.0.1",
      user_agent: "cadence-platform/full-bake",
    };
    if (normalizedCountry === "CA") {
      payload.external_account = {
        object: "bank_account",
        country: "ca",
        currency: "cad",
        transit_number: "11000",
        institution_number: "000",
        account_number: "000123456789",
        account_holder_name: businessName || "Test Account",
        account_holder_type: businessType === "company" ? "company" : "individual",
      };
    } else {
      payload.external_account = {
        object: "bank_account",
        country: "us",
        currency: "usd",
        routing_number: "110000000",
        account_number: "000123456789",
        account_holder_name: businessName || "Test Account",
        account_holder_type: businessType === "company" ? "company" : "individual",
      };
    }
  }
  return stripe.accounts.create(payload);
}

async function createRepresentativePerson(secret, accountID, {
  firstName,
  lastName,
  email,
  phone,
  address,
  fullBakeForTest = false,
}) {
  if (fullBakeForTest) assertTestModeKey(secret);
  const stripe = getClient(secret);
  const payload = {
    relationship: fullBakeForTest
      ? {
          representative: true,
          director: true,
          executive: true,
          owner: true,
          percent_ownership: 100,
          title: "Owner",
        }
      : { representative: true, title: "Owner" },
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    address,
  };
  if (fullBakeForTest) {
    payload.dob = { day: 1, month: 1, year: 1901 };
    payload.ssn_last_4 = "0000";
    payload.id_number = "000000000";
  }
  return stripe.accounts.createPerson(accountID, payload);
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

async function deleteConnectedAccount(secret, accountID) {
  const stripe = getClient(secret);
  return stripe.accounts.del(accountID);
}

// Set the connected account's business website URL on business_profile.url.
// Stripe Connect Express requires this for card_payments capability to leave
// "pending" / "Restricted" status.
async function updateBusinessUrl(secret, accountID, businessUrl) {
  const stripe = getClient(secret);
  return stripe.accounts.update(accountID, {
    business_profile: { url: businessUrl },
  });
}

// Attach a US bank account for payouts. Stripe accepts raw routing/account
// numbers on this endpoint; tokenization via Stripe.js is also supported for
// hardening client-side. For now we pass the digits directly from the
// onboarding form to the platform server to the Stripe API.
async function addBankAccount(secret, accountID, {
  routingNumber,
  accountNumber,
  accountHolderName,
  accountHolderType,
}) {
  const stripe = getClient(secret);
  return stripe.accounts.createExternalAccount(accountID, {
    external_account: {
      object: "bank_account",
      country: "us",
      currency: "usd",
      routing_number: routingNumber,
      account_number: accountNumber,
      account_holder_name: accountHolderName,
      account_holder_type: accountHolderType || "individual",
    },
  });
}

// Patch the representative person with DOB + SSN last 4 + TOS acceptance.
// `personID` is the Stripe person ID returned by createRepresentativePerson;
// caller must look it up (via listPersons) before invoking this. We also push
// `tos_acceptance` on the account itself since the representative gating
// fields aren't enough on their own — Stripe needs an explicit TOS stamp.
async function updateRepresentativeKYC(secret, accountID, personID, {
  dob,
  ssnLast4,
  tosIp,
}) {
  const stripe = getClient(secret);
  const updates = [];
  const personPayload = {};
  if (dob) personPayload.dob = dob;
  if (ssnLast4) personPayload.ssn_last_4 = ssnLast4;
  if (Object.keys(personPayload).length > 0) {
    updates.push(stripe.accounts.updatePerson(accountID, personID, personPayload));
  }
  if (tosIp) {
    updates.push(
      stripe.accounts.update(accountID, {
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: tosIp,
          user_agent: "cadence-platform/owner-bootstrap",
        },
      })
    );
  }
  return Promise.all(updates);
}

// Find the representative person on the connected account. Returns the first
// person whose relationship.representative === true, or null. Used by the
// bootstrap callable so it can patch DOB / SSN onto the right person record
// without the caller having to remember the personID from creation.
async function findRepresentativePerson(secret, accountID) {
  const stripe = getClient(secret);
  const list = await stripe.accounts.listPersons(accountID, {
    relationship: { representative: true },
    limit: 1,
  });
  return (list.data && list.data[0]) || null;
}

module.exports = {
  createConnectedAccount,
  createRepresentativePerson,
  createAccountLink,
  retrieveAccount,
  deleteConnectedAccount,
  updateBusinessUrl,
  addBankAccount,
  updateRepresentativeKYC,
  findRepresentativePerson,
};
