/* eslint-disable */
/**
 * BillingModalScreen — tenant-owner SaaS subscription UI.
 *
 * Phase 4 of the SaaS billing rollout. Renders only for monthly_sub tenants
 * with privilege === "owner". Pulls live tenant doc + assigned tier via
 * Firestore listeners; uses the 6 tenant-side stripeBilling* callables for
 * Stripe state (PMs, subscription create, invoices). Tier change and
 * cancellation are NOT exposed here — those are platform-admin only.
 *
 * Layout: tabbed card, three tabs
 *   - Overview: status badge, tier card, default payment method
 *   - Payment methods: full list with add/remove/set-default
 *   - Invoices: history with hosted invoice links
 *
 * Stripe Elements lifecycle for adding a card:
 *   1. Call stripeBillingCreateSetupIntentCallable → client_secret
 *   2. confirmCardSetup with the CardNumber/Expiry/Cvc Elements
 *   3. If no subscription exists, prompt to start one with the saved PM
 *      (stripeBillingCreateSubscriptionCallable); if SCA required, confirm
 *      the returned PaymentIntent client_secret via confirmCardPayment
 *   4. If subscription exists, call updateDefaultPaymentMethod
 */
import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import dayjs from "dayjs";
import { Dialog, LoadingIndicator, LargeModalHeader, LargeModalHeaderButton } from "../../../../dom_components";
import { C } from "../../../../styles";
import { DB, FUNCTIONS } from "../../../../db_calls";
import { STRIPE_PUBLISHABLE_KEY } from "../../../../private_user_constants";
import { useLoginStore } from "../../../../stores";
import styles from "./BillingModalScreen.module.css";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const createSetupIntentCallable = httpsCallable(FUNCTIONS, "stripeBillingCreateSetupIntentCallable");
const createSubscriptionCallable = httpsCallable(FUNCTIONS, "stripeBillingCreateSubscriptionCallable");
const listPaymentMethodsCallable = httpsCallable(FUNCTIONS, "stripeBillingListPaymentMethodsCallable");
const detachPaymentMethodCallable = httpsCallable(FUNCTIONS, "stripeBillingDetachPaymentMethodCallable");
const updateDefaultPMCallable = httpsCallable(FUNCTIONS, "stripeBillingUpdateDefaultPaymentMethodCallable");
const listInvoicesCallable = httpsCallable(FUNCTIONS, "stripeBillingListInvoicesCallable");

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "payment", label: "Payment Methods" },
  { key: "invoices", label: "Invoices" },
];

const STATUS_LABEL = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past Due",
  canceled: "Canceled",
  unpaid: "Unpaid",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
};

const STATUS_TONE = {
  trialing: "info",
  active: "success",
  past_due: "warning",
  canceled: "danger",
  unpaid: "danger",
  incomplete: "warning",
  incomplete_expired: "danger",
};

const STRIPE_ELEMENT_STYLE = {
  base: {
    fontSize: "14px",
    color: "#333",
    "::placeholder": { color: "rgb(192,192,192)" },
  },
  invalid: { color: "#e53e3e" },
};
const STRIPE_ELEMENT_OPTIONS = { style: STRIPE_ELEMENT_STYLE };

function formatUSD(cents, currency = "usd") {
  if (typeof cents !== "number") return "—";
  const amount = cents / 100;
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  const ms = typeof ts === "number" ? ts * 1000 : ts;
  return dayjs(ms).format("MMM D, YYYY");
}

