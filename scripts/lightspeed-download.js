/* eslint-disable */
/**
 * Standalone Lightspeed CSV Download Script
 *
 * Downloads all 11 CSV exports directly from Lightspeed API.
 * Logs progress to terminal AND Firestore for real-time monitoring.
 * Supports parallel downloads with rate limit awareness.
 *
 * Run: cd scripts && npm install && node lightspeed-download.js
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// ============================================================================
// CONFIG - Reads from scripts/.env (copy .env.example to .env and fill in)
// ============================================================================

const CONFIG = {
  tenantID: process.env.TENANT_ID || "",
  storeID: process.env.STORE_ID || "",
  lightspeedClientID: process.env.LIGHTSPEED_CLIENT_ID || "",
  lightspeedClientSecret: process.env.LIGHTSPEED_CLIENT_SECRET || "",

  // Firebase service account JSON
  serviceAccountPath: path.resolve(__dirname, "serviceAccountKey.json"),
  databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com",

  // Output directory for CSVs
  csvDir: path.resolve(__dirname, "csv"),

  // How many exports to run in parallel (2-3 recommended for Lightspeed rate limits)
  PARALLEL_LIMIT: 3,

  // Lightspeed API
  API_BASE: "https://api.lightspeedapp.com/API/V3/Account",
  TOKEN_URL: "https://cloud.lightspeedapp.com/auth/oauth/token",
};

// ============================================================================
// Firebase Init
// ============================================================================

let db;

function initFirebase() {
  if (!fs.existsSync(CONFIG.serviceAccountPath)) {
    console.error("\n  Service account file not found: " + CONFIG.serviceAccountPath);
    console.error("  Download from: Firebase Console -> Project Settings -> Service Accounts");
    console.error("  Save as: scripts/serviceAccountKey.json\n");
    process.exit(1);
  }
  const sa = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: CONFIG.databaseURL });
  db = admin.firestore();
}

// ============================================================================
// Logging (terminal + Firestore)
// ============================================================================

let logDocRef = null;

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

async function initLogNode() {
  logDocRef = db.doc("tenants/" + CONFIG.tenantID + "/stores/" + CONFIG.storeID + "/dev-logs/lightspeed-download");
  await logDocRef.set({ logs: [], status: "running", startedAt: Date.now() });
}

async function log(msg, type) {
  if (!type) type = "info";
  var prefix = type === "error" ? "x" : type === "success" ? "+" : "-";
  console.log("[" + ts() + "] " + prefix + " " + msg);
  if (logDocRef) {
    try {
      await logDocRef.update({
        logs: admin.firestore.FieldValue.arrayUnion({ t: Date.now(), msg: msg, type: type }),
      });
    } catch (e) { /* don't break on log failure */ }
  }
}

function logHeader(title) {
  console.log("\n[" + ts() + "] ---- " + title + " ----");
}

// ============================================================================
// Lightspeed OAuth Token Management
// ============================================================================

async function getAccessToken() {
  var docRef = db.doc("tenants/" + CONFIG.tenantID + "/stores/" + CONFIG.storeID + "/integrations/lightspeed");
  var doc = await docRef.get();
  if (!doc.exists) throw new Error("No Lightspeed integration found. Connect via Dashboard first.");

  var data = doc.data();

  // Refresh if expired (60s buffer)
  if (Date.now() >= data.expiresAt - 60000) {
    await log("Access token expired, refreshing...");
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
    await log("Token refreshed successfully", "success");
    return { accessToken: updated.accessToken, accountID: data.accountID };
  }

  return { accessToken: data.accessToken, accountID: data.accountID };
}

// ============================================================================
// Lightspeed API Client (with rate limiting + 429 retry)
// ============================================================================

