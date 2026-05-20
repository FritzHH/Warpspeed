#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 9 migration: replace gray(0.x) calls with semantic tokens.
 * - JS files: C.textMuted / C.borderSubtle / C.surfaceAlt etc
 * - CSS files: var(--text-muted) / var(--border-subtle) etc
 * Context detected from the property name preceding the gray() call.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, sep } from "path";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");
const SCAN_DIRS = [join(SRC, "screens"), join(SRC, "dom_components")];

const DRY_RUN = process.argv.includes("--dry");
const VERBOSE = process.argv.includes("-v") || process.argv.includes("--verbose");

// gray(v) → semantic token by context.
// Context detection looks at the property being set on the gray() call.

const JS_TOKEN = {
  text: { 0.08: "textDisabled", 0.1: "textDisabled", 0.12: "textDisabled",
          0.15: "textDisabled", 0.18: "textDisabled", 0.2: "textDisabled",
          0.22: "textDisabled", 0.25: "textDisabled",
          0.3: "textDisabled", 0.33: "textDisabled", 0.35: "textDisabled", 0.38: "textDisabled",
          0.4: "textMuted", 0.42: "textMuted", 0.45: "textMuted",
          0.5: "textMuted", 0.52: "textMuted", 0.55: "textMuted",
          0.6: "textSecondary", 0.65: "textSecondary", 0.7: "textSecondary",
          0.75: "textSecondary", 0.8: "textSecondary",
          0.85: "textStrong", 0.88: "textStrong", 0.9: "textStrong", 0.95: "textStrong" },
  border: { 0.04: "borderSubtle", 0.05: "borderSubtle", 0.06: "borderSubtle",
            0.07: "borderSubtle", 0.075: "borderSubtle", 0.08: "borderSubtle",
            0.09: "borderSubtle", 0.1: "borderSubtle", 0.12: "borderSubtle",
            0.15: "borderSubtle", 0.18: "borderSubtle", 0.2: "borderSubtle",
            0.22: "borderSubtle", 0.25: "borderSubtle",
            0.3: "borderStrong", 0.35: "borderStrong", 0.4: "borderStrong",
            0.45: "borderStrong", 0.5: "borderStrong", 0.55: "borderStrong",
            0.6: "borderStrong", 0.65: "borderStrong", 0.7: "borderStrong",
            0.8: "borderStrong", 0.85: "borderStrong", 0.9: "borderStrong",
            0.92: "borderStrong", 0.95: "borderStrong", 0.97: "borderStrong" },
  bg: { 0.03: "surfaceAlt", 0.04: "surfaceAlt", 0.05: "surfaceAlt",
        0.06: "surfaceAlt", 0.07: "surfaceAlt", 0.075: "surfaceAlt",
        0.08: "surfaceAlt", 0.09: "surfaceAlt", 0.1: "surfaceAlt",
        0.12: "surfaceAlt", 0.15: "surfaceAlt", 0.18: "surfaceAlt",
        0.2: "surfaceAlt", 0.22: "surfaceAlt", 0.25: "surfaceAlt",
        0.3: "borderStrong", 0.4: "borderStrong", 0.5: "borderStrong",
        0.6: "borderStrong", 0.7: "borderStrong",
        0.85: "surfaceAlt", 0.9: "surfaceAlt", 0.92: "surfaceAlt",
        0.95: "surfaceAlt", 0.97: "surfaceAlt" },
};

