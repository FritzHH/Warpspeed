# React Native Web Migration — Cleanup Audit

Read-only audit of the warpspeed codebase. Scope: `src/`. No source files were modified by this audit.

## Summary

- **Total files with RN-Web relics in `src/`: 22**
  - 21 import from `react-native` / `react-native-web`
  - 1 (`src/styles.js`) is the known migration bridge and uses RN-style style objects (called out separately)
- **`src/dom_components/`** is clean of RN-web imports (target architecture, as expected).
- **`src/components/`** still has 3 RN-web wrapper files (`LoadingIndicator.js`, `CSSAnimatedSwitch.js`, `AdvancedAnimatedSwitch.js`) — these are replaceable by `src/dom_components/` equivalents.
- **No** `StyleSheet.create`, `Platform.OS`, `Platform.select`, `Dimensions.get`, `<FlatList>`-as-JSX, `<SafeAreaView>`, `<KeyboardAvoidingView>`, `<BackHandler>`, `<AppState>`, `<AsyncStorage>`, `<NetInfo>`, `<Linking>`, or `style={[...]}` array-style usage was found in `src/`. That's a meaningfully clean starting point.
- **`<FlatList>` appears in 1 file as a named import** (`MobileItemEditScreen.js`) but is not used in JSX in any other scanned file.
- **`Animated`** is used in exactly 1 file: `src/components/AdvancedAnimatedSwitch.js` (which is already superseded by `src/dom_components/AnimatedSwitch/`).
- **`Alert`** is imported in 1 file (`LoginScreen.js`) but the codebase has a DOM-based `AlertBox` in `dom_components`.

### Breakdown by group

| Group | File count | Estimated effort |
|---|---|---|
| 1. Mobile screens (full screens, RN-web heavy) | 5 | Large |
| 2. Top-level screens (heavy RN-web usage) | 6 | Large |
| 3. Modal / section files (medium RN-web usage) | 3 | Medium |
| 4. Face detection / camera screens | 2 | Medium |
| 5. Legacy wrapper components in `src/components/` | 3 | Small |
| 6. Entry / shell files (one-liner `<View>` wrappers) | 2 | Small |
| 7. Misc (legacy date picker) | 1 | Small |
| 8. `src/styles.js` bridge (separate — keep until migration done) | 1 | n/a |
| 9. Dependency removal (package.json) | (after all above) | Small |

### Recommended order of attack

1. **Group 5** (legacy wrapper components in `src/components/`) — leaf components, each ≤120 lines, all already have DOM replacements. Removes ~3 RN-web imports immediately.
2. **Group 6** (App.js, MobileBaseScreen, MobileHomeScreen — files where `<View>` is the only RN piece). Converts trivially to `<div>`.
3. **Group 7** (legacyDateTimePicker.js) — only `View` wrapping, and it depends on `react-native-ui-datepicker` which itself pulls in RN. Decide whether to delete (looks unused) or replace with the DOM `DatePicker` in `dom_components`.
4. **Group 4** (faceDetection.js + faceDetectionClient.js) — small, isolated, and `faceDetectionClient.js` is the only file in the entire repo that still imports from bare `"react-native"` (not `react-native-web`). High symbolic value to fix.
5. **Group 3** (Options_Section, DatabaseViewerScreen, TranslateScreen) — medium-size single-screen files.
6. **Group 2** (top-level screens: BaseScreen, LoginScreen, IntakeScreen, CustomerDisplayScreen, NewCheckoutModalScreen) — large but well-scoped; each is one PR.
7. **Group 1** (mobile screens) — 5 files, can be batched. They’re a self-contained subtree under `src/screens/mobile/` and could be done in one or two PRs.
8. **Group 9** — once all of the above are done, remove RN deps from `package.json` and verify the Vite build still works.

---

## Group 1: Mobile screens — full RN-web screens

These five files in `src/screens/mobile/` collectively account for ~165 RN element instances. They are a self-contained subtree and a good single batch.

