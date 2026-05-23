const fs = require("fs");
const path = require("path");

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/stamp-build-target.js <bonita|rss>");
  process.exit(1);
}

const buildDir = path.join(__dirname, "..", "build");
if (!fs.existsSync(buildDir)) {
  console.error(`build/ directory not found at ${buildDir} — did vite build succeed?`);
  process.exit(1);
}

fs.writeFileSync(path.join(buildDir, ".target"), target);
console.log(`Stamped build/.target = ${target}`);
