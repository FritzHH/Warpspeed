# Phase 4 Bridge Layer - Preview Diff

> Status: DRAFT - not applied. This document is the exact change that will be made to `src/styles.js` and `src/utils.js` when Phase 4 executes. Reviewed and approved here = mechanical apply at execution time.

## Pre-flight Checklist (verify before applying)

1. [ ] `src/styles/tokens.css` exists (Phase 3 complete)
2. [ ] `tokens.css` imported from `src/index.js` and verified live in DevTools
3. [ ] No other agent currently editing `src/styles.js` or `src/utils.js`

---

## Change 1 - `src/styles.js`

### Remove dead refs (decision #6)

```diff
 export const C = {
   green: "rgb(33, 148, 86)",
-  purple: "",
   orange: "rgb(230, 126, 34)",
   blue: "rgb(53, 135, 210)",
```

`C.purple` (3 call sites) renders as `color: ""` today - a silent bug. After removal, the 3 callers will throw `undefined` which is loud and easy to fix. Pre-fix those 3 callers in the same PR:

```bash
grep -rn "C\.purple" src/
# expected: 3 hits to fix
```

`C.textMain` and `C.darkText` are referenced but never defined on `C` - no action needed in styles.js, but the 2 caller sites need cleanup:

```bash
grep -rn "C\.textMain\|C\.darkText" src/
# expected: 2 hits, both currently produce undefined
```

### Add semantic aliases (the bridge)

```diff
 export const C = {
   green: "rgb(33, 148, 86)",
   orange: "rgb(230, 126, 34)",
   blue: "rgb(53, 135, 210)",
   lightred: "rgb(227, 116, 112)",
   cursorRed: "#ff6b6b",
   red: lightenRGBByPercent(getRgbFromNamedColor("red"), 10),

   backgroundWhite: lightenRGBByPercent("rgb(240, 241, 251)", 45),
   backgroundGreen: "rgb(232, 243, 239)",
   backgroundListWhite: "rgb(251, 251, 254)",

   listItemWhite: "rgb(254, 254, 255)",
   listItemBorder: gray(0.05),

   buttonLightGreen: "rgb(232, 239, 245)",
   buttonLightGreenOutline: "rgb(200, 228, 220)",

   darkBlue: "rgb(30, 80, 140)",
   text: lightenRGBByPercent("rgb(0,0,0)", 28),
   lightText: gray(0.42),
   textWhite: "rgb(255, 255, 255)",
+
+  // ============================================================
+  // SEMANTIC TOKEN ALIASES (Phase 4 bridge)
+  // ------------------------------------------------------------
+  // These resolve to CSS custom properties defined in
+  // src/styles/tokens.css. Source of truth: docs/design-tokens.md
+  //
+  // PREFER THESE NAMES IN NEW CODE.
+  // The non-aliased properties above are kept for backward
+  // compatibility and will be retired in Phase 9.
+  // ============================================================
+
+  // Surfaces
+  surfaceBase:           "var(--surface-base)",
+  surfaceAlt:            "var(--surface-alt)",
+  surfaceRaised:         "var(--surface-raised)",
+  surfaceAccentMuted:    "var(--surface-accent-muted)",
+  surfaceSuccessMuted:   "var(--surface-success-muted)",
+  surfaceOverlay:        "var(--surface-overlay)",
+  surfaceOverlayLight:   "var(--surface-overlay-light)",
+  surfaceOverlayHeavy:   "var(--surface-overlay-heavy)",
+
+  // Borders
+  borderSubtle:          "var(--border-subtle)",
+  borderDefault:         "var(--border-default)",
+  borderStrong:          "var(--border-strong)",
+  borderFocus:           "var(--border-focus)",
+
+  // Text
+  textStrong:            "var(--text-strong)",
+  textDefault:           "var(--text-default)",
+  textSecondary:         "var(--text-secondary)",
+  textMuted:             "var(--text-muted)",
+  textDisabled:          "var(--text-disabled)",
+  textInverse:           "var(--text-inverse)",
+  textOnAccent:          "var(--text-on-accent)",
+
+  // Accent & status
+  accent:                "var(--accent)",
+  accentHover:           "var(--accent-hover)",
+  success:               "var(--success)",
+  info:                  "var(--info)",
+  infoStrong:            "var(--info-strong)",
+  warning:               "var(--warning)",
+  danger:                "var(--danger)",
+  dangerMuted:           "var(--danger-muted)",
+  dangerStrong:          "var(--danger-strong)",
+
+  // Shadows (color only)
+  shadowColorSubtle:     "var(--shadow-color-subtle)",
+  shadowColorDefault:    "var(--shadow-color-default)",
+  shadowColorAccent:     "var(--shadow-color-accent)",
 };
```

