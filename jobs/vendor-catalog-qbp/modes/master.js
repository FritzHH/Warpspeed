// QBP nightly catalog ingest: fan-out fetch every SKU detail, build a canonical
// item map, diff it against the previous baseline in GCS, and write only the
// deltas to Firestore at vendor_catalogs/qbp/items_by_id/{itemId}.
//
// Pipeline:
//   1. GET /1/product/skulist - flat array of every visible SKU
//   2. Hash the skulist; skip if it matches the last successful run
//   3. baseline.load() from GCS
//   4. For each SKU, GET /1/product/sku/{sku} with bounded concurrency:
//      - Map response to canonical doc, populate currentMap
//      - Extract per-warehouse stock; populate inventoryByItem map (side-effect)
//   5. diffMaps(currentMap, baselineMap) -> { adds, changes, deletes }
//   6. Firestore batch writes for the deltas (vendor_catalogs/qbp/items_by_id)
//   7. RTDB writes for the inventory side-effect (vendor_catalogs/qbp/inventory_by_item)
//   8. baseline.save() AFTER both write paths succeed - mid-run failure keeps
//      the old baseline so the next run re-diffs cleanly
//
// Inventory side-effect: master refreshes inventory_by_item as it goes since
// per-SKU detail already carries stock data. The 15-min inventory mode still
// owns wipe + full-replace (covers removed SKUs); this is pure additive
// freshness during the nightly run.
//
// Per-SKU fetch failures bump missCount and skip the row - one bad SKU
// shouldn't blow up a 50k-item refresh. missCount lands in meta for alerting.

const { qbpRequest, mapWithConcurrency } = require("../api");
const { initRtdb, MultiPathWriter } = require("../rtdb");
const { initFirestore, FirestoreBatchWriter } = require("../firestore");
const { BaselineStore, diffMaps } = require("../baseline");
const { setLastSyncMeta } = require("../meta");

const META_KEY = "lastMasterSync";
const ITEMS_COLLECTION = "vendor_catalogs/qbp/items_by_id";
const INVENTORY_PATH = "vendor_catalogs/qbp/inventory_by_item";

async function runMasterSync() {
  const startedAt = Date.now();
  const rtdb = initRtdb();
  const firestore = initFirestore();
  const baseline = new BaselineStore("qbp");

  console.log(`[qbp-master] fetching skulist`);
  const skulistResp = await qbpRequest("product/skulist");
  const skus = extractSkus(skulistResp);
  console.log(`[qbp-master] skulist returned ${skus.length} SKUs`);
  if (skus.length === 0) {
    throw new Error("QBP skulist returned 0 SKUs - refusing to diff against empty current");
  }

  const baselineMap = await baseline.load();

  const currentMap = new Map();
  const inventoryByItem = new Map();
  let missCount = 0;
  let lastLogged = 0;

  await mapWithConcurrency(skus, async (sku) => {
    let resp;
    try {
      resp = await qbpRequest(`product/sku/${encodeURIComponent(sku)}`);
    } catch (err) {
      missCount++;
      if (missCount <= 5 || missCount % 100 === 0) {
        console.warn(`[qbp-master] miss ${sku}: ${err.message}`);
      }
      return;
    }
    const detail = unwrapDetail(resp);
    if (!detail) {
      missCount++;
      return;
    }

    const itemKey = String(sku).toUpperCase();
    const canonical = toCanonicalItem(detail, itemKey);
    if (!canonical) {
      missCount++;
      return;
    }
    currentMap.set(itemKey, canonical);

    const stockMap = extractStockMap(detail);
    if (stockMap) inventoryByItem.set(itemKey, stockMap);

    if (currentMap.size - lastLogged >= 500) {
      lastLogged = currentMap.size;
      console.log(
        `[qbp-master] fetched ${currentMap.size}/${skus.length} (${inventoryByItem.size} in-stock, ${missCount} misses)`,
      );
    }
  });
  console.log(
    `[qbp-master] built current map: ${currentMap.size} items, ${inventoryByItem.size} with stock, ${missCount} misses`,
  );

  const { adds, changes, deletes } = diffMaps(currentMap, baselineMap);
  console.log(
    `[qbp-master] diff: +${adds.length} adds, ~${changes.length} changes, -${deletes.length} deletes`,
  );

  const writer = new FirestoreBatchWriter(firestore, ITEMS_COLLECTION);
  for (const { id, doc } of adds) await writer.set(id, doc);
  for (const { id, doc } of changes) await writer.set(id, doc);
  for (const id of deletes) await writer.delete(id);
  await writer.flush();
  console.log(
    `[qbp-master] firestore writes complete: ${writer.totalSet} set, ${writer.totalDelete} delete`,
  );

  const rtdbWriter = new MultiPathWriter(rtdb);
  for (const [itemKey, stockMap] of inventoryByItem.entries()) {
    await rtdbWriter.set(`${INVENTORY_PATH}/${itemKey}`, stockMap);
  }
  await rtdbWriter.flush();
  console.log(`[qbp-master] inventory side-effect: ${inventoryByItem.size} items upserted to RTDB`);

  await baseline.save(currentMap);

  const durationSec = (Date.now() - startedAt) / 1000;
  await setLastSyncMeta(rtdb, META_KEY, {
    skuCount: skus.length,
    itemCount: currentMap.size,
    addCount: adds.length,
    changeCount: changes.length,
    deleteCount: deletes.length,
    inventoryItemCount: inventoryByItem.size,
    missCount,
    durationSec,
    skipped: false,
  });

  console.log(
    `[qbp-master] done. ${currentMap.size} items, ${adds.length}/${changes.length}/${deletes.length} a/c/d, ${inventoryByItem.size} in-stock, ${missCount} misses in ${durationSec.toFixed(1)}s`,
  );
  return {
    skipped: false,
    itemCount: currentMap.size,
    addCount: adds.length,
    changeCount: changes.length,
    deleteCount: deletes.length,
    inventoryItemCount: inventoryByItem.size,
    missCount,
    durationSec,
  };
}