Files affected:
- `src/screens/mobile/MobileWorkorderDetailScreen.js` — 12 `<View>`, 11 `<Text>`, 6 `onPress=`, 1 `<Image as RNImage>`, plus `<ScrollView>` / `<TouchableOpacity>`
- `src/screens/mobile/MobileItemEditScreen.js` — 8 `<View>`, 5 `<Text>`, 1 `<ScrollView>`, 7 `onPress=`, also imports `FlatList`
- `src/screens/mobile/MobileWorkorderListScreen.js` — 2 `<View>`, 2 `<Text>`, 6 `onPress=`
- `src/screens/mobile/MobileBaseScreen.js` — 2 `<View>`, `<Text>`, `<TouchableOpacity>`
- `src/screens/mobile/MobileHomeScreen.js` — 2 `<View>` only (small)

Sample (`src/screens/mobile/MobileItemEditScreen.js:1-9`):
```js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from "react-native-web";
```

Suggested replacement pattern:
```js
// before
<TouchableOpacity onPress={handleSave} style={{ padding: 12, backgroundColor: C.green }}>
  <Text style={{ color: "white" }}>Save</Text>
</TouchableOpacity>

// after — for a clickable element prefer the existing dom_components/Button
<Button onClick={handleSave} label="Save" />
// or, if you need full custom styling, a button element:
<button type="button" onClick={handleSave} className={styles.saveBtn}>Save</button>

// View → div, Text → span (inline) or p (block), ScrollView → div with overflow:auto
<div className={styles.row}>
  <span className={styles.label}>{title}</span>
</div>

// FlatList → react-window FixedSizeList (already in deps) or a simple .map for small lists
```

Risk / gotchas:
- RN `<Text>` cascades font/color styles to nested `<Text>`; DOM `<span>` does not. Audit any nested Text usage to make sure styles still resolve.
- `<TouchableOpacity>` has a built-in opacity-on-press visual. Replace with a CSS `:active { opacity: 0.7 }` rule in the relevant CSS module, or use `Button` from `dom_components`.
- `<ScrollView>` defaults to `flex: 1` and clip content. Replicate with `display: flex; flex-direction: column; overflow-y: auto`.
- The codebase rule is **CSS Modules** for conversions, not inline styling (per CLAUDE.md "We are transitioning to a DOM-based system"). Create `MobileItemEditScreen.module.css` etc.

---

## Group 2: Top-level screens — heavy RN-web usage

Files affected:
- `src/screens/CustomerDisplayScreen.js` — 46 `<View>`, 32 `<Text>`, 3 `<ScrollView>`, RN `<Image>`, `<TouchableOpacity>` (largest single file)
- `src/screens/screen_components/modal_screens/newCheckoutModalScreen/NewCheckoutModalScreen.js` — 41 `<View>`, 37 `<Text>`, 2 `<ScrollView>`, 10 `onPress=`
- `src/screens/IntakeScreen.js` — 12 `<View>`, 5 `<Text>`, 1 `<ScrollView>`, 6 `onPress=`
- `src/screens/LoginScreen.js` — 8 `<View>`, 7 `<Text>`, 2 `onPress=`, RN `Alert`, RN `Image`
- `src/screens/BaseScreen.js` — 1 `<View>`, 1 `<Text>`, 1 `<TouchableOpacity>`, 1 `<ActivityIndicator>` (minimal, mostly already DOM)
- `src/screens/DatabaseViewerScreen.js` — 7 `<View>`, 17 `<Text>`, 1 `<ScrollView>`, 1 `<TouchableOpacity>`

Sample (`src/screens/LoginScreen.js:1-13`):
```js
import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, Alert } from "react-native-web";
import { C, Colors, Fonts } from "../styles";
import { sendPasswordReset, dbLoginUser, dbLogout, loadTenantAndSettings } from "../db_calls_wrapper";
import { gray } from "../utils";
import { topUpPool } from "../idPool";
import logo from "../resources/default_app_logo_large.png";

const BRAND_BLUE = "#2B7CB5";
const BRAND_YELLOW = "#D4B830";
const BRAND_DARK_BLUE = "#1A5A8A";

export function LoginScreen({ setUser }) {
```

