const admin = require("firebase-admin");

const META_PATH = "vendor_catalogs/jbi/_meta";

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

function shouldSkip(lastSync, remoteModTime) {
  if (!lastSync || !lastSync.ftpModTime || !remoteModTime) return false;
  return lastSync.ftpModTime === remoteModTime.getTime();
}

module.exports = { getLastSyncMeta, setLastSyncMeta, shouldSkip, META_PATH };
