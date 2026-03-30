# Plan: Fix Lightspeed Migration to Use Separate Transaction Documents

## Context Prompt for New Chat

> **What we're doing:** The Lightspeed migration system (`lightspeed_import.js` + `Dashboard_Admin.js`) writes payment data as an embedded `transactions[]` array directly on the sale object. The rest of the app was refactored to use a separate `transactions/` Firestore collection, where the sale only holds `transactionIDs[]` (an array of ID strings). This means migrated sales show zero payment info everywhere - no payment details in ClosedWorkorderModal, CustomerInfoModal, FullSaleModal, NewRefundModal, or SalesReports.
>
> **Why:** We want migrated data to be structurally identical to natively-created data. No distinction between imported and native sales/transactions. Every screen reads payments via `sale.transactionIDs` -> `readTransactions(txnIDs)` -> fetches from `transactions/{id}` collection. Migration must write to the same place.
>
> **Scope:** Two files need changes. `src/lightspeed_import.js` (mapSales return value + sale shape) and `src/screens/screen_components/Items_Screen/dashboard_screen/Dashboard_Admin.js` (handleFullMigration + loadAndCacheLightspeedData to handle the new return shape, clear transactions collection, batch-write transactions).
>
> **Read the full plan at:** `PLAN-migration-transaction-fix.md` in project root.

---

## Problem Summary

### Current state (broken)

Migration's `mapSales()` returns an array of sale objects. Each sale has:

```javascript
{
  id: "220000037524",
  transactions: [                    // EMBEDDED payment objects - WRONG
    { id: "...", method: "card", amountCaptured: 2130, ... },
    { id: "...", method: "cash", amountCaptured: 500, ... },
  ],
  // transactionIDs: NOT SET
  // customerID: NOT SET
}
```

### Target state (correct)

After fix, `mapSales()` returns `{ sales, transactions }`. Each sale has:

```javascript
{
  id: "220000037524",
  transactionIDs: ["txn_id_1", "txn_id_2"],   // ID references only
  customerID: "200000001409",                   // Resolved customer ID
  // NO embedded transactions array
}
```

And the transaction objects are written separately to `transactions/{id}` in Firestore.

---

## Files to Change

### File 1: `src/lightspeed_import.js`

**Function: `mapSales()`** (lines 644-828)

#### Change 1A: Collect transactions separately

Current code (line 801):
```javascript
const mappedSale = {
  // ...
  transactions: payments,    // embedded payment objects
  // ...
};
```

Change to:
```javascript
const mappedSale = {
  // ...
  transactionIDs: payments.map(p => p.id),   // ID references only
  // ...
};

// Collect transaction objects separately
allTransactions.push(...payments);
```

Add `const allTransactions = [];` at the top of the function (after line 676, near `const sales = [];`).

#### Change 1B: Add `customerID` to mapped sale

Current code (lines 788-808) - the sale object has no `customerID`.

Add `customerID: resolvedCustID` to the mapped sale object. `resolvedCustID` is already computed at line 710-712.

#### Change 1C: Add SALE_PROTO fields for completeness

Add these fields to the mapped sale to match SALE_PROTO shape:
- `pendingTransactionIDs: []`
- `pendingRefundIDs: []`
- `creditsApplied: []`

These are empty for migrated sales but their presence prevents undefined-access bugs.

#### Change 1D: Change return value

Current (line 827):
```javascript
return sales;
```

Change to:
```javascript
return { sales, transactions: allTransactions };
```

#### Change 1E: Ensure transaction objects have `refunds: []`

The payment objects built at lines 755-781 don't include `refunds: []`. Add it so they match TRANSACTION_PROTO. This field is needed by the refund modal.

---

### File 2: `src/screens/screen_components/Items_Screen/dashboard_screen/Dashboard_Admin.js`

#### Change 2A: Update `loadAndCacheLightspeedData()` to handle new return shape

**Location:** lines 5878-5910

Current code (around line 5905):
```javascript
const sales = mapSales(salesText, spText, stripeText, workorderMap, customerMap, customerRedirectMap);
```

Change to destructure:
```javascript
const { sales, transactions } = mapSales(salesText, spText, stripeText, workorderMap, customerMap, customerRedirectMap);
```

Update the cached/returned object to include `transactions`:
```javascript
_lsCsvData = { customers, customerMap, customerRedirectMap, workorders, sales, transactions, itemsText };
return _lsCsvData;
```

#### Change 2B: Add `"transactions"` to collection clear step

**Location:** lines 6173-6181

Current:
```javascript
await Promise.all([
  dbClearCollection("open-workorders"),
  dbClearCollection("completed-workorders"),
  dbClearCollection("customers"),
  dbClearCollection("completed-sales"),
  dbClearCollection("active-sales"),
  dbClearCollection("inventory"),
  dbClearCollection("punches"),
]);
```

Add:
```javascript
  dbClearCollection("transactions"),
```

#### Change 2C: Batch-write transactions collection

**Location:** After the sales batch-write block (after line ~6289)

