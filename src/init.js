/* eslint-disable */
import { initializeApp } from "firebase/app";
import { firebaseConfig, cadenceCatalogConfig } from "./private_user_constants";

// initializations
export const firebaseApp = initializeApp(firebaseConfig);

// Secondary, read-only Firebase app pointed at cadence-pos. Vendor catalogs
// (JBI, QBP, future locked vendors) live on cadence-pos and are shared across
// tenants — Bonita reads them from there as if it had migrated. The full web
// config (apiKey + projectId + databaseURL) is required so both Firestore
// (items_by_id) and RTDB (inventory_by_item) SDKs can attach to this app.
// The `vendor_catalogs` rules are currently `.read: true` (public) so no auth
// is needed on this handle.
// TODO: re-tighten before wide deployment — see TODO.md "Pre-Deployment Hardening".
//
// When Bonita IS cadence-pos (running with VITE_FIREBASE_PROJECT_ID ===
// "cadence-pos"), reuse the primary app so we don't initialize a second SDK
// pointed at the same project.
const CADENCE_PROJECT_ID = "cadence-pos";

export const cadenceCatalogApp =
  firebaseConfig.projectId === CADENCE_PROJECT_ID
    ? firebaseApp
    : initializeApp(cadenceCatalogConfig, "cadence-catalogs");
