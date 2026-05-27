/* eslint-disable */
// Phase 2 — Twilio number lifecycle (purchase / port-in / release / transfer).
//
// All operations run under the tenant's subaccount, so numbers are owned and
// billed by the right entity. The top-level `twilio-number-routing` index is
// the single source of truth for "what tenant/store owns this E.164" — the
// inbound webhook (Phase 3) reads it on every message.
//
// Atomicity rule: routing doc + per-store doc are written in the same
// Firestore batch. Anything that splits them risks orphaned numbers or
// silent message drops.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const common = require("./twilio-common");
const { assertPlatformAdmin } = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  INBOUND_WEBHOOK_URL,
  STATUS_CALLBACK_URL,
  CURRENT_WEBHOOK_CONFIG,
  numberWebhooksAreCurrent,
  requireAuth,
  requireTenantMemberWithLevel,
  storeNumberDocRef,
  routingDocRef,
  writeAuditEvent,
  getTenantTwilioClient,
} = common;

const NUMBER_FUNCTION_OPTS = {
  region: "us-central1",
  secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
};

// Max candidates returned by search. Twilio caps at 30; we cap at 20 by
// default to keep the result list scannable in the UI.
const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LIMIT = 30;

// Shared body for both purchase callables. Takes a SPECIFIC phoneNumber that
// has already been resolved (either by the tenant-admin callable's first-
// match search, or by the platform-admin's explicit pick from search
// results). Performs the Twilio purchase + Firestore batch (store doc +
// routing doc) + audit event. Caller owns auth gating.
async function purchaseNumberInternal({
  tenantID,
  storeID,
  phoneNumber,
  actorUID,
  actorKind,
}) {
  const client = await getTenantTwilioClient(tenantID);

  const purchase = await client.incomingPhoneNumbers.create({
    phoneNumber,
    friendlyName: `tenant-${tenantID}-store-${storeID}`,
    ...CURRENT_WEBHOOK_CONFIG,
  });

  const db = getFirestore();
  const batch = db.batch();

  const storeRef = storeNumberDocRef(db, tenantID, storeID, purchase.sid);
  batch.set(storeRef, {
    phoneNumber: purchase.phoneNumber,
    phoneNumberSid: purchase.sid,
    capabilities: {
      sms: purchase.capabilities && purchase.capabilities.sms === true,
      mms: purchase.capabilities && purchase.capabilities.mms === true,
      voice: purchase.capabilities && purchase.capabilities.voice === true,
    },
    friendlyName: purchase.friendlyName,
    source: "purchased",
    portStatus: null,
    assignedAt: FieldValue.serverTimestamp(),
    assignedByUID: actorUID,
    webhooks: {
      smsUrl: CURRENT_WEBHOOK_CONFIG.smsUrl,
      statusCallback: CURRENT_WEBHOOK_CONFIG.statusCallback,
      voiceUrl: CURRENT_WEBHOOK_CONFIG.voiceUrl,
      configuredAt: FieldValue.serverTimestamp(),
    },
  });

  const routingRef = routingDocRef(db, purchase.phoneNumber);
  const subaccountSnap = await db
    .collection("tenants")
    .doc(tenantID)
    .collection("private")
    .doc("twilio")
    .get();
  const subaccountSid =
    subaccountSnap.exists && subaccountSnap.data().subaccountSid;
  batch.set(routingRef, {
    tenantID,
    storeID,
    subaccountSid: subaccountSid || null,
    phoneNumberSid: purchase.sid,
    status: "active",
    assignedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  await writeAuditEvent(db, tenantID, {
    type: "number-purchased",
    phoneNumber: purchase.phoneNumber,
    phoneNumberSid: purchase.sid,
    storeID,
    actorUID,
    actorKind,
  });

  logger.info("purchaseNumberInternal: purchased", {
    tenantID,
    storeID,
    phoneNumber: purchase.phoneNumber,
    phoneNumberSid: purchase.sid,
    actorKind,
  });

  return {
    phoneNumber: purchase.phoneNumber,
    phoneNumberSid: purchase.sid,
    capabilities: purchase.capabilities,
  };
}

// Reapplies CURRENT_WEBHOOK_CONFIG to a single number and stamps the per-
// store doc's `webhooks` block. Idempotent: Twilio's .update() accepts the
// same values repeatedly. Used by the bulk-configure callable below; also
// available for future single-number backfill callers.
//
// Returns one of:
//   { ok: true, alreadyCurrent: true, phoneNumber }
//   { ok: true, phoneNumber }
//   throws on hard Twilio/Firestore failure.
async function configureNumberWebhooksInternal({
  db,
  subaccountClient,
  perNumberRef,
  perNumberData,
}) {
  const phoneNumberSid = perNumberRef.id;
  const phoneNumber = (perNumberData || {}).phoneNumber || null;

  if (numberWebhooksAreCurrent((perNumberData || {}).webhooks)) {
    return { ok: true, alreadyCurrent: true, phoneNumber };
  }

  await subaccountClient
    .incomingPhoneNumbers(phoneNumberSid)
    .update(CURRENT_WEBHOOK_CONFIG);

  await perNumberRef.set(
    {
      webhooks: {
        smsUrl: CURRENT_WEBHOOK_CONFIG.smsUrl,
        statusCallback: CURRENT_WEBHOOK_CONFIG.statusCallback,
        voiceUrl: CURRENT_WEBHOOK_CONFIG.voiceUrl,
        configuredAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  return { ok: true, phoneNumber };
}

// ─────────────────────────────────────────────────────────────────────────
// purchaseTwilioNumber — tenant-admin variant. Searches by areaCode, picks
// the first match, then delegates to the shared helper. Preserves the
// existing auto-pick-first behavior for whenever tenant self-serve UI ships.
// ─────────────────────────────────────────────────────────────────────────
exports.purchaseTwilioNumber = onCall(NUMBER_FUNCTION_OPTS, async (request) => {
  const auth = requireAuth(request);

  const { tenantID, storeID, areaCode, capabilities } = request.data || {};
  if (!tenantID || !storeID || !areaCode) {
    throw new HttpsError(
      "invalid-argument",
      "tenantID, storeID, and areaCode are required."
    );
  }
  const wantSms = !capabilities || capabilities.includes("sms");
  const wantMms = !capabilities || capabilities.includes("mms");
  if (!wantSms && !wantMms) {
    throw new HttpsError(
      "invalid-argument",
      "capabilities must include at least one of sms, mms."
    );
  }

  // Number purchase is billable to the tenant subaccount. Admin+ only.
  await requireTenantMemberWithLevel(tenantID, request, 4, { storeID });

  logger.info("purchaseTwilioNumber: starting", {
    tenantID,
    storeID,
    areaCode,
    capabilities,
    uid: auth.uid,
  });

  const client = await getTenantTwilioClient(tenantID);

  const available = await client.availablePhoneNumbers("US").local.list({
    areaCode: parseInt(areaCode, 10),
    smsEnabled: wantSms,
    mmsEnabled: wantMms,
    limit: 5,
  });
  if (available.length === 0) {
    throw new HttpsError(
      "not-found",
      `No numbers available in area code ${areaCode} with requested capabilities.`
    );
  }

  return purchaseNumberInternal({
    tenantID,
    storeID,
    phoneNumber: available[0].phoneNumber,
    actorUID: auth.uid,
    actorKind: "tenant-admin",
  });
});

// ─────────────────────────────────────────────────────────────────────────
// platformAdminSearchTwilioAvailableNumbers — host-site number picker.
//
// Returns a normalized candidate list with locality + region + rate center +
// capabilities. Filters: state (inRegion), locality (city, exact match),
// areaCode, contains (vanity pattern). At least one filter is required —
// Twilio rejects an unfiltered search anyway, but we reject early with a
// clearer message.
// ─────────────────────────────────────────────────────────────────────────
exports.platformAdminSearchTwilioAvailableNumbers = onCall(
  NUMBER_FUNCTION_OPTS,
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, state, locality, areaCode, contains, limit } =
      request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    if (!state && !locality && !areaCode && !contains) {
      throw new HttpsError(
        "invalid-argument",
        "At least one of state, locality, areaCode, or contains is required."
      );
    }

    const db = getFirestore();
    const tenantSnap = await db.collection("tenants").doc(tenantID).get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} does not exist.`);
    }

    const cappedLimit = Math.min(
      Math.max(parseInt(limit, 10) || SEARCH_DEFAULT_LIMIT, 1),
      SEARCH_MAX_LIMIT
    );

    logger.info("platformAdminSearchTwilioAvailableNumbers: starting", {
      tenantID,
      state,
      locality,
      areaCode,
      contains,
      limit: cappedLimit,
      uid: auth.uid,
    });

    const client = await getTenantTwilioClient(tenantID);

    const searchOpts = {
      smsEnabled: true,
      mmsEnabled: true,
      limit: cappedLimit,
    };
    if (state) searchOpts.inRegion = state;
    if (locality) searchOpts.inLocality = locality;
    if (areaCode) searchOpts.areaCode = parseInt(areaCode, 10);
    if (contains) searchOpts.contains = contains;

    const available = await client
      .availablePhoneNumbers("US")
      .local.list(searchOpts);

    const candidates = available.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality || null,
      region: n.region || null,
      rateCenter: n.rateCenter || null,
      postalCode: n.postalCode || null,
      lata: n.lata || null,
      capabilities: {
        sms: n.capabilities && n.capabilities.SMS === true,
        mms: n.capabilities && n.capabilities.MMS === true,
        voice: n.capabilities && n.capabilities.voice === true,
      },
    }));

    logger.info("platformAdminSearchTwilioAvailableNumbers: results", {
      tenantID,
      count: candidates.length,
    });

    return { success: true, candidates };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// platformAdminPurchaseTwilioNumber — host-site buy. Takes a specific
// phoneNumber (resolved from search) and purchases into the tenant's
// subaccount. Verifies tenant + store exist before calling helper.
// ─────────────────────────────────────────────────────────────────────────
exports.platformAdminPurchaseTwilioNumber = onCall(
  NUMBER_FUNCTION_OPTS,
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, storeID, phoneNumber } = request.data || {};
    if (!tenantID || !storeID || !phoneNumber) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID, storeID, and phoneNumber are required."
      );
    }

    const db = getFirestore();
    const tenantSnap = await db.collection("tenants").doc(tenantID).get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} does not exist.`);
    }
    const storeSnap = await db
      .collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .doc(storeID)
      .get();
    if (!storeSnap.exists) {
      throw new HttpsError(
        "not-found",
        `Store ${storeID} does not exist under tenant ${tenantID}.`
      );
    }

    logger.info("platformAdminPurchaseTwilioNumber: starting", {
      tenantID,
      storeID,
      phoneNumber,
      uid: auth.uid,
    });

    return purchaseNumberInternal({
      tenantID,
      storeID,
      phoneNumber,
      actorUID: auth.uid,
      actorKind: "platform-admin",
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────
// platformAdminConfigureTenantWebhooks — backfill webhook URLs across every
// number owned by the tenant. Idempotent: numbers whose stored `webhooks`
// block already matches CURRENT_WEBHOOK_CONFIG are skipped without hitting
// Twilio. Returns the same shape as the A2P bulk-link callable:
//   { configured: [...e164s], alreadyCurrent: [...e164s], failed: [{phoneNumber, error}] }
// ─────────────────────────────────────────────────────────────────────────
exports.platformAdminConfigureTenantWebhooks = onCall(
  NUMBER_FUNCTION_OPTS,
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    const tenantSnap = await db.collection("tenants").doc(tenantID).get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} does not exist.`);
    }

    // allowSuspended=true so we can still reconfigure during the grace window —
    // suspended numbers still receive inbound, so keeping their URLs current
    // matters.
    const subaccountClient = await getTenantTwilioClient(tenantID, {
      allowSuspended: true,
    });

    const configured = [];
    const alreadyCurrent = [];
    const failed = [];

    const storesSnap = await db
      .collection("tenants").doc(tenantID).collection("stores").get();
    for (const storeDoc of storesSnap.docs) {
      const numbersSnap = await storeDoc.ref.collection("twilio").get();
      for (const numDoc of numbersSnap.docs) {
        const perNumberData = numDoc.data() || {};
        // Skip port-in placeholders (no real phoneNumberSid yet — the doc ID
        // is `port-<orderSid>` until the port completes).
        if (numDoc.id.startsWith("port-") || !perNumberData.phoneNumberSid) {
          continue;
        }
        try {
          const result = await configureNumberWebhooksInternal({
            db,
            subaccountClient,
            perNumberRef: numDoc.ref,
            perNumberData,
          });
          if (result.alreadyCurrent) {
            alreadyCurrent.push(result.phoneNumber || numDoc.id);
          } else {
            configured.push(result.phoneNumber || numDoc.id);
          }
        } catch (err) {
          failed.push({
            phoneNumber: perNumberData.phoneNumber || numDoc.id,
            error: (err && err.message) || "unknown error",
          });
        }
      }
    }

    await writeAuditEvent(db, tenantID, {
      type: "webhooks-bulk-configured",
      configuredCount: configured.length,
      alreadyCurrentCount: alreadyCurrent.length,
      failedCount: failed.length,
      actorUID: auth.uid,
      actorKind: "platform-admin",
    });

    logger.info("platformAdminConfigureTenantWebhooks: complete", {
      tenantID,
      configuredCount: configured.length,
      alreadyCurrentCount: alreadyCurrent.length,
      failedCount: failed.length,
    });

    return { configured, alreadyCurrent, failed };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// portInTwilioNumber — initiates Twilio Hosted SMS port-in.
//
// Stage 1 shell: creates the Hosted Numbers Order with contact + webhook
// metadata. LOA file upload is a follow-up step (deferred — the
// `loaStoragePath` parameter is recorded but the upload-to-Twilio step is
// stubbed below with a TODO). Once LOA upload is wired, this becomes the
// full port-initiation flow.
// ─────────────────────────────────────────────────────────────────────────
exports.portInTwilioNumber = onCall(NUMBER_FUNCTION_OPTS, async (request) => {
  const auth = requireAuth(request);

  const {
    tenantID,
    storeID,
    phoneNumber,
    contactPhoneNumber,
    contactEmail,
    loaStoragePath,
  } = request.data || {};
  if (!tenantID || !storeID || !phoneNumber || !contactPhoneNumber || !contactEmail) {
    throw new HttpsError(
      "invalid-argument",
      "tenantID, storeID, phoneNumber, contactPhoneNumber, contactEmail are required."
    );
  }

  await requireTenantMemberWithLevel(tenantID, request, 4, { storeID });

  logger.info("portInTwilioNumber: starting", {
    tenantID,
    storeID,
    phoneNumber,
    uid: auth.uid,
  });

  const client = await getTenantTwilioClient(tenantID);

  const order = await client.numbers.v2.hostedNumberOrders.create({
    phoneNumber,
    smsCapability: true,
    contactPhoneNumber,
    contactEmail,
    friendlyName: `tenant-${tenantID}-store-${storeID}-port`,
    smsUrl: INBOUND_WEBHOOK_URL,
    smsMethod: "POST",
    statusCallbackUrl: STATUS_CALLBACK_URL,
    statusCallbackMethod: "POST",
  });

  // TODO(stage-2): upload LOA PDF from loaStoragePath to Twilio order
  // attachments endpoint. Hosted SMS may not require LOA for every carrier;
  // when it does, this is the integration point.

  const db = getFirestore();
  const batch = db.batch();

  // Per-store doc uses the order SID until the port completes (no
  // phoneNumberSid exists until Twilio finalizes the port). The polling job
  // (scheduledTwilioPortInPoll) rewrites this doc with the real SID on
  // completion.
  const portDocID = `port-${order.sid}`;
  const storeRef = storeNumberDocRef(db, tenantID, storeID, portDocID);
  batch.set(storeRef, {
    phoneNumber,
    phoneNumberSid: null,
    hostedNumberOrderSid: order.sid,
    capabilities: { sms: true, mms: false, voice: false },
    friendlyName: order.friendlyName,
    source: "port-in",
    portStatus: order.status || "received",
    loaStoragePath: loaStoragePath || null,
    contactPhoneNumber,
    contactEmail,
    initiatedAt: FieldValue.serverTimestamp(),
    initiatedByUID: auth.uid,
  });

  const routingRef = routingDocRef(db, phoneNumber);
  const subaccountSnap = await db
    .collection("tenants")
    .doc(tenantID)
    .collection("private")
    .doc("twilio")
    .get();
  const subaccountSid =
    subaccountSnap.exists && subaccountSnap.data().subaccountSid;
  batch.set(routingRef, {
    tenantID,
    storeID,
    subaccountSid: subaccountSid || null,
    phoneNumberSid: null,
    hostedNumberOrderSid: order.sid,
    status: "pending",
    initiatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  await writeAuditEvent(db, tenantID, {
    type: "number-port-initiated",
    phoneNumber,
    hostedNumberOrderSid: order.sid,
    storeID,
    actorUID: auth.uid,
  });

  logger.info("portInTwilioNumber: order created", {
    tenantID,
    storeID,
    phoneNumber,
    orderSid: order.sid,
    status: order.status,
  });

  return {
    hostedNumberOrderSid: order.sid,
    status: order.status,
  };
});

// ─────────────────────────────────────────────────────────────────────────
// releaseTwilioNumber — releases a number from the subaccount and removes
// routing. Used by churn flow (Phase 7) and admin cleanup.
// ─────────────────────────────────────────────────────────────────────────
exports.releaseTwilioNumber = onCall(NUMBER_FUNCTION_OPTS, async (request) => {
  const auth = requireAuth(request);

  const { phoneNumber } = request.data || {};
  if (!phoneNumber) {
    throw new HttpsError("invalid-argument", "phoneNumber is required.");
  }

  logger.info("releaseTwilioNumber: starting", {
    phoneNumber,
    uid: auth.uid,
  });

  const db = getFirestore();
  const routingRef = routingDocRef(db, phoneNumber);
  const routingSnap = await routingRef.get();
  if (!routingSnap.exists) {
    throw new HttpsError("not-found", `No routing entry for ${phoneNumber}.`);
  }
  const { tenantID, storeID, phoneNumberSid } = routingSnap.data() || {};
  if (!tenantID || !storeID) {
    throw new HttpsError(
      "internal",
      `Routing entry for ${phoneNumber} is incomplete.`
    );
  }

  // Resolve tenantID/storeID from routing first, then verify caller is Admin+
  // in that store. Stops cross-tenant abuse where a member of one tenant tries
  // to release another tenant's number.
  await requireTenantMemberWithLevel(tenantID, request, 4, { storeID });

  const client = await getTenantTwilioClient(tenantID);

  if (phoneNumberSid) {
    try {
      await client.incomingPhoneNumbers(phoneNumberSid).remove();
    } catch (err) {
      // 20404 = number not found on subaccount (already released externally).
      // Treat as success and proceed to clean up Firestore.
      if (err.status !== 404 && err.code !== 20404) throw err;
      logger.warn("releaseTwilioNumber: number not found on Twilio, cleaning up Firestore only", {
        phoneNumber,
        phoneNumberSid,
      });
    }
  }

  // Delete per-store doc(s) for this number. Look up by phoneNumberSid OR by
  // port doc ID — both paths land here on cleanup.
  const storeNumbersCol = db
    .collection("tenants").doc(tenantID)
    .collection("stores").doc(storeID)
    .collection("twilio");
  const matching = await storeNumbersCol
    .where("phoneNumber", "==", phoneNumber)
    .get();
  const batch = db.batch();
  matching.forEach((doc) => batch.delete(doc.ref));
  batch.delete(routingRef);
  await batch.commit();

  await writeAuditEvent(db, tenantID, {
    type: "number-released",
    phoneNumber,
    phoneNumberSid: phoneNumberSid || null,
    storeID,
    actorUID: auth.uid,
  });

  logger.info("releaseTwilioNumber: released", {
    phoneNumber,
    tenantID,
    storeID,
  });

  return { phoneNumber, released: true };
});

// ─────────────────────────────────────────────────────────────────────────
// transferNumberBetweenStores — reassigns a number from one store to another
// within the same tenant. Twilio resource ownership doesn't change (still
// owned by the same subaccount); only Firestore routing + per-store docs
// move. Inbound webhook picks up the new routing on its next read.
// ─────────────────────────────────────────────────────────────────────────
exports.transferNumberBetweenStores = onCall(
  NUMBER_FUNCTION_OPTS,
  async (request) => {
    const auth = requireAuth(request);

    const { phoneNumber, fromStoreID, toStoreID } = request.data || {};
    if (!phoneNumber || !fromStoreID || !toStoreID) {
      throw new HttpsError(
        "invalid-argument",
        "phoneNumber, fromStoreID, and toStoreID are required."
      );
    }
    if (fromStoreID === toStoreID) {
      throw new HttpsError(
        "invalid-argument",
        "fromStoreID and toStoreID must differ."
      );
    }

    logger.info("transferNumberBetweenStores: starting", {
      phoneNumber,
      fromStoreID,
      toStoreID,
      uid: auth.uid,
    });

    const db = getFirestore();
    const routingRef = routingDocRef(db, phoneNumber);
    const routingSnap = await routingRef.get();
    if (!routingSnap.exists) {
      throw new HttpsError("not-found", `No routing entry for ${phoneNumber}.`);
    }
    const routingData = routingSnap.data() || {};
    if (routingData.storeID !== fromStoreID) {
      throw new HttpsError(
        "failed-precondition",
        `Number is not currently assigned to fromStoreID ${fromStoreID}.`
      );
    }
    const { tenantID } = routingData;
    if (!tenantID) {
      throw new HttpsError("internal", "Routing entry missing tenantID.");
    }

    // Caller must be Admin+ in the source store. toStoreID is not validated as
    // a membership target — transfers within a tenant are an admin function,
    // and toStoreID being in the same tenant is enforced upstream by the
    // routing doc rewrite below.
    await requireTenantMemberWithLevel(tenantID, request, 4, {
      storeID: fromStoreID,
    });

    const fromCol = db
      .collection("tenants").doc(tenantID)
      .collection("stores").doc(fromStoreID)
      .collection("twilio");
    const existing = await fromCol
      .where("phoneNumber", "==", phoneNumber)
      .get();
    if (existing.empty) {
      throw new HttpsError(
        "not-found",
        `No per-store doc for ${phoneNumber} in store ${fromStoreID}.`
      );
    }

    const batch = db.batch();
    existing.forEach((doc) => {
      const data = doc.data();
      const newRef = storeNumberDocRef(db, tenantID, toStoreID, doc.id);
      batch.set(newRef, {
        ...data,
        transferredFromStoreID: fromStoreID,
        transferredAt: FieldValue.serverTimestamp(),
        transferredByUID: auth.uid,
      });
      batch.delete(doc.ref);
    });
    batch.update(routingRef, {
      storeID: toStoreID,
      transferredAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    await writeAuditEvent(db, tenantID, {
      type: "number-transferred",
      phoneNumber,
      fromStoreID,
      toStoreID,
      actorUID: auth.uid,
    });

    logger.info("transferNumberBetweenStores: transferred", {
      phoneNumber,
      tenantID,
      fromStoreID,
      toStoreID,
    });

    return { phoneNumber, fromStoreID, toStoreID };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// scheduledTwilioPortInPoll — every 6h, advances any pending Hosted Numbers
// Orders. When Twilio reports `completed`, the per-store doc is rewritten
// with the real phoneNumberSid and the routing entry flips to `active`.
//
// Requires a single-field index on `twilio-number-routing.status = "pending"`
// (Firestore prompts via the error URL on first run if missing).
// ─────────────────────────────────────────────────────────────────────────
exports.scheduledTwilioPortInPoll = onSchedule(
  {
    schedule: "every 6 hours",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async () => {
    const db = getFirestore();
    const pending = await db
      .collection("twilio-number-routing")
      .where("status", "==", "pending")
      .get();

    if (pending.empty) {
      logger.info("scheduledTwilioPortInPoll: nothing pending");
      return;
    }

    logger.info("scheduledTwilioPortInPoll: pending count", {
      count: pending.size,
    });

    for (const routingDoc of pending.docs) {
      const phoneNumber = routingDoc.id;
      const {
        tenantID,
        storeID,
        hostedNumberOrderSid,
      } = routingDoc.data() || {};
      if (!tenantID || !hostedNumberOrderSid) {
        logger.warn("scheduledTwilioPortInPoll: routing entry incomplete", {
          phoneNumber,
        });
        continue;
      }

      let client;
      try {
        client = await getTenantTwilioClient(tenantID);
      } catch (err) {
        logger.error("scheduledTwilioPortInPoll: cannot load tenant client", {
          tenantID,
          error: err && err.message,
        });
        continue;
      }

      let order;
      try {
        order = await client.numbers.v2
          .hostedNumberOrders(hostedNumberOrderSid)
          .fetch();
      } catch (err) {
        logger.error("scheduledTwilioPortInPoll: fetch failed", {
          tenantID,
          hostedNumberOrderSid,
          error: err && err.message,
        });
        continue;
      }

      // Twilio Hosted Numbers Order statuses: received, pending-verification,
      // verified, pending-loa, carrier-processing, testing, completed, failed,
      // action-required. We flip to "active" only on completed; "failed" goes
      // to its own terminal state.
      const newStatus = order.status;
      const isComplete = newStatus === "completed";
      const isFailed = newStatus === "failed";

      const storeColRef = db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("twilio");
      const portDocs = await storeColRef
        .where("hostedNumberOrderSid", "==", hostedNumberOrderSid)
        .get();

      const batch = db.batch();
      portDocs.forEach((doc) => {
        const update = {
          portStatus: newStatus,
          lastPolledAt: FieldValue.serverTimestamp(),
        };
        if (isComplete) {
          update.phoneNumberSid = order.incomingPhoneNumberSid || null;
          update.portCompletedAt = FieldValue.serverTimestamp();
        }
        batch.update(doc.ref, update);
      });
      const routingUpdate = {
        lastPolledAt: FieldValue.serverTimestamp(),
      };
      if (isComplete) {
        routingUpdate.status = "active";
        routingUpdate.phoneNumberSid = order.incomingPhoneNumberSid || null;
        routingUpdate.activatedAt = FieldValue.serverTimestamp();
      } else if (isFailed) {
        routingUpdate.status = "failed";
        routingUpdate.failedAt = FieldValue.serverTimestamp();
      }
      batch.update(routingDoc.ref, routingUpdate);
      await batch.commit();

      if (isComplete || isFailed) {
        await writeAuditEvent(db, tenantID, {
          type: isComplete ? "number-port-completed" : "number-port-failed",
          phoneNumber,
          hostedNumberOrderSid,
          storeID,
        });
      }

      logger.info("scheduledTwilioPortInPoll: polled", {
        phoneNumber,
        tenantID,
        status: newStatus,
      });
    }
  }
);
