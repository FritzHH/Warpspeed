// One-shot diagnostic for JBI: stream each FTP catalog file
// (inv_mast.txt + inv_loc.txt + product_spec_with_titles.txt) and print every
// row matching the given item_id or upc_ean. Also runs the master row through
// toCanonicalItem so the written shape is visible.
//
// Run from this directory (jobs/vendor-catalog-jbi):
//   set "JBI_FTP_USER=Cadence" && set "JBI_FTP_PASSWORD=2Y$Ta8B6" && set "JBI_DUMP_ID=913725" && set "JBI_DUMP_UPC=785749817545" && node dump-item.js

const { withFtpClient } = require("./ftp");
const { createTabParser } = require("./parser");
const { toCanonicalItem } = require("./modes/master");

const TARGET_ID = (process.env.JBI_DUMP_ID || "").trim();
const TARGET_UPC = (process.env.JBI_DUMP_UPC || "").trim();

if (!TARGET_ID && !TARGET_UPC) {
  console.error("ERROR: set JBI_DUMP_ID=<item_id> and/or JBI_DUMP_UPC=<upc>");
  process.exit(1);
}

const FILES = [
  { label: "inv_mast.txt", path: "/inv_mast.txt" },
  { label: "inv_loc.txt", path: "/inv_loc.txt" },
  { label: "product_spec_with_titles.txt", path: "/product_spec_with_titles.txt" },
];

function rowMatches(row) {
  if (!row) return false;
  if (TARGET_ID && String(row.item_id || "").trim() === TARGET_ID) return true;
  if (TARGET_UPC && String(row.upc_ean || "").trim() === TARGET_UPC) return true;
  return false;
}

async function collectMatches(ftpClient, file) {
  const parser = createTabParser({ columns: true });
  const downloadPromise = ftpClient.downloadTo(parser, file.path);
  const hits = [];
  for await (const row of parser) {
    if (rowMatches(row)) hits.push(row);
  }
  await downloadPromise;
  return hits;
}

(async () => {
  console.log(
    `[dump-item] searching for item_id="${TARGET_ID || "(none)"}" upc_ean="${TARGET_UPC || "(none)"}"`,
  );

  await withFtpClient(async (ftpClient) => {
    for (const file of FILES) {
      console.log(`\n=== ${file.label} ===`);
      const matches = await collectMatches(ftpClient, file);
      if (!matches.length) {
        console.log("(no matching rows)");
        continue;
      }
      console.log(JSON.stringify(matches, null, 2));

      if (file.label === "inv_mast.txt") {
        for (const row of matches) {
          const itemId = String(row.item_id || "").trim();
          if (!itemId) continue;
          const canonical = toCanonicalItem(row, itemId);
          console.log(`\n--- canonical for ${itemId} ---`);
          console.log(JSON.stringify(canonical, null, 2));
        }
      }
    }
  });
})().catch((err) => {
  console.error(`[dump-item] failed:`, err && err.stack ? err.stack : err);
  process.exit(1);
});
