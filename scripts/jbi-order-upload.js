// Standalone experimentation tool for JBI order XML uploads.
//
// Builds the XML envelope per JBI's dealer integration spec, FTPs to
// ftp.jbi.bike under the dealer's _ORD login, and reports the result.
// JBI accounts start in "manual checkout" mode, so a successful upload
// lands as a draft web order on jbi.bike that the dealer manually
// reviews — this script does NOT place an actual order.
//
// Use it to probe questions the spec doesn't answer:
//   - Does an integrator's _ORD login + Token work for a different dealer's
//     AccountNumber, or is Token bound to one account?
//   - Does omitting CarrierID / AutoSplit really default cleanly?
//   - What does JBI return for a bad SKU vs a bad Token vs a bad ShipToID?
//
// Cred profiles: missing flags fall back to .jbi-order-creds.json at
// repo root (gitignored) so the password stays out of shell history.

const path = require("path");
const fs = require("fs");

// basic-ftp lives in functions/node_modules; reuse rather than install
// a second copy under scripts/.
const ftp = require(path.resolve(
  __dirname,
  "..",
  "functions",
  "node_modules",
  "basic-ftp",
));
const { Readable } = require("stream");

// Map inv_loc 2-letter warehouse codes → JBI order LocID 3-digit codes.
// The inventory file uses PA/MN/etc.; the order spec requires 106/107/etc.
const WAREHOUSE_TO_LOC_ID = {
  FL: "101",
  NC: "102",
  NY: "103",
  AL: "104",
  IN: "105",
  PA: "106",
  MN: "107",
  TX: "108",
  CO: "109",
  WA: "110",
  CA: "112",
};

const FTP_HOST = "ftp.jbi.bike";

function parseArgs(argv) {
  const args = {};
  const flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.substring(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.add(key);
    } else {
      args[key] = next;
      i++;
    }
  }
  return { args, flags };
}

function loadCredsFile() {
  const p = path.resolve(__dirname, "..", ".jbi-order-creds.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    console.error(`[jbi-order-upload] could not read ${p}: ${err.message}`);
    return {};
  }
}

