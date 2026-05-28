import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const listTiersCallable = httpsCallable(
  functions,
  "platformAdminListBillingTiersCallable"
);
const listStripePricesCallable = httpsCallable(
  functions,
  "platformAdminListStripePricesCallable"
);
const createTierCallable = httpsCallable(
  functions,
  "platformAdminCreateBillingTierCallable"
);
const updateTierCallable = httpsCallable(
  functions,
  "platformAdminUpdateBillingTierCallable"
);
const archiveTierCallable = httpsCallable(
  functions,
  "platformAdminArchiveBillingTierCallable"
);

function formatUSD(cents, currency = "usd") {
  if (typeof cents !== "number") return "—";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(dollars);
}

function tierTone(tier) {
  if (tier.archived) return "danger";
  if (tier.active) return "accent";
  return "info";
}
function tierLabel(tier) {
  if (tier.archived) return "Archived";
  if (tier.active) return "Active";
  return "Inactive";
}

export function BillingTiersScreen() {
  const [tiers, setTiers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTierID, setEditingTierID] = useState(null);
  const [archiveBusy, setArchiveBusy] = useState({});
  const [rowError, setRowError] = useState({});

  const loadTiers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await listTiersCallable({});
      setTiers(res.data?.tiers || []);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to load tiers.";
      setLoadError(code ? `${code}: ${msg}` : msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTiers();
  }, [loadTiers]);

  const visibleTiers =
    tiers === null
      ? null
      : includeArchived
      ? tiers
      : tiers.filter((t) => !t.archived);

  const onCreated = () => {
    setShowCreate(false);
    loadTiers();
  };

  const onEdited = () => {
    setEditingTierID(null);
    loadTiers();
  };

  const archiveTier = async (tierID) => {
    if (!window.confirm("Archive this tier? Tenants already on it stay subscribed, but it disappears from the new-tenant / change-tier pickers.")) {
      return;
    }
    setArchiveBusy((b) => ({ ...b, [tierID]: true }));
    setRowError((r) => ({ ...r, [tierID]: "" }));
    try {
      await archiveTierCallable({ tierID });
      await loadTiers();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Archive failed.";
      setRowError((r) => ({
        ...r,
        [tierID]: code ? `${code}: ${msg}` : msg,
      }));
    } finally {
      setArchiveBusy((b) => ({ ...b, [tierID]: false }));
    }
  };

  return (
    <div className="pageScreen">
      <div className="card cardList">
        <div className="listHeader">
          <div>
            <Link to="/" className="linkButton">
              ← Back to tenants
            </Link>
            <h1 className="cardTitle">Billing tiers</h1>
            <p className="cardSubtitle">
              Subscription tiers shown to tenants on the monthly_sub plan.
              Stripe Prices are immutable — changing a tier's amount means
              archiving the old one and creating a new one.
            </p>
          </div>
          <button
            type="button"
            className="primaryButton primaryButtonInline"
            onClick={() => setShowCreate(true)}
            disabled={showCreate}
          >
            + New tier
          </button>
        </div>

        <label className="radioRow" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span>Include archived</span>
        </label>

        {showCreate && (
          <TierForm
            mode="create"
            onCancel={() => setShowCreate(false)}
            onSaved={onCreated}
          />
        )}

        {loadError && <div className="errorText">{loadError}</div>}

        {loading && !visibleTiers && (
          <div className="placeholderText">Loading tiers…</div>
        )}

        {!loading && visibleTiers && visibleTiers.length === 0 && (
          <div className="emptyState">
            {tiers && tiers.length > 0 && !includeArchived
              ? "All tiers are archived. Toggle 'Include archived' to view them."
              : "No tiers yet. Create one in Stripe Dashboard first (Products → recurring monthly Price), then add it here using the Stripe Price ID."}
          </div>
        )}

        {visibleTiers && visibleTiers.length > 0 && (
          <div className="tenantList">
            {visibleTiers.map((tier) => {
              if (editingTierID === tier.tierID) {
                return (
                  <TierForm
                    key={tier.tierID}
                    mode="edit"
                    initial={tier}
                    onCancel={() => setEditingTierID(null)}
                    onSaved={onEdited}
                  />
                );
              }
              return (
                <div key={tier.tierID} className="tenantRow">
                  <div className="tenantRowMain">
                    <div className="tenantRowName">{tier.label}</div>
                    <div className="tenantRowMeta">
                      <span>{formatUSD(tier.monthlyAmount, tier.currency)} / mo</span>
                      <span className="tenantRowDot">•</span>
                      <code className="tenantRowID">{tier.stripePriceID}</code>
                    </div>
                    {tier.description && (
                      <div
                        className="tenantRowMeta"
                        style={{ marginTop: 4 }}
                      >
                        {tier.description}
                      </div>
                    )}
                    {rowError[tier.tierID] && (
                      <div className="errorText">{rowError[tier.tierID]}</div>
                    )}
                  </div>
                  <div className="tenantRowSide">
                    <div className="badgeRow">
                      <span className={`badge badge-${tierTone(tier)}`}>
                        {tierLabel(tier)}
                      </span>
                    </div>
                    <div className="buttonRow" style={{ marginTop: 6 }}>
                      {!tier.archived && (
                        <button
                          type="button"
                          className="linkButton"
                          onClick={() => setEditingTierID(tier.tierID)}
                        >
                          Edit
                        </button>
                      )}
                      {!tier.archived && (
                        <button
                          type="button"
                          className="linkButton"
                          onClick={() => archiveTier(tier.tierID)}
                          disabled={archiveBusy[tier.tierID]}
                        >
                          {archiveBusy[tier.tierID] ? "Archiving…" : "Archive"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatPriceOption(price) {
  const amount = formatUSD(price.unitAmount, price.currency);
  const cadence =
    price.intervalCount && price.intervalCount > 1
      ? `every ${price.intervalCount} ${price.interval}s`
      : `/ ${price.interval}`;
  const product = price.productName || "(unnamed product)";
  const nickname = price.nickname ? ` — ${price.nickname}` : "";
  return `${product}${nickname} · ${amount} ${cadence}`;
}

function TierForm({ mode, initial, onCancel, onSaved }) {
  const isEdit = mode === "edit";
  const [label, setLabel] = useState(initial?.label || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [selectedPriceID, setSelectedPriceID] = useState(
    initial?.stripePriceID || ""
  );
  const [active, setActive] = useState(
    initial ? initial.active !== false : true
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [prices, setPrices] = useState(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState("");

  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    (async () => {
      setPricesLoading(true);
      setPricesError("");
      try {
        const res = await listStripePricesCallable({});
        if (cancelled) return;
        const all = res.data?.prices || [];
        // Only monthly recurring prices land in the picker — the schema
        // requires interval==='month' on the bound Price.
        const monthly = all.filter(
          (p) =>
            p.interval === "month" &&
            p.intervalCount === 1 &&
            typeof p.unitAmount === "number"
        );
        setPrices(monthly);
      } catch (err) {
        if (cancelled) return;
        const code = err?.code || "";
        const msg = err?.message || "Failed to load Stripe prices.";
        setPricesError(code ? `${code}: ${msg}` : msg);
      } finally {
        if (!cancelled) setPricesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  const selectedPrice = !isEdit && prices
    ? prices.find((p) => p.id === selectedPriceID) || null
    : null;

  // Tracks the last auto-fill so we can tell whether the user has customized
  // the label/description since the last price selection.
  const lastAutoLabelRef = useRef("");
  const lastAutoDescRef = useRef("");

  const handlePriceChange = (newID) => {
    setSelectedPriceID(newID);
    if (!prices) return;
    const next = prices.find((p) => p.id === newID) || null;
    if (!next) return;
    const defaultLabel = next.productName || next.nickname || "";
    const defaultDesc = next.productDescription || "";
    setLabel((cur) =>
      cur === "" || cur === lastAutoLabelRef.current ? defaultLabel : cur
    );
    setDescription((cur) =>
      cur === "" || cur === lastAutoDescRef.current ? defaultDesc : cur
    );
    lastAutoLabelRef.current = defaultLabel;
    lastAutoDescRef.current = defaultDesc;
  };

  const trimmedLabel = label.trim();

  const canSubmit = (() => {
    if (busy) return false;
    if (!trimmedLabel) return false;
    if (isEdit) return true;
    if (!selectedPrice) return false;
    return true;
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      if (isEdit) {
        await updateTierCallable({
          tierID: initial.tierID,
          label: trimmedLabel,
          description: description.trim(),
          active,
        });
      } else {
        await createTierCallable({
          label: trimmedLabel,
          description: description.trim(),
          stripePriceID: selectedPrice.id,
          monthlyAmount: selectedPrice.unitAmount,
          currency: selectedPrice.currency,
          active,
        });
      }
      onSaved();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Save failed.";
      setError(code ? `${code}: ${msg}` : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="formBlock" onSubmit={handleSubmit}>
      <div className="sectionHeading">
        {isEdit ? "Edit tier" : "New tier"}
      </div>

      <div className="fieldLabel">Label</div>
      <input
        className="textInput"
        type="text"
        placeholder="Starter"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
      />

      <div className="fieldLabel">Description</div>
      <input
        className="textInput"
        type="text"
        placeholder="For small shops, single store"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={busy}
      />

      {!isEdit && (
        <>
          <div className="fieldLabel">Stripe Price</div>
          {pricesLoading && (
            <div className="placeholderText">Loading Stripe prices…</div>
          )}
          {pricesError && <div className="errorText">{pricesError}</div>}
          {!pricesLoading && !pricesError && prices && prices.length === 0 && (
            <div className="helperText">
              No active monthly recurring Prices on your platform Stripe
              account. Create one in Stripe Dashboard (Products → recurring
              monthly Price), then reopen this form.
            </div>
          )}
          {!pricesLoading && prices && prices.length > 0 && (
            <>
              <select
                className="textInput"
                value={selectedPriceID}
                onChange={(e) => handlePriceChange(e.target.value)}
                disabled={busy}
              >
                <option value="">— Select a Stripe Price —</option>
                {prices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatPriceOption(p)}
                  </option>
                ))}
              </select>
              {selectedPrice && (
                <div className="helperText">
                  <code>{selectedPrice.id}</code> · {formatUSD(
                    selectedPrice.unitAmount,
                    selectedPrice.currency
                  )} / mo
                </div>
              )}
            </>
          )}
        </>
      )}

      {isEdit && (
        <>
          <div className="resultRow">
            <span className="resultLabel">Stripe Price ID</span>
            <code className="resultValue">{initial.stripePriceID}</code>
          </div>
          <div className="resultRow">
            <span className="resultLabel">Monthly amount</span>
            <span className="resultValue">
              {formatUSD(initial.monthlyAmount, initial.currency)} / mo
            </span>
          </div>
          <p className="helperText">
            Price and amount are immutable — Stripe Prices can't change. To
            adjust pricing, archive this tier and create a new one.
          </p>
        </>
      )}

      <label className="radioRow">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          disabled={busy}
        />
        <span>Active (selectable for new subscriptions)</span>
      </label>

      {error && <div className="errorText">{error}</div>}

      <div className="buttonRow">
        <button
          type="button"
          className="secondaryButton"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="primaryButton"
          disabled={!canSubmit}
        >
          {busy ? "Saving…" : isEdit ? "Save" : "Create tier"}
        </button>
      </div>
    </form>
  );
}
