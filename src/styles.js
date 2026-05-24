import { dim, getRgbFromNamedColor, lightenRGBByPercent } from "./utils";
// const { getDefaultConfig } = require("metro"); // Or require('metro-config') for bare React Native

// Z-index registry (band-based). MUST match the --z-* tokens in
// src/styles/tokens.css. Bands are 100-wide with STEP=10, fitting
// up to 10 stacked instances per band.
//
// Usage:
//   - Static (single-instance) stacking: read Z.modal, Z.dropdown,
//     etc. CSS modules should prefer var(--z-*) directly.
//   - Runtime (instance-stacked) stacking - nested Dialogs, sub-
//     overlays inside a modal, anything where the value depends on
//     how many siblings are mounted: call claimZ('modal') for the
//     next free slot in the band, pair with releaseZ on unmount.
//
// See docs/design-tokens.md "Z-Index Registry" for the full design.
const _zBands = {
  modal:    { base: 9000, step: 10, max: 9099 },
  dropdown: { base: 9500, step: 10, max: 9599 },
  tooltip:  { base: 9700, step: 10, max: 9799 },
  toast:    { base: 9800, step: 10, max: 9899 },
  alert:    { base: 9900, step: 10, max: 9999 },
  debug:    { base: 100000, step: 10, max: 100099 },
};

export const Z = {
  modal:        _zBands.modal.base,         // 9000
  modalContent: _zBands.modal.base + 1,     // 9001
  dropdown:     _zBands.dropdown.base,      // 9500
  tooltip:      _zBands.tooltip.base,       // 9700
  toast:        _zBands.toast.base,         // 9800
  alert:        _zBands.alert.base,         // 9900
  debug:        _zBands.debug.base,         // 100000
  bands:        _zBands,
};

const _zClaimed = new Map();

export function claimZ(bandName) {
  const band = _zBands[bandName];
  if (!band) throw new Error(`claimZ: unknown band "${bandName}"`);
  if (!_zClaimed.has(bandName)) _zClaimed.set(bandName, new Set());
  const used = _zClaimed.get(bandName);
  let z = band.base;
  while (used.has(z) && z <= band.max) z += band.step;
  if (z > band.max) {
    throw new Error(
      `claimZ: band "${bandName}" exhausted (base ${band.base}, max ${band.max}, step ${band.step}). Widen the band in tokens.css and styles.js.`,
    );
  }
  used.add(z);
  return z;
}

export function releaseZ(bandName, z) {
  const used = _zClaimed.get(bandName);
  if (used) used.delete(z);
}

export const Colors = {
  // mainBackground: "white",
  mainBackground: "rgb(61, 180, 231)",

  // secondBackground: "rgb(68,143,164)",
  secondBackground: "white",

  opacityBackgoundDark: "rgb(63, 118, 141)",
  // opacityBackgoundDark: "white",

  // opacityBackgroundLight: "rgb(74, 133, 159)",
  opacityBackgroundLight: "rgb(140, 206, 235)",

  listElementBackground: "rgb(236, 230, 234)",
  listElementPlaceholder: "rgb(127, 128, 138)",
  listElementText: "rgb(50, 65, 88)",
  // tabMenuButton: "rgb(96, 89, 212)",
  tabMenuButton: "rgb(111, 105, 216)",
  tabMenuButtonText: "white",
  buttonDarkBackground: "rgb(40, 38, 38)",
  buttonDarkFont: "rgb(237,238,196)",
  blueButtonBackground: "#3498db",
  blueButtonText: "white",
  darkText: "rgb(20, 20, 20)",
  lightText: "rgb(60, 60, 60)",
  lightTextOnMainBackground: "rgb(170, 210, 200)",
  darkTextOnMainBackground: "rgb(30, 30, 30)",
};

