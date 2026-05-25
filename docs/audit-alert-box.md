# AlertBox System Audit

**Date:** 2026-05-24
**Author:** Investigation for upcoming unification work
**Component:** `src/dom_components/AlertBox/AlertBox.jsx` + `useAlertScreenStore` (`src/stores.js:413`)

## Purpose

This document catalogs how the shared AlertBox alert system is used across the codebase. Goal: identify patterns and inconsistencies so the system can be unified into a smaller, more consistent API later.

**Scale:** 97 callsites across 29 files.

---

## Current state of the component

`AlertBox` was just refactored in commit `c18687a` ("lot sof kdfjk", 2026-05-24). Key changes:

- **Old structure:** used the shared `Button` component with `text`, `icon`, `colorGradientArr`, etc. Buttons could be icon-only (default icons: `ICONS.check1` for btn1, `ICONS.close1` for btn2) when no text was passed.
- **New structure:** bare `<button>` elements with gradient backgrounds applied inline. Text-only - **no icon support remains**.
- **Layout:** `.content` is column flex with `.header` + `.body` (`flex: 1`) + `.footer` (`min-height: 48px` after follow-up fix). Footer holds row of equally-flexed buttons.

**Breakage from refactor:** callers that passed icons without text now render blank buttons. As of this audit, one such case was found and fixed in `src/faceDetection.jsx:441` (punch clock prompt — added `btn1Text: "CLOCK IN"`, `btn2Text: "NOT NOW"`).

**Dead store fields:** the store still defines `btn1Icon`/`btn2Icon`/`btn3Icon`/`icon1Size`/`icon2Size`/`icon3Size`, but the component ignores them. These should be removed during unification.

---

## The `setValues` API surface

`useAlertScreenStore.setValues({...})` accepts (see `src/stores.js:461`):

| Param | Type | Notes |
|---|---|---|
| `title` | string | Header text. Uppercased visually. |
| `severity` | "warning" \| "info" | Default `"warning"` (red header). `"info"` = green muted header. |
| `message` | string | Main body text. Supports `\n` line breaks. |
| `subMessage` | string | Secondary body text below `message`. Rarely used. |
| `btn1Text` | string | Right-most button label. Renders with green gradient. |
| `btn2Text` | string | Middle/left button label. Renders with blue gradient. |
| `btn3Text` | string | Third button. Renders with purple gradient. |
| `btn1Icon`/`btn2Icon`/`btn3Icon` | * | **DEAD — ignored by current component.** |
| `icon1Size`/`icon2Size`/`icon3Size` | * | **DEAD — ignored.** |
| `handleBtn1Press`/`handleBtn2Press`/`handleBtn3Press` | function | Click handlers. |
| `canExitOnOuterClick` | bool | Default `false` in setValues (but `true` in initial store state — inconsistent). |
| `alertBoxStyle` | object | Inline style override on `.content`. Used by exactly one caller. |
| `showAlert` | bool | Toggles visibility. Default `true`. |
| `pauseOnBaseComponent` | bool | Unclear effect. Default `false`. Not consumed by AlertBox itself. |
| `useCancelButton` | bool | Force-shows a CANCEL button alongside btn1. |
| `fullScreen` | bool | Default `false` in setValues (but `true` in store init). Not consumed by AlertBox either. **Likely vestigial.** |
| `autoDismiss` | bool | Hides footer entirely; alert disappears after `autoDismissMs`. |
| `autoDismissMs` | number | Default 4000ms. |

**Button display logic** (`AlertBox.jsx:52`):
```js
const showCancel = !zAutoDismiss && (zUseCancelButton || (!zButton2Handler && !zButton3Handler));
```
Translation: a left-side CANCEL button appears automatically when there's only btn1 (no btn2/btn3) — unless autoDismiss is on. This is a non-obvious convention that many single-action callers rely on.

---

## Caller patterns by category

### Category A — Standard 2-button confirm/cancel (most common, ~45 callsites)

Pattern: action + cancel. Action label varies wildly.

Examples:
- `faceDetection.jsx:441` — punch clock — `CLOCK IN` / `NOT NOW`
- `LoginModal.jsx:124` — punch clock — `CLOCK IN` / `NOT NOW`
- `stores.js:982` — punch clock (inactivity) — `CLOCK IN` / `CANCEL` ⚠️ inconsistent with above
- `Dashboard_Admin.jsx:806` — delete user — `DELETE` / `CANCEL`
- `BikeStandScreen.jsx:1481` — delete workorder — `Delete` / `Cancel` ⚠️ case inconsistency
- `UserMessagesModal.jsx:247` — delete message — `DELETE` / `CANCEL`
- `EmailInboxes.jsx:46` — remove email account — `REMOVE` / `CANCEL`
- `CustomerInfoModalScreen.jsx:361` — change phone — `CONFIRM` / `CANCEL` (also sets `canExitOnOuterClick: false`)

### Category B — Single-button OK/ack (~25 callsites)

