/* eslint-disable */
// Chrome Extension callables — backend for the Cadence "Add to Cadence" Chrome
// extension that injects buttons onto jbi.bike.
//
// Exports:
//   - addJBIItemToVendorOrder      Add one JBI line item to the active order
//   - listVendorOrdersCallable     List open orders for the active-order picker
//   - getVendorOrderCallable       Order doc + items, for side panel display
//   - setActiveVendorOrderCallable Write settings.activeVendorOrderID
//
// DUAL-AUTH (interim — Bonita coexistence):
//
//   The callable is deployed on cadence-pos but must serve BOTH:
//     - cadence-pos users (SaaS): standard request.auth flow.
//     - warpspeed-bonitabikes users (Bonita, pre-migration): Bonita ID token
//       passed in request.data.idToken; verified manually against a second
//       admin app initialized with Bonita service-account creds.
//
//   When Bonita migrates onto cadence-pos servers, delete:
//     - the BONITA_* constants
//     - getBonitaApp() and its secret
//     - the `project === BONITA_PROJECT_ID` branch in resolveCaller()
//   ...leaving a single-project module with no special-casing.
//
// REQUIRED OUT-OF-BAND SETUP (one-time):
//   1. Create a service account on warpspeed-bonitabikes with
//      `roles/datastore.user` (Firestore read/write) and
//      `roles/firebaseauth.viewer` (token verification). Download its JSON key.
//   2. Store the entire JSON blob as a secret on cadence-pos:
//        firebase functions:secrets:set BONITA_ADMIN_SA_KEY \
//          --project=cadence-pos --account=fritz@retailsoftsystems.com
//      (paste the full JSON when prompted)
//   3. Deploy these functions (see deploy command at bottom of file).
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("crypto");

const SAAS_PROJECT_ID = "cadence-pos";
const BONITA_PROJECT_ID = "warpspeed-bonitabikes";

// Default app needs an explicit databaseURL — vendor inventory lives at
// `vendor_catalogs/{vendor}/inventory_by_item/*` on cadence-pos RTDB and we
// also need an admin handle bound to this project for Firestore catalog reads
// (`vendor_catalogs/{vendor}/items_by_id/*`). admin.app().database() without
// a configured URL silently retries forever on bad credentials.
const SAAS_RTDB_URL = `https://${SAAS_PROJECT_ID}-default-rtdb.firebaseio.com`;
if (!admin.apps.length) admin.initializeApp({ databaseURL: SAAS_RTDB_URL });

const BONITA_ADMIN_SA_KEY = defineSecret("BONITA_ADMIN_SA_KEY");

// ────────────────────────────────────────────────────────────────────
// Dual-auth helpers
// ────────────────────────────────────────────────────────────────────

let _bonitaApp = null;
function getBonitaApp() {
  if (_bonitaApp) return _bonitaApp;
  const raw = BONITA_ADMIN_SA_KEY.value();
  if (!raw) {
    throw new HttpsError(
      "failed-precondition",
      "BONITA_ADMIN_SA_KEY secret is not set. Configure it on cadence-pos before serving Bonita users."
    );
  }
  let cred;
  try {
    cred = JSON.parse(raw);
  } catch (err) {
    throw new HttpsError(
      "failed-precondition",
      "BONITA_ADMIN_SA_KEY is not valid JSON."
    );
  }
  _bonitaApp = admin.initializeApp(
    {
      credential: admin.credential.cert(cred),
      projectId: BONITA_PROJECT_ID,
    },
    "bonita"
  );
  return _bonitaApp;
}

// Resolves the caller's project (cadence-pos vs Bonita), verifies the token
// against the correct admin app, and returns the Firestore handle scoped to
// the caller's project plus the caller's UID.
//
// Returns: { uid, firestore, project }
//
// Throws HttpsError on any auth failure.
async function resolveCaller(request, data) {
  const { project, idToken, tenantID } = data;
  if (!project || !tenantID) {
    throw new HttpsError(
      "invalid-argument",
      "project and tenantID are required."
    );
  }

  if (project === SAAS_PROJECT_ID) {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const tokenTenantID = request.auth.token && request.auth.token.tenantID;
    if (tokenTenantID && tokenTenantID !== tenantID) {
      throw new HttpsError(
        "permission-denied",
        "Cross-tenant access is not allowed."
      );
    }
    return {
      uid: request.auth.uid,
      firestore: getFirestore(),
      project,
    };
  }

  if (project === BONITA_PROJECT_ID) {
    if (!idToken) {
      throw new HttpsError(
        "unauthenticated",
        "idToken is required for Bonita callers."
      );
    }
    const bonita = getBonitaApp();
    let decoded;
    try {
      decoded = await bonita.auth().verifyIdToken(idToken);
    } catch (err) {
      logger.warn("Bonita verifyIdToken failed", err && err.message);
      throw new HttpsError("unauthenticated", "Invalid Bonita ID token.");
    }
    // Bonita tokens pre-migration don't carry a tenantID claim. Single-tenant
    // by definition; trust the tenantID passed by the extension.
    return {
      uid: decoded.uid,
      firestore: bonita.firestore(),
      project,
    };
  }

  throw new HttpsError("invalid-argument", `Unknown project: ${project}`);
}

