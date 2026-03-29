

## Populated Fields

| Field | Type | Value |
|---|---|---|
| `receiptType` | string | `"Refund"` |
| `id` | string | Refund EAN-13 barcode ID |
| `barcode` | string | Same as `id` |
| `shopName` | string | Store display name or "Bonita Bikes LLC" |
| `shopContactBlurb` | string | Store address/phone/email block |
| `thankYouBlurb` | string | Thank you message |
| `salesTaxPercent` | number | Tax rate (e.g. 7) |
| `taxFree` | boolean | Whether the workorder was tax-free |
| `customerFirstName` | string | Customer first name |
| `customerLastName` | string | Customer last name |
| `customerCell` | string | Customer phone number |
| `customerEmail` | string | Customer email |
| `customerContact` | string | Formatted phone or email (display-ready) |
| `startedBy` | string | User who processed the refund ("FirstName L.") |
| `refundAmount` | number (cents) | Total amount refunded |
| `refundType` | string | `"cash"` or `"card"` |
| `refundNotes` | string | Optional notes |
| `originalSaleID` | string | The sale this refund belongs to |
| `originalSaleTotal` | number (cents) | Original sale total |
| `cardRefundID` | string | Stripe refund ID (empty for cash) |
| `workorderLines` | array | Refunded line items (see below), or `[]` |
| `subtotal` | number (cents) | Item subtotal or refundAmount if no items |
| `discount` | number (cents) | Discount total or 0 |
| `tax` | number (cents) | Tax on refunded items or 0 |
| `total` | number (cents) | subtotal + tax, or refundAmount if no items |
| `transactionDateTime` | string | Formatted date/time of the refund |

---

## workorderLines[] — Each Item (when item-based refund)

| Field | Type | Value |
|---|---|---|
| `id` | string | Line item ID |
| `itemName` | string | Formal or informal item name |
| `price` | number (cents) | Original item price |
| `finalPrice` | number (cents) | Discounted price, or original if no discount |
| `discountName` | string or undefined | Discount label |
| `discountSavings` | number or undefined | Savings amount in cents |
| `qty` | number | Always 1 (items are split to single qty for refund) |
| `inventoryItem` | object | Full inventory item object |
| `discountObj` | object or null | Full discount object |

---

## Default/Empty Fields (inherited from RECEIPT_PROTO, not used for refunds)

| Field | Default |
|---|---|
| `workorderNumber` | `""` |
| `customerLandline` | `""` |
| `customerAddress` | `""` |
| `customerContactRestriction` | `""` |
| `dateTime` | `""` |
| `brand` | `""` |
| `color1` | `""` |
| `color2` | `""` |
| `description` | `""` |
| `partSource` | `""` |
| `partOrdered` | `""` |
| `waitTime` | `""` |
| `model` | `""` |
| `amountPaid` | `""` |
| `startedOnDate` | `""` |
| `finishedOnDate` | `""` |
| `status` | `""` |
| `labor` | `""` |
| `parts` | `""` |
| `popCashRegister` | `false` |
| `persistFlag` | `false` |
| `intakeBlurb` | `""` |
| `customerNotes` | `[]` |
| `internalNotes` | `[]` |
| `payments` | `[]` |
