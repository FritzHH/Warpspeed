/**
 * yarn switch — toggle the active Firebase target between Bonita (default)
 * and RSS (rss). Reads the active project ID via `firebase use`, reverse-looks
 * it up in .firebaserc, flips to the other alias, and re-runs `firebase use`
 * with the matching Google account.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ACCOUNTS = {
  default: { label: "Bonita Bikes", account: "fritz@bonitabikes.com" },
  rss:     { label: "RSS",          account: "fritz@retailsoftsystems.com" },
};

const rcPath = path.resolve(__dirname, "..", ".firebaserc");
const rc = JSON.parse(fs.readFileSync(rcPath, "utf8"));
const projects = rc.projects || {};

function currentProjectId() {
  try {
    return execSync("firebase use", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function aliasForProjectId(pid) {
  for (const [alias, id] of Object.entries(projects)) {
    if (id === pid) return alias;
  }
  return null;
}

const currentId = currentProjectId();
const currentAlias = aliasForProjectId(currentId);
const targetAlias = currentAlias === "rss" ? "default" : "rss";
const targetId = projects[targetAlias];

const fromLabel = currentAlias
  ? `${currentAlias} — ${ACCOUNTS[currentAlias].label} (${currentId})`
  : `(unknown: ${currentId || "none"})`;
const toLabel = `${targetAlias} — ${ACCOUNTS[targetAlias].label} (${targetId})`;

console.log("");
console.log(`  Switching Firebase target:`);
console.log(`    from:    ${fromLabel}`);
console.log(`    to:      ${toLabel}`);
console.log(`    account: ${ACCOUNTS[targetAlias].account}`);
console.log("");

execSync(`firebase use ${targetAlias} --account=${ACCOUNTS[targetAlias].account}`, { stdio: "inherit" });

console.log("");
console.log(`  Active target is now: ${toLabel}`);
console.log("");
