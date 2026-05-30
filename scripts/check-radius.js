#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Radius lint. Mirrors scripts/check-z-index.js.
 *
 * Flags raw border-radius / borderRadius px values in scanned dirs,
 * pushing all new code through the token system (see docs/design-
 * tokens.md "Radius Registry" and src/styles.js Radius export).
 *
 * Allowed:
 *   - var(--radius-*)              CSS modules
 *   - Radius.*                     JSX inline styles
 *   - 0, 0px, 0%                   zero is zero, no token needed
 *   - inherit / unset / initial    keyword forms
 *   - values inside a comment      // or /* prefix lines
 *   - lines with `radius-allow`    explicit per-site escape hatch
 *
 * Not allowed in src/screens, src/dom_components, src/shared:
 *   - border-radius: 8px           (use var(--radius-row))
 *   - borderRadius: 8              (use Radius.row)
 *   - border-top-left-radius: 6px  (use var(--radius-control))
 *
 * Usage: node scripts/check-radius.js
 *        yarn lint:radius
 */
import { readFileSync, statSync, readdirSync } from "fs";
import { join, relative, sep } from "path";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");

const SCAN_DIRS = [
  join(SRC, "screens"),
  join(SRC, "dom_components"),
  join(SRC, "shared"),
];

const EXEMPT_PATHS = [
  join(SRC, "styles.js"),
  join(SRC, "styles") + sep,
];

const FILE_EXT = /\.(js|jsx|css)$/;

// CSS: border-radius: <value> where value starts with a digit
const CSS_RAW_RE = /\bborder(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;]+);/g;
// JSX: borderRadius: <number-literal>  (not Radius.*, not a variable)
const JS_RAW_RE = /\bborder(?:Top|Bottom)?(?:Left|Right)?Radius\s*:\s*(\d+(?:\.\d+)?|"[^"]+"|'[^']+')/g;

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

function isAllowedValue(raw) {
  const v = raw.trim();
  if (v.startsWith("var(--radius-")) return true;
  if (v.startsWith("Radius.")) return true;
  if (v === "0" || v === "0px" || v === "0%") return true;
  if (/^(inherit|unset|initial|revert|revert-layer)$/.test(v)) return true;
  // shorthand: every part must be allowed
  if (/\s/.test(v)) {
    const parts = v.split(/\s+/);
    return parts.every((p) => isAllowedValue(p));
  }
  return false;
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
    if (/radius-allow/.test(line)) continue;
    if (i > 0 && /radius-allow/.test(lines[i - 1])) continue;

    if (isCss) {
      CSS_RAW_RE.lastIndex = 0;
      let m;
      while ((m = CSS_RAW_RE.exec(line)) !== null) {
        const value = m[1].trim();
        if (isAllowedValue(value)) continue;
        hits.push({ line: i + 1, value, text: line.trim().slice(0, 120) });
        total++;
      }
    } else {
      JS_RAW_RE.lastIndex = 0;
      let m;
      while ((m = JS_RAW_RE.exec(line)) !== null) {
        const value = m[1].trim();
        const stripped = value.replace(/^["']|["']$/g, "");
        if (stripped === "0" || stripped === "0px") continue;
        hits.push({ line: i + 1, value, text: line.trim().slice(0, 120) });
        total++;
      }
    }
  }
  if (hits.length) offenders.push({ file: relative(ROOT, f), hits });
}

if (offenders.length === 0) {
  console.log(
    "\u2713 radius check: no raw border-radius / borderRadius values in scanned dirs.",
  );
  process.exit(0);
}

console.log(`radius check: ${total} offender(s) in ${offenders.length} file(s):\n`);
for (const o of offenders) {
  console.log(`  ${o.file}`);
  for (const h of o.hits.slice(0, 5)) {
    console.log(`    L${h.line}  ${h.value}  ${h.text}`);
  }
  if (o.hits.length > 5) console.log(`    ... +${o.hits.length - 5} more`);
}
console.log(
  "\nUse var(--radius-{container|row|control|pill}) in CSS or Radius.{container|row|control|pill} in JSX.",
);
console.log("Per-site escape hatch: add // radius-allow: <reason> on or above the line.");
process.exit(1);
