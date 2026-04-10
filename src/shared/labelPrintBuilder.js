/**
 * Shared labelPrintBuilder module — CommonJS format.
 * Used by the React frontend (via CRA webpack).
 * No React, Zustand, or Firebase dependencies.
 *
 * Follows the same pattern as printBuilder.js:
 *   var printObj = labelPrintBuilder.label(layout, item);
 *   dbSavePrintObj(printObj, printerID);
 */

// ── Formatting helper (self-contained, no imports) ──

function formatCentsAsCurrency(value) {
  var cents = typeof value === "string" ? Number(value) : value;
  if (!isFinite(cents)) return "";
  var amount = cents / 100;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Simple unique ID (no Firebase dependency) ──

function _generateSimpleID() {
  return "lbl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── ZPL generation ──

function generateZPLTemplate(labelSize, fields) {
  var lines = [];
  lines.push("^XA");
  lines.push("^PW" + labelSize.width);
  lines.push("^LL" + labelSize.height);

  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    if (field.type === "text") {
      var fontW = field.bold
        ? Math.round(field.fontHeight * 1.4)
        : field.fontWidth;
      lines.push(
        "^FO" + field.x + "," + field.y +
        "^A0N," + field.fontHeight + "," + fontW +
        "^FD{" + field.name + "}^FS"
      );
    } else if (field.type === "barcode") {
      lines.push(
        "^FO" + field.x + "," + field.y +
        "^BY" + field.moduleWidth +
        "^BCN," + field.barcodeHeight + ",Y,N,N" +
        "^FD{" + field.name + "}^FS"
      );
    }
  }

  lines.push("^XZ");
  return lines.join("\n");
}

function substituteZPLData(zplTemplate, item) {
  return zplTemplate
    .replace("{formalName}", item.formalName || "")
    .replace("{id}", item.id || "")
    .replace("{brand}", item.brand || "")
    .replace("{price}", formatCentsAsCurrency(item.price))
    .replace("{salePrice}", formatCentsAsCurrency(item.salePrice))
    .replace("{primaryBarcode}", item.primaryBarcode || item.id || "")
    .replace("{storeName}", item.storeName || "");
}

// ── Label print builder ──

var labelPrintBuilder = {
  /**
   * Build a label print object from a saved layout + inventory item.
   * Returns { id, zpl, copies } ready for dbSavePrintObj().
   *
   * @param {object} layout - Saved label layout { labelWidth, labelHeight, fields[] }
   * @param {object} item   - Inventory item (formalName, id, brand, price, salePrice, primaryBarcode)
   * @param {number} [copies] - Number of copies (default 1)
   * @returns {{ id: string, zpl: string, copies: number }}
   */
  label: function (layout, item, copies) {
    var labelSize = { width: layout.labelWidth, height: layout.labelHeight };
    var zplTemplate = generateZPLTemplate(labelSize, layout.fields);
    var finalZPL = substituteZPLData(zplTemplate, item);
    return {
      id: _generateSimpleID(),
      zpl: finalZPL,
      copies: copies || 1,
    };
  },
};

module.exports = {
  labelPrintBuilder: labelPrintBuilder,
  generateZPLTemplate: generateZPLTemplate,
  substituteZPLData: substituteZPLData,
};
