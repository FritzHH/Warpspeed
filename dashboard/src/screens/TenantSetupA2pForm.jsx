import React, { useState } from "react";

// Stage 4: A2P 10DLC brand + campaign registration. Placeholder for v1 —
// the data fields below are captured at signup so the tenant provisioner
// can submit the A2P brand + campaign at tenant adoption time, but the
// actual brand/campaign submission and Twilio Trust Hub wiring is deferred
// until the carrier port-in details land from Twilio support.
//
// For v1 we collect the minimum brand fields (legal entity name, EIN,
// website, support email/phone) and the campaign use case description.
// These get saved to `formData.a2p` on the setup doc and the actual
// registration happens after the tenant is live.

export function TenantSetupA2pForm({
  email,
  formData,
  onSaveFormData,
}) {
  const a2p = (formData && formData.a2p) || {};
  const [legalName, setLegalName] = useState(a2p.legalName || "");
  const [ein, setEin] = useState(a2p.ein || "");
  const [website, setWebsite] = useState(a2p.website || "");
  const [supportEmail, setSupportEmail] = useState(a2p.supportEmail || "");
  const [supportPhone, setSupportPhone] = useState(a2p.supportPhone || "");
  const [useCase, setUseCase] = useState(a2p.useCase || "");
  const [saveError, setSaveError] = useState("");
  const [savingField, setSavingField] = useState("");
  const [continuing, setContinuing] = useState(false);

  async function persist(field, value) {
    setSaveError("");
    setSavingField(field);
    try {
      await onSaveFormData({
        a2p: {
          ...a2p,
          legalName,
          ein,
          website,
          supportEmail,
          supportPhone,
          useCase,
          [field]: value,
        },
      });
    } catch (err) {
      setSaveError(err?.message || `Failed to save ${field}.`);
    } finally {
      setSavingField("");
    }
  }

  async function handleBack() {
    setSaveError("");
    try {
      await onSaveFormData({ currentStep: "phone" });
    } catch (err) {
      setSaveError(err?.message || "Failed to go back.");
    }
  }

  async function handleContinue() {
    if (continuing) return;
    setContinuing(true);
    setSaveError("");
    try {
      await onSaveFormData({
        a2p: {
          ...a2p,
          legalName,
          ein,
          website,
          supportEmail,
          supportPhone,
          useCase,
        },
        currentStep: "done",
      });
    } catch (err) {
      setSaveError(err?.message || "Failed to continue.");
    } finally {
      setContinuing(false);
    }
  }

  const allFilled =
    legalName.trim() &&
    ein.trim() &&
    website.trim() &&
    supportEmail.trim() &&
    supportPhone.trim() &&
    useCase.trim();

  return (
    <div className="centerScreen">
      <div className="card cardWide">
        <div className="switchTypeRow">
          <button type="button" className="linkButton" onClick={handleBack}>
            ← Back
          </button>
        </div>

        <h1 className="cardTitle">Business registration (A2P 10DLC)</h1>
        <p className="cardSubtitle">
          Signed in as <strong>{email}</strong>. US carriers require this
          info before your shop can send texts. We submit on your behalf —
          approval usually takes 1–3 business days after your account is
          live.
        </p>

        <div className="sectionHeading">Legal business info</div>

        <label className="fieldLabel">Legal business name</label>
        <input
          type="text"
          className="textInput"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          onBlur={() => persist("legalName", legalName)}
          placeholder="Acme Bikes LLC"
          disabled={savingField === "legalName"}
        />

        <label className="fieldLabel">EIN (federal tax ID)</label>
        <input
          type="text"
          className="textInput"
          value={ein}
          onChange={(e) => setEin(e.target.value)}
          onBlur={() => persist("ein", ein)}
          placeholder="12-3456789"
          disabled={savingField === "ein"}
        />

        <label className="fieldLabel">Website</label>
        <input
          type="text"
          className="textInput"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          onBlur={() => persist("website", website)}
          placeholder="https://acmebikes.com"
          disabled={savingField === "website"}
        />

        <label className="fieldLabel">Customer support email</label>
        <input
          type="email"
          className="textInput"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
          onBlur={() => persist("supportEmail", supportEmail)}
          placeholder="support@acmebikes.com"
          disabled={savingField === "supportEmail"}
        />

        <label className="fieldLabel">Customer support phone</label>
        <input
          type="tel"
          className="textInput"
          value={supportPhone}
          onChange={(e) => setSupportPhone(e.target.value)}
          onBlur={() => persist("supportPhone", supportPhone)}
          placeholder="(555) 123-4567"
          disabled={savingField === "supportPhone"}
        />

        <div className="sectionHeading">How you'll use texting</div>

        <label className="fieldLabel">
          Describe what you'll send to customers
        </label>
        <textarea
          className="textInput textAreaInput"
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
          onBlur={() => persist("useCase", useCase)}
          placeholder="Service order updates, appointment reminders, pickup notifications, and customer replies."
          rows={4}
          disabled={savingField === "useCase"}
        />

        <div className="cardFooterRow">
          <button type="button" className="linkButton" onClick={handleBack}>
            ← Back
          </button>
          <button
            type="button"
            className="primaryButton"
            onClick={handleContinue}
            disabled={!allFilled || continuing}
          >
            {continuing ? "Saving…" : "Continue"}
          </button>
        </div>

        {saveError && <div className="errorText">{saveError}</div>}
      </div>
    </div>
  );
}
