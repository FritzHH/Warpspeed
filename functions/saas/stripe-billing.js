/* eslint-disable */
// Phase 3 — Stripe Billing callables (platform-account subscriptions).
//
// These manage the RSS→tenant $X/mo subscription on the cadence-pos
// platform Stripe account. NOT Connect — Connect is the separate tenant→
// customer charging path. Tenant doc carries denormalized state mirrored
// from Stripe via the billing webhook.
//
// Auth model:
//   - Customer/SetupIntent/PM/Sub/Invoice callables → OWNER on matching tenant.
//     Reason: tenant owners enter their own card; platform admin must not
//     proxy their payment info.
//   - Change tier / cancel sub → PLATFORM ADMIN only.
//     Reason: tier changes carry billing implications and need centralized
//     oversight; teardown lives entirely on the platform side.
//
// All callables refuse if the tenant is on per_sale billing — those tenants
// pay via Connect application_fee_amount, not via a subscription here.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");
const {
  assertTenantMatch,
  assertPrivilege,
  assertPlatformAdmin,
} = require("./auth-guards");
const { getTierDoc, getTenantOrThrow } = require("./billing-helpers");

if (!admin.apps.length) admin.initializeApp();

const STRIPE_PLATFORM_SECRET_KEY = defineSecret("STRIPE_PLATFORM_SECRET_KEY");

const TIER_COLLECTION = "platform-billing-tiers";

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

function assertMonthlySubTenant(tenantData, tenantID) {
  if (tenantData.billingModel !== "monthly_sub") {
    throw new HttpsError(
      "failed-precondition",
      `Tenant ${tenantID} is on ${tenantData.billingModel || "no"} billing — billing callables only apply to monthly_sub tenants.`
    );
  }
}

// Idempotent customer creation on the platform account. Persists
// stripeBillingCustomerID on the tenant doc; subsequent calls return the
// existing ID without hitting Stripe.
async function getOrCreateBillingCustomer(stripe, db, tenantID, tenantData) {
  if (tenantData.stripeBillingCustomerID) {
    return tenantData.stripeBillingCustomerID;
  }
  if (!tenantData.ownerEmail) {
    throw new HttpsError(
      "failed-precondition",
      `Tenant ${tenantID} has no ownerEmail — cannot create Stripe Customer.`
    );
  }

  const customer = await stripe.customers.create({
    email: tenantData.ownerEmail,
    name: tenantData.name || tenantID,
    metadata: {
      tenantID,
      ownerUID: tenantData.ownerUID || "",
    },
  });

  await db.collection("tenants").doc(tenantID).update({
    stripeBillingCustomerID: customer.id,
    stripeBillingCustomerCreatedAt: FieldValue.serverTimestamp(),
  });

  logger.info("getOrCreateBillingCustomer: created customer", {
    tenantID,
    stripeBillingCustomerID: customer.id,
  });

  return customer.id;
}

// ─────────────────────────────────────────────────────────────────────────
// Customer create — explicit, owner-only. Used by Phase 4 UI before showing
// the Elements form so we can pass the customer to the SetupIntent.
// ─────────────────────────────────────────────────────────────────────────
exports.stripeBillingCreateCustomerCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "owner");

    const db = getFirestore();
    const { ref, data } = await getTenantOrThrow(db, tenantID);

    const stripe = getStripe();
    const stripeBillingCustomerID = await getOrCreateBillingCustomer(
      stripe,
      db,
      tenantID,
      data
    );

    return { success: true, stripeBillingCustomerID };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// SetupIntent — returns clientSecret for Stripe Elements to attach a card.
