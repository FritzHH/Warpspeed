/* eslint-disable */
// Phase 1 — Twilio subaccount lifecycle.
//
// Callables for tenant Twilio account lifecycle:
//   - provisionTenantTwilioSubaccount             tenant admin (level 4)
//   - platformAdminProvisionTwilioSubaccount      platform admin (host site)
//   - deactivateTenantTwilioSubaccount            tenant admin (level 4)
//   - platformAdminDeactivateTwilioSubaccount     platform admin (host site)
//   - platformAdminReactivateTwilioSubaccount     platform admin (host site)
//   - closeTenantTwilioSubaccount                 tenant admin (level 4)
//   - platformAdminCloseTwilioSubaccount          platform admin (host site)
//
// Each lifecycle action has a shared internal helper so the Twilio SDK +
// Firestore + Secret Manager + audit-event sequence stays in one place. The
// callables differ only in auth gate: tenant admin invokes from the POS app;
// platform admin invokes from the cadence-dashboard host site. Reactivate is
// platform-admin-only by design: tenants can't suspend themselves, so a
// tenant-admin reactivate would be a regret-button with no inverse.
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
const { assertPlatformAdmin } = require("./auth-guards");

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
  secretManagerRefForSetup,
  storeSetupSubaccountAuthToken,
  destroySetupSubaccountSecret,
  masterTwilioClient,
  flipTenantRoutingDocs,
} = common;