const COMMON_OPTS = {
  region: "us-central1",
  secrets: [BONITA_ADMIN_SA_KEY],
  cors: true,
};

// ────────────────────────────────────────────────────────────────────
// Vendor catalog -> inventory mapping
// ────────────────────────────────────────────────────────────────────

// Vendor catalog slugs we know how to probe for alternateVendors. Mirrors
// VENDOR_CATALOGS in src/data.js minus the "other" sentinel (no catalogPath).
// Hardcoded server-side so we don't have to ship the client shared file.
// Update when a new vendor catalog comes online.
const KNOWN_VENDOR_CATALOG_IDS = ["jbi", "qbp"];

// Build a Cadence inventory doc from a canonical vendor-catalog snapshot.
// Mirrors INVENTORY_ITEM_PROTO in src/data.js — keep in sync if either
// side changes.
//
// vendorCatalogID is the catalog the snapshot came from ("jbi", "qbp", ...)
// and becomes the doc's vendorId / createdFromVendor stamp.
//
// id is the Firestore auto-id the caller pre-allocated (so doc key matches
// doc body). Canonical cost / msrp are already CENTS, no money math here.
//
// alternateVendors is the cross-vendor pointer list — populated by the
// caller via probeAlternateVendors() so it can be awaited in parallel with
// the existing-inventory lookup.
//
// formalName is populated from catalogName for legacy-reader compat during
// the canonical-shape transition (OrderingModalScreen, InventoryItemModal,
// BaseScreen receipt scan all still read formalName). vendorName stays
// empty — new readers should resolve display name via vendorId slug.
function buildInventoryItemFromCatalog(catalog, id, uid, vendorCatalogID, alternateVendors = []) {
  if (!catalog) return null;

  // Snapshot may be new canonical shape (catalogName/primaryBarcode/barcodes/
  // image_url) or pre-2026-06 legacy (name/primaryUpc/allUpcs/imageUrl) if it
  // was captured on an order line before the mapper rewrite.
  const catalogName = String(catalog.catalogName || catalog.name || "").trim();
  const brand = String(catalog.brand || "").trim();
  const costCents = Number.isFinite(catalog.cost) ? catalog.cost : 0;
  const msrpCents = Number.isFinite(catalog.msrp) ? catalog.msrp : 0;
  const primaryBarcode = String(catalog.primaryBarcode || catalog.primaryUpc || "").trim();
  const barcodesRaw = Array.isArray(catalog.barcodes)
    ? catalog.barcodes
    : Array.isArray(catalog.allUpcs)
      ? catalog.allUpcs
      : (primaryBarcode ? [primaryBarcode] : []);
  const barcodes = barcodesRaw
    .map((b) => (b == null ? "" : String(b).trim()))
    .filter(Boolean);
  const imageUrl = String(catalog.image_url || catalog.imageUrl || "").trim();
  const vendorPartId = String(catalog.vendorPartId || catalog.id || catalog.item_id || "").trim();

  const vendorID = vendorCatalogID || "";
  const nowMs = Date.now();

  const item = {
    id,
    catalogName,
    vendorPartId,
    primaryBarcode,
    barcodes,
    brand,
    image_url: imageUrl,
    cost: costCents,
    msrp: msrpCents,
    vendorId: vendorID,
    category: "Item",
    alternateVendors,
    quickButtonLabel: "",
    price: msrpCents,
    salePrice: 0,
    minutes: 0,
    customPart: false,
    customLabor: false,
    receiptNoteRequired: false,
    vendorName: "",
    formalName: catalogName,
    createdFromVendor: vendorID,
    createdMillis: nowMs,
    createdByUserID: uid,
    priceNotSet: msrpCents === 0,
  };
  return item;
}

// Probe every non-primary vendor catalog for a hit on the given primaryBarcode.
// Returns thin pointer rows [{ vendorId, vendorPartId }] for inventory's
// alternateVendors field. Catches per-vendor errors so a transient failure on
// one catalog doesn't poison the whole inventory-create.
async function probeAlternateVendors(catalogDB, primaryBarcode, primaryVendorID) {
  if (!primaryBarcode) return [];
  const others = KNOWN_VENDOR_CATALOG_IDS.filter((v) => v !== primaryVendorID);
  if (others.length === 0) return [];
  const probes = await Promise.all(
    others.map(async (otherID) => {
      try {
        const snap = await catalogDB
          .collection(`vendor_catalogs/${otherID}/items_by_id`)
          .where("barcodes", "array-contains", primaryBarcode)
          .limit(1)
          .get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        const d = doc.data() || {};
        return {
          vendorId: otherID,
          vendorPartId: String(d.vendorPartId || doc.id || "").trim(),
        };
      } catch (err) {
        logger.warn("Alternate vendor probe failed", {
          vendorCatalogID: otherID,
          primaryBarcode,
          message: err && err.message,
        });
        return null;
      }
    })
  );
  return probes.filter(Boolean);
}

