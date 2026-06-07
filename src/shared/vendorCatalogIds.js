// Canonical vendor catalog identifiers. Single source of truth for vendor
// slugs used across the client (inventory items, vendor orders, chrome
// extension), Cloud Functions, and Cloud Run catalog ingestion jobs.
// Read from here instead of hardcoding slug strings.

export const VENDOR_CATALOG_IDS = Object.freeze({
  JBI: "jbi",
  QBP: "qbp",
  OTHER: "other",
});
