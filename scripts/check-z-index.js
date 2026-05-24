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
  join(SRC, "App.jsx"),
];

const EXEMPT_PATHS = [
  join(SRC, "styles.js"),
  join(SRC, "styles") + sep,
  // Tooltip and Toast still consume claimZ / var(--z-*) directly; pending
  // migration to useZ by their owning agent. Remove these exemptions once
  // they switch to the useZ hook.
  join(SRC, "dom_components", "Tooltip") + sep,
  join(SRC, "dom_components", "Toast") + sep,
];

// Values below THRESHOLD are treated as local sub-stacking within a parent
// stacking context and stay raw. Values >= THRESHOLD likely escape the parent
// context and should use useZ(band) instead.
const THRESHOLD = 500;

const CSS_RAW_RE = /z-index\s*:\s*(\d+)/g;
const JS_RAW_RE = /zIndex\s*:\s*(\d+)/g;

// Tokenized layers must consume z-index from useZ(band), not from static
// var(--z-*) or Z.* references. Those tokens are infrastructure for useZ
// and the claim allocator; components do not consume them directly.
const CSS_TOKEN_RE = /var\(\s*--z-(modal|dropdown|tooltip|toast|alert|debug)[^)]*\)/g;
const JS_TOKEN_RE = /\bZ\.(modal|dropdown|tooltip|toast|alert|debug)\b/g;
const JS_CLAIM_RE = /\b(claimZ|releaseZ)\s*\(/g;

const FILE_EXT = /\.(js|jsx|css)$/;

function isExempt(p) {
  return EXEMPT_PATHS.some((ex) => p.startsWith(ex));
}

function walk(target, out = []) {
  let st;
  try {
    st = statSync(target);
  } catch {
    return out;
  }
  if (st.isFile()) {
    if (FILE_EXT.test(target)) out.push(target);
    return out;
  }
  for (const entry of readdirSync(target)) {
    walk(join(target, entry), out);
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
  const isCss = f.endsWith(".css");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
    // Allowlist: same line or previous line has "z-allow" marker
    if (/z-allow/.test(line)) continue;
    if (i > 0 && /z-allow/.test(lines[i - 1])) continue;

    if (isCss) {
      CSS_RAW_RE.lastIndex = 0;
      let m;
      while ((m = CSS_RAW_RE.exec(line)) !== null) {
        const value = parseInt(m[1], 10);
        if (value >= THRESHOLD) {
          hits.push({ line: i + 1, kind: "raw", value, text: line.trim().slice(0, 120) });
          total++;
        }
      }
      CSS_TOKEN_RE.lastIndex = 0;
      while ((m = CSS_TOKEN_RE.exec(line)) !== null) {
        hits.push({ line: i + 1, kind: "token", value: `var(--z-${m[1]})`, text: line.trim().slice(0, 120) });
        total++;
      }
    } else {
      JS_RAW_RE.lastIndex = 0;
      let m;
      while ((m = JS_RAW_RE.exec(line)) !== null) {
        const value = parseInt(m[1], 10);
        if (value >= THRESHOLD) {
          hits.push({ line: i + 1, kind: "raw", value, text: line.trim().slice(0, 120) });
          total++;
        }
      }
      JS_TOKEN_RE.lastIndex = 0;
      while ((m = JS_TOKEN_RE.exec(line)) !== null) {
        hits.push({ line: i + 1, kind: "token", value: `Z.${m[1]}`, text: line.trim().slice(0, 120) });
        total++;
      }
      JS_CLAIM_RE.lastIndex = 0;
      while ((m = JS_CLAIM_RE.exec(line)) !== null) {
        hits.push({ line: i + 1, kind: "claim", value: `${m[1]}()`, text: line.trim().slice(0, 120) });
        total++;
      }
    }
  }
  if (hits.length) offenders.push({ file: relative(ROOT, f), hits });
}

if (offenders.length === 0) {
  console.log(`\u2713 z-index check: no raw values >= ${THRESHOLD}, var(--z-*), Z.*, or claimZ()/releaseZ() in scanned dirs.`);
  process.exit(0);
}

console.log(`z-index check: ${total} offender(s) in ${offenders.length} file(s):\n`);
for (const o of offenders) {
  console.log(`  ${o.file}`);
  for (const h of o.hits.slice(0, 5)) {
    console.log(`    L${h.line}  [${h.kind}=${h.value}]  ${h.text}`);
  }
  if (o.hits.length > 5) console.log(`    ... +${o.hits.length - 5} more`);
}
console.log(`\nPortal-stacked layers must claim from useZ(band) — see src/hooks/useZ.js and CLAUDE.md.`);
console.log(`Local sub-stacking (raw < ${THRESHOLD} inside a parent stacking context) may use a "z-allow" marker comment.`);
process.exit(1);
