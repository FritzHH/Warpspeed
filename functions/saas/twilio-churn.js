/* eslint-disable */
// Phase 7 — Twilio churn cleanup (post-suspension teardown).
//
// Two entry points share a single orchestrator:
//   - scheduledTwilioChurnCleanup     daily scan for suspended tenants past
//                                     their grace window
//   - forceCloseTenantTwilioSubaccount SuperUser callable for immediate
//                                     teardown (GDPR / compliance deletes)
//
// Teardown sequence (TCPA-compliant ordering):
//   1. Release every number under the subaccount (Twilio API + Firestore).
//      Routing docs are deleted last in each iteration so inbound is only
//      cut off AFTER Twilio has released the number, never the reverse.
//   2. Close the subaccount on Twilio (Twilio rejects close while numbers
//      remain, so step 1 must complete first).
//   3. Destroy the per-tenant Secret Manager secret.
//   4. Stamp private/twilio.status = "closed".
//
// Suspended subaccounts cannot self-auth against the Twilio API, so every
// step uses the master client scoped to the subaccount SID.
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
  requireAuth,
  requireTenantMemberWithLevel,
  tenantTwilioDocRef,
  writeAuditEvent,
  destroySubaccountSecret,
  getTenantTwilioClient,
  masterTwilioClient,
  flipTenantRoutingDocs,
} = common;

const CHURN_FUNCTION_OPTS = {
  region: "us-central1",
  secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  timeoutSeconds: 540,
};

