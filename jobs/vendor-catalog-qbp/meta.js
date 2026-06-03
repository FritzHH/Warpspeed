// Per-mode sync metadata writer + skip-if-unchanged helper.
//
// JBI compares FTP modTime; QBP exposes no equivalent "catalog version"
// header, so we hash the skulist response and compare hashes. Cheap (single
// GET to /1/product/skulist before deciding) and lets a daily cron be safely
// idempotent — same hash → no-op + bumped completedAt.
//
// inventory mode does NOT use this skip path. Warehouse stock changes
// constantly, so we always run inventory and store the per-warehouse counts
// + duration in meta for observability.

const admin = require("firebase-admin");
const crypto = require("crypto");

const META_PATH = "vendor_catalogs/qbp/_meta";

async function getLastSyncMeta(db, modeKey) {
  const snap = await db.ref(`${META_PATH}/${modeKey}`).once("value");
  return snap.val();
}

async function setLastSyncMeta(db, modeKey, payload) {
  const now = admin.database.ServerValue.TIMESTAMP;
  const updates = {
    [`${META_PATH}/${modeKey}`]: { ...payload, completedAt: now },
    [`${META_PATH}/lastTouched`]: now,
  };
  await db.ref().update(updates);
}

function shouldSkipByHash(lastSync, hash) {
  if (!lastSync || !lastSync.responseHash || !hash) return false;
  return lastSync.responseHash === hash;
}

function hashPayload(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return crypto.createHash("sha256").update(text).digest("hex");
}

module.exports = {
  getLastSyncMeta,
  setLastSyncMeta,
  shouldSkipByHash,
  hashPayload,
  META_PATH,
};
