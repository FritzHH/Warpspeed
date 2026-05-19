# Migration Plan — Dashboard → Text Templates (TextTemplatesComponent)

**Goal:** Migrate the Text Templates dashboard tab from react-native-web + inline JSX styling to pure DOM + CSS Modules, per the project transition described in CLAUDE.md.

**Scope:** A single component, `TextTemplatesComponent`, currently defined inline in `Dashboard_Admin.js` (lines 6441-6783, ~340 lines). Pure presentation refactor. No behavior, state shape, prop signature, or settings-save logic changes.

**Non-goals:** `EmailTemplatesComponent` (lines 6804+) is a separate, parallel migration and is explicitly out of scope here.

---

## Files in scope

| File | Action |
|------|--------|
| `src/screens/screen_components/Items_Screen/dashboard_screen/Dashboard_Admin.js` | Remove inline `TextTemplatesComponent` definition. Replace with `import` and JSX render. |
| `src/screens/screen_components/Items_Screen/dashboard_screen/TextTemplates/TextTemplatesComponent.js` | **New file** — container component (state + handlers, list rendering) |
| `src/screens/screen_components/Items_Screen/dashboard_screen/TextTemplates/TextTemplatesComponent.module.css` | **New file** — container styles |
| `src/screens/screen_components/Items_Screen/dashboard_screen/TextTemplates/TemplateRow.js` | **New file** — per-template card |
| `src/screens/screen_components/Items_Screen/dashboard_screen/TextTemplates/TemplateRow.module.css` | **New file** — row styles |
| `src/screens/screen_components/Items_Screen/dashboard_screen/TextTemplates/EmojiPickerModal.js` | **New file** — portaled modal |
| `src/screens/screen_components/Items_Screen/dashboard_screen/TextTemplates/EmojiPickerModal.module.css` | **New file** — modal styles |

Folder pattern mirrors existing `CardReaderManager.js` / `CardReaderRowItem.js` (same directory) and the `dom_components/<Name>/<Name>.{js,module.css}` convention.

## Files explicitly out of scope

- `EmailTemplatesComponent` and its helpers — separate migration.
- `TEXT_TEMPLATE_VARIABLES`, `TEXT_TEMPLATE_TYPE_VARIABLES`, `TEMPLATE_EMOJIS`, `SETTINGS_OBJ` defaults merge — re-exported or re-imported as-is.
- `Dashboard_Admin.js` outside of the `TextTemplatesComponent` block and its single render call.

---

## Primitive replacement table

| react-native-web / current | DOM replacement | Notes |
|----------------------------|-----------------|-------|
| `View` | `<div>` | Layout class from CSS Module |
| `Text` | `<span>` (labels), `<div>` (headers) | Choose by role |
| `TouchableOpacity` | `dom_components/TouchableOpacity` | Used for variable buttons, emoji button, emoji-grid cells |
| `TouchableWithoutFeedback` (backdrop) | `<div>` with `onClick` and absolute fill class | No DOM equivalent needed |
| `TextInput_` (from `src/components.js`) | `dom_components/TextInput` | Keeps `debounceMs`, `multiline`, `onChangeText`, `onFocus`, `ref` |
| `CheckBox` (from `src/components.js`) | `dom_components/CheckBox` | Already DOM-ready |
| `DropdownMenu` (from `src/components.js`) | `dom_components/DropdownMenu` | Already DOM-ready |
| `Tooltip` (from `src/components.js`) | `dom_components/Tooltip` | Already DOM-ready |
| `BoxButton1` (from `src/components.js`) | `dom_components/Button` | Used for "Add Template" and delete icon |
| `Button_` (from `src/components.js`) | `dom_components/Button` | Used for "SAVE" on new templates |
| `BoxContainerOuterComponent` / `BoxContainerInnerComponent` | `<div>` with container classes | Match outer/inner padding visually |
| `createPortal(..., document.body)` | unchanged | Keep portal for emoji modal |

