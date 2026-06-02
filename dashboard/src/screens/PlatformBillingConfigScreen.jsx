import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const getConfigCallable = httpsCallable(
  functions,
  "platformAdminGetBillingConfigCallable"
);
const updateConfigCallable = httpsCallable(
  functions,
  "platformAdminUpdateBillingConfigCallable"
);

function effectiveSmsMarkup(cfg) {
  if (!cfg) return null;
  if (typeof cfg.smsMarkupMultiplier === "number") {
    return cfg.smsMarkupMultiplier;
  }
  return cfg.smsMarkupMultiplierDefault ?? null;
}

function formatPercentDelta(multiplier) {
  if (typeof multiplier !== "number") return "—";
  const markup = (multiplier - 1) * 100;
  const sign = markup >= 0 ? "+" : "";
  return `${sign}${markup.toFixed(2)}%`;
}

export function PlatformBillingConfigScreen() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [smsInput, setSmsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const applyConfig = (cfg) => {
    setConfig(cfg);
    if (cfg && typeof cfg.smsMarkupMultiplier === "number") {
      setSmsInput(String(cfg.smsMarkupMultiplier));
    } else {
      setSmsInput("");
    }
  };

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await getConfigCallable({});
      applyConfig(res.data?.config || null);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to load platform billing config.";
      setLoadError(code ? `${code}: ${msg}` : msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSaveSmsMarkup = async () => {
    setSaving(true);
    setSaveError("");
    setSavedAt(null);
    const trimmed = smsInput.trim();
    const payload = {
      smsMarkupMultiplier: trimmed === "" ? null : trimmed,
    };
    try {
      const res = await updateConfigCallable(payload);
      applyConfig(res.data?.config || null);
      setSavedAt(Date.now());
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Save failed.";
      setSaveError(code ? `${code}: ${msg}` : msg);
    } finally {
      setSaving(false);
    }
  };

  const effective = effectiveSmsMarkup(config);
  const usingDefault =
    config && typeof config.smsMarkupMultiplier !== "number";

  return (
    <div className="pageScreen">
      <div className="card cardList">
        <div className="listHeader">
          <div>
            <Link to="/" className="linkButton">
              ← Back to tenants
            </Link>
            <h1 className="cardTitle">Platform billing</h1>
            <p className="cardSubtitle">
              Platform-wide defaults for SaaS billing rates. Per-tenant
              overrides live on each tenant's detail page.
            </p>
          </div>
        </div>

        {loadError && <div className="errorText">{loadError}</div>}
        {loading && !config && (
          <div className="placeholderText">Loading config…</div>
        )}

        {config && (
          <div className="formBlock">
            <div className="sectionHeading">SMS markup multiplier</div>
            <p className="helperText">
              Applied to Twilio's raw SMS cost when a billable message is
              stamped. <code>1.0</code> = pass-through (no markup),{" "}
              <code>1.05</code> = 5% markup. Capped at{" "}
              <code>{config.smsMarkupMultiplierMax}</code>. Tenants without an
              override inherit this value. Leave blank to fall back to the
              hardcoded default of{" "}
              <code>{config.smsMarkupMultiplierDefault}</code>.
            </p>

            <div className="fieldLabel">Multiplier</div>
            <input
              className="textInput"
              type="text"
              inputMode="decimal"
              placeholder={String(config.smsMarkupMultiplierDefault)}
              value={smsInput}
              onChange={(e) => setSmsInput(e.target.value)}
              disabled={saving}
            />
            <div className="helperText">
              Currently effective: <strong>{effective ?? "—"}</strong>
              {effective !== null && (
                <> ({formatPercentDelta(effective)} on Twilio cost)</>
              )}
              {usingDefault && " · using hardcoded default"}
            </div>

            {saveError && <div className="errorText">{saveError}</div>}
            {savedAt && !saveError && (
              <div className="successText">✓ Saved</div>
            )}

            <div className="buttonRow">
              <button
                type="button"
                className="primaryButton"
                onClick={handleSaveSmsMarkup}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
