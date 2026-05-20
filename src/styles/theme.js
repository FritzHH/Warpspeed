/* eslint-disable */
/**
 * Theme module — per-user light/dark mode.
 *
 * Activates the [data-theme="dark"] block in src/styles/tokens.css by
 * setting document.documentElement.dataset.theme. Persisted per user
 * in localStorage so it survives reloads.
 *
 * Source of truth for tokens: docs/design-tokens.md
 *
 * Boot order (in src/index.js):
 *   1. import "./styles/tokens.css"
 *   2. import "./styles/themes/tenants.css"
 *   3. initTheme()   <- BEFORE React renders, prevents light-mode flash
 *   4. render <App />
 */

const STORAGE_KEY = "warpspeed.theme";
const VALID_THEMES = new Set(["light", "dark"]);

/**
 * Apply a theme to <html>. Strips the attribute for "light" so the
 * :root block in tokens.css owns the default rather than relying on
 * a redundant [data-theme="light"] block.
 *
 * @param {"light" | "dark"} theme
 */
function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/**
 * Read the persisted theme. Returns "light" if nothing valid is stored.
 *
 * @returns {"light" | "dark"}
 */
export function getTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_THEMES.has(raw)) return raw;
  } catch (_) {
    // localStorage can throw in sandboxed contexts - fall through to default.
  }
  return "light";
}

/**
 * Persist and apply a theme. Notifies subscribers so any open UI updates.
 *
 * @param {"light" | "dark"} theme
 */
export function setTheme(theme) {
  if (!VALID_THEMES.has(theme)) theme = "light";
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {
    // Storage write failed - still apply in-memory so the UI reflects.
  }
  applyTheme(theme);
  listeners.forEach((cb) => {
    try { cb(theme); } catch (_) { /* one bad listener shouldn't break others */ }
  });
}

/** Flip light <-> dark and persist. */
export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

/**
 * Boot-time init. Call once, synchronously, BEFORE React renders.
 * Prevents the brief flash of light mode that happens if you apply
 * the dark theme inside a useEffect.
 */
export function initTheme() {
  applyTheme(getTheme());
}

// --- subscription support ---------------------------------------------------
// Components that want to react to theme changes can subscribe instead of
// reading once at mount. Returns an unsubscribe function.
const listeners = new Set();

/**
 * @param {(theme: "light" | "dark") => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeTheme(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
