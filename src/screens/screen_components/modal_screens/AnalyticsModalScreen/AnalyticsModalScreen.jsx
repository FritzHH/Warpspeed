/*eslint-disable*/
/**
 * AnalyticsModalScreen — cost & pricing dashboard.
 *
 * Reads usage-events from Firestore (instrumented in Cloud Functions), projects
 * cost using vendor rates, and surfaces views to help build a SaaS pricing strategy.
 *
 * Tabs:
 *   Overview      — totals, top features, daily trend
 *   Averages      — system-wide + per-feature avg cost per workorder/sale
 *   Per Feature   — full feature list sorted by cost
 *   Pricing       — interactive subscription pricing calculator
 *   Forecast      — growth projections
 *   Reconcile     — projected vs vendor actual deltas (data quality)
 */

import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Dialog,
  LoadingIndicator,
  LargeModalHeader,
  LargeModalHeaderButton,
} from "../../../../dom_components";
import { C } from "../../../../styles";
import { capitalizeFirstLetterOfString, lightenRGBByPercent } from "../../../../utils";
import styles from "./AnalyticsModalScreen.module.css";
import { centsToDisplay, VENDOR_RATES } from "./vendorRates";
import {
  loadUsageEvents,
  loadVendorTotals,
  sumProjectedCost,
  rollupByFeature,
  rollupByVendor,
  bucketByDay,
  computeAnalyticsSelfCost,
  fullyLoadedPerWorkorder,
  avgCostPerSale,
  perFeatureAverages,
  computeSubscriptionPrice,
  computeBreakeven,
  makeGrowthCurve,
  reconcileVendor,
  loadSmsEventsAllStores,
  sumSmsDimensions,
  rollupSmsByStore,
  rollupSmsByFeature,
  bucketSmsByDay,
} from "./analyticsHelpers";

const TABS = [
  { key: "overview",    label: "Overview" },
  { key: "averages",    label: "Averages" },
  { key: "features",    label: "Per Feature" },
  { key: "sms",         label: "SMS" },
  { key: "pricing",     label: "Pricing Strategy" },
  { key: "forecast",    label: "Forecast" },
  { key: "reconcile",   label: "Reconcile" },
];

const DATE_PRESETS = [
  { label: "Last 7 days",  start: () => dayjs().subtract(7, "day").startOf("day"),  end: () => dayjs().endOf("day") },
  { label: "Last 30 days", start: () => dayjs().subtract(30, "day").startOf("day"), end: () => dayjs().endOf("day") },
  { label: "This Month",   start: () => dayjs().startOf("month"),                   end: () => dayjs().endOf("day") },
  { label: "Last Month",   start: () => dayjs().subtract(1, "month").startOf("month"), end: () => dayjs().subtract(1, "month").endOf("month") },
  { label: "Last 90 days", start: () => dayjs().subtract(90, "day").startOf("day"), end: () => dayjs().endOf("day") },
  { label: "Year to Date", start: () => dayjs().startOf("year"),                    end: () => dayjs().endOf("day") },
];