Add a new step:
```javascript
// Save transactions
_setMigrationStep("Saving transactions...");
_setMigrationProgress({ done: 0, total: freshData.transactions.length });
await dbBatchWrite(freshData.transactions, "transactions", (done) => {
  _setMigrationProgress({ done, total: freshData.transactions.length });
});
```

#### Change 2D: Update final summary

The summary at the end of `handleFullMigration()` should include the transaction count.

---

## Detailed Object Shape Reference

### SALE_PROTO (what the app expects on a sale)
```javascript
{
  id: "",
  millis: "",
  workorderIDs: [],
  transactionIDs: [],          // Array of transaction document IDs
  pendingTransactionIDs: [],
  pendingRefundIDs: [],
  amountCaptured: 0,
  creditsApplied: [],
  subtotal: 0,
  discount: 0,
  salesTax: 0,
  salesTaxPercent: 0,
  total: 0,
}
```

### TRANSACTION_PROTO (what the app expects on a transaction)
```javascript
{
  id: "",
  method: "",              // "cash" | "card" | "check"
  millis: 0,
  amountCaptured: 0,
  amountTendered: 0,
  salesTax: 0,
  last4: "",
  expMonth: "",
  expYear: "",
  cardType: "",
  cardIssuer: "",
  paymentProcessor: "",
  paymentIntentID: "",
  chargeID: "",
  authorizationCode: "",
  networkTransactionID: "",
  receiptURL: "",
  refunds: [],
}
```

### Migration's current payment object (lines 755-781)
```javascript
{
  id: sp.salePaymentID || crypto.randomUUID(),
  saleID,                          // Extra - not in TRANSACTION_PROTO but useful
  type: "payment" | "refund",     // Extra - not in TRANSACTION_PROTO
  method: "cash" | "check" | "card",
  amountCaptured: amount,
  amountTendered: ...,
  salesTax: 0,
  cardType: ...,
  cardIssuer: ...,
  last4: ...,
  authorizationCode: ...,
  millis: ...,
  paymentProcessor: "Stripe" | "",
  chargeID: ...,
  paymentIntentID: ...,
  receiptURL: "",
  expMonth: "",
  expYear: "",
  networkTransactionID: "",
  amountRefunded: ...,            // Extra - Stripe refund amount
  depositType: "",                // Extra
  depositId: "",                  // Extra
  depositOriginalAmount: 0,       // Extra
  _cardFundingSource: ...,        // Extra - Stripe metadata
  _entryMode: ...,                // Extra - Stripe metadata
}
```

The extra fields (`saleID`, `type`, `amountRefunded`, `depositType`, `depositId`, `depositOriginalAmount`, `_cardFundingSource`, `_entryMode`) are harmless. Firestore stores them fine, and app code that reads via TRANSACTION_PROTO shape just ignores unknown fields. Keep them - they're useful metadata for migrated data.

The one field to ADD is `refunds: []` (present in TRANSACTION_PROTO, missing from migration's payment objects).

---

## Screens That Will Start Working After This Fix

| Screen | File | What it reads |
|--------|------|---------------|
| Closed Workorder Modal | `ClosedWorkorderModal.js:285` | `sale.transactionIDs` -> `readTransactions()` |
| Customer Info Modal | `CustomerInfoModalScreen.js:206` | `sale.transactionIDs` -> `readTransactions()` |
| Full Sale Modal | `FullSaleModal.js:104` | `sale.transactionIDs` -> `readTransactions()` |
| New Refund Modal | `NewRefundModalScreen.js:213` | `sale.transactionIDs` -> `readTransactions()` |
| New Checkout (reopen) | `NewCheckoutModalScreen.js:348,470` | `sale.transactionIDs` -> `readTransactions()` |
| Sales Reports | `SalesReports.js:206` | Groups from `transactions/` collection by `tx.saleID` |
| Database Viewer | `DatabaseViewerScreen.js` | Subscribes to `transactions/` collection |

---

## Implementation Order

1. Edit `mapSales()` in `lightspeed_import.js` (Changes 1A-1E)
2. Edit `loadAndCacheLightspeedData()` in `Dashboard_Admin.js` (Change 2A)
3. Edit `handleFullMigration()` in `Dashboard_Admin.js` (Changes 2B-2D)
4. Test: Run full migration, verify transactions collection is populated
5. Test: Open a completed workorder - payment details should appear
6. Test: Open Sales Reports - transactions should group by sale

---

## Notes

- The `_import_sales.csv` test export in `/public/lightspeed/test/` also uses the old embedded `transactions` format. If the dev export function is updated too, it should export `transactionIDs` + separate transaction rows. This is a lower priority follow-up.
- Migrated refund payments are stored as separate transaction objects with `type: "refund"` and negative `amountCaptured`. The new checkout system stores refunds as entries in `transaction.refunds[]` on the original transaction. This shape difference won't break anything (the sale-level `amountRefunded` is correct), but the refund modal's per-transaction refund tracking will look different for migrated sales. This is acceptable for historical data.
- The `dbClearCollection("transactions")` call requires that `dbClearCollection` supports the `"transactions"` collection name. It uses the same pattern as other collections - reads all docs, deletes in batches. Verify it works or check if it needs the full `DB_NODES.FIRESTORE.TRANSACTIONS` constant.
