import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
} from "firebase/auth";
import { auth } from "./firebase";

// Sign in with email/password. Returns { user, claims } on success, throws on failure.
export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const tokenResult = await cred.user.getIdTokenResult(true);
  return { user: cred.user, claims: tokenResult.claims };
}

export function signOut() {
  return fbSignOut(auth);
}

// Subscribe to auth state. Callback receives { user, claims } when signed in,
// or { user: null, claims: null } when signed out. Forces a fresh ID token
// fetch so custom claims are up-to-date.
export function onAuthStateChanged(callback) {
  return fbOnAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, claims: null });
      return;
    }
    const tokenResult = await user.getIdTokenResult(true);
    callback({ user, claims: tokenResult.claims });
  });
}

export function isPlatformAdmin(claims) {
  return claims?.platformAdmin === true;
}
