/*eslint-disable*/
/**
 * Analytics helpers — pure functions for aggregating usage-events.
 *
 * Inputs: array of usage-event docs (shape from functions/usageTracking.js).
 * Outputs: rollups, breakdowns, cost projections.
 *
 * All cost figures expressed in cents. Convert with centsToDisplay() at the UI.
 */

import { firestoreQuery } from "../../../../db_calls";
import { useSettingsStore } from "../../../../stores";
import {
  DIMENSION_RATES,
  ANALYTICS_PER_EVENT_CENTS,
  ANALYTICS_SCHEDULER_DAILY_CENTS,
} from "./vendorRates";

function getTenantStoreIDs() {
  const s = useSettingsStore.getState().getSettings() || {};
  return { tenantID: s.tenantID, storeID: s.storeID };
}

// ─── Firestore loader ──────────────────────────────────────────────────────

/**
 * Load usage-events within a date range. Returns raw event docs.
 * Path: tenants/{tenantID}/stores/{storeID}/usage-events
 */
export async function loadUsageEvents(startMillis, endMillis, opts = {}) {
  const { tenantID, storeID } = getTenantStoreIDs();
  if (!tenantID || !storeID) return [];

  const path = `tenants/${tenantID}/stores/${storeID}/usage-events`;
  const where = [
    { field: "createdAtMs", operator: ">=", value: startMillis },
    { field: "createdAtMs", operator: "<=", value: endMillis },
  ];
  const events = await firestoreQuery(path, where, {
    orderBy: { field: "createdAtMs", direction: "desc" },
    limit: opts.limit || 5000,
  });
  return events || [];
}

/**
 * Load vendor totals (actual vendor invoices) within a month window.
 * Path: tenants/{tenantID}/stores/{storeID}/usage-vendor-totals
 */
export async function loadVendorTotals(startMillis, endMillis) {
  const { tenantID, storeID } = getTenantStoreIDs();
  if (!tenantID || !storeID) return [];

  const path = `tenants/${tenantID}/stores/${storeID}/usage-vendor-totals`;
  try {
    const docs = await firestoreQuery(path, [], {
      orderBy: { field: "periodEndMs", direction: "desc" },
      limit: 24,
    });
    return (docs || []).filter((d) => {
      const ms = d.periodEndMs || 0;
      return ms >= startMillis && ms <= endMillis;
    });
  } catch (err) {
    return [];
  }
}

// ─── Cost projection ───────────────────────────────────────────────────────

/**
 * Project per-event cost from instrumented counter dimensions.
 * Each event already carries dim counters; multiply by rate.
 */
export function projectEventCost(event) {
  if (!event) return 0;
  let cents = 0;
  for (const dim of Object.keys(DIMENSION_RATES)) {
    const qty = Number(event[dim]) || 0;
    if (qty <= 0) continue;
    const rateCents = DIMENSION_RATES[dim].cents();
    cents += qty * rateCents;
  }
  // Stripe events report raw fees in cents directly
  if (event.stripeFeesCents) cents += Number(event.stripeFeesCents) || 0;
  return cents;
}

export function sumProjectedCost(events) {
  let total = 0;
  for (const e of events) total += projectEventCost(e);
  return total;
}

/**
 * Group events by feature and produce per-feature rollup.
 *  → [{ feature, count, projectedCents, avgCents, errorRate, ...dimSums }]
 */
export function rollupByFeature(events) {
  const map = {};
  for (const e of events) {
    const key = e.feature || "unknown";
    if (!map[key]) {
      map[key] = {
        feature: key,
        count: 0,
        errors: 0,
        projectedCents: 0,
        durationMsTotal: 0,
        dims: {},
      };
    }
    const bucket = map[key];
    bucket.count += 1;
    if (!e.ok) bucket.errors += 1;
    bucket.projectedCents += projectEventCost(e);
    bucket.durationMsTotal += Number(e.durationMs) || 0;
    for (const dim of Object.keys(DIMENSION_RATES)) {
      const qty = Number(e[dim]) || 0;
      if (!qty) continue;
      bucket.dims[dim] = (bucket.dims[dim] || 0) + qty;
    }
    if (e.stripeFeesCents) {
      bucket.dims.stripeFeesCents = (bucket.dims.stripeFeesCents || 0) + Number(e.stripeFeesCents);
    }
  }
  return Object.values(map)
    .map((b) => ({
      ...b,
      avgCents: b.count ? b.projectedCents / b.count : 0,
      avgDurationMs: b.count ? b.durationMsTotal / b.count : 0,
      errorRate: b.count ? b.errors / b.count : 0,
    }))
    .sort((a, b) => b.projectedCents - a.projectedCents);
}

