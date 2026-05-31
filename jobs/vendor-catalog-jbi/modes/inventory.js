const admin = require("firebase-admin");
const { withFtpClient } = require("../ftp");
const { initFirestore, BatchWriter } = require("../firestore");
const { getLastSyncMeta, setLastSyncMeta, shouldSkip } = require("../meta");
const { createTabParser } = require("../parser");

const REMOTE_FILE = "/inv_lox.txt";
const META_KEY = "lastInventorySync";
const INVENTORY_SUBCOLLECTION = "inventory";

const WAREHOUSE_CODES = [
  "FL", "NY", "AL", "IN", "PA", "MN",
  "TX", "CO", "WA", "FCL", "CA", "NC",
];

async function runInventorySync() {
  const startedAt = Date.now();
  const db = initFirestore();

  return await withFtpClient(async (ftpClient) => {
    const remoteModTime = await ftpClient.lastMod(REMOTE_FILE);
    console.log(`[jbi-inventory] remote modTime: ${remoteModTime.toISOString()}`);

    const lastSync = await getLastSyncMeta(db, META_KEY);
    if (shouldSkip(lastSync, remoteModTime)) {
      console.log(`[jbi-inventory] skipping - remote unchanged since last sync`);
      await setLastSyncMeta(db, META_KEY, {
        ftpModTime: admin.firestore.Timestamp.fromDate(remoteModTime),
        skipped: true,
        durationSec: (Date.now() - startedAt) / 1000,
      });
      return { skipped: true };
    }

    const parser = createTabParser({ columns: true });
    const downloadPromise = ftpClient.downloadTo(parser, REMOTE_FILE);

    const writer = new BatchWriter(db);
    const invCol = db
      .collection("vendor_catalogs")
      .doc("jbi")
      .collection(INVENTORY_SUBCOLLECTION);

    let count = 0;
    for await (const row of parser) {
      const itemId = row.item_id;
      if (!itemId) continue;
      await writer.set(invCol.doc(itemId), {
        warehouses: extractWarehouses(row),
        avail_total: toInt(row.avail_total),
        upc_ean: row.upc_ean || null,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });
      count++;
      if (count % 1000 === 0) {
        console.log(`[jbi-inventory] processed ${count} items`);
      }
    }

    await downloadPromise;
    await writer.flush();

    const durationSec = (Date.now() - startedAt) / 1000;
    await setLastSyncMeta(db, META_KEY, {
      ftpModTime: admin.firestore.Timestamp.fromDate(remoteModTime),
      itemCount: count,
      durationSec,
      skipped: false,
    });

    console.log(
      `[jbi-inventory] done. ${count} items in ${durationSec.toFixed(1)}s`,
    );
    return { skipped: false, itemCount: count, durationSec };
  });
}

function extractWarehouses(row) {
  const out = {};
  for (const code of WAREHOUSE_CODES) {
    const qty = toInt(row[code]);
    if (qty > 0) out[code] = qty;
  }
  return out;
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

module.exports = { runInventorySync };
