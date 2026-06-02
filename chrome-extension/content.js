// Cadence Chrome Extension — content script.
//
// Injects an "Add to Cadence" button beside each vendor's add-to-cart button
// on every listing/detail page we know about, plus a sticky Cadence-branded
// header bar (sandwiched below the vendor's own sticky header). The header,
// side panel, button styling, and ordering flow are identical across vendors —
// per-vendor differences live ONLY in the VENDOR_ADAPTERS table below.
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
const HEADER_HOST_ID = "cadence-extension-header-host";
const PANEL_HOST_ID = "cadence-extension-panel-host";

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
// Header bar (Shadow DOM, sticky, below the vendor's own sticky header)
// ────────────────────────────────────────────────────────────────────

function ensureHeaderBar() {
  if (document.getElementById(HEADER_HOST_ID)) return;
  const host = document.createElement("div");
  host.id = HEADER_HOST_ID;
  // position:fixed so we render outside the vendor's layout flow. The `top`
  // value is computed dynamically by applyHeaderLayout() — it slots us below
  // any of the vendor's own top-anchored fixed/sticky chrome (nav, search
  // bar, etc.) rather than covering them.
  host.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483000;
  `;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .bar {
        background: linear-gradient(90deg, #1f9d55 0%, #38b269 100%);
        color: #fff;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 14px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
      }
      .brand { font-weight: 700; letter-spacing: 0.3px; }

      /* Signed-in three-column layout: View Order is dead-center of the bar. */
      .signed-in .left,
      .signed-in .center,
      .signed-in .right {
        flex: 1;
        display: flex;
        align-items: center;
      }
      .signed-in .left { justify-content: flex-start; gap: 12px; }
      .signed-in .center { justify-content: center; }
      .signed-in .right { justify-content: flex-end; gap: 10px; }

      .indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }
      .indicator .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(255,255,255,0.45);
        flex-shrink: 0;
      }
      .indicator.empty { opacity: 0.85; font-style: italic; }
      .indicator.empty .dot {
        background: rgba(255,255,255,0.3);
        box-shadow: none;
      }
      .indicator.empty .label { display: none; }
      .indicator .label {
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: rgba(255,255,255,0.7);
      }
      .indicator .name {
        font-weight: 600;
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      button.view-order {
        background: #fff;
        color: #1f9d55;
        border: none;
        border-radius: 4px;
        padding: 6px 22px;
        font-weight: 700;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
      }
      button.view-order:hover { background: #f0fff5; }
      button.view-order:disabled {
        background: rgba(255,255,255,0.3);
        color: rgba(255,255,255,0.9);
        cursor: not-allowed;
      }

      button.logout {
        background: transparent;
        color: #fff;
        border: 1px solid rgba(255,255,255,0.55);
        border-radius: 3px;
        padding: 4px 12px;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
      }
      button.logout:hover { background: rgba(255,255,255,0.15); }

      /* Signed-out inline form (component-swap with the signed-in row) */
      .signed-out, .signed-in {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
      }
      .signed-out input {
        background: rgba(255,255,255,0.95);
        color: #1f2937;
        border: 1px solid rgba(255,255,255,0.6);
        border-radius: 3px;
        padding: 5px 8px;
        font-size: 13px;
        font-family: inherit;
        width: 200px;
      }
      .signed-out input::placeholder { color: #9ca3af; }
      .signed-out input:focus {
        outline: 2px solid #176b3a;
        outline-offset: -1px;
      }
      .signed-out button.signin {
        background: #fff;
        color: #1f9d55;
        border: none;
        border-radius: 3px;
        padding: 5px 16px;
        font-weight: 700;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
      }
      .signed-out button.signin:hover { background: #f0fff5; }
      .signed-out button.signin:disabled { opacity: 0.6; cursor: not-allowed; }
      .signed-out .err {
        color: #fff;
        background: rgba(197, 48, 48, 0.85);
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 12px;
      }
      .signed-out .err:empty { display: none; }
    </style>
    <div class="bar">
      <div class="signed-out" id="signedOut">
        <span class="brand">Cadence Systems</span>
        <input type="text" id="loginEmail" placeholder="Email"
               autocomplete="off" name="cadence_login_email"
               data-lpignore="true" data-1p-ignore />
        <input type="password" id="loginPassword" placeholder="Password"
               autocomplete="new-password" name="cadence_login_pw"
               data-lpignore="true" data-1p-ignore />
        <button type="button" class="signin" id="signInBtn">Sign in</button>
        <span class="err" id="signInErr"></span>
      </div>
      <div class="signed-in" id="signedIn" style="display: none;">
        <div class="left">
          <span class="brand">Cadence Systems</span>
          <span class="indicator empty" id="orderIndicator">
            <span class="dot"></span>
            <span class="label">Active order:</span>
            <span class="name" id="orderName">Loading…</span>
          </span>
        </div>
        <div class="center">
          <button type="button" class="view-order" id="viewOrder" disabled>View Order</button>
        </div>
        <div class="right">
          <button type="button" class="logout" id="logoutBtn">Sign out</button>
        </div>
      </div>
    </div>
  `;
  // Insert at the very top of body so it sticks above the vendor's content.
  // The vendor's own header is also sticky and has a higher visual position;
  // ours sits beneath it without mutating the vendor's nav.
  document.body.insertBefore(host, document.body.firstChild);

  shadow.getElementById("viewOrder").addEventListener("click", () => {
    openSidePanel();
  });

  shadow.getElementById("logoutBtn").addEventListener("click", async () => {
    // Guard against MV3 "extension context invalidated" — happens when the
    // extension was reloaded while this tab kept running the old content
    // script. chrome.runtime is undefined in that state.
    try {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        setIndicator(shadow, "Extension reloaded — refresh this tab", false);
        return;
      }
      await chrome.runtime.sendMessage({ type: "signOut" });
      // storage.onChanged listener will fire refreshHeaderStatus, which swaps
      // back to the signed-out form.
    } catch (err) {
      setIndicator(shadow, "Sign-out failed — refresh this tab", false);
    }
  });

  // Inline sign-in form (signed-out state).
  shadow.getElementById("signInBtn").addEventListener("click", () => handleSignIn(shadow));
  shadow.getElementById("loginEmail").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") handleSignIn(shadow);
  });
  shadow.getElementById("loginPassword").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") handleSignIn(shadow);
  });

  applyHeaderLayout();
  refreshHeaderStatus();
}