// Shared body for both provision callables. Auth is the caller's concern —
// this helper assumes the caller has already gated on the appropriate
// permission (tenant admin level 4 for the in-app callable, platformAdmin for
// the host-site callable). actorUID is recorded on the Firestore doc and audit
// event so we can trace who provisioned a given tenant's subaccount.
async function provisionSubaccountInternal({ tenantID, actorUID, actorKind }) {
  const db = getFirestore();
  const twilioRef = tenantTwilioDocRef(db, tenantID);

  // Idempotency: if an active subaccount already exists, return it without
  // re-calling Twilio (which would otherwise create a second subaccount).
  const existing = await twilioRef.get();
  if (existing.exists) {
    const data = existing.data() || {};
    if (data.status === "active") {
      logger.info("provisionSubaccountInternal: already active", {
        tenantID,
        subaccountSid: data.subaccountSid,
        actorKind,
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
      createdByUID: actorUID,
      createdByKind: actorKind,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAuditEvent(db, tenantID, {
    type: "subaccount-provisioned",
    subaccountSid: subaccount.sid,
    actorUID,
    actorKind,
  });

  logger.info("provisionSubaccountInternal: provisioned", {
    tenantID,
    subaccountSid: subaccount.sid,
    actorKind,
  });

  return {
    subaccountSid: subaccount.sid,
    status: "active",
    alreadyProvisioned: false,
  };
}

// Pre-tenant variant: provisions a Twilio subaccount during the signup
// wizard (after card-save, before a tenant doc exists). Stores subaccount
// SID and Secret Manager ref on the prospect's setup doc instead of a
// tenant doc. Adopted at tenant provisioning time — the SID is copied to
// the new tenant doc and the setup-keyed secret is destroyed (auth token
// is re-stored under the tenant key in the adoption step).
//
// Idempotent: if `data.twilioSubaccountSid` is already on the setup doc,
// we treat the subaccount as already provisioned and return early. This
// lets us call from both the confirm-PM callable AND on prospect resume.
async function provisionPreTenantSubaccountInternal({
  normalizedEmail,
  setupDocRef,
  actorUID,
  actorKind,
}) {
  if (!normalizedEmail) {
    throw new HttpsError(
      "invalid-argument",
      "normalizedEmail is required for pre-tenant subaccount provisioning."
    );
  }
  if (!setupDocRef) {
    throw new HttpsError(
      "invalid-argument",
      "setupDocRef is required for pre-tenant subaccount provisioning."
    );
  }

  const existing = await setupDocRef.get();
  if (!existing.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Setup doc for ${normalizedEmail} does not exist.`
    );
  }
  const data = existing.data() || {};

  if (data.twilioSubaccountSid && data.twilioSubaccountStatus === "active") {
    logger.info("provisionPreTenantSubaccountInternal: already active", {
      normalizedEmail,
      subaccountSid: data.twilioSubaccountSid,
      actorKind,
    });
    return {
      subaccountSid: data.twilioSubaccountSid,
      status: "active",
      alreadyProvisioned: true,
    };
  }

  const client = masterTwilioClient();
  // Twilio friendlyName cap is 64 chars; emails over ~58 chars get truncated.
  const friendlyName = `setup-${normalizedEmail}`.slice(0, 64);
  const subaccount = await client.api.v2010.accounts.create({ friendlyName });

  await storeSetupSubaccountAuthToken(normalizedEmail, subaccount.authToken);

  await setupDocRef.update({
    twilioSubaccountSid: subaccount.sid,
    twilioSecretManagerRef: secretManagerRefForSetup(normalizedEmail),
    twilioSubaccountStatus: "active",
    twilioSubaccountCreatedAt: FieldValue.serverTimestamp(),
    twilioSubaccountCreatedByUID: actorUID || null,
    twilioSubaccountCreatedByKind: actorKind || null,
  });

  logger.info("provisionPreTenantSubaccountInternal: provisioned", {
    normalizedEmail,
    subaccountSid: subaccount.sid,
    actorKind,
  });

  return {
    subaccountSid: subaccount.sid,
    status: "active",
    alreadyProvisioned: false,
  };
}

// Tear-down for the pre-tenant subaccount + secret. Called from the
// orphan-cleanup Firestore trigger when a setup doc is deleted without
// being adopted into a tenant, AND from the adoption step (after the
// SID is copied to the tenant doc and the auth token is re-stored under
// the tenant key). Closes the subaccount on Twilio + destroys the secret.
// Idempotent: missing SID or already-closed subaccount returns ok.
async function destroyPreTenantSubaccountInternal({ normalizedEmail, subaccountSid }) {
  if (!normalizedEmail) return { ok: true, skipped: true };
  if (!subaccountSid) {
    // Nothing to close on Twilio, but still try to destroy the secret in
    // case it leaked.
    try {
      await destroySetupSubaccountSecret(normalizedEmail);
    } catch (err) {
      logger.warn("destroyPreTenantSubaccountInternal: secret destroy failed", {
        normalizedEmail,
        error: err && err.message,
      });
    }
    return { ok: true, skipped: true };
  }

  const master = masterTwilioClient();
  try {
    await master.api.v2010.accounts(subaccountSid).update({ status: "closed" });
    logger.info("destroyPreTenantSubaccountInternal: closed subaccount", {
      normalizedEmail,
      subaccountSid,
    });
  } catch (err) {
    // 20404 = already closed/missing. Anything else logs but doesn't throw —
    // we still want to destroy the secret regardless.
    logger.warn("destroyPreTenantSubaccountInternal: close failed", {
      normalizedEmail,
      subaccountSid,
      error: err && err.message,
    });
  }

  try {
    await destroySetupSubaccountSecret(normalizedEmail);
  } catch (err) {
    logger.warn("destroyPreTenantSubaccountInternal: secret destroy failed", {
      normalizedEmail,
      error: err && err.message,
    });
  }

  return { ok: true };
}

// Default grace window between suspend and final closure. The window exists
// so consumers can still text opt-out (STOP) to a number after a tenant has
// churned — required for TCPA compliance. 30 days matches industry practice
// and gives operators a buffer to reactivate without re-onboarding.
const DEFAULT_GRACE_WINDOW_DAYS = 30;

// Exposed for callables in other modules (e.g. platformAdminCreateTenantCallable
// bundles subaccount provisioning into tenant create). Same helper, same
// post-conditions — uses the same secrets + writes the same Firestore records.
exports._internals = {
  provisionSubaccountInternal,
  closeSubaccountInternal,
  provisionPreTenantSubaccountInternal,
  destroyPreTenantSubaccountInternal,
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
};

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

    return provisionSubaccountInternal({
      tenantID,
      actorUID: auth.uid,
      actorKind: "tenant-admin",
    });
  }
);

// Platform-admin sibling. Same body, different gate. Lives so the cadence-
// dashboard host site can provision a Twilio subaccount for a tenant without
// the platform admin needing membership in that tenant. The tenant-admin
// callable above remains the path for self-serve provisioning from the POS
// app once that surface ships.
exports.platformAdminProvisionTwilioSubaccount = onCall(
  {
    region: "us-central1",
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    // Confirm the tenant exists before hitting Twilio — a typo'd tenantID
    // would otherwise create an orphan subaccount on Twilio's side that we'd
    // have to close manually.
    const db = getFirestore();
    const tenantSnap = await db.collection("tenants").doc(tenantID).get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} does not exist.`);
    }

    logger.info("platformAdminProvisionTwilioSubaccount: starting", {
      tenantID,
      uid: auth.uid,
    });

    return provisionSubaccountInternal({
      tenantID,
      actorUID: auth.uid,
      actorKind: "platform-admin",
    });
  }
);

// Shared body for both deactivate callables. Caller is responsible for auth
// gating before invoking. Behavior is preserved exactly from the original
// deactivate callable; the extraction is purely so the platform-admin variant
// can re-use it without duplicating the Twilio-suspend + routing-flip + doc-
// write + audit-event sequence.
async function deactivateSubaccountInternal({ tenantID, actorUID, actorKind, reason }) {
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
    actorUID,
    actorKind,
  });

  logger.info("deactivateSubaccountInternal: suspended", {
    tenantID,
    subaccountSid,
    routingDocsFlippedToGrace: flipped,
    actorKind,
  });

  return {
    subaccountSid,
    status: "suspended",
    graceWindowDays: DEFAULT_GRACE_WINDOW_DAYS,
    routingDocsFlippedToGrace: flipped,
  };
}

