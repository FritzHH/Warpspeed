# CLAUDE.md

## CRITICAL: Question = information only. Do NOT edit.

**If the user's prompt ends with `?`, or is phrased as a question ("can you...", "is X...", "how does...", "what's...", "should I...", "does this...", "where is..."), DO NOT edit files, run mutating commands, or take any action that changes project state.**

Answer with text only — explanations, code references, or descriptions. Even prompts that look like requests but are phrased as questions ("can you fix this?") are information-only until the user follows up with an explicit instruction.

Editing in response to a question wastes the user's time and breaks trust. A PreToolUse hook also enforces this rule and will block `Edit` / `Write` / `NotebookEdit` calls when the last user message ended with `?`.

**Examples of prompts that look like requests but are NOT:**
- "Can you fix this bug?" → diagnose and propose; do not edit
- "Is this the right place for X?" → answer; do not edit
- "Should I refactor this?" → recommend; do not refactor
- "How does this function handle Y?" → explain; do not modify
- "What if we changed X?" → discuss the tradeoff; do not change

If the user wants you to act, they'll follow up with a statement ("ok, fix it" / "go ahead" / "do it"). Wait for that.

---

## CRITICAL: User is on Windows cmd.exe — give cmd-compatible commands

**The user runs commands in cmd.exe on Windows 11.** When you give the user a command to copy/paste, it must work in cmd.exe. Your own tool environment uses bash and that's fine for *your* tool calls — but the moment you write a command for the user, switch.

Translation table for the commands that come up most:

| Don't write (bash) | Write instead (cmd.exe) |
|---|---|
| `rm file.txt` | `del file.txt` |
| `rm -rf dir/` | `rmdir /s /q dir` |
| `cp a b` | `copy a b` |
| `mv a b` | `move a b` |
| `cat file` | `type file` |
| `ls` | `dir` |
| `export VAR=value` | `set VAR=value` |
| `which cmd` | `where cmd` |
| `touch file` | `type nul > file` |
| `mkdir -p a/b/c` | `mkdir a\b\c` (cmd auto-creates intermediates) |

`&&` and `||` work in modern cmd.exe — chain freely.

Path separators: backslashes preferred (`.firebase\hosting.cache`); forward slashes generally work too but stay consistent with Windows convention when in doubt.

Single quotes don't work in cmd — use double quotes around args with spaces.

Don't write multi-line heredocs for user commands; cmd doesn't support them. Keep each command on one line, or use `&` to chain on one line.

---

## Development Commands

```bash
yarn start              # Vite dev server
yarn build              # Production build (runs scripts/update-version.js first)
yarn emulator           # Firebase Functions emulator
yarn begin              # Build + serve with local SSL (cert.pem/key.pem)
yarn auth               # Re-authenticate Firebase CLI
```

**Deploy Cloud Functions** (never deploy all at once):
```bash
firebase deploy --only functions:functionName1,functions:functionName2
```

---

# Agent behavior

Before acting on any request:

1. **Clarify** — If ambiguous, ask one short question or state your interpretation and proceed.
2. **Context** — Read or search the codebase for relevant files instead of guessing. Respect existing patterns (file layout, naming, style).
3. **Stack** — This is the Warpspeed multi-tenant SaaS POS (Bonita Bikes is one tenant). React + Vite, Firebase, Stripe. Don't introduce new frameworks or redundant deps unless asked.
4. **Safety** — Prefer small targeted edits. Do not commit secrets or hardcoded credentials; flag if you see them.
5. **Scope** — Fulfill what was asked. Don't add unrelated features, refactors, or docs.
6. **Deploy commands** — When a Cloud Function changes, give the deploy command in a standalone code block, only for the changed functions — never `--only functions`.
7. **Command code blocks must be copyable** — Any shell command intended for the user to run (deploy commands, build commands, git commands, etc.) MUST be presented in a plain fenced code block with no language tag, or with `` ```bash `` only. Do NOT use `` ```cmd ``, `` ```terminal ``, `` ```powershell ``, `` ```shell ``, or any other tag — Claude Terminal's renderer treats those as styled/display blocks rather than copyable code, defeating the purpose. One command per block when possible; the user copies by clicking the block.

**No new `useEffect` without permission.** Explain why you need it first; the user will confirm before you add it.

**Styling — CSS Modules for all components.** The app is fully DOM-based; React Native Web has been removed. Build new components with CSS Modules. Legacy inline-styled (RNW-era) code: leave alone unless explicitly asked to refactor (touch-it-fix-it is fine; dedicated refactors are not).

**Color usage — design tokens.** Two-layer system. Source of truth: `docs/design-tokens.md`. CSS variables in `src/styles/tokens.css`. JS bridge aliases on `C` in `src/styles.js`.

- New components MUST consume semantic tokens: `var(--text-muted)` in CSS Modules; `C.textMuted`, `C.borderDefault`, `C.surfaceBase` in any remaining inline-styled code.
- Do NOT introduce new raw colors. No new `gray(0.x)`, no raw `rgb()`/`rgba()`/`#hex` in `src/screens/` or `src/dom_components/`. `src/styles.js` is the only exemption.
- If no token fits, propose one in `docs/design-tokens.md` BEFORE hardcoding. Token addition is 3 files: doc + `tokens.css` + `styles.js` bridge alias.
- For non-CSS contexts (canvas, jsPDF, charts, color math), use `resolveToken("text-muted")` from `src/styles.js`.
- Legacy `gray()` and old `C.*` names work during migration (Phases 5–9) and retire in Phase 9. Migration is opportunistic ("touch-it-fix-it"), never dedicated.

**Z-index — pure-claim policy for portal-stacked layers.** Every full-screen / portal-rendered overlay (modal, dropdown, tooltip, toast, alert) MUST get its z-index from the `useZ` hook. Static `var(--z-*)` in CSS modules and `Z.*` constants in JSX are forbidden for these layers — the claim allocator must own every value in the band so stacking stays deterministic across nested/sibling overlays.