export const C = {
  green: "rgb(33, 148, 86)",
  purple: "rgb(115, 83, 173)",
  orange: "rgb(230, 126, 34)",
  blue: "rgb(53, 135, 210)",
  lightred: "rgb(227, 116, 112)",
  cursorRed: "#ff6b6b",
  red: lightenRGBByPercent(getRgbFromNamedColor("red"), 10),

  backgroundWhite: lightenRGBByPercent("rgb(240, 241, 251)", 45),
  backgroundGreen: "rgb(232, 243, 239)",
  backgroundListWhite: "rgb(251, 251, 254)",

  listItemWhite: "rgb(254, 254, 255)",
  listItemBorder: "rgb(242,242,242)",

  buttonLightGreen: "rgb(232, 239, 245)",
  buttonLightGreenOutline: "rgb(200, 228, 220)",

  darkBlue: "rgb(30, 80, 140)",
  text: lightenRGBByPercent("rgb(0,0,0)", 28),
  lightText: "rgb(148,148,148)",
  textWhite: "rgb(255, 255, 255)",

  // ============================================================
  // SEMANTIC TOKEN ALIASES (Phase 4 bridge)
  // ------------------------------------------------------------
  // These resolve to CSS custom properties defined in
  // src/styles/tokens.css. Source of truth: docs/design-tokens.md
  //
  // PREFER THESE NAMES IN NEW CODE.
  // The non-aliased properties above are kept for backward
  // compatibility and will be retired in Phase 9.
  // ============================================================

  // Surfaces
  surfaceBase:           "var(--surface-base)",
  surfaceAlt:            "var(--surface-alt)",
  surfaceRaised:         "var(--surface-raised)",
  surfaceAccentMuted:    "var(--surface-accent-muted)",
  surfaceSuccessMuted:   "var(--surface-success-muted)",
  surfaceWarningMuted:   "var(--surface-warning-muted)",
  surfaceOverlay:        "var(--surface-overlay)",
  surfaceOverlayLight:   "var(--surface-overlay-light)",
  surfaceOverlayHeavy:   "var(--surface-overlay-heavy)",

  // Borders
  borderSubtle:          "var(--border-subtle)",
  borderDefault:         "var(--border-default)",
  borderStrong:          "var(--border-strong)",
  borderFocus:           "var(--border-focus)",
  borderWarning:         "var(--border-warning)",

  // Text
  textStrong:            "var(--text-strong)",
  textDefault:           "var(--text-default)",
  textSecondary:         "var(--text-secondary)",
  textMuted:             "var(--text-muted)",
  textDisabled:          "var(--text-disabled)",
  textInverse:           "var(--text-inverse)",
  textOnAccent:          "var(--text-on-accent)",
  textWarning:           "var(--text-warning)",

  // Accent and status
  accent:                "var(--accent)",
  accentHover:           "var(--accent-hover)",
  success:               "var(--success)",
  info:                  "var(--info)",
  infoStrong:            "var(--info-strong)",
  warning:               "var(--warning)",
  danger:                "var(--danger)",
  dangerMuted:           "var(--danger-muted)",
  dangerStrong:          "var(--danger-strong)",

  // Shadows (color only)
  shadowColorSubtle:     "var(--shadow-color-subtle)",
  shadowColorDefault:    "var(--shadow-color-default)",
  shadowColorAccent:     "var(--shadow-color-accent)",
};

/**
 * Resolve a CSS custom property to its computed RGB value.
 * Use ONLY for non-CSS contexts: canvas drawing, jsPDF, chart libs,
 * programmatic color math. In CSS / inline-style contexts use the
 * C.* aliases directly - they're var(--...) and themable.
 *
 * @param {string} tokenName - token name WITHOUT leading "--"
 *                             e.g. "text-muted" not "--text-muted"
 * @returns {string} computed rgb()/rgba() string
 */
