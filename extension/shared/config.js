// Cadence Extension config (cross-browser).
//
// Pick the project this extension signs into. While Bonita is the only live
// tenant, leave this set to "warpspeed-bonitabikes". After the Bonita ->
// cadence-pos migration, flip to "cadence-pos" (or build a project picker UI).
//
// Firebase web config values are PUBLIC (they ship in the client app already).
// Security lives in Auth + Firestore rules + the callable's auth guards.

export const ACTIVE_PROJECT = "warpspeed-bonitabikes";

export const PROJECT_CONFIGS = {
  "warpspeed-bonitabikes": {
    // From .env.bonita — public values that ship in the client bundle already.
    apiKey: "AIzaSyCUjRH7Yi9fNNDAUTyYzD-P-tUGGMvfPPM",
    authDomain: "warpspeed-bonitabikes.firebaseapp.com",
    projectId: "warpspeed-bonitabikes",
    // Where "Edit in Cadence" should open. Bonita users still use their own
    // POS URL here.
    appUrl: "https://warpspeed-bonitabikes.web.app",
  },
  "cadence-pos": {
    apiKey: "AIzaSyAkWNO6Gc8JZroxcsDQwpPVXE5RS9YbDuk",
    authDomain: "cadence-pos.firebaseapp.com",
    projectId: "cadence-pos",
    appUrl: "https://cadence-pos.web.app",
  },
};

// All callables live on cadence-pos. Bonita users still hit this base URL;
// each callable verifies their Bonita ID token via its second admin app.
export const CALLABLE_BASE_URL =
  "https://us-central1-cadence-pos.cloudfunctions.net";

// addItem URL keeps its "JBI" name for backward compat with v0.1.0 installs;
// the callable itself accepts vendorCatalogID in the payload ("jbi", "qbp", …)
// and looks up the catalog at vendor_catalogs/<vendorCatalogID>/items/<id>.
export const CALLABLES = {
  addItem: `${CALLABLE_BASE_URL}/addJBIItemToVendorOrder`,
  listOrders: `${CALLABLE_BASE_URL}/listVendorOrdersCallable`,
  getOrder: `${CALLABLE_BASE_URL}/getVendorOrderCallable`,
  setActiveOrder: `${CALLABLE_BASE_URL}/setActiveVendorOrderCallable`,
  applyInventoryCost: `${CALLABLE_BASE_URL}/applyInventoryCostFromExtensionCallable`,
  setItemQty: `${CALLABLE_BASE_URL}/setVendorOrderItemQtyCallable`,
  deleteItem: `${CALLABLE_BASE_URL}/deleteVendorOrderItemCallable`,
};

// Cadence brand color for the injected button.
export const BRAND_GREEN = "#1f9d55";
