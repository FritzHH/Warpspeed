# LabelDesignerModalV2 — Pure DOM/CSS Migration Plan

**File:** `src/screens/screen_components/modal_screens/LabelDesignerModalV2.js` (1153 lines)
**Goal:** Remove all `react-native-web` and `components.js` (RN-web) imports. End state: pure DOM elements + `dom_components/` + a `LabelDesignerModalV2.module.css`.

---

## Scope confirmation

In scope:
- The single file `LabelDesignerModalV2.js`
- A new sibling `LabelDesignerModalV2.module.css`

Out of scope:
- `LabelDesignerModal.js` (the old V1 file) — leave untouched
- `labelPrintBuilder.js`, `dbSavePrintObj`, `workerSearchInventory` — framework-agnostic, no changes
- Behavior changes (this is a refactor, not a feature change)

---

## Step 1 — Audit & swap list

Produce, before touching code, a concrete list of:
1. Every `<View>`, `<Text>`, `<TouchableOpacity>`, `<TouchableWithoutFeedback>` occurrence (count + JSX region).
2. Every import from `../../../components` that needs swapping (`Button_`, `TextInput_`, `DropdownMenu`, `Image_`).
3. Every RN-only style prop in use: `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`, `paddingVertical`, `paddingHorizontal`, `marginVertical`, `marginHorizontal`, `tintColor`.
4. Every `ReactDOM.createPortal` call site (expect 1).

Deliverable: a short table in the PR description so the reviewer can verify nothing was missed.

---

## Step 2 — Create `LabelDesignerModalV2.module.css`

Move **static structural styles only** to the CSS Module. Per CLAUDE.md sizing rules: percentages of parent, `flex-shrink: 0` on every percentage-sized child, no `vw/vh/rem/em`, no media queries.

CSS Module will cover:
- Modal backdrop + portal container
- Two-pane root layout (sidebar / canvas area)
- Sidebar sections (label size picker, field list, field properties panel)
- Canvas frame (the chrome around the label, not the label itself)
- Toolbar / footer rows
- Field list row hover and selected states

Stays **inline** (dynamic, per-render):
- Canvas width/height (driven by `sLabelSize.width * scale`)
- Each field's `x / y / width / height / fontSize / transform`
- Drag/resize visual feedback driven by state
- Any color computed from `lightenRGBByPercent` / `gray()` based on selection state

---

## Step 3 — Swap imports

```diff
- import ReactDOM from "react-dom";
- import {
-   View,
-   Text,
-   TouchableOpacity,
-   TouchableWithoutFeedback,
- } from "react-native-web";
- import {
-   Button_,
-   TextInput_,
-   DropdownMenu,
-   Image_,
- } from "../../../components";
- import { CheckBox } from "../../../dom_components";
+ import ReactDOM from "react-dom";
+ import {
+   Button,
+   TextInput,
+   DropdownMenu,
+   Image,
+   CheckBox,
+   TouchableOpacity,
+ } from "../../../dom_components";
+ import styles from "./LabelDesignerModalV2.module.css";
```

`ReactDOM.createPortal` stays. (Decision: keep the existing portal call rather than swap to `ScreenModal` — smaller diff, lower regression risk. Revisit later if desired.)

---

## Step 4 — JSX conversion, region by region

One commit per region so a regression bisects cleanly. Order:

1. **Modal shell + portal wrapper** (around line 944)
2. **Sidebar — label size picker + field list**
3. **Sidebar — field properties panel** (line ~291 and surrounding)
4. **Canvas frame + canvas div** (line ~1068)
5. **`CanvasField` + `ResizeHandle` sub-components** (lines ~143–215)
6. **Footer / action buttons**

Per region, the mechanical swaps are:
- `<View style={…}>` → `<div className={styles.X} style={dynamicOnly}>`
- `<Text style={…}>` → `<span>` or `<div>` (block vs inline by context)
- `<TouchableOpacity onPress={…}>` → `<TouchableOpacity onClick={…}>` from `dom_components` (note: `onPress` → `onClick`)
- `<TouchableWithoutFeedback onPress={…}>` → `<div onClick={…}>`
- `Button_ colorGradientArr={…} text="…" />` → `<Button …>` (verify prop names against `dom_components/Button/Button.js`)
- `<TextInput_ … />` → `<TextInput … />` (verify prop names)
- `<DropdownMenu … />` (RN) → `<DropdownMenu … />` (DOM) — same name, different module; verify prop parity
- `<Image_ source={…} />` → `<Image src={…} />` (verify prop name)
- Existing `onMouseDown` / `getBoundingClientRect` handlers stay as-is — already DOM-native.

