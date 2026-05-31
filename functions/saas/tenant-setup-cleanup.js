/* eslint-disable */
// Firestore trigger: when a /tenant_account_setup/{normalizedEmail} doc is
// deleted, close the pre-tenant Twilio subaccount (if any) and destroy its
// auth-token secret. Without this, an expired or admin-deleted setup doc
// leaves a live (billable) subaccount on the master Twilio account with no
// pointer to it from our side.
//
// Fires for any deletion path:
//   - Firestore TTL expiry on `expiresAt` (the 30-day prospect window)
//   - Manual deletion by a platform admin (rejecting / cleaning up an
//     abandoned signup)
//   - Future: programmatic delete from a host-site admin tool
//
// Adoption safety: when a tenant is provisioned from a setup doc, the
// adoption code MUST stamp `twilioSubaccountStatus: "adopted"` on the
// setup doc BEFORE deleting it. The trigger short-circuits on that
// status so the live subaccount (now owned by the tenant) isn't closed.
// If the adoption code forgets, the safety net closes the subaccount the
// tenant is actively using — so the contract goes both ways. Match
// against the literal string here, not a constant, so an accidental
// rename in the adoption code surfaces as a fired cleanup rather than
// a silent skip.
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
} = require("./twilio-common");
const {
  _internals: { destroyPreTenantSubaccountInternal },
} = require("./twilio-subaccounts");

if (!admin.apps.length) admin.initializeApp();

exports.onTenantSetupDocDeleted = onDocumentDeleted(
  {
    region: "us-central1",
    document: "tenant_account_setup/{normalizedEmail}",
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async (event) => {
    const normalizedEmail = event.params?.normalizedEmail;
    const data = event.data?.data() || {};

    if (data.twilioSubaccountStatus === "adopted") {
      logger.info("onTenantSetupDocDeleted: skipping adopted subaccount", {
        normalizedEmail,
        subaccountSid: data.twilioSubaccountSid,
      });
      return;
    }

    const subaccountSid = data.twilioSubaccountSid || null;
    if (!subaccountSid) {
      logger.info("onTenantSetupDocDeleted: no subaccount to clean up", {
        normalizedEmail,
      });
      return;
    }

    logger.info("onTenantSetupDocDeleted: closing orphan subaccount", {
      normalizedEmail,
      subaccountSid,
    });

    try {
      await destroyPreTenantSubaccountInternal({
        normalizedEmail,
        subaccountSid,
      });
    } catch (err) {
      // Don't rethrow — Firestore deletes aren't retriable, so a thrown
      // error just drops the cleanup attempt without recovery. Log loud
      // enough to be caught by alerting.
      logger.error("onTenantSetupDocDeleted: cleanup failed", {
        normalizedEmail,
        subaccountSid,
        error: err && err.message,
      });
    }
  }
);