Suggested replacement pattern:
```js
// before
import { View, Text, TouchableOpacity, Image, Alert } from "react-native-web";

// after
import { AlertBox, Image, Button } from "../dom_components";
// drop View → div, Text → span/p, TouchableOpacity → button or dom_components Button
// Alert.alert(...) → use AlertBox or useAlertScreenStore from stores.js
```

Risk / gotchas:
- `LoginScreen` and `IntakeScreen` are entry/auth-critical — convert with care, smoke-test login flow end-to-end.
- `CustomerDisplayScreen.js` is the secondary-display screen (broadcastChannel target). Test the cross-tab broadcast still works after conversion.
- `NewCheckoutModalScreen.js` is the heart of checkout and is large. Consider converting it last, or in a dedicated PR.
- `RN <Image>` accepts `source={{ uri }}` and an array-style `style`. DOM `<img>` uses `src` and `style={{...}}`. The codebase already has `dom_components/Image/Image.js`; use it.
- `Alert.alert("title", "msg")` → use `useAlertScreenStore.getState().setAlertScreenConfig({...})` (existing pattern).

---

## Group 3: Section / modal mid-size files

Files affected:
- `src/screens/screen_collections/Options_Section.js` — 4 `<View>`, 5 `<Text>`, 1 `<TouchableOpacity>`, 1 `<ActivityIndicator>`
- `src/screens/TranslateScreen.js` — 3 `<View>`, 2 `<Text>`
- `src/screens/screen_components/modal_screens/SalesReports.js` — only RN dep is `react-native-ui-datepicker` (not RN core)

Sample (`src/screens/screen_collections/Options_Section.js:1-5`):
```js
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native-web";
import { ... } from "../../utils";
import { Button, Tooltip } from "../../dom_components";
import { TabMenuButton } from "../../dom_components/TabMenuButton/TabMenuButton";
import { C, COLOR_GRADIENTS, Fonts, ICONS, Z } from "../../styles";
```

Suggested replacement pattern:
```js
// before
<ActivityIndicator size="small" color={C.green} />

// after — use the existing dom_components LoadingIndicator
import { LoadingIndicator, SmallLoadingIndicator } from "../../dom_components";
<SmallLoadingIndicator color={C.green} />
```

Risk / gotchas:
- `SalesReports.js` depends on `react-native-ui-datepicker`. The codebase already has `dom_components/DatePicker/DatePicker.js` (uses `react-day-picker`). Coordinate with whoever owns the reports flow before swapping — the date semantics (range vs single) may differ.
- `Options_Section.js` is the tab container for the Options tab — high traffic, smoke-test all four sub-tabs after conversion.

---

## Group 4: Face detection / camera screens

Files affected:
- `src/faceDetection.js` — 2 `<View>`, 1 `<Text>` (imports from `react-native-web`)
- `src/faceDetectionClient.js` — 2 `<View>`, also imports `Button` from RN — **only file in the codebase importing from bare `"react-native"`** (not `react-native-web`)

Sample (`src/faceDetectionClient.js:1-11`):
```js
import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { View, Button, Text } from "react-native";   // ← bare react-native!
import * as faceapi from "face-api.js";
import { clog, localStorageWrapper, log } from "./utils";
```

Suggested replacement pattern:
```js
// before
import { View, Button, Text } from "react-native";

// after
import { Button } from "./dom_components";
// View → <div>, Text → <span>
```

Risk / gotchas:
- `faceDetectionClient.js` may be **dead code** — `BaseScreen.js` only lazy-loads `faceDetection.js`. Verify before converting; if dead, delete instead.
- Camera/face-api logic itself is DOM-based (`<video>`, `<canvas>`); only the surrounding chrome is RN. Conversion is mechanical.
- Bare `react-native` shouldn’t even resolve under Vite for web — this import is either silently aliased to `react-native-web`, or this file is dead.

---

## Group 5: Legacy wrapper components in `src/components/`

