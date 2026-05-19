# Lists & Options — DOM/CSS Migration Plan

**Scope:** Migrate the **Lists & Options** sub-section of `Dashboard_Admin.js` from React-Native-Web (inline RN styling) to pure DOM + CSS Modules.

**Source location:** `src/screens/screen_components/Items_Screen/dashboard_screen/Dashboard_Admin.js`, lines **1995–3584** (`ListOptionsComponent` and its 6 sub-components).

**Target:** New folder `src/screens/screen_components/Items_Screen/dashboard_screen/ListsOptions/` with 7 `.jsx` files + 1 shared `.module.css`.

---

## 1. Component inventory

The migration covers **1 wrapper + 6 sub-components**:

| Component                          | Approx lines | Notes                                                         |
| ---------------------------------- | ------------ | ------------------------------------------------------------- |
| `ListOptionsComponent`             | small        | Wrapper composing the 6 sub-components inside box containers  |
| `BikeBrandsComponent`              | largest      | 3 nested lists: brands, optional brands, descriptions          |
| `DiscountsComponent`               | medium       | Discount entries with type, value, savings                     |
| `WaitTimesComponent`               | small        | Simple list of wait time entries                               |
| `PartSourcesComponent`             | small        | Simple list of part source entries                             |
| `NoteHelpersAdminComponent`        | medium       | Nested data — helper rows with items                           |
| `CustomerQuickNotesAdminComponent` | medium       | Similar nested shape to NoteHelpers                            |

Shared local helpers also used: `BoxContainerOuterComponent`, `BoxContainerInnerComponent`, `BoxButton1`, `MoveArrows`, `VerticalSpacer`.

---

## 2. RN-Web → DOM mapping

### Primitives used in the section

| RN-Web                     | Replacement                                  | Source                       |
| -------------------------- | -------------------------------------------- | ---------------------------- |
| `View`                     | `<div>`                                      | inline                       |
| `Text`                     | `<span>` / `<div>`                           | inline                       |
| `FlatList`                 | `array.map(...)` inside `<div>`              | inline (no wrapper)          |
| `ScrollView`               | `<div style={{ overflowY: 'auto' }}>`        | inline (no wrapper)          |
| `TouchableOpacity`         | `TouchableOpacity` from `dom_components`     | dom_components               |
| `TouchableWithoutFeedback` | ad-hoc `<div onClick>` or document listener  | inline                       |

### Custom components — all already have DOM equivalents

`Button_`, `DropdownMenu`, `Image_`, `TextInput_`, `NumberSpinner_`, `TimePicker_`, `TimeSpinner`, `Tooltip`, `TouchableOpacity_`, `Pressable_`, `Dialog_`, `ScreenModal`, `CheckBox` — **all present** in `src/dom_components/index.js`. Imports flip from `../../../../components` to `../../../../dom_components`.

### Style-prop conversions

| RN-Web style                | CSS / inline style                 |
| --------------------------- | ---------------------------------- |
| `paddingVertical: N`        | `padding: 'Np 0'` or top/bottom    |
| `paddingHorizontal: N`      | `padding: '0 Np'` or left/right    |
| `marginVertical/Horizontal` | same pattern                       |
| `borderWidth`               | `borderWidth` (CSS-valid)          |
| `outlineWidth: 0`           | `outline: 'none'`                  |
| `flexDirection: 'row'`      | `display: 'flex', flexDirection: 'row'` |
| `alignItems`, `justifyContent`, `gap` | same (CSS-valid)         |
| `onPress`                   | `onClick` (only on raw RN elements; DOM wrappers already accept `onPress`) |

### Sizing rules (per `CLAUDE.md`)

- **Percentages stay as percentages.** Do not substitute `flex: 1` during this migration.
- **Every percentage-sized child must have `flexShrink: 0`** (non-negotiable per project rule).
- No `vw`, `vh`, `rem`, `em`, media queries, or breakpoints.

---

## 3. Decisions to confirm before starting

| Decision                              | Recommendation                                                       |
| ------------------------------------- | -------------------------------------------------------------------- |
| `FlatList` replacement                | **Inline `.map()`** per call site (lists are short, no virtualization needed) |
| `ScrollView` replacement              | **Inline `<div>` with overflow** (used in one place)                 |
| `TouchableWithoutFeedback` replacement| Ad-hoc per call site                                                 |
| CSS Module scope                      | **One shared `ListOptions.module.css`** for the whole section        |
| Folder location                       | `dashboard_screen/ListsOptions/`                                     |
| File extension                        | `.jsx` (matches DOM-migration convention; confirm vs `.js`)          |

---

## 4. Target folder structure

```
src/screens/screen_components/Items_Screen/dashboard_screen/ListsOptions/
├── ListOptionsComponent.jsx
├── ListOptions.module.css
├── BikeBrands.jsx
├── Discounts.jsx
├── WaitTimes.jsx
├── PartSources.jsx
├── NoteHelpersAdmin.jsx
└── CustomerQuickNotesAdmin.jsx
```

The shared box wrappers (`BoxContainerOuterComponent`, `BoxContainerInnerComponent`, `BoxButton1`, `MoveArrows`) — decide per case whether to:
- Inline as DOM elements with CSS classes (preferred), **or**
- Keep as small local helpers in `ListOptionsComponent.jsx` (acceptable transition step).

---

## 5. Shared CSS Module — class catalog

