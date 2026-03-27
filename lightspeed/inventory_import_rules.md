# Inventory Import Rules

Rules for mapping `inventory.csv` to Warpspeed inventory items.

## ID Assignment
- Use `UPC` as the item ID if available
- Otherwise fall back to `System ID`

## Field Mapping
| inventory.csv Column | Warpspeed Field | Notes |
|---|---|---|
| Description | formalName | |
| Price | price | Strip `$` and `,`, convert to cents |
| Default Cost | cost | Strip `$` and `,`, convert to cents |
| UPC | upc | |
| EAN | ean | |
| Custom SKU | customSku | |
| Manufact. SKU | manufacturerSku | |

## Category Detection
- If description contains "labor" (case-insensitive) → category = "Labor"
- Otherwise → category = "Part"

## Custom Rules

- If description contains "Discontinued" (exact case) → discard completely (not imported, not skipped)
- If description contains "TUBE " (exact case, followed by a space):
  - If Default Cost > $6.00 → price = $18.78 (1878 cents) — totals $20.00 with 6.5% tax
  - Otherwise → price = $9.39 (939 cents) — totals $10.00 with 6.5% tax
- Price rounding (excludes TUBE items): calculate price + 6.5% tax. Round up to the next even dollar total. If already even, bump to the next even dollar. Work backwards to set the pre-tax price. Never decrease a price.
- If final price is not > 0 → skip the item (do not write to inventory). Instead, collect into a separate list, sort alphabetically by formalName, then download as CSV.