// ────────────────────────────────────────────────────────────────────
// addJBIItemToVendorOrder
//
// NAME IS HISTORICAL — this callable serves every vendor the Chrome extension
// supports. The "JBI" suffix is preserved to avoid breaking already-deployed
// extension installs that hardcode the URL. The extension passes
// `vendorCatalogID` ("jbi", "qbp", …) in the payload; the callable resolves
// the catalog snapshot from
// `vendor_catalogs/<vendorCatalogID>/items_by_id/<id>` on cadence-pos
// Firestore. When no `vendorCatalogID` arrives we default to "jbi" for
// backward compatibility with the v0.1.0 extension.
//
// Catalog-driven inventory auto-create goes through
// buildInventoryItemFromCatalog against the canonical catalog snapshot. The
// builder is vendor-agnostic - the vendor-catalog master jobs flatten
// vendor-specific shapes into one {vendorId, vendorPartId, catalogName,
// brand, cost, msrp, primaryBarcode, barcodes, image_url, category} envelope
// at write time. For unmapped vendors we still write the order line with the
// scraped page cost; auto-create kicks in once the vendor's catalog gets
// imported.
//
// PAYLOAD:
//   { project, idToken?, tenantID, storeID, vendorCatalogID?, vendorItemID,
//     qty, cost, warehouseCode, warehouseQty }
// RETURN:
//   { success: true,  itemID, orderID, matched, itemName, createdInventoryItemID,
//                     merged, qty }
//     merged=true means an existing line with the same vendorCatalogID +
//     vendorItemID had its qty bumped instead of a duplicate row being
//     inserted; itemID then points at the existing doc and qty is the
//     post-merge total. matched/itemName/createdInventoryItemID retain their
//     original semantics regardless of merge.
//   { success: false, reason: "no_active_order" | "active_order_missing" }
// ────────────────────────────────────────────────────────────────────

