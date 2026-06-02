/* eslint-disable */
// Firestore trigger: when a completed-sale doc is written, stamp the
// fee-snapshot fields the semi-monthly accumulation invoicer reads:
//
//   billingModelSnapshot       (always "per_sale" when stamped)
//   platformFeePercentSnapshot (locked at point-of-sale)
//   feeBillingPeriodKey        ("YYYY-MM-1H" / "YYYY-MM-2H", America/Chicago)
//
// Lives as a trigger because SaaS sale completion happens client-side via
// newCheckoutFirebaseCalls.js — there's no single server-side write point
// to hook. Trigger-side stamping also works for any future server-side
// completion path without duplicating logic.
//
// Idempotent: skips docs already carrying feeBillingPeriodKey so a
// future server-side write that stamps inline isn't double-written, and
// retries of this trigger don't drift the snapshot. Non-per_sale tenants
// short-circuit with no write (monthly_sub bills via Stripe subscription;
// nothing to accumulate).
//
// Safety: errors are logged but not rethrown. A failed stamp leaves the
// doc without the snapshot — the invoicer's safety net (sales missing the
// key but matching the period millis) catches stragglers, and an alert
// fires off the error log if drift accumulates.

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { resolveSaleFeeSnapshot } = require("./billing-helpers");

if (!admin.apps.length) admin.initializeApp();

exports.onCompletedSaleCreated = onDocumentCreated(
  {
    region: "us-central1",
    document: "tenants/{tenantID}/stores/{storeID}/completed-sales/{saleID}",
  },
  async (event) => {
    const tenantID = event.params?.tenantID;
    const storeID = event.params?.storeID;
    const saleID = event.params?.saleID;
    const data = event.data?.data() || {};

    if (data.feeBillingPeriodKey) {
      logger.info("onCompletedSaleCreated: already stamped, skipping", {
        tenantID,
        storeID,
        saleID,
        feeBillingPeriodKey: data.feeBillingPeriodKey,
      });
      return;
    }

    const completedAtMillis = Number(data.millis) || Date.now();

    let snapshot;
    try {
      snapshot = await resolveSaleFeeSnapshot(
        admin.firestore(),
        tenantID,
        completedAtMillis
      );
    } catch (err) {
      logger.error("onCompletedSaleCreated: snapshot resolve failed", {
        tenantID,
        storeID,
        saleID,
        error: err && err.message,
      });
      return;
    }

    if (!snapshot) {
      logger.info("onCompletedSaleCreated: non-per_sale tenant, skipping", {
        tenantID,
        storeID,
        saleID,
      });
      return;
    }

    try {
      await event.data.ref.update(snapshot);
      logger.info("onCompletedSaleCreated: stamped", {
        tenantID,
        storeID,
        saleID,
        feeBillingPeriodKey: snapshot.feeBillingPeriodKey,
        platformFeePercentSnapshot: snapshot.platformFeePercentSnapshot,
      });
    } catch (err) {
      logger.error("onCompletedSaleCreated: stamp write failed", {
        tenantID,
        storeID,
        saleID,
        error: err && err.message,
      });
    }
  }
);
