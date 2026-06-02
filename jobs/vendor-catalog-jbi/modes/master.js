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

      await writer.set(`${ITEMS_PATH}/${itemId}`, cleanRow(row));
      itemCount++;

      const upc = (row.upc_ean || "").trim();
      if (upc) {
        await writer.set(`${ITEMS_BY_UPC_PATH}/${upc}`, itemId);
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

function cleanRow(row) {
  const cleaned = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null && value !== "") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

module.exports = { runMasterSync };