async function handleSignIn(shadow) {
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
      // storage.onChanged listener will fire refreshHeaderStatus, which swaps
      // the form out for the signed-in row.
    }
  } catch (e) {
    err.textContent = (e && e.message) || String(e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
}

// Reposition our bar to slot below any of the vendor's top-anchored
// fixed/sticky chrome and add body padding-top so their content gets pushed
// down by our bar's height. Re-runs on resize and on relevant DOM mutations.
const ORIG_BODY_PAD_ATTR = "data-cadence-orig-body-pt";

function applyHeaderLayout() {
  const host = document.getElementById(HEADER_HOST_ID);
  if (!host) return;
  const vendorChromeBottom = measureVendorTopChromeBottom();
  host.style.top = `${vendorChromeBottom}px`;
  const barHeight = host.getBoundingClientRect().height || 32;

  // Preserve the vendor's original body padding-top exactly once so we can
  // compose our extra shift on top of it instead of fighting with subsequent
  // runs.
  if (!document.body.hasAttribute(ORIG_BODY_PAD_ATTR)) {
    const orig = parseInt(getComputedStyle(document.body).paddingTop, 10) || 0;
    document.body.setAttribute(ORIG_BODY_PAD_ATTR, String(orig));
  }
  const orig = parseInt(document.body.getAttribute(ORIG_BODY_PAD_ATTR), 10) || 0;
  document.body.style.paddingTop = `${orig + barHeight}px`;
}

// Find the lowest "bottom edge" of any element that's pinned to the top of
// the viewport (position:fixed/sticky with top <= ~5px and height > 0).
// Skips our own injected hosts so we don't measure ourselves.
function measureVendorTopChromeBottom() {
  let maxBottom = 0;
  const skip = new Set([HEADER_HOST_ID, PANEL_HOST_ID]);
  function check(el) {
    if (!el || skip.has(el.id)) return;
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") return;
    const rect = el.getBoundingClientRect();
    if (rect.top <= 5 && rect.height > 0) {
      maxBottom = Math.max(maxBottom, rect.bottom);
    }
  }
  // Look at body's direct children and one level deeper. Fixed top chrome
  // is virtually always within that depth on vendor sites we target.
  for (const direct of document.body.children) {
    check(direct);
    for (const grand of direct.children) check(grand);
  }
  return maxBottom;
}

async function refreshHeaderStatus() {
  const host = document.getElementById(HEADER_HOST_ID);
  if (!host || !host.shadowRoot) return;
  const shadow = host.shadowRoot;
  const signedOut = shadow.getElementById("signedOut");
  const signedIn = shadow.getElementById("signedIn");
  try {
    const authResp = await chrome.runtime.sendMessage({ type: "getAuth" });
    const settings = (await chrome.storage.local.get("settings")).settings || {};
    if (!authResp || !authResp.ok || !authResp.auth) {
      // Component swap: show the inline sign-in form, hide signed-in row.
      signedOut.style.display = "";
      signedIn.style.display = "none";
      applyHeaderLayout();
      return;
    }
    // Signed in: hide form, show three-column row.
    signedOut.style.display = "none";
    signedIn.style.display = "";
    if (!settings.tenantID || !settings.storeID) {
      setIndicator(shadow, "Set tenant/store in popup", false);
      shadow.getElementById("viewOrder").disabled = true;
      applyHeaderLayout();
      return;
    }
    updateOrderIndicator(shadow, settings);
    applyHeaderLayout();
  } catch (err) {
    setIndicator(shadow, "Cadence error: " + (err && err.message), false);
  }
}

// Indicator helper: text + active/empty styling. `active=true` shows the bright
// dot + "we found your order" treatment; `active=false` shows the dim empty
// state (used for "Create an order in Cadence" and error/setup messages).
function setIndicator(shadow, text, active) {
  const indicator = shadow.getElementById("orderIndicator");
  const name = shadow.getElementById("orderName");
  if (!indicator || !name) return;
  name.textContent = text;
  if (active) indicator.classList.remove("empty");
  else indicator.classList.add("empty");
}

// Resolve the active order from the open-orders list and update the indicator
// + View Order enabled state. Active-order selection happens inside Cadence
// itself; the extension just reflects it. Idempotent — safe to call repeatedly.
async function updateOrderIndicator(shadow, settings) {
  const viewBtn = shadow.getElementById("viewOrder");
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "listOrders",
      payload: { tenantID: settings.tenantID, storeID: settings.storeID },
    });
    const result = (resp && resp.result) || {};
    if (!result.success) {
      setIndicator(shadow, `(${result.reason || "error loading orders"})`, false);
      viewBtn.disabled = true;
      return;
    }
    const orders = result.orders || [];
    const activeID = result.activeOrderID || "";
    const active = activeID ? orders.find((o) => o.id === activeID) : null;
    if (!active) {
      setIndicator(shadow, "Create an order in Cadence", false);
      viewBtn.disabled = true;
      return;
    }
    setIndicator(shadow, active.name || active.id, true);
    viewBtn.disabled = false;
  } catch (err) {
    setIndicator(shadow, "(error loading orders)", false);
    viewBtn.disabled = true;
  }
}

