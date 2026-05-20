#!/usr/bin/env node
/* eslint-disable no-console */
import { readFileSync, statSync, readdirSync } from "fs";
import { join, relative, sep } from "path";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");

const SCAN_DIRS = [
  join(SRC, "screens"),
  join(SRC, "dom_components"),
];

const EXEMPT_PATHS = [
  join(SRC, "styles.js"),
  join(SRC, "styles") + sep,
  join(SRC, "ColorWheel.js"),
];

const PATTERNS = [
  { name: "hex literal", re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: "rgb()", re: /\brgb\s*\(/ },
  { name: "rgba()", re: /\brgba\s*\(/ },
  { name: "gray()", re: /\bgray\s*\(/ },
];

const FILE_EXT = /\.(js|jsx|css)$/;

function isExempt(p) {
  return EXEMPT_PATHS.some((ex) => p.startsWith(ex));
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (FILE_EXT.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(d));
let total = 0;
const offenders = [];

for (const f of files) {
  if (isExempt(f)) continue;
  const content = readFileSync(f, "utf8");
  const lines = content.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip comment-only lines and lines that already use var(--)
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) {
        hits.push({ line: i + 1, kind: name, text: line.trim().slice(0, 120) });
        total++;
        break;
      }
    }
  }
  if (hits.length) offenders.push({ file: relative(ROOT, f), hits });
}

if (offenders.length === 0) {
  console.log("\u2713 token check: no raw colors in scanned dirs.");
  process.exit(0);
}

console.log(`token check: ${total} raw-color reference(s) in ${offenders.length} file(s):\n`);
for (const o of offenders) {
  console.log(`  ${o.file}`);
  for (const h of o.hits.slice(0, 5)) {
    console.log(`    L${h.line}  (${h.kind})  ${h.text}`);
  }
  if (o.hits.length > 5) console.log(`    ... +${o.hits.length - 5} more`);
}
console.log("\nUse semantic tokens from src/styles/tokens.css (via C.* aliases or var(--*)).");
process.exit(0);
