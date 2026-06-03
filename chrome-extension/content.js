// Cadence Chrome Extension — content script.
//
// Injects an "Add to Cadence" button beside each vendor's add-to-cart button
// on every listing/detail page we know about, plus a slide-in side panel that
// shows the active order, hosts sign-in / sign-out, and lets the user adjust
// line qty + reconcile costs. The panel, button styling, and ordering flow are
// identical across vendors — per-vendor differences live ONLY in the
// VENDOR_ADAPTERS table below.
//
// Vendor pages render results via AJAX/MutationObserver — the script MUST
// react to DOM mutations rather than assuming everything's present at
// document_idle.
//
// Supported vendors:
//   - JBI (www.jbi.bike) — search_usd.php + product_details.php
//   - QBP (www.qbp.com)  — listing rows (.product-row) + product detail page
//
// To add a new vendor: register an adapter in VENDOR_ADAPTERS keyed by
// location.host. Nothing else in this file changes.

const INJECTED_ATTR = "data-cadence-injected";
const PANEL_HOST_ID = "cadence-extension-panel-host";
// Persisted boolean in chrome.storage.local. When true, every fresh page load
// opens the panel in its 36px minimized state instead of full-width. Cleared
// (set to false) when the user clicks the maximize bar.
const PANEL_MINIMIZED_KEY = "panelMinimized";

// In-memory map of vendorItemID → total qty across all lines in the active
// order. Sourced from the side panel's last fetch + patched optimistically on
// every add. Drives the on-page button's "Added [N]" badge so we don't have
// to re-inject buttons or re-fetch the order on every interaction.
let orderQtyByPn = {};

// Button color states for the injected "Add to Cadence" / "Added" button.
// Blue while the part isn't in the order; green with a qty badge once it is.
const ADD_BTN_BLUE_BG = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
const ADD_BTN_GREEN_BG = "linear-gradient(180deg, #22a85d 0%, #1f9d55 100%)";

// ────────────────────────────────────────────────────────────────────
// Vendor adapters — isolate per-vendor selectors + scrape logic.
//
// Each adapter implements:
//   vendorCatalogID      string  — passed to backend; RTDB key for catalog
//   vendorDisplayName    string  — shown in feedback strings
//   findAddButtons(root) NodeList — vendor's add buttons inside `root`
//   getPartNumber(btn)   string  — canonical vendor item ID
//   getRow(btn)          Element — row/section container (for cost regex)
//   extractCost(row)     string  — dollars string ("6.99") or ""
//   extractWarehouseInfo(pn)   { warehouseCode, warehouseQty | null }
//   getQtyEl(pn)         Element | null — qty input for this part
//   injectWrapper(btn,w) void    — places our wrapper near the vendor button
// ────────────────────────────────────────────────────────────────────

const VENDOR_ADAPTERS = {
  "www.jbi.bike": {
    vendorCatalogID: "jbi",
    vendorDisplayName: "JBI",
    findAddButtons(root) {
      return root.querySelectorAll("button.btn-add-to-order");
    },
    getPartNumber(btn) {
      // JBI stamps the bare part number on the button's id attribute.
      return btn.id || "";
    },
    getRow(btn) {
      return btn.closest(".row") || btn.closest("div");
    },
    extractCost(row) {
      if (!row) return "";
      const m = (row.textContent || "").match(/\$(\d+\.\d{2})\s*ea/);
      return m ? m[1] : "";
    },
    extractWarehouseInfo(pn) {
      // JBI's #ship_<pn> select lets the user pick a warehouse; the selected
      // option text is "STATE : QTY" (e.g., "GA : 25").
      const shipEl = document.getElementById(`ship_${pn}`);
      if (shipEl && shipEl.selectedOptions && shipEl.selectedOptions[0]) {
        const text = shipEl.selectedOptions[0].textContent || "";
        const match = text.match(/^\s*([A-Z]{2})\s*:\s*(\d+)/);
        if (match) {
          return { warehouseCode: match[1], warehouseQty: Number(match[2]) };
        }
      }
      return { warehouseCode: "", warehouseQty: null };
    },
    getQtyEl(pn) {
      return document.getElementById(`qty_${pn}`);
    },
    injectWrapper(addBtn, wrapper) {
      // JBI: insert our wrapper as a sibling AFTER JBI's .btn-group so it
      // slots into the same cell on the next line. Wrapper's flex-basis:100%
      // forces a flex-wrap in the parent row.
      const group = addBtn.parentElement;
      if (!group) return;
      if (group.parentElement) {
        group.parentElement.insertBefore(wrapper, group.nextSibling);
      } else {
        group.appendChild(wrapper);
      }
    },
  },
  "www.qbp.com": {
    vendorCatalogID: "qbp",
    vendorDisplayName: "QBP",
    findAddButtons(root) {
      // Both listing rows (.product-row) AND the product detail page
      // (#productPricing) share this selector.
      return root.querySelectorAll(".add-to-cart-container button.qty-button");
    },
    getPartNumber(btn) {
      const container = btn.closest(".add-to-cart-container");
      if (!container) return "";
      // Canonical source: hidden input named "code". Fall back to parsing the
      // qty input id (qty_<pn>) for robustness against markup churn.
      const hidden = container.querySelector('input[name="code"]');
      if (hidden && hidden.value) return hidden.value;
      const qtyEl = container.querySelector('input[id^="qty_"]');
      if (qtyEl && qtyEl.id) return qtyEl.id.replace(/^qty_/, "");
      return "";
    },
    getRow(btn) {
      // Listing page: .product-row owns the row. Detail page: #productPricing
      // owns the price + cart section. Fall back to nearest div for safety.
      return (
        btn.closest(".product-row") ||
        btn.closest("#productPricing") ||
        btn.closest(".row.product-details") ||
        btn.closest("div")
      );
    },
    extractCost(row) {
      if (!row) return "";
      // Prefer the explicit .price element (reliable on both layouts); fall
      // back to any "$X.XX" pattern in the row text.
      const priceEl = row.querySelector(".price");
      const source = priceEl ? priceEl.textContent : row.textContent;
      const m = (source || "").match(/\$(\d+(?:\.\d{2})?)/);
      if (!m) return "";
      return m[1].includes(".") ? m[1] : `${m[1]}.00`;
    },
    extractWarehouseInfo(_pn) {
      // QBP lists per-warehouse stock as static info (PA / MN / NV columns);
      // there's no selectable picker, so we leave warehouse code/qty empty.
      // Backend treats both blank fields as "no warehouse hint".
      return { warehouseCode: "", warehouseQty: null };
    },
    getQtyEl(pn) {
      return document.getElementById(`qty_${pn}`);
    },
    injectWrapper(addBtn, wrapper) {
      // QBP: append inside the .add-to-cart-container so our button renders
      // directly below the cart button on both listing rows and the detail
      // page. The container is already a block element on detail; on listing
      // the parent .input-group is flex but flex-basis:100% on the wrapper
      // still forces a wrap below the cart row.
      const container = addBtn.closest(".add-to-cart-container");
      if (container) container.appendChild(wrapper);
    },
  },
};

