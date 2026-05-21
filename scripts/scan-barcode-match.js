// One-off diagnostic: compare downloaded inventory barcodes against LS inventory.csv source.
const fs = require("fs");
const path = require("path");

const DOWNLOADED = "C:\\Users\\hiebf\\OneDrive\\Desktop\\inventory_2026-05-21-20-00-43.csv";
const SOURCE = path.resolve(__dirname, "..", "_migration_data", "lightspeed", "inventory.csv");

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
  return rows.filter(r => r.length === headers.length).map(r => {
    const o = {};
    headers.forEach((h, idx) => o[h] = r[idx]);
    return o;
  });
}

const dl = parseCSV(fs.readFileSync(DOWNLOADED, "utf8"));
const src = parseCSV(fs.readFileSync(SOURCE, "utf8"));

// Index source by description (may collide — keep array)
const srcByDesc = new Map();
for (const r of src) {
  const key = (r["Description"] || "").trim();
  if (!key) continue;
  if (!srcByDesc.has(key)) srcByDesc.set(key, []);
  srcByDesc.get(key).push({
    systemId: r["System ID"],
    upc: (r["UPC"] || "").trim(),
    ean: (r["EAN"] || "").trim(),
  });
}

let total = 0, hasSrcCode = 0, matched = 0, primaryMatched = 0, lostUpc = 0, sourceHadNoCode = 0;
const lostSamples = [];

for (const item of dl) {
  total++;
  const name = (item.formalName || "").trim();
  const sources = srcByDesc.get(name) || [];
  if (!sources.length) continue;

  const srcCodes = new Set();
  for (const s of sources) {
    if (s.upc) srcCodes.add(s.upc);
    if (s.ean) srcCodes.add(s.ean);
  }
  if (!srcCodes.size) { sourceHadNoCode++; continue; }
  hasSrcCode++;

  const dlCodes = new Set();
  if (item.primaryBarcode) dlCodes.add(item.primaryBarcode);
  if (item.barcodes) for (const b of item.barcodes.split("|")) if (b) dlCodes.add(b);

  // Strip leading zero variant
  const expanded = new Set();
  for (const c of dlCodes) {
    expanded.add(c);
    if (c.length === 13 && c.startsWith("0")) expanded.add(c.slice(1));
  }

  let any = false, primary = false;
  for (const sc of srcCodes) {
    if (expanded.has(sc)) any = true;
    if (item.primaryBarcode === sc || item.primaryBarcode === "0" + sc) primary = true;
  }
  if (any) matched++;
  if (primary) primaryMatched++;
  if (!any) {
    lostUpc++;
    if (lostSamples.length < 15) {
      lostSamples.push({
        name,
        srcCodes: [...srcCodes],
        primaryBarcode: item.primaryBarcode,
        barcodes: item.barcodes,
      });
    }
  }
}

console.log("=== Barcode Match Scan ===");
console.log("Downloaded items:                    " + total);
console.log("Matched by name to source:           " + (hasSrcCode + sourceHadNoCode));
console.log("  ...source had at least one code:   " + hasSrcCode);
console.log("  ...source had NO upc/ean:          " + sourceHadNoCode);
console.log("");
console.log("Of items with a source code:         " + hasSrcCode);
console.log("  match found anywhere (primary/bcs): " + matched + "  (" + (matched * 100 / hasSrcCode).toFixed(1) + "%)");
console.log("  matched on primaryBarcode:          " + primaryMatched + "  (" + (primaryMatched * 100 / hasSrcCode).toFixed(1) + "%)");
console.log("  LOST (source had upc, none in dl):  " + lostUpc + "  (" + (lostUpc * 100 / hasSrcCode).toFixed(1) + "%)");
console.log("");
console.log("=== Sample of LOST items ===");
for (const s of lostSamples) {
  console.log("  " + s.name);
  console.log("    source upc/ean: " + s.srcCodes.join(", "));
  console.log("    imported pb:    " + s.primaryBarcode + "  bcs: [" + (s.barcodes || "") + "]");
}
