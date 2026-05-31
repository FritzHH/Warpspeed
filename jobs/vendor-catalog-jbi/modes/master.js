const admin = require("firebase-admin");
const { withFtpClient } = require("../ftp");
const { initFirestore, BatchWriter } = require("../firestore");
const { getLastSyncMeta, setLastSyncMeta, shouldSkip } = require("../meta");
const { createTabParser } = require("../parser");

const REMOTE_FILE = "/inv_mast.txt";
const META_KEY = "lastMasterSync";
const ITEMS_SUBCOLLECTION = "items";

async function runMasterSync() {
  const startedAt = Date.now();
  const db = initFirestore();

  return await withFtpClient(async (ftpClient) => {
    const remoteModTime = await ftpClient.lastMod(REMOTE_FILE);
    console.log(`[jbi-master] remote modTime: ${remoteModTime.toISOString()}`);

    const lastSync = await getLastSyncMeta(db, META_KEY);
    if (shouldSkip(lastSync, remoteModTime)) {
      console.log(`[jbi-master] skipping - remote unchanged since last sync`);
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
    const itemsCol = db
      .collection("vendor_catalogs")
      .doc("jbi")
      .collection(ITEMS_SUBCOLLECTION);

    let itemCount = 0;
    for await (const row of parser) {
      const itemId = row.item_id;
      if (!itemId) continue;
      await writer.set(itemsCol.doc(itemId), cleanRow(row));
      itemCount++;
      if (itemCount % 1000 === 0) {
        console.log(`[jbi-master] processed ${itemCount} items`);
      }
    }

    await downloadPromise;
    await writer.flush();

    const durationSec = (Date.now() - startedAt) / 1000;
    await setLastSyncMeta(db, META_KEY, {
      ftpModTime: admin.firestore.Timestamp.fromDate(remoteModTime),
      itemCount,
      durationSec,
      skipped: false,
    });

    console.log(
      `[jbi-master] done. ${itemCount} items in ${durationSec.toFixed(1)}s`,
    );
    return { skipped: false, itemCount, durationSec };
  });
}

function cleanRow(row) {
  const cleaned = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null && value !== "") {
      cleaned[key] = value;
    }
  }
  cleaned.lastUpdated = admin.firestore.FieldValue.serverTimestamp();
  return cleaned;
}

module.exports = { runMasterSync };
