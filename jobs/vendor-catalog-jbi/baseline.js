// Cloud Storage baseline manager for the catalog diff workflow.
//
// Steady-state flow each nightly run:
//   1. load()        - fetch the previous run's full catalog map from GCS
//                      (returns an empty Map on 404 - bootstrap)
//   2. <build current map from the FTP/API feed>
//   3. diff(current) - return { adds, changes, deletes }
//   4. <write to Firestore>
//   5. save(current) - upload the new baseline ONLY after Firestore writes
//                      complete; partial failures re-diff cleanly next run.
//
// Storage shape: gzipped JSON object keyed by itemId, value = canonical doc.
//   { "ABC123": { id, name, brand, cost, msrp, primaryUpc, allUpcs, ... }, ... }
//
// stableStringify sorts object keys before stringifying so equality is
// insensitive to mapping-fn key-insertion order. Arrays preserve order
// (allUpcs, specs are ordered fields).

const { Storage } = require("@google-cloud/storage");
const zlib = require("zlib");
const { promisify } = require("util");

const gzipP = promisify(zlib.gzip);
const gunzipP = promisify(zlib.gunzip);

const DEFAULT_BUCKET = "cadence-pos-vendor-catalog-baselines";

class BaselineStore {
  constructor(vendor, { bucketName = process.env.CATALOG_BASELINE_BUCKET || DEFAULT_BUCKET } = {}) {
    this.vendor = vendor;
    this.bucketName = bucketName;
    this.storage = new Storage();
    this.bucket = this.storage.bucket(bucketName);
    this.fileName = `${vendor}-items.json.gz`;
    this.file = this.bucket.file(this.fileName);
  }

  // Returns Map<itemId, doc>. Empty Map on first-ever run (bootstrap).
  async load() {
    const [exists] = await this.file.exists();
    if (!exists) {
      console.log(`[baseline:${this.vendor}] no baseline at gs://${this.bucketName}/${this.fileName} - bootstrap run`);
      return new Map();
    }
    const [buffer] = await this.file.download();
    const decompressed = await gunzipP(buffer);
    const obj = JSON.parse(decompressed.toString("utf8"));
    const map = new Map(Object.entries(obj));
    console.log(`[baseline:${this.vendor}] loaded baseline: ${map.size} items, ${buffer.length} bytes gz`);
    return map;
  }

  async save(currentMap) {
    const obj = Object.fromEntries(currentMap);
    const json = JSON.stringify(obj);
    const compressed = await gzipP(Buffer.from(json, "utf8"));
    await this.file.save(compressed, {
      contentType: "application/json",
      metadata: { contentEncoding: "gzip" },
      resumable: false,
    });
    console.log(`[baseline:${this.vendor}] uploaded baseline: ${currentMap.size} items, ${compressed.length} bytes gz`);
  }
}

// Diff currentMap against baselineMap. Both are Map<itemId, doc>.
//   adds    - ids in current but not in baseline
//   changes - ids in both, but stableStringify(current) !== stableStringify(baseline)
//   deletes - ids in baseline but not in current
function diffMaps(currentMap, baselineMap) {
  const adds = [];
  const changes = [];
  const deletes = [];

  for (const [id, current] of currentMap.entries()) {
    if (!baselineMap.has(id)) {
      adds.push({ id, doc: current });
      continue;
    }
    if (stableStringify(current) !== stableStringify(baselineMap.get(id))) {
      changes.push({ id, doc: current });
    }
  }

  for (const id of baselineMap.keys()) {
    if (!currentMap.has(id)) {
      deletes.push(id);
    }
  }

  return { adds, changes, deletes };
}

// Deterministic stringify - object keys sorted, arrays preserve order.
// Used purely for equality comparison; never round-tripped.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]));
  return "{" + parts.join(",") + "}";
}

module.exports = { BaselineStore, diffMaps, stableStringify, DEFAULT_BUCKET };