---

## Step 5 — Translate RN-only style props

- `shadowColor / shadowOffset / shadowOpacity / shadowRadius` → single `boxShadow` string. (If the file already uses `SHADOW_PROTO`-style objects, replace with `dom_components/shadows.js` equivalents.)
- `paddingVertical: N` → `paddingTop: N, paddingBottom: N`
- `paddingHorizontal: N` → `paddingLeft: N, paddingRight: N`
- Same pattern for `marginVertical / marginHorizontal`
- `tintColor` on an `Image_` → either swap to an SVG, or wrap the `<Image>` in a div with `filter:` — decide per occurrence
- Numeric pixel values (`fontSize: 14`, `width: 200`) stay numeric — React handles unitless → px on standard CSS props

---

## Step 6 — Sanity checks before declaring done

1. `grep -n "react-native-web" src/screens/screen_components/modal_screens/LabelDesignerModalV2.js` → zero hits.
2. `grep -nE "Button_|TextInput_|Image_|\\bView\\b|\\bText\\b" …` → zero hits inside the file.
3. `yarn start` boots clean, no console warnings from the modal mounting.
4. Open the modal from `Dashboard_Admin.js` → renders.
5. Pick each of the 8 label sizes → canvas resizes correctly.
6. Add a text field, drag it, resize it, edit its properties → all work.
7. Add a barcode field, verify barcode snaps to a valid module width.
8. Save → `dbSavePrintObj` writes correctly (verify in Firestore).
9. Load a saved layout from `localStorageWrapper` → field positions restored.
10. Print preview / `labelPrintBuilder` output unchanged (visual diff against a pre-migration screenshot).

---

## Step 7 — Cleanup

- Remove any imports left dangling after swaps.
- Confirm the new CSS Module has no unused classes.
- No `// removed` comments, no compatibility shims (per project rules).
- No new `useEffect` was added (none should be needed — this is a pure swap).

---

## Risks & open questions

1. **Prop name parity between `Button_` and `Button` (DOM).** The DOM `Button` may not accept `colorGradientArr` directly; might need `gradientColors` or similar. Verify in step 1 audit and adjust the swap list before step 4.
2. **`DropdownMenu` (RN) vs `DropdownMenu` (DOM) prop parity.** Same risk. Verify.
3. **`Image_` `source` vs `Image` `src`.** Same risk. Verify.
4. **`ReactDOM.createPortal` target.** If it currently mounts to `document.body`, confirm nothing in the new CSS Module assumes a different parent.
5. **z-index stacking.** The portal currently sits above everything. Confirm the new CSS Module preserves this (likely a `z-index` on the backdrop).

---

## Commit plan

1. `chore(label-designer): create empty CSS module + audit swap list` (the audit doc goes in the PR body, not the repo)
2. `refactor(label-designer): swap imports to dom_components`
3. `refactor(label-designer): convert modal shell + portal to DOM`
4. `refactor(label-designer): convert sidebar to DOM`
5. `refactor(label-designer): convert canvas frame + CanvasField to DOM`
6. `refactor(label-designer): convert footer to DOM`
7. `style(label-designer): translate RN-only style props`
8. `chore(label-designer): remove dead imports, final sweep`

Each commit should leave the modal in a working (renderable, not necessarily pixel-perfect) state.

---

## Estimated effort

- Steps 1–2: ~30 min (audit + CSS module skeleton)
- Steps 3–4: ~2–3 hours (the bulk — JSX swaps across 1153 lines)
- Step 5: ~30 min (RN-only style props)
- Step 6: ~30 min (sanity checks)
- Step 7: ~15 min

**Total:** ~4–5 hours focused work, single PR, ~8 commits.
