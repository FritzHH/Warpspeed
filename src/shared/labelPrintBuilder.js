/**
 * Shared labelPrintBuilder module — CommonJS format.
 * Used by the React frontend (via CRA webpack).
 * No React, Zustand, or Firebase dependencies.
 *
 * V1: Builds structured print jobs for WarpHub. WarpHub handles ZPL generation.
 *   var printJob = labelPrintBuilder.label(templateId, item);
 *
 * V2: Generates ZPL directly. WarpHub just forwards raw ZPL to the printer.
 *   var printJob = labelPrintBuilder.zplLabel(templateId, item, copies, template);
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

var { generateLabelZpl } = require("./labelZplBuilder");

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
      copies: Number(copies) || 1,
    };
    if (template) {
      job.labelWidth = Number(template.labelWidth) || 0;
      job.labelHeight = Number(template.labelHeight) || 0;
      job.fields = template.fields;
    }
    return job;
  },

  /**
   * V2 — Build a print job with raw ZPL. WarpHub sends this directly to the printer.
   * @param {string} templateId - Slug key of the label template
   * @param {object} item       - Inventory item
   * @param {number} [copies]   - Number of copies (default 1)
   * @param {object} template   - Template layout { labelWidth, labelHeight, fields[] }
   * @returns {{ id: string, zpl: string, copies: number }}
   */
  zplLabel: function (templateId, item, copies, template) {
    if (!template || !template.fields) {
      console.warn("zplLabel: no template provided for", templateId);
      return { id: _generateSimpleID(), zpl: "", copies: 1 };
    }
    var data = {
      formalName: item.formalName || "",
      informalName: item.informalName || "",
      brand: item.brand || "",
      id: item.id || "",
      price: formatCentsAsCurrency(item.price),
      salePrice: formatCentsAsCurrency(item.salePrice),
      barcode: item.barcode || item.primaryBarcode || item.id || "",
      salePriceLabel: "Sale Price",
      regPriceLabel: "Reg. Price",
      storeDisplayName: item.storeDisplayName || "",
    };
    var zpl = generateLabelZpl(template, data);
    return {
      id: _generateSimpleID(),
      zpl: zpl,
      copies: Number(copies) || 1,
    };
  },

  /**
   * V2 — Generate a test print job with raw ZPL using placeholder data.
   * @param {object} template - Template layout { labelWidth, labelHeight, fields[] }
   * @returns {{ id: string, zpl: string, copies: number }}
   */
  zplTest: function (template) {
    if (!template || !template.fields) {
      console.warn("zplTest: no template provided");
      return { id: _generateSimpleID(), zpl: "", copies: 1 };
    }
    var testData = {
      formalName: "Tire Kenda Kwick Trax 700x35 Continental Gatorskin Folding",
      informalName: "Kwick Trax 700x35",
      brand: "Continental",
      id: "4827103956281",
      price: "$49.99",
      salePrice: "$39.99",
      barcode: "4827103956281",
      salePriceLabel: "Sale Price",
      regPriceLabel: "Reg. Price",
      storeDisplayName: "Bonita Bikes",
    };
    var zpl = generateLabelZpl(template, testData);
    return {
      id: _generateSimpleID(),
      zpl: zpl,
      copies: 1,
    };
  },
};

module.exports = {
  labelPrintBuilder: labelPrintBuilder,
};