// Reactivate. Strict precondition: status === "suspended". Throws on "active"
// (no-op confusion) and "closed" (terminal — auth token destroyed on close,
// so Twilio's own reactivate would also fail). Clears suspendedAt /
// suspendedReason / graceWindowDays so the doc doesn't carry stale grace
// state after the tenant is back.
async function reactivateSubaccountInternal({ tenantID, actorUID, actorKind }) {
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
      `Subaccount must be suspended to reactivate (current status: ${status || "unknown"}).`
    );
  }

  const client = masterTwilioClient();
  await client.api.v2010
    .accounts(subaccountSid)
    .update({ status: "active" });

  // Flip routing docs grace → active. Numbers released or transferred while
  // suspended aren't matched (no longer have routing docs at status "grace"
  // for this tenant) — correct behavior.
  const flipped = await flipTenantRoutingDocs(db, tenantID, "grace", "active");

  await twilioRef.set(
    {
      status: "active",
      suspendedAt: null,
      suspendedReason: null,
      graceWindowDays: null,
      reactivatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAuditEvent(db, tenantID, {
    type: "subaccount-reactivated",
    subaccountSid,
    routingDocsFlippedToActive: flipped,
    actorUID,
    actorKind,
  });

  logger.info("reactivateSubaccountInternal: reactivated", {
    tenantID,
    subaccountSid,
    routingDocsFlippedToActive: flipped,
    actorKind,
  });

  return {
    subaccountSid,
    status: "active",
    routingDocsFlippedToActive: flipped,
  };
}

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

    return deactivateSubaccountInternal({
      tenantID,
      actorUID: auth.uid,
      actorKind: "tenant-admin",
      reason,
    });
  }
);

