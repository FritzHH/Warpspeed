// JBI nightly catalog ingest: build a canonical item map from inv_mast.txt
// (master data) and product_spec_with_titles.txt (labeled specs) over FTP,
// diff it against the previous baseline in GCS, and write only the deltas
// to Firestore at vendor_catalogs/jbi/items_by_id/{itemId}.
//
// Pipeline:
//   1. lastMod check on /inv_mast.txt - if unchanged since last run, skip
//   2. stream /product_spec_with_titles.txt - build Map<itemId, {label: value}>
//      from the alternating Title N / Data N pairs (skip pairs where Data is
//      empty, even if Title is populated)
//   3. stream /inv_mast.txt - map each row to canonical, attach labeled specs
//      from step 2, build Map<itemId, canonicalDoc>
//   4. baseline.load() -> diffMaps() -> Firestore batch writes (adds/changes/deletes)
//   5. baseline.save() AFTER Firestore writes complete - if Firestore fails mid-flight,
//      we keep the OLD baseline so the next run re-diffs cleanly

const { withFtpClient } = require("../ftp");
const { initRtdb } = require("../rtdb");
const { initFirestore, FirestoreBatchWriter } = require("../firestore");
const { BaselineStore, diffMaps } = require("../baseline");
const { setLastSyncMeta } = require("../meta");
const { createTabParser } = require("../parser");

const REMOTE_ITEMS = "/inv_mast.txt";
const REMOTE_SPECS = "/product_spec_with_titles.txt";
const META_KEY = "lastMasterSync";
const ITEMS_COLLECTION = "vendor_catalogs/jbi/items_by_id";

// product_spec_with_titles.txt header layout (41 cols, positional):
//   Part No | Title 1 | Data 1 | Title 2 | Data 2 | ... | Title 20 | Data 20
// Title N sits at col 1 + (N-1)*2, Data N at col 2 + (N-1)*2.
const TITLE_PAIR_COUNT = 20;

// Streams product_spec_with_titles.txt and returns a Map<itemId, specs>
// where specs is {labelString: valueString}. Skips pairs where Data is
// empty (label-only rows are noise on the UI; next sync picks them up
// if JBI fills them in). 99.3% of rows have ≥1 populated label as of
// 2026-06; the ~190 rows with no labels get empty specs (no entry in
// the map) and the canonical doc omits the specs key entirely.
async function loadSpecsByItemId(ftpClient) {
  const specsMap = new Map();
  const parser = createTabParser({ columns: false });
  const downloadPromise = ftpClient.downloadTo(parser, REMOTE_SPECS);

  let rowIdx = 0;
  for await (const row of parser) {
    rowIdx++;
    if (rowIdx === 1) continue; // skip header

    const itemId = String(row[0] || "").trim();
    if (!itemId) continue;

    const specs = {};
    for (let i = 0; i < TITLE_PAIR_COUNT; i++) {
      const title = String(row[1 + i * 2] || "").trim();
      const data = String(row[2 + i * 2] || "").trim();
      if (!title || !data) continue;
      specs[title] = data;
    }
    if (Object.keys(specs).length > 0) specsMap.set(itemId, specs);
  }
  await downloadPromise;

  console.log(
    `[jbi-master] loaded labeled specs for ${specsMap.size} items (of ${rowIdx - 1} rows in titles file)`,
  );
  return specsMap;
}

async function runMasterSync() {
  const startedAt = Date.now();
  const rtdb = initRtdb();
  const firestore = initFirestore();
  const baseline = new BaselineStore("jbi");

  return await withFtpClient(async (ftpClient) => {
    const remoteModTime = await ftpClient.lastMod(REMOTE_ITEMS);
    console.log(`[jbi-master] inv_mast modTime: ${remoteModTime.toISOString()}`);

    const baselineMap = await baseline.load();

    const specsByItemId = await loadSpecsByItemId(ftpClient);

    const currentMap = new Map();
    const itemsParser = createTabParser({ columns: true });
    const downloadPromise = ftpClient.downloadTo(itemsParser, REMOTE_ITEMS);

    let rowCount = 0;
    for await (const row of itemsParser) {
      const itemId = row.item_id;
      if (!itemId) continue;
      const canonical = toCanonicalItem(row, itemId, specsByItemId);
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
//
// Specs come from product_spec_with_titles.txt (already loaded into
// specsByItemId) as {labelString: valueString}. model_uid is kept as
// free metadata for product-family grouping; it's no longer load-bearing
// for spec decoding now that labels are explicit.
function toCanonicalItem(row, itemId, specsByItemId) {
  if (!row || typeof row !== "object") return null;

  const catalogName = String(row.description || "").trim();
  const brand = String(row.Brand_Name || "").trim();
  const primaryBarcode = String(row.upc_ean || "").trim();
  const barcodes = primaryBarcode ? [primaryBarcode] : [];
  const image_url = String(row.image_url || "").trim();
  const model_uid = String(row.model_uid || "").trim();

  if (!catalogName && barcodes.length === 0) return null;

  const doc = {
    vendorId: "jbi",
    vendorPartId: itemId,
    catalogName,
    brand,
    primaryBarcode,
    barcodes,
    image_url,
    cost: dollarsToCents(row.price_ea),
    msrp: dollarsToCents(row.msrp),
  };
  if (model_uid) doc.model_uid = model_uid;
  const specs = specsByItemId && specsByItemId.get(itemId);
  if (specs && Object.keys(specs).length > 0) doc.specs = specs;
  return doc;
}

function dollarsToCents(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

module.exports = { runMasterSync, toCanonicalItem };
