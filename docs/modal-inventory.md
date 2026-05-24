# Modal Inventory

Inventory of all modal components in the Warpspeed app, generated as a starting point for unifying modal appearance (consistent header/footer rows for action buttons).

**Excludes:** dropdowns, tooltips, toasts, autocompletes, context menus, popovers, alert overlays (`AlertBox`).

**Total: 46 modals across 5 categories.**

---

## A) Reusable Modal Primitives (`src/dom_components/`)

| # | Component | Path | Buttons / role |
|---|-----------|------|----------------|
| 1 | Dialog | `Dialog/Dialog.jsx` | Wrapper; no buttons |
| 2 | ScreenModal | `ScreenModal/ScreenModal.jsx` | Trigger button + slotted content |
| 3 | StatusPickerModal | `StatusPickerModal/StatusPickerModal.jsx` | Trigger only (list picker) |
| 4 | LoginModal | `LoginModal/LoginModal.jsx` | Lock-toggle (top-right) |
| 5 | WebPageModal | `WebPageModal/WebPageModal.jsx` | Close X (top-right header) |
| 6 | DepositModal | `DepositModal/DepositModal.jsx` | **Cancel + Pay/Apply** (bottom footer) |
| 7 | FullSaleModal | `FullSaleModal/FullSaleModal.jsx` | **Refund / Print Sale / Download PDF** (header) + **Close** (footer) |

---

## B) Application Modals (`src/screens/screen_components/modal_screens/`)

| # | Component | Buttons hosted |
|---|-----------|----------------|
| 8 | CustomerInfoModalScreen | Custom button1/button2 props; nested DepositModal / FullSaleModal / GoogleMapsModal triggers (scattered) |
| 9 | ClosedWorkorderModal | **Print Intake, Print Sale** (header). No footer |
| 10 | ColorPickerModal | **Save Changes, Exit (discard)** (bottom) |
| 11 | CustomItemModal | discount controls + Save/Cancel (inline/scattered) |
| 12 | InventorySearchModal | search box, keypad, **Add** (conditional inline) |
| 13 | InventoryItemModalScreen | Edit toggle, Print, Save/Cancel (scattered) |
| 14 | TransactionModal | **Refund** (header), **Print Refund Receipt** (inline) |
| 15 | GoogleMapsModal | **Close** (top-right), **Retry** (error overlay) |
| 16 | WorkorderMediaModal | Upload, Send, per-media Delete, full-screen Close (multiple inline) |
| 17 | UserMessagesModal | tabs (Inbox/Sent/Manager), suppress dropdown, Send, per-row Delete |
| 18 | DevNotesModal | **Post** (top-right), per-note Edit/Delete, Save/Cancel (edit mode) |
| 19 | LabelDesignerModalV2 | field tabs, Add Text/Barcode, Save/Cancel, Print (scattered) |
| 20 | PayrollModal | date range, Begin/End pickers, Add Punch, per-row Edit/Delete, Send Email |
| 21 | ScheduleModal | user selector, week nav, Add Shift, time picker, per-cell Delete |
| 22 | UserClockHistoryModalScreen | user dropdown, date range, per-row Edit/Delete, Save |
| 23 | AnalyticsModalScreen | 6 tab buttons, date preset buttons, Include-Analytics checkbox |
| 24 | QuickButtonPickerModal | chip selectors + expand/collapse (no action footer) |
| 25 | EmojiPickerModal | emoji selector (trivial) |
| 26 | FaceEnrollModalScreen | face enrollment — not deeply inspected |

---

## C) Checkout Sub-Modals (`src/screens/screen_components/modal_screens/newCheckoutModalScreen/`)

