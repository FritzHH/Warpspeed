const { withFtpClient } = require("../ftp");
const { initRtdb, MultiPathWriter } = require("../rtdb");
const { getLastSyncMeta, setLastSyncMeta, shouldSkip } = require("../meta");
const { createTabParser } = require("../parser");

const REMOTE_FILE = "/product_spec_with_titles.txt";
const META_KEY = "lastSpecsSync";
const SPECS_PATH = "vendor_catalogs/jbi/specs";
const MAX_PAIRS = 20;

async function runSpecsSync() {
  const startedAt = Date.now();
  const db = initRtdb();

  return await withFtpClient(async (ftpClient) => {
    const remoteModTime = await ftpClient.lastMod(REMOTE_FILE);
    console.log(`[jbi-specs] remote modTime: ${remoteModTime.toISOString()}`);

    const lastSync = await getLastSyncMeta(db, META_KEY);
    if (shouldSkip(lastSync, remoteModTime)) {
      console.log(`[jbi-specs] skipping - remote unchanged since last sync`);
      await setLastSyncMeta(db, META_KEY, {
        ftpModTime: remoteModTime.getTime(),
        skipped: true,
        durationSec: (Date.now() - startedAt) / 1000,
      });
      return { skipped: true };
    }

    console.log(`[jbi-specs] wiping ${SPECS_PATH}`);
    await db.ref(SPECS_PATH).remove();

    const parser = createTabParser({ columns: true });
    const downloadPromise = ftpClient.downloadTo(parser, REMOTE_FILE);

    const writer = new MultiPathWriter(db);
    let itemCount = 0;
    let specsWriteCount = 0;
    let totalPairs = 0;

    for await (const row of parser) {
      const itemId = row["Part No"];
      if (!itemId) continue;
      itemCount++;

      const specs = [];
      for (let i = 1; i <= MAX_PAIRS; i++) {
        const title = (row[`Title ${i}`] || "").trim();
        const value = (row[`Data ${i}`] || "").trim();
        if (!value) continue;
        specs.push({ title, value });
      }

      if (specs.length === 0) continue;

      await writer.set(`${SPECS_PATH}/${itemId}`, specs);
      specsWriteCount++;
      totalPairs += specs.length;

      if (itemCount % 1000 === 0) {
        console.log(
          `[jbi-specs] processed ${itemCount} items (${specsWriteCount} written, ${totalPairs} pairs so far)`,
        );
      }
    }

    await downloadPromise;
    await writer.flush();

    const durationSec = (Date.now() - startedAt) / 1000;
    await setLastSyncMeta(db, META_KEY, {
      ftpModTime: remoteModTime.getTime(),
      itemCount,
      specsWriteCount,
      totalPairs,
      durationSec,
      skipped: false,
    });

    console.log(
      `[jbi-specs] done. ${itemCount} items processed, ${specsWriteCount} written, ${totalPairs} pairs in ${durationSec.toFixed(1)}s`,
    );
    return {
      skipped: false,
      itemCount,
      specsWriteCount,
      totalPairs,
      durationSec,
    };
  });
}

module.exports = { runSpecsSync };
