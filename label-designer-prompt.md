# Label Designer & Print Sender for Zebra ZD410

Build a label designer GUI that lets users create label layouts and send raw ZPL print instructions to a remote WarpHub printer client via Firestore.

## Architecture

WarpHub is a dumb print client. It listens on a Firestore node for incoming documents. Each document must contain:

```json
{
  "zpl": "^XA...^XZ",
  "copies": 1
}
```

The `zpl` field is a raw ZPL string that WarpHub pipes directly to the Zebra ZD410 (203 DPI direct thermal label printer) via the Windows print spooler. WarpHub does zero parsing or layout. All rendering is done by the printer firmware from the ZPL you send.

**Firestore node path:** TODO — the path to the printer's `to_print` subcollection is not yet determined. Leave this as a configurable placeholder.

## GUI Requirements

### 1. Label Size Selector

Provide a dropdown/selector for common Zebra label sizes. Store both the display name and the dot dimensions (203 DPI = 8 dots/mm):

| Display Name | Width (dots) | Height (dots) |
|---|---|---|
| 2.25" x 1.25" | 464 | 254 |
| 2.25" x 0.75" | 464 | 152 |
| 2" x 1" | 406 | 203 |
| 1.25" x 1" | 254 | 203 |
| 3" x 1" | 609 | 203 |
| 3" x 2" | 609 | 406 |
| 4" x 6" | 812 | 1218 |
| 4" x 2" | 812 | 406 |

The label canvas/preview should resize to reflect the selected label dimensions, scaled for screen display and maintaining aspect ratio.

### 2. Field Palette

The user can add any of the following fields to the label layout. Each field represents a data property that will be populated at print time with real product data:

- `formalName` — product display name
- `id` — internal product ID
- `brand` — brand/manufacturer
- `price` — retail price
- `salePrice` — discounted price
- `primaryBarcode` — barcode value (rendered as Code 128 barcode in ZPL using `^BC`)

Provide a list/palette of these fields. The user clicks or drags a field to add it to the label canvas. Each field can only be added once. Disable/grey it out in the palette after adding, re-enable if removed from the canvas.

### 3. Label Canvas / Preview

Display a visual preview of the label at the selected size. Fields appear as positioned text blocks on the canvas showing the field name as placeholder text (e.g., "formalName", "price").

Each field on the canvas must be individually selectable. The selected field shows a visible highlight/border.

### 4. Field Positioning — Arrow Keys

When a field is selected on the canvas, the arrow keys reposition it:

- **Left/Right arrows** — move the field horizontally (adjust X position)
- **Up/Down arrows** — move the field vertically (adjust Y position)

Use a step size that feels responsive (e.g., 5 dots per keypress). Hold Shift for 1-dot fine adjustment.

### 5. Field Text Sizing and Style

Each selected text field must have font controls. Provide a per-field control panel (inline or sidebar) that appears when a field is selected:

- **Font size Up/Down** — increase or decrease the ZPL font height using +/- buttons or a key combo (e.g., Ctrl+Up / Ctrl+Down) to avoid conflicting with positioning arrows
- **Bold checkbox** — toggles bold for that field (implemented by making `fontWidth` larger than `fontHeight` in ZPL)

The preview should visually reflect size and style changes in real time.

`primaryBarcode` is special: instead of font controls, show barcode height and barcode module width controls, since it renders as a `^BC` Code 128 barcode, not text.

### 6. ZPL Generation

When the user clicks "Print" or "Send to Printer", generate the ZPL string from the current layout. The ZPL must be fully self-contained (`^XA` to `^XZ`).

ZPL reference for generation:

- `^XA` — start label
- `^PW{width}` — set print width
- `^LL{height}` — set label length
- `^FO{x},{y}` — field origin (position)
- `^A0N,{height},{width}` — default scalable font, N = normal rotation, height/width in dots. For bold, increase width relative to height.
- `^FD{data}^FS` — field data + field separator
- `^BY{moduleWidth}` — set barcode module width
- `^BCN,{height},Y,N,N` — Code 128 barcode, N = normal orientation, Y = print interpretation line
- `^XZ` — end label

Example generated ZPL for a 2.25" x 1.25" label with formalName and a barcode:

```
^XA
^PW464
^LL254
^FO30,20^A0N,35,35^FD{formalName}^FS
^FO30,80^BY2^BCN,60,Y,N,N^FD{primaryBarcode}^FS
^XZ
```

### 7. Print-Time Data Substitution

The generated ZPL is a template with `{fieldName}` placeholders. At print time, when the user triggers a print for a specific product, substitute the placeholders with actual product data. Then write the final ZPL string to the Firestore document:

```json
{
  "zpl": "^XA^PW464^LL254^FO30,20^A0N,35,35^FDWidget Pro Max^FS^FO30,80^BY2^BCN,60,Y,N,N^FD123456789012^FS^XZ",
  "copies": 1
}
```

### 8. Layout Save/Load

Allow saving label layouts (field positions, sizes, and styles — not the product data) so users can reuse them. Store as JSON either locally or in Firestore. The layout format:

```json
{
  "labelWidth": 464,
  "labelHeight": 254,
  "fields": [
    {
      "name": "formalName",
      "type": "text",
      "x": 30,
      "y": 20,
      "fontHeight": 35,
      "fontWidth": 35,
      "bold": false
    },
    {
      "name": "primaryBarcode",
      "type": "barcode",
      "x": 30,
      "y": 80,
      "barcodeHeight": 60,
      "moduleWidth": 2
    }
  ]
}
```

## Key Constraints

- **WarpHub is dumb.** It receives `{ zpl, copies }` and sends it raw to the printer. All layout logic, ZPL generation, and data substitution happens on your end before writing to Firestore.
- **ZPL is the source of truth.** The printer firmware renders everything. What you send is what prints. There is no driver-level formatting.
- **203 DPI.** All dot values assume 203 DPI (the ZD410 standard). 1mm = 8 dots. 1 inch = 203 dots.
- **Bold approximation.** The `^A0` scalable font supports bold by making `fontWidth` larger than `fontHeight` (e.g., `^A0N,30,42` for a bold effect at size 30).
