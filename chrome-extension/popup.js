// Cadence Chrome Extension — popup logic.
//
// Two views:
//   - viewSignIn: email + password → background.signIn → close
//   - viewSettings (signed in): tenantID + storeID config + signOut
//
// All real work is in background.js. The popup just collects input and
// renders status.

import { ACTIVE_PROJECT } from "./config.js";

const $ = (id) => document.getElementById(id);

function showErr(msg) {
  const box = $("errBox");
  box.textContent = msg;
  box.classList.remove("hidden");
}

function clearErr() {
  $("errBox").classList.add("hidden");
}

async function render() {
  clearErr();
  const authResp = await chrome.runtime.sendMessage({ type: "getAuth" });
  const auth = authResp && authResp.ok ? authResp.auth : null;
  if (!auth) {
    $("viewSignIn").classList.remove("hidden");
    $("viewSettings").classList.add("hidden");
    $("who").textContent = "";
    return;
  }
  $("viewSignIn").classList.add("hidden");
  $("viewSettings").classList.remove("hidden");
  $("who").textContent = auth.email;
  $("projectLabel").textContent = auth.project;

  const stored = await chrome.storage.local.get("settings");
  const settings = stored.settings || {};
  $("tenantID").value = settings.tenantID || "";
  $("storeID").value = settings.storeID || "";
}

$("signInBtn").addEventListener("click", async () => {
  clearErr();
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) {
    showErr("Enter email and password.");
    return;
  }
  $("signInBtn").disabled = true;
  $("signInBtn").textContent = "Signing in…";
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "signIn",
      email,
      password,
      project: ACTIVE_PROJECT,
    });
    if (!resp || !resp.ok) {
      showErr((resp && resp.error) || "Sign-in failed.");
    } else {
      await render();
    }
  } catch (err) {
    showErr((err && err.message) || String(err));
  } finally {
    $("signInBtn").disabled = false;
    $("signInBtn").textContent = "Sign in";
  }
});

$("saveSettingsBtn").addEventListener("click", async () => {
  clearErr();
  const tenantID = $("tenantID").value.trim();
  const storeID = $("storeID").value.trim();
  if (!tenantID || !storeID) {
    showErr("Both tenantID and storeID are required.");
    return;
  }
  await chrome.storage.local.set({ settings: { tenantID, storeID } });
  $("saveSettingsBtn").textContent = "Saved ✓";
  setTimeout(() => ($("saveSettingsBtn").textContent = "Save"), 1500);
});

$("signOutBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "signOut" });
  await render();
});

render();
