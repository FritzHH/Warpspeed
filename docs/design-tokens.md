# Warpspeed Design Tokens - Source of Truth

> Living document. Single source of truth for color tokens used across the Warpspeed/Cadence app. The CSS in `src/styles/tokens.css` MUST match this document. The bridge aliases on the `C` object in `src/styles.js` MUST match this document.

**Status:** Phase 2 vocabulary - draft for implementation
**Owner:** dev team (no dedicated designer yet)
**Last updated:** 2026-05-19

---

## Locked Decisions

These 8 decisions are locked. Any change requires a new ADR-style entry below.

| # | Decision | Rationale |
|---|---|---|
| 1 | **Brand color = per-tenant in Firestore** at `settings.branding.primaryColor`, injected via inline `<style>` tag at boot | Tenants self-serve from their dashboard; no code deploy per tenant |
| 2 | **Dark mode = per-user**, stored in `localStorage` (`warpspeed.theme`) | Personal preference, not brand mandate |
| 3 | **Designer ownership = dev team (solo)** for now | Pragmatic naming; no blocker on a designer hire |
| 4 | **v1 scope = colors only.** Z-index and radius added as separate registries; typography and spacing still out of scope. | Hold the line; one system at a time. Radius added 2026-05-28 (four role-based buckets, see "Radius Registry" below). |
| 5 | **`/tokens` swatch page = admin-only**, gated by `PRIVILEDGE_LEVELS.Admin` | Quick to ship; no new auth work |
| 6 | **Dead `C.*` refs cleaned up in Phase 4**: remove `C.purple=""`, `C.textMain`, `C.darkText` | Silent bugs; one-line fixes |
| 7 | **`C.backgroundWhite` + `C.backgroundListWhite` collapse to one `--surface-base`** | Functionally identical today |
| 8 | **`C.green` resolves to both `--accent` and `--success`** (same primitive) | Single brand color today; split when Cadence rebrands |

---

## Architecture

Two layers. The boundary between them is enforced by convention and (eventually) by lint:

- **Layer 1 - Primitives:** raw color scales. Never consumed by components. Only referenced by Layer 2.
- **Layer 2 - Semantic tokens:** what components see. Every CSS module and inline-style call site reads from Layer 2.

```
[Layer 1 primitives]                 [Layer 2 semantic]              [Components]
--gray-50..900                       --surface-base
--brand-50..900       --resolves-->  --text-muted         <--read--  color: var(--text-muted)
--red-50..900                        --border-default                background: var(--surface-alt)
--green-50..900                      --accent
...                                  --danger

         ^                                   ^
         |                                   |
  [data-tenant="acme"]                [data-theme="dark"]
  swaps brand-500                     swaps surfaces + text
```

Overrides (dark mode, tenant theming) operate on Layer 1. Layer 2 inherits automatically. Zero component changes for either.

---

## Layer 1 - Primitive Scales

### Gray scale (9 stops, neutral)

Derived from real usage. Each stop replaces a cluster of existing `gray()` calls. Values shown are `gray(u)` equivalents - `u=0` is white, `u=1` is black.

| Token | gray(u) equivalent | rgb() | Replaces existing usage |
|---|---|---|---|
| `--gray-50`  | `gray(0.05)` | `rgb(242,242,242)` | gray(0.05/0.06/0.07/0.08/0.075/0.09) - 67 calls |
| `--gray-100` | `gray(0.10)` | `rgb(230,230,230)` | gray(0.10/0.12) - 80 calls |
| `--gray-150` | `gray(0.15)` | `rgb(217,217,217)` | gray(0.15/0.18) - 55 calls |
| `--gray-200` | `gray(0.22)` | `rgb(199,199,199)` | gray(0.20/0.22/0.25) - 54 calls |
| `--gray-300` | `gray(0.33)` | `rgb(171,171,171)` | gray(0.30/0.33/0.35/0.38) - 100 calls |
| `--gray-400` | `gray(0.42)` | `rgb(148,148,148)` | gray(0.40/0.42/0.45) - 204 calls |
| `--gray-500` | `gray(0.52)` | `rgb(122,122,122)` | gray(0.50/0.52/0.55) - 302 calls |
| `--gray-600` | `gray(0.65)` | `rgb(89,89,89)` | gray(0.60/0.65/0.70) - 71 calls |
| `--gray-800` | `gray(0.88)` | `rgb(31,31,31)` | gray(0.85/0.88/0.90/0.92) - 42 calls |
| `--gray-900` | `gray(0.96)` | `rgb(10,10,10)` | gray(0.95/0.97) - 5 calls |