// QBP's skulist response shape isn't fully documented and XML envelope
// naming varies by endpoint. Accept any of:
//   JSON-era:    ["AB123", "CD456"] | { skus: [...] } | { items: [{ sku }] }
//   XML-era:     { productSkuListResponse: { sku: ["AB123", ...] } }
//                { skuList: { sku: [...] } } | { skus: { sku: [...] } }
//
// fast-xml-parser is configured (api.js) to force <sku> tags into arrays
// even when only one comes back. First match wins; unrecognized shapes raise
// so we notice schema drift instead of silently writing 0 SKUs.
function extractSkus(resp) {
  if (Array.isArray(resp)) return resp.map(skuOf).filter(Boolean);
  if (!resp || typeof resp !== "object") return [];

  const envelope =
    resp.productSkuListResponse ||
    resp.productSkuList ||
    resp.skuList ||
    resp.skus ||
    resp;

  const candidates = [
    envelope.sku,
    envelope.skus,
    envelope.skuList,
    envelope.items,
    envelope.item,
    envelope.products,
    envelope.product,
    envelope.skus && envelope.skus.sku,
    envelope.skuList && envelope.skuList.sku,
    envelope.items && envelope.items.item,
    envelope.products && envelope.products.product,
    Array.isArray(envelope) ? envelope : null,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c.map(skuOf).filter(Boolean);
  }
  const envSnippet = JSON.stringify(envelope, null, 2).slice(0, 2000);
  throw new Error(
    `Unrecognized skulist response shape. Outer keys: ${Object.keys(resp).join(",")}. Envelope keys: ${Object.keys(envelope || {}).join(",")}. Envelope snippet:\n${envSnippet}`
  );
}

function skuOf(item) {
  if (item == null) return "";
  if (typeof item === "string" || typeof item === "number") return String(item).trim();
  if (typeof item !== "object") return "";
  const text = item["#text"];
  if (text != null) return String(text).trim();
  return String(item.sku || item.code || item.itemCode || "").trim();
}

// Per-SKU product detail comes wrapped as:
//   <productResponse>
//     <products>
//       <product>...fields...</product>   <- real product data
//     </products>
//   </productResponse>
// fast-xml-parser forces <product> into an array even when there's only
// one. Drill through container -> singular-array -> element so toCanonicalItem
// sees bare product fields.
function unwrapDetail(resp) {
  if (!resp || typeof resp !== "object") return resp;
  const envelope =
    resp.productResponse ||
    resp.productSkuResponse ||
    resp.product ||
    resp;
  if (!envelope || typeof envelope !== "object") return envelope;

  if (envelope.products && envelope.products.product) {
    const inner = envelope.products.product;
    if (Array.isArray(inner)) return inner[0] || null;
    if (typeof inner === "object") return inner;
  }
  if (envelope.product) {
    const p = envelope.product;
    if (Array.isArray(p)) return p[0] || null;
    if (typeof p === "object") return p;
  }
  return envelope;
}

