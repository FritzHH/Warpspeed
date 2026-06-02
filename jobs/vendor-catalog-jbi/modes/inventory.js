const { withFtpClient } = require("../ftp");
const { initRtdb, MultiPathWriter } = require("../rtdb");
const { getLastSyncMeta, setLastSyncMeta, shouldSkip } = require("../meta");
const { createTabParser } = require("../parser");

const REMOTE_FILE = "/inv_loc.txt";
const META_KEY = "lastInventorySync";
const INVENTORY_PATH = "vendor_catalogs/jbi/inventory_by_item";

async function runInventorySync() {
  const startedAt = Date.now();
  const db = initRtdb();

  return await withFtpClient(async (ftpClient) => {
    const remoteModTime = await ftpClient.lastMod(REMOTE_FILE);
    console.log(`[jbi-inventory] remote modTime: ${remoteModTime.toISOString()}`);

    const lastSync = await getLastSyncMeta(db, META_KEY);
    if (shouldSkip(lastSync, remoteModTime)) {
      console.log(`[jbi-inventory] skipping - remote unchanged since last sync`);
      await setLastSyncMeta(db, META_KEY, {
        ftpModTime: remoteModTime.getTime(),
        skipped: true,
        durationSec: (Date.now() - startedAt) / 1000,
      });
      return { skipped: true };
    }

    console.log(`[jbi-inventory] wiping ${INVENTORY_PATH}`);
    await db.ref(INVENTORY_PATH).remove();

    const parser = createTabParser({ columns: true });
    const downloadPromise = ftpClient.downloadTo(parser, REMOTE_FILE);

    const writer = new MultiPathWriter(db);
    const warehousesSeen = new Set();
    let itemCount = 0;
    let itemsWithStockCount = 0;
    let totalQty = 0;

    for await (const row of parser) {
      const itemId = row.item_id;
      if (!itemId) continue;
      itemCount++;

      const warehouseMap = {};
      for (const key of Object.keys(row)) {
        if (!key.startsWith("avail_") || key === "avail_total") continue;
        warehousesSeen.add(key);
        const qty = toInt(row[key]);
        if (qty <= 0) continue;
        warehouseMap[key] = qty;
        totalQty += qty;
      }

      if (Object.keys(warehouseMap).length === 0) continue;

      await writer.set(`${INVENTORY_PATH}/${itemId}`, warehouseMap);
      itemsWithStockCount++;

      if (itemCount % 1000 === 0) {
        console.log(
          `[jbi-inventory] processed ${itemCount} items (${itemsWithStockCount} with stock so far)`,
        );
      }
    }

    await downloadPromise;
    await writer.flush();

    const durationSec = (Date.now() - startedAt) / 1000;
    await setLastSyncMeta(db, META_KEY, {
      ftpModTime: remoteModTime.getTime(),
      itemCount,
      itemsWithStockCount,
      totalQty,
      warehousesSeen: Array.from(warehousesSeen),
      durationSec,
      skipped: false,
    });

    console.log(
      `[jbi-inventory] done. ${itemCount} items (${itemsWithStockCount} with stock, ${totalQty} total qty) across ${warehousesSeen.size} warehouses in ${durationSec.toFixed(1)}s`,
    );
    return {
      skipped: false,
      itemCount,
      itemsWithStockCount,
      totalQty,
      durationSec,
    };
  });
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

module.exports = { runInventorySync };