| # | Component | Buttons hosted |
|---|-----------|----------------|
| 27 | NewCheckoutModalScreen | Add Item/Labor, Discount, Customer selector, Cash/Card/Reader, Refund, Send Receipt, Complete Sale (very scattered) |
| 28 | SendReceiptModal | **Send** (bottom) |
| 29 | DepositRefundModal | **Full Refund, Remove Deposit, Cancel** + Print/SMS/Email checkboxes |
| 30 | NewRefundModalScreen | item selects, payment method, Refund, Cancel (scattered) |
| 31 | CashPayment | keypad + **Cash Payment Complete** |
| 32 | CardPayment | **Complete Card Payment** + Cancel |
| 33 | CardReaderPayment | **Connect Reader, Retry, Cancel** |
| 34 | CashRefund | **Confirm Refund, Cancel** |
| 35 | CardRefund | **Process Refund, Cancel, Retry** |
| 36 | PaymentsList | per-payment **Delete, Print** |
| 37 | RefundItemSelector | per-item checkbox + qty +/- |
| 38 | RefundPaymentSelector | radios + amount controls |
| 39 | InventorySearch (embedded) | search + per-item Add + Clear |
| 40 | WorkorderCombiner | per-WO checkbox + **Combine** |

*(SaleHeader, SaleTotals, RefundTotals — display-only, no buttons)*

---

## D) Mobile / Phone-Mode Modals (`src/screens/phone/`)

| # | Component | Buttons hosted |
|---|-----------|----------------|
| 41 | ItemSearchModal | **Close** (top-left), **Confirm** (top-right, conditional) |
| 42 | WorkorderDetailModal | status picker, item add, qty +/-, delete, messages (scattered) |

---

## E) Editor Modals (Dashboard Admin panels)

| # | Component | Buttons hosted |
|---|-----------|----------------|
| 43 | CustomerQuickNoteEditorModal | name edit, Add Item, per-item Delete, **Save/Cancel** (footer) |
| 44 | NoteHelperEditorModal | name edit, Add Item, per-item Delete, **Save/Cancel** (footer) |

---

## Layout-State Summary

- **Already have a clear footer:** DepositModal, FullSaleModal, ColorPickerModal, SendReceiptModal, CustomerQuickNoteEditorModal, NoteHelperEditorModal
- **Header buttons only, no footer:** ClosedWorkorderModal, WebPageModal, LoginModal, GoogleMapsModal, DevNotesModal
- **Scattered / no clear pattern:** most checkout sub-modals, CustomItemModal, LabelDesigner, Schedule, UserMessages, phone/WorkorderDetailModal

## ModalFooter Migration Status

Reusable primitive: `src/dom_components/ModalFooter/` exports `<ModalFooter>` + `<ModalFooterButton>`.
Variants: `default` (gray), `primary`, `accent` (green), `danger` (red).

**Migrated:**
- DepositModal, FullSaleModal, LoginModal, WebPageModal (primitives — close-only + 2-button batch)
- ColorPickerModal, CustomerInfoModalScreen, CustomItemModal, DevNotesModal, GoogleMapsModal, ScheduleModal, TransactionModal, ClosedWorkorderModal, CustomerQuickNoteEditorModal, NoteHelperEditorModal, UserClockHistoryModalScreen (2-button batch)
- WorkorderMediaModal — multi-button (Delete / Send Media / Close)
- DepositRefundModal — multi-state (Remove / Refund / Done / Cancel collapsed into single state-aware ModalFooter)
- PayrollModal — Close-only at card bottom; in-card right-column SAVE/EMAIL kept in place per design (3-column layout preserved via `.cardContent` wrapper)
- InventoryItemModalScreen — Delete / Save (new) / Save (dirty) / Close
- NewRefundModalScreen — Close at card bottom; in-column toolbar (Reprint / Send / Pop Register / language picker) kept in place
- NewCheckoutModalScreen — Close / Close with Partial Payment / Cancel Sale (dynamic) at card bottom; in-column toolbar (Reprint / Send / Pop Register / Tax-Free / language picker) kept in place

**Pattern for complex 3-column modals (Payroll, NewRefund, NewCheckout):** Extract the modal-wide Close action to a card-bottom `<ModalFooter>` while leaving in-column toolbars (post-action receipt operations, language picker, etc.) where they live. Card root becomes `flex-direction: column; overflow: hidden;` with the 3-column content as its first flex child.
