// Step 2: build a sample .poi file.
//
// Generates a single-line PO for cart-only review (CSUB=NO). Writes to
// ./out/{filename}.poi (filename limited to 8 chars per QBP spec).
//
// CREP=ftp asks QBP to return a .por response file via FTP (we'll poll
// for it after upload in step 3); use CREP=email if you'd rather get the
// response via the HEMA address.
//
// Required env:
//   QBP_HEMA   — order-reconciliation email (e.g. fritz@bonitabikes.com)
//   QBP_HACN   — 10-digit account number (e.g. 0000115882)
//   QBP_HCTN   — contact name (e.g. "Fritz")
//   QBP_HCPO   — PO name (e.g. "TEST01")
//   QBP_HSTO   — 10-digit Ship-To ID (from step 1)
//   QBP_HSVT   — Ship-Via code (e.g. U4 = UPS Ground; from step 1)
//   QBP_HTRM   — Payment terms + method (e.g. N30:I; from step 1)
//   QBP_TEST_SKU  — one real QBP SKU to put on the order (single-line mode)
//   QBP_TEST_QTY  — quantity (default 1; single-line mode only)
//
// Multi-line alternative (overrides QBP_TEST_SKU / QBP_TEST_QTY):
//   QBP_TEST_SKUS — CSV of sku:qty pairs, e.g. "CH4093:4,WT0044:2,EC9002:5"
//
// Optional:
//   QBP_FILENAME — 8-char alphanumeric filename, no extension (default cdtest01)
//   QBP_HSHD     — ship date MM/DD/YYYY (default = today + 5 calendar days)
//   QBP_CSUB     — YES | NO (default NO = cart only, safe)
//   QBP_OSOR     — YES | NO (default NO; only meaningful if CSUB=YES)
//   QBP_CREP     — email | ftp (default ftp)
//   QBP_CFAL     — ignore | fail (default ignore)

const fs = require("node:fs");
const path = require("node:path");

const REQUIRED = ["QBP_HEMA", "QBP_HACN", "QBP_HCTN", "QBP_HCPO", "QBP_HSTO", "QBP_HSVT", "QBP_HTRM"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`ERROR: missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}
if (!process.env.QBP_TEST_SKU && !process.env.QBP_TEST_SKUS) {
  console.error("ERROR: set either QBP_TEST_SKU (single-line) or QBP_TEST_SKUS (CSV of sku:qty pairs)");
  process.exit(1);
}

const filename = (process.env.QBP_FILENAME || "cdtest01").replace(/[^a-z0-9]/gi, "");
if (filename.length === 0 || filename.length > 8) {
  console.error(`ERROR: QBP_FILENAME must be 1-8 alphanumeric chars (got "${filename}")`);
  process.exit(1);
}

const hshd = process.env.QBP_HSHD || defaultShipDate();
if (!/^\d{2}\/\d{2}\/\d{4}$/.test(hshd)) {
  console.error(`ERROR: QBP_HSHD must be MM/DD/YYYY (got "${hshd}")`);
  process.exit(1);
}

const csub = (process.env.QBP_CSUB || "NO").toUpperCase();
const osor = (process.env.QBP_OSOR || "NO").toUpperCase();
const crep = (process.env.QBP_CREP || "ftp").toLowerCase();
const cfal = (process.env.QBP_CFAL || "ignore").toLowerCase();

const skuLines = parseSkuLines();

// Order of records matters per the spec example.
const lines = [
  "FT,PO",
  "FV,4.0",
  `HEMA,${process.env.QBP_HEMA}`,
  `HACN,${process.env.QBP_HACN}`,
  `HCTN,${process.env.QBP_HCTN}`,
  `HCPO,${process.env.QBP_HCPO}`,
  `HSHD,${hshd}`,
  `HSTO,${process.env.QBP_HSTO}`,
  `HSVT,${process.env.QBP_HSVT}`,
  `HTRM,${process.env.QBP_HTRM}`,
  `CSUB,${csub}`,
  `OSOR,${osor}`,
  `CREP,${crep}`,
  `CFAL,${cfal}`,
  `CLNE,${skuLines.length}`,
  ...skuLines.map(({ sku, qty }, i) => `L${i + 1},${sku},${qty}`),
];

// Spec warns "lines including carriage returns may cause entire file to be
// corrupted." Force LF-only, no trailing CR; final newline OK.
const body = lines.join("\n") + "\n";

const outDir = path.join(__dirname, "out");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${filename}.poi`);
fs.writeFileSync(outPath, body, { encoding: "utf8" });

console.log(`Wrote ${outPath}`);
console.log(`\n--- file contents ---`);
console.log(body);

function parseSkuLines() {
  if (process.env.QBP_TEST_SKUS) {
    const pairs = process.env.QBP_TEST_SKUS.split(",").map((s) => s.trim()).filter(Boolean);
    const parsed = pairs.map((pair) => {
      const [sku, qtyStr] = pair.split(":").map((s) => s.trim());
      const qty = parseInt(qtyStr || "1", 10) || 1;
      if (!sku) {
        console.error(`ERROR: bad QBP_TEST_SKUS entry "${pair}" — use sku:qty`);
        process.exit(1);
      }
      return { sku, qty };
    });
    if (parsed.length === 0) {
      console.error("ERROR: QBP_TEST_SKUS parsed to zero lines");
      process.exit(1);
    }
    return parsed;
  }
  return [{
    sku: String(process.env.QBP_TEST_SKU).trim(),
    qty: parseInt(process.env.QBP_TEST_QTY || "1", 10) || 1,
  }];
}

function defaultShipDate() {
  const d = new Date();
  d.setDate(d.getDate() + 5); // 5 calendar days; within the 9-business-day cap
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