function formatGraceCountdown(untilMs) {
  if (!untilMs) return "";
  const diffMs = untilMs - Date.now();
  if (diffMs <= 0) return "expired";
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

export const BillingModalScreen = ({ handleExit }) => {
  return (
    <Elements stripe={stripePromise}>
      <BillingModalInner handleExit={handleExit} />
    </Elements>
  );
};

function BillingModalInner({ handleExit }) {
  const zAuthClaims = useLoginStore((state) => state.authClaims);
  const tenantID = zAuthClaims?.tenantID || null;

  const [sActiveTab, _setActiveTab] = useState("overview");
  const [sTenantDoc, _setTenantDoc] = useState(null);
  const [sTenantErr, _setTenantErr] = useState("");
  const [sTier, _setTier] = useState(null);

  const [sPMs, _setPMs] = useState([]);
  const [sDefaultPMID, _setDefaultPMID] = useState(null);
  const [sPMLoading, _setPMLoading] = useState(false);
  const [sPMError, _setPMError] = useState("");

  const [sInvoices, _setInvoices] = useState([]);
  const [sInvoicesLoading, _setInvoicesLoading] = useState(false);
  const [sInvoicesError, _setInvoicesError] = useState("");

  const [sShowAddCard, _setShowAddCard] = useState(false);
  const [sBusy, _setBusy] = useState(false);
  const [sBanner, _setBanner] = useState(null);

  useEffect(() => {
    if (!tenantID) return;
    const ref = doc(DB, "tenants", tenantID);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          _setTenantErr("Tenant document not found.");
          return;
        }
        _setTenantDoc({ id: snap.id, ...snap.data() });
      },
      (err) => _setTenantErr(err?.message || "Failed to load tenant.")
    );
    return () => unsub();
  }, [tenantID]);

  useEffect(() => {
    const tierID = sTenantDoc?.subscriptionTierID;
    if (!tierID) {
      _setTier(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(DB, "platform-billing-tiers", tierID))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          _setTier({ id: snap.id, ...snap.data() });
        } else {
          _setTier(null);
        }
      })
      .catch(() => {
        if (!cancelled) _setTier(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sTenantDoc?.subscriptionTierID]);

  function refreshPaymentMethods() {
    if (!tenantID) return;
    _setPMLoading(true);
    _setPMError("");
    listPaymentMethodsCallable({ tenantID })
      .then((res) => {
        _setPMs(res.data?.paymentMethods || []);
        _setDefaultPMID(res.data?.defaultPaymentMethodID || null);
      })
      .catch((err) => _setPMError(err?.message || "Failed to load payment methods."))
      .finally(() => _setPMLoading(false));
  }

  function refreshInvoices() {
    if (!tenantID) return;
    _setInvoicesLoading(true);
    _setInvoicesError("");
    listInvoicesCallable({ tenantID, limit: 24 })
      .then((res) => _setInvoices(res.data?.invoices || []))
      .catch((err) => _setInvoicesError(err?.message || "Failed to load invoices."))
      .finally(() => _setInvoicesLoading(false));
  }

  useEffect(() => {
    if (!tenantID) return;
    if (sActiveTab === "overview" || sActiveTab === "payment") refreshPaymentMethods();
    if (sActiveTab === "invoices") refreshInvoices();
  }, [tenantID, sActiveTab]);

  const billingModel = sTenantDoc?.billingModel || null;
  const subscriptionStatus = sTenantDoc?.subscriptionStatus || null;
  const subscriptionID = sTenantDoc?.stripeSubscriptionID || null;
  const graceUntil = sTenantDoc?.subscriptionGraceUntil || null;
  const cancelAtPeriodEnd = sTenantDoc?.subscriptionCancelAtPeriodEnd === true;

  const isMonthlySub = billingModel === "monthly_sub";
  const isPerSale = billingModel === "per_sale";
  const inGrace = subscriptionStatus === "past_due" && typeof graceUntil === "number" && graceUntil > Date.now();
  const graceExpired = subscriptionStatus === "past_due" && typeof graceUntil === "number" && graceUntil <= Date.now();

  function setBanner(tone, text) {
    _setBanner({ tone, text });
    if (tone === "success") setTimeout(() => _setBanner(null), 4000);
  }

  async function handleSetDefault(pmID) {
    if (sBusy || !tenantID) return;
    _setBusy(true);
    try {
      await updateDefaultPMCallable({ tenantID, paymentMethodID: pmID });
      setBanner("success", "Default payment method updated.");
      refreshPaymentMethods();
    } catch (err) {
      setBanner("danger", err?.message || "Failed to update default payment method.");
    } finally {
      _setBusy(false);
    }
  }

  async function handleDetach(pmID) {
    if (sBusy || !tenantID) return;
    if (!window.confirm("Remove this card from your account?")) return;
    _setBusy(true);
    try {
      await detachPaymentMethodCallable({ tenantID, paymentMethodID: pmID });
      setBanner("success", "Card removed.");
      refreshPaymentMethods();
    } catch (err) {
      setBanner("danger", err?.message || "Failed to remove card.");
    } finally {
      _setBusy(false);
    }
  }

  if (!tenantID) {
    return (
      <Dialog visible={true} onClose={handleExit}>
        <div className={styles.card}>
          <LargeModalHeader
            title="Subscription"
            actions={
              <LargeModalHeaderButton variant="default" onClick={handleExit}>
                CLOSE
              </LargeModalHeaderButton>
            }
          />
          <div className={styles.body}>
            <div className={styles.errorWrap}>
              <span style={{ color: C.red, fontSize: 14 }}>Not signed in.</span>
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  if (sTenantErr) {
    return (
      <Dialog visible={true} onClose={handleExit}>
        <div className={styles.card}>
          <LargeModalHeader
            title="Subscription"
            actions={
              <LargeModalHeaderButton variant="default" onClick={handleExit}>
                CLOSE
              </LargeModalHeaderButton>
            }
          />
          <div className={styles.body}>
            <div className={styles.errorWrap}>
              <span style={{ color: C.red, fontSize: 14 }}>{sTenantErr}</span>
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  if (!sTenantDoc) {
    return (
      <Dialog visible={true} onClose={handleExit}>
        <div className={styles.card}>
          <LargeModalHeader
            title="Subscription"
            actions={
              <LargeModalHeaderButton variant="default" onClick={handleExit}>
                CLOSE
              </LargeModalHeaderButton>
            }
          />
          <div className={styles.body}>
            <div className={styles.loadingWrap}>
              <LoadingIndicator size="large" color={C.blue} message="Loading billing..." />
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  if (isPerSale) {
    return (
      <Dialog visible={true} onClose={handleExit}>
        <div className={styles.card}>
          <LargeModalHeader
            title={
              <div className={styles.headerLeft}>
                <span className={styles.title}>Subscription</span>
                <span className={styles.subtitle}>Per-sale billing tenant</span>
              </div>
            }
            actions={
              <LargeModalHeaderButton variant="default" onClick={handleExit}>
                CLOSE
              </LargeModalHeaderButton>
            }
          />
          <div className={styles.body}>
            <div className={styles.perSaleNotice}>
              <div className={styles.perSaleTitle}>You are on per-sale billing.</div>
              <div className={styles.perSaleText}>
                Cadence collects {typeof sTenantDoc.platformFeePercent === "number" ? sTenantDoc.platformFeePercent : "—"}% on
                each successful transaction. There is no monthly subscription to manage.
              </div>
              <div className={styles.perSaleText}>
                For billing questions, contact your Cadence account representative.
              </div>
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  if (!isMonthlySub) {
    return (
      <Dialog visible={true} onClose={handleExit}>
        <div className={styles.card}>
          <LargeModalHeader
            title="Subscription"
            actions={
              <LargeModalHeaderButton variant="default" onClick={handleExit}>
                CLOSE
              </LargeModalHeaderButton>
            }
          />
          <div className={styles.body}>
            <div className={styles.errorWrap}>
              <span style={{ color: C.red, fontSize: 14 }}>
                No billing model is configured for this tenant. Contact Cadence support.
              </span>
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog visible={true} onClose={handleExit}>
      <div className={styles.card}>
        <LargeModalHeader
          title={
            <div className={styles.headerLeft}>
              <span className={styles.title}>Subscription</span>
              <span className={styles.subtitle}>
                {sTenantDoc.name || tenantID}
              </span>
            </div>
          }
          actions={
            <LargeModalHeaderButton variant="default" onClick={handleExit}>
              CLOSE
            </LargeModalHeaderButton>
          }
        />

        <div className={styles.tabBar} style={{ borderBottomColor: C.borderStrong }}>
          {TABS.map((t) => {
            const active = sActiveTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => _setActiveTab(t.key)}
                className={styles.tab}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: active ? "3px solid " + C.orange : "3px solid transparent",
                  color: active ? C.orange : C.textSecondary,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {sBanner && (
          <div
            className={styles.banner}
            style={{
              backgroundColor: sBanner.tone === "success" ? C.lightGreen : sBanner.tone === "danger" ? C.lightRed : C.lightYellow,
              color: C.text,
            }}
          >
            {sBanner.text}
          </div>
        )}

        {graceExpired && (
          <div className={styles.banner} style={{ backgroundColor: C.lightRed, color: C.text }}>
            Subscription is past due and the grace period has expired. Update your payment method to restore service.
          </div>
        )}
        {inGrace && (
          <div className={styles.banner} style={{ backgroundColor: C.lightYellow, color: C.text }}>
            Payment failed. Grace period: {formatGraceCountdown(graceUntil)} before service is suspended.
          </div>
        )}

        <div className={styles.body}>
          {sActiveTab === "overview" && (
            <OverviewTab
              tenant={sTenantDoc}
              tier={sTier}
              subscriptionStatus={subscriptionStatus}
              subscriptionID={subscriptionID}
              cancelAtPeriodEnd={cancelAtPeriodEnd}
              defaultPMID={sDefaultPMID}
              pms={sPMs}
              pmLoading={sPMLoading}
              pmError={sPMError}
              onAddCard={() => _setShowAddCard(true)}
              onManagePM={() => _setActiveTab("payment")}
            />
          )}
          {sActiveTab === "payment" && (
            <PaymentMethodsTab
              tenant={sTenantDoc}
              tier={sTier}
              subscriptionID={subscriptionID}
              defaultPMID={sDefaultPMID}
              pms={sPMs}
              loading={sPMLoading}
              error={sPMError}
              busy={sBusy}
              onSetDefault={handleSetDefault}
              onDetach={handleDetach}
              onAddCard={() => _setShowAddCard(true)}
              onRefresh={refreshPaymentMethods}
            />
          )}
          {sActiveTab === "invoices" && (
            <InvoicesTab
              invoices={sInvoices}
              loading={sInvoicesLoading}
              error={sInvoicesError}
              onRefresh={refreshInvoices}
            />
          )}
        </div>

        {sShowAddCard && (
          <AddCardModal
            tenantID={tenantID}
            tier={sTier}
            hasSubscription={!!subscriptionID}
            onClose={() => _setShowAddCard(false)}
            onSuccess={(msg) => {
              setBanner("success", msg);
              _setShowAddCard(false);
              refreshPaymentMethods();
            }}
            onError={(msg) => setBanner("danger", msg)}
          />
        )}
      </div>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────
// Overview tab
// ────────────────────────────────────────────────────────────

function OverviewTab({
  tenant,
  tier,
  subscriptionStatus,
  subscriptionID,
  cancelAtPeriodEnd,
  defaultPMID,
  pms,
  pmLoading,
  pmError,
  onAddCard,
  onManagePM,
}) {
  const defaultPM = useMemo(() => pms.find((p) => p.id === defaultPMID), [pms, defaultPMID]);
  const statusLabel = subscriptionStatus ? STATUS_LABEL[subscriptionStatus] || subscriptionStatus : "Not started";
  const statusTone = subscriptionStatus ? STATUS_TONE[subscriptionStatus] || "info" : "info";

  return (
    <div className={styles.tabBody}>
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Status</div>
        <div className={styles.statusRow}>
          <span className={`${styles.badge} ${styles["badge_" + statusTone]}`}>
            {statusLabel}
          </span>
          {cancelAtPeriodEnd && (
            <span className={`${styles.badge} ${styles.badge_warning}`}>
              Cancels at period end
            </span>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Plan</div>
        {tier ? (
          <div className={styles.tierCard}>
            <div className={styles.tierLabel}>{tier.label}</div>
            <div className={styles.tierAmount}>
              {formatUSD(tier.monthlyAmount, tier.currency)}
              <span className={styles.tierSuffix}>/ month</span>
            </div>
            {tier.description && (
              <div className={styles.tierDescription}>{tier.description}</div>
            )}
          </div>
        ) : (
          <div className={styles.tierCard}>
            <div className={styles.tierLabel}>No tier assigned</div>
            <div className={styles.tierDescription}>
              Contact your Cadence account representative to assign a plan.
            </div>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Default Payment Method</div>
        {pmLoading && (
          <div className={styles.muted}>Loading...</div>
        )}
        {!pmLoading && pmError && (
          <div className={styles.errorText}>{pmError}</div>
        )}
        {!pmLoading && !pmError && defaultPM && (
          <div className={styles.pmCard}>
            <div className={styles.pmBrand}>{(defaultPM.brand || "card").toUpperCase()}</div>
            <div className={styles.pmInfo}>
              <div className={styles.pmLast4}>•••• {defaultPM.last4}</div>
              <div className={styles.pmExpiry}>
                Expires {String(defaultPM.expMonth || "").padStart(2, "0")}/{String(defaultPM.expYear || "").slice(-2)}
              </div>
            </div>
            <button type="button" className={styles.linkButton} onClick={onManagePM}>
              Manage
            </button>
          </div>
        )}
        {!pmLoading && !pmError && !defaultPM && (
          <div className={styles.emptyBlock}>
            <div className={styles.emptyText}>No payment method on file.</div>
            <button type="button" className={styles.primaryAction} onClick={onAddCard}>
              + Add card
            </button>
          </div>
        )}
      </div>

      {!subscriptionID && tier && defaultPM && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Start subscription</div>
          <div className={styles.muted}>
            Click "Manage" above to start your subscription using your saved card.
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Payment methods tab
// ────────────────────────────────────────────────────────────

function PaymentMethodsTab({
  tenant,
  tier,
  subscriptionID,
  defaultPMID,
  pms,
  loading,
  error,
  busy,
  onSetDefault,
  onDetach,
  onAddCard,
}) {
  return (
    <div className={styles.tabBody}>
      <div className={styles.tabHeader}>
        <span className={styles.sectionLabel}>Cards on file</span>
        <button type="button" className={styles.primaryAction} onClick={onAddCard} disabled={busy}>
          + Add card
        </button>
      </div>

      {loading && <div className={styles.muted}>Loading...</div>}
      {!loading && error && <div className={styles.errorText}>{error}</div>}
      {!loading && !error && pms.length === 0 && (
        <div className={styles.emptyBlock}>
          <div className={styles.emptyText}>No payment methods on file.</div>
        </div>
      )}

      {!loading && !error && pms.length > 0 && (
        <div className={styles.pmList}>
          {pms.map((pm) => (
            <div key={pm.id} className={styles.pmRow}>
              <div className={styles.pmBrand}>{(pm.brand || "card").toUpperCase()}</div>
              <div className={styles.pmInfo}>
                <div className={styles.pmLast4}>•••• {pm.last4}</div>
                <div className={styles.pmExpiry}>
                  Expires {String(pm.expMonth || "").padStart(2, "0")}/{String(pm.expYear || "").slice(-2)}
                </div>
              </div>
              {pm.isDefault && (
                <span className={`${styles.badge} ${styles.badge_success}`}>Default</span>
              )}
              <div className={styles.pmActions}>
                {!pm.isDefault && (
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => onSetDefault(pm.id)}
                    disabled={busy}
                  >
                    Set default
                  </button>
                )}
                <button
                  type="button"
                  className={styles.dangerLink}
                  onClick={() => onDetach(pm.id)}
                  disabled={busy}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Invoices tab
// ────────────────────────────────────────────────────────────

function InvoicesTab({ invoices, loading, error, onRefresh }) {
  return (
    <div className={styles.tabBody}>
      <div className={styles.tabHeader}>
        <span className={styles.sectionLabel}>Invoice history</span>
        <button type="button" className={styles.linkButton} onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading && <div className={styles.muted}>Loading...</div>}
      {!loading && error && <div className={styles.errorText}>{error}</div>}
      {!loading && !error && invoices.length === 0 && (
        <div className={styles.emptyBlock}>
          <div className={styles.emptyText}>No invoices yet.</div>
        </div>
      )}
      {!loading && !error && invoices.length > 0 && (
        <table className={styles.invoiceTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{formatTimestamp(inv.created)}</td>
                <td>{inv.number || inv.id.slice(-8)}</td>
                <td>
                  <span className={`${styles.badge} ${styles["badge_" + invoiceStatusTone(inv.status)]}`}>
                    {inv.status}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {formatUSD(inv.amountPaid || inv.amountDue, inv.currency)}
                </td>
                <td>
                  {inv.hostedInvoiceURL && (
                    <a
                      href={inv.hostedInvoiceURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.linkButton}
                    >
                      View
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function invoiceStatusTone(status) {
  if (status === "paid") return "success";
  if (status === "open" || status === "uncollectible") return "warning";
  if (status === "void") return "danger";
  return "info";
}

// ────────────────────────────────────────────────────────────
// Add card modal (Stripe Elements)
// ────────────────────────────────────────────────────────────

function AddCardModal({ tenantID, tier, hasSubscription, onClose, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();

  const [sCardholderName, _setCardholderName] = useState("");
  const [sCardComplete, _setCardComplete] = useState(false);
  const [sExpComplete, _setExpComplete] = useState(false);
  const [sCvcComplete, _setCvcComplete] = useState(false);
  const [sStartSub, _setStartSub] = useState(!hasSubscription);
  const [sBusy, _setBusy] = useState(false);
  const [sError, _setError] = useState("");

  const formReady = sCardComplete && sExpComplete && sCvcComplete && sCardholderName.trim().length > 0;
  const canSubmit = !sBusy && stripe && elements && formReady;

  async function handleSubmit() {
    if (!canSubmit) return;
    _setBusy(true);
    _setError("");

    try {
      const intentRes = await createSetupIntentCallable({ tenantID });
      const clientSecret = intentRes.data?.clientSecret;
      if (!clientSecret) {
        throw new Error("No client secret returned from server.");
      }

      const cardNumberElement = elements.getElement(CardNumberElement);
      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: { name: sCardholderName.trim() },
        },
      });

      if (error) {
        throw new Error(error.message || "Card setup failed.");
      }
      if (!setupIntent || setupIntent.status !== "succeeded") {
        throw new Error("Card setup did not complete.");
      }

      const paymentMethodID = setupIntent.payment_method;

      if (sStartSub && !hasSubscription) {
        if (!tier?.id) {
          throw new Error("No tier assigned. Contact support before starting your subscription.");
        }
        const subRes = await createSubscriptionCallable({
          tenantID,
          tierID: tier.id,
          paymentMethodID,
        });
        const subClientSecret = subRes.data?.clientSecret;
        const piStatus = subRes.data?.paymentIntentStatus;
        if (subClientSecret && piStatus !== "succeeded" && piStatus !== "requires_capture") {
          const { error: confirmErr } = await stripe.confirmCardPayment(subClientSecret);
          if (confirmErr) {
            throw new Error(confirmErr.message || "Initial payment failed.");
          }
        }
        onSuccess("Card saved and subscription started.");
        return;
      }

      if (hasSubscription) {
        await updateDefaultPMCallable({ tenantID, paymentMethodID });
        onSuccess("Card saved and set as default.");
        return;
      }

      onSuccess("Card saved.");
    } catch (err) {
      const msg = err?.message || "Could not save card.";
      _setError(msg);
      onError && onError(msg);
    } finally {
      _setBusy(false);
    }
  }

  return (
    <Dialog visible={true} onClose={sBusy ? () => {} : onClose} preventClose={sBusy}>
      <div className={styles.addCardCard}>
        <LargeModalHeader
          title="Add payment method"
          actions={[
            <LargeModalHeaderButton
              key="save"
              variant="accent"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {sBusy ? "Saving..." : sStartSub && !hasSubscription ? "Save and subscribe" : "Save card"}
            </LargeModalHeaderButton>,
            <LargeModalHeaderButton key="close" variant="default" onClick={onClose} disabled={sBusy}>
              CLOSE
            </LargeModalHeaderButton>,
          ]}
        />
        <div className={styles.addCardBody}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Cardholder name</label>
            <input
              type="text"
              className={styles.textInput}
              value={sCardholderName}
              onChange={(e) => _setCardholderName(e.target.value)}
              placeholder="Name on card"
              disabled={sBusy}
              autoFocus
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Card number</label>
            <div className={styles.stripeElement}>
              <CardNumberElement
                options={STRIPE_ELEMENT_OPTIONS}
                onChange={(e) => _setCardComplete(e.complete)}
              />
            </div>
          </div>

          <div className={styles.cardRow}>
            <div className={styles.fieldGroup} style={{ flex: 1 }}>
              <label className={styles.fieldLabel}>Expiration</label>
              <div className={styles.stripeElement}>
                <CardExpiryElement
                  options={STRIPE_ELEMENT_OPTIONS}
                  onChange={(e) => _setExpComplete(e.complete)}
                />
              </div>
            </div>
            <div className={styles.fieldGroup} style={{ flex: 1 }}>
              <label className={styles.fieldLabel}>CVC</label>
              <div className={styles.stripeElement}>
                <CardCvcElement
                  options={STRIPE_ELEMENT_OPTIONS}
                  onChange={(e) => _setCvcComplete(e.complete)}
                />
              </div>
            </div>
          </div>

          {!hasSubscription && tier && (
            <div className={styles.startSubRow}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={sStartSub}
                  onChange={(e) => _setStartSub(e.target.checked)}
                  disabled={sBusy}
                />
                <span>
                  Start subscription now ({tier.label}, {formatUSD(tier.monthlyAmount, tier.currency)}/month)
                </span>
              </label>
            </div>
          )}

          {sError && <div className={styles.errorText}>{sError}</div>}
        </div>
      </div>
    </Dialog>
  );
}
