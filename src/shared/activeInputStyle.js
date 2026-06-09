/* eslint-disable */
/**
 * Active-input layout — single source of truth for how text inputs look across
 * screens (BikeStandScreen modal fields, Info_ActiveWorkorder fields, etc.).
 *
 * Edit the constants at the top of this file to change the focused / filled /
 * empty appearance everywhere. Callers pass per-screen sizing (fontSize,
 * padding, borderRadius) as overrides via the spread.
 *
 * Parameters:
 *   isActive     — currently focused / being edited (light-red treatment)
 *   filled       — has a non-empty value (semibold + faded border)
 *   hasValue     — alias for `filled`
 *   swallowing   — legacy keystroke-lockout visual (kept for color1/color2 in
 *                  Info_ActiveWorkorder until they migrate to AutoJumpBlocker)
 *   backgroundColor — inactive/empty background (used by color fields)
 *   color           — text color
 *   ...overrides    — fontSize / paddingVertical / paddingHorizontal /
 *                     borderRadius / width / textAlign override the BASE
 */
import { C, Radius } from "../styles";

// =====================================================================
// EDIT HERE — focused (active) input appearance
// =====================================================================
const ACTIVE_BACKGROUND   = C.lightred;
const ACTIVE_BORDER_COLOR = C.lightred;
const ACTIVE_BORDER_WIDTH = 2;

// inactive appearance
const INACTIVE_BORDER_WIDTH        = 1;
const FILLED_BORDER_COLOR_INTERNAL = "rgba(200, 228, 220, 0.25)";
const EMPTY_BORDER_COLOR_INTERNAL  = C.buttonLightGreenOutline;

// legacy keystroke-lockout (deprecated — being replaced by AutoJumpBlocker)
const SWALLOW_BG_INTERNAL = C.dangerMuted;
// =====================================================================

// Re-exported for callers that still reference these names directly.
export const FILLED_BORDER_COLOR = FILLED_BORDER_COLOR_INTERNAL;
export const SWALLOW_DURATION_MS = 750;

const BASE = {
  width: "100%",
  paddingVertical: 2,
  paddingHorizontal: 4,
  fontSize: 15,
  outlineStyle: "none",
  borderRadius: Radius.control,
};

export function activeInputStyle({
  isActive = false,
  filled = false,
  hasValue,
  swallowing = false,
  backgroundColor,
  color = C.text,
  ...overrides
} = {}) {
  const _filled = filled || hasValue;
  return {
    ...BASE,
    color,
    borderWidth: isActive ? ACTIVE_BORDER_WIDTH : INACTIVE_BORDER_WIDTH,
    borderColor: isActive
      ? ACTIVE_BORDER_COLOR
      : _filled
        ? FILLED_BORDER_COLOR_INTERNAL
        : EMPTY_BORDER_COLOR_INTERNAL,
    fontWeight: _filled ? "500" : null,
    backgroundColor: swallowing
      ? SWALLOW_BG_INTERNAL
      : isActive
        ? ACTIVE_BACKGROUND
        : backgroundColor,
    ...overrides,
  };
}