Pattern: btn1 = `OK`, no btn2. Relies on the auto-CANCEL fallback (which is hidden because... wait, no — with single button there's NO cancel auto-shown, see logic above; `useCancelButton` would have to be set, but isn't). Actually, when only btn1Handler is passed and no btn2Handler/btn3Handler, `showCancel` is `true` — so CANCEL appears anyway. Most "OK only" callers accidentally get a CANCEL too.

Examples:
- `LoginScreen.jsx:64` — password reset confirmation — `OK`
- `Items_WorkorderItems.jsx:238` — cannot reduce total — `OK`
- `Dashboard_Admin.jsx:745` — invalid user — `OK`
- Multiple `MobileMessagesScreen.jsx` callers — message failures — `OK`
- Multiple `Options_Messages.jsx` callers — message failures — `OK`

**Investigation point:** are all these "OK only" callers accidentally showing a CANCEL button next to OK? Visual confirmation needed.

### Category C — Single-action with auto-cancel (intentional)

Pattern: btn1 = action, omit btn2 entirely, rely on `showCancel` fallback for CANCEL button.

Examples:
- `LabelDesignerModalV2.jsx:717` — delete layout — btn1: `Delete` + auto CANCEL
- `LabelDesignerModalV2.jsx:741` — unsaved changes — btn1: `Exit` + auto CANCEL

### Category D — 3-button choice (rare)

- `CustomerSection.jsx:103` — phone dialer picker — `TEXT` / `VONAGE` / `PHONE DIALER`

This is the only 3-button caller. Worth questioning whether 3 buttons belongs in this system at all vs. being its own component.

### Category E — Auto-dismiss toasts (~4 callsites)

Pattern: `autoDismiss: true`, `autoDismissMs: 1300`, no buttons. Used as a "Sending..." indicator that auto-hides.

Examples:
- `BikeStandScreen.jsx:1118` — intake receipt sending
- `BikeStandScreen.jsx:1190` — workorder receipt sending
- `ClosedWorkorderModal.jsx:365` — intake receipt sending
- `Info_ActiveWorkorder.jsx:620` — uses manual `setTimeout` to hide instead of `autoDismiss`

**Inconsistency:** `Info_ActiveWorkorder.jsx:620` rolls its own setTimeout dismissal instead of using the built-in `autoDismiss`. Should be unified.

These should arguably be a separate "toast" primitive, not the same component as confirmation dialogs.

### Category F — Inline style override (1 callsite)

- `NewCheckoutModalScreen.jsx:1443` — partial payment notice — sets `alertBoxStyle: { minWidth: "50%" }`. The only caller using `alertBoxStyle`. Could be replaced with a sizing prop or removed.

---

## Inconsistencies needing unification

### 1. Button-label wording for identical concepts

Same action, different wording across callers:

| Concept | Variants seen |
|---|---|
| Dismiss/cancel | `NOT NOW`, `CANCEL`, `Cancel`, `No`, `NO` |
| Confirm | `CONFIRM`, `Continue`, `Yes`, `YES`, `OK` |
| Delete | `DELETE`, `Delete`, `REMOVE`, `Remove` |
| Send | `Send`, `SEND` |

**Recommendation:** standardize on UPPERCASE for all alert button labels (the CSS already uppercases via `text-transform: uppercase`, so the variation is purely cosmetic in source — but it's confusing when grep'ing).

### 2. Case inconsistency in source vs. rendered

CSS applies `text-transform: uppercase` to `.footerBtn`, so `Delete` and `DELETE` render identically. Source should pick one and stick to it.

### 3. Dead API surface

- `btn1Icon`/`btn2Icon`/`btn3Icon`/`icon1Size`/`icon2Size`/`icon3Size` — ignored by component, still in store. Remove.
- `pauseOnBaseComponent` — set by some callers, not consumed by AlertBox. Investigate where (if anywhere) it's read.
- `fullScreen` — set by some callers, not consumed by AlertBox. Likely vestigial from pre-DOM RN-web era. Remove or implement.

### 4. Default-value mismatch between initial state and `setValues`

Store initial state (`stores.js:413`):
- `canExitOnOuterClick: true`
- `fullScreen: true`

`setValues` defaults (`stores.js:478`):
- `canExitOnOuterClick: false`
- `fullScreen: false`

Any caller that doesn't pass these gets the `setValues` defaults, not the store-init defaults. This means **the apparent "store default" of `canExitOnOuterClick: true` is misleading** — calls actually default to `false` in practice. Confusing for readers.

### 5. The "single-button accidentally shows CANCEL" problem

Per `AlertBox.jsx:52`, calls with only `btn1Handler` (and no btn2/btn3) automatically get a CANCEL button — there's no way to opt out without setting `useCancelButton: false` (which is the default and has no effect because the OR condition is `useCancelButton || (no btn2 and no btn3)`).

If a caller wants a true single-button "OK" alert, they currently can't — they always get CANCEL alongside. This needs a clear API: `mode: "single-action" | "confirm" | "choice"` or similar.

### 6. Toasts ≠ confirmations sharing one component

Auto-dismiss toasts (Cat E) and confirmation dialogs (Cat A/B) have very different UX needs but use the same component. Splitting them into `<Toast>` and `<ConfirmDialog>` (or `useToast()` / `useConfirm()`) would simplify both.