// Maps a per-SKU product detail response to the canonical catalog row shape.
// The Firestore doc key is the SKU; the body's vendorPartId carries the SKU
// downstream when the chrome-extension imports a row into a tenant's
// inventory (where the inventory item's doc key is a Firebase auto-id).
// image_url is left blank: QBP's detail returns image filenames only
// (`images.image[].fileName`), and the CDN base hostname hasn't been
// confirmed yet. TODO: populate once the QBP image URL pattern is known.
function toCanonicalItem(detail, itemKey) {
  if (!detail || typeof detail !== "object") return null;

  const catalogName = String(detail.name || "").trim();

  let brand = "";
  if (Array.isArray(detail.brand) && detail.brand.length > 0) {
    brand = String(detail.brand[0]?.description || "").trim();
  } else if (typeof detail.brand === "string") {
    brand = detail.brand.trim();
  }

  const barcodes = [];
  const b = detail.barcodes && detail.barcodes.Barcode;
  if (b) {
    const arr = Array.isArray(b) ? b : [b];
    for (const entry of arr) {
      if (entry == null) continue;
      if (typeof entry === "string" || typeof entry === "number") {
        const s = String(entry).trim();
        if (s) barcodes.push(s);
      } else if (typeof entry === "object") {
        const v = entry.value != null ? entry.value : entry["#text"];
        if (v != null) {
          const s = String(v).trim();
          if (s) barcodes.push(s);
        }
      }
    }
  }

  if (!catalogName && barcodes.length === 0) return null;

  return {
    vendorId: "qbp",
    vendorPartId: itemKey,
    catalogName,
    brand,
    primaryBarcode: barcodes[0] || "",
    barcodes,
    image_url: "",
    cost: dollarsToCents(detail.dealerPrice && detail.dealerPrice.value),
    msrp: dollarsToCents(detail.msrp && detail.msrp.value),
  };
}

function dollarsToCents(v) {
  if (v == null || v === "") return 0;
  const raw =
    typeof v === "object"
      ? v["#text"] != null
        ? v["#text"]
        : v.value
      : v;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

// Pull per-warehouse availability from the product detail's stockLevels
// block. Same output shape as the inventory mode's writes:
//   { PA: 12, MN: 4, NV: 0-dropped, CO: 0-dropped }
// Zero / OUTOFSTOCK rows are dropped so consumers can treat "missing key"
// as "out of stock" (matches JBI inventory semantics).
//
// XML shape:
//   <stockLevels>
//     <stockLevel>
//       <warehouse><abbreviation>PA</abbreviation></warehouse>
//       <quantityAvailable>50</quantityAvailable>
//     </stockLevel>
//     ...
//   </stockLevels>
// `warehouse` is forced to array via REPEATED_TAGS (api.js); `stockLevel`
// is not, so it's object-when-1, array-when-many.
function extractStockMap(detail) {
  if (!detail || typeof detail !== "object") return null;
  const container = detail.stockLevels;
  if (!container || typeof container !== "object") return null;

  let levels = container.stockLevel;
  if (!levels) return null;
  if (!Array.isArray(levels)) levels = [levels];

  const out = {};
  for (const level of levels) {
    if (!level || typeof level !== "object") continue;
    const qtyRaw = level.quantityAvailable;
    const qty = parseInt(
      typeof qtyRaw === "object" && qtyRaw ? qtyRaw["#text"] : qtyRaw,
      10
    );
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const warehouses = Array.isArray(level.warehouse)
      ? level.warehouse
      : level.warehouse
        ? [level.warehouse]
        : [];
    for (const wh of warehouses) {
      if (!wh || typeof wh !== "object") continue;
      const code = String(wh.abbreviation || "").trim().toUpperCase();
      if (!code) continue;
      out[code] = qty;
    }
  }
  return Object.keys(out).length ? out : null;
}

module.exports = {
  runMasterSync,
  unwrapDetail,
  extractSkus,
  toCanonicalItem,
  extractStockMap,
};
