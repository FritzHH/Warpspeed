/* eslint-disable */
/**
 * Quick single-export: downloads only workorderStatuses.csv from Lightspeed.
 * Run: cd scripts && node lightspeed-download-statuses.js
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const CONFIG = {
  tenantID: process.env.TENANT_ID || "",
  storeID: process.env.STORE_ID || "",
  lightspeedClientID: process.env.LIGHTSPEED_CLIENT_ID || "",
  lightspeedClientSecret: process.env.LIGHTSPEED_CLIENT_SECRET || "",
  serviceAccountPath: path.resolve(__dirname, "serviceAccountKey.json"),
  databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com",
  csvDir: path.resolve(__dirname, "csv"),
  API_BASE: "https://api.lightspeedapp.com/API/V3/Account",
  TOKEN_URL: "https://cloud.lightspeedapp.com/auth/oauth/token",
};

// Firebase init
const sa = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: CONFIG.databaseURL });
const db = admin.firestore();

function ts() { return new Date().toLocaleTimeString("en-US", { hour12: false }); }

async function getAccessToken() {
  var docRef = db.doc("tenants/" + CONFIG.tenantID + "/stores/" + CONFIG.storeID + "/integrations/lightspeed");
  var doc = await docRef.get();
  if (!doc.exists) throw new Error("No Lightspeed integration found.");
  var data = doc.data();
  if (Date.now() >= data.expiresAt - 60000) {
    console.log("[" + ts() + "] Refreshing token...");
    var res = await fetch(CONFIG.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: data.refreshToken,
        client_id: CONFIG.lightspeedClientID,
        client_secret: CONFIG.lightspeedClientSecret,
      }).toString(),
    });
    if (!res.ok) throw new Error("Token refresh failed: " + (await res.text()));
    var tokens = await res.json();
    var updated = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || data.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };
    await docRef.update(updated);
    return { accessToken: updated.accessToken, accountID: data.accountID };
  }
  return { accessToken: data.accessToken, accountID: data.accountID };
}

async function lsGet(accessToken, url) {
  var res = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
  if (res.status === 429) {
    console.log("[" + ts() + "] Rate limited. Waiting 10s...");
    await new Promise(function (r) { setTimeout(r, 10000); });
    res = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
  }
  if (!res.ok) throw new Error("Lightspeed API " + res.status + ": " + (await res.text()));
  return await res.json();
}

function escapeCSV(val) {
  var s = String(val == null ? "" : val);
  if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

(async function main() {
  console.log("[" + ts() + "] Downloading WorkorderStatus from Lightspeed...\n");

  var { accessToken, accountID } = await getAccessToken();
  var url = CONFIG.API_BASE + "/" + accountID + "/WorkorderStatus.json";
  var data = await lsGet(accessToken, url);

  // Lightspeed wraps single results differently than arrays
  var statuses = data.WorkorderStatus;
  if (!Array.isArray(statuses)) statuses = statuses ? [statuses] : [];

  console.log("[" + ts() + "] Fetched " + statuses.length + " statuses");

  var headers = ["workorderStatusID", "name", "sortOrder", "htmlColor", "systemValue"];
  var lines = [headers.join(",")];
  for (var s of statuses) {
    lines.push([
      escapeCSV(s.workorderStatusID),
      escapeCSV(s.name || ""),
      escapeCSV(s.sortOrder || ""),
      escapeCSV(s.htmlColor || ""),
      escapeCSV(s.systemValue || ""),
    ].join(","));
  }

  if (!fs.existsSync(CONFIG.csvDir)) fs.mkdirSync(CONFIG.csvDir, { recursive: true });
  var filePath = path.join(CONFIG.csvDir, "workorderStatuses.csv");
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");

  console.log("[" + ts() + "] Saved " + filePath);
  console.log("\n  Statuses:");
  for (var s of statuses) {
    console.log("    " + (s.name || "(unnamed)").padEnd(30) + " " + (s.htmlColor || "(no color)"));
  }

  console.log("\nDone.");
  process.exit(0);
})();