const CSS_TOKEN = {
  text: { 0.08: "text-disabled", 0.1: "text-disabled", 0.12: "text-disabled",
          0.15: "text-disabled", 0.18: "text-disabled", 0.2: "text-disabled",
          0.22: "text-disabled", 0.25: "text-disabled",
          0.3: "text-disabled", 0.33: "text-disabled", 0.35: "text-disabled", 0.38: "text-disabled",
          0.4: "text-muted", 0.42: "text-muted", 0.45: "text-muted",
          0.5: "text-muted", 0.52: "text-muted", 0.55: "text-muted",
          0.6: "text-secondary", 0.65: "text-secondary", 0.7: "text-secondary",
          0.75: "text-secondary", 0.8: "text-secondary",
          0.85: "text-strong", 0.88: "text-strong", 0.9: "text-strong" },
  border: { 0.04: "border-subtle", 0.05: "border-subtle", 0.06: "border-subtle",
            0.07: "border-subtle", 0.075: "border-subtle", 0.08: "border-subtle",
            0.09: "border-subtle", 0.1: "border-subtle", 0.12: "border-subtle",
            0.15: "border-subtle", 0.18: "border-subtle", 0.2: "border-subtle",
            0.22: "border-subtle", 0.25: "border-subtle",
            0.3: "border-strong", 0.4: "border-strong", 0.5: "border-strong" },
  bg: { 0.03: "surface-alt", 0.04: "surface-alt", 0.05: "surface-alt",
        0.06: "surface-alt", 0.07: "surface-alt", 0.08: "surface-alt",
        0.1: "surface-alt", 0.12: "surface-alt", 0.15: "surface-alt",
        0.2: "surface-alt", 0.25: "surface-alt",
        0.3: "border-strong", 0.4: "border-strong", 0.5: "border-strong",
        0.6: "border-strong", 0.7: "border-strong",
        0.85: "surface-alt", 0.9: "surface-alt", 0.95: "surface-alt" },
};

// detect context from a small window of text preceding `gray(`.
// We scan backward looking for the nearest property identifier
// (color/border*/background*/placeholderTextColor/dashColor/textColor),
// allowing intervening ternaries, function calls, template literals, etc.
function detectContext(window) {
  // Find the nearest property declaration walking backward.
  // Match any of these in priority order; pick the one whose match-end is closest to the gray() call.
  const props = [
    { re: /\bbackground(?:-?color)?\s*[:=]/gi, kind: "bg" },
    { re: /\b(?:rowBg|cellBg|bgColor|bg)\s*=/gi, kind: "bg" },
    { re: /"--[\w-]*-?bg(?:-color)?"\s*:/gi, kind: "bg" },
    { re: /\bborder(?:-?(?:top|right|bottom|left))?(?:-?color)?\s*[:=]/gi, kind: "border" },
    { re: /\bborder\s*:\s*["'`]?\s*[0-9]+px\s+\w+\s+/gi, kind: "border" },
    { re: /1px\s+solid\s+(?:\$\{)?\s*$/gi, kind: "border" },
    { re: /\bdashColor\s*[:=]/gi, kind: "border" },
    { re: /\b\w*Border\s*=\s*[^;]*[:?]\s*$/gi, kind: "border" },
    { re: /"--[\w-]*-?border(?:-color)?"\s*:/gi, kind: "border" },
    { re: /\b(?:color|textColor|placeholderTextColor)\s*[:=]/gi, kind: "text" },
    { re: /\b(?:estimateColor|labelColor|valueColor|fontColor|titleColor)\s*[:=]/gi, kind: "text" },
    { re: /"--[\w-]*-?(?:color|text)"\s*:/gi, kind: "text" },
  ];
  let best = null;
  let bestEnd = -1;
  for (const p of props) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(window))) {
      const end = m.index + m[0].length;
      if (end > bestEnd) {
        bestEnd = end;
        best = p.kind;
      }
    }
  }
  return best;
}

function pickToken(map, ctx, val) {
  if (!ctx) return null;
  const m = map[ctx];
  if (!m) return null;
  if (m[val] != null) return m[val];
  // nearest neighbor within 0.05
  const keys = Object.keys(m).map(Number).sort((a, b) => Math.abs(a - val) - Math.abs(b - val));
  if (keys.length && Math.abs(keys[0] - val) <= 0.05) return m[keys[0]];
  return null;
}

