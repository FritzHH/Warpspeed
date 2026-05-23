const fs = require("fs");
const path = require("path");

const expected = process.argv[2];
if (!expected) {
  console.error("Usage: node scripts/verify-build-target.js <bonita|rss>");
  process.exit(1);
}

const rebuildScript = expected === "bonita" ? "hostwarp" : "hostrss";
const buildScript = `build:${expected}`;

const targetFile = path.join(__dirname, "..", "build", ".target");
if (!fs.existsSync(targetFile)) {
  console.error("");
  console.error("X Cannot verify build target -- build/.target does not exist.");
  console.error("  Either build/ is missing or it predates the safety-net stamping.");
  console.error(`  Run \`yarn ${buildScript}\` to produce a fresh stamped build,`);
  console.error(`  or use \`yarn ${rebuildScript}\` to rebuild + deploy in one step.`);
  console.error("");
  process.exit(1);
}

const actual = fs.readFileSync(targetFile, "utf8").trim();
if (actual !== expected) {
  console.error("");
  console.error("X BUILD TARGET MISMATCH -- refusing to deploy.");
  console.error(`  Expected: ${expected}`);
  console.error(`  Actual:   ${actual} (last build was for a different tenant)`);
  console.error("");
  console.error(`  Run \`yarn ${rebuildScript}\` to rebuild for the right target and deploy in one step.`);
  console.error("");
  process.exit(1);
}

console.log(`OK build/.target matches expected target (${expected})`);