/**
 * Group events by vendor (mapped via DIMENSION_RATES).
 *  → [{ vendor, projectedCents, eventCount }]
 */
export function rollupByVendor(events) {
  const vendorMap = {};
  for (const e of events) {
    for (const dim of Object.keys(DIMENSION_RATES)) {
      const qty = Number(e[dim]) || 0;
      if (qty <= 0) continue;
      const vendor = DIMENSION_RATES[dim].vendor;
      const cents = qty * DIMENSION_RATES[dim].cents();
      if (!vendorMap[vendor]) vendorMap[vendor] = { vendor, projectedCents: 0, eventCount: 0 };
      vendorMap[vendor].projectedCents += cents;
    }
    if (e.stripeFeesCents) {
      if (!vendorMap.stripe) vendorMap.stripe = { vendor: "stripe", projectedCents: 0, eventCount: 0 };
      vendorMap.stripe.projectedCents += Number(e.stripeFeesCents) || 0;
    }
  }
  // Event counts per vendor: every event that has at least one dim for that vendor counts
  for (const e of events) {
    const vendorsTouched = new Set();
    for (const dim of Object.keys(DIMENSION_RATES)) {
      const qty = Number(e[dim]) || 0;
      if (qty > 0) vendorsTouched.add(DIMENSION_RATES[dim].vendor);
    }
    if (e.stripeFeesCents) vendorsTouched.add("stripe");
    vendorsTouched.forEach((v) => {
      if (vendorMap[v]) vendorMap[v].eventCount += 1;
    });
  }
  return Object.values(vendorMap).sort((a, b) => b.projectedCents - a.projectedCents);
}

/**
 * Per-feature averages — for each feature, divide total cost by distinct
 * workorders / sales observed in the window. Also returns the system-wide
 * total averages (sum of ALL feature costs divided by the same denominators).
 *
 * Denominator policy: distinct workorderID / saleID seen across ALL events
 * in the window (not just those for the given feature). This answers
 * "if we have N workorders, this feature contributes $X per workorder on
 * average" — the right shape for SaaS pricing.
 *
 *  → {
 *      rows: [{ feature, count, totalCents, avgPerWO, avgPerSale }],
 *      woCount, saleCount,
 *      systemAvgPerWO, systemAvgPerSale, totalCents,
 *    }
 */
