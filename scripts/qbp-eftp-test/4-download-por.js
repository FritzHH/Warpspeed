// One-off: download a single .por file from QBP's EFTP /in directory
// and print its contents. Used when 3-upload.js's poll timed out but the
// .por landed in /in later.
//
// Required env:
//   QBP_EFTP_USER     — 6-digit account number (e.g. 115882)
//   QBP_EFTP_PASSWORD — EFTP password
//   QBP_POR_NAME      — file to fetch (e.g. cdtest03.por)

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("basic-ftp");

const REQUIRED = ["QBP_EFTP_USER", "QBP_EFTP_PASSWORD", "QBP_POR_NAME"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`ERROR: missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const porName = process.env.QBP_POR_NAME;
const outDir = path.join(__dirname, "out");
const localPath = path.join(outDir, porName);

(async () => {
  const client = new Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: "eftp.qbp.com",
      port: 21,
      user: process.env.QBP_EFTP_USER,
      password: process.env.QBP_EFTP_PASSWORD,
      secure: false,
    });
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    console.log(`Downloading /in/${porName} → ${localPath}`);
    await client.downloadTo(localPath, `/in/${porName}`);
    console.log(`\n--- ${porName} contents ---\n`);
    console.log(fs.readFileSync(localPath, "utf8"));
  } catch (err) {
    console.error(`FAILED: ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
  } finally {
    client.close();
  }
})();
