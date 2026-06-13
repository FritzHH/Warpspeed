import cloneDeep from "lodash/cloneDeep";
import { INVENTORY_ITEM_PROTO } from "../data";
import { generate36CharUUID } from "../utils";

// Build a fresh local inventory item populated from a vendor-catalog item doc
// (vendor_catalogs/{vendorId}/items_by_id/{itemId} on cadence-pos). Used by
// Price Check's "add to local inventory" path and any future catalog-import
// flows that need a ready-to-save local item from a single catalog hit.
//
// Field-name fallbacks cover canonical (post-2026-06) shape first and legacy
// shape second: `name` → catalogName, `primaryUpc` → primaryBarcode,
// `allUpcs` → barcodes, `imageUrl` → image_url, `item_id`/`id` → vendorPartId.
//
// Convention: `primaryBarcode` is held separately and NOT duplicated in
// `barcodes[]` (matches buildReconciliationUpdate in db_calls_wrapper).
//
// Caller responsibilities — fields left at proto defaults that the operator
// fills in later: salePrice, minutes, quickButtonLabel, customPart,
// customLabor, receiptNoteRequired. `price` is pre-populated from msrp so
// catalog-import shows the operator a sensible starting sticker.
export function buildInventoryItemFromCatalog(
  catalogItem,
  { vendorId = "", scannedBarcode = "" } = {},
) {
  const item = cloneDeep(INVENTORY_ITEM_PROTO);

  const catalogName = String(catalogItem?.catalogName || catalogItem?.name || "");
  const brand = String(catalogItem?.brand || "");
  const cost = Number.isFinite(catalogItem?.cost) ? catalogItem.cost : 0;
  const msrp = Number.isFinite(catalogItem?.msrp) ? catalogItem.msrp : 0;

  const rawImg = catalogItem?.image_url ?? catalogItem?.imageUrl;
  const image_url = typeof rawImg === "string" ? rawImg.trim() : "";

  const rawVpid =
    catalogItem?.vendorPartId ?? catalogItem?.item_id ?? catalogItem?.id;
  const vendorPartId =
    typeof rawVpid === "string"
      ? rawVpid.trim()
      : rawVpid != null
        ? String(rawVpid)
        : "";

  const rawPrim = catalogItem?.primaryBarcode ?? catalogItem?.primaryUpc;
  const catalogPrimary = typeof rawPrim === "string" ? rawPrim.trim() : "";

  const rawBarcodes = Array.isArray(catalogItem?.barcodes)
    ? catalogItem.barcodes
    : Array.isArray(catalogItem?.allUpcs)
      ? catalogItem.allUpcs
      : [];

  const scanned = String(scannedBarcode || "").trim();
  // Prefer the scanned UPC for primary — it matches what's physically on the
  // box the operator is holding. Fall back to the catalog's primary.
  const primaryBarcode = scanned || catalogPrimary;

  const merged = new Set();
  for (const b of rawBarcodes) {
    const k = typeof b === "string" ? b.trim() : "";
    if (k) merged.add(k);
  }
  if (scanned) merged.add(scanned);
  merged.delete(primaryBarcode);
  const barcodes = Array.from(merged);

  const rawSpecs = catalogItem?.specs;
  const specs =
    rawSpecs && typeof rawSpecs === "object" && !Array.isArray(rawSpecs)
      ? { ...rawSpecs }
      : {};

  item.id = generate36CharUUID();
  item.catalogName = catalogName;
  item.vendorPartId = vendorPartId;
  item.primaryBarcode = primaryBarcode;
  item.barcodes = barcodes;
  item.brand = brand;
  item.image_url = image_url;
  item.cost = cost;
  item.msrp = msrp;
  item.price = msrp;
  item.vendorId = vendorId;
  item.vendorName = vendorId ? String(vendorId).toUpperCase() : "";
  // Proto defaults to "Labor"; catalog hits are always real parts.
  item.category = "Item";
  item.alternateVendors = [];
  item.specs = specs;

  return item;
}