export function perFeatureAverages(events) {
  const woSet = new Set();
  const saleSet = new Set();
  for (const e of events) {
    if (e.workorderID) woSet.add(e.workorderID);
    if (e.saleID) saleSet.add(e.saleID);
  }
  const woCount = woSet.size;
  const saleCount = saleSet.size;
  const woDiv = woCount || 1;
  const saleDiv = saleCount || 1;

  const byFeature = {};
  for (const e of events) {
    const key = e.feature || "unknown";
    if (!byFeature[key]) byFeature[key] = { feature: key, count: 0, totalCents: 0 };
    byFeature[key].count += 1;
    byFeature[key].totalCents += projectEventCost(e);
  }

  const rows = Object.values(byFeature)
    .map((r) => ({
      ...r,
      avgPerWO: r.totalCents / woDiv,
      avgPerSale: r.totalCents / saleDiv,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  const totalCents = sumProjectedCost(events);

  return {
    rows,
    woCount,
    saleCount,
    systemAvgPerWO: totalCents / woDiv,
    systemAvgPerSale: totalCents / saleDiv,
    totalCents,
  };
}

/**
 * Group events by parent workorderID. Events without workorderID go to "unattached".
 *  → [{ workorderID, count, projectedCents, features: { sms.send: 3, ... } }]
 */
export function rollupByWorkorder(events) {
  const map = {};
  for (const e of events) {
    const key = e.workorderID || "__unattached__";
    if (!map[key]) {
      map[key] = { workorderID: key, count: 0, projectedCents: 0, features: {}, lastMs: 0 };
    }
    map[key].count += 1;
    map[key].projectedCents += projectEventCost(e);
    map[key].features[e.feature || "unknown"] = (map[key].features[e.feature || "unknown"] || 0) + 1;
    map[key].lastMs = Math.max(map[key].lastMs, Number(e.createdAtMs) || 0);
  }
  return Object.values(map).sort((a, b) => b.projectedCents - a.projectedCents);
}

/**
 * Group events by parent saleID.
 */
export function rollupBySale(events) {
  const map = {};
  for (const e of events) {
    const key = e.saleID || "__unattached__";
    if (!map[key]) {
      map[key] = { saleID: key, count: 0, projectedCents: 0, features: {}, lastMs: 0 };
    }
    map[key].count += 1;
    map[key].projectedCents += projectEventCost(e);
    map[key].features[e.feature || "unknown"] = (map[key].features[e.feature || "unknown"] || 0) + 1;
    map[key].lastMs = Math.max(map[key].lastMs, Number(e.createdAtMs) || 0);
  }
  return Object.values(map).sort((a, b) => b.projectedCents - a.projectedCents);
}

/**
 * Bucket events into daily totals between start/end.
 *  → [{ dayMs, count, projectedCents }]
 */
export function bucketByDay(events, startMillis, endMillis) {
  const dayMs = 24 * 60 * 60 * 1000;
  const buckets = {};
  const firstDay = Math.floor(startMillis / dayMs) * dayMs;
  const lastDay = Math.floor(endMillis / dayMs) * dayMs;
  for (let d = firstDay; d <= lastDay; d += dayMs) {
    buckets[d] = { dayMs: d, count: 0, projectedCents: 0 };
  }
  for (const e of events) {
    const ms = Number(e.createdAtMs) || 0;
    if (!ms) continue;
    const day = Math.floor(ms / dayMs) * dayMs;
    if (!buckets[day]) buckets[day] = { dayMs: day, count: 0, projectedCents: 0 };
    buckets[day].count += 1;
    buckets[day].projectedCents += projectEventCost(e);
  }
  return Object.values(buckets).sort((a, b) => a.dayMs - b.dayMs);
}

// ─── Analytics self-cost ───────────────────────────────────────────────────

/**
 * Cost of running the analytics system itself over the window.
 * Each usage-event = 1 Firestore write (write itself was the analytics cost).
 * Plus a per-day scheduler cost for reconciliation jobs.
 */
export function computeAnalyticsSelfCost(events, startMillis, endMillis) {
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(1, Math.ceil((endMillis - startMillis) / dayMs));
  const eventWrites = events.length * ANALYTICS_PER_EVENT_CENTS;
  const schedulerCost = days * ANALYTICS_SCHEDULER_DAILY_CENTS;
  return {
    eventWrites,
    schedulerCost,
    total: eventWrites + schedulerCost,
    eventCount: events.length,
    days,
  };
}

// ─── Per-workorder / per-sale averages ────────────────────────────────────

/**
 * Compute average cost per workorder. Counts only events that carry a workorderID;
 * uncategorized events bubble up via the fully-loaded average separately.
 */
export function avgCostPerWorkorder(events) {
  const grouped = rollupByWorkorder(events).filter((g) => g.workorderID !== "__unattached__");
  if (!grouped.length) return { avgCents: 0, count: 0 };
  const total = grouped.reduce((s, g) => s + g.projectedCents, 0);
  return { avgCents: total / grouped.length, count: grouped.length, total };
}

export function avgCostPerSale(events) {
  const grouped = rollupBySale(events).filter((g) => g.saleID !== "__unattached__");
  if (!grouped.length) return { avgCents: 0, count: 0 };
  const total = grouped.reduce((s, g) => s + g.projectedCents, 0);
  return { avgCents: total / grouped.length, count: grouped.length, total };
}

/**
 * "Fully-loaded" per-workorder cost: bake in unattached events + analytics self-cost
 * by spreading them across the workorder count proportionally.
 */
export function fullyLoadedPerWorkorder(events, startMillis, endMillis, opts = {}) {
  const includeAnalytics = opts.includeAnalytics !== false;
  const woRoll = rollupByWorkorder(events);
  const attached = woRoll.filter((g) => g.workorderID !== "__unattached__");
  const unattached = woRoll.find((g) => g.workorderID === "__unattached__");
  const workorderCount = attached.length || 1;

  const attachedCost = attached.reduce((s, g) => s + g.projectedCents, 0);
  const unattachedCost = unattached ? unattached.projectedCents : 0;
  const selfCost = includeAnalytics
    ? computeAnalyticsSelfCost(events, startMillis, endMillis).total
    : 0;

  const totalAllocated = attachedCost + unattachedCost + selfCost;
  return {
    avgCents: totalAllocated / workorderCount,
    workorderCount,
    attachedCost,
    unattachedCost,
    selfCost,
    totalAllocated,
  };
}

// ─── Pricing strategy ──────────────────────────────────────────────────────

/**
 * Given a per-workorder fully-loaded cost and a target margin,
 * compute the monthly subscription price needed at a given workorder volume.
 *
 * monthlyPrice = (costPerWO * woPerMonth) * (1 + margin) + fixedMonthlyCents
 */
export function computeSubscriptionPrice(opts) {
  const {
    costPerWorkorderCents,
    woPerMonth = 100,
    marginPercent = 0.60,
    fixedMonthlyCents = 0,
  } = opts;
  const variable = costPerWorkorderCents * woPerMonth;
  const withMargin = variable * (1 + marginPercent);
  return Math.round(withMargin + fixedMonthlyCents);
}

/**
 * Reverse: given a monthly price, compute breakeven WO count and margin at a given volume.
 */
export function computeBreakeven(opts) {
  const { monthlyPriceCents, costPerWorkorderCents, fixedMonthlyCents = 0 } = opts;
  if (!costPerWorkorderCents) return { breakevenWO: 0, margin: 0 };
  const variableBudget = monthlyPriceCents - fixedMonthlyCents;
  return {
    breakevenWO: variableBudget / costPerWorkorderCents,
    margin: (monthlyPriceCents - (costPerWorkorderCents * (opts.woPerMonth || 100) + fixedMonthlyCents)) / monthlyPriceCents,
  };
}

// ─── Reconciliation ────────────────────────────────────────────────────────

/**
 * Compare instrumented sums vs vendor totals over a window.
 * Flags any vendor whose actual exceeds projected by >20%.
 */
export function reconcileVendor(events, vendorTotals) {
  const projected = rollupByVendor(events);
  const projMap = {};
  for (const p of projected) projMap[p.vendor] = p.projectedCents;

  const rows = [];
  for (const t of vendorTotals) {
    const vendor = t.vendor || "unknown";
    const projectedCents = projMap[vendor] || 0;
    const actualCents = Number(t.amountCents) || 0;
    const deltaCents = actualCents - projectedCents;
    const deltaPct = projectedCents ? deltaCents / projectedCents : 0;
    rows.push({
      vendor,
      projectedCents,
      actualCents,
      deltaCents,
      deltaPct,
      flagged: Math.abs(deltaPct) > 0.20,
      periodStartMs: t.periodStartMs,
      periodEndMs: t.periodEndMs,
    });
  }
  // Include vendors with projection but no actual yet
  for (const v of Object.keys(projMap)) {
    if (!rows.find((r) => r.vendor === v)) {
      rows.push({
        vendor: v,
        projectedCents: projMap[v],
        actualCents: 0,
        deltaCents: -projMap[v],
        deltaPct: -1,
        flagged: false,
        noActualYet: true,
      });
    }
  }
  return rows.sort((a, b) => b.projectedCents - a.projectedCents);
}

// ─── Forecasting ───────────────────────────────────────────────────────────

/**
 * Project monthly cost at hypothetical workorder growth.
 * Linear: assumes cost scales with WO count.
 */
export function forecastMonthlyCost(currentCostPerWoCents, projectedWoCount) {
  return currentCostPerWoCents * projectedWoCount;
}

export function makeGrowthCurve(currentWoPerMonth, currentCostPerWoCents, months = 12, growthPerMonth = 0.05) {
  const rows = [];
  let wo = currentWoPerMonth;
  for (let i = 1; i <= months; i++) {
    wo = wo * (1 + growthPerMonth);
    rows.push({
      month: i,
      projectedWO: Math.round(wo),
      projectedCostCents: Math.round(wo * currentCostPerWoCents),
    });
  }
  return rows;
}
