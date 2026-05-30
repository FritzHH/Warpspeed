#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Migrate raw border-radius / borderRadius px values to the radius
 * token system (see docs/design-tokens.md "Radius Registry").
 *
 *   container  12px  modals, panels, large cards
 *   row         8px  list rows, smaller cards
 *   control     6px  buttons, inputs, dropdowns, chips
 *   pill     9999px  fully rounded (badges, toggles, avatars)
 *
 * Value mapping (value-based, since per-component classification
 * across 179 files isn't tractable in one pass):
 *
 *   1-7px         -> control
 *   8-10px        -> row
 *   11-29px       -> container
 *   30px+         -> pill
 *   50%, 100%     -> pill
 *
 *   0 / 0px       -> left as-is
 *   var(--...)    -> left as-is (already migrated)
 *   non-numeric   -> left as-is (inherit, unset, calc(), etc.)
 *
 * CSS files: writes var(--radius-XXX)
 * JS/JSX:    writes Radius.XXX and inserts/merges the import
 *
 * Shorthand (e.g. "border-radius: 8px 8px 0 0") is supported -
 * each part is mapped independently, zeros preserved.
 *
 * Skips:
 *   - src/styles/tokens.css     (token definitions)
 *   - src/styles.js             (Radius export)
 *   - src/utils.js              (jsPDF / canvas helpers - raw px)
 *   - src/db_calls.js           (jsPDF receipts - raw px)
 *   - src/App.jsx               (root-level animation values)
 *
 * Usage:
 *   node scripts/migrate-radius.js --dry         # preview
 *   node scripts/migrate-radius.js               # apply
 *   node scripts/migrate-radius.js -v            # verbose per-file
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname, sep } from "path";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");
const SCAN_DIRS = [
  join(SRC, "screens"),
  join(SRC, "dom_components"),
  join(SRC, "shared"),
];

const DRY_RUN = process.argv.includes("--dry");
const VERBOSE = process.argv.includes("-v") || process.argv.includes("--verbose");

const SKIP_FILES = new Set([
  join(SRC, "styles.js"),
  join(SRC, "App.jsx"),
  join(SRC, "utils.js"),
  join(SRC, "db_calls.js"),
  join(SRC, "styles", "tokens.css"),
]);

// ---------------------------------------------------------------
// Bucket mapping
// ---------------------------------------------------------------
function mapValue(raw) {
  const v = raw.trim();
  if (v === "0" || v === "0px" || v === "0%") return null; // leave zero
  if (v.startsWith("var(")) return null;
  if (/^(50%|100%)$/.test(v)) return "pill";
  // numeric with px or no unit (JSX bare numbers are px-equivalent)
  const m = v.match(/^(\d+(?:\.\d+)?)(px)?$/);
  if (!m) return null;
  const px = parseFloat(m[1]);
  if (px === 0) return null;
  if (px >= 30) return "pill";
  if (px >= 11) return "container";
  if (px >= 8) return "row";
  if (px >= 1) return "control";
  return null;
}

const cssToken = (bucket) => `var(--radius-${bucket})`;
const jsToken  = (bucket) => `Radius.${bucket}`;

// ---------------------------------------------------------------
// CSS file processing
// ---------------------------------------------------------------
function processCss(content) {
  let changed = 0;
  const sites = [];

  // border-radius: <values>;
  content = content.replace(/border-radius:\s*([^;]+);/g, (m, val) => {
    const original = val.trim();
    if (original.startsWith("var(")) return m;
    const parts = original.split(/\s+/);
    let touched = false;
    const mapped = parts.map((p) => {
      if (p === "0" || p === "0px" || p === "0%") return "0";
      const bucket = mapValue(p);
      if (!bucket) return p;
      touched = true;
      return cssToken(bucket);
    });
    if (!touched) return m;
    changed++;
    sites.push(`border-radius: ${original} -> ${mapped.join(" ")}`);
    return `border-radius: ${mapped.join(" ")};`;
  });

  // border-{top|bottom}-{left|right}-radius: <value>;
  content = content.replace(
    /border-(top|bottom)-(left|right)-radius:\s*([^;]+);/g,
    (m, vh, lr, val) => {
      const original = val.trim();
      if (original.startsWith("var(")) return m;
      if (original === "0" || original === "0px") return m;
      const bucket = mapValue(original);
      if (!bucket) return m;
      changed++;
      sites.push(`border-${vh}-${lr}-radius: ${original} -> ${cssToken(bucket)}`);
      return `border-${vh}-${lr}-radius: ${cssToken(bucket)};`;
    },
  );

  return { content, changed, sites };
}