> Note: 10 stops, not 9 - `--gray-150` is kept because the 0.15 cluster is large (52 calls) and the gap between 100 and 200 is too wide otherwise.

### Brand scale (tenant-overridable)

```
--brand-50    rgb(232,243,239)   ← matches existing C.backgroundGreen (1 call)
--brand-100   rgb(217,238,228)
--brand-200   rgb(187,225,208)
--brand-300   rgb(149,205,179)
--brand-400   rgb(98,179,142)
--brand-500   rgb(33,148,86)     ← matches existing C.green (276 calls). Tenant override point.
--brand-600   rgb(28,128,73)
--brand-700   rgb(22,103,59)
--brand-800   rgb(17,80,46)
--brand-900   rgb(12,55,31)
```

Tenant override at boot:
```html
<html data-tenant="acme">
<style>[data-tenant="acme"] { --brand-500: <tenant.primaryColor>; }</style>
```

For full tenant rebrand (not just `--brand-500`), the tenant can override the entire scale - but the recommended default is to override only `--brand-500` and let the surrounding stops be programmatically derived later.

### Status hues

```
--red-100, --red-300, --red-500, --red-700
  red-500 = rgb(225, 70, 70)        ← matches lightenRGBByPercent("red", 10), the existing C.red

--red-light (alias)   rgb(227,116,112)   ← matches existing C.lightred (110 calls)

--orange-500   rgb(230,126,34)     ← matches existing C.orange (95 calls)
--orange-300   rgb(243,186,123)
--orange-700   rgb(184,99,24)

--blue-500     rgb(53,135,210)     ← matches existing C.blue (243 calls)
--blue-300     rgb(126,180,229)
--blue-700     rgb(30,80,140)      ← matches existing C.darkBlue (1 call)
```

### Notes on Layer 1

- The scale uses **non-uniform stops** to match real usage clusters. A perfectly uniform 0/100/200/.../900 scale would force renaming during migration. The chosen stops mean ~95% of existing `gray()` calls map to a primitive without rounding.
- **No `--gray-700`** - the audit found no cluster between 0.70 and 0.85. Add later if needed.
- **No alpha variants in Layer 1.** Translucent grays (`gray(0.5, 0.6)` and similar) stay as inline rgba for now. If a pattern emerges, add `--scrim-*` semantic tokens.

---

## Layer 2 - Semantic Tokens (the 22)

This is the only layer components ever touch.

### Surfaces

| Token | Light value | Dark value | Use for |
|---|---|---|---|
| `--surface-base`         | `#ffffff`              | `var(--gray-900)`     | Page background, main canvas |
| `--surface-alt`          | `var(--gray-50)`       | `var(--gray-800)`     | Card backgrounds, list rows, panels |
| `--surface-raised`       | `#ffffff`              | `var(--gray-800)`     | Modals, popovers, dropdowns (lifted from base) |
| `--surface-accent-muted` | `rgb(232,239,245)`     | `var(--brand-800)`    | Accent-tinted backgrounds (e.g. buttonLightGreen) |
| `--surface-success-muted`| `var(--brand-50)`      | `var(--brand-800)`    | Success status banners |
| `--surface-info-muted`   | `rgb(230,240,251)`     | `rgb(20,35,55)`       | Info status backgrounds (alert icon bubbles, banners) |
| `--surface-warning-muted`| `rgb(255,243,220)`     | `rgb(60,45,15)`       | Warning/caution banners (amber wash) |
| `--surface-overlay-light`| `rgba(0,0,0,0.1)`      | `rgba(0,0,0,0.3)`     | Faint dim (background blur, subtle wash) - 47 inline uses |
| `--surface-overlay-medium`| `rgba(0,0,0,0.3)`     | `rgba(0,0,0,0.5)`     | Mid-weight tint (in-modal toasts, soft dimmers) |
| `--surface-overlay`      | `rgba(0,0,0,0.5)`      | `rgba(0,0,0,0.7)`     | Standard modal scrim / backdrop (workhorse - 76 inline uses) |
| `--surface-overlay-heavy`| `rgba(0,0,0,0.75)`     | `rgba(0,0,0,0.85)`    | Heavy scrim - image/video lightbox - 16 inline uses |

### Borders

