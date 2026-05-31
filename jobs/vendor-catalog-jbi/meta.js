const admin = require("firebase-admin");

const META_DOC_PATH = "vendor_catalogs/jbi";

async function getLastSyncMeta(db, modeKey) {
  const snap = await db.doc(META_DOC_PATH).get();
  if (!snap.exists) return null;
  return snap.data()[modeKey] || null;
}

async function setLastSyncMeta(db, modeKey, payload) {
  const ref = db.doc(META_DOC_PATH);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set(
    {
      [modeKey]: { ...payload, completedAt: now },
      lastTouched: now,
    },
    { merge: true },
  );
}

function shouldSkip(lastSync, remoteModTime) {
  if (!lastSync || !lastSync.ftpModTime || !remoteModTime) return false;
  const lastMs = lastSync.ftpModTime.toDate
    ? lastSync.ftpModTime.toDate().getTime()
    : new Date(lastSync.ftpModTime).getTime();
  return lastMs === remoteModTime.getTime();
}

module.exports = { getLastSyncMeta, setLastSyncMeta, shouldSkip, META_DOC_PATH };
