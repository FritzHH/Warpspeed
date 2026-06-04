/* eslint-disable */
// Values come from .env.bonita or .env.rss, selected by Vite's --mode flag.
// Run via the per-target scripts: yarn start, yarn build:bonita, yarn host:rss, etc.

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Cross-project handle to cadence-pos for read-only vendor catalog access.
// Tenants on other Firebase projects (e.g. Bonita's warpspeed-bonitabikes)
// still read the shared vendor catalog from cadence-pos. RTDB only needs a
// databaseURL; Firestore needs the full web config (apiKey + projectId).
// When the running project IS cadence-pos, init.js reuses the primary app.
export const cadenceCatalogConfig = {
  apiKey: import.meta.env.VITE_CADENCE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_CADENCE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_CADENCE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_CADENCE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_CADENCE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_CADENCE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_CADENCE_FIREBASE_APP_ID,
};

export const SMS_URL = import.meta.env.VITE_SMS_URL;

export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const APP_BRAND = import.meta.env.VITE_APP_BRAND || "warpspeed";