> [!IMPORTANT]
> The DOM `Button` component (`src/dom_components/Button/Button.js`) already accepts `colorGradientArr`, `icon`, `iconSize`, `text`, `onPress`, `buttonStyle`, `textStyle`. The two existing usages (`COLOR_GRADIENTS.blue` for "Add Template", `COLOR_GRADIENTS.greenblue` for "SAVE") map directly. No gradient re-implementation needed.

---

## CSS Module class outline

### `TextTemplatesComponent.module.css`

- `.outer` — outer container (former `BoxContainerOuterComponent`)
- `.inner` — inner container, `width: 100%`, `align-items: center`
- `.addRow` — wrapper for Add button, `width: 100%`, centered
- `.list` — vertical list of template cards, `margin-top: 10px`, `width: 100%`

### `TemplateRow.module.css`

- `.row` — card: `width: 100%`, `margin-bottom: 15px`, `border: 1px solid var(--outline)`, `border-radius: 10px`, `padding: 10px`, `background: var(--listWhite)`, `flex-shrink: 0`
- `.rowSelected` — overrides border color to `C.green`
- `.headerRow` — flex row, align items center, `margin-bottom: 8px`
- `.labelInput` — `flex: 1`, border, radius, padding (this is a deliberate flex-only "fill rest of row" case)
- `.orderGroup` — inline label + dropdown, `margin-left: 10px`
- `.orderLabel` — small grey "Order" text
- `.checkGroup` — `margin-left: 10px`
- `.deleteBtn` — `margin-left: 8px`
- `.bodyInput` — multiline textarea: border, radius, padding, `min-height: 80px`, `overflow: hidden`
- `.variableBar` — flex row wrap, `margin-top: 8px`, align items center, `transition: opacity 120ms`
- `.variableBarHidden` — `opacity: 0`, `pointer-events: none`
- `.variableBtn` — pill: `background: var(--lightGreen)`, border, radius `5px`, padding, margin
- `.emojiBtn` — same as `.variableBtn`, slightly different font-size
- `.saveBtn` — `align-self: flex-end`, `margin-top: 8px`, `width: 100px`

### `EmojiPickerModal.module.css`

- `.backdrop` — `position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: var(--zModal)` (or pass `Z.modal` via inline style)
- `.backdropClickCatcher` — absolute fill behind modal box for outer-click dismissal
- `.modal` — `background: white; border-radius: 12px; padding: 15px; width: 320px`
- `.title` — `font-size: 14px; font-weight: 600; margin-bottom: 10px; text-align: center`
- `.grid` — flex row wrap, justify-content center
- `.emojiCell` — `width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 8px; cursor: pointer`
- `.emoji` — `font-size: 24px`

> [!NOTE]
> Hex/color literals stay as-is. Where the current code uses `C.buttonLightGreenOutline`, `C.green`, `C.backgroundListWhite`, `C.buttonLightGreen`, `gray(0.3)`, `gray(0.5)` — port these as inline-style fallbacks on the JSX side **or** define CSS variables in a `:root`-scoped module. To stay consistent with the `CardReaderManager.module.css` precedent in this folder, keep colors as inline `style={{ color: C.xxx }}` next to the className for theme-driven values, and use CSS for fixed/layout values only.

---

## Sizing rule application (per CLAUDE.md)

- Card width: `100%` of list, `flex-shrink: 0`.
- List width: `100%` of inner container.
- Inner container width: `100%` of outer.
- Modal width: `320px` — fine, matches current fixed-width design.
- Header row: `.labelInput` uses `flex: 1`. This is the one deliberate flex-only case — "label input fills the rest of the header row beside the order/checkbox/delete cluster." Document this in the CSS Module with a comment.
- Variable bar / emoji grid: flex-wrap layouts — no sizing involved, flex arrangement only.
- **Do not** convert any existing percentage to flex. **Do not** introduce `vw`/`vh`/`rem`/`em`/media queries.

---

## Component API contracts

### `TextTemplatesComponent` (container)

Same props, same exports as today:

```js
<TextTemplatesComponent
  zSettingsObj={...}
  handleSettingsFieldChange={(fieldName, value) => {...}}
/>
```

Internal state, refs, and helpers (`getLabel`, `getContent`, `getLocalValue`, `isNewTemplate`, `handleAddTemplate`, `handleSaveNewTemplate`, `handleDeleteTemplate`, `handleFieldChange`, `handleInsertVariable`) move with the component unchanged.

### `TemplateRow` (new)

```js
<TemplateRow
  templateObj={...}
  isSelected={bool}
  isNew={bool}
  savedTemplates={[]}
  labelValue={string}
  contentValue={string}
  onSelectTemplate={(id) => ...}
  onFieldChange={(templateObj, field, val) => ...}
  onInsertVariable={(templateObj, variableStr) => ...}
  onOpenEmojiModal={(id) => ...}
  onDeleteTemplate={(templateObj) => ...}
  onSaveNewTemplate={(templateObj) => ...}
  textInputRef={(el) => ...}     // forwarded into the body TextInput
  onCursorChange={(id, pos) => ...}
/>
```

> [!IMPORTANT]
> Cursor-position and ref tracking (`cursorPositionRefs`, `textInputRefs`) live in the container. The row receives setter callbacks. This preserves the existing behaviour where the container reads `cursorPositionRefs.current[templateObj.id]` inside `handleInsertVariable`.

### `EmojiPickerModal` (new)

```js
<EmojiPickerModal
  emojis={TEMPLATE_EMOJIS}
  onSelectEmoji={(emojiId) => ...}
  onClose={() => ...}
/>
```

Renders via `createPortal(..., document.body)`. Container decides when to mount (`{!!sEmojiModalTemplateId && <EmojiPickerModal ... />}`).

---

## Risk register

> [!WARNING]
> **`onSelectionChange` and `event.nativeEvent.selection.start`** — current code reads `event.nativeEvent.selection.start`. Verify how `dom_components/TextInput` surfaces selection. If it forwards a synthetic React event, switch to reading `event.target.selectionStart` directly. Adjust the container's `onSelectionChange` handler accordingly.

> [!WARNING]
> **Auto-grow textarea** — current code mutates `el.style.height` on the ref returned by `TextInput_`. The DOM `TextInput` must expose the underlying `<textarea>` node via ref for this to keep working. If it wraps the textarea in a div, the height mutation needs to target `inputRef.current` (the actual textarea), not the outer wrapper. Inspect `dom_components/TextInput/TextInput.js` ref forwarding before the swap.

> [!WARNING]
> **`onContentSizeChange`** — RN-Web-only callback. The DOM `TextInput` likely does not fire it. The height-recalc that currently runs there must be migrated to a plain `onInput`/`onChange` handler in the new code, or handled by `TextInput`'s own auto-grow logic if present.

> [!WARNING]
> **`textAlignVertical: "top"` and `outlineWidth: 0`** — RN-Web inline-style names. Replace with `text-align` (n/a — textarea defaults to top) and `outline: none` in the CSS Module.

> [!CAUTION]
> **`pointer-events: "none"` on variable bar** — currently set inline on `View`. RN-Web translates this. The CSS Module class `.variableBarHidden` must apply `pointer-events: none` for the same effect.