// ────────────────────────────────────────────────────────────────────
// Side panel (Shadow DOM, slide-in from right, shows active order)
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
        transition: transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
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
      .panel-refresh {
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
      .panel-refresh:hover { background: rgba(255,255,255,0.32); }
      .panel-refresh { font-size: 18px; }
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
    </style>
    <div class="panel" id="panel">
      <div class="panel-header">
        <span class="panel-title" id="panelTitle">Cadence Order</span>
        <button type="button" class="panel-refresh" id="panelRefresh" aria-label="Refresh" title="Refresh">↻</button>
        <button type="button" class="panel-close" id="panelClose" aria-label="Close">×</button>
      </div>
      <div class="panel-meta" id="panelMeta">Loading…</div>
      <div class="panel-body" id="panelBody"></div>
      <div class="panel-footer">
        <div class="total-row">
          <span>Total</span>
          <span id="panelTotal">$0.00</span>
        </div>
        <div class="footer-actions">
          <button type="button" class="btn-refresh" id="btnRefresh">Refresh</button>
          <a class="btn-open" id="btnOpen" target="_blank" rel="noopener noreferrer" aria-disabled="true">Edit in Cadence ↗</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host);

  shadow.getElementById("panelClose").addEventListener("click", closeSidePanel);
  shadow.getElementById("panelRefresh").addEventListener("click", refreshSidePanel);
  shadow.getElementById("btnRefresh").addEventListener("click", refreshSidePanel);
  // Event delegation for per-item Apply / Info clicks. Rows are re-rendered on
  // every refresh so binding once on the body container avoids re-wiring.
  shadow.getElementById("panelBody").addEventListener("click", handlePanelBodyClick);

  return shadow;
}

function panelIsOpen() {
  const host = document.getElementById(PANEL_HOST_ID);
  if (!host || !host.shadowRoot) return false;
  return host.shadowRoot.getElementById("panel").classList.contains("open");
}