| Token | Light value | Dark value | Use for |
|---|---|---|---|
| `--border-subtle`  | `var(--gray-150)`              | `var(--gray-700)` (TBD) | Hairline dividers, subtle separators |
| `--border-default` | `rgb(200,228,220)`             | `var(--brand-700)`      | Input borders, card outlines, primary outline (workhorse - 326 calls) |
| `--border-strong`  | `var(--gray-400)`              | `var(--gray-400)`       | Stronger card outlines, table separators |
| `--border-focus`   | `var(--brand-500)`             | `var(--brand-400)`      | Keyboard focus ring |
| `--border-warning` | `rgb(230,190,80)`              | `var(--orange-700)`     | Warning/caution banner borders |

### Text

| Token | Light value | Dark value | Use for |
|---|---|---|---|
| `--text-strong`     | `var(--gray-900)`            | `var(--gray-50)`     | Headings, emphasis |
| `--text-default`    | `var(--gray-800)` (`C.text`) | `var(--gray-100)`    | Body text (677 calls combined - dominant) |
| `--text-secondary`  | `var(--gray-600)`            | `var(--gray-300)`    | Captions, secondary descriptions |
| `--text-muted`      | `var(--gray-500)`            | `var(--gray-400)`    | Helper text, hints, less-important UI labels |
| `--text-disabled`   | `var(--gray-300)`            | `var(--gray-500)`    | Disabled controls and text |
| `--text-inverse`    | `#ffffff`                    | `var(--gray-900)`    | Text on dark surfaces |
| `--text-on-accent`  | `#ffffff`                    | `#ffffff`            | Text on accent/brand surfaces (e.g. green buttons) |
| `--text-warning`    | `rgb(140,100,20)`            | `var(--orange-300)`  | Body text on warning surfaces |

### Accent & Status

| Token | Light value | Dark value | Use for |
|---|---|---|---|
| `--accent`         | `var(--brand-500)`   | `var(--brand-400)` | Primary action color, brand expression |
| `--accent-hover`   | `var(--brand-600)`   | `var(--brand-300)` | Hover state on accent surfaces |
| `--success`        | `var(--brand-500)`   | `var(--brand-400)` | Success state (alias of --accent today; will split when Cadence rebrands) |
| `--info`           | `var(--blue-500)`    | `var(--blue-300)`  | Informational state |
| `--info-strong`    | `var(--blue-700)`    | `var(--blue-300)`  | Stronger info accents |
| `--warning`        | `var(--orange-500)`  | `var(--orange-300)`| Warning state |
| `--danger`         | `var(--red-500)`     | `var(--red-300)`   | Destructive actions, errors |
| `--danger-muted`   | `var(--red-light)`   | `var(--red-300)`   | Softer danger (e.g. lightred) |
| `--danger-strong`  | `#ff6b6b`            | `#ff6b6b`          | Form cursor red, strong error emphasis |

### Shadow color (colors-only carve-out)

