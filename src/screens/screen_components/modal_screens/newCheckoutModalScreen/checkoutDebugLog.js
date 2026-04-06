// ─── Checkout & Refund Debug Logger ──────────────────────────────────
// Toggle on/off via browser console: window.__checkoutDebug(true/false)
// Filter in DevTools: [CHECKOUT_DEBUG]

const LS_KEY = "warpspeed_checkout_debug";
let DEBUG_ENABLED = true;
try { DEBUG_ENABLED = localStorage.getItem(LS_KEY) === "true" || localStorage.getItem(LS_KEY) === null; } catch (e) {}

export function enableCheckoutDebug(on = true) {
  DEBUG_ENABLED = on;
  try { localStorage.setItem(LS_KEY, on ? "true" : "false"); } catch (e) {}
  console.log(`[CHECKOUT_DEBUG] logging ${on ? "ENABLED" : "DISABLED"}`);
}

export function isCheckoutDebugEnabled() { return DEBUG_ENABLED; }

export const DCAT = {
  BUTTON:        "BUTTON",
  INPUT:         "INPUT",
  CHECKBOX:      "CHECKBOX",
  DROPDOWN:      "DROPDOWN",
  FIREBASE_REQ:  "FIREBASE_REQ",
  FIREBASE_RES:  "FIREBASE_RES",
  FIREBASE_ERR:  "FIREBASE_ERR",
  STRIPE_REQ:    "STRIPE_REQ",
  STRIPE_RES:    "STRIPE_RES",
  STRIPE_ERR:    "STRIPE_ERR",
  LISTENER:      "LISTENER",
  LISTENER_DATA: "LISTENER_DATA",
  STATE:         "STATE",
  ACTION:        "ACTION",
  INIT:          "INIT",
  RECEIPT:       "RECEIPT",
};

export function dlog(category, action, file, data = null) {
  if (!DEBUG_ENABLED) return;
  const entry = {
    ts: new Date().toISOString(),
    cat: category,
    action,
    file,
  };
  if (data !== null && data !== undefined) entry.data = data;
  console.log("[CHECKOUT_DEBUG]", JSON.stringify(entry));
}

// Expose to browser console
if (typeof window !== "undefined") {
  window.__checkoutDebug = enableCheckoutDebug;
  window.__checkoutDebugStatus = isCheckoutDebugEnabled;
}
