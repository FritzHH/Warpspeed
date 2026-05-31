const admin = require("firebase-admin");

const BATCH_SIZE = 500;

function initFirestore() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

class BatchWriter {
  constructor(db) {
    this.db = db;
    this.batch = db.batch();
    this.count = 0;
    this.totalWritten = 0;
  }

  async set(docRef, data) {
    this.batch.set(docRef, data);
    this.count++;
    this.totalWritten++;
    if (this.count >= BATCH_SIZE) {
      await this.flush();
    }
  }

  async flush() {
    if (this.count === 0) return;
    await this.batch.commit();
    this.batch = this.db.batch();
    this.count = 0;
  }
}

module.exports = { initFirestore, BatchWriter, BATCH_SIZE };
