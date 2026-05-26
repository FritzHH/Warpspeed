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

if (!admin.apps.length) admin.initializeApp();

const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  INBOUND_WEBHOOK_URL,
  STATUS_CALLBACK_URL,
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

// ─────────────────────────────────────────────────────────────────────────
// purchaseTwilioNumber — search + buy + configure webhooks + write docs.
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

  const purchase = await client.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    friendlyName: `tenant-${tenantID}-store-${storeID}`,
    smsUrl: INBOUND_WEBHOOK_URL,
    smsMethod: "POST",
    statusCallback: STATUS_CALLBACK_URL,
    statusCallbackMethod: "POST",
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
    assignedByUID: auth.uid,
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
    actorUID: auth.uid,
  });

  logger.info("purchaseTwilioNumber: purchased", {
    tenantID,
    storeID,
    phoneNumber: purchase.phoneNumber,
    phoneNumberSid: purchase.sid,
  });

  return {
    phoneNumber: purchase.phoneNumber,
    phoneNumberSid: purchase.sid,
    capabilities: purchase.capabilities,
  };
});

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