const VENDOR = VENDOR_ADAPTERS[location.host] || null;

// ────────────────────────────────────────────────────────────────────
// Side panel (Shadow DOM, slide-in from right)
//
// Single UI surface. Hosts:
//   - signed-out:    inline sign-in form (component-swap with order view)
//   - signed-in:     active-order summary, line-item rows, qty adjusters,
//                    cost-reconcile badges, footer with logout + deep link
// ────────────────────────────────────────────────────────────────────

function ensureSidePanel() {
  const existing = document.getElementById(PANEL_HOST_ID);
  if (existing) return existing.shadowRoot;
  const host = document.createElement("div");
  host.id = PANEL_HOST_ID;
  host.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    z-index: 2147483002;
  `;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        position: fixed;
        right: 0;
        top: 0;
        height: 100vh;
        width: 440px;
        max-width: 90vw;
        background: #fff;
        color: #1f2937;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        transform: translateX(100%);
        transition: transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94),
                    width 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
        box-shadow: -4px 0 20px rgba(0,0,0,0.18);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
      }
      .panel.open { transform: translateX(0); }
      .panel-header {
        background: linear-gradient(90deg, #1f9d55 0%, #38b269 100%);
        color: #fff;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      .panel-title {
        font-weight: 700;
        font-size: 15px;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .panel-close,
      .panel-refresh,
      .panel-minimize {
        background: rgba(255,255,255,0.2);
        color: #fff;
        border: none;
        border-radius: 3px;
        width: 28px;
        height: 28px;
        font-size: 20px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      }
      .panel-close:hover,
      .panel-refresh:hover,
      .panel-minimize:hover { background: rgba(255,255,255,0.32); }
      .panel-refresh { font-size: 18px; }
      .panel-minimize { font-size: 22px; padding-bottom: 6px; }
      .panel-meta {
        padding: 10px 16px;
        background: #f4f6f8;
        border-bottom: 1px solid #e5e7eb;
        font-size: 12px;
        color: #6b7280;
        flex-shrink: 0;
      }
      .panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 0 16px;
      }
      .empty {
        padding: 48px 24px;
        text-align: center;
        color: #6b7280;
        line-height: 1.5;
      }
      .empty strong { color: #1f2937; }
      .item {
        border-bottom: 1px solid #e5e7eb;
        padding: 12px 0;
      }
      .item:last-child { border-bottom: none; }
      .item-name {
        font-weight: 600;
        margin-bottom: 4px;
        color: #1f2937;
      }
      .item-pn {
        font-size: 11px;
        color: #6b7280;
        margin-bottom: 6px;
        font-family: ui-monospace, SFMono-Regular, monospace;
      }
      .item-meta {
        font-size: 12px;
        color: #6b7280;
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .item-meta .right {
        margin-left: auto;
        color: #1f2937;
        font-weight: 600;
        font-size: 13px;
      }
      .panel-footer {
        border-top: 1px solid #e5e7eb;
        padding: 12px 16px;
        background: #fafbfc;
        flex-shrink: 0;
      }
      .total-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        font-weight: 700;
        font-size: 15px;
        color: #1f2937;
      }
      .footer-actions {
        display: flex;
        gap: 8px;
      }
      .footer-actions button, .footer-actions a {
        flex: 1;
        padding: 8px 12px;
        border: none;
        border-radius: 4px;
        font-weight: 600;
        cursor: pointer;
        font-size: 13px;
        font-family: inherit;
        text-align: center;
        text-decoration: none;
        display: inline-block;
        line-height: 1.4;
      }
      .btn-refresh {
        background: #e5e7eb;
        color: #1f2937;
      }
      .btn-refresh:hover { background: #d1d5db; }
      .btn-open {
        background: #1f9d55;
        color: #fff;
      }
      .btn-open:hover { background: #176b3a; }
      .btn-open[aria-disabled="true"] {
        background: #a7d3b8;
        pointer-events: none;
      }

      /* Cost-reconciliation diff row (under item-meta when page cost ≠ inv cost) */
      .diff-row {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed #fcd34d;
        display: flex;
        align-items: center;
        gap: 8px;
        position: relative;
        flex-wrap: wrap;
      }
      .diff-badge {
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #fcd34d;
        border-radius: 3px;
        padding: 3px 7px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }
      .apply-btn {
        background: #1f9d55;
        color: #fff;
        border: none;
        border-radius: 3px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .apply-btn:hover { background: #176b3a; }
      .apply-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .info-btn {
        background: transparent;
        color: #6b7280;
        border: 1px solid #d1d5db;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        padding: 0;
        font-size: 12px;
        font-weight: 700;
        font-style: italic;
        font-family: Georgia, "Times New Roman", serif;
        line-height: 1;
        cursor: pointer;
        margin-left: auto;
      }
      .info-btn:hover { background: #f3f4f6; color: #1f2937; }
      .info-tip {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        background: #1f2937;
        color: #fff;
        padding: 10px 12px;
        border-radius: 4px;
        font-size: 12px;
        line-height: 1.5;
        width: 280px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        z-index: 1;
        display: none;
      }
      .info-tip.open { display: block; }
      .info-tip::after {
        content: "";
        position: absolute;
        bottom: 100%;
        right: 10px;
        border: 6px solid transparent;
        border-bottom-color: #1f2937;
      }

      /* Minimized state — collapses panel to a 36px green bar with the
         maximize arrow at top and "CADENCE SYSTEMS" vertical brand text
         centered. Entire bar is clickable. The width transition is on .panel
         itself so min/max animates in lockstep with applyPanelPush's body
         padding. */
      .minimized-bar { display: none; }
      .panel.minimized { width: 36px; }
      .panel.minimized .panel-header,
      .panel.minimized .panel-meta,
      .panel.minimized .panel-body,
      .panel.minimized .panel-footer { display: none; }
      .panel.minimized .minimized-bar {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 20px;
        height: 100%;
        background: linear-gradient(180deg, #1f9d55 0%, #38b269 100%);
        cursor: pointer;
      }
      .panel-maximize {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        width: 28px;
        height: 28px;
        font-size: 18px;
        font-weight: 700;
        line-height: 1;
        flex-shrink: 0;
        /* Cosmetic indicator only — the parent .minimized-bar owns the click
           handler. pointer-events:none keeps clicks from getting absorbed
           here and ensures the chevron never feels like its own target. */
        pointer-events: none;
      }
      .minimized-brand {
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255,255,255,0.95);
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 4px;
        text-transform: uppercase;
        /* vertical-rl rotates the text 90° clockwise so it reads top-to-bottom
           with letters tilted right. flex centering inside the 36px bar keeps
           the rotated glyph block centered horizontally. */
        writing-mode: vertical-rl;
        user-select: none;
      }

      /* Per-line qty adjuster buttons — sit on the right edge of item-meta. */
      .qty-adjusters {
        display: inline-flex;
        flex-direction: column;
        gap: 1px;
        margin-left: 8px;
      }
      .qty-up,
      .qty-down {
        background: #e5e7eb;
        color: #1f2937;
        border: none;
        border-radius: 2px;
        width: 20px;
        height: 14px;
        padding: 0;
        font-size: 9px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: inherit;
      }
      .qty-up:hover,
      .qty-down:hover { background: #d1d5db; }
      .qty-up:disabled,
      .qty-down:disabled { opacity: 0.5; cursor: not-allowed; }

      /* Sign-in form (component-swap with the order body). Kept in the DOM
         and toggled via display so typed input survives a refreshSidePanel
         round-trip. Padding is on the form (not the body) so the order list
         can keep its own zero-padding row layout. */
      .login-form {
        display: none;
        padding: 24px 4px;
        flex-direction: column;
        gap: 12px;
      }
      .login-form.visible { display: flex; }
      .login-form .brand-line {
        font-weight: 700;
        font-size: 16px;
        color: #1f2937;
        margin-bottom: 4px;
      }
      .login-form .hint {
        color: #6b7280;
        font-size: 13px;
        margin-bottom: 8px;
      }
      .login-form label {
        font-size: 12px;
        font-weight: 600;
        color: #1f2937;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .login-form input {
        background: #fff;
        color: #1f2937;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        padding: 8px 10px;
        font-size: 14px;
        font-family: inherit;
        width: 100%;
        box-sizing: border-box;
      }
      .login-form input:focus {
        outline: 2px solid #1f9d55;
        outline-offset: -1px;
        border-color: #1f9d55;
      }
      .login-form .login-btn {
        background: #1f9d55;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 10px 16px;
        font-weight: 700;
        font-size: 14px;
        font-family: inherit;
        cursor: pointer;
        margin-top: 6px;
      }
      .login-form .login-btn:hover { background: #176b3a; }
      .login-form .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .login-form .err {
        color: #fff;
        background: #c53030;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 12px;
      }
      .login-form .err:empty { display: none; }

      /* Footer logout button — shares the .footer-actions flex row with the
         "Edit in Cadence" link. Hidden when signed out (no auth, no point). */
      .btn-logout {
        background: #fff;
        color: #c53030;
        border: 1px solid #c53030;
      }
      .btn-logout:hover { background: #fef2f2; }
      .btn-logout.hidden { display: none; }
    </style>
    <div class="panel" id="panel">
      <div class="minimized-bar" id="minimizedBar" role="button" aria-label="Open Cadence panel" title="Open">
        <span class="panel-maximize" aria-hidden="true">«</span>
        <div class="minimized-brand">Cadence Systems</div>
      </div>
      <div class="panel-header">
        <span class="panel-title" id="panelTitle">Cadence</span>
        <button type="button" class="panel-refresh" id="panelRefresh" aria-label="Refresh" title="Refresh">↻</button>
        <button type="button" class="panel-minimize" id="panelMinimize" aria-label="Minimize" title="Minimize">−</button>
        <button type="button" class="panel-close" id="panelClose" aria-label="Close">×</button>
      </div>
      <div class="panel-meta" id="panelMeta">Loading…</div>
      <div class="panel-body" id="panelBody">
        <form class="login-form" id="loginForm" autocomplete="off">
          <div class="brand-line">Cadence Systems</div>
          <div class="hint">Sign in to load your active vendor order.</div>
          <label for="loginEmail">Email</label>
          <input type="text" id="loginEmail" placeholder="you@example.com"
                 autocomplete="off" name="cadence_login_email"
                 data-lpignore="true" data-1p-ignore />
          <label for="loginPassword">Password</label>
          <input type="password" id="loginPassword" placeholder="Password"
                 autocomplete="new-password" name="cadence_login_pw"
                 data-lpignore="true" data-1p-ignore />
          <button type="submit" class="login-btn" id="signInBtn">Sign in</button>
          <span class="err" id="signInErr"></span>
        </form>
        <div id="orderList"></div>
      </div>
      <div class="panel-footer">
        <div class="total-row">
          <span>Total</span>
          <span id="panelTotal">$0.00</span>
        </div>
        <div class="footer-actions">
          <button type="button" class="btn-logout hidden" id="btnLogout">Sign out</button>
          <a class="btn-open" id="btnOpen" target="_blank" rel="noopener noreferrer" aria-disabled="true">Edit in Cadence ↗</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host);

  shadow.getElementById("panelClose").addEventListener("click", closeSidePanel);
  shadow.getElementById("panelRefresh").addEventListener("click", refreshSidePanel);
  shadow.getElementById("panelMinimize").addEventListener("click", () =>
    setSidePanelMinimized(true)
  );
  // Whole minimized bar (not just the arrow button) maximizes — the arrow is
  // pointer-events:none so its click falls through to this listener.
  shadow.getElementById("minimizedBar").addEventListener("click", () =>
    setSidePanelMinimized(false)
  );
  // Event delegation for per-item Apply / Info / qty adjuster clicks. Rows are
  // re-rendered on every refresh so binding once on the body container avoids
  // re-wiring.
  shadow.getElementById("orderList").addEventListener("click", handlePanelBodyClick);

  // Sign-in form: submit handler (covers Enter key + button click), plus
  // safeguard against the form actually navigating since we're inside Shadow
  // DOM and don't want a page reload.
  const loginForm = shadow.getElementById("loginForm");
  loginForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    handlePanelSignIn(shadow);
  });

  // Footer logout. Guard against MV3 "extension context invalidated" — happens
  // when the extension was reloaded while this tab kept running the old
  // content script. chrome.runtime is undefined in that state.
  shadow.getElementById("btnLogout").addEventListener("click", async () => {
    try {
      if (!chrome.runtime || !chrome.runtime.sendMessage) return;
      await chrome.runtime.sendMessage({ type: "signOut" });
      // storage.onChanged listener will fire refreshSidePanel, which swaps
      // back to the sign-in form.
    } catch (_err) {
      // No-op; user can refresh the tab if sign-out got stuck.
    }
  });

  return shadow;
}

function panelIsOpen() {
  const host = document.getElementById(PANEL_HOST_ID);
  if (!host || !host.shadowRoot) return false;
  return host.shadowRoot.getElementById("panel").classList.contains("open");
}

async function openSidePanel() {
  const shadow = ensureSidePanel();
  const panel = shadow.getElementById("panel");
  // Restore the user's last minimized choice BEFORE the open transition runs,
  // so the panel slides in at the size they last picked. Without this, every
  // page nav would reset to full-width and the user would have to re-minimize
  // on every page they visit.
  try {
    const stored = await chrome.storage.local.get(PANEL_MINIMIZED_KEY);
    if (stored && stored[PANEL_MINIMIZED_KEY]) panel.classList.add("minimized");
    else panel.classList.remove("minimized");
  } catch (_err) {
    // chrome.runtime can be unavailable if the extension was reloaded while
    // this tab kept running. Fall through to default (non-minimized) state.
  }
  // Force a reflow before applying the open class so the transition runs even
  // on the first open. Without this, browsers occasionally batch the initial
  // transform with the .open transform and skip the animation.
  panel.getBoundingClientRect();
  panel.classList.add("open");
  applyPanelPush(true);
  refreshSidePanel();
}

function closeSidePanel() {
  const host = document.getElementById(PANEL_HOST_ID);
  if (!host || !host.shadowRoot) return;
  const panel = host.shadowRoot.getElementById("panel");
  panel.classList.remove("open");
  // Do NOT strip the .minimized class here — the persisted PANEL_MINIMIZED_KEY
  // is the source of truth and the next openSidePanel will re-apply it. Close
  // is a "hide for now" gesture, not a state reset.
  applyPanelPush(false);
}

// Toggle the minimized state. When minimized, the panel collapses to a 36px
// green bar with only the maximize button visible; the body padding shifts in
// sync so the vendor's page reclaims the freed pixels. The choice persists in
// chrome.storage.local so every subsequent page load opens at the same size
// — the user owns the state, not the page lifecycle.
function setSidePanelMinimized(minimized) {
  const host = document.getElementById(PANEL_HOST_ID);
  if (!host || !host.shadowRoot) return;
  const panel = host.shadowRoot.getElementById("panel");
  if (!panel) return;
  if (minimized) panel.classList.add("minimized");
  else panel.classList.remove("minimized");
  // Persist so the next navigation honors this choice. Fire-and-forget — if
  // storage write fails we still updated the UI for this tab.
  try {
    chrome.storage.local.set({ [PANEL_MINIMIZED_KEY]: !!minimized });
  } catch (_err) {
    // Extension context invalidated; nothing to do.
  }
  // Re-push the body so the page content adjusts to the new panel width.
  // applyPanelPush picks the target width by reading the class we just set.
  applyPanelPush(true);
}

// ────────────────────────────────────────────────────────────────────
// In-place panel mutations
//
// The naive pattern — call refreshSidePanel() after every action — re-renders
// the entire list innerHTML, which produces a visible flicker. These helpers
// surgically patch individual rows (qty change, diff-row removal) and the
// footer total so common actions feel instant. refreshSidePanel() is still
// the source of truth for first-time loads, new-row inserts, and recovery
// from race conditions.
// ────────────────────────────────────────────────────────────────────

function getPanelShadow() {
  const host = document.getElementById(PANEL_HOST_ID);
  return host ? host.shadowRoot : null;
}

// CSS.escape polyfill for older Chromiums + safety on arbitrary IDs.
function cssEscape(s) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function findPanelRow(itemID) {
  const shadow = getPanelShadow();
  if (!shadow) return null;
  return shadow.querySelector(`.item[data-item-id="${cssEscape(itemID)}"]`);
}

// Recompute the footer "Total" from the live row dataset values. Called after
// any qty patch so the user sees the total move in lockstep with the row.
function recomputePanelTotal() {
  const shadow = getPanelShadow();
  if (!shadow) return;
  let total = 0;
  shadow.querySelectorAll(".item").forEach((r) => {
    const qty = Number(r.dataset.qty || 0);
    const cost = Number(r.dataset.costCents || 0) / 100;
    total += qty * cost;
  });
  const totalEl = shadow.getElementById("panelTotal");
  if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
}

// In-place qty update for one row. Patches the visible "qty N" label, the
// right-side line total (only when that column is showing a total — MSRP/ea
// columns stay fixed), the qty-adjuster data-qty attrs + disabled clamp, the
// footer total, and the on-page button badge cache. No list re-render.
// Returns true if the row was found, false otherwise (caller may fall back).
function setPanelRowQty(itemID, newQty) {
  const row = findPanelRow(itemID);
  if (!row) return false;
  row.dataset.qty = String(newQty);
  const meta = row.querySelector(".item-meta");
  if (meta) {
    const qtySpan = meta.querySelector("span:first-child");
    if (qtySpan) qtySpan.textContent = `qty ${newQty}`;
    const right = meta.querySelector(".right");
    if (right && right.dataset.rightMode === "total") {
      const cost = Number(row.dataset.costCents || 0) / 100;
      right.textContent = `$${(newQty * cost).toFixed(2)}`;
    }
  }
  const upBtn = row.querySelector(".qty-up");
  const downBtn = row.querySelector(".qty-down");
  if (upBtn) {
    upBtn.setAttribute("data-qty", String(newQty));
    upBtn.disabled = false;
  }
  if (downBtn) {
    downBtn.setAttribute("data-qty", String(newQty));
    downBtn.disabled = newQty <= 1;
  }
  recomputePanelTotal();
  syncOrderQtyCacheForPn(row.dataset.vendorItemId);
  return true;
}

// Re-derive the on-page "Added [N]" badge for a single part number from the
// current panel rows. Multiple rows can share a pn (legacy duplicates from
// before the server-side merge landed), so we sum rather than copy.
function syncOrderQtyCacheForPn(pn) {
  if (!pn) return;
  const shadow = getPanelShadow();
  if (!shadow) return;
  let total = 0;
  shadow
    .querySelectorAll(`.item[data-vendor-item-id="${cssEscape(pn)}"]`)
    .forEach((r) => {
      total += Number(r.dataset.qty || 0);
    });
  orderQtyByPn[pn] = total;
  refreshAllInjectedButtons();
}

// Rebuild the entire cache from a fresh items array. Called from
// refreshSidePanel right after the order fetch so the on-page buttons reflect
// reality at every full reconcile.
function setOrderQtyCache(items) {
  const next = {};
  for (const it of items || []) {
    if (it && it.vendorItemID) {
      next[it.vendorItemID] =
        (next[it.vendorItemID] || 0) + Number(it.qty || 0);
    }
  }
  orderQtyByPn = next;
  refreshAllInjectedButtons();
}

// Visual state of one injected "Add to Cadence" button. qty 0 → blue default;
// qty > 0 → green "Added" with a chip-style qty badge. Inline styles so we
// don't depend on a stylesheet living inside the vendor page.
function updateInjectedButtonState(btn, qty) {
  const inOrder = qty > 0;
  btn.dataset.cadenceState = inOrder ? "added" : "default";
  if (inOrder) {
    btn.innerHTML =
      `<span style="display:inline-flex;align-items:center;gap:8px;">` +
      `<span>Added</span>` +
      `<span class="cadence-add-badge" style="` +
      `display:inline-flex;align-items:center;justify-content:center;` +
      `min-width:20px;height:20px;padding:0 6px;` +
      `background:rgba(255,255,255,0.25);border-radius:10px;` +
      `font-size:12px;font-weight:700;line-height:1;` +
      `">${qty}</span></span>`;
    btn.style.background = ADD_BTN_GREEN_BG;
  } else {
    btn.textContent = "Add to Cadence";
    btn.style.background = ADD_BTN_BLUE_BG;
  }
}

