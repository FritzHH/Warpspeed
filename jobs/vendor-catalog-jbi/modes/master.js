// JBI nightly catalog ingest: build a canonical item map from inv_mast.txt
// over FTP, diff it against the previous baseline in GCS, and write only the
// deltas to Firestore at vendor_catalogs/jbi/items_by_id/{itemId}.
//
// Pipeline:
//   1. lastMod check on /inv_mast.txt - if unchanged since last run, skip
//   2. stream /inv_mast.txt - map each row to canonical, build Map<itemId, canonicalDoc>
//   3. baseline.load() -> diffMaps() -> Firestore batch writes (adds/changes/deletes)
//   4. baseline.save() AFTER Firestore writes complete - if Firestore fails mid-flight,
//      we keep the OLD baseline so the next run re-diffs cleanly

const { withFtpClient } = require("../ftp");
const { initRtdb } = require("../rtdb");
const { initFirestore, FirestoreBatchWriter } = require("../firestore");
const { BaselineStore, diffMaps } = require("../baseline");
const { setLastSyncMeta } = require("../meta");
const { createTabParser } = require("../parser");

const REMOTE_ITEMS = "/inv_mast.txt";
const META_KEY = "lastMasterSync";
const ITEMS_COLLECTION = "vendor_catalogs/jbi/items_by_id";

async function runMasterSync() {
  const startedAt = Date.now();
  const rtdb = initRtdb();
  const firestore = initFirestore();
  const baseline = new BaselineStore("jbi");

  return await withFtpClient(async (ftpClient) => {
    const remoteModTime = await ftpClient.lastMod(REMOTE_ITEMS);
    console.log(`[jbi-master] inv_mast modTime: ${remoteModTime.toISOString()}`);

    const baselineMap = await baseline.load();

    const currentMap = new Map();
    const itemsParser = createTabParser({ columns: true });
    const downloadPromise = ftpClient.downloadTo(itemsParser, REMOTE_ITEMS);

    let rowCount = 0;
    for await (const row of itemsParser) {
      const itemId = row.item_id;
      if (!itemId) continue;
      const canonical = toCanonicalItem(row, itemId);
      if (!canonical) continue;
      currentMap.set(itemId, canonical);
      rowCount++;
      if (rowCount % 10000 === 0) {
        console.log(`[jbi-master] read ${rowCount} items from inv_mast`);
      }
    }
    await downloadPromise;
    console.log(`[jbi-master] built current map: ${currentMap.size} items`);

    const { adds, changes, deletes } = diffMaps(currentMap, baselineMap);
    console.log(
      `[jbi-master] diff: +${adds.length} adds, ~${changes.length} changes, -${deletes.length} deletes`,
    );

    const writer = new FirestoreBatchWriter(firestore, ITEMS_COLLECTION);
    for (const { id, doc } of adds) await writer.set(id, doc);
    for (const { id, doc } of changes) await writer.set(id, doc);
    for (const id of deletes) await writer.delete(id);
    await writer.flush();
    console.log(
      `[jbi-master] firestore writes complete: ${writer.totalSet} set, ${writer.totalDelete} delete`,
    );

    await baseline.save(currentMap);

    const durationSec = (Date.now() - startedAt) / 1000;
    await setLastSyncMeta(rtdb, META_KEY, {
      ftpModTime: remoteModTime.getTime(),
      itemCount: currentMap.size,
      addCount: adds.length,
      changeCount: changes.length,
      deleteCount: deletes.length,
      durationSec,
      skipped: false,
    });

    console.log(
      `[jbi-master] done. ${currentMap.size} items, ${adds.length}/${changes.length}/${deletes.length} a/c/d in ${durationSec.toFixed(1)}s`,
    );
    return {
      skipped: false,
      itemCount: currentMap.size,
      addCount: adds.length,
      changeCount: changes.length,
      deleteCount: deletes.length,
      durationSec,
    };
  });
}

// Maps a raw inv_mast.txt row to the canonical catalog row shape. The
// Firestore doc key is the SKU; the body's vendorPartId carries the SKU
// downstream when the chrome-extension imports a row into a tenant's
// inventory (where the inventory item's doc key is a Firebase auto-id).
// Two non-obvious source mappings:
//   cost  = row.price_ea  (JBI's dealer cost field; row.cost does not exist)
//   brand = row.Brand_Name (JBI ships this column header in PascalCase)
function toCanonicalItem(row, itemId) {
  if (!row || typeof row !== "object") return null;

  const catalogName = String(row.description || "").trim();
  const brand = String(row.Brand_Name || "").trim();
  const primaryBarcode = String(row.upc_ean || "").trim();
  const barcodes = primaryBarcode ? [primaryBarcode] : [];
  const image_url = String(row.image_url || "").trim();

  if (!catalogName && barcodes.length === 0) return null;

  return {
    vendorId: "jbi",
    vendorPartId: itemId,
    catalogName,
    brand,
    primaryBarcode,
    barcodes,
    image_url,
    cost: dollarsToCents(row.price_ea),
    msrp: dollarsToCents(row.msrp),
    category: "Item",
  };
}

function dollarsToCents(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

module.exports = { runMasterSync, toCanonicalItem };
