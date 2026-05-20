#!/usr/bin/env node
/* eslint-disable no-console */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const callRe = /\bgray\s*\(/;
let cleaned = 0;
for (const file of walk(SRC)) {
  let src = readFileSync(file, "utf8");
  if (!/\bgray\b/.test(src)) continue;
  // Skip the utils definition file
  if (file.endsWith("utils.js")) continue;
  if (callRe.test(src)) continue; // still has calls — leave it

  const original = src;
  // Remove gray from any import statement
  src = src.replace(
    /import\s*\{\s*([^}]*)\s*\}\s*from\s*(["'][^"']*["'])\s*;?/g,
    (m, names, from) => {
      if (!/\bgray\b/.test(names)) return m;
      const filtered = names.split(",").map(s => s.trim()).filter(s => s && s !== "gray").join(", ");
      if (!filtered) return ""; // remove whole import line
      return `import { ${filtered} } from ${from};`;
    }
  );

  if (src !== original) {
    try {
      writeFileSync(file, src, "utf8");
      cleaned++;
      console.log(`  ${file}`);
    } catch (err) {
      console.log(`  SKIP (${err.code}) ${file}`);
    }
  }
}
console.log(`Cleaned ${cleaned} files.`);