exports.addJBIItemToVendorOrder = onCall(COMMON_OPTS, async (request) => {
  const data = request.data || {};
  const { storeID, vendorItemID, qty, cost, warehouseCode, warehouseQty, vendorURL, vendorItemName } = data;
  // Default to "jbi" so v0.1.0 extensions (which didn't send vendorCatalogID)
  // keep working unchanged.
  const vendorCatalogID = String(data.vendorCatalogID || "jbi").toLowerCase();
  const vendorURLStr = vendorURL ? String(vendorURL) : "";
  const vendorItemNameStr = vendorItemName ? String(vendorItemName).trim() : "";

  if (!storeID || !vendorItemID) {
    throw new HttpsError(
      "invalid-argument",
      "storeID and vendorItemID are required."
    );
  }
  const qtyNum = Number(qty);
  if (!Number.isFinite(qtyNum) || qtyNum < 1) {
    throw new HttpsError("invalid-argument", "qty must be a positive number.");
  }

  const { uid, firestore } = await resolveCaller(request, data);
  const { tenantID } = data;

  const settingsPath = `tenants/${tenantID}/stores/${storeID}/settings/settings`;
  const settingsSnap = await firestore.doc(settingsPath).get();
  if (!settingsSnap.exists) {
    throw new HttpsError("not-found", `Settings doc not found at ${settingsPath}.`);
  }
  const settings = settingsSnap.data() || {};
  const activeOrderID = settings.activeVendorOrderID;
  if (!activeOrderID) {
    return { success: false, reason: "no_active_order" };
  }

  const orderPath = `tenants/${tenantID}/stores/${storeID}/vendor-orders/${activeOrderID}`;
  const orderSnap = await firestore.doc(orderPath).get();
  if (!orderSnap.exists) {
    return { success: false, reason: "active_order_missing", orderID: activeOrderID };
  }

  // Vendor catalogs live on cadence-pos Firestore (default app regardless of
  // caller). Returns null for vendors whose catalog hasn't been imported yet —
  // the line still gets written with the scraped page cost.
  let catalogSnapshot = null;
  try {
    const catalogDB = getFirestore();
    const itemSnap = await catalogDB
      .doc(`vendor_catalogs/${vendorCatalogID}/items_by_id/${vendorItemID}`)
      .get();
    catalogSnapshot = itemSnap.exists ? itemSnap.data() : null;
  } catch (err) {
    logger.warn("Vendor catalog lookup failed", {
      vendorCatalogID,
      vendorItemID,
      message: err && err.message,
    });
  }

  // Auto-create inventory item when the UPC isn't already in this store's
  // catalog. Lookup mirrors OrderingModalScreen.localMatch (primaryBarcode
  // OR barcodes-array) so two add paths agree on what counts as "matched".
  // Race window: two rapid clicks on the same UPC can both miss and create
  // duplicates - rare in practice; promote to a transaction if it bites.
  //
  // catalogSnapshot is the canonical shape from the master jobs:
  //   primaryBarcode (was primaryUpc), barcodes (was allUpcs), catalogName
  //   (was name), image_url (was imageUrl). Fall back to legacy field names
  //   only for snapshots captured before the 2026-06 mapper rewrite.
  let createdInventoryItemID = null;
  const catalogPrimary = catalogSnapshot
    ? String(catalogSnapshot.primaryBarcode || catalogSnapshot.primaryUpc || "")
    : "";
  if (catalogPrimary) {
    const upc = catalogPrimary;
    const inventoryPath = `tenants/${tenantID}/stores/${storeID}/inventory`;
    const catalogDB = getFirestore();
    const [primarySnap, arraySnap, alternateVendors] = await Promise.all([
      firestore
        .collection(inventoryPath)
        .where("primaryBarcode", "==", upc)
        .limit(1)
        .get(),
      firestore
        .collection(inventoryPath)
        .where("barcodes", "array-contains", upc)
        .limit(1)
        .get(),
      probeAlternateVendors(catalogDB, upc, vendorCatalogID),
    ]);
    if (primarySnap.empty && arraySnap.empty) {
      // Firestore auto-id so doc key matches the body's `id` field — same
      // convention as POS-created items.
      const newId = firestore.collection(inventoryPath).doc().id;
      const newInvItem = buildInventoryItemFromCatalog(
        catalogSnapshot,
        newId,
        uid,
        vendorCatalogID,
        alternateVendors,
      );
      if (newInvItem) {
        await firestore.doc(`${inventoryPath}/${newId}`).set(newInvItem);
        createdInventoryItemID = newId;
      }
    } else if (vendorURLStr) {
      // Opportunistic backfill: stamp vendorURL onto an existing inventory
      // item that doesn't have one yet, so the side panel's clickable name
      // works even for items added before vendorURL existed.
      const existingInvDoc = !primarySnap.empty ? primarySnap.docs[0] : arraySnap.docs[0];
      const existingInv = existingInvDoc.data() || {};
      if (!existingInv.vendorURL) {
        await existingInvDoc.ref.update({
          vendorURL: vendorURLStr,
          lastModifiedMillis: Date.now(),
          lastModifiedByUserID: uid,
        });
      }
    }
  }

  // Merge into an existing line when the same vendor + part is already on the
  // order. Avoids the "duplicate row" UX issue where a user clicks Add twice
  // (or AJAX-injected listings let them click the same part from two pages)
  // and ends up with two rows that the side panel + invoice can't easily
  // reconcile. Match key is (vendorCatalogID, vendorItemID) — same shape the
  // in-app OrderingModalScreen uses when it dedupes incoming scans.
  //
  // We do NOT rewrite catalogSnapshot, sourceCost, or warehouse info on
  // merge: the existing row's stored cost is what was quoted when the user
  // first committed to this line, and silently mutating it would break the
  // "items on this order keep the cost they were added with" contract.
  const itemsCollection = firestore.collection(`${orderPath}/items`);
  const existingSnap = await itemsCollection
    .where("vendorCatalogID", "==", vendorCatalogID)
    .where("vendorItemID", "==", String(vendorItemID))
    .limit(1)
    .get();

  const nowMs = Date.now();

  if (!existingSnap.empty) {
    const existingDoc = existingSnap.docs[0];
    const existing = existingDoc.data() || {};
    const mergedQty = Number(existing.qty || 0) + qtyNum;
    await existingDoc.ref.update({
      qty: mergedQty,
      lastModifiedMillis: nowMs,
      lastModifiedByUserID: uid,
    });
    await firestore.doc(orderPath).update({
      lastModifiedMillis: nowMs,
      lastModifiedByUserID: uid,
    });
    const existingSnapshot = existing.catalogSnapshot || catalogSnapshot || {};
    const itemName = String(
      existingSnapshot.catalogName || existingSnapshot.name || "",
    );
    return {
      success: true,
      itemID: existingDoc.id,
      orderID: activeOrderID,
      matched: !!(existing.catalogSnapshot || catalogSnapshot),
      itemName,
      createdInventoryItemID,
      merged: true,
      qty: mergedQty,
    };
  }

  const itemID = crypto.randomUUID();
  const itemDoc = {
    id: itemID,
    scannedBarcode:
      (catalogSnapshot &&
        (catalogSnapshot.primaryBarcode || catalogSnapshot.primaryUpc)) ||
      "",
    qty: qtyNum,
    addedMillis: nowMs,
    addedByUserID: uid,
    lookupStatus: catalogSnapshot ? "matched" : "no_match",
    vendorCatalogID,
    candidateVendorIDs: [],
    vendorItemID: String(vendorItemID),
    catalogSnapshot: catalogSnapshot || null,
    notes: "",
    customerName: "",
    workorderID: "",
    sourcedFromExtension: true,
    sourceCost: cost != null ? String(cost) : "",
    warehouseCode: warehouseCode || "",
    warehouseQty: warehouseQty != null ? Number(warehouseQty) : null,
    vendorURL: vendorURLStr,
    vendorItemName: vendorItemNameStr,
  };

  await firestore.doc(`${orderPath}/items/${itemID}`).set(itemDoc);
  await firestore.doc(orderPath).update({
    lastModifiedMillis: nowMs,
    lastModifiedByUserID: uid,
  });

  const itemName =
    (catalogSnapshot &&
      String(catalogSnapshot.catalogName || catalogSnapshot.name || "")) ||
    "";

  return {
    success: true,
    itemID,
    orderID: activeOrderID,
    matched: !!catalogSnapshot,
    itemName,
    createdInventoryItemID,
    merged: false,
    qty: qtyNum,
  };
});

