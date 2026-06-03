const { withFtpClient } = require("../ftp");
const { initRtdb, MultiPathWriter } = require("../rtdb");
const { getLastSyncMeta, setLastSyncMeta, shouldSkip } = require("../meta");
const { createTabParser } = require("../parser");

const REMOTE_FILE = "/inv_mast.txt";
const META_KEY = "lastMasterSync";
const ITEMS_PATH = "vendor_catalogs/jbi/items";
const ITEMS_BY_UPC_PATH = "vendor_catalogs/jbi/items_by_upc";

async function runMasterSync() {
  const startedAt = Date.now();
  const db = initRtdb();

  return await withFtpClient(async (ftpClient) => {
    const remoteModTime = await ftpClient.lastMod(REMOTE_FILE);
    console.log(`[jbi-master] remote modTime: ${remoteModTime.toISOString()}`);

    const lastSync = await getLastSyncMeta(db, META_KEY);
    if (shouldSkip(lastSync, remoteModTime)) {
      console.log(`[jbi-master] skipping - remote unchanged since last sync`);
      await setLastSyncMeta(db, META_KEY, {
        ftpModTime: remoteModTime.getTime(),
        skipped: true,
        durationSec: (Date.now() - startedAt) / 1000,
      });
      return { skipped: true };
    }

    console.log(`[jbi-master] wiping ${ITEMS_PATH} and ${ITEMS_BY_UPC_PATH}`);
    await db.ref().update({
      [ITEMS_PATH]: null,
      [ITEMS_BY_UPC_PATH]: null,
    });

    const parser = createTabParser({ columns: true });
    const downloadPromise = ftpClient.downloadTo(parser, REMOTE_FILE);

    const writer = new MultiPathWriter(db);
    let itemCount = 0;
    let upcCount = 0;

    for await (const row of parser) {
      const itemId = row.item_id;
      if (!itemId) continue;

      const canonical = toCanonicalItem(row, itemId);
      if (!canonical) continue;

      await writer.set(`${ITEMS_PATH}/${itemId}`, canonical);
      itemCount++;

      if (canonical.primaryUpc) {
        await writer.set(
          `${ITEMS_BY_UPC_PATH}/${canonical.primaryUpc}`,
          itemId,
        );
        upcCount++;
      }

      if (itemCount % 1000 === 0) {
        console.log(
          `[jbi-master] processed ${itemCount} items (${upcCount} UPCs so far)`,
        );
      }
    }

    await downloadPromise;
    await writer.flush();

    const durationSec = (Date.now() - startedAt) / 1000;
    await setLastSyncMeta(db, META_KEY, {
      ftpModTime: remoteModTime.getTime(),
      itemCount,
      upcCount,
      durationSec,
      skipped: false,
    });

    console.log(
      `[jbi-master] done. ${itemCount} items, ${upcCount} UPCs in ${durationSec.toFixed(1)}s`,
    );
    return { skipped: false, itemCount, upcCount, durationSec };
  });
}

// Convert a raw JBI inv_mast.txt row into the canonical inventory-mapping
// shape used everywhere downstream (chrome extension auto-create,
// reconciliation, search). Mirror in
// jobs/vendor-catalog-qbp/modes/master.js#toCanonicalItem.
//
//   id          - JBI item_id (also the RTDB key)
//   name        - display name (description / item_description / etc.)
//   brand       - brand label (brand / brand_name / manufacturer / etc.)
//   cost        - dealer cost in CENTS (row.cost dollars)
//   msrp        - MSRP in CENTS (row.msrp dollars, with synonyms)
//   primaryUpc  - row.upc_ean
//   allUpcs[]   - [primaryUpc] when present (JBI exposes only one barcode)
//
// JBI publishes prices as dollar strings ("12.50"); Cadence inventory stores
// cents. Convert via dollarsToCents.
//
// Returns null when the row has neither a name nor a UPC - nothing useful we
// can store, drop it from the catalog.
function toCanonicalItem(row, itemId) {
  if (!row || typeof row !== "object") return null;

  const name = pick(row, [
    "description",
    "item_description",
    "short_descr",
    "short_description",
    "product_name",
  ]);

  const brand = pick(row, [
    "brand",
    "brand_name",
    "manufacturer",
    "mfg_name",
  ]);

  const msrpRaw = pick(row, [
    "msrp",
    "msrp_price",
    "suggested_retail",
    "suggested_retail_price",
    "retail_price",
    "srp",
  ]);

  const primaryUpc = String(row.upc_ean || "").trim();
  const allUpcs = primaryUpc ? [primaryUpc] : [];

  if (!name && allUpcs.length === 0) return null;

  return {
    id: itemId,
    name,
    brand,
    cost: dollarsToCents(row.cost),
    msrp: dollarsToCents(msrpRaw),
    primaryUpc,
    allUpcs,
  };
}

function pick(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function dollarsToCents(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

module.exports = { runMasterSync, toCanonicalItem };
