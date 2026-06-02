/* eslint-disable */
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "./private_user_constants";

// initializations
export const firebaseApp = initializeApp(firebaseConfig);

// Secondary, read-only Firebase app pointed at the cadence-pos Realtime
// Database. Vendor catalogs (JBI, future locked vendors) are hosted on
// cadence-pos and shared across all tenants — Bonita reads them from there
// as if it had migrated. The database.rules.json rule for `vendor_catalogs`
// is currently `.read: true` (public) so no auth is needed on this handle.
// TODO: re-tighten before wide deployment — see TODO.md "Pre-Deployment Hardening".
//
// Cadence-pos is project `cadence-pos`. When Bonita IS cadence-pos (i.e.,
// running with VITE_FIREBASE_PROJECT_ID === "cadence-pos"), reuse the
// primary app so we don't initialize a second SDK pointed at the same DB.
const CADENCE_RTDB_URL = "https://cadence-pos-default-rtdb.firebaseio.com";
const CADENCE_PROJECT_ID = "cadence-pos";

export const cadenceCatalogApp =
  firebaseConfig.projectId === CADENCE_PROJECT_ID
    ? firebaseApp
    : initializeApp(
        { databaseURL: CADENCE_RTDB_URL, projectId: CADENCE_PROJECT_ID },
        "cadence-catalogs"
      );
