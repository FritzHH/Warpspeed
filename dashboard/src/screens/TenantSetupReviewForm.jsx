import React, { useState } from "react";

// Stage 4 (opt-out branch): a thin review/confirm screen for tenants who
// declined SMS at the phone step OR for CA tenants who skip the phone +
// A2P steps entirely (Twilio A2P 10DLC is US-only; CA uses CASL which
// isn't part of signup). The A2P form is skipped — but they still need a
// "Finish setup" button that calls onFinalize and shows the success state.
//
// US purchase/pool tenants go through TenantSetupA2pForm and never see this.

const POS_APP_URL = "https://cadence-pos.web.app/";

export function TenantSetupReviewForm({
  email,
  formData,
  onSaveFormData,
  onFinalize,
}) {
  const [saveError, setSaveError] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState(null);

  const isCanada = (formData?.country || "US").toUpperCase() === "CA";

  async function handleBack() {
    setSaveError("");
    try {
      // CA tenants skip phone/a2p entirely, so back from review returns to
      // payment. US opt-out tenants came from the phone step.
      await onSaveFormData({ currentStep: isCanada ? "payment" : "phone" });
    } catch (err) {
      setSaveError(err?.message || "Failed to go back.");
    }
  }

  async function handleFinish() {
    if (continuing) return;
    setContinuing(true);
    setSaveError("");
    try {
      const result = await onFinalize();
      setFinalizeResult(result || { success: true });
    } catch (err) {
      setSaveError(
        err?.message || "Failed to finalize your account. Please try again."
      );
    } finally {
      setContinuing(false);
    }
  }

  if (finalizeResult && finalizeResult.success) {
    const warnings = [];
    if (finalizeResult.connectAccountError) {
      warnings.push(
        "Stripe payments setup didn't complete. You can finish it from your account dashboard once you sign in."
      );
    }
    if (finalizeResult.billingSubscriptionError) {
      warnings.push(
        "Your monthly subscription didn't start automatically. Your card is on file — finish enrollment from the Billing page after sign-in."
      );
    }
    return (
      <div className="centerScreen">
        <div className="card cardWide">
          <h1 className="cardTitle">You're all set</h1>
          <p className="cardSubtitle">
            Welcome to Cadence POS. Your account is live.
          </p>
          <p>
            Sign in to your new shop at{" "}
            <a href={POS_APP_URL}>{POS_APP_URL}</a> using <strong>{email}</strong>.
          </p>
          <p className="helperText">
            {isCanada
              ? "Text messaging isn't part of Canadian signup yet. Email support@retailsoftsystems.com when you'd like SMS enabled for your shop."
              : "You skipped text messaging during signup. You can enable SMS at any time from your Subscription settings inside the app."}
          </p>
          {warnings.length > 0 && (
            <div className="errorText">
              {warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}
          <a
            href={POS_APP_URL}
            className="primaryButton"
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            Open Cadence POS →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <div className="switchTypeRow">
          <button type="button" className="linkButton" onClick={handleBack}>
            ← Back
          </button>
        </div>

        <h1 className="cardTitle">Review and finish</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>.{" "}
          {isCanada
            ? "Text messaging isn't part of Canadian signup yet, so we can finalize your account in one step. You can email support to enable SMS later."
            : "You've chosen to skip text messaging for now — no carrier registration is needed, so we can finalize your account in one step."}
        </p>

        <div className="reviewSummary">
          <div className="reviewSummaryRow">
            <div className="reviewSummaryLabel">Text messaging</div>
            <div className="reviewSummaryValue">
              {isCanada
                ? "Not available during Canadian signup. Email support to enable later."
                : "Disabled. You can enable it later from Subscription settings."}
            </div>
          </div>
        </div>

        <p className="helperText">
          When you click <strong>Finish setup</strong>, we'll provision your
          tenant, create your store, attach billing to the card on file, and
          send you the link to your live Cadence POS account.
        </p>

        <div className="cardFooterRow">
          <button type="button" className="linkButton" onClick={handleBack}>
            ← Back
          </button>
          <button
            type="button"
            className="primaryButton"
            onClick={handleFinish}
            disabled={continuing}
          >
            {continuing ? "Finalizing…" : "Finish setup"}
          </button>
        </div>

        {saveError && <div className="errorText">{saveError}</div>}
      </div>
    </div>
  );
}
