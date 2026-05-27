import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getFirestore } from "firebase/firestore";

// cadence-pos config. Firebase web config values are not secrets — the same
// values ship in the tenant app. Security is enforced by Firestore rules,
// custom claims, and callable auth guards.
const firebaseConfig = {
  apiKey: "AIzaSyAkWNO6Gc8JZroxcsDQwpPVXE5RS9YbDuk",
  authDomain: "cadence-pos.firebaseapp.com",
  projectId: "cadence-pos",
  storageBucket: "cadence-pos.firebasestorage.app",
  messagingSenderId: "76901681945",
  appId: "1:76901681945:web:971eeb4abda0adaeb15388",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const functions = getFunctions(app, "us-central1");
export const db = getFirestore(app);
