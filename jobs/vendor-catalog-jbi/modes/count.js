// Lightweight catalog-size probe with FTP-modTime gate. Fires every 15 min
// during business hours from Cloud Scheduler.
//
// JBI's catalog only changes when JBI re-publishes inv_mast.txt (typically a
// few times per day). To avoid pulling tens of MB of FTP traffic on every
// probe, this job FTP-LIST's the file first and compares the remote modTime
// to the last probe's stored fileModTime. If they match, we reuse the prior
// count and just bump checkedAt with `cached: true`. When the file has
// genuinely changed, we stream it through a line counter (no on-disk write)
// and write the new count.
//
// Storage mirrors the QBP probe at /vendor_catalogs/jbi/_meta/lastInventoryCount.

const admin = require("firebase-admin");
const { Writable } = require("stream");
const { withFtpClient } = require("../ftp");
const { initRtdb } = require("../rtdb");

const REMOTE_FILE = "/inv_mast.txt";
const META_PATH = "vendor_catalogs/jbi/_meta/lastInventoryCount";
const HISTORY_CAP = 96;
const SWING_THRESHOLD = 0.05;

async function runCountProbe() {
  const startedAt = Date.now();
  const db = initRtdb();

  const prevSnap = await db.ref(META_PATH).once("value");
  const prev = prevSnap.val() || {};
  const previousCount = Number(prev.count) || 0;
  const previousModTime = Number(prev.fileModTime) || 0;

  return await withFtpClient(async (ftpClient) => {
    const remoteModTime = await ftpClient.lastMod(REMOTE_FILE);
    const remoteModMs = remoteModTime.getTime();
    console.log(`[jbi-count] remote modTime: ${remoteModTime.toISOString()}`);

    const fileUnchanged =
      previousModTime > 0 &&
      previousModTime === remoteModMs &&
      previousCount > 0;

    if (fileUnchanged) {
      console.log(
        `[jbi-count] file unchanged, reusing prior count=${previousCount}`
      );
      const checkedAtMs = Date.now();
      const history = Array.isArray(prev.history) ? prev.history.slice() : [];
      history.push({
        count: previousCount,
        checkedAtMs,
        source: "jbi-ftp",
        fileModTime: remoteModMs,
        cached: true,
      });
      while (history.length > HISTORY_CAP) history.shift();

      await db.ref(META_PATH).update({
        cached: true,
        checkedAt: admin.database.ServerValue.TIMESTAMP,
        durationSec: (Date.now() - startedAt) / 1000,
        history,
      });
      return { count: previousCount, cached: true };
    }

    console.log(`[jbi-count] file changed since last probe, line-counting`);
    let lineCount = 0;
    let tail = "";
    const counter = new Writable({
      write(chunk, _enc, cb) {
        tail += chunk.toString("utf8");
        let idx;
        while ((idx = tail.indexOf("\n")) >= 0) {
          lineCount++;
          tail = tail.slice(idx + 1);
        }
        cb();
      },
      final(cb) {
        if (tail.length > 0) lineCount++;
        cb();
      },
    });
    await ftpClient.downloadTo(counter, REMOTE_FILE);

    // inv_mast.txt has a single header row; subtract it from the line total.
    const count = Math.max(0, lineCount - 1);

    if (count === 0) {
      throw new Error(
        "JBI inv_mast.txt counted 0 data rows - refusing to write probe"
      );
    }

    const delta = previousCount > 0 ? count - previousCount : 0;
    const swingPct = previousCount > 0 ? Math.abs(delta) / previousCount : 0;
    const unusualSwing = previousCount > 0 && swingPct > SWING_THRESHOLD;

    const checkedAtMs = Date.now();
    const history = Array.isArray(prev.history) ? prev.history.slice() : [];
    history.push({
      count,
      checkedAtMs,
      source: "jbi-ftp",
      fileModTime: remoteModMs,
      cached: false,
    });
    while (history.length > HISTORY_CAP) history.shift();

    await db.ref(META_PATH).set({
      count,
      previousCount,
      delta,
      swingPct,
      unusualSwing,
      source: "jbi-ftp",
      cached: false,
      fileModTime: remoteModMs,
      checkedAt: admin.database.ServerValue.TIMESTAMP,
      durationSec: (Date.now() - startedAt) / 1000,
      history,
    });

    const sign = delta >= 0 ? "+" : "";
    console.log(
      `[jbi-count] count=${count} prev=${previousCount} delta=${sign}${delta} swing=${(swingPct * 100).toFixed(2)}%${unusualSwing ? " UNUSUAL" : ""}`
    );
    return { count, previousCount, delta, swingPct, unusualSwing, cached: false };
  });
}

module.exports = { runCountProbe };
