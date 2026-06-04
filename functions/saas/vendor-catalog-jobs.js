/* eslint-disable */
// Vendor-catalog job registry — enrichment metadata for Cloud Scheduler jobs.
//
// The Cloud Scheduler mirror (`platform-scheduled-jobs.js`) is the system of
// record for "what jobs exist and what state are they in." This file adds the
// human-meaningful metadata that doesn't belong on the GCP resource itself —
// display name, vendor grouping, tooltip copy, recommended cadence — keyed by
// Cloud Scheduler basename. The reconciler stamps a match onto `vendorMeta`
// when serializing each mirror doc; unmatched jobs stay bare and still
// appear in the mirror without grouping context.
//
// Adding a new vendor job:
//   1. Append an entry below. `basename` must exactly match the Cloud
//      Scheduler resource basename (the trailing segment of `job.name`).
//   2. If the Cloud Scheduler job doesn't exist yet, create it on GCP — the
//      reconciler picks it up on the next 10-minute sync (or hit
//      platformAdminSyncScheduledJobsCallable to force).
//
// Note on the master + inventory basenames seeded below: those two jobs
// pre-date this registry; the basenames here are best-guess based on the
// `vendor-catalog-jbi-specs` convention the spec job uses. After the first
// sync, verify against the mirror — if Cloud Scheduler returned different
// basenames, fix them here and they'll enrich on the next sweep.

const VENDOR_CATALOG_JOBS = [
  {
    basename: "vendor-catalog-jbi-master",
    vendor: "jbi",
    vendorDisplayName: "JBI",
    displayName: "JBI – Catalog Master",
    description:
      "Downloads /inv_mast.txt + /product_spec_with_titles.txt from JBI's FTP, diffs the result against the previous baseline in GCS, and writes only adds/changes/deletes to Firestore vendor_catalogs/jbi/items_by_id/{itemId}.",
    tooltip:
      "Nightly diff-based ingest. Master record per item (description, brand, MSRP, UPC) plus folded specs[]. Skips when /inv_mast.txt modTime matches the last sync stamp at /vendor_catalogs/jbi.lastMasterSync (RTDB meta). Baseline lives in gs://cadence-pos-vendor-catalog-baselines/jbi-items.json.gz; first run is a full upload, steady-state writes are tiny deltas.",
    recommendedCadence: "0 3 * * *",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: true,
  },
  {
    basename: "vendor-catalog-jbi-inventory",
    vendor: "jbi",
    vendorDisplayName: "JBI",
    displayName: "JBI – Inventory Levels",
    description:
      "Downloads /inv_loc.txt from JBI's FTP and writes per-warehouse stock maps to RTDB vendor_catalogs/jbi/inventory_by_item/{itemId}.",
    tooltip:
      "Stock counts move throughout the day. Job skips if FTP modTime matches the last sync stamp at /vendor_catalogs/jbi.lastInventorySync. Inventory stays on RTDB (15-min cadence, point-lookup reads) while master items live on Firestore.",
    recommendedCadence: "*/15 * * * *",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: true,
  },
  {
    basename: "vendor-catalog-qbp-master",
    vendor: "qbp",
    vendorDisplayName: "QBP",
    displayName: "QBP – Catalog Master",
    description:
      "Hits QBP API1 /1/product/skulist, then per-SKU /1/product/sku/{sku}, diffs the result against the previous baseline in GCS, and writes only adds/changes/deletes to Firestore vendor_catalogs/qbp/items_by_id/{SKU}. Same run also refreshes RTDB vendor_catalogs/qbp/inventory_by_item/{SKU} from the bundled stockLevels.",
    tooltip:
      "QBP has no FTP/modTime equivalent, so the job hashes the skulist response and skips if it matches the last sync stamp at /vendor_catalogs/qbp/_meta/lastMasterSync. Per-SKU fetches run bounded-parallel (QBP_CONCURRENCY, default 8). One bad SKU increments missCount instead of aborting. Baseline lives in gs://cadence-pos-vendor-catalog-baselines/qbp-items.json.gz.",
    recommendedCadence: "30 3 * * *",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: true,
  },
  {
    basename: "vendor-catalog-qbp-inventory",
    vendor: "qbp",
    vendorDisplayName: "QBP",
    displayName: "QBP – Inventory Levels",
    description:
      "Fans out across QBP warehouse codes (QBP_WAREHOUSES, default PA,MN,NV) hitting /1/availability/warehouse/{code}, then writes per-SKU { warehouseCode: qty } maps to RTDB vendor_catalogs/qbp/inventory_by_item/{SKU}.",
    tooltip:
      "Always runs — warehouse stock changes constantly and QBP exposes no cheap change-detect. Meta stamped at /vendor_catalogs/qbp/_meta/lastInventorySync with warehousesSeen + totalQty + itemsWithStockCount.",
    recommendedCadence: "*/15 * * * *",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: false,
  },
  {
    basename: "vendor-catalog-qbp-count",
    vendor: "qbp",
    vendorDisplayName: "QBP",
    displayName: "QBP – Catalog Size Probe",
    description:
      "Hits /1/product/skulist and counts the returned array. Writes count + 96-entry rolling history to /vendor_catalogs/qbp/_meta/lastInventoryCount.",
    tooltip:
      "Lightweight probe so we can detect catalog-size swings between master syncs. Stamps `unusualSwing: true` when |delta|/previousCount > 5%. Runs every 15 min during continental-US business hours (Mon-Fri 9am ET through 8pm ET).",
    recommendedCadence: "*/15 9-20 * * 1-5",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: false,
  },
  {
    basename: "vendor-catalog-jbi-count",
    vendor: "jbi",
    vendorDisplayName: "JBI",
    displayName: "JBI – Catalog Size Probe",
    description:
      "FTP-LIST's /inv_mast.txt to check modTime; if unchanged since the last probe, reuses the prior count. If changed, streams the file through a line counter and writes the new count to /vendor_catalogs/jbi/_meta/lastInventoryCount.",
    tooltip:
      "Lightweight probe with FTP-modTime gate so we don't pull tens of MB on every 15-min tick. Stamps `unusualSwing: true` when |delta|/previousCount > 5%. Runs every 15 min during continental-US business hours (Mon-Fri 9am ET through 8pm ET).",
    recommendedCadence: "*/15 9-20 * * 1-5",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: true,
  },
];

const VENDOR_CATALOG_JOBS_BY_BASENAME = Object.fromEntries(
  VENDOR_CATALOG_JOBS.map((entry) => [entry.basename, entry])
);

function getVendorJobMeta(basename) {
  if (!basename) return null;
  return VENDOR_CATALOG_JOBS_BY_BASENAME[basename] || null;
}

function listVendorJobMeta() {
  return VENDOR_CATALOG_JOBS.slice();
}

module.exports = {
  getVendorJobMeta,
  listVendorJobMeta,
  VENDOR_CATALOG_JOBS,
};
