# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
yarn start              # Dev server (CRA)
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

# Agent behavior before executing prompts

**Question mark = information only.** If the user's prompt ends with a question mark (`?`), treat it as a request for information only. Do not make any code changes, file edits, refactors, or run commands that alter the project. Answer with explanations, code references, or descriptions only. No exceptions unless otherwise stated by the user.

---

Follow these steps before acting on any user request:

1. **Clarify** – If the request is ambiguous or could be implemented in multiple ways, ask one short clarifying question or state your understanding and proceed with the most reasonable interpretation.

2. **Context** – Before editing or suggesting changes:
   - Read or search the codebase for relevant files (components, APIs, config) instead of guessing.
   - Respect existing patterns: file layout (`src/screens/`, `src/components/`, `functions/`), naming, and style already in the project.

3. **Project stack** – This repo is the Warpspeed/Bonita Bikes app: React (Create React App), Firebase (Firestore, Hosting, Cloud Functions), Stripe. Prefer existing libraries and patterns; do not introduce new frameworks or redundant dependencies unless the user asks.

4. **Safety** – Do not remove or refactor large areas of code unless the user explicitly asks. Prefer small, targeted edits. Do not commit secrets or hardcoded credentials; point out if you see them and suggest env/config.

5. **Scope** – Fulfill what was asked without adding unrelated features, refactors, or documentation unless the user requests them.

6. **Deploy commands** – When you modify a Cloud Function and it needs deploying, always provide the deploy command in a standalone code block. Only deploy the specific functions that changed — never `--only functions` (which deploys all). Format: `firebase deploy --only functions:functionName1,functions:functionName2`

**No new `useEffect` without permission.** You are not allowed to create a new `useEffect` under any circumstances without the user's explicit permission. You must explain why you need it first; the user will confirm before you add it. No exceptions unless otherwise stated by the user.

**We are transitioning to a DOM-based system, moving away from React-Native-Web and inline JSX styling. Use CSS Modules and modern components to build new components. Use the same approach when asked to refactor react-native-web components.**

**Color usage — design tokens.** This app uses a two-layer design token system. Source of truth: `docs/design-tokens.md`. CSS variables live in `src/styles/tokens.css`. JS bridge aliases live on the `C` object in `src/styles.js`.

- **New components MUST consume semantic tokens.** In CSS Modules use `var(--text-muted)`, `var(--border-default)`, etc. In inline-styled (RN-web era) components use the new aliases `C.textMuted`, `C.borderDefault`, `C.surfaceBase`, etc.
- **Do NOT introduce new raw colors.** No new `gray(0.x)` calls, no raw `rgb()`/`rgba()`/`#hex` literals in `src/screens/` or `src/dom_components/`. The bridge layer in `src/styles.js` is the only exemption.
- **If no token fits the use case**, propose a new token in `docs/design-tokens.md` BEFORE hardcoding. Token addition is a 3-file change: doc + `tokens.css` + `styles.js` bridge alias.
- **For non-CSS contexts** (canvas, jsPDF, chart libs, programmatic color math) use `resolveToken("text-muted")` from `src/styles.js` to get the computed RGB literal.
- **Legacy `gray()` and old `C.*` names keep working** during migration (Phases 5-9). They will be retired in Phase 9. Do not migrate existing files unrelated to the task at hand - migration is opportunistic ("touch-it-fix-it"), never a dedicated refactor.

**Sizing rule:
This app uses percentage-based sizing as the default for all width and height values. Layouts in this codebase are deliberate — most boxes have a specific proportion of their parent, not a "fill remaining space" relationship. Percentages express that intent directly and produce consistent proportions across all screen sizes.
Default: percentages.

Widths and heights of containers, panels, rows, cards, inputs, buttons — percentages of their parent.
Padding and margin in percentages where layout-relevant. Px is acceptable for fine details (1-2px borders, small gaps).
The default mental model is "this element is X% of its parent," not "this element fills available space."

Use flex freely for arrangement:

flex-direction, justify-content, align-items, gap, flex-wrap — these describe how children are laid out, not how big they are. Use them anywhere they help.

flex-shrink: 0 is required on percentage-sized children.

CSS defaults flex children to flex-shrink: 1, which means a child with width: 25% will compress below 25% if the parent runs short of space.
All percentage-sized children must have flex-shrink: 0 to lock their declared size. This is the most important sizing-flex property in this codebase and is non-negotiable.