function openSidePanel() {
  const shadow = ensureSidePanel();
  const panel = shadow.getElementById("panel");
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
  host.shadowRoot.getElementById("panel").classList.remove("open");
  applyPanelPush(false);
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
  // Measure the panel's actual rendered width — max-width:90vw can cap it on
  // narrow viewports, so a hardcoded 440 would over-push.
  let panelWidth = 440;
  const host = document.getElementById(PANEL_HOST_ID);
  if (host && host.shadowRoot) {
    const panel = host.shadowRoot.getElementById("panel");
    if (panel) panelWidth = panel.getBoundingClientRect().width;
  }
  document.body.style.paddingRight = `${orig + panelWidth}px`;
}

async function refreshSidePanel() {
  const shadow = ensureSidePanel();
  const meta = shadow.getElementById("panelMeta");
  const body = shadow.getElementById("panelBody");
  const title = shadow.getElementById("panelTitle");
  const total = shadow.getElementById("panelTotal");
  const btnOpen = shadow.getElementById("btnOpen");

  meta.textContent = "Loading…";
  body.innerHTML = "";
  total.textContent = "$0.00";

  const authResp = await chrome.runtime.sendMessage({ type: "getAuth" }).catch(() => null);
  const settings = (await chrome.storage.local.get("settings")).settings || {};
  const auth = authResp && authResp.ok ? authResp.auth : null;

  if (!auth) {
    title.textContent = "Cadence Order";
    meta.textContent = "Sign in via the toolbar popup.";
    body.innerHTML = `<div class="empty"><strong>Not signed in.</strong><br/>Open the Cadence extension icon and sign in to see your order.</div>`;
    btnOpen.removeAttribute("href");
    btnOpen.setAttribute("aria-disabled", "true");
    return;
  }
  if (!settings.tenantID || !settings.storeID) {
    title.textContent = "Cadence Order";
    meta.textContent = "Set tenant/store in the popup.";
    body.innerHTML = `<div class="empty"><strong>Tenant/store not configured.</strong><br/>Open the popup and save your tenant + store IDs.</div>`;
    btnOpen.removeAttribute("href");
    btnOpen.setAttribute("aria-disabled", "true");
    return;
  }

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
      body.innerHTML = `<div class="empty"><strong>No active order.</strong><br/>Create or pick an active vendor order in Cadence, then come back to this page.</div>`;
      return;
    }
    if (result.reason === "active_order_missing") {
      title.textContent = "Active order missing";
      meta.textContent = "The previously active order isn't in this store anymore.";
      body.innerHTML = `<div class="empty"><strong>Active order not found.</strong><br/>It may have been deleted or moved. Open Cadence to pick another.</div>`;
      return;
    }
    title.textContent = "Error";
    meta.textContent = result.reason || "unknown error";
    body.innerHTML = `<div class="empty">${(result.message || result.reason || "Failed to load order").replace(/</g, "&lt;")}</div>`;
    return;
  }

  const order = result.order || {};
  const items = result.items || [];
  title.textContent = order.name || "Cadence Order";
  const addedDate = order.lastModifiedMillis
    ? new Date(order.lastModifiedMillis).toLocaleString()
    : "—";
  meta.textContent = `${items.length} item${items.length === 1 ? "" : "s"} • updated ${addedDate}`;

  if (!items.length) {
    body.innerHTML = `<div class="empty"><strong>No items yet.</strong><br/>Click "Add to Cadence" beside any vendor item to add it here.</div>`;
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
    const pn = String(it.vendorItemID || it.id || "").replace(/</g, "&lt;");
    const wh = it.warehouseCode
      ? `${String(it.warehouseCode).replace(/</g, "&lt;")}`
      : "";
    // Optional MSRP/price column on the right when inventory has one. Falls
    // back to the line total so the right column is never empty.
    const rightLabel =
      priceDollars != null && priceDollars > 0
        ? `$${priceDollars.toFixed(2)} ea`
        : `$${line.toFixed(2)}`;

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
      diffBlock = `
        <div class="diff-row">
          <span class="diff-badge">Page $${pageDollars.toFixed(2)} • yours $${yoursDollars.toFixed(2)}</span>
          <button type="button" class="apply-btn" data-action="apply"
                  data-inv-id="${invIDAttr}"
                  data-new-cost="${Number(display.pageCostCents)}">Apply</button>
          <button type="button" class="info-btn" data-action="info"
                  aria-label="Why am I seeing this?">i</button>
          <div class="info-tip">
            The vendor page lists this part at <strong>$${pageDollars.toFixed(2)}</strong>${whText}, but your Cadence inventory has it at <strong>$${yoursDollars.toFixed(2)}</strong>.<br/><br/>
            Click <strong>Apply</strong> to update your inventory item's cost to match the page. Items already on this vendor order keep the cost they were added with.
          </div>
        </div>
      `;
    }

    return `
      <div class="item">
        <div class="item-name">${name}</div>
        <div class="item-pn">${pn}${wh ? " • " + wh : ""}</div>
        <div class="item-meta">
          <span>qty ${qty}</span>
          <span>@ $${costDollars.toFixed(2)}</span>
          <span class="right">${rightLabel}</span>
        </div>
        ${diffBlock}
      </div>
    `;
  });
  body.innerHTML = rows.join("");
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

