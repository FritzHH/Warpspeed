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
  destroySubaccountSecret,
  masterTwilioClient,
  flipTenantRoutingDocs,
} = common;

// Default grace window between suspend and final closure. The window exists
// so consumers can still text opt-out (STOP) to a number after a tenant has
// churned — required for TCPA compliance. 30 days matches industry practice
// and gives operators a buffer to reactivate without re-onboarding.
const DEFAULT_GRACE_WINDOW_DAYS = 30;

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

    // Suspend on Twilio. Twilio API note: status="suspended" stops the
    // subaccount from sending and from initiating API calls under its own
    // auth, but the subaccount's numbers continue to RECEIVE inbound
    // messages — exactly what we want for the TCPA opt-out grace window.
    const client = masterTwilioClient();
    await client.api.v2010
      .accounts(subaccountSid)
      .update({ status: "suspended" });

    // Flip routing docs into "grace". The inbound webhook accepts both
    // "active" and "grace"; the send callable rejects "grace". This is the
    // single switch that controls send-vs-receive behavior during the
    // grace window — no separate suspended-subaccount lookup needed on the
    // hot path.
    const flipped = await flipTenantRoutingDocs(db, tenantID, "active", "grace");

    await twilioRef.set(
      {
        status: "suspended",
        suspendedAt: FieldValue.serverTimestamp(),
        suspendedReason: reason || null,
        graceWindowDays: DEFAULT_GRACE_WINDOW_DAYS,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAuditEvent(db, tenantID, {
      type: "subaccount-deactivated",
      subaccountSid,
      reason: reason || null,
      routingDocsFlippedToGrace: flipped,
      graceWindowDays: DEFAULT_GRACE_WINDOW_DAYS,
      actorUID: auth.uid,
    });

    logger.info("deactivateTenantTwilioSubaccount: suspended", {
      tenantID,
      subaccountSid,
      routingDocsFlippedToGrace: flipped,
    });

    return {
      subaccountSid,
      status: "suspended",
      graceWindowDays: DEFAULT_GRACE_WINDOW_DAYS,
      routingDocsFlippedToGrace: flipped,
    };
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
    // Phase 2; scheduledTwilioChurnCleanup, Phase 7). Twilio rejects the
    // close if any numbers remain attached.

    const client = masterTwilioClient();
    await client.api.v2010
      .accounts(subaccountSid)
      .update({ status: "closed" });

    // Secret Manager cleanup. The auth token is useless after closure and
    // keeping it around is needless attack surface. destroySubaccountSecret
    // swallows NOT_FOUND so re-runs after partial failures are safe.
    try {
      await destroySubaccountSecret(tenantID);
    } catch (err) {
      logger.error("closeTenantTwilioSubaccount: secret destroy failed", {
        tenantID,
        error: err && err.message,
      });
      // Don't throw — the subaccount is closed on Twilio's side, which is
      // the load-bearing step. Stale secret can be cleaned manually.
    }

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