exports.platformAdminDeactivateTwilioSubaccount = onCall(
  {
    region: "us-central1",
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, reason } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    const tenantSnap = await db.collection("tenants").doc(tenantID).get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} does not exist.`);
    }

    logger.info("platformAdminDeactivateTwilioSubaccount: starting", {
      tenantID,
      reason,
      uid: auth.uid,
    });

    return deactivateSubaccountInternal({
      tenantID,
      actorUID: auth.uid,
      actorKind: "platform-admin",
      reason,
    });
  }
);

// Reactivate is platform-admin-only. Tenants don't have a UI to suspend
// themselves, so a tenant-admin reactivate would have no path that leads to
// it being needed. If a churn-suspended tenant wants back in, they contact
// RSS and a platform admin invokes this.
exports.platformAdminReactivateTwilioSubaccount = onCall(
  {
    region: "us-central1",
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
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

    logger.info("platformAdminReactivateTwilioSubaccount: starting", {
      tenantID,
      uid: auth.uid,
    });

    return reactivateSubaccountInternal({
      tenantID,
      actorUID: auth.uid,
      actorKind: "platform-admin",
    });
  }
);

// Shared body for both close callables. Caller is responsible for auth
// gating. Precondition status === "suspended" — close from active is rejected
// to force the TCPA grace window.
async function closeSubaccountInternal({ tenantID, actorUID, actorKind, force = false }) {
  logger.info("closeSubaccountInternal: ENTER", { tenantID, actorKind, force });
  const db = getFirestore();
  const twilioRef = tenantTwilioDocRef(db, tenantID);
  const snap = await twilioRef.get();
  logger.info("closeSubaccountInternal: doc read", {
    tenantID,
    exists: snap.exists,
    path: twilioRef.path,
  });
  if (!snap.exists) {
    logger.warn("closeSubaccountInternal: no subdoc - throwing not-found", {
      tenantID,
    });
    throw new HttpsError("not-found", "No Twilio subaccount for tenant.");
  }
  const { subaccountSid, status } = snap.data() || {};
  logger.info("closeSubaccountInternal: doc data", {
    tenantID,
    subaccountSid,
    status,
  });
  if (status !== "suspended" && !force) {
    logger.warn("closeSubaccountInternal: precondition failed - not suspended", {
      tenantID,
      status,
    });
    throw new HttpsError(
      "failed-precondition",
      "Subaccount must be suspended before closure (grace window must complete first)."
    );
  }

  // Number release is the caller's responsibility (releaseTwilioNumber,
  // Phase 2; scheduledTwilioChurnCleanup, Phase 7). Twilio rejects the
  // close if any numbers remain attached.

  let client;
  try {
    client = masterTwilioClient();
  } catch (err) {
    logger.error("closeSubaccountInternal: masterTwilioClient init failed", {
      tenantID,
      error: err && err.message,
      code: err && err.code,
    });
    throw err;
  }
  if (force && status === "active") {
    logger.info("closeSubaccountInternal: suspending (force path)", {
      tenantID,
      subaccountSid,
    });
    try {
      const suspended = await client.api.v2010
        .accounts(subaccountSid)
        .update({ status: "suspended" });
      logger.info("closeSubaccountInternal: suspend OK", {
        tenantID,
        subaccountSid,
        newStatus: suspended.status,
      });
    } catch (err) {
      logger.error("closeSubaccountInternal: suspend failed", {
        tenantID,
        subaccountSid,
        error: err && err.message,
        code: err && err.code,
        twilioStatus: err && err.status,
        moreInfo: err && err.moreInfo,
        details: err && err.details ? JSON.stringify(err.details) : null,
      });
      throw err;
    }
  }
  logger.info("closeSubaccountInternal: closing", { tenantID, subaccountSid });
  try {
    const closed = await client.api.v2010
      .accounts(subaccountSid)
      .update({ status: "closed" });
    logger.info("closeSubaccountInternal: close OK", {
      tenantID,
      subaccountSid,
      newStatus: closed.status,
    });
  } catch (err) {
    logger.error("closeSubaccountInternal: close failed", {
      tenantID,
      subaccountSid,
      error: err && err.message,
      code: err && err.code,
      twilioStatus: err && err.status,
      moreInfo: err && err.moreInfo,
      details: err && err.details ? JSON.stringify(err.details) : null,
    });
    throw err;
  }

  // Secret Manager cleanup. The auth token is useless after closure and
  // keeping it around is needless attack surface. destroySubaccountSecret
  // swallows NOT_FOUND so re-runs after partial failures are safe.
  try {
    await destroySubaccountSecret(tenantID);
  } catch (err) {
    logger.error("closeSubaccountInternal: secret destroy failed", {
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
    actorUID,
    actorKind,
  });

  logger.info("closeSubaccountInternal: closed", {
    tenantID,
    subaccountSid,
    actorKind,
  });

  return { subaccountSid, status: "closed" };
}

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

    return closeSubaccountInternal({
      tenantID,
      actorUID: auth.uid,
      actorKind: "tenant-admin",
    });
  }
);

exports.platformAdminCloseTwilioSubaccount = onCall(
  {
    region: "us-central1",
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
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

    logger.info("platformAdminCloseTwilioSubaccount: starting", {
      tenantID,
      uid: auth.uid,
    });

    return closeSubaccountInternal({
      tenantID,
      actorUID: auth.uid,
      actorKind: "platform-admin",
    });
  }
);
