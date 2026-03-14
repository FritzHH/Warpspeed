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

**No new `useEffect` without permission.** You are not allowed to create a new `useEffect` under any circumstances without the user's explicit permission. You must explain why you need it first; the user will confirm before you add it. No exceptions unless otherwise stated by the user.

**Use only react-native-web components.** You will use only react-native-web components (and project wrappers that use them) unless the user explicitly gives permission to use a standard React component or feature. No exceptions unless otherwise stated by the user.

**Inline styling only.** Use inline styling only for both new and existing components; stay consistent with the rest of the app. Do not separate styles from the components (no separate StyleSheet files or style objects in other files). No exceptions unless otherwise stated by the user.

**No CSS — flexbox only.** Do not use CSS classes, stylesheets, or CSS-in-JS. All layout must use flexbox properties inline. No exceptions unless otherwise stated by the user.

Then execute the user's prompt according to these guidelines.

---

# Architecture Guide

## What this app is
Multi-tenant POS/service management system for Bonita Bikes. React frontend + Firebase backend + Stripe payments.

## Stack
- **Frontend:** React 19.1 (Create React App), React Native Web 0.20, Zustand 5
- **Backend:** Firebase 11.6 (Firestore, Realtime DB, Auth, Storage, Cloud Functions Node 22)
- **Payments:** Stripe Terminal (server-driven, physical card readers)
- **SMS:** Vonage / Twilio
- **UI:** react-native-web + @rneui/base — inline flexbox styling only
- **Other:** face-api.js (facial recognition), jsPDF, dayjs, lodash

## Key files
| File | Purpose |
|------|---------|
| `src/App.js` | Entry point — auth init, routing, device detection |
| `src/stores.js` | All Zustand stores (16 stores, 24KB) |
| `src/styles.js` | Global theme — colors, gradients, fonts, icons |
| `src/utils.js` | 2000+ lines of utility functions |
| `src/components.js` | 2600+ lines of reusable UI components |
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
**`SHADOW_RADIUS_PROTO`** — Reusable shadow style object (imported from components.js)

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

## `src/components.js` — Reusable UI Components

**Inputs:** `TextInput_`, `PhoneNumberInput`, `NumberSpinner_`, `TimeSpinner`, `DateTimePicker`
**Buttons:** `Button_` (supports icons, loading, gradients), `TabMenuButton`, `TouchableOpacity_`, `SliderButton_`
**Selection:** `CheckBox_`, `DropdownMenu`, `ModalDropdown`
**Display:** `Image_`, `GradientView`, `LoadingIndicator`, `SmallLoadingIndicator`
**Modals:** `ScreenModal` (centered modal wrapper), `AlertBox_`, `LoginModalScreen`
**Layout:** `VertSpacer`, `HorzSpacer`, `TabMenuDivider`

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
**Realtime Database:** `{tenantID}/{storeID}/SETTINGS/`, `INVENTORY/`, `OPEN-WORKORDERS/`, `PAYMENT-PROCESSING/`, `PUNCH-CLOCK/`
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