### 7. Inconsistent handler patterns

- Some callers omit `handleBtnXPress` entirely (relying on AlertBox to dismiss on click).
- Some pass `() => null` as a no-op (e.g., `Dashboard_Admin.jsx:749`, `UserMessagesModal.jsx:258`).
- Some pass `() => setShowAlert(false)` explicitly (e.g., `ImportComponent.jsx:2605`) — redundant because `dismissAlert()` runs automatically after the handler.

### 8. The 3-button picker (Category D) is structurally weird

`CustomerSection.jsx:103` uses 3 buttons as a phone-dialer chooser. This is a *picker*, not an alert. Likely belongs in a dedicated `<Picker>` component rather than alert infrastructure.

---

## Recommendations for unification

### Short term (cleanup without API redesign)

1. **Remove dead fields** from the store: `btn1Icon`/`btn2Icon`/`btn3Icon`/`icon1Size`/`icon2Size`/`icon3Size`.
2. **Audit `pauseOnBaseComponent` and `fullScreen`** — if not consumed anywhere, remove. If consumed, document.
3. **Reconcile default mismatch** between store-init and `setValues` defaults.
4. **Standardize button labels** in source: pick `CANCEL` (uppercase) over `Cancel`, etc.

### Medium term (API redesign)

Replace the single `setValues({...})` mega-call with focused helpers:

```js
showConfirm({ title, message, confirmText, cancelText, onConfirm, onCancel, danger? })
showAlert({ title, message, onDismiss })   // single OK button, no cancel
showToast({ message, durationMs })          // auto-dismiss, no buttons
showChoice({ title, message, choices: [{ label, onSelect }, ...] })  // 3+ options
```

This eliminates the "single button accidentally shows CANCEL" footgun and makes intent explicit at the call site.

### Long term (component split)

- `<ConfirmDialog>` for blocking choices (Cat A, B, C).
- `<Toast>` for auto-dismiss notifications (Cat E).
- `<Picker>` for multi-choice selection (Cat D).

Each gets its own store slice and its own component. The current "one component, many modes" approach is the source of most inconsistencies above.

---

## File index (all 29 callers)

For grep convenience:

```
src/dom_components/LoginModal/LoginModal.jsx          (1)
src/dom_components/DepositsList/DepositsList.jsx      (1)
src/faceDetection.jsx                                  (1)
src/stores.js                                          (1) — inactivity-timeout self-call
src/screens/BikeStandScreen.jsx                        (6)
src/screens/LoginScreen.jsx                            (1)
src/screens/screen_collections/Options_Section.jsx     (2)
src/screens/phone/CustomerSection/CustomerSection.jsx  (1)
src/screens/mobile/MobileMessagesScreen.jsx            (10)
src/screens/screen_components/Info_Screen/Info_ActiveWorkorder.jsx  (6)
src/screens/screen_components/Items_Screen/Items_WorkorderItems.jsx (7)
src/screens/screen_components/Options_Screen/Options_Messages.jsx   (7)
src/screens/screen_components/Options_Screen/Options_Workorders/WorkorderRowItem.jsx (1)
src/screens/screen_components/Items_Screen/dashboard_screen/Dashboard_Admin.jsx (5)
src/screens/screen_components/Items_Screen/dashboard_screen/CardReaderManager.jsx (1)
src/screens/screen_components/Items_Screen/dashboard_screen/PrintersComponent.jsx (2)
src/screens/screen_components/Items_Screen/dashboard_screen/ImportComponent/ImportComponent.jsx (2)
src/screens/screen_components/Items_Screen/dashboard_screen/EmailOptions/EmailInboxes.jsx (1)
src/screens/screen_components/Items_Screen/dashboard_screen/EmailOptions/SignatureEditor.jsx (2)
src/screens/screen_components/Items_Screen/dashboard_screen/readers_printers/CardReaderManager.jsx (1)
src/screens/screen_components/Items_Screen/dashboard_screen/readers_printers/PrintersComponent.jsx (2)
src/screens/screen_components/modal_screens/ClosedWorkorderModal.jsx (3)
src/screens/screen_components/modal_screens/CustomerInfoModalScreen.jsx (4)
src/screens/screen_components/modal_screens/UserMessagesModal.jsx (5)
src/screens/screen_components/modal_screens/ScheduleModal.jsx (4)
src/screens/screen_components/modal_screens/LabelDesignerModalV2.jsx (4)
src/screens/screen_components/modal_screens/PayrollModal.jsx (5)
src/screens/screen_components/modal_screens/newCheckoutModalScreen/NewCheckoutModalScreen.jsx (8)
src/screens/screen_components/modal_screens/newCheckoutModalScreen/NewRefundModalScreen.jsx (3)
```

Note: two pairs of duplicate-named files exist (`CardReaderManager.jsx`, `PrintersComponent.jsx`) under both `dashboard_screen/` and `dashboard_screen/readers_printers/` — these appear to be parallel versions and may indicate ongoing migration.
