# DOM / CSS Modules Migration Plan — Dashboard / Quick Buttons

**Scope:** Migrate the four files under `src/screens/screen_components/Items_Screen/dashboard_screen/` from react-native-web + inline styling to pure DOM + CSS Modules, and build the missing `dom_components/` primitives needed to make the rest of the app's migration mechanical.

**Files in scope (initial wave):**
- `Dashboard_Admin.js` — 12,710 lines, mixes RN-web primitives with existing DOM wrappers
- `StandButtonsCanvas.js` — 716 lines, drag/snap canvas, heavy inline RN-style props
- `Dashboard_User.js` — 25 lines, thin wrapper
- `ExtensionSettings.js` — settings form panel

**Out of scope for this plan:** App-wide migration of every remaining RN-web screen. This plan delivers the foundation (primitives) + dashboard as the proving ground. Subsequent screens follow the same pattern.

---

## Guiding principles

1. **Translation only.** No refactors, no "while I'm here" cleanup, no logic changes. A migration PR changes rendering primitives and style location — nothing else.
2. **Section-by-section, never big-bang.** Dashboard_Admin ships in many small PRs, each independently verifiable in the browser.
3. **Primitives first.** Land the missing `dom_components/` building blocks before touching the consumer files. The 12k-line migration should be find-and-replace, not architectural design per screen.
4. **Sizing rule is non-negotiable.** Percentage-based sizing + `flex-shrink: 0` on percentage children must be baked into the primitives so consumers can't accidentally violate the rule.
5. **Browser-verify each section.** Per CLAUDE.md, UI changes require running the dev server and exercising the feature. Type-checks aren't enough.

---

## Phase 0 — Audit & freeze (1 day)

**Goal:** Lock the baseline so we can detect regressions.

- Take screenshots of every dashboard tab, modal, and admin panel at the current implementation. Store under `migration-baseline/` (gitignored, local reference only).
- Note any in-flight branches touching these files — coordinate to avoid conflicts.
- Confirm no edits land on the four dashboard files outside migration PRs for the duration of the project.

**Exit criteria:** Baseline screenshots captured. Team aware of the freeze.

---

## Phase 1 — Build missing primitives in `dom_components/` (3–5 days)

**Goal:** Fill the gaps identified in the audit so Phases 2+ are pure mechanical translation.

### New primitives to build

| Primitive | Replaces | Notes |
|---|---|---|
| `Box` | RN `View` | `<div>` with sizing-rule defaults: when a `%` width/height is passed, applies `flex-shrink: 0` automatically. Default `display: flex; flex-direction: column` to match RN. |
| `Text` | RN `Text` | Semantic `<span>` / `<p>` with `Fonts.weight` presets from `styles.js`. |
| `ScrollView` | RN `ScrollView` | Thin `overflow: auto` wrapper, scrollbar styling. |
| `VirtualList` | RN `FlatList` | Wraps `react-window` or `react-virtuoso`. Needed before any `FlatList` site can migrate. |
| `useDrag` (hook) | RN `PanResponder` | Pointer-event-based. Replaces the raw `getBoundingClientRect` + `window` listener pattern in StandButtonsCanvas. |
| `FadeIn` / `SlideIn` | RN `Animated.Value` / `Animated.View` | CSS-transition-based animation wrappers. Used by `StaleBanner`, `PrinterAlert`, future migrations. |

### Conventions to establish

- **CSS Module file colocation.** Each component's `.module.css` lives next to the `.js`.
- **Class naming.** `kebab-case` inside the module, imported as `styles.kebabCase` (CRA default).
- **No `vw`/`vh`/`rem`/`em`** in any module — percentages of parent only (sizing rule).
- **No media queries** in any module (sizing rule).
- **One-page convention doc** at `src/dom_components/CONVENTIONS.md` so new components are written consistently.

### Decisions needed from you