// Single delegated click handler on .panel-body — dispatches to Apply / Info.
function handlePanelBodyClick(ev) {
  const t = ev.target;
  if (!t || t.nodeType !== 1) return;
  const action = t.getAttribute && t.getAttribute("data-action");
  if (!action) return;
  if (action === "apply") {
    handleApplyCostClick(t);
  } else if (action === "info") {
    handleInfoClick(t);
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

// Apply the scraped page cost to the inventory item. On success, refresh the
// panel — the diff badge disappears once costs match. On failure, surface a
// "Retry" affordance on the button itself.
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
    refreshSidePanel();
  } catch (_err) {
    btn.disabled = false;
    btn.textContent = "Retry";
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
    btn.textContent = "Add to Cadence";
    btn.style.cssText = `
      padding: 8px 14px;
      background: linear-gradient(180deg, #22a85d 0%, #1f9d55 100%);
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

  const original = ourBtn.textContent;
  ourBtn.disabled = true;
  ourBtn.textContent = "Adding…";

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
    ourBtn.textContent = original;
    flashFeedback(ourBtn, "Error: " + (err && err.message), "err");
    return;
  }

  ourBtn.disabled = false;
  ourBtn.textContent = original;

  if (!resp || !resp.ok) {
    flashFeedback(ourBtn, "Error: " + (resp && resp.error), "err");
    return;
  }
  const result = resp.result || {};
  if (!result.success) {
    const reason = result.reason || "unknown";
    if (reason === "not_signed_in") {
      flashFeedback(ourBtn, "Sign in via popup", "warn");
    } else if (reason === "no_active_order") {
      flashFeedback(ourBtn, "Create an order in Cadence first", "warn");
      openSidePanel();
      refreshHeaderStatus();
    } else if (reason === "active_order_missing") {
      flashFeedback(ourBtn, "Active order missing — pick another in Cadence", "warn");
      openSidePanel();
      refreshHeaderStatus();
    } else {
      flashFeedback(ourBtn, "Failed: " + (result.message || reason), "err");
    }
    return;
  }

  flashFeedback(ourBtn, "Added to Cadence ✓", "ok");
  // If the side panel is open, refresh it so the new line appears.
  if (panelIsOpen()) refreshSidePanel();
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
    // Re-measure the vendor's chrome too — collapsing nav-on-scroll,
    // dismissable banners, etc. can change the offset.
    applyHeaderLayout();
  });
}

// On full page load, auto-open the side panel so the active order is visible
// without an extra click. Silent no-op if the user isn't signed in or hasn't
// set tenant/store yet — the header bar will prompt them.
async function autoOpenOnPageLoad() {
  try {
    const authResp = await chrome.runtime.sendMessage({ type: "getAuth" });
    if (!authResp || !authResp.ok || !authResp.auth) return;
    const settings = (await chrome.storage.local.get("settings")).settings || {};
    if (!settings.tenantID || !settings.storeID) return;
    openSidePanel();
  } catch {
    // Extension context invalid, network glitch, etc. — staying quiet here is
    // better than throwing on every page load.
  }
}

function start() {
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }
  // Vendor-agnostic UI (header, panel, button injection) only runs when we
  // recognize the host. The manifest's content_scripts match-list is the
  // primary gate, but this belt-and-suspenders check prevents the header
  // from showing if the extension is ever loaded against a host without a
  // registered VENDOR_ADAPTERS entry.
  if (!VENDOR) return;

  ensureHeaderBar();
  autoOpenOnPageLoad();
  injectButtonsInTree(document);
  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener(
    "resize",
    () => {
      applyHeaderLayout();
      if (panelIsOpen()) applyPanelPush(true);
    },
    { passive: true }
  );
  // The vendor's fixed header sometimes appears AFTER our first measurement (lazy
  // load, web-font reflow). A small follow-up pass catches that case.
  setTimeout(applyHeaderLayout, 500);
  setTimeout(applyHeaderLayout, 1500);

  // React to storage changes (sign-in / settings updates) by refreshing the
  // header status bar without forcing the user to reload. If the side panel
  // is open we also refresh it — settings.tenantID/storeID changes invalidate
  // the displayed order.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.auth || changes.settings) {
      refreshHeaderStatus();
      if (panelIsOpen()) refreshSidePanel();
    }
  });
}

start();