// ────────────────────────────────────────────────────────────────────
// listVendorOrdersCallable
//
// PAYLOAD:
//   { project, idToken?, tenantID, storeID }
// RETURN:
//   {
//     success: true,
//     activeOrderID: string | null,
//     orders: [{ id, name, lastModifiedMillis, createdMillis, status }]
//   }
// ────────────────────────────────────────────────────────────────────

exports.listVendorOrdersCallable = onCall(COMMON_OPTS, async (request) => {
  const data = request.data || {};
  const { storeID } = data;
  if (!storeID) throw new HttpsError("invalid-argument", "storeID is required.");

  const { firestore } = await resolveCaller(request, data);
  const { tenantID } = data;

  const settingsPath = `tenants/${tenantID}/stores/${storeID}/settings/settings`;
  const settingsSnap = await firestore.doc(settingsPath).get();
  const activeOrderID =
    (settingsSnap.exists && settingsSnap.data() && settingsSnap.data().activeVendorOrderID) ||
    null;

  const ordersPath = `tenants/${tenantID}/stores/${storeID}/vendor-orders`;
  const ordersSnap = await firestore
    .collection(ordersPath)
    .where("status", "==", "open")
    .get();

  const orders = ordersSnap.docs
    .map((d) => {
      const o = d.data() || {};
      return {
        id: o.id || d.id,
        name: o.name || "(unnamed)",
        lastModifiedMillis: Number(o.lastModifiedMillis || o.createdMillis || 0),
        createdMillis: Number(o.createdMillis || 0),
        status: o.status || "open",
      };
    })
    .sort((a, b) => b.lastModifiedMillis - a.lastModifiedMillis);

  return { success: true, activeOrderID, orders };
});

// ────────────────────────────────────────────────────────────────────
// getVendorOrderCallable
//
// PAYLOAD:
//   { project, idToken?, tenantID, storeID, orderID? }
//   orderID is OPTIONAL — when omitted, the callable resolves the active
//   order from settings.activeVendorOrderID. The extension's side panel
//   relies on this fallback so it doesn't have to round-trip listOrders
//   first just to learn the active ID.
// RETURN:
//   { success: true, order, items, activeOrderID }
//   { success: false, reason: "no_active_order" }      — no orderID + nothing in settings
//   { success: false, reason: "active_order_missing" } — settings pointed at a deleted order
//   { success: false, reason: "not_found" }            — explicit orderID didn't resolve
// ────────────────────────────────────────────────────────────────────