async function lsGet(accessToken, url) {
  var maxRetries = 3;
  for (var attempt = 0; attempt < maxRetries; attempt++) {
    var res = await fetch(url, {
      headers: { Authorization: "Bearer " + accessToken },
    });

    // 429 Too Many Requests - back off and retry
    if (res.status === 429) {
      var wait = (attempt + 1) * 10000; // 10s, 20s, 30s
      await log("Rate limited (429). Waiting " + (wait / 1000) + "s before retry " + (attempt + 2) + "/" + maxRetries + "...", "error");
      await new Promise(function (r) { setTimeout(r, wait); });
      continue;
    }

    // Rate limit bucket handling
    var bucket = res.headers.get("x-ls-api-bucket-level");
    if (bucket) {
      var parts = bucket.split("/").map(Number);
      var ratio = parts[0] / parts[1];
      if (ratio > 0.8) {
        await new Promise(function (r) { setTimeout(r, 5000); });
      } else if (ratio > 0.7) {
        await new Promise(function (r) { setTimeout(r, 2000); });
      }
    }

    if (!res.ok) {
      var errText = await res.text();
      throw new Error("Lightspeed API " + res.status + ": " + errText);
    }

    return await res.json();
  }
  throw new Error("Lightspeed API: max retries exceeded (429)");
}

async function lsGetAll(accessToken, accountID, endpoint, params, onProgress, maxRecords) {
  if (!params) params = {};
  var allItems = [];
  var limit = maxRecords ? Math.min(maxRecords, 100) : 100;
  var key = endpoint.replace(/\?.*/g, "");
  var nextUrl = null;
  var isFirst = true;

  // Pre-flight: fetch count with limit=1 so we know the total upfront
  var knownTotal = "?";
  try {
    var countUrl = new URL(CONFIG.API_BASE + "/" + accountID + "/" + endpoint + ".json");
    Object.keys(params).forEach(function (k) { countUrl.searchParams.set(k, params[k]); });
    countUrl.searchParams.set("limit", "1");
    var countData = await lsGet(accessToken, countUrl.toString());
    var countAttrs = countData["@attributes"];
    if (countAttrs && countAttrs.count) knownTotal = countAttrs.count;
  } catch (e) {
    // Non-fatal — proceed with "?"
  }

  if (onProgress) onProgress(0, knownTotal);

  while (true) {
    var data;
    if (isFirst) {
      var url = new URL(CONFIG.API_BASE + "/" + accountID + "/" + endpoint + ".json");
      var allParams = Object.assign({}, params, { limit: limit.toString() });
      Object.keys(allParams).forEach(function (k) { url.searchParams.set(k, allParams[k]); });
      data = await lsGet(accessToken, url.toString());
      isFirst = false;
    } else {
      data = await lsGet(accessToken, nextUrl);
    }

    var items = data[key];
    if (!items) break;

    var arr = Array.isArray(items) ? items : [items];
    allItems = allItems.concat(arr);

    // In mini mode, stop after we have enough records
    if (maxRecords && allItems.length >= maxRecords) {
      allItems = allItems.slice(0, maxRecords);
      if (onProgress) onProgress(allItems.length, allItems.length);
      break;
    }

    // Use knownTotal from pre-flight, fall back to @attributes.count
    var attrs = data["@attributes"];
    if (knownTotal === "?" && attrs && attrs.count) knownTotal = attrs.count;
    if (onProgress) onProgress(allItems.length, knownTotal);

    if (!attrs || allItems.length >= parseInt(attrs.count || knownTotal)) break;
    if (attrs.next) { nextUrl = attrs.next; } else { break; }
  }

  return allItems;
}

// ============================================================================
// CSV Builder
// ============================================================================