> [!NOTE]
> **`Z.modal`** — passed as `zIndex` inline. Continue to pass `Z.modal` inline on the backdrop element (don't bake a number into CSS) so that the project-wide z-index registry stays the single source of truth.

---

## Step-by-step execution

```timeline
title: TextTemplates DOM Migration
[ ] Step 1 — Create `TextTemplates/` folder and three `.module.css` files with class skeletons (empty rules) | No JSX changes yet
[ ] Step 2 — Verbatim extract `TextTemplatesComponent` into `TextTemplatesComponent.js`, leaving RN primitives in place. Update `Dashboard_Admin.js` to import and render | Behavior identical, build passes
[ ] Step 3 — Extract `TemplateRow` (the `templates.map` body) into `TemplateRow.js`. Wire prop callbacks; container holds state | Manual smoke test: add, edit, delete, save, insert variable, emoji
[ ] Step 4 — Extract `EmojiPickerModal` (the `createPortal` block) into `EmojiPickerModal.js` | Smoke test: open, pick emoji, dismiss via outer click and inner click
[ ] Step 5 — Container: replace `View`/`Text`/`BoxContainerOuter`/`BoxContainerInner` with `<div>` + classes. Replace `BoxButton1` → `dom_components/Button` | Visual diff
[ ] Step 6 — Row: replace `View`/`Text`/`TouchableOpacity` with DOM primitives + classes. Replace `TextInput_`/`CheckBox`/`DropdownMenu`/`Tooltip` with their `dom_components` equivalents. Replace `Button_` → `dom_components/Button` | Verify cursor tracking, focus, auto-grow, debounce
[ ] Step 7 — Modal: replace `View`/`Text`/`TouchableOpacity`/`TouchableWithoutFeedback` with DOM + classes. Keep portal | Verify backdrop click, emoji selection
[ ] Step 8 — Move static inline styles into CSS Module classes. Keep theme-color inline styles (`C.xxx`) and dynamic-value styles (`opacity`, `borderColor` selection toggle, `Z.modal`) inline | Visual diff
[ ] Step 9 — Remove now-unused imports from `Dashboard_Admin.js` only if no other component in the file uses them. Run a TS/lint pass | Clean
[ ] Step 10 — Final manual QA pass against the checklist below | Sign-off
```

---

## Manual QA checklist

> [!TIP]
> Run the full list after Step 9. The cursor / variable / emoji flow is the most fragile and warrants two passes.

- [ ] Open Dashboard → Text Templates tab renders without errors.
- [ ] Existing templates list in the same order as before the migration.
- [ ] Default typed templates (non-removable) are merged in on first load (`hasMergedSms` logic intact).
- [ ] Click "Add Template" → new row appears at the top with empty inputs, selected.
- [ ] Typing in label and body fires debounced save (500ms).
- [ ] Order dropdown: only unused order values are offered; selecting one persists.
- [ ] "Chat" checkbox toggles `showInChat` field.
- [ ] Delete icon: visible only on user-created (non-typed) templates; click confirms via the existing flow.
- [ ] Variable bar: hidden (opacity 0, no pointer events) when row is not selected; visible when selected.
- [ ] Clicking a variable button inserts the variable string at the textarea's current cursor position.
- [ ] Clicking the emoji button opens the portal modal centered, dimmed backdrop.
- [ ] Clicking an emoji inserts it at the cursor and closes the modal.
- [ ] Clicking the backdrop closes the modal without inserting.
- [ ] Body textarea auto-grows as content wraps to new lines.
- [ ] "SAVE" button appears only on new (unsaved) templates and persists via `handleSaveNewTemplate`.
- [ ] No RN-Web warnings in the dev console for this tab.
- [ ] No layout shift compared to the pre-migration screenshot (visual diff).

---

## Rollback

Each step is a separate commit. If any step regresses behavior, revert that commit. Steps 1-4 are pure structural moves and safe to revert independently. Steps 5-8 are the visual swaps and may need to be reverted as a group if a primitive swap (e.g., `TextInput_` → `TextInput`) is responsible.

---

## Done criteria

1. `TextTemplatesComponent` no longer exists inline in `Dashboard_Admin.js`.
2. The new `TextTemplates/` folder contains three components and three CSS Modules.
3. No `View`, `Text`, `TouchableOpacity`, `TouchableWithoutFeedback`, `TextInput_`, `BoxButton1`, `Button_`, `BoxContainerOuterComponent`, or `BoxContainerInnerComponent` references remain in any of the new files.
4. All static layout styles live in CSS Modules; only theme-color and truly-dynamic values remain inline.
5. Full manual QA checklist passes.
6. No new `useEffect` was introduced.
