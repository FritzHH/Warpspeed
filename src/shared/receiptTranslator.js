/**
 * Receipt translation module.
 * Translates a sales receipt object + PDF labels to a target language
 * using the Google Translate API (batch call).
 *
 * ES module — frontend only (calls Cloud Function via db_calls).
 */

import { translateText } from "../db_calls";
import { printBuilder } from "./printBuilder";
import { DEFAULT_SALE_LABELS, generateSaleReceiptPDF } from "../pdfGenerator";

// ── Helpers ──

function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Collect all translatable strings from a sales receipt object.
 * Returns { keys: string[], values: string[] } where keys track origin
 * so translations can be mapped back.
 */
function collectTranslatableText(receipt) {
  var entries = [];

  // Blurbs
  if (receipt.thankYouBlurb) {
    entries.push({ key: "thankYouBlurb", value: receipt.thankYouBlurb });
  }

  // Line item text (skip itemName — inventory names stay in English)
  (receipt.workorderLines || []).forEach(function (line, i) {
    if (line.discountName) {
      entries.push({ key: "line_" + i + "_discountName", value: line.discountName });
    }
    if (line.receiptNotes) {
      entries.push({ key: "line_" + i + "_receiptNotes", value: line.receiptNotes });
    }
  });

  // Customer notes
  (receipt.customerNotes || []).forEach(function (note, i) {
    var text = typeof note === "string" ? note : note.value || note.text || note.note || "";
    if (text) {
      entries.push({ key: "custNote_" + i, value: text });
    }
  });

  return entries;
}

/**
 * Translate a built sales receipt to the target language.
 *
 * @param {object} receiptObj - Output of printBuilder.sale()
 * @param {string} [targetLanguage="es"] - ISO language code
 * @returns {Promise<{ translatedReceipt: object, pdfLabels: object }>}
 */
export async function translateSalesReceipt(receiptObj, targetLanguage) {
  if (!targetLanguage) targetLanguage = "es";

  // 1. Collect dynamic text from the receipt
  var dynamicEntries = collectTranslatableText(receiptObj);

  // 2. Collect all PDF label values
  var labelKeys = Object.keys(DEFAULT_SALE_LABELS);
  var labelValues = labelKeys.map(function (k) { return DEFAULT_SALE_LABELS[k]; });

  // 3. Build single batch array: [dynamic texts..., label texts...]
  var dynamicValues = dynamicEntries.map(function (e) { return e.value; });
  var allStrings = dynamicValues.concat(labelValues);

  // 4. Deduplicate to minimize API usage, but keep index mapping
  var uniqueStrings = [];
  var indexMap = []; // maps each position in allStrings to its index in uniqueStrings
  var seenMap = {}; // value -> index in uniqueStrings
  allStrings.forEach(function (str) {
    if (seenMap[str] !== undefined) {
      indexMap.push(seenMap[str]);
    } else {
      seenMap[str] = uniqueStrings.length;
      indexMap.push(uniqueStrings.length);
      uniqueStrings.push(str);
    }
  });

  // 5. Single batch API call
  var result = await translateText({
    text: uniqueStrings,
    targetLanguage: targetLanguage,
  });

  if (!result?.success || !result?.data?.data?.translatedText) {
    throw new Error("Translation API call failed");
  }

  var translatedUnique = result.data.data.translatedText;

  // 6. Map translations back using indexMap
  var translatedAll = indexMap.map(function (idx) { return translatedUnique[idx]; });

  // 7. Split back into dynamic + labels
  var translatedDynamic = translatedAll.slice(0, dynamicValues.length);
  var translatedLabelValues = translatedAll.slice(dynamicValues.length);

  // 8. Build translated receipt (clone original, overwrite text fields)
  var translatedReceipt = cloneDeep(receiptObj);
  translatedReceipt.language = targetLanguage;

  dynamicEntries.forEach(function (entry, i) {
    var translated = translatedDynamic[i];
    var key = entry.key;

    if (key === "thankYouBlurb") {
      translatedReceipt.thankYouBlurb = translated;
    } else if (key.startsWith("line_")) {
      var parts = key.split("_");
      var lineIdx = Number(parts[1]);
      var field = parts[2];
      if (translatedReceipt.workorderLines[lineIdx]) {
        translatedReceipt.workorderLines[lineIdx][field] = translated;
      }
    } else if (key.startsWith("custNote_")) {
      var noteIdx = Number(key.split("_")[1]);
      var originalNote = receiptObj.customerNotes[noteIdx];
      if (typeof originalNote === "string") {
        translatedReceipt.customerNotes[noteIdx] = translated;
      } else if (originalNote && typeof originalNote === "object") {
        var textField = originalNote.value ? "value" : originalNote.text ? "text" : "note";
        translatedReceipt.customerNotes[noteIdx][textField] = translated;
      }
    }
  });

  // 9. Build translated PDF labels object
  var pdfLabels = {};
  labelKeys.forEach(function (k, i) {
    pdfLabels[k] = translatedLabelValues[i];
  });

  return { translatedReceipt: translatedReceipt, pdfLabels: pdfLabels };
}

/**
 * Build a Spanish sales receipt: translated print server object + translated PDF.
 *
 * @param {object} sale - Sale object
 * @param {Array} payments - Payments array
 * @param {object} customer - Customer object
 * @param {object} workorder - Workorder object
 * @param {number} salesTaxPercent - Sales tax rate
 * @param {object} [context] - { currentUser, settings }
 * @returns {Promise<{ receipt: object, pdfBase64: string }>}
 */
export async function generateSpanishSalesReceipt(sale, payments, customer, workorder, salesTaxPercent, context) {
  // 1. Build English receipt
  var receipt = printBuilder.sale(sale, payments, customer, workorder, salesTaxPercent, context);

  // 2. Translate
  var translated = await translateSalesReceipt(receipt, "es");

  // 3. Generate Spanish PDF
  var pdfBase64 = generateSaleReceiptPDF(translated.translatedReceipt, translated.pdfLabels);

  return {
    receipt: translated.translatedReceipt,
    pdfBase64: pdfBase64,
  };
}
