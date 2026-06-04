// Firestore helpers for the JBI catalog ingest job. Mirrors rtdb.js in surface
// (init + batched writer) so the master mode reads almost identically across
// the RTDB inventory path and the Firestore items_by_id path.
//
// Firestore caps a single batch at 500 ops; we use 400 to leave headroom in
// case a future caller wants to mix in extra writes alongside our flush.

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const MAX_OPS_PER_BATCH = 400;

function initFirestore() {
  if (!admin.apps.length) {
    const url = process.env.FIREBASE_DATABASE_URL;
    if (!url) {
      throw new Error(
        "FIREBASE_DATABASE_URL env var required (e.g. https://cadence-pos-default-rtdb.firebaseio.com)",
      );
    }
    admin.initializeApp({ databaseURL: url });
  }
  return getFirestore();
}

class FirestoreBatchWriter {
  constructor(firestore, collectionPath, { batchSize = MAX_OPS_PER_BATCH } = {}) {
    this.firestore = firestore;
    this.collectionPath = collectionPath;
    this.batchSize = batchSize;
    this.pending = [];
    this.totalSet = 0;
    this.totalDelete = 0;
  }

  async set(docId, data) {
    this.pending.push({ type: "set", docId, data });
    if (this.pending.length >= this.batchSize) await this.flush();
  }

  async delete(docId) {
    this.pending.push({ type: "delete", docId });
    if (this.pending.length >= this.batchSize) await this.flush();
  }

  async flush() {
    if (this.pending.length === 0) return;
    const batch = this.firestore.batch();
    for (const op of this.pending) {
      const ref = this.firestore.doc(`${this.collectionPath}/${op.docId}`);
      if (op.type === "set") {
        batch.set(ref, op.data);
        this.totalSet++;
      } else {
        batch.delete(ref);
        this.totalDelete++;
      }
    }
    await batch.commit();
    this.pending = [];
  }
}

module.exports = { initFirestore, FirestoreBatchWriter, MAX_OPS_PER_BATCH };
