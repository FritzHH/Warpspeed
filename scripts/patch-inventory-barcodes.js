// Patch barcodes on an existing inventory CSV using the Lightspeed source inventory.csv.
//
// Reads:
//   - Current inventory snapshot CSV (downloaded from Dashboard → Import → Download Inventory CSV).
//   - _migration_data/lightspeed/inventory.csv (raw LS source).
//
// For each row in the snapshot, matches by formalName against the LS source and writes the
// raw UPC/EAN from the source into primaryBarcode + barcodes[]. IDs and all other fields are
// preserved so quick-button references stay valid.
//
// Writes:
//   - inventory_patched.csv     (next to the input)
//   - inventory_patch_audit.txt (next to the input)
//
// Usage:
//   node scripts/patch-inventory-barcodes.js "<path to current inventory CSV>"

const fs = require("fs");
const path = require("path");

const INPUT = process.argv[2];
if (!INPUT) {
  console.error("Usage: node scripts/patch-inventory-barcodes.js \"<path to current inventory CSV>\"");
  process.exit(1);
}
if (!fs.existsSync(INPUT)) {
  console.error("Input file not found: " + INPUT);
  process.exit(1);
}

const SOURCE = path.resolve(__dirname, "..", "_migration_data", "lightspeed", "inventory.csv");
if (!fs.existsSync(SOURCE)) {
  console.error("LS source not found: " + SOURCE);
  process.exit(1);
}

const OUT_CSV = path.join(path.dirname(INPUT), "inventory_patched.csv");
const OUT_AUDIT = path.join(path.dirname(INPUT), "inventory_patch_audit.txt");

// Wide-net labor detection — mirrors the in-app importer regex.
// Bias toward over-matching: labor is tax-free, so false-positives cost
// nothing while false-negatives charge tax on what should be exempt.
const LABOR_WORDS = /\b(labor|install|installation|replace|repair|tune|tuneup|service|adjust|diagnostic|cleaning|assembly|bleed|overhaul|true|truing|build|swap|mount|fit|fitting|setup|set-up|removal|remove|inspection|inspect|charge)\b/i;

function parseCSV(text) {
  const rows = [];
  let i = 0, field = "", row = [], inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  return {
    headers,
    rows: rows.filter(r => r.length === headers.length).map(r => {
      const o = {};
      headers.forEach((h, idx) => o[h] = r[idx]);
      return o;
    }),
  };
}