Shadows are not in v1 scope (decision #4), but the *color* of the shadow is a color decision. We tokenize the color, not the offset/blur recipe. Recipes stay inline.

| Token | Light value | Dark value | Use for |
|---|---|---|---|
| `--shadow-color-subtle`  | `rgba(0,0,0,0.08)` | `rgba(0,0,0,0.4)` | Card hairline shadows (cluster of 47 inline uses) |
| `--shadow-color-default` | `rgba(0,0,0,0.15)` | `rgba(0,0,0,0.5)` | Modal/popover shadows |
| `--shadow-color-accent`  | `rgba(76,175,80,0.25)` | `rgba(76,175,80,0.4)` | Existing SHADOW_PROTO green-tinted shadow |

Example component usage:
```css
.card { box-shadow: 0 2px 8px var(--shadow-color-subtle); }
.modal { box-shadow: 0 8px 30px var(--shadow-color-default); }
```

**Total: 25 semantic tokens** (22 from initial scope + 3 shadow colors + 2 extra scrim levels resolved from audit).

---

## Migration Map - Old to New

This table is the authoritative answer for "what token replaces `gray(0.45)`?" Used by Phase 4 (bridge) and Phase 7 (migration).

### `gray()` -> token

| Old | New (semantic) | New (primitive) |
|---|---|---|
| `gray(0.03)`, `gray(0.036)`, `gray(0.04)`, `gray(0.05)`, `gray(0.06)`, `gray(0.07)`, `gray(0.075)`, `gray(0.08)`, `gray(0.09)` | `--surface-alt` or `--border-subtle` (context-dependent) | `--gray-50` |
| `gray(0.1)`, `gray(0.12)` | `--border-subtle` | `--gray-100` |
| `gray(0.15)`, `gray(0.18)` | `--border-subtle` | `--gray-150` |
| `gray(0.2)`, `gray(0.22)`, `gray(0.23)`, `gray(0.25)` | `--text-disabled` or `--border-strong` | `--gray-200` |
| `gray(0.3)`, `gray(0.33)`, `gray(0.35)`, `gray(0.38)` | `--text-secondary` | `--gray-300` |
| `gray(0.4)`, `gray(0.42)`, `gray(0.45)` | `--text-muted` | `--gray-400` |
| `gray(0.5)`, `gray(0.52)`, `gray(0.55)` | `--text-muted` | `--gray-500` |
| `gray(0.6)`, `gray(0.65)`, `gray(0.7)`, `gray(0.78)` | `--text-secondary` (when dark on light) | `--gray-600` |
| `gray(0.8)`, `gray(0.85)`, `gray(0.88)`, `gray(0.9)`, `gray(0.92)` | `--text-strong` | `--gray-800` |
| `gray(0.95)`, `gray(0.97)` | `--text-strong` | `--gray-900` |

### `C.*` -> token

| Old | New | Notes |
|---|---|---|
| `C.text` (617) | `C.textDefault` -> `var(--text-default)` | Workhorse |
| `C.buttonLightGreenOutline` (326) | `C.borderDefault` -> `var(--border-default)` | Workhorse |
| `C.green` (276) | `C.accent` -> `var(--accent)` | Also `--success` |
| `C.blue` (243) | `C.info` -> `var(--info)` | |
| `C.listItemWhite` (153) | `C.surfaceRaised` -> `var(--surface-raised)` | |
| `C.textWhite` (111) | `C.textInverse` -> `var(--text-inverse)` | |
| `C.lightred` (110) | `C.dangerMuted` -> `var(--danger-muted)` | |
| `C.red` (106) | `C.danger` -> `var(--danger)` | |
| `C.orange` (95) | `C.warning` -> `var(--warning)` | |
| `C.backgroundWhite` (81) | `C.surfaceBase` -> `var(--surface-base)` | Merged with backgroundListWhite |
| `C.lightText` (53) | `C.textMuted` -> `var(--text-muted)` | |
| `C.buttonLightGreen` (51) | `C.surfaceAccentMuted` -> `var(--surface-accent-muted)` | |
| `C.backgroundListWhite` (34) | `C.surfaceBase` -> `var(--surface-base)` | **Merged - was duplicate of backgroundWhite** |
| `C.cursorRed` (12) | `C.dangerStrong` -> `var(--danger-strong)` | |
| `C.listItemBorder` (5) | `C.borderSubtle` -> `var(--border-subtle)` | |
| `C.darkBlue` (1) | `C.infoStrong` -> `var(--info-strong)` | |
| `C.backgroundGreen` (1) | `C.surfaceSuccessMuted` -> `var(--surface-success-muted)` | |
| `C.purple` (3 calls, value = `""`) | **DELETE** | Silent bug |
| `C.textMain` (1) | **DELETE** | Undefined typo |
| `C.darkText` (1) | **DELETE** | Undefined on C (was on Colors) |

### Backward-compat aliases (Phase 4 bridge)

The old `C.*` names KEEP WORKING via bridge - they alias to the new tokens. This lets us migrate file-by-file without breaking imports.

```js
// During Phase 4, src/styles.js exposes BOTH:
export const C = {
  // Old names (point to new tokens)
  text: "var(--text-default)",
  buttonLightGreenOutline: "var(--border-default)",
  green: "var(--accent)",
  // ...

  // New names (preferred for new code)
  textDefault: "var(--text-default)",
  borderDefault: "var(--border-default)",
  accent: "var(--accent)",
  // ...
};
```

---

## Naming Conventions

Hard rules for any new token:

1. **Tokens describe ROLE, not VALUE.** `--text-muted` good. `--text-gray-500` bad.
2. **Layer 1 primitives use scales:** `<hue>-<step>` e.g. `--gray-500`, `--brand-500`.
3. **Layer 2 semantic tokens use category-role:** `<category>-<role>[-modifier]` e.g. `--text-muted`, `--surface-accent-muted`.
4. **No abbreviations.** `--background-base`, not `--bg-base`. CSS variables get autocompleted; brevity is not the constraint.
5. **Layer 1 is never referenced from components or CSS modules.** Only from Layer 2 or theme overrides.
6. **One source of truth per token.** If a token's value lives in two places (CSS + JS object), one must be the canonical reference and the other a derived alias.

---

## Governance - Adding or Changing Tokens

This is a SaaS-grade system, not a free-for-all. Token changes need a low-friction but real process.

### Adding a new token

1. **Verify the need:** is there a real, recurring use case? One-off colors should use an existing token, even if approximate.
2. **Propose in PR description:** name + Layer 1 value(s) + intent + 2-3 example use cases.
3. **Update this document AND `src/styles/tokens.css` AND the bridge in `src/styles.js`** in the same PR.
4. **Update the `/tokens` swatch page** (added in Phase 8) so designers can see it.

### Changing an existing token's value

1. **Light values are protected.** Any change requires a screenshot diff of the swatch page.
2. **Dark values are easier to change** - they're not in production until Phase 6.
3. **Run the contrast CI check** (added in Phase 8) to verify WCAG compliance.
4. **Tenant brand overrides do NOT count as changes** - they're overrides at Layer 1 of the brand scale only.

### Removing a token

1. **Confirm zero usage:** `grep -r "var(--token-name)" src/`
2. **Confirm no bridge alias:** check `src/styles.js`
3. **Remove from all three places:** this doc, `tokens.css`, `styles.js`.

---

## Z-Index Registry

Stacking is centralized to avoid the "increment until it works" antipattern. The system uses **bands** rather than fixed single-value tiers - each layer gets a 100-value band with STEP=10, fitting up to 10 stacked instances before colliding with the next band up.

CSS modules consume flat tokens via `var(--z-*)`. Inline styles / Radix portal props consume the flat `Z.<name>` mirrors. Runtime stacking (nested Dialogs, sub-overlays inside a modal) uses the `claimZ(band)` / `releaseZ(band, z)` allocator from `src/styles.js`.

### Bands

| Band | Range | Flat token | Purpose |
|---|---|---|---|
| modal | 9000 - 9099 | `--z-modal` / `Z.modal` (9000), `--z-modal-content` / `Z.modalContent` (9001) | Modal scrim, content, nested modals, and sub-overlays inside a modal - all share this band via `claimZ('modal')`. |
| dropdown | 9500 - 9599 | `--z-dropdown` / `Z.dropdown` | Popovers / menus. Above all modals so they can open from inside one. |
| tooltip | 9700 - 9799 | `--z-tooltip` / `Z.tooltip` | Above dropdowns so they can label dropdown items. |
| toast | 9800 - 9899 | `--z-toast` / `Z.toast` | Non-blocking notifications. |
| alert | 9900 - 9999 | `--z-alert` / `Z.alert` | Always on top - blocking confirms, error dialogs. |
| debug | 100000 - 100099 | `--z-debug` / `Z.debug` | Dev-only overlays (emulator badge etc). |

### Static vs runtime stacking

- **Static (single-instance):** A modal scrim is always 9000 - use `var(--z-modal)` or `Z.modal`. A tooltip is always 9700 - use `var(--z-tooltip)` or `Z.tooltip`.
- **Runtime (instance-stacked):** Nested Dialogs, sub-overlays inside a modal, anything where the actual z-index depends on how many siblings are already mounted - use `claimZ('modal')` to get the next free slot in the band. Pair with `releaseZ('modal', z)` on unmount.

### Nested stacking

Each `claimZ('modal')` call returns the lowest unused slot in the modal band, stepping by 10. The first Dialog claims 9000, a nested Dialog claims 9010, a sub-overlay inside that claims 9020, and so on. With a 100-wide band and STEP=10, the ceiling is 10 stacked instances before the allocator throws. If that ceiling is ever hit, the right fix is to widen the band (push dropdown to 9700, tooltip to 9800, etc) rather than silently overflow.

### Killed tiers (history)

Earlier versions had `--z-modal-inner-overlay` (100) and `--z-modal-loading` (200) for sub-stacking inside a modal card. These required `isolation: isolate` on every modal card to create a local stacking context, which was inconsistently applied and easy to forget. The band system replaces both: sub-overlays just claim another slot from the modal band, so the same allocator handles nested modals and in-modal sub-stacking uniformly.

### Adding a new band

Rare. Pick a value with breathing room (e.g. 6000 for a hypothetical "above-modal-but-below-dropdown" band) and document it here, in `tokens.css` (flat token), and in `src/styles.js` (band metadata + flat derivation) in the same commit.

---

## Radius Registry

Border radii are tokenized into four role-based buckets. The values cluster well: an audit of ~976 `border-radius` / `borderRadius` call sites across 179 files showed real usage falling into four groups (small controls, list rows, large containers, fully rounded). Pinning the buckets at four prevents the "increment by 1px until it looks right" drift that produced the original spread.

CSS modules consume `var(--radius-*)`. Inline-style JSX consumes the `Radius.*` mirrors from `src/styles.js`.

### Buckets

| Token | Value | Use for |
|---|---|---|
| `--radius-container` / `Radius.container` | `4px` | Modal cards, large panels, dashboard sections, big content cards |
| `--radius-row`       / `Radius.row`       | `8px`  | List rows, workorder cards, table cells, smaller cards |
| `--radius-control`   / `Radius.control`   | `4px`  | Buttons, inputs, dropdowns, chips, tags |
| `--radius-pill`      / `Radius.pill`      | `9999px` | Fully rounded - badges, toggles, avatars, status dots |

### Bucketing rule of thumb

When in doubt, classify by **what the element is**, not by what radius it happens to have today:

- A button is a `control` even if it's currently set to 10px.
- A modal card is a `container` even if it's currently set to 8px.
- A list row is a `row` even if it's currently set to 6px.

The migration may shift a few elements visually (e.g. controls at 8px become 6px). That is the intent of standardization. If a single element strongly resists the new bucket value, the right answer is *almost never* "add a fifth bucket" - it's either to re-classify the element or accept the new value.

### Asymmetric corners

For top-only / bottom-only / left-only rounding, use individual corner properties referencing the same tokens:

```css
.cardTopOnly {
  border-top-left-radius: var(--radius-row);
  border-top-right-radius: var(--radius-row);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
```

Shorthand with mixed corners (`border-radius: 8px 8px 0 0`) is also valid:

```css
border-radius: var(--radius-row) var(--radius-row) 0 0;
```

### Adding a new bucket

Almost never. Before adding a fifth, verify:

1. There is a real, recurring use case (3+ distinct components want the same out-of-bucket value).
2. The use case can't be solved by re-classifying the components (e.g. a "card" that's neither row nor container is probably one or the other).
3. The new bucket name is role-based, not value-based (e.g. `tile`, not `radius-10`).

