/**
 * Shared labelZplBuilder module — CommonJS format.
 * Generates ZPL (Zebra Programming Language) directly from label templates.
 * No React, Zustand, or Firebase dependencies.
 *
 *   var zpl = generateLabelZpl(template, data);
 */

// ── Canvas measurement (browser-only) ──

var _measureCanvas = null;
function _getMeasureCtx() {
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  return _measureCanvas.getContext("2d");
}

/**
 * Measure the pixel width of a single line of text using Arial font.
 * @param {string} text
 * @param {number} fontSize - in dots (same as ZPL)
 * @param {boolean} bold
 * @returns {number}
 */
function measureLineWidth(text, fontSize, bold) {
  var ctx = _getMeasureCtx();
  ctx.font = (bold ? "bold " : "") + fontSize + "px Arial";
  return ctx.measureText(text).width;
}

/**
 * Word-wrap text into lines that fit within fieldWidth pixels, using Arial font.
 * @param {string} text
 * @param {number} fieldWidth - pixel/dot width of the text box
 * @param {number} fontSize
 * @param {boolean} bold
 * @returns {string[]} array of line strings
 */
function measureTextLines(text, fieldWidth, fontSize, bold) {
  if (!text || typeof text !== "string") return [text || ""];
  var ctx = _getMeasureCtx();
  ctx.font = (bold ? "bold " : "") + fontSize + "px Arial";
  var words = text.split(" ");
  var lines = [];
  var currentLine = "";
  for (var i = 0; i < words.length; i++) {
    var testLine = currentLine ? currentLine + " " + words[i] : words[i];
    if (ctx.measureText(testLine).width > fieldWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Calculate the integer module width (1-10) for a Code 128 barcode.
 * Formula: actualWidth = moduleWidth * ((dataLength + 3) * 11 + 35)
 * The client enforces valid sizes via snapping, so fieldWidth / base should
 * always yield a clean integer. Clamping is a safety net.
 * @param {number} fieldWidth - pixel width (should be a valid snapped size)
 * @param {number} dataLength - number of characters in barcode data
 * @returns {number} integer module width clamped 1-10
 */
function calculateBarcodeModuleWidth(fieldWidth, dataLength) {
  var len = dataLength || 13;
  var base = (len + 3) * 11 + 35;
  var raw = fieldWidth / base;
  var m = Math.max(1, Math.min(10, Math.round(raw)));
  return m;
}

/**
 * Generate ZPL commands for a single text field.
 * Uses ^FO for position, ^A0N for font, ^FB for field block (wrapping + alignment), ^FD for data.
 */
function _buildTextFieldZpl(field, dataValue) {
  var x = Math.round(field.x) || 0;
  var y = Math.round(field.y) || 0;
  var width = Math.round(field.width) || 200;
  var height = Math.round(field.height) || 60;
  var fontSize = Math.round(field.fontSize) || 30;
  var bold = field.bold === true;
  var align = field.align || "center";

  var text = dataValue || "";

  // Wrap text
  var lines = measureTextLines(text, width, fontSize, bold);

  // Calculate max visible lines
  var maxLines = Math.max(1, Math.floor(height / fontSize));
  if (lines.length > maxLines) lines = lines.slice(0, maxLines);

  // Alignment: L=left, C=center, R=right, J=justified
  var alignMap = { left: "L", center: "C", right: "R" };
  var zplAlign = alignMap[align] || "C";

  // Bold: Zebra ^A0 doesn't have a bold toggle. Use slightly larger font to simulate.
  var zplFontSize = bold ? fontSize + 2 : fontSize;

  var zpl = "";
  zpl += "^FO" + x + "," + y;
  zpl += "^A0N," + zplFontSize + "," + zplFontSize;
  zpl += "^FB" + width + "," + maxLines + ",0," + zplAlign + ",0";
  zpl += "^FD" + lines.join("\\&") + "^FS\n";

  return zpl;
}

/**
 * Generate ZPL commands for a barcode field.
 * Uses Code 128 (^BC) with auto module width calculation.
 */
function _buildBarcodeFieldZpl(field, dataValue) {
  var x = Math.round(field.x) || 0;
  var y = Math.round(field.y) || 0;
  var width = Math.round(field.width) || 422;
  var height = Math.round(field.height) || 60;

  var barcodeData = dataValue || "";
  if (!barcodeData) return "";

  var moduleWidth = calculateBarcodeModuleWidth(width, barcodeData.length);

  var zpl = "";
  zpl += "^FO" + x + "," + y;
  zpl += "^BY" + moduleWidth;
  zpl += "^BCN," + height + ",Y,N,N";
  zpl += "^FD" + barcodeData + "^FS\n";

  return zpl;
}

/**
 * Generate a complete ZPL label string from a template and data object.
 *
 * @param {object} template - { labelWidth, labelHeight, fields: [{type, name, x, y, width, height, fontSize, bold, align}] }
 * @param {object} data     - { formalName, informalName, id, price, salePrice, barcode, brand, ... }
 * @returns {string} Complete ZPL string "^XA...^XZ"
 */
function generateLabelZpl(template, data) {
  var labelWidth = Number(template.labelWidth) || 464;
  var labelHeight = Number(template.labelHeight) || 254;
  var fields = template.fields || [];

  var zpl = "^XA\n";
  zpl += "^PW" + labelWidth + "\n";
  zpl += "^LL" + labelHeight + "\n";
  zpl += "^CI28\n"; // UTF-8

  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var value = data[field.name] || "";

    if (field.type === "barcode") {
      zpl += _buildBarcodeFieldZpl(field, value);
    } else {
      zpl += _buildTextFieldZpl(field, value);
    }
  }

  zpl += "^XZ";
  return zpl;
}

module.exports = {
  generateLabelZpl: generateLabelZpl,
  measureTextLines: measureTextLines,
  measureLineWidth: measureLineWidth,
  calculateBarcodeModuleWidth: calculateBarcodeModuleWidth,
};