### Add `resolveToken()` helper

For the rare cases that need a literal RGB instead of `var()` (canvas, jsPDF, chart libs, programmatic color math):

```diff
 export const C = { ... };
+
+/**
+ * Resolve a CSS custom property to its computed RGB value.
+ * Use ONLY for non-CSS contexts: canvas drawing, jsPDF, chart libs,
+ * programmatic color math. In CSS / inline-style contexts use the
+ * C.* aliases directly - they're var(--...) and themable.
+ *
+ * @param {string} tokenName - token name WITHOUT leading "--"
+ *                             e.g. "text-muted" not "--text-muted"
+ * @returns {string} computed rgb()/rgba() string
+ */
+export function resolveToken(tokenName) {
+  return getComputedStyle(document.documentElement)
+    .getPropertyValue(`--${tokenName}`)
+    .trim();
+}
```

---

## Change 2 - `src/utils.js`

Remove dead-code line in `gray()`:

```diff
 export function gray(u, alpha = 1) {
   // u in [0,1]: 0 -> white (255), 1 -> black (0)
   let x = Number(u);
   if (!Number.isFinite(x)) x = 0;
   x = Math.min(1, Math.max(0, x));
   const v = Math.round((1 - x) * 255);

   alpha = Math.min(1, Math.max(0, Number(alpha)));
   return alpha === 1 ? `rgb(${v},${v},${v})` : `rgba(${v},${v},${v},${alpha})`;
-  return "rgba(0,0,0," + opacity + ")";
 }
```

This is unreachable code from a previous implementation - harmless but a smell. Remove during the bridge PR.

---

## Change 3 - No changes to component files

This phase is **additive only** for component code. No existing call site changes. New tokens are available for use; old tokens keep working.

Verify post-apply with:
```bash
yarn build  # must compile clean
grep -rn "C\.purple\|C\.textMain\|C\.darkText" src/  # must return 0 hits
```

---

## Sanity Tests After Apply

1. **App renders unchanged.** Open Items tab, Info tab, a modal. No visual diffs.
2. **DevTools check:** `getComputedStyle(document.documentElement).getPropertyValue('--text-default')` returns expected value.
3. **One-component smoke test:** open a component file (e.g. `src/screens/screen_components/Info_Screen/Info_ActiveWorkorder.js`), change one `style={{ color: C.text }}` to `style={{ color: C.textDefault }}` temporarily, verify no visual diff, then revert.
4. **Build clean:** `yarn build` compiles without warnings.

---

## Estimated Apply Time

- Edit `src/styles.js`: 5 minutes (mostly verifying indentation)
- Edit `src/utils.js`: 30 seconds
- Fix the 3 `C.purple` callers + 2 `C.textMain`/`C.darkText` callers: 5 minutes
- Build + smoke test: 5 minutes
- **Total: ~15 minutes**

---

## Rollback Plan

If anything goes wrong:
```bash
git checkout src/styles.js src/utils.js
```

Bridge aliases are additive - reverting removes them without touching any caller. Zero blast radius.