If all three hold, add to all three places (this doc, `tokens.css`, `styles.js`) in the same PR.

### Outside scope

- Non-rectangular shapes (clip-path, custom SVG outlines) are not radius - they're geometry. Keep as-is.
- jsPDF / canvas radius arguments (`pdf.roundedRect(x, y, w, h, r1, r2)`) take numeric pixel values, not CSS tokens. Use `resolveToken("radius-row")` to read the px value into JS, then strip the `px` suffix. Sites are rare; leave as raw px until a pattern emerges.

---

## Open Questions Resolved by Defaults

| Question | Resolution (default chosen) |
|---|---|
| Brand color source | Per-tenant Firestore `settings.branding.primaryColor` |
| Dark mode preference | Per-user localStorage |
| Designer involvement | Solo dev for now |
| Scope ceiling | Colors only |
| /tokens page access | Admin-only |
| Dead C.* refs | Clean up in Phase 4 |
| Background merge | Collapse to `--surface-base` |
| Green = accent or success | Both (same primitive) |

---

## What Phase 3 Will Build

`src/styles/tokens.css` - the CSS that implements every primitive and semantic token above. Imported once from `src/index.js`. Zero components consume it on day 1; the bridge in Phase 4 makes adoption seamless.

Approximate size: ~100 lines for Layer 1, ~25 lines for Layer 2, ~30 lines for dark mode block. Single file, no preprocessor needed.

---

## Changelog

- **2026-05-19** - Phase 2 vocabulary v1 (this doc). 22 semantic tokens, 10-stop gray scale, decisions locked.
- **2026-05-20** - Added Z-index registry: 8 stacking tokens (`--z-modal-inner-overlay`, `--z-modal-loading`, `--z-modal`, `--z-modal-content`, `--z-dropdown`, `--z-tooltip`, `--z-toast`, `--z-alert`). Mirrored on `Z` in `src/styles.js`. Tooltip/toast/alert raised above modals so they can sit on top of any open modal.
- **2026-05-28** - Added Radius Registry: 4 role-based tokens (`--radius-container` 12px, `--radius-row` 8px, `--radius-control` 6px, `--radius-pill` 9999px). Mirrored on `Radius` in `src/styles.js`. Full sweep across `src/screens` and `src/dom_components` replaces raw `border-radius` / `borderRadius` px values.