// ---------------------------------------------------------------
// JS / JSX file processing
// ---------------------------------------------------------------
function processJs(filePath, content) {
  let changed = 0;
  const sites = [];

  const replaceProp = (propName) => {
    // borderRadius: NUMBER   (no quotes; pure literal)
    // borderRadius: "8px"    (string literal with px)
    // borderRadius: "50%"    (string percent)
    const re = new RegExp(
      `(\\b${propName}\\s*:\\s*)(?:(\\d+(?:\\.\\d+)?)\\b|"([^"]+)"|'([^']+)')`,
      "g",
    );
    content = content.replace(re, (m, prefix, num, dq, sq) => {
      const raw = num !== undefined ? num : dq !== undefined ? dq : sq;
      if (raw === undefined) return m;
      const trimmed = String(raw).trim();
      if (trimmed === "0" || trimmed === "0px") return m;
      // Convert bare JS number to px-equivalent for mapping
      let valueForMap = trimmed;
      if (num !== undefined) valueForMap = `${trimmed}px`;
      const bucket = mapValue(valueForMap);
      if (!bucket) return m;
      changed++;
      sites.push(`${propName}: ${raw} -> ${jsToken(bucket)}`);
      return `${prefix}${jsToken(bucket)}`;
    });
  };

  replaceProp("borderRadius");
  replaceProp("borderTopLeftRadius");
  replaceProp("borderTopRightRadius");
  replaceProp("borderBottomLeftRadius");
  replaceProp("borderBottomRightRadius");

  if (changed > 0) {
    content = ensureRadiusImport(filePath, content);
  }

  return { content, changed, sites };
}

// ---------------------------------------------------------------
// Import management - merge Radius into existing styles import,
// or insert a new one.
// ---------------------------------------------------------------
function ensureRadiusImport(filePath, content) {
  // If Radius is already referenced via an import, leave alone.
  if (/\bimport\s*\{[^}]*\bRadius\b[^}]*\}\s*from\s*["'][^"']*styles["']/.test(content)) {
    return content;
  }

  // Compute the import specifier from this file to src/styles.js
  const fileDir = dirname(filePath);
  let rel = relative(fileDir, join(SRC, "styles.js"))
    .replace(/\\/g, "/")
    .replace(/\.js$/, "");
  if (!rel.startsWith(".")) rel = "./" + rel;

  // Try to merge into an existing `import { ... } from "...styles..."` line
  const importRe = /import\s*\{([^}]+)\}\s*from\s*(["'])([^"']*styles[^"']*)\2/;
  const match = content.match(importRe);
  if (match) {
    const inside = match[1];
    const names = inside.split(",").map((n) => n.trim()).filter(Boolean);
    if (!names.includes("Radius")) names.push("Radius");
    const replacement = `import { ${names.join(", ")} } from ${match[2]}${match[3]}${match[2]}`;
    return content.replace(importRe, replacement);
  }

  // No styles import found - prepend one after the last import line.
  const lines = content.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\b/.test(lines[i])) lastImport = i;
  }
  const newImport = `import { Radius } from "${rel}";`;
  if (lastImport === -1) {
    return `${newImport}\n${content}`;
  }
  lines.splice(lastImport + 1, 0, newImport);
  return lines.join("\n");
}

// ---------------------------------------------------------------
// File walker
// ---------------------------------------------------------------
function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, entry.name);
    if (entry.isDirectory()) walk(fp, files);
    else files.push(fp);
  }
  return files;
}

function isTarget(fp) {
  if (SKIP_FILES.has(fp)) return false;
  if (/\.module\.css$/.test(fp)) return true;
  if (/\.css$/.test(fp)) return true;
  if (/\.jsx?$/.test(fp)) return true;
  return false;
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
function main() {
  const files = [];
  for (const dir of SCAN_DIRS) files.push(...walk(dir));
  const targets = files.filter(isTarget);

  let totalFiles = 0;
  let totalChanges = 0;
  const perFile = [];

  for (const fp of targets) {
    const original = readFileSync(fp, "utf8");
    const isCss = /\.css$/.test(fp);
    const { content, changed, sites } = isCss
      ? processCss(original)
      : processJs(fp, original);

    if (changed > 0) {
      totalFiles++;
      totalChanges += changed;
      perFile.push({ fp, changed, sites });
      if (!DRY_RUN) writeFileSync(fp, content, "utf8");
    }
  }

  console.log(
    `${DRY_RUN ? "[DRY] " : ""}${totalFiles} files changed, ${totalChanges} sites replaced.`,
  );

  if (VERBOSE) {
    for (const f of perFile) {
      console.log(`\n${relative(ROOT, f.fp)} (${f.changed})`);
      for (const s of f.sites) console.log(`  ${s}`);
    }
  } else {
    for (const f of perFile.slice(0, 25)) {
      console.log(`  ${relative(ROOT, f.fp).replace(/\\/g, "/")} (${f.changed})`);
    }
    if (perFile.length > 25) {
      console.log(`  ... and ${perFile.length - 25} more files`);
    }
  }
}

main();