function buildCSV(headers, rows) {
  function esc(val) {
    if (val === null || val === undefined) return '""';
    return '"' + String(val).replace(/"/g, '""') + '"';
  }
  var headerLine = headers.map(esc).join(",");
  var dataLines = rows.map(function (r) { return r.map(esc).join(","); });
  return [headerLine].concat(dataLines).join("\n");
}

// ============================================================================
// Phone Cleaner
// ============================================================================

function cleanPhone(str) {
  if (!str) return "";
  var d = str.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return d.slice(1);
  return d.length === 10 ? d : "";
}

// ============================================================================
// Export Definitions (11 CSV types)
// ============================================================================

var EXPORTS = [
  {
    name: "workorders",
    filename: "workorders.csv",
    endpoint: "Workorder",
    params: { load_relations: '["WorkorderLines","WorkorderStatus","Customer"]' },
    build: function (data) {
      var headers = ["workorderID", "customerID", "customerFirstName", "customerLastName", "serializedID", "saleID", "saleLineID", "employeeID", "statusName", "statusID", "note", "internalNote", "timeIn", "etaOut", "timeStamp", "tax", "warranty", "archived", "hookIn", "workorderLinesJSON"];
      var rows = data.map(function (wo) {
        return [
          wo.workorderID, wo.customerID,
          wo.Customer ? wo.Customer.firstName || "" : "",
          wo.Customer ? wo.Customer.lastName || "" : "",
          wo.serializedID, wo.saleID, wo.saleLineID, wo.employeeID,
          wo.WorkorderStatus ? wo.WorkorderStatus.name || "" : "", wo.workorderStatusID,
          wo.note || "", wo.internalNote || "", wo.timeIn || "", wo.etaOut || "", wo.timeStamp || "",
          wo.tax, wo.warranty, wo.archived, wo.hookIn || "",
          JSON.stringify(wo.WorkorderLines ? wo.WorkorderLines.WorkorderLine || [] : []),
        ];
      });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "workorderItems",
    filename: "workorderItems.csv",
    endpoint: "WorkorderItem",
    params: {},
    build: function (data) {
      var headers = ["workorderItemID", "workorderID", "itemID", "unitQuantity", "unitPrice", "unitCost", "note", "tax", "approved", "warranty", "isSpecialOrder", "saleLineID", "saleID", "employeeID", "discountID", "timeStamp"];
      var rows = data.map(function (wi) {
        return [
          wi.workorderItemID, wi.workorderID, wi.itemID, wi.unitQuantity, wi.unitPrice, wi.unitCost,
          wi.note || "", wi.tax, wi.approved, wi.warranty, wi.isSpecialOrder,
          wi.saleLineID, wi.saleID, wi.employeeID, wi.discountID, wi.timeStamp || "",
        ];
      });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "serialized",
    filename: "serialized.csv",
    endpoint: "Serialized",
    params: {},
    build: function (data) {
      var headers = ["serializedID", "itemID", "description", "serial", "colorName", "sizeName", "customerID", "saleLineID", "timeStamp"];
      var rows = data.map(function (s) {
        return [
          s.serializedID, s.itemID, s.description || "", s.serial || "", s.colorName || "", s.sizeName || "",
          s.customerID, s.saleLineID, s.timeStamp || "",
        ];
      });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "items",
    filename: "items.csv",
    endpoint: "Item",
    params: { load_relations: '["ItemPrices"]' },
    build: function (data) {
      var headers = ["itemID", "description", "defaultCost", "avgCost", "price", "upc", "ean", "customSku", "manufacturerSku", "categoryID", "taxClassID", "itemType", "archived", "timeStamp"];
      var rows = data.map(function (item) {
        var retailPrice = "";
        if (item.Prices && item.Prices.ItemPrice) {
          var prices = Array.isArray(item.Prices.ItemPrice) ? item.Prices.ItemPrice : [item.Prices.ItemPrice];
          for (var i = 0; i < prices.length; i++) {
            if (prices[i].useType === "Default") { retailPrice = prices[i].amount || ""; break; }
          }
        }
        return [
          item.itemID, item.description || "", item.defaultCost || "", item.avgCost || "", retailPrice,
          item.upc || "", item.ean || "", item.customSku || "", item.manufacturerSku || "",
          item.categoryID, item.taxClassID, item.itemType || "", item.archived, item.timeStamp || "",
        ];
      });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "customers",
    filename: "customers.csv",
    endpoint: "Customer",
    params: { load_relations: '["Contact"]' },
    build: function (data) {
      var headers = ["customerID", "firstName", "lastName", "title", "company", "createTime", "archived", "phone1", "phone2", "email", "address1", "address2", "city", "state", "zip"];
      var rows = data.map(function (c) {
        var phone1 = "", phone2 = "";
        var contactPhones = c.Contact && c.Contact.Phones && c.Contact.Phones.ContactPhone;
        if (contactPhones) {
          var phones = Array.isArray(contactPhones) ? contactPhones : [contactPhones];
          for (var i = 0; i < phones.length; i++) {
            var clean = cleanPhone(phones[i].number);
            if (!clean) continue;
            if (!phone1) { phone1 = clean; }
            else if (!phone2) { phone2 = clean; break; }
          }
        }
        var email = "";
        var contactEmails = c.Contact && c.Contact.Emails && c.Contact.Emails.ContactEmail;
        if (contactEmails) {
          var emails = Array.isArray(contactEmails) ? contactEmails : [contactEmails];
          if (emails.length > 0 && emails[0].address) email = emails[0].address;
        }
        var address1 = "", address2 = "", city = "", state = "", zip = "";
        var contactAddrs = c.Contact && c.Contact.Addresses && c.Contact.Addresses.ContactAddress;
        if (contactAddrs) {
          var addrs = Array.isArray(contactAddrs) ? contactAddrs : [contactAddrs];
          if (addrs.length > 0) {
            address1 = addrs[0].address1 || "";
            address2 = addrs[0].address2 || "";
            city = addrs[0].city || "";
            state = addrs[0].state || "";
            zip = addrs[0].zip || "";
          }
        }
        return [c.customerID, c.firstName || "", c.lastName || "", c.title || "", c.company || "", c.createTime || "", c.archived, phone1, phone2, email, address1, address2, city, state, zip];
      });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "sales",
    filename: "sales.csv",
    endpoint: "Sale",
    params: {},
    build: function (data) {
      var headers = ["saleID", "customerID", "employeeID", "completed", "completeTime", "createTime", "calcSubtotal", "calcTotal", "calcTax1", "calcTax2", "calcDiscount", "calcPayments", "referenceNumber", "archived", "voided"];
      var rows = data.map(function (s) {
        return [
          s.saleID, s.customerID, s.employeeID, s.completed, s.completeTime || "", s.createTime || "",
          s.calcSubtotal || "", s.calcTotal || "", s.calcTax1 || "", s.calcTax2 || "",
          s.calcDiscount || "", s.calcPayments || "", s.referenceNumber || "",
          s.archived, s.voided,
        ];
      });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "salesLines",
    filename: "salesLines.csv",
    endpoint: "SaleLine",
    params: {},
    build: function (data) {
      var headers = ["saleLineID", "saleID", "itemID", "unitQuantity", "unitPrice", "avgCost", "discountAmount", "discountPercent", "tax", "taxClassID", "note", "isWorkorder", "createTime"];
      var rows = data.map(function (sl) {
        return [
          sl.saleLineID, sl.saleID, sl.itemID, sl.unitQuantity || "", sl.unitPrice || "",
          sl.avgCost || "", sl.discountAmount || "", sl.discountPercent || "",
          sl.tax || "", sl.taxClassID || "", sl.note || "",
          sl.isWorkorder || "", sl.createTime || "",
        ];
      });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "salesPayments",
    filename: "salesPayments.csv",
    endpoint: "SalePayment",
    params: { load_relations: '["PaymentType","CCCharge"]' },
    build: function (data) {
      var headers = [
        "salePaymentID", "saleID", "amount", "tipAmount", "createTime",
        "paymentTypeName", "paymentTypeType",
        "ccChargeID", "cardType", "cardLast4", "authCode", "entryMethod",
        "archived",
      ];
      var rows = data.map(function (sp) {
        return [
          sp.salePaymentID, sp.saleID, sp.amount || "", sp.tipAmount || "", sp.createTime || "",
          sp.PaymentType ? sp.PaymentType.name || "" : "",
          sp.PaymentType ? sp.PaymentType.type || "" : "",
          sp.ccChargeID || "",
          sp.CCCharge ? sp.CCCharge.cardType || "" : "",
          sp.CCCharge ? sp.CCCharge.xnum || "" : "",
          sp.CCCharge ? sp.CCCharge.authCode || "" : "",
          sp.CCCharge ? sp.CCCharge.entryMethod || "" : "",
          sp.archived,
        ];
      });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "employees",
    filename: "employees.csv",
    endpoint: "Employee",
    params: {},
    build: function (data) {
      var headers = ["employeeID", "firstName", "lastName"];
      var rows = data.map(function (e) { return [e.employeeID, e.firstName || "", e.lastName || ""]; });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "employeeHours",
    filename: "employeeHours.csv",
    endpoint: "EmployeeHours",
    params: {},
    build: function (data) {
      var headers = ["employeeHoursID", "employeeID", "checkIn", "checkOut", "shopID"];
      var rows = data.map(function (h) {
        return [h.employeeHoursID, h.employeeID, h.checkIn || "", h.checkOut || "", h.shopID || ""];
      });
      return { headers: headers, rows: rows };
    },
  },
  {
    name: "workorderStatuses",
    filename: "workorderStatuses.csv",
    endpoint: "WorkorderStatus",
    params: {},
    build: function (data) {
      var headers = ["workorderStatusID", "name", "sortOrder", "htmlColor", "systemValue"];
      var rows = data.map(function (s) {
        return [
          s.workorderStatusID, s.name || "", s.sortOrder || "", s.htmlColor || "", s.systemValue || "",
        ];
      });
      return { headers: headers, rows: rows };
    },
  },
];

// ============================================================================
// Single Export Runner
// ============================================================================

async function runExport(exportDef, accessToken, accountID, maxRecords) {
  var name = exportDef.name;
  var filename = exportDef.filename;
  var startTime = Date.now();

  await log("[" + name + "] Fetching from Lightspeed API..." + (maxRecords ? " (mini: " + maxRecords + " records max)" : ""));

  var data = await lsGetAll(accessToken, accountID, exportDef.endpoint, exportDef.params, function (fetched, total) {
    process.stdout.write("\r[" + ts() + "] - [" + name + "] " + fetched + " / " + total + " records...    ");
  }, maxRecords);
  process.stdout.write("\r" + " ".repeat(80) + "\r");

  await log("[" + name + "] Fetched " + data.length.toLocaleString() + " records. Building CSV...");

  var result = exportDef.build(data);
  var csv = buildCSV(result.headers, result.rows);

  // Ensure output dir exists
  if (!fs.existsSync(CONFIG.csvDir)) fs.mkdirSync(CONFIG.csvDir, { recursive: true });

  var filePath = path.join(CONFIG.csvDir, filename);
  fs.writeFileSync(filePath, csv, "utf8");

  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  var sizeMB = (Buffer.byteLength(csv) / 1024 / 1024).toFixed(2);
  await log("[" + name + "] Saved " + filename + " (" + result.rows.length.toLocaleString() + " rows, " + sizeMB + " MB, " + elapsed + "s)", "success");

  return { name: name, filename: filename, rows: result.rows.length, elapsed: elapsed, sizeMB: sizeMB };
}

// ============================================================================
// Parallel Runner with Concurrency Limit
// ============================================================================

async function runParallel(tasks, limit) {
  var results = [];
  var executing = new Set();

  for (var i = 0; i < tasks.length; i++) {
    var p = tasks[i]().then(function (result) {
      executing.delete(p);
      return result;
    });
    results.push(p);
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

// ============================================================================
// Main
// ============================================================================

function askQuestion(prompt) {
  var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function (resolve) {
    rl.question(prompt, function (answer) {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

var SALES_EXPORT_NAMES = ["sales", "salesLines", "salesPayments"];

async function main() {
  var globalStart = Date.now();

  console.log("");
  console.log("+=================================================+");
  console.log("|  Lightspeed CSV Download Script                  |");
  console.log("+=================================================+");
  console.log("  Tenant:   " + CONFIG.tenantID);
  console.log("  Store:    " + CONFIG.storeID);
  console.log("  Output:   " + CONFIG.csvDir);
  console.log("  Parallel: " + CONFIG.PARALLEL_LIMIT + " concurrent");
  console.log("");

  // Validate config
  if (!CONFIG.tenantID || !CONFIG.storeID) {
    console.error("  x TENANT_ID and STORE_ID missing. Set them in scripts/.env");
    console.error("  Copy .env.example to .env and fill in your values.\n");
    process.exit(1);
  }
  if (!CONFIG.lightspeedClientID || !CONFIG.lightspeedClientSecret) {
    console.error("  x LIGHTSPEED_CLIENT_ID and LIGHTSPEED_CLIENT_SECRET missing. Set them in scripts/.env");
    console.error("  Find in: Firebase Console -> Secret Manager\n");
    process.exit(1);
  }

  // Ask mode
  console.log("  full  - All 11 CSV exports (workorders, customers, sales, inventory, employees)");
  console.log("  sales - Sales-related only (sales, salesLines, salesPayments, stripePayments)");
  console.log("");
  var answer = await askQuestion("  Type 'full' or 'sales': ");
  var salesOnly = answer === "s" || answer === "sales";

  if (salesOnly) {
    console.log("\n  >> SALES-ONLY MODE: downloading 4 sale-related exports\n");
  } else {
    console.log("\n  >> FULL MODE: downloading all records\n");
  }

  // Init Firebase
  initFirebase();
  await initLogNode();
  await log("Script started (" + (salesOnly ? "SALES-ONLY" : "FULL") + ")");

  // Authenticate
  logHeader("AUTHENTICATION");
  var auth = await getAccessToken();
  await log("Authenticated with Lightspeed (account: " + auth.accountID + ")", "success");

  // Filter exports if sales-only mode
  var activeExports = salesOnly
    ? EXPORTS.filter(function (e) { return SALES_EXPORT_NAMES.indexOf(e.name) !== -1; })
    : EXPORTS;

  // Run exports in parallel
  var modeLabel = salesOnly ? " [SALES-ONLY]" : "";
  logHeader("DOWNLOADING " + activeExports.length + " CSV FILES" + modeLabel + " (parallel: " + CONFIG.PARALLEL_LIMIT + ")");

  var tasks = activeExports.map(function (exportDef) {
    return function () { return runExport(exportDef, auth.accessToken, auth.accountID, 0); };
  });
  var results = await runParallel(tasks, CONFIG.PARALLEL_LIMIT);

  // Summary
  logHeader("SUMMARY" + modeLabel);
  var totalTime = ((Date.now() - globalStart) / 1000).toFixed(1);
  var mins = Math.floor(totalTime / 60);
  var secs = (totalTime % 60).toFixed(0);
  var totalRows = 0;

  console.log("");
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    totalRows += r.rows;
    console.log("  " + r.filename.padEnd(25) + r.rows.toLocaleString().padStart(8) + " rows   " + r.sizeMB.padStart(6) + " MB   " + r.elapsed + "s");
  }
  console.log("");
  console.log("  Total rows:  " + totalRows.toLocaleString());
  console.log("  Total time:  " + (mins > 0 ? mins + "m " : "") + secs + "s");
  console.log("  Output dir:  " + CONFIG.csvDir);
  if (salesOnly) console.log("  Mode:        SALES-ONLY (4 exports)");

  await log("Download complete! " + results.length + " files, " + totalRows.toLocaleString() + " total rows." + (salesOnly ? " [SALES-ONLY]" : ""), "success");
  if (logDocRef) await logDocRef.update({ status: "complete" });

  console.log("\n  + ALL DONE\n");
  process.exit(0);
}

// Run
main().catch(async function (err) {
  console.error("\n[" + ts() + "] x FATAL: " + (err.message || err));
  console.error(err.stack);
  if (logDocRef) {
    try { await logDocRef.update({ status: "error" }); } catch (e) { /* ignore */ }
  }
  process.exit(1);
});
