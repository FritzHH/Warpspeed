# Migration Plan — Dashboard → User Control (ExtensionSettings)

**Goal:** Migrate the User Control dashboard tab from react-native-web + inline JSX styling to pure DOM + CSS Modules, per the project transition described in CLAUDE.md.

**Scope:** One screen, two source files. Pure presentation refactor. No behavior, API, or DB changes.

---

## Files in scope

| File | Action |
|------|--------|
| `src/screens/screen_components/Items_Screen/dashboard_screen/Dashboard_User.js` | Light edit — drop the `<View flex:1>` wrapper, use a `<div>` |
| `src/screens/screen_components/Items_Screen/dashboard_screen/ExtensionSettings.js` | Full migration — RN primitives → DOM, inline styles → CSS Module |
| `src/screens/screen_components/Items_Screen/dashboard_screen/ExtensionSettings.module.css` | **New file** — all styles for the screen |

## Files explicitly out of scope

- `Dashboard_Admin.js`, `StandButtonsCanvas.js` — separate migrations
- `src/components.js` `Button_` — project-wide concern, addressed in its own pass
- Other dashboard tabs and screens

---

## Primitive replacement table

| react-native-web | DOM replacement | Notes |
|------------------|-----------------|-------|
| `View` | `<div>` | Apply CSS Module class for layout |
| `Text` | `<span>` / `<p>` / `<h2>` | Choose semantic tag based on role (header → h2, body → span/p) |
| `TextInput` | `dom_components/TextInput` | Convert `onChangeText` → `onChange` semantics inside `InputField` helper |
| `TouchableOpacity` | `dom_components/TouchableOpacity` (or raw `<button>`) | Used for the Copy button and FeatureToggle rows |
| `ScrollView` | `<div>` with `overflow-y: auto` | No dom_components equivalent needed |
| `Button_` (from components.js) | `dom_components/Button` | Local swap in this file only |
| `CheckBox` (already DOM) | unchanged | Keep as-is |

---

## Step-by-step

### 1. Create `ExtensionSettings.module.css`

Author all styles up front so step 2 is a clean swap. Class outline:

- `.scrollContainer` — outer div, `overflow-y: auto`, percent width, padding
- `.header`, `.headerTitle`, `.headerSubtitle`
- `.messageBanner`, `.messageBannerSuccess`, `.messageBannerError`
- `.storeIdSection`, `.storeIdRow`, `.storeIdBox`, `.storeIdText`, `.copyButton`
- `.shippingSection`, `.sectionTitle`
- `.addressGrid` — flex row, `gap: 15px`
- `.flex1`, `.flex2` — for genuine split-space cells (City/State, ZIP/Phone)
- `.featuresSection`, `.featureRow`, `.featureLabel`, `.featureDescription`
- `.actionRow` — Save + Download buttons
- `.instructions`, `.instructionsTitle`, `.instructionsBody`, `.instructionsLine`
- `.statusInfo` — last-sync banner
- `.inputField`, `.inputLabel`, `.inputControl`

Hex literals for status colors (`#d4edda`, `#f8d7da`, `#fffbea`, `#ffd700`, `#e7f3ff`, `#2196f3`) port as-is. No theme-token refactor in this pass.

### 2. Replace RN primitives in `ExtensionSettings.js`

Mechanical swap per the table above. After this step the file contains zero `react-native-web` imports.

### 3. Swap TextInput source

In the `InputField` helper:
- Import `TextInput` from `dom_components/TextInput`
- Change `onChangeText={onChange}` to whatever event signature the DOM TextInput exposes (check the component before assuming)
- Move all inline TextInput styling into `.inputControl` class

### 4. Swap `Button_` → `dom_components/Button`

Two action buttons (Save Settings, Download Extension). Verify the dom Button prop surface accepts the props currently passed (`text`, `onPress`, `disabled`, `style`). If style merging differs, move colors into module classes (`.saveButton`, `.downloadButton`).

### 5. Convert `InputField` and `FeatureToggle` helpers

- `InputField` — wraps a `<div className={styles.inputField}>` with `<label>` and the dom TextInput
- `FeatureToggle` — `<div className={styles.featureRow}>` with onClick, contains CheckBox + label/description column. Keep CheckBox unchanged (already DOM).

### 6. Apply the sizing rule (CLAUDE.md)

- **Outer panel widths** → percentages
- **`flex: 1` / `flex: 2` in the address grid** → keep as-is. These are legitimate "split available space" use cases per CLAUDE.md ("flex sizing... for the rare flex-only layouts"). The intent there is "City takes 2x State's share," not "City is 66% of parent."
- **Add `flex-shrink: 0`** to any percentage-sized children per the non-negotiable rule
- **No vw/vh/rem/em**, no media queries, no breakpoints

### 7. Clean up

- Remove `/* eslint-disable */` if the file is clean after migration
- Remove all unused imports (`View`, `Text`, `TextInput`, `TouchableOpacity`, `ScrollView` from react-native-web)
- Update `Dashboard_User.js`: replace `<View style={{ flex: 1 }}>` with a `<div>` (no module CSS needed for a single-purpose pass-through wrapper, or add a one-class module if preferred)

### 8. Browser verification

- `yarn start`
- Navigate Dashboard → User Control
- Visual diff against pre-migration: spacing, borders, colors, typography
- Test the save flow (Zustand update + `dbSaveSettingsField` call)
- Test the Copy Store ID button (clipboard write + message banner)
- Test each feature toggle (state flip + Zustand persist)
- Test address field edits (nested object update preserves siblings)
- Confirm the Download Extension button opens `/amazon-simplifier-extension.zip`

---

## Risk surface

1. **`Button_` API surface** — if `dom_components/Button` doesn't accept `style` prop in the same way, the two action buttons need their color/opacity handling moved into module classes. Mitigation: read `dom_components/Button` before step 4.
2. **`TextInput` event signature** — `onChangeText(val)` vs `onChange(e)` may differ. Mitigation: read `dom_components/TextInput` before step 3 and adapt the `InputField` wrapper.
3. **Inline literal hex colors** — preserving the exact visual output requires keeping the literal hex values, not substituting theme tokens. Mitigation: port verbatim.
4. **Percent vs flex confusion** — easy to over-correct and replace legitimate `flex: 1` splits with percentages. Mitigation: address grid stays flex-based, outer chrome goes percent.

---

## Non-goals (do NOT do during this pass)

- No new `useEffect` (per CLAUDE.md hard rule)
- No theme-token refactor of literal hex colors
- No changes to `dbSaveSettingsField`, Zustand store wiring, or any data layer
- No changes to other dashboard tabs
- No project-wide `Button_` deprecation
- No new dom_components additions — what's there is sufficient

---

## Deliverable

- 1 file modified: `ExtensionSettings.js`
- 1 file modified (lightly): `Dashboard_User.js`
- 1 file created: `ExtensionSettings.module.css`
- 0 behavior changes
- 0 API changes
- 0 DB changes

---

## Open questions for your review

1. Should `Dashboard_User.js` get its own `.module.css` or stay as a bare `<div>` pass-through?
2. Should the `Button_` swap happen here, or wait for a project-wide pass so all dashboard buttons flip together?
3. Should literal hex status colors (`#d4edda` etc.) be moved into the CSS module as named variables (`--success-bg`, `--error-bg`), or stay inline in the module classes?
