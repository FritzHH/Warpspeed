// Step 3: upload a .poi file to QBP's EFTP server.
//
// Per the EFTP guide:
//   - Drop .poi files in the `out` directory on the server.
//   - QBP processes (a few minutes) and replaces with .por on success.
//   - Same filename, different extension; file disappears from `out` once
//     processed; .por appears in `in` (or wherever the server places
//     responses — guide is fuzzy; this script also lists the server
//     after upload so we can see what showed up).
//
// Required env:
//   QBP_EFTP_USER     — 6-digit account number (e.g. 115882)
//   QBP_EFTP_PASSWORD — your EFTP password
//
// Optional:
//   QBP_EFTP_HOST     — default eftp.qbp.com
//   QBP_EFTP_PORT     — default 21
//   QBP_POI_FILE      — path to .poi file; default = ./out/cdtest01.poi
//   QBP_LIST_AFTER    — true (default) | false; ls after upload
//   QBP_POLL_FOR_POR  — true (default) | false; poll for the .por response

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("basic-ftp");

const REQUIRED = ["QBP_EFTP_USER", "QBP_EFTP_PASSWORD"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`ERROR: missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const host = process.env.QBP_EFTP_HOST || "eftp.qbp.com";
const port = parseInt(process.env.QBP_EFTP_PORT || "21", 10);
const localPath = process.env.QBP_POI_FILE || path.join(__dirname, "out", "cdtest01.poi");
const listAfter = (process.env.QBP_LIST_AFTER || "true").toLowerCase() !== "false";
const pollForPor = (process.env.QBP_POLL_FOR_POR || "true").toLowerCase() !== "false";

if (!fs.existsSync(localPath)) {
  console.error(`ERROR: file not found: ${localPath}`);
  console.error(`Run \`node 2-build-poi.js\` first, or pass QBP_POI_FILE.`);
  process.exit(1);
}

const remoteName = path.basename(localPath);
const porName = remoteName.replace(/\.poi$/i, ".por");

(async () => {
  const client = new Client();
  client.ftp.verbose = true;
  try {
    console.log(`Connecting ${host}:${port} as ${process.env.QBP_EFTP_USER}`);
    await client.access({
      host,
      port,
      user: process.env.QBP_EFTP_USER,
      password: process.env.QBP_EFTP_PASSWORD,
      secure: false,
    });

    console.log(`\n--- before upload ---`);
    await safePrintList(client, "/");
    await safePrintList(client, "/out");

    console.log(`\n--- uploading ${remoteName} to /out ---`);
    await client.cd("/out");
    await client.uploadFrom(localPath, remoteName);
    console.log(`Upload OK.`);

    if (listAfter) {
      console.log(`\n--- after upload (out) ---`);
      await safePrintList(client, "/out");
    }

    if (pollForPor) {
      console.log(`\n--- polling for ${porName} (up to 5 min, 15s interval) ---`);
      const found = await pollForFile(client, porName, { tries: 20, intervalMs: 15000 });
      if (found) {
        console.log(`Found ${found.path}; downloading...`);
        const localPor = path.join(path.dirname(localPath), porName);
        await client.downloadTo(localPor, found.path);
        console.log(`\n--- ${porName} contents ---`);
        console.log(fs.readFileSync(localPor, "utf8"));
      } else {
        console.log(`No .por file appeared in 5 min. Check qbponlinestorefront or your HEMA email.`);
      }
    }
  } catch (err) {
    console.error(`FAILED: ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
  } finally {
    client.close();
  }
})();

async function safePrintList(client, dir) {
  try {
    const list = await client.list(dir);
    console.log(`${dir}:`);
    for (const item of list) {
      console.log(`  ${item.type === 2 ? "d" : "-"} ${item.name}  (${item.size}B)`);
    }
  } catch (err) {
    console.log(`${dir}: (cannot list — ${err.message})`);
  }
}

// Poll a few candidate directories — the guide doesn't pin down where .por
// lands. Checks /in, /, and /out (in case it stays put with new extension).
async function pollForFile(client, name, { tries, intervalMs }) {
  const candidates = ["/in", "/", "/out"];
  for (let i = 0; i < tries; i++) {
    for (const dir of candidates) {
      try {
        const list = await client.list(dir);
        const hit = list.find((f) => f.name.toLowerCase() === name.toLowerCase());
        if (hit) return { dir, path: `${dir === "/" ? "" : dir}/${hit.name}` };
      } catch {
        // ignore; dir may not exist
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    process.stdout.write(".");
  }
  console.log("");
  return null;
}
