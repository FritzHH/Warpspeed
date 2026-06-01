import React, { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

// Stage 3a: payment-on-file. Both tiers collect a card via the same
// SetupIntent flow — monthly_sub points the recurring subscription at it;
// per_sale uses it for the semi-monthly accumulation invoice run that bills
// fees across all sale types (Connect-card, cash, check, gift) so we can't
// rely on Connect application_fee alone.
//
// Billing-tier picker: prospect chooses per_sale vs monthly_sub here. Any
// admin-set value at email-send time is just the initial default — the
// radio writes back to the top-level billingTier field on the setup doc
// and finalize reads that value.

const createSetupIntentCallable = httpsCallable(
  functions,
  "tenantSetupCreateSetupIntentCallable"
);
const confirmPaymentMethodCallable = httpsCallable(
  functions,
  "tenantSetupConfirmPaymentMethodCallable"
);

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY
  ? loadStripe(STRIPE_PUBLISHABLE_KEY)
  : null;

const BILLING_TIER_COPY = {
  per_sale: {
    label: "Per-sale plan",
    detail: "0.5% of every sale, billed twice monthly to the card on file. $10/month minimum.",
    badge: "Per-sale",
  },
  monthly_sub: {
    label: "Monthly subscription",
    detail: "$50/month, billed to the card on file.",
    badge: "$50/mo",
  },
};

export function TenantSetupPaymentForm({
  email,
  formData,
  billingTier,
  paymentMethodCollected,
  onSaveFormData,
  onChooseBillingTier,
  onPaymentMethodSaved,
}) {
  const isCanada = (formData?.country || "US").toUpperCase() === "CA";
  const [saveError, setSaveError] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState("");
  const [tierSaving, setTierSaving] = useState(false);
  const [tierError, setTierError] = useState("");
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcSales, setCalcSales] = useState("");

  async function handleSelectTier(nextTier) {
    if (tierSaving || nextTier === billingTier) return;
    setTierError("");
    setTierSaving(true);
    try {
      await onChooseBillingTier(nextTier);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to save billing plan.";
      setTierError(code ? `${code}: ${msg}` : msg);
    } finally {
      setTierSaving(false);
    }
  }

  // Per-sale cost calculator: 0.5% of monthly sales with a $10/month floor.
  // Strip non-numeric chars (commas, $, etc.) so the user can paste freely.
  const calcSalesNum =
    parseFloat((calcSales || "").replace(/[^0-9.]/g, "")) || 0;
  const calcPercentCost = calcSalesNum * 0.005;
  const calcMonthlyCost = Math.max(10, calcPercentCost);
  const calcMinApplied = calcSalesNum > 0 && calcPercentCost < 10;

  async function handleBack() {
    setSaveError("");
    try {
      await onSaveFormData({ currentStep: "store-details" });
    } catch (err) {
      setSaveError(err?.message || "Failed to go back.");
    }
  }

  async function handleContinue() {
    setSaveError("");
    try {
      // CA tenants skip phone + A2P (CASL, not US A2P 10DLC); jump to review.
      await onSaveFormData({ currentStep: isCanada ? "review" : "phone" });
    } catch (err) {
      setSaveError(err?.message || "Failed to continue.");
    }
  }

  async function handleStartCardSetup() {
    if (intentLoading) return;
    setIntentLoading(true);
    setIntentError("");
    try {
      const res = await createSetupIntentCallable({});
      const secret = res?.data?.clientSecret;
      if (!secret) throw new Error("Missing client secret from server.");
      setClientSecret(secret);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to start card setup.";
      setIntentError(code ? `${code}: ${msg}` : msg);
    } finally {
      setIntentLoading(false);
    }
  }

  const elementsOptions = useMemo(
    () => (clientSecret ? { clientSecret } : null),
    [clientSecret]
  );

  const canContinue =
    (billingTier === "per_sale" || billingTier === "monthly_sub") &&
    paymentMethodCollected;

  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <div className="switchTypeRow">
          <button type="button" className="linkButton" onClick={handleBack}>
            ← Back
          </button>
        </div>

        <h1 className="cardTitle">Payment</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>. Pick the billing plan you want
          and save a card on file.
        </p>

        <div className="sectionHeading">Billing plan</div>
        <div className="tierPicker">
          {["per_sale", "monthly_sub"].map((tier) => {
            const copy = BILLING_TIER_COPY[tier];
            const selected = billingTier === tier;
            // div role="button" instead of <button> so the per-sale card can
            // host a nested Calculate-cost <button> without invalid markup.
            return (
              <div
                key={tier}
                role="button"
                tabIndex={tierSaving ? -1 : 0}
                aria-pressed={selected}
                aria-disabled={tierSaving}
                className={
                  "tierOption" +
                  (selected ? " tierOptionSelected" : "") +
                  (tierSaving ? " tierOptionDisabled" : "")
                }
                onClick={() => handleSelectTier(tier)}
                onKeyDown={(e) => {
                  if (tierSaving) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectTier(tier);
                  }
                }}
              >
                <div className="tierOptionHeader">
                  <div className="tierOptionBadge">{copy.badge}</div>
                  <div className="tierOptionRadio" aria-hidden="true">
                    {selected ? "●" : "○"}
                  </div>
                </div>
                <div className="tierOptionLabel">{copy.label}</div>
                <div className="tierOptionDetail">{copy.detail}</div>
                {tier === "per_sale" && (
                  <button
                    type="button"
                    className="tierCalcButton"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCalcOpen(true);
                    }}
                  >
                    Calculate cost
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {tierError && <div className="errorText">{tierError}</div>}

        {calcOpen && (
          <div
            className="tierCalcBackdrop"
            onClick={() => setCalcOpen(false)}
          >
            <div
              className="tierCalcModal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tier-calc-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="tier-calc-title" className="tierCalcTitle">
                Per-sale cost estimate
              </h2>
              <p className="tierCalcSubtitle">
                Enter your average monthly sales to see what you'd pay.
              </p>

              <label className="fieldLabel" htmlFor="tier-calc-sales">
                Monthly sales
              </label>
              <div className="tierCalcInputRow">
                <span className="tierCalcInputDollar">$</span>
                <input
                  id="tier-calc-sales"
                  type="text"
                  inputMode="decimal"
                  className="textInput tierCalcInput"
                  value={calcSales}
                  onChange={(e) => setCalcSales(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              {calcSales.trim().length > 0 && (
                <div className="tierCalcResult">
                  <div className="tierCalcResultLabel">
                    Estimated monthly cost
                  </div>
                  <div className="tierCalcResultValue">
                    ${calcMonthlyCost.toFixed(2)}
                  </div>
                  {calcMinApplied && (
                    <div className="tierCalcResultNote">
                      $10/month minimum applied (0.5% of $
                      {calcSalesNum.toFixed(2)} ={" "}
                      ${calcPercentCost.toFixed(2)})
                    </div>
                  )}
                </div>
              )}

              <p className="tierCalcFooter">
                0.5% of monthly sales, with a $10/month minimum. Billed twice
                per month to the card on file.
              </p>

              <button
                type="button"
                className="primaryButton"
                onClick={() => setCalcOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        <div className="sectionHeading">Payment method</div>

        {billingTier ? (
          <>
            {paymentMethodCollected ? (
              <div className="setupSectionSuccess">
                Card on file — you're all set.
              </div>
            ) : !clientSecret ? (
              <div className="setupSectionPlaceholderActive">
                <p className="placeholderHint">
                  We'll save your card now and use it for billing once your
                  account is live. No charge today.
                </p>
                <button
                  type="button"
                  className="primaryButton"
                  onClick={handleStartCardSetup}
                  disabled={intentLoading || !stripePromise}
                >
                  {intentLoading ? "Loading…" : "Set up card"}
                </button>
                {!stripePromise && (
                  <div className="errorText">
                    Stripe publishable key is missing. Email{" "}
                    <a href="mailto:support@retailsoftsystems.com">
                      support@retailsoftsystems.com
                    </a>{" "}
                    for help.
                  </div>
                )}
                {intentError && (
                  <div className="errorText">{intentError}</div>
                )}
              </div>
            ) : (
              <Elements stripe={stripePromise} options={elementsOptions}>
                <SetupIntentForm
                  onSuccess={async () => {
                    if (typeof onPaymentMethodSaved === "function") {
                      await onPaymentMethodSaved();
                    }
                  }}
                />
              </Elements>
            )}
          </>
        ) : (
          <div className="setupSectionPlaceholder">
            Pick a billing plan above to continue.
          </div>
        )}

        <div className="cardFooterRow">
          <button type="button" className="linkButton" onClick={handleBack}>
            ← Back
          </button>
          <button
            type="button"
            className="primaryButton"
            onClick={handleContinue}
            disabled={!canContinue}
          >
            Continue
          </button>
        </div>

        {saveError && <div className="errorText">{saveError}</div>}
      </div>
    </div>
  );
}

// Inner component so we can call useStripe / useElements inside the Elements
// provider. Wrapped in Elements above, this collects the card and runs
// stripe.confirmSetup → server PM attach. We disable redirect since this is
// a non-redirect flow (card only, no 3DS-required mandates expected for
// off_session save).
function SetupIntentForm({ onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setErrorMsg("");

    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (error) {
        setErrorMsg(error.message || "Card confirmation failed.");
        setSubmitting(false);
        return;
      }
      const paymentMethodID =
        typeof setupIntent?.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent?.payment_method?.id;
      if (!paymentMethodID) {
        setErrorMsg("Stripe did not return a payment method.");
        setSubmitting(false);
        return;
      }

      await confirmPaymentMethodCallable({ paymentMethodID });
      setSuccess(true);
      if (typeof onSuccess === "function") await onSuccess();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to save card.";
      setErrorMsg(code ? `${code}: ${msg}` : msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="setupSectionSuccess">
        Card on file — you're all set.
      </div>
    );
  }

  return (
    <form className="cardSetupForm" onSubmit={handleSubmit}>
      <PaymentElement />
      {errorMsg && <div className="errorText">{errorMsg}</div>}
      <button
        type="submit"
        className="primaryButton"
        disabled={!stripe || submitting}
      >
        {submitting ? "Saving card…" : "Save card"}
      </button>
    </form>
  );
}
