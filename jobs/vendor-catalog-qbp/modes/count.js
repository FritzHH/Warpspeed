// Lightweight catalog-size probe. Fires every 15 min during business hours
// from Cloud Scheduler. Hits the same cheap /1/product/skulist endpoint
// master mode uses for skip-hash detection, counts the returned array, and
// writes the result to /vendor_catalogs/qbp/_meta/lastInventoryCount with a
// rolling 96-entry history (~24h of probes at 15-min cadence × 8h day).
//
// Swing flag: if |count - previousCount| / previousCount > 5%, the snapshot
// is stamped `unusualSwing: true`. No alerting plumbing in v1 - just a flag
// a dashboard can surface.

const admin = require("firebase-admin");
const { qbpRequest } = require("../api");
const { initRtdb } = require("../rtdb");
const { extractSkus } = require("./master");

const META_PATH = "vendor_catalogs/qbp/_meta/lastInventoryCount";
const HISTORY_CAP = 96;
const SWING_THRESHOLD = 0.05;

async function runCountProbe() {
  const startedAt = Date.now();
  const db = initRtdb();

  console.log(`[qbp-count] fetching skulist`);
  const skulistResp = await qbpRequest("product/skulist");
  const skus = extractSkus(skulistResp);
  const count = skus.length;

  if (count === 0) {
    throw new Error("QBP skulist returned 0 SKUs - refusing to write probe");
  }

  const prevSnap = await db.ref(META_PATH).once("value");
  const prev = prevSnap.val() || {};
  const previousCount = Number(prev.count) || 0;

  const delta = previousCount > 0 ? count - previousCount : 0;
  const swingPct = previousCount > 0 ? Math.abs(delta) / previousCount : 0;
  const unusualSwing = previousCount > 0 && swingPct > SWING_THRESHOLD;

  const checkedAtMs = Date.now();
  const history = Array.isArray(prev.history) ? prev.history.slice() : [];
  history.push({
    count,
    checkedAtMs,
    source: "qbp-skulist",
    cached: false,
  });
  while (history.length > HISTORY_CAP) history.shift();

  const payload = {
    count,
    previousCount,
    delta,
    swingPct,
    unusualSwing,
    source: "qbp-skulist",
    cached: false,
    checkedAt: admin.database.ServerValue.TIMESTAMP,
    durationSec: (Date.now() - startedAt) / 1000,
    history,
  };

  await db.ref(META_PATH).set(payload);

  const sign = delta >= 0 ? "+" : "";
  console.log(
    `[qbp-count] count=${count} prev=${previousCount} delta=${sign}${delta} swing=${(swingPct * 100).toFixed(2)}%${unusualSwing ? " UNUSUAL" : ""}`
  );
  return { count, previousCount, delta, swingPct, unusualSwing };
}

module.exports = { runCountProbe };
