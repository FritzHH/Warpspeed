// Inventory mode — per-warehouse stock refresh.
//
// QBP exposes per-warehouse availability as a separate endpoint
// (/1/availability/warehouse/{code}). There's no global "all warehouses,
// all SKUs" call, so we fan out across the configured warehouse codes,
// merge into a per-SKU `{ warehouseCode: qty }` map, and write the result.
//
// Unlike master mode, inventory NEVER skips. Warehouse stock changes
// every few minutes; a daily cron with skip-if-unchanged would mask that.
// We always wipe + repopulate /vendor_catalogs/qbp/inventory_by_item and
// record per-warehouse counts in meta for observability.
//
// Storage shape mirrors JBI's inventory_by_item exactly so consumers can
// treat both vendors identically:
//
//   inventory_by_item/{SKU}/{warehouseCode}: qty
//
// SKU is uppercased to match master mode's item key.

const { qbpRequest, mapWithConcurrency } = require("../api");
const { initRtdb, MultiPathWriter } = require("../rtdb");
const { setLastSyncMeta } = require("../meta");

const META_KEY = "lastInventorySync";
const INVENTORY_PATH = "vendor_catalogs/qbp/inventory_by_item";

// QBP's published warehouse codes. Override via QBP_WAREHOUSES env if QBP
// adds/removes a location (comma-separated, e.g. "PA,MN,NV,CO,UT").
const DEFAULT_WAREHOUSES = "PA,MN,NV,CO";

async function runInventorySync() {
  const startedAt = Date.now();
  const db = initRtdb();

  const warehouses = (process.env.QBP_WAREHOUSES || DEFAULT_WAREHOUSES)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (warehouses.length === 0) {
    throw new Error("No QBP warehouses configured (set QBP_WAREHOUSES)");
  }

  console.log(`[qbp-inventory] fetching warehouses: ${warehouses.join(", ")}`);

  // Build per-SKU warehouse maps in memory before writing. Total payload is
  // bounded (n_skus × n_warehouses ints ≈ a few MB at most), and assembling
  // first means we can wipe + write atomically and report accurate stats.
  const skuMap = new Map();
  const warehousesSeen = new Set();
  let totalQty = 0;

  await mapWithConcurrency(
    warehouses,
    async (code) => {
      const resp = await qbpRequest(`availability/warehouse/${encodeURIComponent(code)}`);
      const rows = extractAvailabilityRows(resp);
      console.log(`[qbp-inventory] warehouse ${code}: ${rows.length} rows`);
      let added = 0;
      for (const row of rows) {
        const sku = skuOf(row);
        const qty = qtyOf(row);
        if (!sku || qty <= 0) continue;
        const key = String(sku).toUpperCase();
        let entry = skuMap.get(key);
        if (!entry) {
          entry = {};
          skuMap.set(key, entry);
        }
        entry[code] = qty;
        warehousesSeen.add(code);
        totalQty += qty;
        added++;
      }
      console.log(`[qbp-inventory] warehouse ${code}: kept ${added} in-stock rows`);
    },
    // Three to five warehouses; sequential is fine but parallel halves wall time.
    { concurrency: Math.min(warehouses.length, 4) }
  );

  console.log(`[qbp-inventory] wiping ${INVENTORY_PATH}`);
  await db.ref(INVENTORY_PATH).remove();

  const writer = new MultiPathWriter(db);
  let itemsWritten = 0;
  for (const [sku, warehouseMap] of skuMap.entries()) {
    await writer.set(`${INVENTORY_PATH}/${sku}`, warehouseMap);
    itemsWritten++;
    if (itemsWritten % 1000 === 0) {
      console.log(`[qbp-inventory] wrote ${itemsWritten}/${skuMap.size} items`);
    }
  }
  await writer.flush();

  const durationSec = (Date.now() - startedAt) / 1000;
  await setLastSyncMeta(db, META_KEY, {
    warehouses,
    warehousesSeen: Array.from(warehousesSeen),
    itemsWithStockCount: itemsWritten,
    totalQty,
    durationSec,
    skipped: false,
  });

  console.log(
    `[qbp-inventory] done. ${itemsWritten} items with stock (${totalQty} total qty) across ${warehousesSeen.size} warehouses in ${durationSec.toFixed(1)}s`
  );
  return {
    skipped: false,
    itemsWithStockCount: itemsWritten,
    totalQty,
    warehousesSeen: Array.from(warehousesSeen),
    durationSec,
  };
}

// QBP's availability response shape isn't fully nailed down in the docs and
// XML envelope naming varies. Accept any of:
//   JSON-era:  [{ sku, qty }, ...] | { items: [...] } | { availability: [...] }
//              { warehouseAvailabilityResponse: { items: [...] } }
//   XML-era:   { warehouseAvailabilityResponse: { availability: [{...}] } }
//              { warehouseAvailabilityResponse: { item: [{...}] } }
//              { availability: { item: [...] } }
//
// fast-xml-parser is configured (api.js) to force <availability> and <item>
// tags into arrays even when only one row comes back.
function extractAvailabilityRows(resp) {
  if (Array.isArray(resp)) return resp;
  if (!resp || typeof resp !== "object") return [];

  const envelope =
    resp.warehouseAvailabilityResponse ||
    resp.warehouseAvailability ||
    resp.availabilityResponse ||
    resp;

  if (!envelope || typeof envelope !== "object") return [];

  const candidates = [
    envelope.availability,
    envelope.items,
    envelope.item,
    envelope.rows,
    envelope.row,
    envelope.skus,
    envelope.sku,
    envelope.product,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function skuOf(row) {
  if (!row || typeof row !== "object") return "";
  const raw = row.sku || row.SKU || row.itemCode || row.code || row["#text"] || "";
  if (typeof raw === "object" && raw["#text"] != null) return String(raw["#text"]).trim();
  return String(raw).trim();
}

function qtyOf(row) {
  if (!row || typeof row !== "object") return 0;
  let raw = row.qty ?? row.quantity ?? row.available ?? row.availableQty ?? row.stock ?? 0;
  if (typeof raw === "object" && raw && raw["#text"] != null) raw = raw["#text"];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

module.exports = { runInventorySync };