export function resolveToken(tokenName) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--${tokenName}`)
    .trim();
}

export const COLOR_GRADIENTS = {
  red: [lightenRGBByPercent(C.red, 41), lightenRGBByPercent(C.red, 20)],
  green: [lightenRGBByPercent(C.green, 28), lightenRGBByPercent(C.green, 10)],
  bluegreen: [
    lightenRGBByPercent(C.blue, 28),
    lightenRGBByPercent(C.green, 10),
  ],
  greenblue: [
    lightenRGBByPercent(C.green, 28),
    lightenRGBByPercent(C.blue, 10),
  ],
  purple: ["rgb(103, 124, 231)", "rgb(115, 83, 173)"],
  blue: [lightenRGBByPercent(C.blue, 15), lightenRGBByPercent(C.blue, 0)],
  lightBlue: [lightenRGBByPercent(C.blue, 60), lightenRGBByPercent(C.blue, 45)],
  grey: ["rgb(166,166,166)", "rgb(140,140,140)"],
  yellow: [lightenRGBByPercent(C.orange, 35), lightenRGBByPercent(C.orange, 15)],
};

const assetModules = import.meta.glob('./assets/webp/*.webp', { eager: true, import: 'default' });
const gifModules = import.meta.glob('./assets/gifs/*.{gif,png}', { eager: true, import: 'default' });
const asset = (name) => assetModules[`./assets/webp/${name.replace(/\.(png|jpg|jpeg)$/i, '.webp')}`];
const gif = (name) => gifModules[`./assets/gifs/${name}`];

export const ICONS = {
  workorder: asset("workorder.png"),
  receipt: asset("receipt.png"),
  bicycle: asset("bicycle.png"),
  wheelGIF: gif("wheelGIF.gif"),
  greenDollar: asset("bank.png"),
  creditCard: asset("credit-card.png"),
  dollarYellow: asset("dollar.png"),
  rightArrowBlue: asset("right-arrow.png"),
  expandGreen: asset("expandGreen.png"),
  greenLeftArrow: asset("greenLeftArrow.png"),
  greenRightArrow: asset("greenRightArrow.png"),
  forwardGreen: asset("forwardGreen.png"),
  blocked: asset("blocked.png"),
  unblock: asset("unblock.png"),
  blockNotif: asset("block-notif.png"),
  allowNotif: asset("allow-notif.png"),
  colorWheel: asset("colorWheel.png"),
  tools1: asset("tools1.png"),
  upArrowOrange: asset("up_arrow_orange.png"),
  downArrowOrange: asset("down_arrow_orange.png"),
  downArrow: asset("down-arrow.png"),
  clickHere: asset("clickHere.png"),
  importIcon: asset("in.png"),
  editPencil: asset("edit_pencil.png"),
  close1: asset("close1.png"),
  check1: asset("check1.png"),
  check: asset("check.png"),
  shoppingCart: asset("shopping_cart.png"),
  minus: asset("minus.png"),
  new: asset("new.png"),
  add: asset("plus.png"),
  cellPhone: asset("cell.png"),
  home: asset("home.png"),
  reset1: asset("reset.png"),
  gears1: asset("gears1.png"),
  notes: asset("notes.png"),
  ridingBike: asset("riding_bike.png"),
  menu1: asset("menu1.png"),
  menu2: asset("menu-button.png"),
  checkbox: asset("checkbox.png"),
  checkoxEmpty: asset("checkbox-empty.png"),
  search: asset("search.png"),
  info: asset("info.png"),
  settings: asset("settings.png"),
  internetOnlineGIF: gif("internetOnlineGIF.gif"),
  internetOfflineGIF: gif("internedDisconnectedGIF.gif"),
  cashRegister: asset("cashRegister.png"),
  openCashRegister: asset("openCashRegister.png"),
  camera: asset("camera.png"),
  uploadCamera: asset("uploadCamera.png"),
  viewPhoto: asset("viewPhoto.png"),
  wifi: gif("wifi.gif"),
  redx: asset("redx.png"),
  listGif: gif("list.gif"),
  clockGif: gif("clock.gif"),
  clock: asset("clock.png"),
  questionMark: asset("questionMark.png"),
  cancelGif: gif("cancel.gif"),
  paperPlane: asset("paperPlane.png"),
  eyeballs: asset("eyeballs.png"),
  upChevron: asset("up-chevron.png"),
  downChevron: asset("down-chevron.png"),
  caretLeft: asset("caret-left.png"),
  caretRight: asset("caret-right.png"),
  trash: asset("trash.png"),
  archive: asset("archive.png"),
  axe: asset("axe.png"),
  backRed: asset("backRed.png"),
  quickItemButton: asset("quickItemButton.png"),
  userControl: asset("userControl.png"),
  paymentProcessing: asset("paymentProcessing.png"),
  workorderStatuses: asset("workorderStatuses.png"),
  listsAndOptions: asset("listsAndOptions.png"),
  storeInfo: asset("storeInfo.png"),
  ordering: asset("ordering.png"),
  letterW: asset("w-letter.png"),
  airplane: asset("airplane.png"),
  popperCelebration: gif("popperCelebration.gif"),
  guyCelebrating: gif("guyCelebrating.gif"),
  display: asset("display.png"),
  thoughtBubble: asset("thoughtBubble.png"),
  print: asset("print.png"),
  variable: asset("variable.png"),
  person: asset("person.png"),
  map: asset("map.png"),
};

// rgb(64, 174, 113)
export const Fonts = {
  colors: {},
  weight: {
    textRegular: "400",
    textHeavy: "600",
    textSuperheavy: "800",
  },
  style: {},
};

export const ViewStyles = {
  fullScreen: {
    width: dim.windowWidth,
    height: dim.windowHeight * 1,
    backgroundColor: Colors.mainBackground,
    padding: 5,
  },
};

export const ButtonStyles = {
  darkSquare: {
    backgroundColor: Colors.buttonDarkBackground,
    fontColor: Colors.buttonDarkFont,
  },
};

export const SHADOW_RADIUS_PROTO = {
  shadowColor: C.green,
  shadowOffset: { width: 2, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 15,
};