| Class            | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `.boxOuter`      | Outer container, 97% width, centered                   |
| `.boxInner`      | Inner box: green border, white bg, 10px radius, padded |
| `.sectionHeader` | Green pill row with label + add button                 |
| `.listRow`       | Row holding input + move arrows + trash button         |
| `.greenInput`    | TextInput style: green border, rounded, no outline     |
| `.labelText`     | Standard label text color/size                         |
| `.divider`       | Light gray horizontal divider                          |
| `.headerLabel`   | Label text inside the green pill header                |

Build the module **once at the start of Phase 2** so all sub-components consume the same classes.

---

## 6. Phase plan

### Phase 0 — Decisions & prep
- Confirm the decisions in §3 above
- Branch off `master`: `migrate/lists-options-dom`

### Phase 1 — Extract first (RN-Web intact)
- Move `ListOptionsComponent` and its 6 sub-components out of `Dashboard_Admin.js` into new `ListsOptions/` files
- Update import in `Dashboard_Admin.js` to point at the new module
- **No conversion yet** — just relocation
- Verify the tab still works identically
- **Outcome:** clean diffs for the migration step that follows; `Dashboard_Admin.js` shrinks by ~1,600 lines

### Phase 2 — Build shared CSS Module
- Create `ListOptions.module.css` with the classes catalogued in §5
- No file consumes it yet — built up-front so sub-components have a stable target

### Phase 3 — Migrate leaf sub-components (smallest first, validates pattern)
1. `WaitTimes.jsx` — simplest list, validates the pattern end-to-end
2. `PartSources.jsx` — similar shape, confirms reusability
3. `Discounts.jsx` — more fields, exercises edge cases

For each:
- `View` → `div`, `Text` → `span`/`div` with CSS class
- `FlatList` → `array.map()` inside `<div>`
- Inline RN styles → CSS classes + minimal style overrides
- Flip wrapper imports from `components` to `dom_components`
- Preserve percentage widths; add `flexShrink: 0` everywhere required
- Smoke-test the tab in `yarn start` before moving on

### Phase 4 — Migrate complex sub-components
1. `BikeBrands.jsx` — 3 lists, largest pattern repetition (by now CSS classes are stable)
2. `NoteHelpersAdmin.jsx` — nested data, `MoveArrows` usage
3. `CustomerQuickNotesAdmin.jsx` — similar shape to NoteHelpers

### Phase 5 — Wrapper + shell
- Convert `ListOptionsComponent.jsx` and the `BoxContainer*` wrappers
- Outer `ScrollView` from `Dashboard_Admin.js` parent **stays** — that's a separate migration scope

### Phase 6 — Cleanup & verification
- Remove RN-Web imports (`View`, `Text`, `FlatList`, `ScrollView`, `TouchableOpacity`, `TouchableWithoutFeedback`) from the new files
- Verify `Dashboard_Admin.js` still compiles
- Smoke-test all 6 tabs in dev server
- Verify percentage sizing holds across screen sizes
- Verify settings persistence: edits in each tab still write to Firestore via `handleSettingsFieldChange` (no behavioral change expected, but confirm)

---

## 7. Per-sub-component checklist (apply each phase)

For every sub-component:

- [ ] `View` → `div`
- [ ] `Text` → `span` or `div`
- [ ] `FlatList` → `.map()` inside `<div>`
- [ ] `TouchableOpacity` → DOM wrapper from `dom_components`
- [ ] `paddingVertical/Horizontal` → CSS shorthand or top/bottom/left/right
- [ ] `marginVertical/Horizontal` → CSS shorthand
- [ ] `outlineWidth: 0` → `outline: 'none'`
- [ ] `onPress` on raw RN → `onClick` (DOM wrappers keep `onPress`)
- [ ] Every percentage-sized child has `flexShrink: 0`
- [ ] No `flex: 1` substituted for percentages
- [ ] No `vw`/`vh`/`rem`/`em`/breakpoints introduced
- [ ] Smoke-test the tab end-to-end

---

## 8. Risk areas

> **Things that commonly break in RN→DOM conversions**
> - `flexDirection: 'row'` requires `display: 'flex'` explicitly in CSS
> - `paddingVertical/Horizontal` shorthand has no CSS equivalent — must split
> - Text node whitespace inside `<Text>` vs `<div>` collapses differently — watch labels with leading/trailing spaces
> - `flex: 1` inside a row vs column behaves differently — verify each container if you ever do substitute
> - `FlatList`'s `renderItem({ item, index })` vs `.map((item, index) => ...)` — destructuring shape changes
> - `TouchableOpacity` `activeOpacity`/`onMouseEnter`/`onMouseLeave` patterns — confirm the DOM wrapper exposes equivalent props
> - Settings persistence must continue to debounce/save through `handleSettingsFieldChange` exactly as before

---

## 9. Out of scope

- Outer `ScrollView` in `Dashboard_Admin.js` parent (separate migration)
- Other tabs in `Dashboard_Admin.js` (User Control, Statuses, Wait Times tab, etc.)
- Behavioral changes — this is a **rendering-layer migration only**
- Refactoring of `handleSettingsFieldChange` or `useSettingsStore` plumbing
- Adding new features or fields

---

## 10. Estimated scope

- **6 sub-components**, ~1,600 lines of JSX
- **~12 `FlatList` usages** to convert to `.map()`
- **1 shared CSS Module**, ~8 classes
- **Roughly 1–2 working sessions**, validating each tab as you go

---

## 11. Approval gates

- [ ] §3 decisions confirmed
- [ ] Phase 1 (extraction) reviewed before Phase 2 starts
- [ ] CSS Module class catalog reviewed before Phase 3 starts
- [ ] First leaf component (`WaitTimes.jsx`) reviewed before continuing Phase 3
- [ ] All 6 tabs smoke-tested before Phase 6 sign-off