// usage: "off_session" so the saved PM can be charged by recurring invoices
// without the customer present.
// ─────────────────────────────────────────────────────────────────────────
exports.stripeBillingCreateSetupIntentCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "owner");

    const db = getFirestore();
    const { data } = await getTenantOrThrow(db, tenantID);

    const stripe = getStripe();
    const customerID = await getOrCreateBillingCustomer(stripe, db, tenantID, data);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerID,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { tenantID },
    });

    logger.info("stripeBillingCreateSetupIntentCallable: created", {
      tenantID,
      setupIntentID: setupIntent.id,
    });

    return {
      success: true,
      clientSecret: setupIntent.client_secret,
      setupIntentID: setupIntent.id,
      stripeBillingCustomerID: customerID,
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Subscription create — owner-only. After Elements confirms the SetupIntent,
// the client calls this with the resulting paymentMethodID + chosen tierID.
// Stripe handles SCA via payment_behavior: "default_incomplete" + the PI's
// client_secret that the client confirms separately if needed.
// ─────────────────────────────────────────────────────────────────────────
exports.stripeBillingCreateSubscriptionCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    const { tenantID, tierID, paymentMethodID } = request.data || {};
    if (!tenantID || !tierID || !paymentMethodID) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID, tierID, and paymentMethodID are required."
      );
    }
    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "owner");

    const db = getFirestore();
    const { ref, data } = await getTenantOrThrow(db, tenantID);
    assertMonthlySubTenant(data, tenantID);

    if (data.stripeSubscriptionID) {
      throw new HttpsError(
        "already-exists",
        `Tenant ${tenantID} already has subscription ${data.stripeSubscriptionID}. Use change-tier to swap plans.`
      );
    }

    const tier = await getTierDoc(db, tierID, { allowArchived: false });

    const stripe = getStripe();
    const customerID = await getOrCreateBillingCustomer(stripe, db, tenantID, data);

    // Attach PM to customer (idempotent: Stripe no-ops if already attached to
    // the same customer; rejects if attached to a different customer, which
    // would only happen on a copy/paste error from another tenant).
    try {
      await stripe.paymentMethods.attach(paymentMethodID, { customer: customerID });
    } catch (err) {
      if (!err || err.code !== "resource_already_exists") {
        logger.error("stripeBillingCreateSubscriptionCallable: PM attach failed", {
          tenantID,
          paymentMethodID,
          error: err && err.message,
        });
        throw new HttpsError("failed-precondition", err.message || "PM attach failed.");
      }
    }

    await stripe.customers.update(customerID, {
      invoice_settings: { default_payment_method: paymentMethodID },
    });

    let subscription;
    try {
      subscription = await stripe.subscriptions.create({
        customer: customerID,
        items: [{ price: tier.stripePriceID }],
        default_payment_method: paymentMethodID,
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent"],
        metadata: {
          tenantID,
          tierID,
          createdByUID: auth.uid,
        },
      });
    } catch (err) {
      logger.error("stripeBillingCreateSubscriptionCallable: sub create failed", {
        tenantID,
        tierID,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Subscription create failed.");
    }

    // Persist mirrored state. Webhook will overwrite subscriptionStatus when
    // the first invoice settles — but write what we know now so the dashboard
    // doesn't show null briefly.
    await ref.update({
      subscriptionTierID: tierID,
      stripeSubscriptionID: subscription.id,
      stripeSubscriptionPriceID: tier.stripePriceID,
      subscriptionStatus: subscription.status,
      subscriptionStartedAt: FieldValue.serverTimestamp(),
    });

    const latestInvoice = subscription.latest_invoice || null;
    const paymentIntent = latestInvoice && latestInvoice.payment_intent
      ? latestInvoice.payment_intent
      : null;

    logger.info("stripeBillingCreateSubscriptionCallable: created", {
      tenantID,
      tierID,
      subscriptionID: subscription.id,
      status: subscription.status,
    });

    return {
      success: true,
      subscriptionID: subscription.id,
      status: subscription.status,
      clientSecret:
        paymentIntent && paymentIntent.client_secret ? paymentIntent.client_secret : null,
      paymentIntentStatus: paymentIntent ? paymentIntent.status : null,
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Change tier — platform admin only. Swaps the subscription item to a new
// Price, prorating by default. Stripe issues a prorated invoice for the
// remaining cycle.
// ─────────────────────────────────────────────────────────────────────────
exports.stripeBillingChangeTenantTierCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, newTierID, prorationBehavior } = request.data || {};
    if (!tenantID || !newTierID) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID and newTierID are required."
      );
    }
    const proration =
      prorationBehavior === "none" ||
      prorationBehavior === "create_prorations" ||
      prorationBehavior === "always_invoice"
        ? prorationBehavior
        : "create_prorations";

    const db = getFirestore();
    const { ref, data } = await getTenantOrThrow(db, tenantID);
    assertMonthlySubTenant(data, tenantID);
    if (!data.stripeSubscriptionID) {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} has no active subscription to swap.`
      );
    }
    if (data.subscriptionTierID === newTierID) {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} is already on tier ${newTierID}.`
      );
    }

    const newTier = await getTierDoc(db, newTierID, { allowArchived: false });

    const stripe = getStripe();
    let sub;
    try {
      sub = await stripe.subscriptions.retrieve(data.stripeSubscriptionID);
    } catch (err) {
      logger.error("stripeBillingChangeTenantTierCallable: sub retrieve failed", {
        tenantID,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Subscription lookup failed.");
    }

    const itemID =
      sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].id;
    if (!itemID) {
      throw new HttpsError(
        "internal",
        "Subscription has no items — cannot determine which item to swap."
      );
    }

    let updated;
    try {
      updated = await stripe.subscriptions.update(data.stripeSubscriptionID, {
        items: [{ id: itemID, price: newTier.stripePriceID }],
        proration_behavior: proration,
        metadata: {
          ...(sub.metadata || {}),
          tenantID,
          tierID: newTierID,
          tierChangedByUID: auth.uid,
        },
      });
    } catch (err) {
      logger.error("stripeBillingChangeTenantTierCallable: sub update failed", {
        tenantID,
        newTierID,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Subscription update failed.");
    }

    await ref.update({
      subscriptionTierID: newTierID,
      stripeSubscriptionPriceID: newTier.stripePriceID,
      subscriptionStatus: updated.status,
      subscriptionTierChangedAt: FieldValue.serverTimestamp(),
    });

    logger.info("stripeBillingChangeTenantTierCallable: tier changed", {
      tenantID,
      newTierID,
      newPriceID: newTier.stripePriceID,
      proration,
      uid: auth.uid,
    });

    return {
      success: true,
      subscriptionID: updated.id,
      tierID: newTierID,
      status: updated.status,
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// List payment methods. Returns the card list with last4/brand/exp and an
// isDefault flag so the UI can render a manage-cards screen.
// ─────────────────────────────────────────────────────────────────────────
exports.stripeBillingListPaymentMethodsCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "owner");

    const db = getFirestore();
    const { data } = await getTenantOrThrow(db, tenantID);

    if (!data.stripeBillingCustomerID) {
      return { success: true, paymentMethods: [], defaultPaymentMethodID: null };
    }

    const stripe = getStripe();
    const [pmList, customer] = await Promise.all([
      stripe.paymentMethods.list({
        customer: data.stripeBillingCustomerID,
        type: "card",
      }),
      stripe.customers.retrieve(data.stripeBillingCustomerID),
    ]);

    const defaultPMID =
      (customer.invoice_settings && customer.invoice_settings.default_payment_method) ||
      null;

    const paymentMethods = (pmList.data || []).map((pm) => ({
      id: pm.id,
      brand: (pm.card && pm.card.brand) || "",
      last4: (pm.card && pm.card.last4) || "",
      expMonth: (pm.card && pm.card.exp_month) || null,
      expYear: (pm.card && pm.card.exp_year) || null,
      isDefault: pm.id === defaultPMID,
    }));

    return {
      success: true,
      paymentMethods,
      defaultPaymentMethodID: defaultPMID,
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Detach a payment method. Refuses if it's the only PM AND the sub is active
// — that would leave the next invoice with no charge target.
// ─────────────────────────────────────────────────────────────────────────
exports.stripeBillingDetachPaymentMethodCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    const { tenantID, paymentMethodID } = request.data || {};
    if (!tenantID || !paymentMethodID) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID and paymentMethodID are required."
      );
    }
    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "owner");

    const db = getFirestore();
    const { data } = await getTenantOrThrow(db, tenantID);
    if (!data.stripeBillingCustomerID) {
      throw new HttpsError("not-found", "Tenant has no billing customer.");
    }

    const stripe = getStripe();
    const pmList = await stripe.paymentMethods.list({
      customer: data.stripeBillingCustomerID,
      type: "card",
    });
    const hasOtherPM = (pmList.data || []).some(
      (pm) => pm.id !== paymentMethodID
    );

    // Guard: don't strand a billing-active tenant with no card. For monthly_sub
    // that's an active subscription; for per_sale it's an active billing model
    // where the next fee invoice would have nothing to charge.
    if (!hasOtherPM && data.subscriptionStatus === "active") {
      throw new HttpsError(
        "failed-precondition",
        "Cannot remove the only payment method while billing is active. Add a new card first."
      );
    }
    if (!hasOtherPM && data.billingModel === "per_sale") {
      throw new HttpsError(
        "failed-precondition",
        "Cannot remove the only payment method while on per-sale billing. Add a new card first."
      );
    }

    await stripe.paymentMethods.detach(paymentMethodID);

    logger.info("stripeBillingDetachPaymentMethodCallable: detached", {
      tenantID,
      paymentMethodID,
      uid: auth.uid,
    });

    return { success: true, paymentMethodID };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Update default payment method — both customer + subscription default. Used
// when the owner picks a new card from a multi-card list.
// ─────────────────────────────────────────────────────────────────────────
exports.stripeBillingUpdateDefaultPaymentMethodCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    const { tenantID, paymentMethodID } = request.data || {};
    if (!tenantID || !paymentMethodID) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID and paymentMethodID are required."
      );
    }
    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "owner");

    const db = getFirestore();
    const { data } = await getTenantOrThrow(db, tenantID);
    if (!data.stripeBillingCustomerID) {
      throw new HttpsError("not-found", "Tenant has no billing customer.");
    }

    const stripe = getStripe();
    await stripe.customers.update(data.stripeBillingCustomerID, {
      invoice_settings: { default_payment_method: paymentMethodID },
    });

    if (data.stripeSubscriptionID) {
      try {
        await stripe.subscriptions.update(data.stripeSubscriptionID, {
          default_payment_method: paymentMethodID,
        });
      } catch (err) {
        logger.error(
          "stripeBillingUpdateDefaultPaymentMethodCallable: sub PM update failed (customer-level still set)",
          { tenantID, error: err && err.message }
        );
      }
    }

    logger.info("stripeBillingUpdateDefaultPaymentMethodCallable: updated", {
      tenantID,
      paymentMethodID,
      uid: auth.uid,
    });

    return { success: true, paymentMethodID };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// List invoices. Returns the most recent N invoices for tenant billing UI.