Flex sizing (flex: 1, flex-grow, flex-basis) is for the rare flex-only layouts.

A flex-only layout is one where children genuinely should share or fill available space rather than holding fixed proportions. These exist but are uncommon.
Use flex sizing when the layout's intent is "split available space" or "fill what's left" — not when it's "this is 25% of the parent."
When you do use flex sizing, use it deliberately and consistently within that layout. Don't mix flex: 1 siblings with percentage-sized siblings in the same row unless there's a specific reason.

Do not replace existing percentages with flex sizing.

The percentages already in the codebase are deliberate. Even if flex: 1 seems cleaner, do not substitute during unrelated work.
The same rule applies when converting RN-web components to DOM: percentages stay as percentages.

If you're unsure which approach a new layout calls for, default to percentages and ask.

The cost of asking is small. The cost of silently using flex sizing where percentages were intended is a layout that behaves differently on different screens, which is hard to debug after the fact.

Do not use vw, vh, vmin, vmax, rem, or em for layout.

Percentages of the parent are the consistent idiom.

Do not add media queries or breakpoints.

The layout does not reflow at different screen sizes by design. Percentages handle cross-screen proportionality. **

**Inline styling only unless it is a DOM refactor/migration.** for a DOM/React refactor or implementation, use CSS Modules. for a react-native-web component, Use inline styling only for both new and existing components;

**Standalone / solo sale = no customerID.** When the user refers to a "standalone sale" or "solo sale", that means a workorder with no `customerID` (`!workorder.customerID`). There are no special flags or fields — the absence of `customerID` is the sole indicator. Do not use or reference `isStandaloneSale` or any other flag.

** This app is being transitioned to a full-scale SaaS for distribution. Suggest professional-grade upgrades or transitions where you see them.

** When the user says "view pic" in chat, you are to follow "C:\Users\hiebf\OneDrive\Desktop\snip.png" and view that photo for the relevant information.

Then execute the user's prompt according to these guidelines.

---

# Architecture Guide

## What this app is
Multi-tenant POS/service management system for Bonita Bikes. React frontend + Firebase backend + Stripe payments.

## Stack
- **Frontend:** React 19.1 (Create React App), React Native Web 0.20 (transitioning out of), React/DOM/CSS Modules, Zustand 5
- **Backend:** Firebase 11.6 (Firestore, Realtime DB, Auth, Storage, Cloud Functions Node 22)
- **Payments:** Stripe Terminal (server-driven, physical card readers)
- **SMS:** Twilio
- **UI:** WAS react-native-web + @rneui/base — inline flexbox styling only -- transitioning incrementally to pure DOM environment with CSS modules 
- **Other:** face-api.js (facial recognition), jsPDF, dayjs, lodash

## Key files
| File | Purpose |
|------|---------|
| `src/App.js` | Entry point — auth init, routing, device detection |
| `src/stores.js` | All Zustand stores (16 stores, 24KB) |
| `src/styles.js` | Global theme — colors, gradients, fonts, icons |
| `src/utils.js` | 2000+ lines of utility functions |
| `src/dom_components` | 2600+ lines of reusable UI components | 
| `src/data.js` | Data prototypes and config objects (19KB) |
| `src/constants.js` | App-wide constants (permissions, DB nodes, discount types) |
| `src/db_calls_wrapper.js` | Business logic layer wrapping Firebase ops (90KB) |
| `src/db_calls.js` | Low-level Firestore/RTDB/Auth/Storage SDK calls |
| `src/private_user_constants.js` | Firebase config, Cloud Function URLs |
| `src/screens/BaseScreen.js` | Main shell — tabs, modal overlays, Firestore listeners |
| `functions/firebase-index.js` | All Cloud Functions (payments, SMS, face recognition) |

## Folder structure
```
src/
├── screens/
│   ├── BaseScreen.js
│   ├── LoginScreen.js
│   ├── screen_collections/        # Tab sections (Info, Items, Options, Notes)
│   └── screen_components/
│       ├── Info_Screen/
│       ├── Items_Screen/
│       ├── Options_Screen/
│       ├── Notes_Screen/
│       └── modal_screens/
│           ├── checkout_components/       # Old checkout sub-components
│           └── newCheckoutModalScreen/    # New modular checkout system
functions/
├── firebase-index.js
└── payments.js
```

