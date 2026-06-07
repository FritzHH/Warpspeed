/**
 * Receipt translation module.
 * Translates a sales receipt object + PDF labels to a target language
 * using the Google Translate API (batch call).
 *
 * ES module — frontend only (calls Cloud Function via db_calls).
 */

import { translateText } from "../db_calls";
import { printBuilder } from "./printBuilder";
import { DEFAULT_SALE_LABELS } from "./receiptLabels";

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

  // Multi-workorder shape: collect from each workorders[].workorderLines + customerNotes
  var workordersArr = Array.isArray(receipt.workorders) ? receipt.workorders : [];
  if (workordersArr.length > 0) {
    workordersArr.forEach(function (wo, woIdx) {
      (wo.workorderLines || []).forEach(function (line, lineIdx) {
        if (line.discountName) {
          entries.push({ key: "wo_" + woIdx + "_line_" + lineIdx + "_discountName", value: line.discountName });
        }
        if (line.receiptNotes) {
          entries.push({ key: "wo_" + woIdx + "_line_" + lineIdx + "_receiptNotes", value: line.receiptNotes });
        }
      });
      (wo.customerNotes || []).forEach(function (note, noteIdx) {
        var text = typeof note === "string" ? note : note.value || note.text || note.note || "";
        if (text) {
          entries.push({ key: "wo_" + woIdx + "_custNote_" + noteIdx, value: text });
        }
      });
    });
    return entries;
  }

  // Legacy single-workorder shape: top-level workorderLines + customerNotes
  (receipt.workorderLines || []).forEach(function (line, i) {
    if (line.discountName) {
      entries.push({ key: "line_" + i + "_discountName", value: line.discountName });
    }
    if (line.receiptNotes) {
      entries.push({ key: "line_" + i + "_receiptNotes", value: line.receiptNotes });
    }
  });

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
export async function translateSalesReceipt(receiptObj, targetLanguage, opts) {
  if (!targetLanguage) targetLanguage = "es";
  if (!opts) opts = {};

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
    workorderID: opts.workorderID || "",
    saleID: opts.saleID || "",
    customerID: opts.customerID || "",
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
    } else if (key.startsWith("wo_")) {
      // Multi-workorder shape: keys are wo_<woIdx>_line_<lineIdx>_<field> or wo_<woIdx>_custNote_<noteIdx>
      var parts = key.split("_");
      var woIdx = Number(parts[1]);
      var wo = translatedReceipt.workorders && translatedReceipt.workorders[woIdx];
      if (!wo) return;
      if (parts[2] === "line") {
        var lineIdx = Number(parts[3]);
        var field = parts[4];
        if (wo.workorderLines && wo.workorderLines[lineIdx]) {
          wo.workorderLines[lineIdx][field] = translated;
        }
      } else if (parts[2] === "custNote") {
        var noteIdx = Number(parts[3]);
        var originalWO = receiptObj.workorders && receiptObj.workorders[woIdx];
        var originalNote = originalWO && originalWO.customerNotes && originalWO.customerNotes[noteIdx];
        if (typeof originalNote === "string") {
          wo.customerNotes[noteIdx] = translated;
        } else if (originalNote && typeof originalNote === "object") {
          var textField = originalNote.value ? "value" : originalNote.text ? "text" : "note";
          wo.customerNotes[noteIdx][textField] = translated;
        }
      }
    } else if (key.startsWith("line_")) {
      var parts2 = key.split("_");
      var lineIdx2 = Number(parts2[1]);
      var field2 = parts2[2];
      if (translatedReceipt.workorderLines[lineIdx2]) {
        translatedReceipt.workorderLines[lineIdx2][field2] = translated;
      }
    } else if (key.startsWith("custNote_")) {
      var noteIdx2 = Number(key.split("_")[1]);
      var originalNote2 = receiptObj.customerNotes[noteIdx2];
      if (typeof originalNote2 === "string") {
        translatedReceipt.customerNotes[noteIdx2] = translated;
      } else if (originalNote2 && typeof originalNote2 === "object") {
        var textField2 = originalNote2.value ? "value" : originalNote2.text ? "text" : "note";
        translatedReceipt.customerNotes[noteIdx2][textField2] = translated;
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