export const AnalyticsModalScreen = ({ handleExit }) => {
  const [sActiveTab, _setActiveTab] = useState("overview");
  const [sPresetLabel, _setPresetLabel] = useState("Last 30 days");
  const [sStartMs, _setStartMs] = useState(dayjs().subtract(30, "day").startOf("day").valueOf());
  const [sEndMs, _setEndMs] = useState(dayjs().endOf("day").valueOf());
  const [sEvents, _setEvents] = useState([]);
  const [sVendorTotals, _setVendorTotals] = useState([]);
  const [sLoading, _setLoading] = useState(false);
  const [sIncludeAnalytics, _setIncludeAnalytics] = useState(true);
  const [sError, _setError] = useState(null);

  // SMS-tab data is multi-store (fan-out across every store under the
  // tenant). Lazy-loaded the first time the SMS tab is activated, then
  // cached per date range so re-opening the tab is instant.
  const [sSmsEvents, _setSmsEvents] = useState([]);
  const [sSmsStoreIDs, _setSmsStoreIDs] = useState([]);
  const [sSmsLoading, _setSmsLoading] = useState(false);
  const [sSmsLoadedForRange, _setSmsLoadedForRange] = useState(null);

  // ── Load on range change ──
  useEffect(() => {
    let cancelled = false;
    _setLoading(true);
    _setError(null);
    Promise.all([
      loadUsageEvents(sStartMs, sEndMs, { limit: 10000 }),
      loadVendorTotals(sStartMs, sEndMs),
    ])
      .then(([events, vt]) => {
        if (cancelled) return;
        _setEvents(events || []);
        _setVendorTotals(vt || []);
        _setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        _setError(err?.message || "Failed to load analytics");
        _setEvents([]);
        _setVendorTotals([]);
        _setLoading(false);
      });
    // Invalidate SMS cache; re-fetches on next SMS tab activation.
    _setSmsLoadedForRange(null);
    return () => { cancelled = true; };
  }, [sStartMs, sEndMs]);

  // ── SMS multi-store fan-out (lazy: first SMS tab activation per range) ──
  useEffect(() => {
    if (sActiveTab !== "sms") return;
    const rangeKey = sStartMs + "-" + sEndMs;
    if (sSmsLoadedForRange === rangeKey) return;

    let cancelled = false;
    _setSmsLoading(true);
    loadSmsEventsAllStores(sStartMs, sEndMs, { limit: 10000 })
      .then(({ events, storeIDs }) => {
        if (cancelled) return;
        _setSmsEvents(events || []);
        _setSmsStoreIDs(storeIDs || []);
        _setSmsLoadedForRange(rangeKey);
        _setSmsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        _setSmsEvents([]);
        _setSmsStoreIDs([]);
        _setSmsLoading(false);
      });
    return () => { cancelled = true; };
  }, [sActiveTab, sStartMs, sEndMs, sSmsLoadedForRange]);

  // ── Rollups (memoized) ──
  const featureRoll = useMemo(() => rollupByFeature(sEvents), [sEvents]);
  const vendorRoll = useMemo(() => rollupByVendor(sEvents), [sEvents]);
  const dayBuckets = useMemo(() => bucketByDay(sEvents, sStartMs, sEndMs), [sEvents, sStartMs, sEndMs]);
  const avgData = useMemo(() => perFeatureAverages(sEvents), [sEvents]);
  const totalProjected = useMemo(() => sumProjectedCost(sEvents), [sEvents]);
  const selfCost = useMemo(() => computeAnalyticsSelfCost(sEvents, sStartMs, sEndMs), [sEvents, sStartMs, sEndMs]);
  const fullyLoaded = useMemo(
    () => fullyLoadedPerWorkorder(sEvents, sStartMs, sEndMs, { includeAnalytics: sIncludeAnalytics }),
    [sEvents, sStartMs, sEndMs, sIncludeAnalytics]
  );
  const perSale = useMemo(() => avgCostPerSale(sEvents), [sEvents]);
  const reconRows = useMemo(() => reconcileVendor(sEvents, sVendorTotals), [sEvents, sVendorTotals]);

  // SMS rollups (cross-store)
  const smsTotals = useMemo(() => sumSmsDimensions(sSmsEvents), [sSmsEvents]);
  const smsByStore = useMemo(
    () => rollupSmsByStore(sSmsEvents, sSmsStoreIDs),
    [sSmsEvents, sSmsStoreIDs]
  );
  const smsByFeature = useMemo(() => rollupSmsByFeature(sSmsEvents), [sSmsEvents]);
  const smsDayBuckets = useMemo(
    () => bucketSmsByDay(sSmsEvents, sStartMs, sEndMs),
    [sSmsEvents, sStartMs, sEndMs]
  );

  function handlePreset(p) {
    _setPresetLabel(p.label);
    _setStartMs(p.start().valueOf());
    _setEndMs(p.end().valueOf());
  }

  const days = Math.max(1, Math.ceil((sEndMs - sStartMs) / (24 * 60 * 60 * 1000)));
  const dailyRunRate = totalProjected / days;
  const monthlyProjection = dailyRunRate * 30;

  return (
    <Dialog
      visible={true}
      onClose={handleExit}
      overlayColor={C.surfaceOverlay}
    >
      <div className={styles.card}>
        <LargeModalHeader
          title={
            <div className={styles.headerLeft}>
              <span className={styles.title}>Cost Analytics</span>
              <span className={styles.subtitle}>
                {dayjs(sStartMs).format("MMM D")}
                {"  →  "}
                {dayjs(sEndMs).format("MMM D, YYYY")}
                {"  ·  "}
                {sEvents.length.toLocaleString()} events
              </span>
            </div>
          }
          actions={
            <LargeModalHeaderButton variant="default" onClick={handleExit}>
              CLOSE
            </LargeModalHeaderButton>
          }
        />
        <div className={styles.presetsRow}>
          {DATE_PRESETS.map((p) => {
            const active = sPresetLabel === p.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => handlePreset(p)}
                className={styles.presetBtn}
                style={{
                  backgroundColor: active ? C.orange : C.blue,
                  border: "none",
                  cursor: "pointer",
                  font: "inherit",
                  color: "white",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB BAR ── */}
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

        {/* ── BODY ── */}
        <div className={styles.body}>
          {sLoading && (
            <div className={styles.loadingWrap}>
              <LoadingIndicator size="large" color={C.blue} message="Loading usage events..." />
            </div>
          )}
          {!sLoading && sError && (
            <div className={styles.errorWrap}>
              <span style={{ color: C.red, fontSize: 14 }}>{sError}</span>
            </div>
          )}
          {!sLoading && !sError && sActiveTab === "overview" && (
            <OverviewTab
              totalProjected={totalProjected}
              dailyRunRate={dailyRunRate}
              monthlyProjection={monthlyProjection}
              eventCount={sEvents.length}
              selfCost={selfCost}
              fullyLoaded={fullyLoaded}
              perSale={perSale}
              vendorRoll={vendorRoll}
              featureRoll={featureRoll}
              dayBuckets={dayBuckets}
              includeAnalytics={sIncludeAnalytics}
              onToggleIncludeAnalytics={() => _setIncludeAnalytics((v) => !v)}
              days={days}
            />
          )}
          {!sLoading && !sError && sActiveTab === "averages" && (
            <AveragesTab
              avgData={avgData}
              includeAnalytics={sIncludeAnalytics}
              onToggleIncludeAnalytics={() => _setIncludeAnalytics((v) => !v)}
            />
          )}
          {!sLoading && !sError && sActiveTab === "features" && (
            <FeaturesTab featureRoll={featureRoll} totalProjected={totalProjected} />
          )}
          {!sLoading && !sError && sActiveTab === "sms" && (
            <SMSTab
              smsLoading={sSmsLoading}
              smsTotals={smsTotals}
              smsByStore={smsByStore}
              smsByFeature={smsByFeature}
              smsDayBuckets={smsDayBuckets}
              storeIDs={sSmsStoreIDs}
              currentStoreID={sSmsStoreIDs[0] || null}
              days={days}
            />
          )}
          {!sLoading && !sError && sActiveTab === "pricing" && (
            <PricingTab
              fullyLoaded={fullyLoaded}
              monthlyProjection={monthlyProjection}
              includeAnalytics={sIncludeAnalytics}
              onToggleIncludeAnalytics={() => _setIncludeAnalytics((v) => !v)}
            />
          )}
          {!sLoading && !sError && sActiveTab === "forecast" && (
            <ForecastTab fullyLoaded={fullyLoaded} />
          )}
          {!sLoading && !sError && sActiveTab === "reconcile" && (
            <ReconcileTab reconRows={reconRows} vendorTotals={sVendorTotals} />
          )}
        </div>
      </div>
    </Dialog>
  );
};

// ════════════════════════ OVERVIEW TAB ════════════════════════
function OverviewTab({
  totalProjected, dailyRunRate, monthlyProjection, eventCount,
  selfCost, fullyLoaded, perSale, vendorRoll, featureRoll, dayBuckets,
  includeAnalytics, onToggleIncludeAnalytics, days,
}) {
  const maxDayCents = Math.max(1, ...dayBuckets.map((b) => b.projectedCents));

  return (
    <div className={styles.scroll}>
      {/* Top metric cards */}
      <div className={styles.metricRow}>
        <MetricCard label="Total Cost (window)" value={centsToDisplay(totalProjected)} accent={C.green} />
        <MetricCard label="Daily Run Rate" value={centsToDisplay(dailyRunRate)} accent={C.blue} sub={"over " + days + " days"} />
        <MetricCard label="Projected / Month" value={centsToDisplay(monthlyProjection)} accent={C.orange} sub="extrapolated" />
        <MetricCard label="Events Tracked" value={eventCount.toLocaleString()} accent={C.darkBlue} sub={"~" + Math.round(eventCount / days) + "/day"} />
      </div>

      {/* Per WO / Per Sale */}
      <div className={styles.metricRow}>
        <MetricCard
          label="Avg Cost / Workorder"
          value={centsToDisplay(fullyLoaded.avgCents)}
          accent={C.green}
          sub={fullyLoaded.workorderCount + " workorders" + (includeAnalytics ? " (incl. analytics)" : " (excl. analytics)")}
        />
        <MetricCard
          label="Avg Cost / Sale"
          value={centsToDisplay(perSale.avgCents)}
          accent={C.green}
          sub={perSale.count + " sales"}
        />
        <MetricCard
          label="Analytics Self-Cost"
          value={centsToDisplay(selfCost.total)}
          accent={C.purple}
          sub={selfCost.eventCount + " events × write + " + selfCost.days + "d scheduler"}
        />
        <div className={styles.metricCard} style={{ backgroundColor: C.surfaceAlt }}>
          <div className={styles.metricLabel}>Include analytics in cost rollups</div>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={includeAnalytics}
              onChange={onToggleIncludeAnalytics}
            />
            <span style={{ marginLeft: 8, fontSize: 13, color: C.text }}>
              {includeAnalytics ? "Including" : "Excluding"} analytics
            </span>
          </label>
          <div className={styles.metricSub}>
            Toggle to see cost floor with/without our own observability.
          </div>
        </div>
      </div>

      {/* Daily trend */}
      <SectionCard title="Daily Cost Trend">
        <div className={styles.barChart}>
          {dayBuckets.length === 0 && (
            <span style={{ color: C.textMuted, fontSize: 12 }}>No data in this window.</span>
          )}
          {dayBuckets.map((b) => {
            const h = Math.max(2, Math.round((b.projectedCents / maxDayCents) * 100));
            return (
              <div key={b.dayMs} className={styles.barCol} title={dayjs(b.dayMs).format("MMM D") + ": " + centsToDisplay(b.projectedCents)}>
                <div
                  className={styles.bar}
                  style={{
                    height: h + "%",
                    backgroundColor: lightenRGBByPercent(C.blue, 30),
                  }}
                />
                <span className={styles.barLabel}>{dayjs(b.dayMs).format("M/D")}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Vendor breakdown */}
      <SectionCard title="Cost by Vendor">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Vendor</th>
                <th style={{ textAlign: "right" }}>Events</th>
                <th style={{ textAlign: "right" }}>Projected</th>
                <th style={{ textAlign: "right" }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {vendorRoll.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: C.textMuted, padding: 12 }}>No events in this window.</td></tr>
              )}
              {vendorRoll.map((row) => {
                const share = totalProjected ? row.projectedCents / totalProjected : 0;
                const label = VENDOR_RATES[row.vendor]?.label || capitalizeFirstLetterOfString(row.vendor);
                return (
                  <tr key={row.vendor}>
                    <td>{label}</td>
                    <td style={{ textAlign: "right" }}>{row.eventCount.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{centsToDisplay(row.projectedCents)}</td>
                    <td style={{ textAlign: "right" }}>{(share * 100).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Top 10 features */}
      <SectionCard title="Top Features by Cost">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Feature</th>
                <th style={{ textAlign: "right" }}>Count</th>
                <th style={{ textAlign: "right" }}>Avg Cost</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Errors</th>
              </tr>
            </thead>
            <tbody>
              {featureRoll.slice(0, 10).map((f) => (
                <tr key={f.feature}>
                  <td><code className={styles.code}>{f.feature}</code></td>
                  <td style={{ textAlign: "right" }}>{f.count.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{centsToDisplay(f.avgCents)}</td>
                  <td style={{ textAlign: "right" }}>{centsToDisplay(f.projectedCents)}</td>
                  <td style={{ textAlign: "right", color: f.errors ? C.red : C.textMuted }}>
                    {f.errors}{f.errors ? " (" + (f.errorRate * 100).toFixed(1) + "%)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ════════════════════════ AVERAGES TAB ════════════════════════
function AveragesTab({ avgData, includeAnalytics, onToggleIncludeAnalytics }) {
  const { rows, woCount, saleCount, systemAvgPerWO, systemAvgPerSale, totalCents } = avgData;

  return (
    <div className={styles.scroll}>
      {/* System-wide averages */}
      <div className={styles.metricRow}>
        <MetricCard
          label="System Avg / Workorder"
          value={centsToDisplay(systemAvgPerWO)}
          accent={C.green}
          sub={woCount + " workorders · all features"}
        />
        <MetricCard
          label="System Avg / Sale"
          value={centsToDisplay(systemAvgPerSale)}
          accent={C.green}
          sub={saleCount + " sales · all features"}
        />
        <MetricCard
          label="Total Cost (window)"
          value={centsToDisplay(totalCents)}
          accent={C.orange}
          sub={rows.length + " features tracked"}
        />
        <div className={styles.metricCard} style={{ backgroundColor: C.surfaceAlt }}>
          <div className={styles.metricLabel}>Include analytics in cost rollups</div>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={includeAnalytics}
              onChange={onToggleIncludeAnalytics}
            />
            <span style={{ marginLeft: 8, fontSize: 13, color: C.text }}>
              {includeAnalytics ? "Including" : "Excluding"} analytics
            </span>
          </label>
          <div className={styles.metricSub}>
            Affects fully-loaded cost on Overview & Pricing tabs.
          </div>
        </div>
      </div>

      <SectionCard title="Per-Feature Averages">
        <p style={{ fontSize: 12, color: C.textMuted, padding: "0 4px 8px 4px" }}>
          Averages divide each feature's total cost by the number of distinct workorders
          ({woCount.toLocaleString()}) or sales ({saleCount.toLocaleString()}) observed in this
          window. Unattached events (no workorderID/saleID) still contribute to the numerator,
          so feature averages may exceed cost-per-call when SMS/Stripe activity is loose.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Feature</th>
                <th style={{ textAlign: "right" }}>Calls</th>
                <th style={{ textAlign: "right" }}>Avg / Workorder</th>
                <th style={{ textAlign: "right" }}>Avg / Sale</th>
                <th style={{ textAlign: "right" }}>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: C.textMuted, padding: 16 }}>No events in this window.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.feature}>
                  <td><code className={styles.code}>{r.feature}</code></td>
                  <td style={{ textAlign: "right" }}>{r.count.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{centsToDisplay(r.avgPerWO)}</td>
                  <td style={{ textAlign: "right" }}>{centsToDisplay(r.avgPerSale)}</td>
                  <td style={{ textAlign: "right" }}>{centsToDisplay(r.totalCents)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr style={{ borderTop: "2px solid " + C.borderStrong }}>
                  <td style={{ fontWeight: 700, color: C.darkBlue }}>System Total</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {rows.reduce((s, r) => s + r.count, 0).toLocaleString()}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: C.green }}>
                    {centsToDisplay(systemAvgPerWO)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: C.green }}>
                    {centsToDisplay(systemAvgPerSale)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {centsToDisplay(totalCents)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ════════════════════════ FEATURES TAB ════════════════════════
function FeaturesTab({ featureRoll, totalProjected }) {
  return (
    <div className={styles.scroll}>
      <SectionCard title="All Features (sorted by cost)">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Feature</th>
                <th style={{ textAlign: "right" }}>Calls</th>
                <th style={{ textAlign: "right" }}>Avg Duration</th>
                <th style={{ textAlign: "right" }}>Avg Cost</th>
                <th style={{ textAlign: "right" }}>Total Cost</th>
                <th style={{ textAlign: "right" }}>Share</th>
                <th style={{ textAlign: "right" }}>Error Rate</th>
              </tr>
            </thead>
            <tbody>
              {featureRoll.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: C.textMuted, padding: 16 }}>No events.</td></tr>
              )}
              {featureRoll.map((f) => {
                const share = totalProjected ? f.projectedCents / totalProjected : 0;
                return (
                  <tr key={f.feature}>
                    <td><code className={styles.code}>{f.feature}</code></td>
                    <td style={{ textAlign: "right" }}>{f.count.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{f.avgDurationMs.toFixed(0)} ms</td>
                    <td style={{ textAlign: "right" }}>{centsToDisplay(f.avgCents)}</td>
                    <td style={{ textAlign: "right" }}>{centsToDisplay(f.projectedCents)}</td>
                    <td style={{ textAlign: "right" }}>{(share * 100).toFixed(2)}%</td>
                    <td style={{ textAlign: "right", color: f.errors ? C.red : C.textMuted }}>
                      {f.errors ? (f.errorRate * 100).toFixed(1) + "%" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ════════════════════════ SMS TAB ════════════════════════
function SMSTab({
  smsLoading,
  smsTotals,
  smsByStore,
  smsByFeature,
  smsDayBuckets,
  storeIDs,
  currentStoreID,
  days,
}) {
  if (smsLoading) {
    return (
      <div className={styles.loadingWrap}>
        <LoadingIndicator size="large" color={C.blue} message="Loading SMS data across stores..." />
      </div>
    );
  }

  const maxDayCents = Math.max(1, ...smsDayBuckets.map((b) => b.projectedCents));
  const storeCount = storeIDs.length;
  const dailyAvgCost = smsTotals.costCents / Math.max(1, days);
  const monthlyProjection = dailyAvgCost * 30;
  // ≤3 stores → side-by-side cards. More → table. Single-store tenants
  // skip the section entirely (nothing to compare).
  const showStoreCards = storeCount > 1 && storeCount <= 3;
  const showStoreTable = storeCount > 3;

  return (
    <div className={styles.scroll}>
      {/* Top metric cards */}
      <div className={styles.metricRow}>
        <MetricCard
          label="Total SMS Cost (window)"
          value={centsToDisplay(smsTotals.costCents)}
          accent={C.green}
          sub={"~" + centsToDisplay(monthlyProjection) + "/mo extrapolated"}
        />
        <MetricCard
          label="Outbound Segments"
          value={smsTotals.outboundSegments.toLocaleString()}
          accent={C.blue}
          sub={smsTotals.outboundSegments
            ? "~" + Math.round(smsTotals.outboundSegments / days) + "/day"
            : "no outbound traffic"}
        />
        <MetricCard
          label="Inbound Segments"
          value={smsTotals.inboundSegments.toLocaleString()}
          accent={C.orange}
          sub={smsTotals.inboundSegments
            ? "~" + Math.round(smsTotals.inboundSegments / days) + "/day"
            : "no inbound traffic"}
        />
        <MetricCard
          label="MMS Messages"
          value={smsTotals.mmsCount.toLocaleString()}
          accent={C.purple}
          sub={smsTotals.mmsCount + " media-bearing sends"}
        />
      </div>

      {/* Daily SMS cost trend */}
      <SectionCard title="Daily SMS Cost Trend">
        <div className={styles.barChart}>
          {smsDayBuckets.length === 0 && (
            <span style={{ color: C.textMuted, fontSize: 12 }}>No SMS activity in this window.</span>
          )}
          {smsDayBuckets.map((b) => {
            const h = Math.max(2, Math.round((b.projectedCents / maxDayCents) * 100));
            return (
              <div
                key={b.dayMs}
                className={styles.barCol}
                title={dayjs(b.dayMs).format("MMM D") + ": " + centsToDisplay(b.projectedCents)}
              >
                <div
                  className={styles.bar}
                  style={{
                    height: h + "%",
                    backgroundColor: lightenRGBByPercent(C.orange, 30),
                  }}
                />
                <span className={styles.barLabel}>{dayjs(b.dayMs).format("M/D")}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Per-store breakdown */}
      {showStoreCards && (
        <SectionCard title={"Per Store (" + storeCount + " stores)"}>
          <div className={styles.metricRow}>
            {smsByStore.map((row) => {
              const isCurrent = row.storeID === currentStoreID;
              return (
                <div
                  key={row.storeID}
                  className={styles.metricCard}
                  style={{ borderTopColor: isCurrent ? C.orange : C.blue }}
                >
                  <div className={styles.metricLabel}>
                    {row.storeID}{isCurrent ? " (this store)" : ""}
                  </div>
                  <div className={styles.metricValue} style={{ color: isCurrent ? C.orange : C.blue }}>
                    {centsToDisplay(row.costCents)}
                  </div>
                  <div className={styles.metricSub}>
                    {row.outboundSegments.toLocaleString()} out · {row.inboundSegments.toLocaleString()} in
                    {row.mmsCount > 0 ? " · " + row.mmsCount + " MMS" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
      {showStoreTable && (
        <SectionCard title={"Per Store (" + storeCount + " stores)"}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Store</th>
                  <th style={{ textAlign: "right" }}>Outbound</th>
                  <th style={{ textAlign: "right" }}>Inbound</th>
                  <th style={{ textAlign: "right" }}>MMS</th>
                  <th style={{ textAlign: "right" }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {smsByStore.map((row) => {
                  const isCurrent = row.storeID === currentStoreID;
                  return (
                    <tr key={row.storeID}>
                      <td style={{ fontWeight: isCurrent ? 700 : 400 }}>
                        {row.storeID}{isCurrent ? " (this store)" : ""}
                      </td>
                      <td style={{ textAlign: "right" }}>{row.outboundSegments.toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>{row.inboundSegments.toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>{row.mmsCount.toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>{centsToDisplay(row.costCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Top SMS-emitting features */}
      <SectionCard title="Top SMS Features by Cost">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Feature</th>
                <th style={{ textAlign: "right" }}>Calls</th>
                <th style={{ textAlign: "right" }}>Outbound Segs</th>
                <th style={{ textAlign: "right" }}>Inbound Segs</th>
                <th style={{ textAlign: "right" }}>MMS</th>
                <th style={{ textAlign: "right" }}>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {smsByFeature.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: C.textMuted, padding: 16 }}>
                  No SMS-emitting features in this window.
                </td></tr>
              )}
              {smsByFeature.map((f) => (
                <tr key={f.feature}>
                  <td><code className={styles.code}>{f.feature}</code></td>
                  <td style={{ textAlign: "right" }}>{f.count.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{f.outboundSegments.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{f.inboundSegments.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{f.mmsCount.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{centsToDisplay(f.costCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ════════════════════════ PRICING TAB ════════════════════════
function PricingTab({ fullyLoaded, monthlyProjection, includeAnalytics, onToggleIncludeAnalytics }) {
  const [sTargetMargin, _setTargetMargin] = useState(0.60);
  const [sProjectedWO, _setProjectedWO] = useState(150);
  const [sFixedMonthly, _setFixedMonthly] = useState(0);
  const [sTestPrice, _setTestPrice] = useState(9900);

  const costPerWO = fullyLoaded.avgCents;
  const subscriptionPrice = computeSubscriptionPrice({
    costPerWorkorderCents: costPerWO,
    woPerMonth: sProjectedWO,
    marginPercent: sTargetMargin,
    fixedMonthlyCents: sFixedMonthly,
  });
  const breakeven = computeBreakeven({
    monthlyPriceCents: sTestPrice,
    costPerWorkorderCents: costPerWO,
    fixedMonthlyCents: sFixedMonthly,
    woPerMonth: sProjectedWO,
  });

  // Recommendation tiers — conservative
  const tiers = [
    { name: "Starter",  woPerMonth: 50,  marginPct: 0.50 },
    { name: "Pro",      woPerMonth: 200, marginPct: 0.65 },
    { name: "Scale",    woPerMonth: 600, marginPct: 0.75 },
  ];

  return (
    <div className={styles.scroll}>
      <SectionCard title="Pricing Inputs">
        <div className={styles.pricingGrid}>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Cost per workorder</label>
            <div className={styles.bigNumber}>{centsToDisplay(costPerWO)}</div>
            <label className={styles.toggleRow}>
              <input type="checkbox" checked={includeAnalytics} onChange={onToggleIncludeAnalytics} />
              <span style={{ marginLeft: 6, fontSize: 11, color: C.textMuted }}>
                {includeAnalytics ? "Including" : "Excluding"} analytics overhead
              </span>
            </label>
            <div className={styles.pricingMeta}>
              attached {centsToDisplay(fullyLoaded.attachedCost)}
              {" + "}unattached {centsToDisplay(fullyLoaded.unattachedCost)}
              {includeAnalytics ? " + analytics " + centsToDisplay(fullyLoaded.selfCost) : ""}
            </div>
          </div>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Workorders per month (this customer)</label>
            <input
              type="number"
              value={sProjectedWO}
              onChange={(e) => _setProjectedWO(Number(e.target.value) || 0)}
              className={styles.numberInput}
              style={{ borderColor: C.buttonLightGreenOutline, color: C.text, backgroundColor: C.listItemWhite }}
            />
            <div className={styles.pricingMeta}>variable cost {centsToDisplay(costPerWO * sProjectedWO)}/mo</div>
          </div>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Target margin</label>
            <input
              type="range"
              min={0} max={0.95} step={0.05}
              value={sTargetMargin}
              onChange={(e) => _setTargetMargin(Number(e.target.value))}
            />
            <div className={styles.bigNumber}>{(sTargetMargin * 100).toFixed(0)}%</div>
          </div>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Fixed monthly overhead (your bills)</label>
            <input
              type="number"
              value={sFixedMonthly}
              onChange={(e) => _setFixedMonthly(Number(e.target.value) || 0)}
              className={styles.numberInput}
              style={{ borderColor: C.buttonLightGreenOutline, color: C.text, backgroundColor: C.listItemWhite }}
            />
            <div className={styles.pricingMeta}>cents per month (e.g. server, support)</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Recommended Subscription Price">
        <div className={styles.recommendBox} style={{ backgroundColor: lightenRGBByPercent(C.green, 80) }}>
          <span className={styles.recommendValue} style={{ color: C.darkBlue }}>
            {centsToDisplay(subscriptionPrice)} / month
          </span>
          <span className={styles.recommendCaption} style={{ color: C.textSecondary }}>
            at {sProjectedWO} workorders/mo, {(sTargetMargin * 100).toFixed(0)}% margin, {centsToDisplay(sFixedMonthly)} fixed
          </span>
        </div>
      </SectionCard>

      <SectionCard title="Tier Suggestions">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Tier</th>
                <th style={{ textAlign: "right" }}>Target WO/mo</th>
                <th style={{ textAlign: "right" }}>Margin</th>
                <th style={{ textAlign: "right" }}>Suggested Price</th>
                <th style={{ textAlign: "right" }}>Variable Cost</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => {
                const price = computeSubscriptionPrice({
                  costPerWorkorderCents: costPerWO,
                  woPerMonth: t.woPerMonth,
                  marginPercent: t.marginPct,
                  fixedMonthlyCents: sFixedMonthly,
                });
                const variable = costPerWO * t.woPerMonth;
                return (
                  <tr key={t.name}>
                    <td><strong>{t.name}</strong></td>
                    <td style={{ textAlign: "right" }}>{t.woPerMonth}</td>
                    <td style={{ textAlign: "right" }}>{(t.marginPct * 100).toFixed(0)}%</td>
                    <td style={{ textAlign: "right", color: C.green, fontWeight: 700 }}>{centsToDisplay(price)}</td>
                    <td style={{ textAlign: "right", color: C.textMuted }}>{centsToDisplay(variable)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="What-If: Pick a Price">
        <div className={styles.pricingGrid}>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Monthly price (cents)</label>
            <input
              type="number"
              value={sTestPrice}
              onChange={(e) => _setTestPrice(Number(e.target.value) || 0)}
              className={styles.numberInput}
              style={{ borderColor: C.buttonLightGreenOutline, color: C.text, backgroundColor: C.listItemWhite }}
            />
            <div className={styles.pricingMeta}>= {centsToDisplay(sTestPrice)} / month</div>
          </div>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Breakeven workorders/month</label>
            <div className={styles.bigNumber}>{costPerWO ? Math.round(breakeven.breakevenWO) : "—"}</div>
            <div className={styles.pricingMeta}>at {centsToDisplay(costPerWO)} per WO</div>
          </div>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Margin at {sProjectedWO} WO/mo</label>
            <div className={styles.bigNumber} style={{ color: breakeven.margin >= 0 ? C.green : C.red }}>
              {(breakeven.margin * 100).toFixed(1)}%
            </div>
            <div className={styles.pricingMeta}>negative = losing money</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Strategy Notes">
        <ul className={styles.notesList}>
          <li>Start with <strong>Pro tier (~65% margin)</strong> as anchor; Starter draws in small shops, Scale captures heavy users.</li>
          <li>Variable cost grows linearly — heavy-SMS shops cost more. Consider a usage-based overage above ~2× the tier's WO count.</li>
          <li>Fixed monthly overhead spreads across all tenants — current model assumes 1; raise it as you add hosting/staff costs.</li>
          <li>Analytics-cost line is real but small. Toggle off to set a price floor that you'd ship without observability.</li>
          <li>Stripe & Twilio pass-through fees: do NOT mark these up in the base subscription — bill at cost or list separately.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

// ════════════════════════ FORECAST TAB ════════════════════════
function ForecastTab({ fullyLoaded }) {
  const [sWoNow, _setWoNow] = useState(Math.max(50, fullyLoaded.workorderCount));
  const [sGrowth, _setGrowth] = useState(0.05);
  const curve = makeGrowthCurve(sWoNow, fullyLoaded.avgCents, 12, sGrowth);
  const peakCents = curve[curve.length - 1]?.projectedCostCents || 0;
  const peakWo = curve[curve.length - 1]?.projectedWO || 0;

  return (
    <div className={styles.scroll}>
      <SectionCard title="Growth Inputs">
        <div className={styles.pricingGrid}>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Current workorders / month</label>
            <input
              type="number"
              value={sWoNow}
              onChange={(e) => _setWoNow(Number(e.target.value) || 0)}
              className={styles.numberInput}
              style={{ borderColor: C.buttonLightGreenOutline, color: C.text, backgroundColor: C.listItemWhite }}
            />
          </div>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Monthly growth rate</label>
            <input
              type="range"
              min={0} max={0.30} step={0.01}
              value={sGrowth}
              onChange={(e) => _setGrowth(Number(e.target.value))}
            />
            <div className={styles.bigNumber}>{(sGrowth * 100).toFixed(0)}%</div>
            <div className={styles.pricingMeta}>compounding monthly</div>
          </div>
          <div className={styles.pricingInputCard}>
            <label className={styles.inputLabel}>Year-end projection</label>
            <div className={styles.bigNumber}>{peakWo.toLocaleString()} WO/mo</div>
            <div className={styles.pricingMeta}>~{centsToDisplay(peakCents)} cost/mo</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="12-Month Curve">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Month</th>
                <th style={{ textAlign: "right" }}>Projected WO</th>
                <th style={{ textAlign: "right" }}>Cost / Month</th>
              </tr>
            </thead>
            <tbody>
              {curve.map((row) => (
                <tr key={row.month}>
                  <td>Month {row.month}</td>
                  <td style={{ textAlign: "right" }}>{row.projectedWO.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{centsToDisplay(row.projectedCostCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ════════════════════════ RECONCILE TAB ════════════════════════
function ReconcileTab({ reconRows, vendorTotals }) {
  return (
    <div className={styles.scroll}>
      <SectionCard title="Projected vs Vendor Actuals">
        <p style={{ fontSize: 12, color: C.textMuted, padding: "0 4px 8px 4px" }}>
          Vendor totals are pulled nightly from Twilio / Stripe / GCP billing.
          Flagged rows have actuals more than 20% off projection — usually a missing
          instrumentation point or rate change.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Vendor</th>
                <th style={{ textAlign: "right" }}>Projected</th>
                <th style={{ textAlign: "right" }}>Actual</th>
                <th style={{ textAlign: "right" }}>Δ</th>
                <th style={{ textAlign: "right" }}>Δ %</th>
                <th style={{ textAlign: "left" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {reconRows.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: C.textMuted, padding: 16 }}>
                  No vendor totals loaded for this window. Scheduler runs nightly — check back tomorrow.
                </td></tr>
              )}
              {reconRows.map((r) => (
                <tr key={r.vendor}>
                  <td>{VENDOR_RATES[r.vendor]?.label || capitalizeFirstLetterOfString(r.vendor)}</td>
                  <td style={{ textAlign: "right" }}>{centsToDisplay(r.projectedCents)}</td>
                  <td style={{ textAlign: "right" }}>{r.noActualYet ? "—" : centsToDisplay(r.actualCents)}</td>
                  <td style={{ textAlign: "right", color: r.deltaCents > 0 ? C.red : C.green }}>
                    {r.noActualYet ? "—" : centsToDisplay(r.deltaCents, { signed: true })}
                  </td>
                  <td style={{ textAlign: "right", color: r.flagged ? C.red : C.textMuted }}>
                    {r.noActualYet ? "—" : (r.deltaPct * 100).toFixed(1) + "%"}
                  </td>
                  <td>
                    {r.noActualYet ? (
                      <span style={{ color: C.textMuted, fontSize: 12 }}>pending</span>
                    ) : r.flagged ? (
                      <span style={{ color: C.red, fontSize: 12, fontWeight: 700 }}>⚠ review</span>
                    ) : (
                      <span style={{ color: C.green, fontSize: 12 }}>✓ in tolerance</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Vendor Totals Loaded">
        <div style={{ fontSize: 12, color: C.textMuted, padding: 4 }}>
          {vendorTotals.length === 0
            ? "No usage-vendor-totals docs found in this window."
            : vendorTotals.length + " period totals loaded"}
        </div>
      </SectionCard>
    </div>
  );
}

// ════════════════════════ SHARED ════════════════════════

function MetricCard({ label, value, accent = C.blue, sub }) {
  return (
    <div className={styles.metricCard} style={{ borderTopColor: accent }}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue} style={{ color: accent }}>{value}</div>
      {sub && <div className={styles.metricSub}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle} style={{ color: C.textSecondary }}>{title}</div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}
