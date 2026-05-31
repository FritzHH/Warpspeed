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

// Stage 3a: payment-on-file. Split from the older combined payment-phone
// form so phone selection can live on its own step (which has its own
// state — mode picker, search, purchase) without intermixing.
//
// monthly_sub: Stripe Elements SetupIntent flow. Card → SetupIntent confirm
// → paymentMethodID → server attaches + sets as default. Setup doc gets
// paymentMethodCollected=true so the eventual tenant provisioner has a saved
// PM to point the Subscription at.
//
// per_sale: card collection deferred until period-billed accumulation
// invoicing is built (approach #2 — covers cash/check/gift sales that
// Connect application_fee can't see). Per-sale prospects advance straight
// past this step with a deferred-message placeholder.

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
    detail: "0.5% of every sale, billed monthly to the card on file.",
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
  // eslint-disable-next-line no-unused-vars
  formData,
  billingTier,
  paymentMethodCollected,
  onSaveFormData,
  onPaymentMethodSaved,
}) {
  const [saveError, setSaveError] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState("");
  const tierCopy = BILLING_TIER_COPY[billingTier] || null;

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
      await onSaveFormData({ currentStep: "phone" });
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
    billingTier === "per_sale" ||
    (billingTier === "monthly_sub" && paymentMethodCollected);

  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <div className="switchTypeRow">
          <button type="button" className="linkButton" onClick={handleBack}>
            ← Back
          </button>
        </div>

        {tierCopy && (
          <div className="tierBanner">
            <div className="tierBannerHeader">
              <div className="tierBannerEyebrow">You're signing up for</div>
              <div className="tierBannerBadge">{tierCopy.badge}</div>
            </div>
            <div className="tierBannerLabel">{tierCopy.label}</div>
            <div className="tierBannerDetail">{tierCopy.detail}</div>
          </div>
        )}

        <h1 className="cardTitle">Payment</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>. Save the card we'll keep on
          file for your subscription.
        </p>

        <div className="sectionHeading">Payment method</div>

        {billingTier === "monthly_sub" && (
          <>
            {paymentMethodCollected ? (
              <div className="setupSectionSuccess">
                Card on file — you're all set for monthly billing.
              </div>
            ) : !clientSecret ? (
              <div className="setupSectionPlaceholderActive">
                <p className="placeholderHint">
                  We'll save your card now and charge it monthly once your
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
                    Stripe publishable key is missing. Contact support.
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
        )}

        {billingTier === "per_sale" && (
          <div className="setupSectionPlaceholder">
            No card needed at signup. Per-sale plans are billed monthly from
            sales activity once your account is live.
          </div>
        )}

        {!billingTier && (
          <div className="setupSectionPlaceholder">
            Billing tier missing. Contact support to refresh your link.
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
        Card on file — you're all set for monthly billing.
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