function esc(v) {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("|") : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// --- Load inputs ---
const snapText = fs.readFileSync(INPUT, "utf8");
const srcText = fs.readFileSync(SOURCE, "utf8");

const snap = parseCSV(snapText);
const src = parseCSV(srcText);

console.log("Snapshot rows: " + snap.rows.length);
console.log("LS source rows: " + src.rows.length);

// --- Index source by normalized formalName ---
const norm = (s) => (s || "").trim();
const srcByName = new Map();
for (const r of src.rows) {
  const name = norm(r["Description"]);
  if (!name) continue;
  if (!srcByName.has(name)) srcByName.set(name, []);
  srcByName.get(name).push({
    systemId: r["System ID"],
    upc: norm(r["UPC"]),
    ean: norm(r["EAN"]),
  });
}

// --- Patch ---
const audit = [];
let stats = {
  total: 0,
  matched: 0,
  noMatch: 0,
  collisions: 0,
  collisionsDivergent: 0,
  patched: 0,
  noChange: 0,
  sourceHadNoCode: 0,
  categoryFlipped: 0,
};

const outHeaders = snap.headers;
const outRows = [];

for (const item of snap.rows) {
  stats.total++;
  const name = norm(item.formalName);
  const matches = srcByName.get(name) || [];

  // Category decision (independent of barcode patch) — applied to every row.
  const oldCategory = item.category || "";
  const newCategory = LABOR_WORDS.test(name) ? "Labor" : "Item";
  const categoryChanged = oldCategory !== newCategory;
  if (categoryChanged) {
    stats.categoryFlipped++;
    audit.push("[CATEGORY] " + name + " (id=" + item.id + ") — " + (oldCategory || "-") + " -> " + newCategory);
  }

  const applyCategory = (row) => categoryChanged ? { ...row, category: newCategory } : row;

  if (matches.length === 0) {
    stats.noMatch++;
    audit.push("[NO MATCH] " + name + " (id=" + item.id + ")");
    outRows.push(applyCategory(item));
    continue;
  }

  stats.matched++;

  // Collision detection
  if (matches.length > 1) {
    stats.collisions++;
    const codes = new Set();
    for (const m of matches) { if (m.upc) codes.add(m.upc); if (m.ean) codes.add(m.ean); }
    const divergent = codes.size > 1;
    if (divergent) {
      stats.collisionsDivergent++;
      audit.push(
        "[COLLISION-DIVERGENT] " + name + " (id=" + item.id + ") — " +
        matches.length + " source rows with different codes: " +
        matches.map(m => "sys " + m.systemId + " upc=" + (m.upc || "-") + " ean=" + (m.ean || "-")).join(" | ") +
        " — picking first"
      );
    } else {
      audit.push(
        "[COLLISION] " + name + " (id=" + item.id + ") — " +
        matches.length + " source rows, codes agree"
      );
    }
  }

  // Pick-any rule: use first source row
  const picked = matches[0];
  const rawUpc = picked.upc;
  const rawEan = picked.ean;

  if (!rawUpc && !rawEan) {
    stats.sourceHadNoCode++;
    audit.push("[SOURCE-NO-CODE] " + name + " (id=" + item.id + ") — source row has no UPC/EAN, leaving snapshot codes as-is");
    outRows.push(applyCategory(item));
    continue;
  }

  // primaryBarcode: prefer raw UPC, else raw EAN
  const newPrimary = rawUpc || rawEan;
  // barcodes[]: the other code if it differs from primary
  const otherCodes = [];
  for (const c of [rawUpc, rawEan]) {
    if (c && c !== newPrimary && !otherCodes.includes(c)) otherCodes.push(c);
  }

  const oldPrimary = item.primaryBarcode || "";
  const oldBarcodes = item.barcodes || "";
  const newBarcodesStr = otherCodes.join("|");

  if (oldPrimary === newPrimary && oldBarcodes === newBarcodesStr) {
    stats.noChange++;
    outRows.push(applyCategory(item));
    continue;
  }

  stats.patched++;
  audit.push(
    "[PATCH] " + name + " (id=" + item.id + ") — " +
    "primaryBarcode: " + (oldPrimary || "-") + " -> " + newPrimary +
    (newBarcodesStr ? ("  barcodes: [" + (oldBarcodes || "") + "] -> [" + newBarcodesStr + "]") : "")
  );

  outRows.push(applyCategory({
    ...item,
    primaryBarcode: newPrimary,
    barcodes: newBarcodesStr,
  }));
}

// --- Write output CSV ---
const csvLines = [outHeaders.map(esc).join(",")];
for (const r of outRows) csvLines.push(outHeaders.map(h => esc(r[h])).join(","));
fs.writeFileSync(OUT_CSV, csvLines.join("\n"), "utf8");

// --- Write audit ---
const auditHeader = [
  "Inventory barcode patch audit",
  "Input:  " + INPUT,
  "Source: " + SOURCE,
  "Output: " + OUT_CSV,
  "",
  "Stats:",
  "  Total snapshot rows:               " + stats.total,
  "  Matched in source (by name):       " + stats.matched,
  "  No source match (passed through):  " + stats.noMatch,
  "  Source had no UPC/EAN:             " + stats.sourceHadNoCode,
  "  Patched (codes changed):           " + stats.patched,
  "  No change (codes already correct): " + stats.noChange,
  "  Name collisions (>=2 src rows):    " + stats.collisions,
  "    ...with divergent codes:         " + stats.collisionsDivergent,
  "  Category flipped (Item<->Labor):   " + stats.categoryFlipped,
  "",
  "Per-row events:",
  "",
];
fs.writeFileSync(OUT_AUDIT, auditHeader.concat(audit).join("\n"), "utf8");

console.log("");
console.log("=== Patch complete ===");
console.log("Patched: " + stats.patched + " / " + stats.total);
console.log("No change: " + stats.noChange);
console.log("No source match: " + stats.noMatch);
console.log("Source had no code: " + stats.sourceHadNoCode);
console.log("Collisions: " + stats.collisions + " (divergent codes: " + stats.collisionsDivergent + ")");
console.log("Category flipped: " + stats.categoryFlipped);
console.log("");
console.log("Wrote: " + OUT_CSV);
console.log("Wrote: " + OUT_AUDIT);
