/**
 * Shared labelPrintBuilder module — CommonJS format.
 * Used by the React frontend (via CRA webpack).
 * No React, Zustand, or Firebase dependencies.
 *
 * Builds structured print jobs for WarpHub. WarpHub handles ZPL generation.
 *   var printJob = labelPrintBuilder.label(templateId, item);
 *   dbSavePrintObj(printJob, printerID);
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

// ── Label print builder ──

var labelPrintBuilder = {
  /**
   * Generate a test print job to verify printer connectivity.
   * WarpHub uses the reserved "test-label" template to generate ZPL.
   * @returns {{ id: string, templateId: string, data: object, copies: number }}
   */
  test: function () {
    return {
      id: _generateSimpleID(),
      templateId: "test-label",
      labelWidth: 464,
      labelHeight: 254,
      data: {
        formalName: "Test Product",
        price: "$9.99",
        primaryBarcode: "TEST12345",
      },
      copies: 1,
    };
  },

  /**
   * Build a structured print job from a template ID + inventory item.
   * Returns { id, templateId, data, copies } ready for dbSavePrintObj().
   * WarpHub fetches the template, merges data, and generates ZPL.
   *
   * @param {string} templateId - Slug key of the label template (e.g. "standard-product")
   * @param {object} item       - Inventory item (formalName, id, price, salePrice, primaryBarcode)
   * @param {number} [copies]   - Number of copies (default 1)
   * @param {object} [template] - Template layout object { labelWidth, labelHeight, fields[] }
   * @returns {{ id: string, templateId: string, data: object, template: object, copies: number }}
   */
  label: function (templateId, item, copies, template) {
    var job = {
      id: _generateSimpleID(),
      templateId: templateId,
      data: {
        formalName: item.formalName || "",
        informalName: item.informalName || "",
        id: item.id || "",
        price: formatCentsAsCurrency(item.price),
        salePrice: formatCentsAsCurrency(item.salePrice),
        barcode: item.barcode || item.primaryBarcode || item.id || "",
      },
      copies: copies || 1,
    };
    if (template) {
      job.labelWidth = template.labelWidth;
      job.labelHeight = template.labelHeight;
      job.fields = template.fields;
    }
    return job;
  },
};

module.exports = {
  labelPrintBuilder: labelPrintBuilder,
};
