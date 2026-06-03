// QBP catalog ingestion entrypoint. Cloud Run Job dispatches on QBP_MODE.
//
//   QBP_MODE=master    → /1/product/skulist + per-SKU detail → items + items_by_upc
//                        (skipped via response-hash idempotency, daily cadence)
//   QBP_MODE=inventory → /1/availability/warehouse/{code} fan-out → inventory_by_item
//                        (always runs, hourly cadence — stock changes constantly)
//
// No "specs" mode: QBP bundles spec data in the product detail response,
// so specs land naturally inside items/{sku} during master mode.

const { runMasterSync } = require("./modes/master");
const { runInventorySync } = require("./modes/inventory");

const MODE = (process.env.QBP_MODE || "").trim().toLowerCase();

async function main() {
  console.log(`[qbp] starting in mode: ${MODE || "(none)"}`);
  switch (MODE) {
    case "master":
      return await runMasterSync();
    case "inventory":
      return await runInventorySync();
    default:
      throw new Error(
        `QBP_MODE must be 'master' or 'inventory' (got: '${MODE}')`
      );
  }
}

main()
  .then((result) => {
    console.log(`[qbp] done:`, JSON.stringify(result || {}));
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[qbp] failed:`, err && err.stack ? err.stack : err);
    process.exit(1);
  });
