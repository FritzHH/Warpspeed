// QBP catalog ingestion entrypoint. Cloud Run Job dispatches on QBP_MODE.
//
//   QBP_MODE=master    → /1/product/skulist + per-SKU detail → Firestore items_by_id
//                        (diff against GCS baseline, daily cadence; also refreshes
//                        RTDB inventory_by_item from the bundled stockLevels)
//   QBP_MODE=inventory → /1/availability/warehouse/{code} fan-out → RTDB inventory_by_item
//                        (always runs, 15-min cadence — stock changes constantly)
//   QBP_MODE=count     → /1/product/skulist length only → _meta/lastInventoryCount
//                        (lightweight, every 15 min business hours)
//
// No "specs" mode: QBP bundles spec data in the product detail response,
// so specs land naturally inside items_by_id/{sku} during master mode.

const { runMasterSync } = require("./modes/master");
const { runInventorySync } = require("./modes/inventory");
const { runCountProbe } = require("./modes/count");

const MODE = (process.env.QBP_MODE || "").trim().toLowerCase();

async function main() {
  console.log(`[qbp] starting in mode: ${MODE || "(none)"}`);
  switch (MODE) {
    case "master":
      return await runMasterSync();
    case "inventory":
      return await runInventorySync();
    case "count":
      return await runCountProbe();
    default:
      throw new Error(
        `QBP_MODE must be 'master', 'inventory', or 'count' (got: '${MODE}')`
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
