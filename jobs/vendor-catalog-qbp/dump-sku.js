// One-shot diagnostic: fetch /1/product/sku/{SKU}, run it through the same
// unwrapDetail + toCanonicalItem pipeline that master mode uses, and print:
//   - the raw parsed response
//   - the canonical object that gets written to items/{SKU}
//   - the UPCs that get written to items_by_upc/{upc}
//   - the stock map that gets written to inventory_by_item/{SKU}
//
// Run:
//   set "QBP_API_KEY=..." && set "QBP_DUMP_SKU=CH4093" && node dump-sku.js

const { qbpRequest } = require("./api");
const {
  unwrapDetail,
  toCanonicalItem,
  extractStockMap,
} = require("./modes/master");

const sku = (process.env.QBP_DUMP_SKU || "").trim();
if (!sku) {
  console.error("ERROR: set QBP_DUMP_SKU=<sku>");
  process.exit(1);
}

(async () => {
  const itemKey = sku.toUpperCase();
  console.log(`[dump-sku] fetching product/sku/${sku}`);
  const resp = await qbpRequest(`product/sku/${encodeURIComponent(sku)}`);

  console.log(`\n=== RAW parsed response ===`);
  console.log(JSON.stringify(resp, null, 2));

  const detail = unwrapDetail(resp);
  const canonical = toCanonicalItem(detail, itemKey);
  console.log(`\n=== WRITTEN to items/${itemKey} (canonical shape) ===`);
  console.log(JSON.stringify(canonical, null, 2));

  const upcs = (canonical && canonical.allUpcs) || [];
  console.log(`\n=== WRITTEN to items_by_upc/{upc} (each maps to ${itemKey}) ===`);
  console.log(upcs.length ? upcs.join("\n") : "(none extracted)");

  const stockMap = extractStockMap(detail);
  console.log(`\n=== WRITTEN to inventory_by_item/${itemKey} ===`);
  console.log(
    stockMap
      ? JSON.stringify(stockMap, null, 2)
      : "(no stock - item dropped from inventory_by_item)"
  );
})().catch((err) => {
  console.error(`[dump-sku] failed:`, err && err.stack ? err.stack : err);
  process.exit(1);
});