// Walk every injected button currently in the DOM and reapply state from the
// cache. Cheap — typically a handful per page; called after add success,
// per-row qty change, or full panel refresh.
function refreshAllInjectedButtons() {
  document.querySelectorAll(".cadence-add-btn").forEach((btn) => {
    const pn = btn.dataset.cadencePn;
    updateInjectedButtonState(btn, orderQtyByPn[pn] || 0);
  });
}

// Shift the vendor's body content left by the panel's width so the panel
// "pushes" the page rather than overlaying it. Mirrors the panel's own slide
// transition (300ms, same easing) so the two animations stay in lockstep.
// The vendor's position:fixed chrome (nav, search bar, our own header) is
// outside body flow and stays full-width — that's intentional; only document
// content moves.
const ORIG_BODY_PAD_RIGHT_ATTR = "data-cadence-orig-body-pr";
const PANEL_PUSH_TRANSITION =
  "padding-right 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";

function applyPanelPush(open) {
  // Preserve the vendor's original body padding-right exactly once so close
  // restores it without compounding.
  if (!document.body.hasAttribute(ORIG_BODY_PAD_RIGHT_ATTR)) {
    const orig = parseInt(getComputedStyle(document.body).paddingRight, 10) || 0;
    document.body.setAttribute(ORIG_BODY_PAD_RIGHT_ATTR, String(orig));
  }
  if (!document.body.style.transition.includes("padding-right")) {
    document.body.style.transition = PANEL_PUSH_TRANSITION;
  }
  const orig = parseInt(document.body.getAttribute(ORIG_BODY_PAD_RIGHT_ATTR), 10) || 0;
  if (!open) {
    document.body.style.paddingRight = `${orig}px`;
    return;
  }
  // Target width — not measured width — so the body's padding-right transition
  // animates toward the same destination as the panel's width transition.
  // Reading getBoundingClientRect() mid-transition would feed in an
  // intermediate value and the body would lag behind by one frame.
  //   minimized:   36px  (matches .panel.minimized rule)
  //   default:     440px capped by 90vw (matches the .panel base rule)
  let panelWidth;
  const host = document.getElementById(PANEL_HOST_ID);
  const panel = host && host.shadowRoot && host.shadowRoot.getElementById("panel");
  if (panel && panel.classList.contains("minimized")) {
    panelWidth = 36;
  } else {
    panelWidth = Math.min(440, window.innerWidth * 0.9);
  }
  document.body.style.paddingRight = `${orig + panelWidth}px`;
}