// Hosted URL is what Stripe sends in the email — links to a downloadable
// PDF + receipt page.
// ─────────────────────────────────────────────────────────────────────────
const INVOICE_LIST_MAX = 50;
exports.stripeBillingListInvoicesCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    const { tenantID, limit } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    assertTenantMatch(auth, tenantID);
    assertPrivilege(auth, "owner");

    let cappedLimit = 12;
    if (limit != null) {
      const num = Number(limit);
      if (Number.isFinite(num) && num > 0) {
        cappedLimit = Math.min(Math.floor(num), INVOICE_LIST_MAX);
      }
    }

    const db = getFirestore();
    const { data } = await getTenantOrThrow(db, tenantID);
    if (!data.stripeBillingCustomerID) {
      return { success: true, invoices: [] };
    }

    const stripe = getStripe();
    const list = await stripe.invoices.list({
      customer: data.stripeBillingCustomerID,
      limit: cappedLimit,
    });

    const invoices = (list.data || []).map((inv) => ({
      id: inv.id,
      number: inv.number || null,
      status: inv.status,
      amountDue: inv.amount_due,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      created: inv.created,
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      paidAt: inv.status_transitions ? inv.status_transitions.paid_at : null,
      hostedInvoiceURL: inv.hosted_invoice_url || null,
      invoicePDF: inv.invoice_pdf || null,
    }));

    return { success: true, invoices };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Cancel subscription — platform admin only. Two modes:
