/* eslint-disable */
// Phase 6 — Terminal location + reader registration callables (Stripe Connect).
//
// Three callables for tenant admins to provision Terminal hardware on their
// connected account:
//
//   - stripeConnectCreateTerminalLocationCallable
//       Creates a `terminal.Location` on the connected account and writes
//       the resulting `tml_xxx` into `tenants/{tenantID}/stores/{storeID}/
//       connect-config/config` so future reader registrations can look it
//       up without re-asking the user.
//
//   - stripeConnectRegisterReaderCallable
//       Pairs a physical reader using its registration code. Looks up the
//       store's `terminalLocationID` from connect-config (or accepts one
//       passed in) and calls `stripe.terminal.readers.create`. Writes the
//       resulting `tmr_xxx` to `tenants/{tenantID}/stores/{storeID}/
//       readers/{readerID}`.
//
//   - stripeConnectListReadersCallable
//       Lists all readers on the connected account (optionally filtered to
//       a single location). Useful for the admin UI to render the current
//       hardware roster + status.
//
// All three follow the Phase 3/5 pattern: `connectAccountID` is a required
// request param (no auto-resolution from the auth token yet — that lands
// when store-level config is fully wired in Phase 7).
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");
const { assertTenantMatch, lookupTenantForConnectAccount } = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

function getStripe() {
  return new Stripe(STRIPE_PLATFORM_SECRET_KEY.value());
}

function connectConfigRef(db, tenantID, storeID) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .doc(storeID)
    .collection("connect-config")
    .doc("config");
}

function readerRef(db, tenantID, storeID, readerID) {
  return db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .doc(storeID)
    .collection("readers")
    .doc(readerID);
}

function readerSummary(reader) {
  return {
    stripeReaderID: reader.id,
    locationID: reader.location || null,
    label: reader.label || null,
    serialNumber: reader.serial_number || null,
    deviceType: reader.device_type || null,
    deviceSwVersion: reader.device_sw_version || null,
    status: reader.status || null,
    livemode: reader.livemode === true,
    ipAddress: reader.ip_address || null,
  };
}

exports.stripeConnectCreateTerminalLocationCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const {
      connectAccountID,
      tenantID,
      storeID,
      displayName,
      address,
    } = request.data || {};

    if (!connectAccountID || typeof connectAccountID !== "string") {
      throw new HttpsError("invalid-argument", "connectAccountID is required.");
    }
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required.");
    }
    assertTenantMatch(auth, tenantID);
    if (!displayName || typeof displayName !== "string") {
      throw new HttpsError("invalid-argument", "displayName is required.");
    }
    if (!address || typeof address !== "object") {
      throw new HttpsError("invalid-argument", "address is required.");
    }
    const { line1, postal_code, city, state, country } = address;
    if (!line1 || !postal_code || !city || !state || !country) {
      throw new HttpsError(
        "invalid-argument",
        "address must include line1, postal_code, city, state, and country."
      );
    }

    logger.info("stripeConnectCreateTerminalLocationCallable: starting", {
      connectAccountID,
      tenantID,
      storeID,
      displayName,
      uid: auth.uid,
    });

    const stripe = getStripe();
    const stripeOpts = { stripeAccount: connectAccountID };

    let location;
    try {
      location = await stripe.terminal.locations.create(
        {
          display_name: displayName,
          address: {
            line1,
            line2: address.line2 || undefined,
            postal_code,
            city,
            state,
            country,
          },
        },
        stripeOpts
      );
    } catch (err) {
      logger.error("stripeConnectCreateTerminalLocationCallable: stripe create failed", {
        connectAccountID,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Location create failed.");
    }

    const db = getFirestore();
    await connectConfigRef(db, tenantID, storeID).set(
      {
        connectAccountID,
        terminalLocationID: location.id,
        terminalLocationDisplayName: location.display_name || displayName,
        terminalLocationAddress: location.address || address,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUID: auth.uid,
      },
      { merge: true }
    );

    logger.info("stripeConnectCreateTerminalLocationCallable: created", {
      terminalLocationID: location.id,
      tenantID,
      storeID,
    });

    return {
      success: true,
      terminalLocationID: location.id,
      displayName: location.display_name,
      address: location.address,
    };
  }
);

exports.stripeConnectRegisterReaderCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const {
      connectAccountID,
      tenantID,
      storeID,
      registrationCode,
      label,
      terminalLocationID,
    } = request.data || {};

    if (!connectAccountID || typeof connectAccountID !== "string") {
      throw new HttpsError("invalid-argument", "connectAccountID is required.");
    }
    if (!tenantID || !storeID) {
      throw new HttpsError("invalid-argument", "tenantID and storeID are required.");
    }
    assertTenantMatch(auth, tenantID);
    if (!registrationCode || typeof registrationCode !== "string") {
      throw new HttpsError("invalid-argument", "registrationCode is required.");
    }

    const db = getFirestore();

    // Resolve the location: explicit param wins, otherwise read from store
    // config. If neither is present, the caller needs to create a location
    // first via stripeConnectCreateTerminalLocationCallable.
    let locationID = terminalLocationID || null;
    if (!locationID) {
      const cfgSnap = await connectConfigRef(db, tenantID, storeID).get();
      if (cfgSnap.exists) {
        locationID = (cfgSnap.data() || {}).terminalLocationID || null;
      }
    }
    if (!locationID) {
      throw new HttpsError(
        "failed-precondition",
        "Store has no Terminal location. Create one first via stripeConnectCreateTerminalLocationCallable."
      );
    }

    logger.info("stripeConnectRegisterReaderCallable: starting", {
      connectAccountID,
      tenantID,
      storeID,
      locationID,
      label: label || null,
      uid: auth.uid,
    });

    const stripe = getStripe();
    const stripeOpts = { stripeAccount: connectAccountID };

    let reader;
    try {
      const params = {
        registration_code: registrationCode,
        location: locationID,
      };
      if (label) params.label = label;
      reader = await stripe.terminal.readers.create(params, stripeOpts);
    } catch (err) {
      logger.error("stripeConnectRegisterReaderCallable: stripe create failed", {
        connectAccountID,
        locationID,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Reader registration failed.");
    }

    const summary = readerSummary(reader);
    await readerRef(db, tenantID, storeID, reader.id).set(
      {
        ...summary,
        connectAccountID,
        tenantID,
        storeID,
        registeredAt: FieldValue.serverTimestamp(),
        registeredByUID: auth.uid,
      },
      { merge: true }
    );

    logger.info("stripeConnectRegisterReaderCallable: reader registered", {
      stripeReaderID: reader.id,
      locationID,
      tenantID,
      storeID,
    });

    return {
      success: true,
      reader: summary,
    };
  }
);

exports.stripeConnectListReadersCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);

    const {
      connectAccountID,
      terminalLocationID,
      status,
      limit,
    } = request.data || {};

    if (!connectAccountID || typeof connectAccountID !== "string") {
      throw new HttpsError("invalid-argument", "connectAccountID is required.");
    }
    const ownerTenantID = await lookupTenantForConnectAccount(connectAccountID);
    assertTenantMatch(auth, ownerTenantID);

    const stripe = getStripe();
    const stripeOpts = { stripeAccount: connectAccountID };

    const params = {};
    if (terminalLocationID) params.location = terminalLocationID;
    if (status) params.status = status;
    if (limit && typeof limit === "number") params.limit = Math.min(limit, 100);

    let listed;
    try {
      listed = await stripe.terminal.readers.list(params, stripeOpts);
    } catch (err) {
      logger.error("stripeConnectListReadersCallable: stripe list failed", {
        connectAccountID,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Reader list failed.");
    }

    const readers = (listed.data || []).map(readerSummary);

    return {
      success: true,
      readers,
      hasMore: listed.has_more === true,
    };
  }
);
