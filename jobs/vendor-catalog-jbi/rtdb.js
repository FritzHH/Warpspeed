const admin = require("firebase-admin");

const MAX_PATHS_PER_UPDATE = 500;

function initRtdb() {
  if (!admin.apps.length) {
    const url = process.env.FIREBASE_DATABASE_URL;
    if (!url) {
      throw new Error(
        "FIREBASE_DATABASE_URL env var required (e.g. https://cadence-pos-default-rtdb.firebaseio.com)",
      );
    }
    admin.initializeApp({ databaseURL: url });
  }
  return admin.database();
}

class MultiPathWriter {
  constructor(db, { maxPaths = MAX_PATHS_PER_UPDATE } = {}) {
    this.db = db;
    this.maxPaths = maxPaths;
    this.pending = {};
    this.count = 0;
    this.totalWritten = 0;
  }

  async set(path, value) {
    this.pending[path] = value;
    this.count++;
    this.totalWritten++;
    if (this.count >= this.maxPaths) {
      await this.flush();
    }
  }

  async remove(path) {
    return this.set(path, null);
  }

  async flush() {
    if (this.count === 0) return;
    await this.db.ref().update(this.pending);
    this.pending = {};
    this.count = 0;
  }
}

module.exports = { initRtdb, MultiPathWriter, MAX_PATHS_PER_UPDATE };
