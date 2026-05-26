/* eslint-disable */
// Phase 1 — Twilio subaccount lifecycle.
//
// Three callables for tenant Twilio account lifecycle:
//   - provisionTenantTwilioSubaccount    creates a subaccount under RSS master
//   - deactivateTenantTwilioSubaccount   suspends (TCPA opt-out grace window)
//   - closeTenantTwilioSubaccount        final closure after grace window
//
// Subaccount auth tokens live in Secret Manager, never in Firestore. The
// Firestore record stores only the secretManagerRef (path), so downstream
// code (send, webhook signature verify) resolves the token by tenantID.
//
// Stage 1 note: TWILIO_MASTER_* secrets are placeholders until the LLC clears
// (Stage 3). Code is fully testable with Twilio test credentials in Stage 2.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const common = require("./twilio-common");

if (!admin.apps.length) admin.initializeApp();

const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  requireAuth,
  requireTenantMemberWithLevel,
  tenantTwilioDocRef,
  writeAuditEvent,
  secretManagerRef,
  storeSubaccountAuthToken,
  masterTwilioClient,
} = common;

exports.provisionTenantTwilioSubaccount = onCall(
  {
    region: "us-central1",
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async (request) => {
    const auth = requireAuth(request);

    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    // Subaccount provisioning is a billable, tenant-wide action. Admin+ only.
    await requireTenantMemberWithLevel(tenantID, request, 4);

    logger.info("provisionTenantTwilioSubaccount: starting", {
      tenantID,
      uid: auth.uid,
    });

    const db = getFirestore();
    const twilioRef = tenantTwilioDocRef(db, tenantID);

    // Idempotency: if an active subaccount already exists, return it without
    // re-calling Twilio (which would otherwise create a second subaccount).
    const existing = await twilioRef.get();
    if (existing.exists) {
      const data = existing.data() || {};
      if (data.status === "active") {
        logger.info("provisionTenantTwilioSubaccount: already active", {
          tenantID,
          subaccountSid: data.subaccountSid,
        });
        return {
          subaccountSid: data.subaccountSid,
          status: data.status,
          alreadyProvisioned: true,
        };
      }
    }

    const client = masterTwilioClient();
    const subaccount = await client.api.v2010.accounts.create({
      friendlyName: `tenant-${tenantID}`,
    });

    await storeSubaccountAuthToken(tenantID, subaccount.authToken);

    await twilioRef.set(
      {
        subaccountSid: subaccount.sid,
        secretManagerRef: secretManagerRef(tenantID),
        status: "active",
        a2pBrandSid: null,
        a2pCampaignSid: null,
        createdAt: FieldValue.serverTimestamp(),
        createdByUID: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAuditEvent(db, tenantID, {
      type: "subaccount-provisioned",
      subaccountSid: subaccount.sid,
      actorUID: auth.uid,
    });

    logger.info("provisionTenantTwilioSubaccount: provisioned", {
      tenantID,
      subaccountSid: subaccount.sid,
    });

    return {
      subaccountSid: subaccount.sid,
      status: "active",
      alreadyProvisioned: false,
    };
  }
);

exports.deactivateTenantTwilioSubaccount = onCall(
  {
    region: "us-central1",
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async (request) => {
    const auth = requireAuth(request);

    const { tenantID, reason } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    await requireTenantMemberWithLevel(tenantID, request, 4);

    logger.info("deactivateTenantTwilioSubaccount: starting", {
      tenantID,
      reason,
      uid: auth.uid,
    });

    const db = getFirestore();
    const twilioRef = tenantTwilioDocRef(db, tenantID);
    const snap = await twilioRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "No Twilio subaccount for tenant.");
    }
    const { subaccountSid, status } = snap.data() || {};
    if (status === "closed") {
      throw new HttpsError("failed-precondition", "Subaccount already closed.");
    }

    // Suspend on Twilio: subaccount cannot send/receive but the entity is
    // retained for compliance history (TCPA opt-out records, A2P audit).
    const client = masterTwilioClient();
    await client.api.v2010
      .accounts(subaccountSid)
      .update({ status: "suspended" });

    await twilioRef.set(
      {
        status: "suspended",
        suspendedAt: FieldValue.serverTimestamp(),
        suspendedReason: reason || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAuditEvent(db, tenantID, {
      type: "subaccount-deactivated",
      subaccountSid,
      reason: reason || null,
      actorUID: auth.uid,
    });

    logger.info("deactivateTenantTwilioSubaccount: suspended", {
      tenantID,
      subaccountSid,
    });

    return { subaccountSid, status: "suspended" };
  }
);

exports.closeTenantTwilioSubaccount = onCall(
  {
    region: "us-central1",
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async (request) => {
    const auth = requireAuth(request);

    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    await requireTenantMemberWithLevel(tenantID, request, 4);

    logger.info("closeTenantTwilioSubaccount: starting", {
      tenantID,
      uid: auth.uid,
    });

    const db = getFirestore();
    const twilioRef = tenantTwilioDocRef(db, tenantID);
    const snap = await twilioRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "No Twilio subaccount for tenant.");
    }
    const { subaccountSid, status } = snap.data() || {};
    if (status !== "suspended") {
      throw new HttpsError(
        "failed-precondition",
        "Subaccount must be suspended before closure (grace window must complete first)."
      );
    }

    // Number release is the caller's responsibility (releaseTwilioNumber,
    // Phase 2). Twilio will reject the close if any numbers remain attached.

    const client = masterTwilioClient();
    await client.api.v2010
      .accounts(subaccountSid)
      .update({ status: "closed" });

    await twilioRef.set(
      {
        status: "closed",
        closedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAuditEvent(db, tenantID, {
      type: "subaccount-closed",
      subaccountSid,
      actorUID: auth.uid,
    });

    logger.info("closeTenantTwilioSubaccount: closed", {
      tenantID,
      subaccountSid,
    });

    return { subaccountSid, status: "closed" };
  }
);
