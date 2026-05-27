/* eslint-disable */
// Predeploy hook: copy src/shared/ → functions/shared/, transforming ESM .js
// files into CommonJS so they're require()-able from functions/. .jsx, .css,
// and other non-.js files are skipped (Cloud Functions don't consume them).
//
// Why transform: src/shared/ files are authored as ESM so Vite/Rollup can
// statically analyze named exports. Cloud Functions run as CommonJS
// (`"type": "commonjs"` in functions/package.json), so the same files need to
// be rewritten with `exports.X = ...` before being require()'d.

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const SRC = path.join(__dirname, "..", "src", "shared");
const DST = path.join(__dirname, "..", "functions", "shared");

if (fs.existsSync(DST)) {
  fs.rmSync(DST, { recursive: true });
}
fs.mkdirSync(DST, { recursive: true });

const entries = fs.readdirSync(SRC, { withFileTypes: true });
let transformed = 0;
let skipped = 0;

for (const entry of entries) {
  if (!entry.isFile()) continue;
  const srcPath = path.join(SRC, entry.name);
  const ext = path.extname(entry.name);

  if (ext !== ".js") {
    // .jsx, .css, .module.css etc. — not consumed by functions.
    skipped++;
    continue;
  }

  const source = fs.readFileSync(srcPath, "utf8");
  const result = esbuild.transformSync(source, {
    loader: "js",
    format: "cjs",
    target: "node22",
    sourcefile: entry.name,
  });

  fs.writeFileSync(path.join(DST, entry.name), result.code);
  transformed++;
}

console.log(
  `sync-shared-to-functions: transformed ${transformed} .js files, skipped ${skipped} non-.js files`
);