## `src/styles.js` — Theme & Visual Constants

**`Colors`** — Raw color values: `mainBackground`, `secondBackground`, `buttonMainBackground`, `darkText`
**`C`** — Named color shortcuts used everywhere:
- Backgrounds: `backgroundWhite`, `listItemWhite`, `backgroundListWhite`
- Borders: `buttonLightGreenOutline` (green border used on input boxes, cards, dividers)
- Text: `text`, `textWhite`, `lightText`
- Accents: `green`, `blue`, `red`, `lightred`, `orange`, `purple`
**`COLOR_GRADIENTS`** — Gradient arrays for `Button_` colorGradientArr prop: `red`, `green`, `blue`, `greenblue`, `purple`, `lightBlue`, `grey`
**`Fonts`** — Weight constants: `Fonts.weight.textRegular`, `textHeavy`, `textSuperheavy`
**`ICONS`** — 40+ image asset references (workorder, receipt, bicycle, tools, editPencil, etc.)
**`SHADOW_RADIUS_PROTO`** — Reusable shadow style object exported from `src/styles.js`

Common style patterns:
```js
// Green-bordered input box
{ borderColor: C.buttonLightGreenOutline, borderRadius: 10, borderWidth: 2, backgroundColor: C.listItemWhite, paddingVertical: 10, paddingHorizontal: 10 }
// Gray text helper
gray(0.5) // returns "rgb(128,128,128)" at 50% brightness
// Lightened color
lightenRGBByPercent(C.green, 60) // lighten green by 60%
```

## `src/utils.js` — Utility Functions (2000+ lines)

**Currency & Pricing:**
- `formatCurrencyDisp(cents, withDollar)` — format cents for display ("1,234.56")
- `usdTypeMask(val, opts)` — input mask for dollar amounts, returns `{ display, cents }`
- `dollarsToCents(dollars)` — convert dollars to cents
- `calculateRunningTotals(workorder)` — returns `{ runningSubtotal, runningDiscount, runningTotal, runningQty }`
- `applyLineItemDiscounts(lines, discounts)` — apply discount rules to line items
- `roundToTwoDecimals(n)`, `trimToTwoDecimals(n)`

**Search:**
- `fuzzySearch(query, arr)` — fuzzy text search with Levenshtein distance
- `searchCustomers(query)` — async customer search (phone, name, email)
- `searchPhoneNum(phone)`, `searchCustomerNames(first, last)`

**Formatting:**
- `formatPhoneWithDashes(phone)` — "2392919396" → "239-291-9396"
- `formatMillisForDisplay(millis)` — readable date/time
- `capitalizeFirstLetterOfString(str)`, `capitalizeAllWordsInSentence(str)`

**Color:**
- `gray(percent)` — generate gray RGB string
- `lightenRGBByPercent(rgb, percent)`, `lightenRGB(rgb, amount)`
- `hexToRgb(hex)`, `rgbToHex(r,g,b)`, `bestForegroundHex(bgHex)`

**Array/Object:**
- `replaceOrAddToArr(arr, item)` — update or insert by ID
- `addOrRemoveFromArr(arr, item)` — toggle item
- `removeArrItem(arr, item)` — remove by ID
- `deepEqual(a, b)` — deep equality check

**IDs & Barcodes:**
- `generateUPCBarcode()` — 12-digit barcode
- `generateRandomID()` — unique ID string
- `getReceiptType(barcode)` — decode receipt type from barcode prefix

**Other:**
- `log()`, `clog()` — console logging helpers
- `extractStripeErrorMessage(data, res)` — parse Stripe API errors
- `checkInputForNumbersOnly(val)` — validate numeric input
- `printBuilder` — receipt printing utilities (printBuilder.sale, etc.)

## `src/data.js` — Data Prototypes & Config

**Core Prototypes** (use with `cloneDeep()`):
- `CUSTOMER_PROTO` — { first, last, cell, email, streetAddress, workorders[], sales[] }
- `WORKORDER_PROTO` — { status, workorderLines[], customerID, brand, model, colors }
- `WORKORDER_ITEM_PROTO` — { qty, inventoryItem, discountObj, warranty, id }
- `SALE_PROTO` — { payments[], refunds[], subtotal, discount, tax, total, amountCaptured }
- `PAYMENT_OBJECT_PROTO` — { amountCaptured, amountTendered, cash, last4, cardType }
- `INVENTORY_ITEM_PROTO` — { formalName, informalName, brand, price, salePrice, cost, category }
- `DISCOUNT_OBJ_PROTO` — { name, value, type, savings, newPrice }
- `REFUND_PROTO` — { workorderLines[], amount, notes }
- `APP_USER` — { id, permissions, pin, phone, faceDescriptor }
- `SETTINGS_OBJ` — master settings (store info, hours, statuses, discounts, users, tax rates)