const DEFAULT_GRACE_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────
// teardownTenantTwilio — shared orchestrator.
// Called from both the scheduled cleanup and the force-close callable.
// Returns a summary object describing what was released/closed for the
// audit + caller response.
// ─────────────────────────────────────────────────────────────────────────
async function teardownTenantTwilio(db, tenantID, { actorUID, reason, force }) {
  const twilioRef = tenantTwilioDocRef(db, tenantID);
  const snap = await twilioRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `No Twilio subaccount for ${tenantID}.`);
  }
  const data = snap.data() || {};
  const { subaccountSid, status } = data;
  if (status === "closed") {
    return { tenantID, alreadyClosed: true, numbersReleased: 0 };
  }

  // Force-close from an active state: suspend first (grace flip too) so the
  // teardown always proceeds from a known-suspended state. Twilio rejects
  // closure of an active subaccount in some cases, and routing must be in
  // grace (or already cleared) before number release runs.
  if (status === "active") {
    if (!force) {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} is active; deactivate before cleanup.`
      );
    }
    const masterClient = masterTwilioClient();
    await masterClient.api.v2010
      .accounts(subaccountSid)
      .update({ status: "suspended" });
    const flipped = await flipTenantRoutingDocs(db, tenantID, "active", "grace");
    await twilioRef.set(
      {
        status: "suspended",
        suspendedAt: FieldValue.serverTimestamp(),
        suspendedReason: reason || "force-close",
        graceWindowDays: 0,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await writeAuditEvent(db, tenantID, {
      type: "subaccount-deactivated",
      subaccountSid,
      reason: reason || "force-close",
      routingDocsFlippedToGrace: flipped,
      graceWindowDays: 0,
      forced: true,
      actorUID: actorUID || "system",
    });
  }

  // ── Release every number under this tenant ──
  // Query by tenantID so we catch routing docs in any status (grace, pending,
  // failed). The releaseSingleNumber helper handles missing phoneNumberSid
  // (port still pending) and absent Twilio resources (already released).
  const routingSnap = await db
    .collection("twilio-number-routing")
    .where("tenantID", "==", tenantID)
    .get();

  const subaccountClient = await getTenantTwilioClient(tenantID, {
    allowSuspended: true,
  });

  let numbersReleased = 0;
  const releaseErrors = [];
  for (const routingDoc of routingSnap.docs) {
    try {
      await releaseSingleNumber(db, subaccountClient, tenantID, routingDoc);
      numbersReleased++;
    } catch (err) {
      logger.error("teardownTenantTwilio: release failed for number", {
        tenantID,
        phoneNumber: routingDoc.id,
        error: err && err.message,
      });
      releaseErrors.push({
        phoneNumber: routingDoc.id,
        error: err && err.message,
      });
    }
  }

  if (releaseErrors.length > 0) {
    // Numbers stuck on Twilio will block the close call. Audit + bail so the
    // operator can inspect; next scheduled run will retry.
    await writeAuditEvent(db, tenantID, {
      type: "subaccount-cleanup-blocked",
      subaccountSid,
      releaseErrors,
      actorUID: actorUID || "system",
    });
    throw new HttpsError(
      "internal",
      `Cleanup aborted — ${releaseErrors.length} numbers failed to release.`,
      { releaseErrors }
    );
  }

  // ── Close subaccount on Twilio ──
  // Master credentials only — a suspended subaccount can't close itself.
  const masterClient = masterTwilioClient();
  await masterClient.api.v2010
    .accounts(subaccountSid)
    .update({ status: "closed" });

  // ── Destroy per-tenant Secret Manager secret ──
  try {
    await destroySubaccountSecret(tenantID);
  } catch (err) {
    logger.error("teardownTenantTwilio: secret destroy failed", {
      tenantID,
      error: err && err.message,
    });
    // Non-fatal — subaccount is already closed on Twilio.
  }

  // ── Flip the private/twilio doc to closed ──
  await twilioRef.set(
    {
      status: "closed",
      closedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      numbersReleasedAtClosure: numbersReleased,
    },
    { merge: true }
  );

  // A2P brand/campaign cleanup: Twilio handles brand/campaign abandonment
  // when the subaccount closes. We just record the SIDs that were active
  // at closure time for the audit trail.
  await writeAuditEvent(db, tenantID, {
    type: "subaccount-closed",
    subaccountSid,
    numbersReleased,
    forced: !!force,
    reason: reason || null,
    a2pBrandSid: data.a2pBrandSid || null,
    a2pCampaignSid: data.a2pCampaignSid || null,
    actorUID: actorUID || "system",
  });

  return { tenantID, alreadyClosed: false, numbersReleased };
}

// Releases one number: Twilio API removal + per-store doc deletion + routing
// doc deletion. Best-effort on the Twilio side — 404 means it's already gone,
// which is fine. The Firestore cleanup runs regardless so we don't strand
// docs pointing at numbers that no longer exist.
async function releaseSingleNumber(db, subaccountClient, tenantID, routingDoc) {
  const routing = routingDoc.data() || {};
  const { storeID, phoneNumberSid, hostedNumberOrderSid } = routing;
  const phoneNumber = routingDoc.id;

  if (phoneNumberSid) {
    try {
      await subaccountClient.incomingPhoneNumbers(phoneNumberSid).remove();
    } catch (err) {
      if (err.status !== 404 && err.code !== 20404) throw err;
      logger.warn("releaseSingleNumber: number already gone on Twilio", {
        phoneNumber,
        phoneNumberSid,
      });
    }
  } else if (hostedNumberOrderSid) {
    // Pending port — cancel the hosted-number order so the carrier release
    // happens cleanly. Twilio supports updating to status="failed" on most
    // pre-completion states.
    try {
      const masterClient = masterTwilioClient();
      await masterClient.numbers.v2
        .hostedNumberOrders(hostedNumberOrderSid)
        .remove();
    } catch (err) {
      logger.warn("releaseSingleNumber: hosted-number-order cancel failed", {
        phoneNumber,
        hostedNumberOrderSid,
        error: err && err.message,
      });
      // Non-fatal — orphaned orders eventually time out at Twilio.
    }
  }

  if (storeID) {
    const storeCol = db
      .collection("tenants").doc(tenantID)
      .collection("stores").doc(storeID)
      .collection("twilio");
    const matching = await storeCol
      .where("phoneNumber", "==", phoneNumber)
      .get();
    const batch = db.batch();
    matching.forEach((d) => batch.delete(d.ref));
    batch.delete(routingDoc.ref);
    await batch.commit();
  } else {
    await routingDoc.ref.delete();
  }

  await writeAuditEvent(db, tenantID, {
    type: "number-released",
    phoneNumber,
    phoneNumberSid: phoneNumberSid || null,
    storeID: storeID || null,
    reason: "churn-cleanup",
    actorUID: "system",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// scheduledTwilioChurnCleanup — daily scan.
//
// Queries every tenant `private/twilio` doc in status="suspended" with a
// suspendedAt older than the tenant's graceWindowDays (default 30). Runs
// the teardown orchestrator on each. Errors are isolated per tenant — one
// stuck tenant doesn't block the rest.
// ─────────────────────────────────────────────────────────────────────────
exports.scheduledTwilioChurnCleanup = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "America/New_York",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async () => {
    const db = getFirestore();

    // Collection-group query across every tenants/{tid}/private/twilio doc.
    const suspended = await db
      .collectionGroup("private")
      .where("status", "==", "suspended")
      .get();

    if (suspended.empty) {
      logger.info("scheduledTwilioChurnCleanup: no suspended subaccounts");
      return;
    }

    const now = Date.now();
    let processed = 0;
    let skipped = 0;
    for (const doc of suspended.docs) {
      // Path: tenants/{tid}/private/twilio. Filter out other "private" docs
      // (anything that isn't named "twilio" or that lacks subaccountSid).
      if (doc.id !== "twilio") continue;
      const data = doc.data() || {};
      if (!data.subaccountSid) continue;

      // Extract tenantID from path: tenants/{tid}/private/twilio
      const tenantID = doc.ref.parent.parent.id;

      const suspendedAtMs = data.suspendedAt
        ? data.suspendedAt.toMillis()
        : null;
      const graceDays = typeof data.graceWindowDays === "number"
        ? data.graceWindowDays
        : DEFAULT_GRACE_WINDOW_DAYS;

      if (suspendedAtMs == null) {
        logger.warn("scheduledTwilioChurnCleanup: suspendedAt missing, skipping", {
          tenantID,
        });
        skipped++;
        continue;
      }
      const graceExpiresAt = suspendedAtMs + graceDays * MS_PER_DAY;
      if (now < graceExpiresAt) {
        skipped++;
        continue;
      }

      try {
        const summary = await teardownTenantTwilio(db, tenantID, {
          actorUID: "system",
          reason: "grace-window-expired",
          force: false,
        });
        logger.info("scheduledTwilioChurnCleanup: tenant processed", {
          tenantID,
          ...summary,
        });
        processed++;
      } catch (err) {
        logger.error("scheduledTwilioChurnCleanup: tenant failed", {
          tenantID,
          error: err && err.message,
        });
        // Continue — one failed tenant doesn't block others.
      }
    }

    logger.info("scheduledTwilioChurnCleanup: run complete", {
      totalSuspended: suspended.size,
      processed,
      skipped,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────
// forceCloseTenantTwilioSubaccount — SuperUser-only callable for immediate
// teardown. Skips the grace window. Reason is required and audit-logged.
//
// Use cases: GDPR right-to-be-forgotten, compliance deletes, accidental
// provisioning during testing. Routine churn should go through deactivate +
// scheduled cleanup so consumers still have an opt-out window.
// ─────────────────────────────────────────────────────────────────────────
exports.forceCloseTenantTwilioSubaccount = onCall(
  CHURN_FUNCTION_OPTS,
  async (request) => {
    const auth = requireAuth(request);

    const { tenantID, reason } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      throw new HttpsError(
        "invalid-argument",
        "reason is required (min 5 chars) and audit-logged."
      );
    }

    // SuperUser only (level 5). Force-close is destructive and bypasses TCPA
    // grace, so route it through the highest permission level on purpose.
    await requireTenantMemberWithLevel(tenantID, request, 5);

    logger.info("forceCloseTenantTwilioSubaccount: starting", {
      tenantID,
      reason,
      uid: auth.uid,
    });

    const db = getFirestore();
    const summary = await teardownTenantTwilio(db, tenantID, {
      actorUID: auth.uid,
      reason,
      force: true,
    });

    return summary;
  }
);