Files affected:
- `src/components/LoadingIndicator.js` — RN `<View>`, `<ActivityIndicator>`, `<Text>` wrapper. **Direct replacement exists**: `src/dom_components/LoadingIndicator/LoadingIndicator.js`.
- `src/components/CSSAnimatedSwitch.js` — RN `<View>` wrapping a CSS-transition fade. **Direct replacement exists**: `src/dom_components/AnimatedSwitch/AnimatedSwitch.js`.
- `src/components/AdvancedAnimatedSwitch.js` — uses `Animated` API from `react-native-web` (only file in repo doing so). Also superseded by `dom_components/AnimatedSwitch`.

Sample (`src/components/AdvancedAnimatedSwitch.js:1-11`):
```js
import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native-web';

export const AdvancedAnimatedSwitch = ({ children, animationType = 'crossfade', duration = 300 }) => {
  const [currentChildren, setCurrentChildren] = useState(children);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
```

Suggested replacement pattern:
```js
// before
import { LoadingIndicator } from "../components/LoadingIndicator";
import { CSSAnimatedSwitch } from "../components/CSSAnimatedSwitch";

// after
import { LoadingIndicator, AnimatedSwitch } from "../dom_components";

// For AdvancedAnimatedSwitch, replace Animated.Value/Animated.timing with CSS transition
// or framer-motion-style approach already used in dom_components/AnimatedSwitch
```

Risk / gotchas:
- Grep for consumers of these three exports first. `LoadingIndicator` is re-exported from `dom_components/index.js` so the rename should be drop-in for most importers.
- `AdvancedAnimatedSwitch` may be unused — verify via grep before deleting.
- After this group, the entire `src/components/` directory may be removable except for `ProtectedRoute.js` (and a few others that survived earlier phases).

---

## Group 6: Entry / shell files — one-liner `<View>` wrappers

Files affected:
- `src/App.js` — imports `View` from `react-native-web` to wrap the router tree. 7 inline `style={{...}}` usages.
- `src/screens/HomeScreen.js` — minor `<View>` usage (no RN import per top scan, but still in the list — re-verify)

Sample (`src/App.js:26`):
```js
import { View } from "react-native-web";
```

The `<View>` is used purely as a layout container at the root of the router.

Suggested replacement pattern:
```js
// before
<View style={{ flex: 1, backgroundColor: C.mainBackground }}>{children}</View>

// after
<div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: C.mainBackground }}>
  {children}
</div>
```

Risk / gotchas:
- RN `<View>` defaults to `display: flex; flex-direction: column`; `<div>` defaults to `display: block`. **Most layout bugs from RN→DOM conversion come from forgetting this.** Add `display: flex; flex-direction: column` explicitly.
- App.js is the entry point — guard against accidentally breaking SSR / Vite preview by smoke-testing `yarn begin` after.

---

## Group 7: Misc — legacy date picker

Files affected:
- `src/legacyDateTimePicker.js` — imports `View` from `react-native-web` and `CalendarPicker` from `react-native-ui-datepicker`.

Sample (`src/legacyDateTimePicker.js:1-7`):
```js
import React from "react";
import { View } from "react-native-web";
import CalendarPicker, { useDefaultStyles } from "react-native-ui-datepicker";
import { C } from "./styles";

const LegacyDateTimePicker = ({ range, handleDateRangeChange = () => {} }) => {
```

Suggested replacement pattern:
```js
// Check usages first — file name suggests it's already deprecated.
// If still used, replace with dom_components/DatePicker (built on react-day-picker).
// If unused, delete the file and remove react-native-ui-datepicker from package.json.
```

Risk / gotchas:
- File name screams "I'm dead". Verify with grep across `src/` before deleting; if no consumers, this is a free win.
- `react-native-ui-datepicker` may also be referenced by `SalesReports.js` (Group 3) — coordinate.

---

## Group 8: `src/styles.js` — known bridge, leave for last

This file is the cross-codebase color/theme bridge (`C`, `Colors`, `Fonts`, `ICONS`, `SHADOW_RADIUS_PROTO`). CLAUDE.md and the design-tokens plan explicitly mark this file as an intentional migration bridge — **flag, do not migrate as part of this RN cleanup**. It uses RN-style keys like `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`, `elevation` purely as style fragments to be spread into RN-style `style={{...}}` props. These will be replaced when Phase 9 of the design-tokens plan retires the old `C.*` aliases.