function migrateFile(path) {
  const isCss = path.endsWith(".css");
  const TOKENS = isCss ? CSS_TOKEN : JS_TOKEN;
  let src = readFileSync(path, "utf8");
  const original = src;

  let replaced = 0;
  let unresolved = 0;
  const unresolvedDetails = [];

  // pattern: gray(0.x[x])
  const re = /\bgray\s*\(\s*([0-9]*\.?[0-9]+)\s*\)/g;
  src = src.replace(re, (match, valStr, offset) => {
    const val = parseFloat(valStr);
    const windowStart = Math.max(0, offset - 400);
    const window = src.slice(windowStart, offset);
    const ctx = detectContext(window);
    const tok = pickToken(TOKENS, ctx, val);
    if (!tok) {
      unresolved++;
      if (VERBOSE) unresolvedDetails.push({ val, window: window.slice(-80).replace(/\n/g, "\\n") });
      return match;
    }
    replaced++;
    return isCss ? `var(--${tok})` : `C.${tok}`;
  });

  // For JS files: if we replaced any gray() calls AND `gray` import exists, manage imports
  if (!isCss && replaced > 0) {
    const remainingGray = (src.match(re) || []).length;
    if (remainingGray === 0) {
      // Remove `gray` from imports
      src = src.replace(
        /import\s*\{\s*([^}]*)\s*\}\s*from\s*["']([^"']*utils[^"']*)["']\s*;?/g,
        (m, names, from) => {
          const filtered = names.split(",").map(s => s.trim()).filter(s => s && s !== "gray").join(", ");
          if (!filtered) return ""; // remove whole import if nothing left
          return `import { ${filtered} } from "${from}";`;
        }
      );
    }
    // Ensure `C` is imported from styles
    if (/\bC\./.test(src) && !/import\s*\{[^}]*\bC\b[^}]*\}\s*from\s*["'][^"']*styles["']/.test(src)) {
      // try to inject into an existing styles import
      const stylesImport = src.match(/import\s*\{\s*([^}]*)\s*\}\s*from\s*(["'][^"']*styles["'])\s*;?/);
      if (stylesImport) {
        const names = stylesImport[1].split(",").map(s => s.trim()).filter(Boolean);
        if (!names.includes("C")) names.unshift("C");
        const newImport = `import { ${names.join(", ")} } from ${stylesImport[2]};`;
        src = src.replace(stylesImport[0], newImport);
      } else {
        // no existing import — add one after first import
        const firstImport = src.match(/^import[^\n]*\n/m);
        if (firstImport) {
          // figure depth based on file path under src
          const depth = path.split(sep).slice(path.split(sep).indexOf("src") + 1).length - 1;
          const rel = "../".repeat(depth) + "styles";
          src = src.replace(firstImport[0], firstImport[0] + `import { C } from "${rel}";\n`);
        }
      }
    }
  }

  if (src !== original) {
    if (!DRY_RUN) {
      try {
        writeFileSync(path, src, "utf8");
      } catch (err) {
        return { path, replaced: 0, unresolved, unresolvedDetails, changed: false, error: err.code || err.message };
      }
    }
    return { path, replaced, unresolved, unresolvedDetails, changed: true };
  }
  return { path, replaced, unresolved, unresolvedDetails, changed: false };
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

let totalFiles = 0;
let totalReplaced = 0;
let totalUnresolved = 0;
const filesWithUnresolved = [];
const filesWithErrors = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const txt = readFileSync(file, "utf8");
    if (!/\bgray\s*\(/.test(txt)) continue;
    const r = migrateFile(file);
    if (r.error) {
      filesWithErrors.push({ path: file, error: r.error });
      continue;
    }
    if (r.changed) {
      totalFiles++;
      totalReplaced += r.replaced;
    }
    totalUnresolved += r.unresolved;
    if (r.unresolved > 0) filesWithUnresolved.push(r);
  }
}

console.log(`migrate-gray ${DRY_RUN ? "(dry run)" : ""}: ${totalReplaced} replacements across ${totalFiles} files; ${totalUnresolved} unresolved`);
if (filesWithErrors.length) {
  console.log(`\nERRORS (${filesWithErrors.length}):`);
  for (const e of filesWithErrors) console.log(`  ${e.error}  ${e.path}`);
}
if (VERBOSE && filesWithUnresolved.length) {
  for (const r of filesWithUnresolved) {
    console.log(`\n  ${r.path}: ${r.unresolved} unresolved`);
    for (const d of r.unresolvedDetails.slice(0, 5)) {
      console.log(`    gray(${d.val})  ...${d.window}`);
    }
  }
}