- [ ] **`react-window` vs `react-virtuoso`** for `VirtualList`. Virtuoso is more ergonomic; react-window is smaller and battle-tested.
- [ ] **Animation library** — pure CSS transitions, or pull in Framer Motion? Pure CSS is lighter; Framer is more capable for future work.

**Exit criteria:** All primitives in place, documented, with a smoke-test screen exercising each one.

---

## Phase 2 — Pilot: StandButtonsCanvas.js (3–5 days)

**Goal:** Validate the Phase 1 primitives on a real, non-trivial file before committing to Dashboard_Admin.

**Why this file:**
- Small enough to migrate in one PR (~700 lines).
- Exercises every new primitive: `Box`, `Text`, `useDrag`, inline-style → CSS Module translation.
- Drag/snap interaction is the hardest pattern in the dashboard — if it works here, it works everywhere.

**Tasks:**
- Swap `View`/`Text`/`TouchableOpacity`/`ScrollView` → new primitives.
- Move all 43+ inline RN-style props into `StandButtonsCanvas.module.css`.
- Translate RN-only props: `paddingHorizontal` → `padding-inline`, `paddingVertical` → `padding-block`, `borderBottomWidth` + `borderBottomColor` → `border-bottom: Xpx solid Y`.
- Replace raw `getBoundingClientRect` + window listeners with `useDrag`.
- Browser-verify: drag a button, snap to grid, persist, reload, drag on touchscreen.

**Exit criteria:** Visual parity with baseline screenshots. Drag works on mouse + touch. PR merged.

**If this phase reveals primitive gaps:** Pause, fix the primitive, then resume. Do not work around it.

---

## Phase 3 — Migrate Dashboard_User.js + ExtensionSettings.js (1–2 days)

**Goal:** Shake out form/settings patterns before tackling Dashboard_Admin's many panels.

- Dashboard_User: trivial (25 lines), good warm-up.
- ExtensionSettings: representative form panel — exercises `TextInput`, `CheckBox`, `Button`, ScrollView.

**Exit criteria:** Both files DOM-pure, no RN imports. Form behavior verified in browser.

---

## Phase 4 — Carve Dashboard_Admin.js into sections (1–2 days, planning only)

**Goal:** Turn the 12,710-line file into ~10–15 sub-files. Migration unit becomes a section, not the file.

**Approach:**
- Identify top-level seams: each admin tab/panel becomes its own file.
- Likely sections (to be confirmed by reading the file): Users, Permissions, Inventory Import, Lightspeed Migration, Sales Reports, Settings panels, Statuses, Discounts, Tax, Store Info, etc.
- Move each section into `src/screens/screen_components/Items_Screen/dashboard_screen/admin_sections/<SectionName>.js`.
- Dashboard_Admin becomes a thin router/container that mounts the active section.
- **This phase does NOT migrate to DOM yet** — it's pure code organization. Sections stay on RN-web until Phase 5.

**Why split first:** Each section becomes <1k lines, single responsibility, migrate-in-an-afternoon. Diffs are reviewable. Rollback per-section is cheap.

**Exit criteria:** Dashboard_Admin runs identically, but split across many files. One PR per logical section split.

---

## Phase 5 — Migrate Dashboard_Admin sections, one at a time (2–3 weeks)

**Goal:** Convert each carved section to DOM + CSS Modules.

- One PR per section. No bundling.
- Per-section workflow:
  1. Swap RN imports for `dom_components/` primitives.
  2. Lift inline styles into `<SectionName>.module.css`.
  3. Translate RN-only style props.
  4. Replace any `FlatList` with `VirtualList`.
  5. Browser-verify the section's golden path + edge cases.
  6. Deploy / merge.
- Sections can be migrated in parallel by multiple devs once Phase 4 ships.

**Exit criteria:** No `react-native` or `react-native-web` imports in any `admin_sections/*.js`. No `@rneui/base` usage. All sections visually match baseline.

---

## Phase 6 — Retire RN-web wrappers (~3–5 days)