function escapeXml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildOrderXml(p) {
  const lineXml = p.lineItems
    .map(
      (li) =>
        `        <ItemID>\n` +
        `            <PartNumber>${escapeXml(li.partNumber)}</PartNumber>\n` +
        `            <Qty>${escapeXml(li.qty)}</Qty>\n` +
        `            <LocID>${escapeXml(li.locID || "")}</LocID>\n` +
        `        </ItemID>`,
    )
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Order>\n` +
    `    <Token>${escapeXml(p.token)}</Token>\n` +
    `    <CustomerOrderNo>${escapeXml(p.customerOrderNo)}</CustomerOrderNo>\n` +
    `    <PONumber>${escapeXml(p.poNumber || "")}</PONumber>\n` +
    `    <AccountNumber>${escapeXml(p.accountNumber)}</AccountNumber>\n` +
    `    <ShipToID>${escapeXml(p.shipToId)}</ShipToID>\n` +
    `    <EmailAddress>${escapeXml(p.email)}</EmailAddress>\n` +
    `    <ShipDropship>${escapeXml(p.shipDropship || "N")}</ShipDropship>\n` +
    `    <Residential>${escapeXml(p.residential || "N")}</Residential>\n` +
    `    <DropshipBilling>${escapeXml(p.dropshipBilling || "PREPAY")}</DropshipBilling>\n` +
    `    <CarrierID>${escapeXml(p.carrierId || "")}</CarrierID>\n` +
    `    <AutoSplit>${escapeXml(p.autoSplit || "N")}</AutoSplit>\n` +
    `    <SingleLocation>${escapeXml(p.singleLocation || "N")}</SingleLocation>\n` +
    // DeliveryAddress block is required by JBI's parser even for non-dropship
    // orders. Spec says contents are ignored for non-dropship, but if the
    // element is missing the parser stops before <LineItems> — order lands
    // with Code 99 success and an empty cart.
    `    <DeliveryAddress>\n` +
    `        <RecipientName>${escapeXml(p.recipientName || "")}</RecipientName>\n` +
    `        <Street1>${escapeXml(p.street1 || "")}</Street1>\n` +
    `        <Street2/>\n` +
    `        <City>${escapeXml(p.city || "")}</City>\n` +
    `        <State>${escapeXml(p.state || "")}</State>\n` +
    `        <Zip>${escapeXml(p.zip || "")}</Zip>\n` +
    `        <Phone>${escapeXml(p.phone || "")}</Phone>\n` +
    `    </DeliveryAddress>\n` +
    `    <LineItems>\n` +
    `${lineXml}\n` +
    `    </LineItems>\n` +
    `</Order>\n`
  );
}

function buildFilename(customerOrderNo, accountNumber) {
  return `JBI-${customerOrderNo}-${accountNumber}.xml`;
}

function normalizeLineItems(rawItems) {
  return rawItems.map((it, i) => {
    const partNumber =
      it.partNumber || it.PartNumber || it.itemId || it.item_id;
    const qty = it.qty || it.Qty || it.quantity;
    let locID = it.locID || it.LocID || it.loc || it.warehouse || "";
    // Accept 2-letter (PA) or 3-digit (106). Map 2-letter to 3-digit.
    const upper = String(locID).toUpperCase();
    if (locID && WAREHOUSE_TO_LOC_ID[upper]) {
      locID = WAREHOUSE_TO_LOC_ID[upper];
    }
    if (!partNumber || !qty) {
      throw new Error(`line item ${i}: missing partNumber or qty`);
    }
    return {
      partNumber: String(partNumber),
      qty: String(qty),
      locID: String(locID),
    };
  });
}

async function uploadViaFtp({
  ftpUser,
  ftpPassword,
  ftpDir,
  filename,
  body,
  verbose,
}) {
  const client = new ftp.Client(60_000);
  client.ftp.verbose = !!verbose;
  try {
    await client.access({
      host: FTP_HOST,
      user: ftpUser,
      password: ftpPassword,
      secure: false,
    });
    const stream = Readable.from([Buffer.from(body, "utf8")]);
    // Cadence integrator login lands in /<user>/, and JBI provisioned an
    // "Orders" subfolder we must drop into. Per-dealer _ORD logins used to
    // accept files at the root, so leaving ftpDir empty keeps the legacy
    // behavior available for comparison tests.
    const remotePath = ftpDir ? `${ftpDir.replace(/\/+$/, "")}/${filename}` : filename;
    await client.uploadFrom(stream, remotePath);
  } finally {
    client.close();
  }
}

function printHelp() {
  console.log(`
Usage: node scripts/jbi-order-upload.js [flags]

Required (or supply via .jbi-order-creds.json at repo root):
  --account-number <n>      JBI dealer account number (e.g. 121080)
  --ftp-user <user>         FTP login for orders (e.g. 121080_ORD)
  --ftp-password <pw>       FTP password (QUOTE in cmd if it has & etc.)
  --token <token>           JBI API token (populates <Token>)
  --email <addr>            Notification email for import success/failure
  --items <path>            JSON file: array of { partNumber, qty, locID }

Optional:
  --customer-order-no <id>  Unique order # (default TEST-<timestamp>)
  --po-number <n>           PONumber field (default empty)
  --ship-to-id <id>         ShipToID (default = accountNumber)
  --ftp-dir <name>          FTP subfolder to upload into (default "Orders"
                            for Cadence integrator login; pass "" for root
                            to mimic legacy per-dealer _ORD upload)
  --dropship-billing <v>    PREPAY | COLLECT | LABEL (default PREPAY)
  --ship-dropship <Y|N>     default N
  --residential <Y|N>       default N
  --carrier-id <code>       6-digit JBI carrier (default empty)
  --auto-split <Y|N>        default N
  --single-location <Y|N>   default N
  --dry-run                 Build & print XML, skip upload
  --verbose                 Verbose FTP log

Items file shape:
  [
    { "partNumber": "SOMEPART-123", "qty": 1, "locID": "106" }
  ]
locID accepts the 3-digit JBI code (106) OR the 2-letter warehouse (PA).

.jbi-order-creds.json shape (any subset of the required fields):
  {
    "accountNumber": "121080",
    "ftpUser": "121080_ORD",
    "ftpPassword": "g3QX&bn5",
    "token": "001h84LSw5",
    "email": "ops@example.com"
  }
`);
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    process.exit(0);
  }

  const creds = loadCredsFile();
  const accountNumber = args["account-number"] || creds.accountNumber;
  const ftpUser = args["ftp-user"] || creds.ftpUser;
  const ftpPassword = args["ftp-password"] || creds.ftpPassword;
  // ftpDir: "" means root (legacy per-dealer _ORD). Default to "Orders" for
  // the Cadence integrator login. CLI override accepts "" to force root.
  const ftpDirArg = args["ftp-dir"];
  const ftpDir =
    ftpDirArg !== undefined
      ? ftpDirArg
      : creds.ftpDir !== undefined
        ? creds.ftpDir
        : "Orders";
  const token = args["token"] || creds.token;
  const email = args["email"] || creds.email;
  const itemsPath = args["items"] || creds.itemsPath;

  const missing = [];
  if (!accountNumber) missing.push("--account-number");
  if (!ftpUser) missing.push("--ftp-user");
  if (!ftpPassword) missing.push("--ftp-password");
  if (!token) missing.push("--token");
  if (!email) missing.push("--email");
  if (!itemsPath) missing.push("--items");
  if (missing.length) {
    console.error(`Missing required fields: ${missing.join(", ")}`);
    printHelp();
    process.exit(1);
  }

  let rawItems;
  try {
    rawItems = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  } catch (err) {
    console.error(`Could not read items file ${itemsPath}: ${err.message}`);
    process.exit(1);
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    console.error("Items file must be a non-empty JSON array.");
    process.exit(1);
  }

  let lineItems;
  try {
    lineItems = normalizeLineItems(rawItems);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const customerOrderNo = args["customer-order-no"] || `TEST-${Date.now()}`;
  const shipToId = args["ship-to-id"] || accountNumber;

  const xml = buildOrderXml({
    token,
    customerOrderNo,
    poNumber: args["po-number"],
    accountNumber,
    shipToId,
    email,
    shipDropship: args["ship-dropship"],
    residential: args["residential"],
    dropshipBilling: args["dropship-billing"],
    carrierId: args["carrier-id"],
    autoSplit: args["auto-split"],
    singleLocation: args["single-location"],
    lineItems,
  });
  const filename = buildFilename(customerOrderNo, accountNumber);

  console.log(`[jbi-order-upload] filename: ${filename}`);
  console.log(`[jbi-order-upload] line items: ${lineItems.length}`);

  if (flags.has("dry-run")) {
    console.log("\n--- XML PAYLOAD (dry-run) ---\n");
    console.log(xml);
    console.log("--- END (no upload) ---");
    return;
  }

  const destLabel = ftpDir ? `${ftpDir}/${filename}` : filename;
  console.log(
    `[jbi-order-upload] uploading to ftp://${FTP_HOST}/${destLabel} as ${ftpUser} ...`,
  );
  try {
    await uploadViaFtp({
      ftpUser,
      ftpPassword,
      ftpDir,
      filename,
      body: xml,
      verbose: flags.has("verbose"),
    });
    console.log(
      `[jbi-order-upload] upload OK. Watch ${email} for the JBI import-ack email.`,
    );
    console.log(
      `[jbi-order-upload] expected subject: 'Import Successful ${filename}' or 'Import Failed ${filename}'`,
    );
  } catch (err) {
    console.error(
      `[jbi-order-upload] upload FAILED: ${err && err.message ? err.message : err}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    `[jbi-order-upload] fatal: ${err && err.stack ? err.stack : err}`,
  );
  process.exit(1);
});