// Inline sign-in handler — wired in ensureSidePanel. Re-fires refreshSidePanel
// on success so the body swaps from form to order; the storage.onChanged
// listener in start() would also fire it, but invoking it here gives us a
// faster perceived response without waiting for the storage round-trip.
async function handlePanelSignIn(shadow) {
  const emailEl = shadow.getElementById("loginEmail");
  const pwEl = shadow.getElementById("loginPassword");
  const btn = shadow.getElementById("signInBtn");
  const err = shadow.getElementById("signInErr");
  err.textContent = "";
  const email = emailEl.value.trim();
  const password = pwEl.value;
  if (!email || !password) {
    err.textContent = "Email + password required";
    return;
  }
  btn.disabled = true;
  btn.textContent = "Signing in…";
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "signIn",
      email,
      password,
      // project omitted — background falls back to ACTIVE_PROJECT in config.js
    });
    if (!resp || !resp.ok) {
      err.textContent = (resp && resp.error) || "Sign-in failed";
    } else {
      pwEl.value = "";
    }
  } catch (e) {
    err.textContent = (e && e.message) || String(e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
}

// Swap the panel body between the sign-in form and the order list. Both
// elements stay mounted; only `display` toggles so the user's typed email
// survives a sign-in failure or storage event.
function setPanelMode(shadow, mode /* "signin" | "order" */) {
  const loginForm = shadow.getElementById("loginForm");
  const orderList = shadow.getElementById("orderList");
  const btnLogout = shadow.getElementById("btnLogout");
  if (mode === "signin") {
    loginForm.classList.add("visible");
    orderList.style.display = "none";
    btnLogout.classList.add("hidden");
  } else {
    loginForm.classList.remove("visible");
    orderList.style.display = "";
    btnLogout.classList.remove("hidden");
  }
}

async function refreshSidePanel() {
  const shadow = ensureSidePanel();
  const meta = shadow.getElementById("panelMeta");
  const orderList = shadow.getElementById("orderList");
  const title = shadow.getElementById("panelTitle");
  const total = shadow.getElementById("panelTotal");
  const btnOpen = shadow.getElementById("btnOpen");

  total.textContent = "$0.00";

  const authResp = await chrome.runtime.sendMessage({ type: "getAuth" }).catch(() => null);
  const settings = (await chrome.storage.local.get("settings")).settings || {};
  const auth = authResp && authResp.ok ? authResp.auth : null;

  if (!auth) {
    // Signed-out: show the inline sign-in form, blank the order area, hide the
    // logout button. Header chrome (title + meta) gets neutral labels so we
    // don't dangle a stale order name from a previous session.
    title.textContent = "Cadence";
    meta.textContent = "Sign in to load your active vendor order.";
    orderList.innerHTML = "";
    btnOpen.removeAttribute("href");
    btnOpen.setAttribute("aria-disabled", "true");
    setPanelMode(shadow, "signin");
    // Drop the badge state on sign-out so on-page buttons stop claiming items
    // are in an order the user no longer has access to.
    setOrderQtyCache([]);
    return;
  }

  // Signed-in path: show the order list, hide the form.
  setPanelMode(shadow, "order");

  if (!settings.tenantID || !settings.storeID) {
    title.textContent = "Cadence Order";
    meta.textContent = "Set tenant/store in the popup.";
    orderList.innerHTML = `<div class="empty"><strong>Tenant/store not configured.</strong><br/>Open the popup and save your tenant + store IDs.</div>`;
    btnOpen.removeAttribute("href");
    btnOpen.setAttribute("aria-disabled", "true");
    return;
  }

  meta.textContent = "Loading…";
  orderList.innerHTML = "";

  // Wire the "Edit in Cadence" deep link per project. The in-app side wires
  // its own route handling; this is a tab opener, no auth handoff.
  if (auth.appUrl) {
    btnOpen.setAttribute("href", auth.appUrl);
    btnOpen.removeAttribute("aria-disabled");
  } else {
    btnOpen.removeAttribute("href");
    btnOpen.setAttribute("aria-disabled", "true");
  }

  // Scrape the current vendor page for per-part-number cost + warehouse so
  // the server can flag any inventory rows whose stored cost has drifted from
  // what the vendor is currently quoting. Empty on unsupported pages — the
  // server treats that as "no diff data" and returns hasCostDiff=false for
  // every row.
  const pageCosts = scanPageCosts();

  const resp = await chrome.runtime
    .sendMessage({
      type: "getOrder",
      payload: {
        tenantID: settings.tenantID,
        storeID: settings.storeID,
        pageCosts,
      },
    })
    .catch(() => null);
  const result = (resp && resp.result) || {};

  if (!result.success) {
    if (result.reason === "no_active_order") {
      title.textContent = "No active order";
      meta.textContent = "Open Cadence and create or activate an order.";
      orderList.innerHTML = `<div class="empty"><strong>No active order.</strong><br/>Create or pick an active vendor order in Cadence, then come back to this page.</div>`;
      return;
    }
    if (result.reason === "active_order_missing") {
      title.textContent = "Active order missing";
      meta.textContent = "The previously active order isn't in this store anymore.";
      orderList.innerHTML = `<div class="empty"><strong>Active order not found.</strong><br/>It may have been deleted or moved. Open Cadence to pick another.</div>`;
      return;
    }
    title.textContent = "Error";
    meta.textContent = result.reason || "unknown error";
    orderList.innerHTML = `<div class="empty">${(result.message || result.reason || "Failed to load order").replace(/</g, "&lt;")}</div>`;
    return;
  }

  const order = result.order || {};
  const items = result.items || [];
  title.textContent = order.name || "Cadence Order";
  const addedDate = order.lastModifiedMillis
    ? new Date(order.lastModifiedMillis).toLocaleString()
    : "—";
  meta.textContent = `${items.length} item${items.length === 1 ? "" : "s"} • updated ${addedDate}`;

  // Reconcile the on-page button badges to whatever the server says is in the
  // order right now. Done before the early-return so an empty order also
  // resets every badge back to blue.
  setOrderQtyCache(items);

  if (!items.length) {
    orderList.innerHTML = `<div class="empty"><strong>No items yet.</strong><br/>Click "Add to Cadence" beside any vendor item to add it here.</div>`;
    total.textContent = "$0.00";
    return;
  }

  let runningTotal = 0;
  const rows = items.map((it) => {
    const qty = Number(it.qty || 0);
    // _display fields are resolved server-side using the same precedence as
    // the in-app OrderingModalScreen — inventory name beats catalog name,
    // catalog cost beats inventory cost, all money in CENTS.
    const display = it._display || {};
    const costDollars =
      display.costCents != null ? Number(display.costCents) / 100 : 0;
    const priceDollars =
      display.priceCents != null ? Number(display.priceCents) / 100 : null;
    const line = qty * costDollars;
    runningTotal += line;
    const name = String(
      display.name || it.vendorItemID || "(unnamed)"
    ).replace(/</g, "&lt;");
    // Per-line qty adjuster buttons need the item doc's id (NOT vendorItemID —
    // the same vendorItemID may appear on multiple lines if added separately).
    const itemIDAttr = String(it.id || "").replace(/"/g, "&quot;");
    // vendorItemID stamped on the row so syncOrderQtyCacheForPn can find every
    // line that shares a part number when one row's qty changes.
    const vendorItemIDAttr = String(it.vendorItemID || "").replace(/"/g, "&quot;");
    // Optional MSRP/price column on the right when inventory has one. Falls
    // back to the line total so the right column is never empty. rightMode is
    // read by setPanelRowQty to decide whether to recompute on qty changes:
    // "msrp" stays put, "total" moves with qty.
    const hasMsrp = priceDollars != null && priceDollars > 0;
    const rightLabel = hasMsrp
      ? `$${priceDollars.toFixed(2)} ea`
      : `$${line.toFixed(2)}`;
    const rightMode = hasMsrp ? "msrp" : "total";
    const costCentsAttr =
      display.costCents != null ? Number(display.costCents) : 0;

    // Cost-reconciliation badge. Server returns hasCostDiff=true only when
    // BOTH page-scraped cost and inventory cost exist and disagree. Apply
    // updates only the inventory item's `cost` field — line items already on
    // this order keep the cost they were added with (intentional: this order
    // shouldn't change retroactively just because the catalog moved).
    let diffBlock = "";
    if (display.hasCostDiff && display.inventoryItemID) {
      const pageDollars = Number(display.pageCostCents) / 100;
      const yoursDollars = Number(display.inventoryCostCents) / 100;
      const whText = display.pageWarehouseCode
        ? ` (${String(display.pageWarehouseCode).replace(/</g, "&lt;")})`
        : "";
      const invIDAttr = String(display.inventoryItemID).replace(/"/g, "&quot;");
      const vendorLabel = (VENDOR && VENDOR.vendorDisplayName) || "Vendor";
      diffBlock = `
        <div class="diff-row">
          <span class="diff-badge">${vendorLabel} Cost $${pageDollars.toFixed(2)} • Your Inventory $${yoursDollars.toFixed(2)}</span>
          <button type="button" class="apply-btn" data-action="apply"
                  data-inv-id="${invIDAttr}"
                  data-new-cost="${Number(display.pageCostCents)}">Update Yours</button>
          <button type="button" class="info-btn" data-action="info"
                  aria-label="Why am I seeing this?">i</button>
          <div class="info-tip">
            ${vendorLabel} lists this part at <strong>$${pageDollars.toFixed(2)}</strong>${whText}, but your Cadence inventory has it at <strong>$${yoursDollars.toFixed(2)}</strong>.<br/><br/>
            Click <strong>Update Yours</strong> to update your inventory item's cost to match ${vendorLabel}. Items already on this vendor order keep the cost they were added with.
          </div>
        </div>
      `;
    }

    return `
      <div class="item" data-item-id="${itemIDAttr}" data-vendor-item-id="${vendorItemIDAttr}" data-qty="${qty}" data-cost-cents="${costCentsAttr}">
        <div class="item-name">${name}</div>
        <div class="item-meta">
          <span>qty ${qty}</span>
          <span>@ $${costDollars.toFixed(2)}</span>
          <span class="right" data-right-mode="${rightMode}">${rightLabel}</span>
          <div class="qty-adjusters">
            <button type="button" class="qty-up" data-action="qty-up"
                    data-item-id="${itemIDAttr}" data-qty="${qty}"
                    aria-label="Increase quantity">▲</button>
            <button type="button" class="qty-down" data-action="qty-down"
                    data-item-id="${itemIDAttr}" data-qty="${qty}"
                    ${qty <= 1 ? "disabled" : ""}
                    aria-label="Decrease quantity">▼</button>
          </div>
        </div>
        ${diffBlock}
      </div>
    `;
  });
  orderList.innerHTML = rows.join("");
  total.textContent = `$${runningTotal.toFixed(2)}`;
}

// ────────────────────────────────────────────────────────────────────
// Page-cost scrape + diff click handlers
// ────────────────────────────────────────────────────────────────────

// Walk every vendor add button currently in the DOM (per the active adapter),
// pull each row's cost and warehouse code, and return a map keyed by part
// number. Used by refreshSidePanel to drive the cost-diff badge. Returns {}
// on unsupported pages or when no rows have parseable prices.
function scanPageCosts() {
  const out = {};
  if (!VENDOR) return out;
  const addBtns = VENDOR.findAddButtons(document);
  addBtns.forEach((btn) => {
    const pn = VENDOR.getPartNumber(btn);
    if (!pn) return;
    const row = VENDOR.getRow(btn);
    if (!row) return;
    const costStr = VENDOR.extractCost(row);
    const costDollars = Number(costStr);
    if (!Number.isFinite(costDollars) || costDollars <= 0) return;
    const { warehouseCode } = VENDOR.extractWarehouseInfo(pn);
    out[pn] = { costDollars, warehouseCode };
  });
  return out;
}

// Single delegated click handler on .panel-body — dispatches to Apply / Info /
// qty adjuster.
function handlePanelBodyClick(ev) {
  const t = ev.target;
  if (!t || t.nodeType !== 1) return;
  const action = t.getAttribute && t.getAttribute("data-action");
  if (!action) return;
  if (action === "apply") {
    handleApplyCostClick(t);
  } else if (action === "info") {
    handleInfoClick(t);
  } else if (action === "qty-up" || action === "qty-down") {
    handleQtyAdjustClick(t, action === "qty-up" ? 1 : -1);
  }
}

// Toggle this row's info-tip; closing any other tip first so only one is open
// at a time.
function handleInfoClick(btn) {
  const row = btn.closest(".diff-row");
  if (!row) return;
  const tip = row.querySelector(".info-tip");
  if (!tip) return;
  const wasOpen = tip.classList.contains("open");
  const host = document.getElementById(PANEL_HOST_ID);
  if (host && host.shadowRoot) {
    host.shadowRoot
      .querySelectorAll(".info-tip.open")
      .forEach((el) => el.classList.remove("open"));
  }
  if (!wasOpen) tip.classList.add("open");
}

// Apply the scraped page cost to the inventory item. On success, remove the
// diff row in place — the row's displayed cost doesn't change (catalogSnapshot
// still drives it) so a full panel re-render would be pure flicker. On
// failure, surface a "Retry" affordance on the button itself.
async function handleApplyCostClick(btn) {
  const invID = btn.getAttribute("data-inv-id");
  const newCostCents = Number(btn.getAttribute("data-new-cost"));
  if (!invID || !Number.isFinite(newCostCents)) return;
  const settings = (await chrome.storage.local.get("settings")).settings || {};
  if (!settings.tenantID || !settings.storeID) return;

  btn.disabled = true;
  btn.textContent = "Applying…";
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "applyInventoryCost",
      payload: {
        tenantID: settings.tenantID,
        storeID: settings.storeID,
        inventoryItemID: invID,
        newCostCents,
      },
    });
    const result = (resp && resp.result) || {};
    if (!resp || !resp.ok || !result.success) {
      btn.disabled = false;
      btn.textContent = "Retry";
      return;
    }
    const diffRow = btn.closest(".diff-row");
    if (diffRow) diffRow.remove();
  } catch (_err) {
    btn.disabled = false;
    btn.textContent = "Retry";
  }
}

// Adjust a single order line's qty by +1 or -1. Clamps at 1 (panel doesn't
// own deletion — user can remove items in the app). On success, patches the
// row + footer total + on-page button badge in place — no panel re-render, so
// the user doesn't see the whole list flicker on every ▲/▼ click.
async function handleQtyAdjustClick(btn, delta) {
  const itemID = btn.getAttribute("data-item-id");
  const currentQty = Number(btn.getAttribute("data-qty"));
  if (!itemID || !Number.isFinite(currentQty)) return;
  const newQty = currentQty + delta;
  if (newQty < 1) return;

  const settings = (await chrome.storage.local.get("settings")).settings || {};
  if (!settings.tenantID || !settings.storeID) return;

  // Disable both adjusters on this row so a rapid second click can't race the
  // first request.
  const adjustersWrap = btn.closest(".qty-adjusters");
  const buttons = adjustersWrap ? adjustersWrap.querySelectorAll("button") : [btn];
  buttons.forEach((b) => (b.disabled = true));

  // Restore the pre-click disabled state — qty-down stays disabled at qty 1.
  const restoreDisabled = () => {
    buttons.forEach((b) => {
      b.disabled = false;
      if (b.classList.contains("qty-down") && currentQty <= 1) b.disabled = true;
    });
  };

  try {
    const resp = await chrome.runtime.sendMessage({
      type: "setItemQty",
      payload: {
        tenantID: settings.tenantID,
        storeID: settings.storeID,
        itemID,
        qty: newQty,
      },
    });
    const result = (resp && resp.result) || {};
    if (!resp || !resp.ok || !result.success) {
      restoreDisabled();
      return;
    }
    const patched = setPanelRowQty(itemID, newQty);
    if (!patched) refreshSidePanel();
  } catch (_err) {
    restoreDisabled();
  }
}

// ────────────────────────────────────────────────────────────────────
// "Add to Cadence" button injection
// ────────────────────────────────────────────────────────────────────

function injectButtonsInTree(root) {
  if (!VENDOR) return;
  const adds = VENDOR.findAddButtons(root);
  adds.forEach((addBtn) => {
    // Mark the vendor add button itself so the marker travels with the button
    // regardless of where the adapter chooses to attach the wrapper.
    if (addBtn.getAttribute(INJECTED_ATTR) === "1") return;
    addBtn.setAttribute(INJECTED_ATTR, "1");

    const partNumber = VENDOR.getPartNumber(addBtn);
    if (!partNumber) return;

    // Wrapper lives BELOW the vendor's add button. width/flex-basis 100%
    // forces a wrap when the parent is a flex container so we don't get
    // squeezed in beside vendor buttons. justify-content: flex-end aligns
    // our button to the right edge so it sits directly under the vendor's
    // add button on both JBI and QBP layouts.
    const wrapper = document.createElement("div");
    wrapper.className = "cadence-add-wrapper";
    wrapper.style.cssText = `
      margin-top: 6px;
      width: 100%;
      flex-basis: 100%;
      display: flex;
      justify-content: flex-end;
    `;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cadence-add-btn";
    btn.dataset.cadencePn = partNumber;
    // Background is owned by updateInjectedButtonState — blue when the part
    // isn't in the active order, green with a qty badge once it is. Omit it
    // from cssText so the state helper doesn't have to fight !important.
    btn.style.cssText = `
      padding: 8px 14px;
      color: #fff;
      border: none;
      border-radius: 4px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
      transition: transform 80ms ease, filter 120ms ease;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.filter = "brightness(1.08)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.filter = "";
    });
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      handleAddClick(addBtn, btn, partNumber);
    });
    // Seed text + color from whatever the side panel last knew about this
    // part. orderQtyByPn is populated on every refreshSidePanel, so a button
    // injected later (AJAX result, infinite scroll) still gets the right
    // initial state without a fresh server round-trip.
    updateInjectedButtonState(btn, orderQtyByPn[partNumber] || 0);
    wrapper.appendChild(btn);

    VENDOR.injectWrapper(addBtn, wrapper);
  });
}

// Read qty / warehouse / cost off the row via the active vendor adapter,
// then send to background. First arg is whichever vendor's add button was
// clicked — JBI's button.btn-add-to-order or QBP's button.qty-button.
async function handleAddClick(vendorAddBtn, ourBtn, partNumber) {
  if (!VENDOR) return;
  const row = VENDOR.getRow(vendorAddBtn);
  const qtyEl = VENDOR.getQtyEl(partNumber);

  const qty = Number((qtyEl && qtyEl.value) || 1);
  if (!Number.isFinite(qty) || qty < 1) {
    flashFeedback(ourBtn, "Enter qty first", "warn");
    return;
  }

  const { warehouseCode, warehouseQty } = VENDOR.extractWarehouseInfo(partNumber);
  const cost = VENDOR.extractCost(row);

  const settings = (await chrome.storage.local.get("settings")).settings || {};
  if (!settings.tenantID || !settings.storeID) {
    flashFeedback(ourBtn, "Set tenant/store in popup", "warn");
    return;
  }

  // Snapshot the pre-click qty so a failure can restore the exact button state
  // (blue "Add to Cadence" vs green "Added [N]") without re-querying anything.
  const priorQty = orderQtyByPn[partNumber] || 0;
  ourBtn.disabled = true;
  ourBtn.innerHTML = "Adding…";

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({
      type: "addItem",
      payload: {
        tenantID: settings.tenantID,
        storeID: settings.storeID,
        vendorCatalogID: VENDOR.vendorCatalogID,
        vendorItemID: partNumber,
        qty,
        cost,
        warehouseCode,
        warehouseQty,
      },
    });
  } catch (err) {
    ourBtn.disabled = false;
    updateInjectedButtonState(ourBtn, priorQty);
    flashFeedback(ourBtn, "Error: " + (err && err.message), "err");
    return;
  }

  ourBtn.disabled = false;

  if (!resp || !resp.ok) {
    updateInjectedButtonState(ourBtn, priorQty);
    flashFeedback(ourBtn, "Error: " + (resp && resp.error), "err");
    return;
  }
  const result = resp.result || {};
  if (!result.success) {
    updateInjectedButtonState(ourBtn, priorQty);
    const reason = result.reason || "unknown";
    if (reason === "not_signed_in") {
      flashFeedback(ourBtn, "Sign in via the side panel", "warn");
      openSidePanel();
    } else if (reason === "no_active_order") {
      flashFeedback(ourBtn, "Create an order in Cadence first", "warn");
      openSidePanel();
    } else if (reason === "active_order_missing") {
      flashFeedback(ourBtn, "Active order missing — pick another in Cadence", "warn");
      openSidePanel();
    } else {
      flashFeedback(ourBtn, "Failed: " + (result.message || reason), "err");
    }
    return;
  }

  // Success path. Server returns merged:true when it bumped an existing line's
  // qty instead of inserting a new one, plus the canonical post-write qty + id.
  // Fall back to (priorQty + qty) if either field is missing so older deploys
  // still produce a sensible badge.
  const mergedQty = Number.isFinite(Number(result.qty))
    ? Number(result.qty)
    : priorQty + qty;
  orderQtyByPn[partNumber] = mergedQty;
  updateInjectedButtonState(ourBtn, mergedQty);

  // Patch the panel in place when we can (merged into an existing row whose id
  // we have). Brand-new rows still need a full refresh because we don't have
  // the server's _display payload locally. Same for missing/old responses.
  if (panelIsOpen()) {
    if (result.merged && result.itemID) {
      const patched = setPanelRowQty(result.itemID, mergedQty);
      if (!patched) refreshSidePanel();
    } else {
      refreshSidePanel();
    }
  }
}

// Shows a temporary message below our wrapper. Mirrors the JBI-style
// #myElem_<pn> per-row feedback pattern but in our own DOM so the vendor's
// markup stays untouched.
function flashFeedback(ourBtn, message, kind /* "ok" | "warn" | "err" */) {
  const group = ourBtn.parentElement;
  if (!group) return;
  let msg = group.parentElement && group.parentElement.querySelector(".cadence-feedback");
  if (!msg) {
    msg = document.createElement("div");
    msg.className = "cadence-feedback";
    msg.style.cssText = `
      margin-top: 6px;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
    `;
    group.parentElement.appendChild(msg);
  }
  msg.textContent = message;
  msg.style.color =
    kind === "ok" ? "#1f9d55" : kind === "warn" ? "#b58800" : "#c53030";
  clearTimeout(msg._cadenceTimer);
  msg._cadenceTimer = setTimeout(() => {
    msg.textContent = "";
  }, 4000);
}

// ────────────────────────────────────────────────────────────────────
// MutationObserver — vendor pages typically render search results via AJAX.
// ────────────────────────────────────────────────────────────────────

let scheduled = false;
function scheduleScan() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    injectButtonsInTree(document);
  });
}

function start() {
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }
  // Vendor-agnostic UI (panel, button injection) only runs when we recognize
  // the host. The manifest's content_scripts match-list is the primary gate,
  // but this belt-and-suspenders check prevents the panel from opening if the
  // extension is ever loaded against a host without a registered
  // VENDOR_ADAPTERS entry.
  if (!VENDOR) return;

  // Always auto-open the panel on page load. Refresh decides what to render —
  // sign-in form when there's no auth, order summary otherwise.
  openSidePanel();
  injectButtonsInTree(document);
  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener(
    "resize",
    () => {
      if (panelIsOpen()) applyPanelPush(true);
    },
    { passive: true }
  );

  // React to storage changes (sign-in / settings updates) by refreshing the
  // panel without forcing the user to reload. Covers the case where the
  // popup or another tab signs the user in/out — the open panel here picks
  // up the new state and swaps form↔order accordingly.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.auth || changes.settings) {
      if (panelIsOpen()) refreshSidePanel();
    }
  });
}

start();
