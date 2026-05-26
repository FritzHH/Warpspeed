const fs = require("fs");
const path = require("path");
const os = require("os");

const expected = process.argv[2];
if (!expected || !["bonita", "saas"].includes(expected)) {
  console.error("Usage: node scripts/verify-deploy-target.js <bonita|saas>");
  process.exit(1);
}

const expectedAlias = expected === "saas" ? "rss" : "default";
const switchCmd = expected === "saas" ? "yarn rss" : "yarn warp";
const deployScript = expected === "saas" ? "functionsrss" : "functionswarp";

const configstoreCandidates = [
  process.env.XDG_CONFIG_HOME &&
    path.join(process.env.XDG_CONFIG_HOME, "configstore", "firebase-tools.json"),
  path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"),
].filter(Boolean);

const configstorePath = configstoreCandidates.find((p) => fs.existsSync(p));

if (!configstorePath) {
  console.error("");
  console.error("X Cannot find firebase-tools configstore.");
  console.error("  Tried:");
  configstoreCandidates.forEach((p) => console.error("    " + p));
  console.error("  Has firebase CLI been authenticated? Try: firebase login");
  console.error("");
  process.exit(1);
}

let configstore;
try {
  configstore = JSON.parse(fs.readFileSync(configstorePath, "utf8"));
} catch (err) {
  console.error("");
  console.error("X Could not parse firebase configstore at " + configstorePath);
  console.error("  " + (err.message || err));
  console.error("");
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, "..");
const activeAlias =
  configstore && configstore.activeProjects && configstore.activeProjects[projectRoot];

if (!activeAlias) {
  console.error("");
  console.error("X No active Firebase project set for this directory.");
  console.error("  Directory: " + projectRoot);
  console.error("  Run `" + switchCmd + "` to bind the correct Firebase project.");
  console.error("");
  process.exit(1);
}

if (activeAlias !== expectedAlias) {
  console.error("");
  console.error("X FIREBASE PROJECT MISMATCH -- refusing to deploy.");
  console.error("  Expected alias: " + expectedAlias + " (" + expected + " target)");
  console.error("  Actual alias:   " + activeAlias);
  console.error("");
  console.error(
    "  Run `" +
      switchCmd +
      "` to bind the correct Firebase project, then `yarn " +
      deployScript +
      "` to retry."
  );
  console.error("");
  process.exit(1);
}

console.log(
  "OK active Firebase alias matches expected target (" + expectedAlias + " = " + expected + ")"
);