exports.getVendorOrderCallable = onCall(COMMON_OPTS, async (request) => {
  const data = request.data || {};
  const { storeID } = data;
  if (!storeID) {
    throw new HttpsError("invalid-argument", "storeID is required.");
  }

  const { firestore } = await resolveCaller(request, data);
  const { tenantID } = data;

  const settingsPath = `tenants/${tenantID}/stores/${storeID}/settings/settings`;
  const settingsSnap = await firestore.doc(settingsPath).get();
  const activeOrderID =
    (settingsSnap.exists && settingsSnap.data() && settingsSnap.data().activeVendorOrderID) ||
    null;

  // Caller-supplied orderID wins; otherwise fall back to the active order.
  // Distinguish the two miss-paths so the client can tailor copy:
  //   - no_active_order:      user has never picked one
  //   - active_order_missing: pointer is set but the doc was deleted
  const orderID = data.orderID || activeOrderID;
  if (!orderID) {
    return { success: false, reason: "no_active_order", activeOrderID: null };
  }

  const orderPath = `tenants/${tenantID}/stores/${storeID}/vendor-orders/${orderID}`;
  const orderSnap = await firestore.doc(orderPath).get();
  if (!orderSnap.exists) {
    const reason =
      orderID === activeOrderID && !data.orderID
        ? "active_order_missing"
        : "not_found";
    return { success: false, reason, activeOrderID };
  }

  const itemsSnap = await firestore.collection(`${orderPath}/items`).get();
  const items = itemsSnap.docs
    .map((d) => d.data() || {})
    .sort((a, b) => Number(b.addedMillis || 0) - Number(a.addedMillis || 0));

  // Inventory enrichment so the extension panel mirrors what the in-app
  // OrderingModalScreen displays. The in-app screen does a client-side
  // `localMatch` by scannedBarcode against the inventory Zustand store
  // (formalName/informalName, cost, price, msrp) — we recreate that here for
  // the extension since it has no access to that store.
  const barcodes = Array.from(
    new Set(items.map((it) => it.scannedBarcode).filter(Boolean))
  );
  const inventoryByBarcode = {};
  if (barcodes.length) {
    const inventoryPath = `tenants/${tenantID}/stores/${storeID}/inventory`;
    const chunks = [];
    for (let i = 0; i < barcodes.length; i += 30) {
      chunks.push(barcodes.slice(i, i + 30));
    }
    for (const chunk of chunks) {
      const [primarySnap, arraySnap] = await Promise.all([
        firestore
          .collection(inventoryPath)
          .where("primaryBarcode", "in", chunk)
          .get(),
        firestore
          .collection(inventoryPath)
          .where("barcodes", "array-contains-any", chunk)
          .get(),
      ]);
      for (const d of primarySnap.docs) {
        const inv = d.data() || {};
        if (inv.primaryBarcode && !inventoryByBarcode[inv.primaryBarcode]) {
          inventoryByBarcode[inv.primaryBarcode] = inv;
        }
      }
      for (const d of arraySnap.docs) {
        const inv = d.data() || {};
        const arr = Array.isArray(inv.barcodes) ? inv.barcodes : [];
        for (const c of arr) {
          if (chunk.includes(c) && !inventoryByBarcode[c]) {
            inventoryByBarcode[c] = inv;
          }
        }
      }
    }
  }

  // Resolve display fields using the same precedence as the in-app screen.
  // catalogName and formalName fall back to each other so we display
  // correctly across both pre- and post-canonical-rewrite inventory items.
  //   name  = inventory.catalogName || inventory.formalName
  //         || inventory.informalName
  //         || catalogSnapshot.catalogName || catalogSnapshot.name (legacy)
  //         || scannedBarcode || vendorItemID || "(unknown)"
  //   cost  = catalogSnapshot.cost ?? inventory.cost     (both cents)
  //   price = inventory.price                            (cents)
  //   msrp  = inventory.msrp                             (cents)
  const toNumOrNull = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // Optional page-cost map from the extension content script:
  //   { [vendorItemID]: { costDollars, warehouseCode } }
  // Drives the cost-reconciliation badge in the side panel — we compare the
  // page price against the inventory item's stored cost and surface a diff.
  // Page costs are dollars (e.g., 6.99); inventory cost is cents (699).
  const pageCosts = (data && data.pageCosts) || {};

  const enrichedItems = items.map((it) => {
    const snap = it.catalogSnapshot || {};
    const inv = it.scannedBarcode ? inventoryByBarcode[it.scannedBarcode] : null;
    const catalogName = String(snap.catalogName || snap.name || "");
    const storeName =
      (inv && (inv.catalogName || inv.formalName)) || "";
    // vendorItemName falls in just before the part-number bottom — for vendors
    // whose catalog isn't imported (QBP today), the extension scrapes the
    // product name off the vendor page and stamps it on the line item so the
    // side panel shows something readable instead of the SKU.
    const displayName =
      storeName ||
      catalogName ||
      (it.vendorItemName && String(it.vendorItemName).trim()) ||
      it.scannedBarcode ||
      it.vendorItemID ||
      "(unknown)";
    const inventoryCostCents = toNumOrNull(inv && inv.cost);
    // sourceCost is the scraped page price (dollars as a string, e.g. "12.50")
    // captured at add-time. Acts as the final cost fallback when neither
    // catalog snapshot nor inventory has a cost — again, QBP today.
    const sourceCostDollars = Number(it.sourceCost);
    const sourceCostCents =
      Number.isFinite(sourceCostDollars) && sourceCostDollars > 0
        ? Math.round(sourceCostDollars * 100)
        : null;
    const costCents =
      toNumOrNull(snap.cost) ?? inventoryCostCents ?? sourceCostCents;
    const priceCents = toNumOrNull(inv && inv.price);
    const msrpCents = toNumOrNull(inv && inv.msrp);

    // Cost reconciliation. Only meaningful when:
    //   - the extension scraped a page cost for this part number
    //   - we resolved an inventory item (so we have something to update)
    //   - the two costs actually differ
    // pageCost arrives as dollars; round to cents for an apples-to-apples
    // compare. Any non-zero diff (higher OR lower) is surfaced.
    const pageEntry = pageCosts[it.vendorItemID] || null;
    const pageCostDollars = pageEntry ? Number(pageEntry.costDollars) : NaN;
    const pageCostCents = Number.isFinite(pageCostDollars) && pageCostDollars > 0
      ? Math.round(pageCostDollars * 100)
      : null;
    const pageWarehouseCode = (pageEntry && pageEntry.warehouseCode) || "";
    const hasCostDiff =
      pageCostCents != null &&
      inventoryCostCents != null &&
      pageCostCents !== inventoryCostCents;

    return {
      ...it,
      _display: {
        name: displayName,
        catalogName,
        storeName,
        costCents,
        priceCents,
        msrpCents,
        inventoryItemID: (inv && inv.id) || null,
        inventoryCostCents,
        pageCostCents,
        pageWarehouseCode,
        hasCostDiff,
        vendorURL: (inv && inv.vendorURL) || it.vendorURL || "",
      },
    };
  });

  return {
    success: true,
    order: orderSnap.data() || {},
    items: enrichedItems,
    activeOrderID,
  };
});

