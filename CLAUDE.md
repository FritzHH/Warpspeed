# CLAUDE.md

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

**Question mark = information only.** If the prompt ends with `?`, answer with explanations or code references only — no edits, refactors, or commands that alter the project. No exceptions unless otherwise stated.

Before acting on any request:

1. **Clarify** — If ambiguous, ask one short question or state your interpretation and proceed.
2. **Context** — Read or search the codebase for relevant files instead of guessing. Respect existing patterns (file layout, naming, style).
3. **Stack** — This is the Warpspeed multi-tenant SaaS POS (Bonita Bikes is one tenant). React + Vite, Firebase, Stripe. Don't introduce new frameworks or redundant deps unless asked.
4. **Safety** — Prefer small targeted edits. Do not commit secrets or hardcoded credentials; flag if you see them.
5. **Scope** — Fulfill what was asked. Don't add unrelated features, refactors, or docs.
6. **Deploy commands** — When a Cloud Function changes, give the deploy command in a standalone code block, only for the changed functions — never `--only functions`.

**No new `useEffect` without permission.** Explain why you need it first; the user will confirm before you add it.

**Styling — CSS Modules for all components.** The app is fully DOM-based; React Native Web has been removed. Build new components with CSS Modules. Legacy inline-styled (RNW-era) code: leave alone unless explicitly asked to refactor (touch-it-fix-it is fine; dedicated refactors are not).

**Color usage — design tokens.** Two-layer system. Source of truth: `docs/design-tokens.md`. CSS variables in `src/styles/tokens.css`. JS bridge aliases on `C` in `src/styles.js`.

- New components MUST consume semantic tokens: `var(--text-muted)` in CSS Modules; `C.textMuted`, `C.borderDefault`, `C.surfaceBase` in any remaining inline-styled code.
- Do NOT introduce new raw colors. No new `gray(0.x)`, no raw `rgb()`/`rgba()`/`#hex` in `src/screens/` or `src/dom_components/`. `src/styles.js` is the only exemption.
- If no token fits, propose one in `docs/design-tokens.md` BEFORE hardcoding. Token addition is 3 files: doc + `tokens.css` + `styles.js` bridge alias.
- For non-CSS contexts (canvas, jsPDF, charts, color math), use `resolveToken("text-muted")` from `src/styles.js`.
- Legacy `gray()` and old `C.*` names work during migration (Phases 5–9) and retire in Phase 9. Migration is opportunistic ("touch-it-fix-it"), never dedicated.

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

**Do not use** `vw`/`vh`/`vmin`/`vmax`, `rem`/`em`, or media queries — the JS-measured root binds the layout to the viewport; these are redundant.

If unsure which approach a new layout calls for, default to percentages and ask. Silent use of flex sizing where percentages were intended produces layouts that behave differently across screens and are hard to debug later.

---

**Standalone / solo sale = no customerID.** A "standalone sale" or "solo sale" is a workorder with no `customerID` (`!workorder.customerID`). The absence of `customerID` is the sole indicator. Do not invent or reference an `isStandaloneSale` flag.

**SaaS positioning.** This is a multi-tenant SaaS being prepared for distribution. When you see opportunities for professional-grade upgrades (reliability, onboarding polish, observability, security), surface them.

**"View pic" shortcut.** When the user says "view pic", read `C:\Users\hiebf\OneDrive\Desktop\snip.png`.

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
