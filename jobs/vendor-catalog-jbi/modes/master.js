// JBI nightly catalog ingest: build a canonical item map from two FTP files,
// diff it against the previous baseline in GCS, and write only the deltas to
// Firestore at vendor_catalogs/jbi/items_by_id/{itemId}.
//
// Pipeline:
//   1. lastMod check on /inv_mast.txt - if unchanged since last run, skip
//   2. stream /product_spec_with_titles.txt - build Map<itemId, specs[]>
//   3. stream /inv_mast.txt - map each row to canonical, attach specs from (2),
//      build Map<itemId, canonicalDoc>
//   4. baseline.load() -> diffMaps() -> Firestore batch writes (adds/changes/deletes)
//   5. baseline.save() AFTER Firestore writes complete - if Firestore fails mid-flight,
//      we keep the OLD baseline so the next run re-diffs cleanly
//
// Specs are folded into each item doc (no separate node). Modtime skip uses
// only inv_mast.txt; if specs change but inv_mast doesn't, we still re-diff
// because the merged canonical doc changes (stableStringify catches it).
//
// TODO(phase-0): The canonical item shape is stubbed. Once the cross-vendor
// master object + mapping is locked, replace toCanonicalItem(). The pipeline
// is shape-agnostic - diff/store/read don't care what the doc looks like.

const { withFtpClient } = require("../ftp");
const { initRtdb } = require("../rtdb");
const { initFirestore, FirestoreBatchWriter } = require("../firestore");
const { BaselineStore, diffMaps } = require("../baseline");
const { getLastSyncMeta, setLastSyncMeta, shouldSkip } = require("../meta");
const { createTabParser } = require("../parser");

const REMOTE_ITEMS = "/inv_mast.txt";
const REMOTE_SPECS = "/product_spec_with_titles.txt";
const META_KEY = "lastMasterSync";
const ITEMS_COLLECTION = "vendor_catalogs/jbi/items_by_id";
const MAX_SPEC_PAIRS = 20;

async function runMasterSync() {
  const startedAt = Date.now();
  const rtdb = initRtdb();
  const firestore = initFirestore();
  const baseline = new BaselineStore("jbi");

  return await withFtpClient(async (ftpClient) => {
    const remoteModTime = await ftpClient.lastMod(REMOTE_ITEMS);
    console.log(`[jbi-master] inv_mast modTime: ${remoteModTime.toISOString()}`);

    const lastSync = await getLastSyncMeta(rtdb, META_KEY);
    if (shouldSkip(lastSync, remoteModTime)) {
      console.log(`[jbi-master] skipping - inv_mast unchanged since last sync`);
      await setLastSyncMeta(rtdb, META_KEY, {
        ftpModTime: remoteModTime.getTime(),
        skipped: true,
        durationSec: (Date.now() - startedAt) / 1000,
      });
      return { skipped: true };
    }

    const specsByItemId = await loadSpecs(ftpClient);
    console.log(`[jbi-master] loaded specs for ${specsByItemId.size} items`);

    const baselineMap = await baseline.load();

    const currentMap = new Map();
    const itemsParser = createTabParser({ columns: true });
    const downloadPromise = ftpClient.downloadTo(itemsParser, REMOTE_ITEMS);

    let rowCount = 0;
    for await (const row of itemsParser) {
      const itemId = row.item_id;
      if (!itemId) continue;
      const canonical = toCanonicalItem(row, itemId, specsByItemId.get(itemId));
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

// Stream /product_spec_with_titles.txt and build Map<itemId, [{title, value}, ...]>.
// Up to MAX_SPEC_PAIRS Title N/Data N columns per row; skip rows with no part-no.
async function loadSpecs(ftpClient) {
  const specsByItemId = new Map();
  const parser = createTabParser({ columns: true });
  const downloadPromise = ftpClient.downloadTo(parser, REMOTE_SPECS);
  for await (const row of parser) {
    const itemId = row["Part No"];
    if (!itemId) continue;
    const specs = [];
    for (let i = 1; i <= MAX_SPEC_PAIRS; i++) {
      const title = (row[`Title ${i}`] || "").trim();
      const value = (row[`Data ${i}`] || "").trim();
      if (!value) continue;
      specs.push({ title, value });
    }
    if (specs.length === 0) continue;
    specsByItemId.set(itemId, specs);
  }
  await downloadPromise;
  return specsByItemId;
}

// TODO(phase-0): replace with the locked cross-vendor canonical shape + mapping.
// Current shape mirrors the pre-migration RTDB doc plus folded `specs` and
// `vendor`/`updatedAt` tags. Diff equality uses stableStringify - changing the
// shape later just produces a one-time mass-change diff against the baseline.
function toCanonicalItem(row, itemId, specs) {
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
    vendor: "jbi",
    name,
    brand,
    cost: dollarsToCents(row.cost),
    msrp: dollarsToCents(msrpRaw),
    primaryUpc,
    allUpcs,
    specs: specs || [],
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
