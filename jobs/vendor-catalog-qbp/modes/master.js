// Master mode - full catalog refresh.
//
// QBP doesn't ship a one-shot catalog file like JBI does. The shape here is:
//
//   1. GET /1/product/skulist          -> flat array of every SKU we can see.
//   2. Hash the skulist; skip if it matches the last successful run.
//   3. For each SKU, GET /1/product/sku/{sku} (bounded concurrency).
//   4. Wipe + repopulate /vendor_catalogs/qbp/items/{sku}, building the
//      items_by_upc reverse-index as we go.
//
// We pare the QBP response down to the canonical inventory-mapping shape
// (id / name / brand / cost / msrp / primaryUpc / allUpcs). Mirror in
// jobs/vendor-catalog-jbi/modes/master.js#toCanonicalItem. The vendor's
// classification taxonomy, marketing copy, and ~125 lines of structural
// metadata per SKU are dropped - we don't rebuild QBP's site, we just map
// scans to Cadence inventory items.
//
// On per-SKU fetch failure we increment missCount and skip the row - one
// bad SKU shouldn't blow up a 50k-item refresh. The miss count lands in
// meta so alerts can fire if it spikes.

const { qbpRequest, mapWithConcurrency } = require("../api");
const { initRtdb, MultiPathWriter } = require("../rtdb");
const {
  getLastSyncMeta,
  setLastSyncMeta,
  shouldSkipByHash,
  hashPayload,
} = require("../meta");

const META_KEY = "lastMasterSync";
const ITEMS_PATH = "vendor_catalogs/qbp/items";
const ITEMS_BY_UPC_PATH = "vendor_catalogs/qbp/items_by_upc";
const INVENTORY_PATH = "vendor_catalogs/qbp/inventory_by_item";

async function runMasterSync() {
  const startedAt = Date.now();
  const db = initRtdb();

  console.log(`[qbp-master] fetching skulist`);
  const skulistResp = await qbpRequest("product/skulist");
  const skus = extractSkus(skulistResp);
  console.log(`[qbp-master] skulist returned ${skus.length} SKUs`);
  if (skus.length === 0) {
    throw new Error("QBP skulist returned 0 SKUs - refusing to wipe catalog");
  }

  const responseHash = hashPayload(skus);
  const lastSync = await getLastSyncMeta(db, META_KEY);
  if (shouldSkipByHash(lastSync, responseHash)) {
    console.log(`[qbp-master] skipping - skulist hash matches last sync`);
    await setLastSyncMeta(db, META_KEY, {
      responseHash,
      skuCount: skus.length,
      skipped: true,
      durationSec: (Date.now() - startedAt) / 1000,
    });
    return { skipped: true, skuCount: skus.length };
  }

  console.log(`[qbp-master] wiping ${ITEMS_PATH} and ${ITEMS_BY_UPC_PATH}`);
  await db.ref().update({
    [ITEMS_PATH]: null,
    [ITEMS_BY_UPC_PATH]: null,
  });

  const writer = new MultiPathWriter(db);
  let itemCount = 0;
  let upcCount = 0;
  let inventoryItemCount = 0;
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
    await writer.set(`${ITEMS_PATH}/${itemKey}`, canonical);
    itemCount++;

    for (const upc of canonical.allUpcs) {
      await writer.set(`${ITEMS_BY_UPC_PATH}/${upc}`, itemKey);
      upcCount++;
    }

    // Stock data is bundled in the per-SKU response; upsert it now so the
    // master sweep keeps inventory_by_item fresh as a side effect. The
    // hourly inventory mode still owns the wipe + full-replace cycle for
    // removed-SKU cleanup; this is pure additive freshness during master.
    const stockMap = extractStockMap(detail);
    if (stockMap) {
      await writer.set(`${INVENTORY_PATH}/${itemKey}`, stockMap);
      inventoryItemCount++;
    }

    if (itemCount - lastLogged >= 500) {
      lastLogged = itemCount;
      console.log(
        `[qbp-master] processed ${itemCount}/${skus.length} (${upcCount} UPCs, ${inventoryItemCount} in-stock, ${missCount} misses)`
      );
    }
  });

  await writer.flush();

  const durationSec = (Date.now() - startedAt) / 1000;
  await setLastSyncMeta(db, META_KEY, {
    responseHash,
    skuCount: skus.length,
    itemCount,
    upcCount,
    inventoryItemCount,
    missCount,
    durationSec,
    skipped: false,
  });

  console.log(
    `[qbp-master] done. ${itemCount} items, ${upcCount} UPCs, ${inventoryItemCount} in-stock, ${missCount} misses in ${durationSec.toFixed(1)}s`
  );
  return { skipped: false, itemCount, upcCount, inventoryItemCount, missCount, durationSec };
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

// Convert a raw QBP product detail object into the canonical inventory-mapping
// shape used everywhere downstream (chrome extension auto-create,
// reconciliation, search). Mirror in
// jobs/vendor-catalog-jbi/modes/master.js#toCanonicalItem.
//
//   id          - vendor SKU (also the RTDB key; uppercased)
//   name        - display name (QBP: detail.name)
//   brand       - brand label (QBP: detail.brand[0].description)
//   cost        - dealer cost in CENTS (QBP: detail.dealerPrice.value dollars)
//   msrp        - MSRP in CENTS (QBP: detail.msrp.value dollars)
//   primaryUpc  - first barcode value, scan-canonical
//   allUpcs[]   - every barcode value; drives items_by_upc index
//
// QBP barcodes nest under <barcodes><Barcode value="..."/></barcodes>; Barcode
// is one-object when there's a single barcode and an array when there are many
// (fast-xml-parser REPEATED_TAGS in api.js does NOT include Barcode).
//
// Returns null when the detail has no name AND no UPCs - nothing useful we
// can store, drop the row from the catalog.
function toCanonicalItem(detail, itemKey) {
  if (!detail || typeof detail !== "object") return null;

  const name = String(detail.name || "").trim();

  let brand = "";
  if (Array.isArray(detail.brand) && detail.brand.length > 0) {
    brand = String(detail.brand[0]?.description || "").trim();
  } else if (typeof detail.brand === "string") {
    brand = detail.brand.trim();
  }

  const allUpcs = [];
  const b = detail.barcodes && detail.barcodes.Barcode;
  if (b) {
    const arr = Array.isArray(b) ? b : [b];
    for (const entry of arr) {
      if (entry == null) continue;
      if (typeof entry === "string" || typeof entry === "number") {
        const s = String(entry).trim();
        if (s) allUpcs.push(s);
      } else if (typeof entry === "object") {
        const v = entry.value != null ? entry.value : entry["#text"];
        if (v != null) {
          const s = String(v).trim();
          if (s) allUpcs.push(s);
        }
      }
    }
  }

  if (!name && allUpcs.length === 0) return null;

  return {
    id: itemKey,
    name,
    brand,
    cost: dollarsToCents(detail.dealerPrice && detail.dealerPrice.value),
    msrp: dollarsToCents(detail.msrp && detail.msrp.value),
    primaryUpc: allUpcs[0] || "",
    allUpcs,
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