**Goal:** Remove the dual-component-system trap (`CheckBox` vs `CheckBox_`, `Button_` vs `Button`, etc.).

- Mark RN-web wrappers (`Button_`, `CheckBox_`, `TextInput_`, `Image_`, `TouchableOpacity_`, `Pressable_`) as deprecated in `components.js`.
- Codemod (or scripted find-and-replace) remaining call sites across the app to use `dom_components/` equivalents.
- This is the largest cross-cutting change of the project — but mechanical. Codemod + spot-check.

**Exit criteria:** Zero call sites for `Button_`, `CheckBox_`, etc. Wrappers deleted from `components.js`.

---

## Phase 7 — Remove `react-native-web` + `@rneui/base` (1–2 days)

**Goal:** Delete the dependencies, confirm bundle shrink.

- `yarn remove react-native-web @rneui/base react-native` (and any sibling packages).
- Run full app, click through every screen, fix any stragglers.
- Measure bundle size delta — should be a meaningful drop.

**Exit criteria:** Dependencies gone from `package.json`. App boots and runs. Bundle smaller. CI green.

---

## Risks & mitigations

> [!WARNING]
> **Sizing rule violations during conversion.** RN defaults to `flexDirection: 'column'`; CSS defaults to `row`. Every `View` → `Box` conversion must preserve column behavior. **Mitigation:** `Box` defaults to `flex-direction: column` so consumers get RN-compatible behavior without thinking about it.

> [!WARNING]
> **`flex-shrink: 0` on percentage children.** Per CLAUDE.md, this is the single most important sizing-flex property and is non-negotiable. **Mitigation:** `Box` auto-applies `flex-shrink: 0` when a percentage width/height is passed.

> [!IMPORTANT]
> **Migration + refactor in the same PR is forbidden.** Translation only. Any cleanup, renames, logic changes, or "while I'm here" improvements go in a separate PR after the migration PR lands. Keeps diffs reviewable and rollback cheap.

> [!CAUTION]
> **`PanResponder` touch semantics may differ from pointer events.** Multi-touch and gesture priority don't translate 1:1. **Mitigation:** Test StandButtonsCanvas drag on real touchscreen hardware in Phase 2 before declaring the pilot done.

> [!CAUTION]
> **`FlatList` virtualization is a perf safety net.** Naively replacing with a plain `.map()` on long lists will regress. **Mitigation:** `VirtualList` ships in Phase 1; never migrate a `FlatList` site without using it.

> [!NOTE]
> **Inline-style holdouts during Dashboard_Admin migration.** Per the project rule, inline styling is allowed for non-migration work. During migration, all styles in scope move to CSS Modules — but call sites that pass dynamic style props (e.g. computed widths) may need a `style={{}}` escape hatch. That's fine; the rule allows it.

---

## Estimated timeline

| Phase | Effort |
|---|---|
| 0 — Audit & freeze | 1 day |
| 1 — Primitives | 3–5 days |
| 2 — StandButtonsCanvas pilot | 3–5 days |
| 3 — Dashboard_User + ExtensionSettings | 1–2 days |
| 4 — Carve Dashboard_Admin | 1–2 days |
| 5 — Migrate Dashboard_Admin sections | 2–3 weeks |
| 6 — Retire RN-web wrappers | 3–5 days |
| 7 — Remove dependencies | 1–2 days |
| **Total** | **~5–7 weeks** |

Parallelizable from Phase 5 onward with multiple devs.

---

## Open questions for review

1. `react-window` vs `react-virtuoso` for `VirtualList`?
2. Pure CSS animations vs Framer Motion for `FadeIn`/`SlideIn`?
3. Scope: stop at the dashboard, or keep momentum into other screens (Info, Items, Options, Notes tabs) under the same plan?
4. Do you want the Phase 1 primitives drafted as a separate proposal (API shapes, prop signatures) before we start building?
5. Should Phase 4 (carving Dashboard_Admin) happen even if we don't proceed with migration — i.e. is splitting a 12k-line file valuable on its own?
