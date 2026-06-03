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
      "Downloads /inv_mast.txt from JBI's FTP and upserts master catalog rows into /vendor_catalogs/jbi/items/{itemId}.",
    tooltip:
      "Master record per item (description, brand, MSRP, UPC). Job skips if FTP modTime matches the last sync stamp at /vendor_catalogs/jbi.lastMasterSync — over-scheduling is cheap.",
    recommendedCadence: "0 5 * * *",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: true,
  },
  {
    basename: "vendor-catalog-jbi-inventory",
    vendor: "jbi",
    vendorDisplayName: "JBI",
    displayName: "JBI – Inventory Levels",
    description:
      "Downloads /inv_loc.txt from JBI's FTP and updates per-warehouse stock counts on /vendor_catalogs/jbi/items/{itemId}.",
    tooltip:
      "Stock counts move throughout the day. Job skips if FTP modTime matches the last sync stamp at /vendor_catalogs/jbi.lastInventorySync.",
    recommendedCadence: "15 * * * *",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: true,
  },
  {
    basename: "vendor-catalog-jbi-specs",
    vendor: "jbi",
    vendorDisplayName: "JBI",
    displayName: "JBI – Product Specs",
    description:
      "Downloads /product_spec_with_titles.txt from JBI's FTP and writes per-item spec arrays to /vendor_catalogs/jbi/specs/{itemId}.",
    tooltip:
      "Specs are stored as { specs: [{title, value}, ...], lastUpdated } per item. Only items with at least one non-empty spec value get a doc. Meta is stamped at /vendor_catalogs/jbi.lastSpecsSync with specsWriteCount and totalPairs. Daily is plenty — specs change rarely.",
    recommendedCadence: "30 5 * * *",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: true,
  },
  {
    basename: "vendor-catalog-qbp-master",
    vendor: "qbp",
    vendorDisplayName: "QBP",
    displayName: "QBP – Catalog Master",
    description:
      "Hits QBP API1 /1/product/skulist, then per-SKU /1/product/sku/{sku}, and writes the cleaned product detail to /vendor_catalogs/qbp/items/{SKU} plus a reverse UPC index at /vendor_catalogs/qbp/items_by_upc/{upc}.",
    tooltip:
      "QBP has no FTP/modTime equivalent, so the job hashes the skulist response and skips if it matches the last sync stamp at /vendor_catalogs/qbp/_meta/lastMasterSync. Per-SKU fetches run bounded-parallel (QBP_CONCURRENCY, default 8). One bad SKU increments missCount instead of aborting.",
    recommendedCadence: "0 5 * * *",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: true,
  },
  {
    basename: "vendor-catalog-qbp-inventory",
    vendor: "qbp",
    vendorDisplayName: "QBP",
    displayName: "QBP – Inventory Levels",
    description:
      "Fans out across QBP warehouse codes (QBP_WAREHOUSES, default PA,MN,NV) hitting /1/availability/warehouse/{code}, then writes per-SKU { warehouseCode: qty } maps to /vendor_catalogs/qbp/inventory_by_item/{SKU}.",
    tooltip:
      "Always runs — warehouse stock changes constantly and QBP exposes no cheap change-detect. Meta stamped at /vendor_catalogs/qbp/_meta/lastInventorySync with warehousesSeen + totalQty + itemsWithStockCount.",
    recommendedCadence: "15 * * * *",
    recommendedTimeZone: "America/New_York",
    skipIfUnchanged: false,
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