- Hook: `useZ(band, active?)` from `src/hooks/useZ.js`. Returns a band-allocated z-index integer; auto-releases on unmount. Usage: `const z = useZ("modal");` then `style={{ zIndex: z }}` on the overlay element. Pass `active=false` to temporarily release while the component stays mounted (e.g., toggling visibility without unmount). Bands: `"modal"`, `"dropdown"`, `"tooltip"`, `"toast"`, `"alert"`, `"debug"`.
- Bands (100 wide, `STEP=10`, 10 nested instances per band) live in `src/styles.js` (`Z.bands.*`) and `src/styles/tokens.css` (`--z-*`). These are infrastructure for `useZ`; components do not consume them directly.
- **Sub-overlays inside a claimed parent** (confirm prompt within a modal, loading veil): use `z + 5` (offset from the parent's claimed value) to sub-stack within the same slot without colliding with the next sibling claim.
- **Local sub-stacking** (raw `z-index` <500 inside a parent CSS stacking context — e.g., an autocomplete dropdown inside a `position: relative` form field) stays raw. Browser stacking contexts scope these naturally; promoting them to a global band is overkill. Mark each site with `/* z-allow: <reason> */` (CSS) or `// z-allow: <reason>` (JSX) so the lint ignores it.
- Lint: `yarn lint:z-index` flags raw values ≥500 in `src/screens/`, `src/dom_components/`, and `src/App.jsx`, plus any direct `var(--z-*)` or `Z.*` reference in those files. Run before commits that touch stacking.

## Sizing — percentages by default, anchored by JS-measured root

The app is a single-screen layout. `BaseScreen.js` measures the viewport (`innerWidth`, `innerHeight`) and re-measures on resize. Every child of BaseScreen is sized as a percentage of its parent, all the way down. This is how the UI stays proportional across screen sizes without media queries.

**Default: percent of parent.**
- Container widths/heights, row/column splits, card/input/button dimensions — all percentages.
- Padding and margin in percentages where layout-relevant. Px is OK for fine details (1–2 px borders, small gaps).
- Mental model: "this element is X% of its parent," not "fill remaining space."

**`flex-shrink: 0` is required on every percent-sized flex child.** Flex children default to `flex-shrink: 1`, which compresses them below their declared percent when space runs short. Non-negotiable.

**Flex is for arrangement, not sizing.**
- Use freely: `flex-direction`, `justify-content`, `align-items`, `gap`, `flex-wrap` — these describe how children lay out.
- Use `flex: 1`, `flex-grow`, `flex-basis` only when child count is dynamic and unknown at design time (e.g., user-configurable button grids that wrap). Test: *does the design know how many children there are?* If yes → percent. If no → flex.
- Do NOT replace existing percent sizes with flex sizing during unrelated work.

**Modals.** All centered modals (Radix-portal-rendered) use the same fixed-positioned flex-center wrapper:
```css
position: fixed; top: 0; left: 0; right: 0; bottom: 0;
width: 100%; height: 100%;
display: flex; justify-content: center; align-items: center;
```
Inner modal card sizing by class:
- **Full** (80–90% of viewport): percent. The modal scales with the screen.
- **Large** (medium): percent with a max-px cap (e.g., `60% × 85%` capped at `800px`). Caps prevent over-sizing on large screens.
- **Small** (compact, confirmation/picker style): fixed px is fine. Flex-centering means the modal sits dead-center regardless of viewport, so resize doesn't break it.
- **Click-positioned popovers**: sized by content or small percent, positioned relative to the trigger.

**Modal action buttons — use the `ModalFooter` primitive. No border on the modal card.** When creating a new modal (or editing an existing one), the modal's action buttons go in `<ModalFooter>` at the bottom of the card — not in the header, not scattered inline, not as a top-right X. The outer modal card has **no `border:` rule** — rely on shadow + background for separation. Both defaults unless the user instructs otherwise.

- Primitive: `import { ModalFooter, ModalFooterButton } from "src/dom_components"`.
- Variants on `ModalFooterButton`: `default` (gray — neutral close), `primary`, `accent` (green — confirm/save/submit), `danger` (red — destructive or "cancel/close that loses work"). Props: `variant`, `icon`, `iconSize`, `disabled`, `tooltip`, `onClick`, `children`.
- The card's root must be `display: flex; flex-direction: column; overflow: hidden;` so `ModalFooter` sits flush at the bottom. Wrap the existing scrollable content in an inner `.cardInner` (or equivalent) with `flex: 1; min-height: 0;` if it's not already structured that way.
- **Button order — Cancel/Close LEFT, Confirm RIGHT.** The primary affirmative action (Confirm/Save/Submit/OK) is always the **rightmost** button with `variant="accent"` (green), unless the user specifies otherwise. Cancel/Close (destructive-to-progress) goes on the left. Applies to both small (alert/confirm) and large modals. This matches OS convention.
- **Complex multi-column modals** (Payroll, NewRefund, NewCheckout): the modal-wide Close action still lives in a card-bottom `<ModalFooter>`. In-column toolbars (post-action receipt/print/send icons, language pickers, etc.) stay where they are.

**Do not use** `vw`/`vh`/`vmin`/`vmax`, `rem`/`em`, or media queries — the JS-measured root binds the layout to the viewport; these are redundant.

If unsure which approach a new layout calls for, default to percentages and ask. Silent use of flex sizing where percentages were intended produces layouts that behave differently across screens and are hard to debug later.

### Layout debugging — fix the parent, not the leaf

When an element looks the wrong size, the fix is almost never on that element. Its size is determined by:
- Its declared dimensions
- Its parent's `display`, `align-items`, `justify-content`, and `flex` properties
- The parent's own dimensions

**Diagnostic order, top-down:**
1. Identify the element that looks wrong (the symptom).
2. Walk UP the tree. Find the nearest ancestor that *controls* the dimension you're trying to fix.
3. Read that ancestor's CSS Module class. Understand what its `display`, `flex-direction`, `align-items`, and explicit dimensions are doing.
4. Make the fix THERE. Set the parent's dimension explicitly, then let children fill `100%`.

**The pattern:** container declares the dimension (e.g., row `height: 40px`); children fill it (`height: 100%`).

**Anti-pattern:** children declare absolute dimensions while the container has `align-items: center` and no declared height. Result: container collapses to children's content-height, children compete, layout breaks.

**Red flags — you're leaf-hacking, stop:**
- You've made more than one edit to the same child element trying to fix a sizing issue
- You're theorizing about CSS spec behavior to explain why a leaf doesn't size correctly
- You haven't read the parent component's CSS Module yet

If any of those apply, walk up the tree and start over. The problem is in a container above the one you're editing.

### Wrapper components — must be layout-transparent

Components that wrap children (`Tooltip`, `Portal`, route guards, etc.) MUST NOT insert DOM elements that interrupt the layout chain. Specifically:

- Do not wrap children in a `<div>` or `<span>` that has its own `display`, `width`, `height`, or `flex` properties.
- If the wrapper component uses Radix `Trigger`, `Slot`, or similar primitive that supports `asChild`, use it correctly: pass `{children}` as the direct argument, not wrapped in your own element.
- If style/aria props need to flow through to the wrapped child, use `React.cloneElement` to merge them onto the child — never via an intermediate wrapper element.
- If you find yourself debugging child sizing inside a wrapper component, suspect the wrapper FIRST. Read the wrapper's render output and check whether it inserts a DOM element with its own layout behavior.

---

**Standalone / solo sale = no customerID.** A "standalone sale" or "solo sale" is a workorder with no `customerID` (`!workorder.customerID`). The absence of `customerID` is the sole indicator. Do not invent or reference an `isStandaloneSale` flag.

**SaaS positioning.** This is a multi-tenant SaaS being prepared for distribution. When you see opportunities for professional-grade upgrades (reliability, onboarding polish, observability, security), surface them.

**"View pic" shortcut.** When the user says "view pic", read `C:\Users\hiebf\OneDrive\Desktop\snip.png`.

**"Print a log" = serialized JSON.** When the user says "print a log" (or asks you to add/insert a log), default to printing the value as serialized JSON (e.g., `console.log(JSON.stringify(value, null, 2))`) unless they specify otherwise. Applies to any log added at the user's request.

Then execute the user's prompt according to these guidelines.

---

# Architecture Guide

## What this app is
Multi-tenant SaaS POS / service management system. React frontend + Firebase backend + Stripe payments. Single-screen, tab-based UI scaled proportionally to viewport.

## Stack
- **Frontend:** React 19.1 (Vite build), DOM + CSS Modules, Zustand 5
- **Backend:** Firebase 11.6 (Firestore, Realtime DB, Auth, Storage, Cloud Functions Node 22)
- **Payments:** Stripe Terminal (server-driven, physical card readers)
- **SMS:** Twilio
- **Other:** face-api.js (facial recognition, lazy-loaded for login), jsPDF, dayjs, lodash

## Key files
| File | Purpose |
|------|---------|
| `src/App.js` | Entry — auth init, routing, device detection |
| `src/stores.js` | All Zustand stores (16) |
| `src/styles.js` | JS design-token bridge (`C.*`, `resolveToken()`) |
| `src/styles/tokens.css` | CSS-side design tokens (source: `docs/design-tokens.md`) |
| `src/utils.js` | Shared utility functions |
| `src/dom_components/` | Reusable DOM/CSS-Module UI library |
| `src/data.js` | Data prototypes and config objects |
| `src/constants.js` | App-wide constants (permissions, DB nodes, discount types) |
| `src/db_calls_wrapper.js` | Business logic wrapping Firebase ops |
| `src/db_calls.js` | Low-level Firestore/RTDB/Auth/Storage SDK calls |
| `src/private_user_constants.js` | Firebase config, Cloud Function URLs |
| `src/screens/BaseScreen.js` | Main shell — viewport measurement, tabs, modal overlays, Firestore listeners |
| `functions/firebase-index.js` | All Cloud Functions (payments, SMS, face recognition) |

## Folder structure
```
src/
├── App.js, index.js, init.js, routes.js   # entry + routing
├── styles.js                               # JS design-token bridge
├── styles/                                 # tokens.css, theme.js, themes/
├── screens/
│   ├── BaseScreen.js, LoginScreen.js, etc.
│   ├── mobile/, phone/                     # device-mode-isolated screens
│   ├── screen_collections/                 # tab sections (Info, Items, Options, Notes)
│   └── screen_components/
│       ├── Info_Screen/
│       ├── Items_Screen/
│       ├── Options_Screen/
│       ├── Notes_Screen/
│       └── modal_screens/                  # full-viewport modals
├── dom_components/                         # reusable DOM/CSS-Module UI library
├── shared/                                 # cross-screen utilities
├── components/                             # legacy (mostly empty; ProtectedRoute remains)
├── assets/, resources/                     # static
functions/
├── firebase-index.js
└── payments.js
docs/
├── design-tokens.md
└── migrations/                             # historical migration plans
```

## `src/styles.js` — Theme & Visual Constants

- **`Colors`** — raw color values
- **`C`** — semantic color shortcuts (`text`, `green`, `surfaceBase`, `borderDefault`, `textMuted`, etc.) — see file for full list
- **`COLOR_GRADIENTS`** — gradient arrays for `Button_` colorGradientArr prop
- **`Fonts`** — weight constants (`Fonts.weight.textRegular`, etc.)
- **`ICONS`** — 40+ image asset references
- **`SHADOW_RADIUS_PROTO`** — legacy shadow object (new components use `var(--shadow-*)` tokens)
- **`resolveToken(name)`** — returns computed CSS-variable value as a string for non-CSS contexts

## `src/utils.js` — Utility Functions

Organized by category (grep the file for specifics):
- **Currency/Pricing:** `formatCurrencyDisp`, `usdTypeMask`, `dollarsToCents`, `calculateRunningTotals`, `applyLineItemDiscounts`
- **Search:** `fuzzySearch`, `searchCustomers`, `searchPhoneNum`
- **Formatting:** `formatPhoneWithDashes`, `formatMillisForDisplay`, `capitalize*`
- **Color (legacy — prefer tokens):** `gray`, `lightenRGB*`, `hexToRgb`, `rgbToHex`, `bestForegroundHex`
- **Array/Object:** `replaceOrAddToArr`, `addOrRemoveFromArr`, `deepEqual`
- **IDs/Barcodes:** `generateUPCBarcode`, `generateRandomID`, `getReceiptType`
- **Other:** `log`/`clog`, `extractStripeErrorMessage`, `printBuilder`

## `src/data.js` — Data Prototypes & Config

Core prototypes (used with `cloneDeep()`): `CUSTOMER_PROTO`, `WORKORDER_PROTO`, `WORKORDER_ITEM_PROTO`, `SALE_PROTO`, `PAYMENT_OBJECT_PROTO`, `INVENTORY_ITEM_PROTO`, `DISCOUNT_OBJ_PROTO`, `REFUND_PROTO`, `APP_USER`, `SETTINGS_OBJ`. Constants: `CONTACT_RESTRICTIONS`, `COLORS`, `PRIVILEDGE_LEVELS`, `RECEIPT_TYPES`. See file for shapes.

## State management (Zustand)

All state lives in `src/stores.js`:

| Store | Purpose |
|-------|---------|
| `useLoginStore` | User session, punch clock, inactivity timeout |
| `useSettingsStore` | Tenant/store config, permissions |
| `useOpenWorkordersStore` | Active workorders list + selected workorder |
| `useWorkorderPreviewStore` | Workorder preview modal state |
| `useCurrentCustomerStore` | Selected customer + their sales/workorders |
| `useInventoryStore` | Loaded inventory items array |
| `useCheckoutStore` | Checkout modal state, receipt scanning |
| `useStripePaymentStore` | Stripe terminal payment state |
| `useAlertScreenStore` | Alert/dialog overlay config |
| `useDatabaseBatchStore` | Debounced DB write queue (500ms) |
| `useCustomerSearchStore` | Search results and selection |
| `useLayoutStore` | Screen dimensions, mobile detection |
| `useTabNamesStore` | Active tab tracking |
| `useInvModalStore` | Inventory editor modal state |
| `useCustMessagesStore` | SMS message tracking |
| `useListenersStore` | Firebase listener subscriptions |

### Zustand store architecture

```js
const useCheckoutStore = create((set, get) => ({
  receiptScan: "",
  getReceiptScan: () => get().receiptScan,
  setStringOnly: (receiptScan) => set({ receiptScan }),
}));
```

**Pattern rules:**
- **Getters:** `get<FieldName>: () => get().<fieldName>` — always return from `get()`, never from closure
- **Setters:** `set<FieldName>: (<fieldName>) => set({ <fieldName> })` — ES6 shorthand
- **In components:** `useMyStore((state) => state.getValue())`
- **Outside components:** `useMyStore.getState().getValue()` / `useMyStore.getState().setSomething(val)`
- **Complex setters** may accept `(value, shouldSaveToDb)` and call `db_calls_wrapper` internally

## Firestore structure (multi-tenant)
```
tenants/{tenantID}/stores/{storeID}/
├── settings/settings
├── open-workorders/{woID}
├── inventory/{itemID}
├── customers/{custID}
├── email_users/{userID}
├── punch_clock/{clockID}
├── payment-processing/{...}
├── outgoing-messages/{...}
└── incoming-messages/{...}
```
**Cloud Storage:** `{tenantID}/{storeID}/completed-workorders/{status}/{year}/{month}/`, `completed-sales/...`, `punch-history/...`

## Database layer
- `db_calls.js` — Low-level SDK calls (firestoreWrite, realtimeDbSet, storageUploadString, authSignIn, callable Cloud Functions)
- `db_calls_wrapper.js` — Business logic: path building, validation, 60+ domain functions (`dbSaveCustomer`, `dbCompleteWorkorder`, `dbProcessServerDrivenStripePayment`, etc.)
- Path building: `build_db_path.settings()`, `build_db_path.inventory()`, etc. (in `constants.js`)

## Data flow
1. `App.js` initializes auth → loads settings → initializes stores
2. `BaseScreen.js` subscribes to Firestore (real-time listeners via `dbListenTo*`)
3. UI reads from Zustand stores; writes go through `db_calls_wrapper.js` → `db_calls.js`
4. Heavy operations (payments, SMS, face recognition) go through Cloud Functions
5. Speed-first: update local Zustand store immediately, then persist to DB

## Permission levels
SuperUser: 4 | Admin: 3 | Editor: 2 | User: 1

## Navigation
- React Router: `/login` and `/` (dashboard)
- Tab-based within BaseScreen: Info → Items → Options → Notes
- Non-critical screens (admin dashboards, label designer, mobile/phone modes, modals) are lazy-loaded via `React.lazy`

## Naming conventions
- Stores: `use*Store`
- Prototypes: `*_PROTO`
- Constants: `UPPER_SNAKE_CASE`
- DB functions: `db*` prefix
- Components: PascalCase with trailing underscore for custom (`Button_`, `CheckBox_`, `TextInput_`)
- Zustand prefixes in components: `z` (store values), `_z` (store setters), `s` (local state), `_s` (local setters)