No action required as part of this RN-Web cleanup. Note: most of the 185 hits for `shadowColor|shadowOpacity|...` in the codebase trace back to spreading `SHADOW_RADIUS_PROTO` from this file. Those will resolve naturally as the design-tokens migration progresses.

---

## Group 9: Dependencies to remove (once code is clean)

Once Groups 1–7 are merged, these `package.json` deps can be dropped. **Verify zero consumers before each removal.**

| Package | Last-known consumers (after cleanup) | Safe to remove when |
|---|---|---|
| `react-native` | `src/faceDetectionClient.js` only (Group 4) | After Group 4 |
| `react-native-web` | All Group 1–7 files | After Groups 1–7 |
| `@rneui/base` | No `src/` imports found in this audit | **Likely already safe to remove now** — verify with one more grep |
| `@rneui/themed` | No `src/` imports found | **Likely already safe to remove now** |
| `@react-native-community/datetimepicker` | No `src/` imports found | **Likely already safe to remove now** |
| `@react-native-documents/picker` | No `src/` imports found | **Likely already safe to remove now** |
| `react-native-document-picker` | No `src/` imports found | **Likely already safe to remove now** |
| `react-native-pager-view` | No `src/` imports found | **Likely already safe to remove now** |
| `react-native-vector-icons` | No `src/` imports found | **Likely already safe to remove now** |
| `react-native-svg` | No `src/` imports found | **Likely already safe to remove now** (pulled in transitively by some libs — check `yarn why`) |
| `react-native-ui-datepicker` | `legacyDateTimePicker.js`, `SalesReports.js` | After Groups 3 + 7 |
| `react-native-web-linear-gradient` | No `src/` imports found | **Likely already safe to remove now** |

**Recommended verification command** before removing each: a final `grep -r "from ['\"]<pkg>" src/` should return zero hits. Then run `yarn build` (Vite) to confirm nothing transitive breaks.

---

## Config / build files

- **No root-level `babel.config.js`, `metro.config.js`, or `react-native.config.js` found** in the repo (only inside `node_modules`).
- Vite is the build tool (`vite.config.*` — not audited for RN aliases; check whether `react-native` is aliased to `react-native-web` and whether that alias is still needed at the end of the migration).
- `scripts/update-version.js` runs pre-build (unrelated).

No config cleanup required as part of RN removal beyond optionally removing the `react-native` → `react-native-web` Vite alias (if present) once all RN imports are gone.

---

## Files where I can't tell (manual review needed)

- **`src/faceDetectionClient.js`** — imports from bare `"react-native"` (not `react-native-web`). Either Vite is silently aliasing it, or this file is dead code that doesn't actually load in any code path. Likely dead — `BaseScreen.js` only lazy-loads `faceDetection.js`. Confirm before converting vs deleting.
- **`src/components/AdvancedAnimatedSwitch.js`** — only file using the RN `Animated` API. Could be unused; grep for the named export before refactoring.
- **`src/legacyDateTimePicker.js`** — file name suggests deprecated; verify with a grep of `LegacyDateTimePicker` across `src/`.
- **`src/screens/HomeScreen.js`** — appeared in the `onPress=` count but did not appear in the master `react-native` import grep. Means it may already be DOM-only and just shares `onPress=` patterns by accident, or onPress shows up in a comment. Quick visual confirmation needed.
- **`src/screens/screen_components/modal_screens/SalesReports.js`** — only RN-family dep is `react-native-ui-datepicker`. Decide whether to keep that lib (Group 3 risk note) or swap to `dom_components/DatePicker`.
- **`react-native-svg`** dep — `package.json` lists it; no direct `src/` import found in this audit. It may be a transitive of `react-native-ui-datepicker`. Confirm with `yarn why react-native-svg` before removal.
- **Vite config** — not audited for RN aliasing; if `react-native` is aliased to `react-native-web` in `vite.config.*`, that alias becomes dead once all imports are gone and can be removed.
