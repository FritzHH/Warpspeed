/* eslint-disable */
// Accumulation library for the semi-monthly per_sale invoicer.
//
// The invoicer runs twice a month (1st / 16th) and bills each per_sale
// tenant for fees on all sales recorded in the period, regardless of
// payment method or downstream refund. Revenue base is gross sale minus
// sales tax — refunds do NOT credit because the database/infra cost of a
// refunded sale is the same (and arguably more) than a clean one.
//
// Revenue base per sale:
//   netBase = total - salesTax
//
// Fee per sale: round(netBase * platformFeePercentSnapshot / 100). The
// snapshot is stamped at sale-write time by per-sale-stamper.js so the
// rate is locked at point-of-sale even if the tenant's % changes later.
//
// Monthly floor: enforced upstream by the invoicer (Phase 4) — this
// library returns the computed (pre-floor) numbers so the invoicer can
// decide based on what the 1H period of the same month already billed.
// $10/month floor on a 1H run alone would over-bill (we don't know yet
// whether 2H will catch up), so the math here is honest; floor logic is
// orchestration, not accumulation.

// ─── Period key math ─────────────────────────────────────────────────────────

// Parse "YYYY-MM-1H" / "YYYY-MM-2H" back into a [startMs, endMs) range in
// the given TZ. 1H = day 1 00:00 .. day 16 00:00; 2H = day 16 00:00 ..
// next month's day 1 00:00. End is exclusive to avoid boundary double-count.
function parsePeriodKeyRange(periodKey, timeZone = "America/Chicago") {
  if (typeof periodKey !== "string") return null;
  const m = periodKey.match(/^(\d{4})-(\d{2})-(1H|2H)$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const half = m[3];
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

  const startDay = half === "1H" ? 1 : 16;
  const startMs = wallClockToMillis(year, month, startDay, timeZone);

  let endMs;
  if (half === "1H") {
    endMs = wallClockToMillis(year, month, 16, timeZone);
  } else {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    endMs = wallClockToMillis(nextYear, nextMonth, 1, timeZone);
  }
  return { startMs, endMs };
}

// Convert a wall-clock (year, month, day, 00:00 local) in the given TZ
// to a UTC millis. Works by computing the TZ offset at that local moment
// and applying it — avoids node-tz / luxon dependencies.
function wallClockToMillis(year, month, day, timeZone) {
  const guessUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const guessOffsetMin = tzOffsetMinutes(guessUtcMs, timeZone);
  const correctedMs = guessUtcMs - guessOffsetMin * 60 * 1000;
  // Re-derive offset at the corrected moment in case the wall-clock straddles
  // a DST boundary; in practice 1st/16th midnight never crosses, but guard
  // anyway so the math is bulletproof.
  const correctedOffsetMin = tzOffsetMinutes(correctedMs, timeZone);
  if (correctedOffsetMin === guessOffsetMin) return correctedMs;
  return guessUtcMs - correctedOffsetMin * 60 * 1000;
}

function tzOffsetMinutes(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const obj = {};
  for (const p of parts) obj[p.type] = p.value;
  const tzUtcMs = Date.UTC(
    parseInt(obj.year, 10),
    parseInt(obj.month, 10) - 1,
    parseInt(obj.day, 10),
    parseInt(obj.hour === "24" ? "0" : obj.hour, 10),
    parseInt(obj.minute, 10),
    parseInt(obj.second, 10)
  );
  return (tzUtcMs - utcMs) / 60000;
}

// ─── Store enumeration ───────────────────────────────────────────────────────

async function listTenantStoreIDs(db, tenantID) {
  const snap = await db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .get();
  return snap.docs.map((d) => d.id);
}

// ─── Sale enumeration ────────────────────────────────────────────────────────

// All completed-sales for one store keyed to a single period. Relies on
// the feeBillingPeriodKey index stamped by per-sale-stamper. Non-per_sale
// tenants won't have the field stamped, so this returns [] for them —
// the invoicer never reaches here for monthly_sub anyway.
async function enumeratePeriodSales(db, tenantID, storeID, periodKey) {
  if (!tenantID || !storeID || !periodKey) return [];
  const snap = await db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .doc(storeID)
    .collection("completed-sales")
    .where("feeBillingPeriodKey", "==", periodKey)
    .get();
  return snap.docs.map((d) => ({ id: d.id, storeID, ...d.data() }));
}

// Fan out across all stores under a tenant. Cheaper than a collection-
// group query (no extra tenantID-on-sale index needed) and bounded — a
// tenant with N stores does N parallel queries, all single-equality.
async function enumeratePeriodSalesForTenant(db, tenantID, periodKey) {
  const storeIDs = await listTenantStoreIDs(db, tenantID);
  const perStore = await Promise.all(
    storeIDs.map((storeID) =>
      enumeratePeriodSales(db, tenantID, storeID, periodKey)
    )
  );
  return perStore.flat();
}

// ─── Per-sale fee math ───────────────────────────────────────────────────────

// Revenue base for a single sale: gross minus sales tax. Refunds do NOT
// credit (the infra cost of a refunded sale is the same), so this stays
// a pure two-field read off the sale doc — no transaction lookups, no
// in-period millis filtering, no cross-period adjustment.
function computeSaleBaseCents(sale) {
  const baseCents = Math.max(
    0,
    (Number(sale.total) || 0) - (Number(sale.salesTax) || 0)
  );
  return baseCents;
}

// ─── Period fee accumulator ──────────────────────────────────────────────────

// Pure accumulator over an already-fetched set of sales. Returns per-sale
// line items + totals so the invoicer can write per-store aggregates onto
// the Stripe invoice (audit trail + tenant clarity), and so manual replay
// can reproduce billing without re-querying.
function computePeriodFeeCents({ sales }) {
  let baseRevenueCents = 0;
  let computedFeeCents = 0;
  const lineItems = [];

  for (const sale of sales) {
    const pct = Number(sale.platformFeePercentSnapshot);
    if (!Number.isFinite(pct) || pct <= 0) continue;

    const baseCents = computeSaleBaseCents(sale);
    if (baseCents === 0) continue;

    const feeCents = Math.round((baseCents * pct) / 100);
    baseRevenueCents += baseCents;
    computedFeeCents += feeCents;

    lineItems.push({
      saleID: sale.id,
      storeID: sale.storeID,
      baseCents,
      pct,
      feeCents,
    });
  }

  return { baseRevenueCents, computedFeeCents, lineItems };
}

module.exports = {
  parsePeriodKeyRange,
  listTenantStoreIDs,
  enumeratePeriodSales,
  enumeratePeriodSalesForTenant,
  computeSaleBaseCents,
  computePeriodFeeCents,
};