// ────────────────────────────────────────────────────────────────────
// setActiveVendorOrderCallable
//
// PAYLOAD:
//   { project, idToken?, tenantID, storeID, orderID }
//   Pass orderID = null/empty string to clear the active order.
// RETURN:
//   { success: true, activeOrderID }
// ────────────────────────────────────────────────────────────────────

exports.setActiveVendorOrderCallable = onCall(COMMON_OPTS, async (request) => {
  const data = request.data || {};
  const { storeID, orderID } = data;
  if (!storeID) throw new HttpsError("invalid-argument", "storeID is required.");

  const { firestore, uid } = await resolveCaller(request, data);
  const { tenantID } = data;

  // Verify the order exists (or is being cleared).
  if (orderID) {
    const orderSnap = await firestore
      .doc(`tenants/${tenantID}/stores/${storeID}/vendor-orders/${orderID}`)
      .get();
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", `Order ${orderID} does not exist.`);
    }
  }

  const settingsPath = `tenants/${tenantID}/stores/${storeID}/settings/settings`;
  await firestore.doc(settingsPath).set(
    {
      activeVendorOrderID: orderID || "",
      activeVendorOrderUpdatedAt: Date.now(),
      activeVendorOrderUpdatedBy: uid,
    },
    { merge: true }
  );

  return { success: true, activeOrderID: orderID || "" };
});

// ────────────────────────────────────────────────────────────────────
// applyInventoryCostFromExtensionCallable
//
// Updates a single inventory item's `cost` (in cents) when the user clicks
// the Apply button on a diff-flagged row in the side panel. Stamps a
// breadcrumb (`costLastUpdatedSource: "jbi-extension"`) so this update is
// distinguishable from in-app edits later.
//
// PAYLOAD:
//   { project, idToken?, tenantID, storeID, inventoryItemID, newCostCents }
// RETURN:
//   { success: true,  inventoryItemID, oldCostCents, newCostCents }
//   { success: false, reason: "not_found" }
// ────────────────────────────────────────────────────────────────────

exports.applyInventoryCostFromExtensionCallable = onCall(
  COMMON_OPTS,
  async (request) => {
    const data = request.data || {};
    const { storeID, inventoryItemID, newCostCents } = data;
    if (!storeID || !inventoryItemID) {
      throw new HttpsError(
        "invalid-argument",
        "storeID and inventoryItemID are required."
      );
    }
    const costNum = Number(newCostCents);
    if (!Number.isFinite(costNum) || costNum < 0) {
      throw new HttpsError(
        "invalid-argument",
        "newCostCents must be a non-negative number."
      );
    }

    const { uid, firestore } = await resolveCaller(request, data);
    const { tenantID } = data;

    const invPath = `tenants/${tenantID}/stores/${storeID}/inventory/${inventoryItemID}`;
    const invSnap = await firestore.doc(invPath).get();
    if (!invSnap.exists) {
      return { success: false, reason: "not_found" };
    }
    const prev = invSnap.data() || {};
    const oldCostCents = Number(prev.cost) || 0;
    const roundedNewCost = Math.round(costNum);

    await firestore.doc(invPath).update({
      cost: roundedNewCost,
      lastModifiedMillis: Date.now(),
      lastModifiedByUserID: uid,
      costLastUpdatedSource: "jbi-extension",
    });

    return {
      success: true,
      inventoryItemID,
      oldCostCents,
      newCostCents: roundedNewCost,
    };
  }
);

// ────────────────────────────────────────────────────────────────────
// setVendorOrderItemQtyCallable
//
// Updates the qty on a single line item of the active vendor order. Used by
// the Chrome extension side panel's per-row up/down adjusters. The panel
// clamps to qty >= 1 (deletion stays an in-app action), but we re-validate
// server-side so a tampered client can't write 0/negative qty.
//
// PAYLOAD:
//   { project, idToken?, tenantID, storeID, itemID, qty, orderID? }
//   orderID is OPTIONAL — when omitted, the callable resolves the active
//   order from settings.activeVendorOrderID (same fallback as
//   getVendorOrderCallable).
// RETURN:
//   { success: true,  itemID, qty }
//   { success: false, reason: "no_active_order" | "active_order_missing" | "item_not_found" }
// ────────────────────────────────────────────────────────────────────