**Constants:**
- `CONTACT_RESTRICTIONS` — { call, email }
- `COLORS` — 16 color options with textColor/backgroundColor pairs
- `PRIVILEDGE_LEVELS` — { Admin, SuperUser, Owner, User }
- `RECEIPT_TYPES` — { Workorder, Sale, Intake }

## State management (Zustand)
All state lives in `src/stores.js`. 16 stores:

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

All stores follow this getter/setter convention:
```js
const useCheckoutStore = create((set, get) => ({
  // State field
  receiptScan: "",

  // Getter — returns the current value
  getReceiptScan: () => get().receiptScan,

  // Setter — sets a single field by name (string-only in this case)
  setStringOnly: (receiptScan) => set({ receiptScan }),
}));
```

**Pattern rules:**
- **Getters:** `get<FieldName>: () => get().<fieldName>` — always return from `get()`, never from closure
- **Setters:** `set<FieldName>: (<fieldName>) => set({ <fieldName> })` — use ES6 shorthand property
- **In components:** `const value = useMyStore((state) => state.getValue())`
- **Outside components:** `useMyStore.getState().getValue()` or `useMyStore.getState().setSomething(val)`
- **Complex setters** may accept `(value, shouldSaveToDb)` and call db_calls_wrapper internally

### Store access examples
```js
// In a component — subscribe to reactive updates
const zSettings = useSettingsStore((state) => state.getSettings());
const _zSetWorkorder = useOpenWorkordersStore((state) => state.setWorkorder);

// Call setter
_zSetWorkorder(updatedWorkorder, true); // true = also save to DB

// Outside a component (utility function, callback)
useSettingsStore.getState().getSettings();
```

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
**Firestore Database:** `{tenantID}/{storeID}/SETTINGS/`, `INVENTORY/`, `OPEN-WORKORDERS/`, `PAYMENT-PROCESSING/`, `PUNCH-CLOCK/`
**Cloud Storage:** `{tenantID}/{storeID}/completed-workorders/{status}/{year}/{month}/`, `completed-sales/...`, `punch-history/...`

## Database layer
- `db_calls.js` — Low-level SDK calls (firestoreWrite, realtimeDbSet, storageUploadString, authSignIn, callable Cloud Functions)
- `db_calls_wrapper.js` — Business logic: path building, validation, 60+ domain functions (dbSaveCustomer, dbCompleteWorkorder, dbProcessServerDrivenStripePayment, etc.)
- Path building: `build_db_path.settings()`, `build_db_path.inventory()`, etc. (in constants.js)

## Data flow
1. `App.js` initializes auth → loads settings → initializes stores
2. `BaseScreen.js` subscribes to Firestore (real-time listeners via `dbListenTo*`)
3. UI reads from Zustand stores; writes go through `db_calls_wrapper.js` → `db_calls.js`
4. Heavy operations (payments, SMS, face recognition) go through Cloud Functions
5. Speed-first: always update local Zustand store immediately, then persist to DB

## Permission levels
- SuperUser: 4 | Admin: 3 | Editor: 2 | User: 1

## Navigation
- React Router: `/login` and `/` (dashboard)
- Tab-based within BaseScreen: Info → Items → Options → Notes

## Naming conventions
- Stores: `use*Store` (useLoginStore, useSettingsStore)
- Prototypes: `*_PROTO` (CUSTOMER_PROTO, WORKORDER_ITEM_PROTO)
- Constants: `UPPER_SNAKE_CASE` (MILLIS_IN_HOUR, DISCOUNT_TYPES)
- DB functions: `db*` prefix (dbSaveCustomer, dbGetCompletedSale)
- Components: PascalCase with trailing underscore for custom (Button_, CheckBox_, TextInput_)
- Zustand prefixes in components: `z` for store values, `_z` for store setters, `s` for local state, `_s` for local setters