//   - "at_period_end": sub continues until current period ends; no refund
//   - "immediate": cancels now; Stripe pro-rates a credit if proration enabled
// Webhook customer.subscription.deleted will clear state when the cancel
// actually takes effect.
// ─────────────────────────────────────────────────────────────────────────
exports.stripeBillingCancelSubscriptionCallable = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, mode } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    const cancelMode = mode === "immediate" ? "immediate" : "at_period_end";

    const db = getFirestore();
    const { ref, data } = await getTenantOrThrow(db, tenantID);
    assertMonthlySubTenant(data, tenantID);
    if (!data.stripeSubscriptionID) {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} has no active subscription to cancel.`
      );
    }

    const stripe = getStripe();
    let result;
    try {
      if (cancelMode === "immediate") {
        result = await stripe.subscriptions.cancel(data.stripeSubscriptionID);
      } else {
        result = await stripe.subscriptions.update(data.stripeSubscriptionID, {
          cancel_at_period_end: true,
          metadata: {
            tenantID,
            canceledByUID: auth.uid,
          },
        });
      }
    } catch (err) {
      logger.error("stripeBillingCancelSubscriptionCallable: failed", {
        tenantID,
        mode: cancelMode,
        error: err && err.message,
      });
      throw new HttpsError("internal", err.message || "Cancel failed.");
    }

    const update = {
      subscriptionStatus: result.status,
      subscriptionCanceledByUID: auth.uid,
      subscriptionCanceledAt: FieldValue.serverTimestamp(),
    };
    if (cancelMode === "at_period_end") {
      update.subscriptionCancelAtPeriodEnd = true;
    }
    await ref.update(update);

    logger.info("stripeBillingCancelSubscriptionCallable: canceled", {
      tenantID,
      mode: cancelMode,
      status: result.status,
      uid: auth.uid,
    });

    return {
      success: true,
      mode: cancelMode,
      status: result.status,
      subscriptionID: result.id,
    };
  }
);