exports.setVendorOrderItemQtyCallable = onCall(COMMON_OPTS, async (request) => {
  const data = request.data || {};
  const { storeID, itemID } = data;
  if (!storeID || !itemID) {
    throw new HttpsError(
      "invalid-argument",
      "storeID and itemID are required."
    );
  }
  const qtyNum = Number(data.qty);
  if (!Number.isFinite(qtyNum) || qtyNum < 1) {
    throw new HttpsError("invalid-argument", "qty must be a positive number.");
  }
  const qtyInt = Math.floor(qtyNum);

  const { uid, firestore } = await resolveCaller(request, data);
  const { tenantID } = data;

  // Resolve the order. Caller-supplied orderID wins; else fall back to the
  // active order so the side panel doesn't have to send it explicitly.
  let orderID = data.orderID || "";
  if (!orderID) {
    const settingsPath = `tenants/${tenantID}/stores/${storeID}/settings/settings`;
    const settingsSnap = await firestore.doc(settingsPath).get();
    orderID =
      (settingsSnap.exists &&
        settingsSnap.data() &&
        settingsSnap.data().activeVendorOrderID) ||
      "";
    if (!orderID) {
      return { success: false, reason: "no_active_order" };
    }
  }

  const orderPath = `tenants/${tenantID}/stores/${storeID}/vendor-orders/${orderID}`;
  const orderSnap = await firestore.doc(orderPath).get();
  if (!orderSnap.exists) {
    return { success: false, reason: "active_order_missing", orderID };
  }

  const itemPath = `${orderPath}/items/${itemID}`;
  const itemSnap = await firestore.doc(itemPath).get();
  if (!itemSnap.exists) {
    return { success: false, reason: "item_not_found", itemID };
  }

  const nowMs = Date.now();
  await firestore.doc(itemPath).update({
    qty: qtyInt,
    lastModifiedMillis: nowMs,
    lastModifiedByUserID: uid,
  });
  await firestore.doc(orderPath).update({
    lastModifiedMillis: nowMs,
    lastModifiedByUserID: uid,
  });

  return { success: true, itemID, qty: qtyInt };
});

// ────────────────────────────────────────────────────────────────────
// deleteVendorOrderItemCallable
//
// Removes one line item from the active vendor order. Used by the Chrome
// extension side panel's per-row trash button. Mirrors setVendorOrderItemQty
// (active-order fallback, missing-doc handling) but deletes the doc instead
// of updating its qty.
//
// PAYLOAD:
//   { project, idToken?, tenantID, storeID, itemID, orderID? }
// RETURN:
//   { success: true,  itemID }
//   { success: false, reason: "no_active_order" | "active_order_missing" | "item_not_found" }
// ────────────────────────────────────────────────────────────────────

exports.deleteVendorOrderItemCallable = onCall(COMMON_OPTS, async (request) => {
  const data = request.data || {};
  const { storeID, itemID } = data;
  if (!storeID || !itemID) {
    throw new HttpsError(
      "invalid-argument",
      "storeID and itemID are required."
    );
  }

  const { uid, firestore } = await resolveCaller(request, data);
  const { tenantID } = data;

  let orderID = data.orderID || "";
  if (!orderID) {
    const settingsPath = `tenants/${tenantID}/stores/${storeID}/settings/settings`;
    const settingsSnap = await firestore.doc(settingsPath).get();
    orderID =
      (settingsSnap.exists &&
        settingsSnap.data() &&
        settingsSnap.data().activeVendorOrderID) ||
      "";
    if (!orderID) {
      return { success: false, reason: "no_active_order" };
    }
  }

  const orderPath = `tenants/${tenantID}/stores/${storeID}/vendor-orders/${orderID}`;
  const orderSnap = await firestore.doc(orderPath).get();
  if (!orderSnap.exists) {
    return { success: false, reason: "active_order_missing", orderID };
  }

  const itemPath = `${orderPath}/items/${itemID}`;
  const itemSnap = await firestore.doc(itemPath).get();
  if (!itemSnap.exists) {
    return { success: false, reason: "item_not_found", itemID };
  }

  const nowMs = Date.now();
  await firestore.doc(itemPath).delete();
  await firestore.doc(orderPath).update({
    lastModifiedMillis: nowMs,
    lastModifiedByUserID: uid,
  });

  return { success: true, itemID };
});

// Deploy:
// firebase deploy \
//   --only functions:addJBIItemToVendorOrder,functions:listVendorOrdersCallable,functions:getVendorOrderCallable,functions:setActiveVendorOrderCallable,functions:applyInventoryCostFromExtensionCallable,functions:setVendorOrderItemQtyCallable,functions:deleteVendorOrderItemCallable \
//   --project=cadence-pos --account=fritz@retailsoftsystems.com
