import { cloneDeep } from "lodash";
import {
  generateEAN13Barcode,
  calculateRunningTotals,
  formatCurrencyDisp,
  findTemplateByType,
  log,
} from "../../../../utils";
import { dbSendSMS, dbSendEmail, dbUploadPDFAndSendSMS } from "../../../../db_calls_wrapper";
import { generatePrefixedEAN13 } from "../../../../utils";
import { build_db_path } from "../../../../constants";
import { useLoginStore, useSettingsStore } from "../../../../stores";
import { printBuilder } from "../../../../utils";
import {
  SALE_PROTO,
  TRANSACTION_PROTO,
  REFUND_PROTO,
} from "../../../../data";
import { dlog, DCAT } from "./checkoutDebugLog";

// ─── Sale ID ──────────────────────────────────────────────────
// Sale IDs are 12-digit barcodes starting with "3".
// Prefix "2" is reserved for Lightspeed legacy barcodes (sales + workorders).

export function isSaleID(id) {
  return typeof id === "string" && id.length === 12 && /^\d{12}$/.test(id) && id.startsWith("3");
}

export function isLightspeedID(id) {
  return typeof id === "string" && id.length === 12 && /^\d{12}$/.test(id) && id.startsWith("2");
}

// ─── New Sale Object ──────────────────────────────────────────
// Extends SALE_PROTO with fields needed by the new checkout system.

export function createNewSale(settings, createdBy = "", id = null) {
  let sale = cloneDeep(SALE_PROTO);
  sale.id = id || generateEAN13Barcode();
  sale.millis = Date.now();
  sale.salesTaxPercent = settings?.salesTaxPercent || 0;
  sale.cardFee = 0;
  sale.cardFeePercent = settings?.useCardFee ? settings.cardFeePercent || 0 : 0;
  sale.customerID = "";
  sale.createdBy = createdBy;
  return sale;
}

// ─── Totals Calculation ───────────────────────────────────────
// Calculates subtotal, discount, tax, card fee, and grand total
// for an array of combined workorders.

export function calculateSaleTotals(combinedWorkorders, settings) {
  let allWorkorders = cloneDeep(combinedWorkorders || []);

  if (allWorkorders.length === 0) {
    return {
      subtotal: 0,
      discount: 0,
      discountedTotal: 0,
      tax: 0,
      cardFee: 0,
      total: 0,
    };
  }

  // Check if ALL workorders are taxFree
  let hasTaxFree = allWorkorders.some((wo) => wo.taxFree === true);
  let allTaxFree = allWorkorders.every((wo) => wo.taxFree === true);

  // Calculate base totals — pass 0 tax to calculateRunningTotals
  // so we can handle tax ourselves per-workorder.
  let totalSubtotal = 0;
  let taxFreeTotal = 0;
  let taxableTotal = 0;
  let totalDiscount = 0;
  let totalQty = 0;

  allWorkorders.forEach((wo) => {
    let result = calculateRunningTotals(wo, 0);
    totalSubtotal += result.runningSubtotal;
    totalDiscount += result.runningDiscount;
    totalQty += result.runningQty;

    if (wo.taxFree) {
      taxFreeTotal += result.runningTotal;
    } else {
      taxableTotal += result.runningTotal;
    }
  });

  let discountedTotal = taxFreeTotal + taxableTotal;
  let salesTaxPercent = settings?.salesTaxPercent || 0;
  let tax = Math.round(taxableTotal * (salesTaxPercent / 100));

  let totalBeforeCardFee = discountedTotal + tax;

  // Card fee: applied to the total if useCardFee is enabled
  let cardFee = 0;
  if (settings?.useCardFee && settings?.cardFeePercent > 0) {
    cardFee = Math.round(totalBeforeCardFee * (settings.cardFeePercent / 100));
  }

  let grandTotal = totalBeforeCardFee + cardFee;

  return {
    subtotal: Math.round(totalSubtotal),
    discount: Math.round(totalDiscount),
    discountedTotal: Math.round(discountedTotal),
    salesTax: tax,
    cardFee,
    cardFeePercent: settings?.useCardFee ? settings.cardFeePercent : 0,
    salesTaxPercent,
    total: Math.round(grandTotal),
    qty: totalQty,
  };
}

// ─── Update Sale With Totals ──────────────────────────────────
// Takes a sale object and recalculates all total fields in-place.

export function updateSaleWithTotals(sale, combinedWorkorders, settings) {
  let updated = cloneDeep(sale);
  let totals = calculateSaleTotals(combinedWorkorders, settings);

  updated.subtotal = totals.subtotal;
  updated.discount = totals.discount > 0 ? totals.discount : null;
  updated.salesTax = totals.salesTax;
  updated.cardFee = totals.cardFee;
  updated.cardFeePercent = totals.cardFeePercent;
  updated.salesTaxPercent = totals.salesTaxPercent;
  updated.total = totals.total;

  return updated;
}

// ─── Credit/Deposit Helpers ─────────────────────────────────

export function getAllAppliedCredits(sale, customer) {
  let raw = [...(sale?.creditsApplied || []), ...(sale?.depositsApplied || [])];
  if (!customer) return raw;
  let custCredits = customer.credits || [];
  let custDeposits = customer.deposits || [];
  return raw.map((c) => {
    if (c._method) return c; // already hydrated
    let isCredit = c.type === "credit";
    let source = isCredit
      ? custCredits.find((d) => d.id === c.id)
      : custDeposits.find((d) => d.id === c.id);
    if (!source) return c;
    return {
      ...c,
      _originalAmount: source.amountCents || 0,
      _note: isCredit ? (source.text || "") : (source.note || ""),
      _last4: source.last4 || "",
      _method: source.method || "cash",
      _millis: source.millis || 0,
      _depositSaleID: source.saleID || "",
    };
  });
}

// ─── Recompute Sale Amounts ──────────────────────────────────
// Call after any mutation to transactions or credits.
// Derives amountCaptured (true net) and paymentComplete from transactions.
// transactions = array of real payment objects (cash/card)
// credits = array of credit application objects (creditsApplied + depositsApplied)

export function recomputeSaleAmounts(sale, transactions, credits) {
  let txns = transactions || [];
  let creds = credits || getAllAppliedCredits(sale);
  let txnTotal = txns.reduce((sum, t) => sum + (t.amountCaptured || 0), 0);
  let creditTotal = creds.reduce((sum, c) => sum + (c.amount || 0), 0);
  let creditRefundedTotal = (sale?.creditsApplied || []).reduce((sum, c) =>
    sum + (c.refunds || []).reduce((s, r) => s + (r.amount || 0), 0), 0
  );
  let totalRefunded = txns.reduce((sum, t) =>
    sum + (t.refunds || []).reduce((s, r) => s + (r.amount || 0), 0), 0
  );
  sale.amountCaptured = txnTotal + (creditTotal - creditRefundedTotal) - totalRefunded;
  sale.paymentComplete = sale.amountCaptured >= (sale.total || 0) && (sale.total || 0) > 0;
  return sale;
}

// ─── Build Payment Object ─────────────────────────────────────

export function buildCashTransaction(amountCaptured, amountTendered, isCheck, id = null) {
  let transaction = cloneDeep(TRANSACTION_PROTO);
  transaction.id = id || generatePrefixedEAN13("3");
  transaction.method = isCheck ? "check" : "cash";
  transaction.amountCaptured = amountCaptured;
  transaction.amountTendered = amountTendered;
  transaction.millis = Date.now();
  transaction.paymentProcessor = isCheck ? "check" : "cash";
  return transaction;
}

export function buildCardTransaction(stripeChargeData, transactionID) {
  let transaction = cloneDeep(TRANSACTION_PROTO);
  let card = stripeChargeData?.payment_method_details?.card_present;

  transaction.id = transactionID || generatePrefixedEAN13("3");
  transaction.method = "card";
  transaction.amountCaptured = stripeChargeData.amount_captured || 0;
  transaction.cardIssuer = card?.receipt?.application_preferred_name || "Unknown";
  transaction.cardType = card?.description || "";
  transaction.millis = Date.now();
  transaction.authorizationCode = card?.receipt?.authorization_code || "";
  transaction.paymentIntentID = stripeChargeData.payment_intent || "";
  transaction.chargeID = stripeChargeData.id || "";
  transaction.paymentProcessor = "stripe";
  transaction.receiptURL = stripeChargeData.receipt_url || "";
  transaction.last4 = card?.last4 || "";
  transaction.expMonth = card?.exp_month || "";
  transaction.expYear = card?.exp_year || "";
  transaction.networkTransactionID = card?.network_transaction_id || "";

  return transaction;
}

/**
 * Build a TRANSACTION_PROTO from the Terminal JS SDK's processPayment() result.
 * processPayment() returns a Stripe.PaymentIntent with charges expanded.
 * The charge is at paymentIntent.charges.data[0], and the card data is at
 * charge.payment_method_details.card_present — same nested structure as the
 * webhook-provided charge.
 */
export function buildCardTransactionFromSDK(paymentIntent, transactionID) {
  let transaction = cloneDeep(TRANSACTION_PROTO);

  // The PI from processPayment() includes charges expanded
  let charge = paymentIntent?.charges?.data?.[0] || null;
  let card = null;

  // If charge is an expanded object (not just an ID string)
  if (charge && typeof charge === "object") {
    card = charge.payment_method_details?.card_present;
    transaction.chargeID = charge.id || "";
    transaction.receiptURL = charge.receipt_url || "";
    transaction.amountCaptured = charge.amount_captured || paymentIntent.amount_received || paymentIntent.amount || 0;
  } else {
    // Charge not expanded — use PI-level data, webhook safety net fills in the rest
    transaction.chargeID = typeof charge === "string" ? charge : (typeof paymentIntent?.latest_charge === "string" ? paymentIntent.latest_charge : "");
    transaction.amountCaptured = paymentIntent?.amount_received || paymentIntent?.amount || 0;
  }

  transaction.id = transactionID || generatePrefixedEAN13("3");
  transaction.method = "card";
  transaction.millis = Date.now();
  transaction.paymentIntentID = paymentIntent?.id || "";
  transaction.paymentProcessor = "stripe";

  if (card) {
    transaction.last4 = card.last4 || "";
    transaction.expMonth = card.exp_month || "";
    transaction.expYear = card.exp_year || "";
    transaction.cardType = card.description || "";
    transaction.cardIssuer = card.receipt?.application_preferred_name || "Unknown";
    transaction.authorizationCode = card.receipt?.authorization_code || "";
    transaction.networkTransactionID = card.network_transaction_id || "";
  }

  return transaction;
}

export function buildManualCardTransaction(chargeData, transactionID) {
  let transaction = cloneDeep(TRANSACTION_PROTO);
  let card = chargeData?.payment_method_details?.card;

  transaction.id = transactionID || generatePrefixedEAN13("3");
  transaction.method = "card";
  transaction.amountCaptured = chargeData.amount_captured || 0;
  transaction.cardIssuer = card?.brand || "Unknown";
  transaction.cardType = card?.brand || "";
  transaction.millis = Date.now();
  transaction.paymentIntentID = chargeData.payment_intent || "";
  transaction.chargeID = chargeData.id || "";
  transaction.paymentProcessor = "stripe";
  transaction.receiptURL = chargeData.receipt_url || "";
  transaction.last4 = card?.last4 || "";
  transaction.expMonth = card?.exp_month || "";
  transaction.expYear = card?.exp_year || "";

  return transaction;
}

// ─── Refund Validation ────────────────────────────────────────

export function calculateRefundLimits(originalSale, settings, transactions) {
  if (!originalSale) return { maxRefund: 0, previouslyRefunded: 0 };

  let txns = transactions || [];
  let totalPreviouslyRefunded = txns.reduce((sum, t) =>
    sum + (t.refunds || []).reduce((s, r) => s + (r.amount || 0), 0), 0
  );

  let totalCaptured = txns.reduce((sum, t) => sum + (t.amountCaptured || 0), 0);
  let depositTotal = (originalSale?.depositsApplied || []).reduce((sum, d) => sum + (d.amount || 0), 0);
  let maxRefund = totalCaptured + depositTotal - totalPreviouslyRefunded;
  if (maxRefund < 0) maxRefund = 0;

  // If cardFeeRefund is false, subtract the card fee from the max refund
  let cardFeeDeduction = 0;
  if (!settings?.cardFeeRefund && originalSale.cardFee > 0) {
    cardFeeDeduction = originalSale.cardFee;
    maxRefund = maxRefund - cardFeeDeduction;
    if (maxRefund < 0) maxRefund = 0;
  }

  return {
    maxRefund,
    previouslyRefunded: totalPreviouslyRefunded,
    cardFeeDeduction: !settings?.cardFeeRefund ? cardFeeDeduction : 0,
    originalTotal: originalSale.total,
  };
}

export function validateRefundAmount(requestedAmount, maxRefundAllowed) {
  if (requestedAmount <= 0) {
    return { valid: false, message: "Refund amount must be greater than zero" };
  }
  if (requestedAmount > maxRefundAllowed) {
    return {
      valid: false,
      message: `Refund amount exceeds maximum allowed (${formatCurrencyDisp(maxRefundAllowed)})`,
    };
  }
  return { valid: true, message: "" };
}

export function validateCardRefundAmount(requestedAmount, payment) {
  if (!payment) {
    return { valid: false, message: "No card payment selected" };
  }
  let previouslyRefunded = (payment.refunds || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  let available = payment.amountCaptured - previouslyRefunded;
  if (requestedAmount < 50) {
    return { valid: false, message: "Minimum card refund is $0.50" };
  }
  if (requestedAmount > available) {
    return {
      valid: false,
      message: `Exceeds available balance on this card (${formatCurrencyDisp(available)})`,
    };
  }
  return { valid: true, message: "" };
}

// ─── Build Refund Object ──────────────────────────────────────

export function buildRefundObject(amount, transactionID, method, selectedLines, stripeRefundID, salesTax, notes) {
  let refund = cloneDeep(REFUND_PROTO);
  refund.id = generateEAN13Barcode();
  refund.transactionID = transactionID || "";
  refund.amount = amount;
  refund.method = method || "";
  refund.millis = Date.now();
  refund.salesTax = salesTax || 0;
  refund.stripeRefundID = stripeRefundID || "";
  refund.workorderLines = selectedLines || [];
  refund.notes = notes || "";
  return refund;
}

// ─── Get Previously Refunded Line IDs ─────────────────────────

export function getPreviouslyRefundedLineIDs(sale, transactions) {
  let txns = transactions || [];
  let refundedIDs = [];
  txns.forEach((t) => {
    (t.refunds || []).forEach((refund) => {
      if (refund.workorderLines) {
        refund.workorderLines.forEach((line) => {
          refundedIDs.push(line.id);
        });
      }
    });
  });
  return refundedIDs;
}

// ─── Split Workorder Lines to Single Qty ──────────────────────
// For refund item selection, we split multi-qty items into
// individual items so the user can select partial quantities.

export function splitWorkorderLinesToSingleQty(workorders) {
  if (!workorders) return [];
  return workorders.map((wo) => {
    let newWO = cloneDeep(wo);
    let singleLines = [];
    (wo.workorderLines || []).forEach((line) => {
      for (let i = 0; i < (line.qty || 1); i++) {
        singleLines.push({
          ...cloneDeep(line),
          qty: 1,
          _originalLineId: line.id,
          id: line.id + "_" + i,
        });
      }
    });
    newWO.workorderLines = singleLines;
    return newWO;
  });
}

// ─── Send sale receipt via SMS/email ──────────────────────────
function applyVars(template, vars) {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp("\\{" + key + "\\}", "g"), val || "");
  }
  return result;
}

export async function sendSaleReceipt(sale, customer, workorder, settings, smsTemplate, emailTemplate, translatedReceipt, translatedPdfLabels, langCode, transactions, credits) {
  dlog(DCAT.RECEIPT, "sendSaleReceipt_start", "CheckoutUtils", { saleId: sale?.id, hasCustomer: !!customer, hasSmsTemplate: !!smsTemplate, hasEmailTemplate: !!emailTemplate });
  if (!sale || !settings) return;
  const { tenantID, storeID } = useSettingsStore.getState().getSettings();

  const firstName = customer?.first || "Customer";
  const storeName = settings?.storeInfo?.displayName || "our store";
  const total = formatCurrencyDisp(sale.total, true);

  // Generate PDF receipt and upload to Cloud Storage
  let receiptURL = "";
  try {
    let base64;
    if (translatedReceipt && translatedPdfLabels) {
      // Use pre-translated receipt data and labels for Spanish PDF
      const { generateSaleReceiptPDF } = await import("../../../../pdfGenerator");
      base64 = generateSaleReceiptPDF(translatedReceipt, translatedPdfLabels);
    } else {
      const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
      const receiptData = printBuilder.sale(sale, transactions || [], customer, workorder, settings?.salesTaxPercent, _ctx, credits);
      const { generateSaleReceiptPDF } = await import("../../../../pdfGenerator");
      base64 = generateSaleReceiptPDF(receiptData);
    }
    const storagePath = build_db_path.cloudStorage.saleReceiptPDF(sale.id, tenantID, storeID);

    // SMS — upload PDF and send link in one call
    if (smsTemplate && settings.autoSMSSalesReceipt && customer?.customerCell) {
      const vars = { firstName, storeName, total, link: "{link}" };
      let msg = applyVars(smsTemplate.content || smsTemplate.message || "", vars);
      // Translate SMS message if non-English language
      if (langCode && msg) {
        try {
          const { translateText } = await import("../../../../db_calls");
          const result = await translateText({ text: msg, targetLanguage: langCode });
          if (result?.data?.translatedText) msg = result.data.translatedText;
        } catch (e) {
          log("SMS translation failed, sending in English:", e);
        }
      }
      const result = await dbUploadPDFAndSendSMS({
        base64,
        storagePath,
        message: msg,
        phoneNumber: customer.customerCell,
        customerID: customer.id || "",
        messageID: crypto.randomUUID(),
      });
      if (result?.data?.url) receiptURL = result.data.url;
      dlog(DCAT.RECEIPT, "sendSaleReceipt_sms_sent", "CheckoutUtils", { saleId: sale?.id });
      log("Sent sale receipt SMS to", customer.customerCell);
    } else {
      // No SMS but still upload PDF for email link
      const { uploadStringToStorage } = await import("../../../../db_calls");
      const uploadResult = await uploadStringToStorage(base64, storagePath, "base64");
      if (uploadResult?.downloadURL) receiptURL = uploadResult.downloadURL;
    }
  } catch (e) {
    dlog(DCAT.RECEIPT, "sendSaleReceipt_error", "CheckoutUtils", { message: e?.message });
    log("Error generating/uploading sale receipt PDF:", e);
  }

  // Email
  if (emailTemplate && settings.autoEmailSalesReceipt && customer?.email) {
    const vars = { firstName, storeName, total, link: receiptURL };
    let subject = applyVars(emailTemplate.subject || "", vars);
    const receiptLink = receiptURL
      ? "<p style='margin:24px 0'><a href='" + receiptURL + "' style='display:inline-block;padding:12px 24px;background-color:#4CAF50;color:white;text-decoration:none;border-radius:6px;font-size:14px'>View Receipt</a></p>"
      : "";
    let html = applyVars(emailTemplate.content || emailTemplate.body || "", { ...vars, receiptLink });
    // Translate email if non-English language
    if (langCode) {
      try {
        const { translateText } = await import("../../../../db_calls");
        const [subjectResult, bodyResult] = await Promise.all([
          translateText({ text: subject, targetLanguage: langCode }),
          translateText({ text: html, targetLanguage: langCode }),
        ]);
        if (subjectResult?.data?.translatedText) subject = subjectResult.data.translatedText;
        if (bodyResult?.data?.translatedText) html = bodyResult.data.translatedText;
      } catch (e) {
        log("Email translation failed, sending in English:", e);
      }
    }
    dbSendEmail(customer.email, subject, html);
    dlog(DCAT.RECEIPT, "sendSaleReceipt_email_sent", "CheckoutUtils", { saleId: sale?.id });
    log("Sent sale receipt email to", customer.email);
  }
}

// ─── Send Refund Receipt (SMS + Email) ────────────────────────

export async function sendRefundReceipt(refundReceiptData, customer, settings, smsTemplate, emailTemplate) {
  dlog(DCAT.RECEIPT, "sendRefundReceipt_start", "CheckoutUtils", { hasCustomer: !!customer });
  if (!refundReceiptData || !settings) return;
  const { tenantID, storeID } = useSettingsStore.getState().getSettings();

  const firstName = customer?.first || "Customer";
  const storeName = settings?.storeInfo?.displayName || "our store";
  const total = formatCurrencyDisp(refundReceiptData.refundAmount || 0, true);

  let receiptURL = "";
  try {
    const { generateRefundReceiptPDF } = await import("../../../../pdfGenerator");
    let base64 = generateRefundReceiptPDF(refundReceiptData);
    const storagePath = build_db_path.cloudStorage.saleReceiptPDF(refundReceiptData.id, tenantID, storeID);

    // SMS — upload PDF and send link
    if (smsTemplate && settings.autoSMSSalesReceipt && customer?.customerCell) {
      const vars = { firstName, storeName, total, link: "{link}" };
      let msg = applyVars(smsTemplate.content || smsTemplate.message || "", vars);
      const result = await dbUploadPDFAndSendSMS({
        base64,
        storagePath,
        message: msg,
        phoneNumber: customer.customerCell,
        customerID: customer.id || "",
        messageID: crypto.randomUUID(),
      });
      if (result?.data?.url) receiptURL = result.data.url;
      log("Sent refund receipt SMS to", customer.customerCell);
    } else {
      // No SMS — still upload PDF for email link
      const { uploadStringToStorage } = await import("../../../../db_calls");
      const uploadResult = await uploadStringToStorage(base64, storagePath, "base64");
      if (uploadResult?.downloadURL) receiptURL = uploadResult.downloadURL;
    }
  } catch (e) {
    dlog(DCAT.RECEIPT, "sendRefundReceipt_error", "CheckoutUtils", { message: e?.message });
    log("Error generating/uploading refund receipt PDF:", e);
  }

  // Email
  if (emailTemplate && settings.autoEmailSalesReceipt && customer?.email) {
    const vars = { firstName, storeName, total, link: receiptURL };
    let subject = applyVars(emailTemplate.subject || "", vars);
    const receiptLink = receiptURL
      ? "<p style='margin:24px 0'><a href='" + receiptURL + "' style='display:inline-block;padding:12px 24px;background-color:#e53e3e;color:white;text-decoration:none;border-radius:6px;font-size:14px'>View Refund Receipt</a></p>"
      : "";
    let html = applyVars(emailTemplate.content || emailTemplate.body || "", { ...vars, receiptLink });
    dbSendEmail(customer.email, subject, html);
    log("Sent refund receipt email to", customer.email);
  }
  dlog(DCAT.RECEIPT, "sendRefundReceipt_complete", "CheckoutUtils", {});
}

// ─── Send Credit Receipt (SMS + Email) ───────────────────────

export async function sendCreditReceipt(creditObj, customer, settings, sendSMS, sendEmail) {
  if (!creditObj || !settings) return;
  const { tenantID, storeID } = useSettingsStore.getState().getSettings();

  const firstName = customer?.first || "Customer";
  const storeName = settings?.storeInfo?.displayName || "our store";
  const amount = formatCurrencyDisp(creditObj.amountCents || 0, true);
  const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
  const receiptData = printBuilder.credit(creditObj, customer, _ctx);

  let receiptURL = "";
  try {
    const { generateCreditReceiptPDF } = await import("../../../../pdfGenerator");
    let base64 = generateCreditReceiptPDF(receiptData);
    const storagePath = build_db_path.cloudStorage.creditReceiptPDF(creditObj.id, tenantID, storeID);

    const smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "creditReceipt");
    if (sendSMS && customer?.customerCell && smsTemplate) {
      const vars = { firstName, storeName, amount, link: "{link}" };
      let msg = applyVars(smsTemplate.content || smsTemplate.message || "", vars);
      const result = await dbUploadPDFAndSendSMS({
        base64,
        storagePath,
        message: msg,
        phoneNumber: customer.customerCell,
        customerID: customer.id || "",
        messageID: crypto.randomUUID(),
      });
      if (result?.data?.url) receiptURL = result.data.url;
      log("Sent credit receipt SMS to", customer.customerCell);
    } else {
      const { uploadStringToStorage } = await import("../../../../db_calls");
      const uploadResult = await uploadStringToStorage(base64, storagePath, "base64");
      if (uploadResult?.downloadURL) receiptURL = uploadResult.downloadURL;
    }
  } catch (e) {
    log("Error generating/uploading credit receipt PDF:", e);
  }

  if (sendEmail && customer?.email) {
    const emailTemplate = findTemplateByType(settings?.emailTemplates, "creditReceipt");
    if (emailTemplate) {
      const vars = { firstName, storeName, amount, link: receiptURL };
      let subject = applyVars(emailTemplate.subject || "", vars);
      const receiptLink = receiptURL
        ? "<p style='margin:24px 0'><a href='" + receiptURL + "' style='display:inline-block;padding:12px 24px;background-color:#4CAF50;color:white;text-decoration:none;border-radius:6px;font-size:14px'>View Credit Receipt</a></p>"
        : "";
      let html = applyVars(emailTemplate.content || emailTemplate.body || "", { ...vars, receiptLink });
      dbSendEmail(customer.email, subject, html);
      log("Sent credit receipt email to", customer.email);
    }
  }
}

// ─── Send Gift Card Receipt (SMS + Email) ────────────────────

export async function sendGiftCardReceipt(giftcardObj, customer, settings, sendSMS, sendEmail) {
  if (!giftcardObj || !settings) return;
  const { tenantID, storeID } = useSettingsStore.getState().getSettings();

  const firstName = customer?.first || "Customer";
  const storeName = settings?.storeInfo?.displayName || "our store";
  const amount = formatCurrencyDisp(giftcardObj.amountCents || 0, true);
  const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
  const receiptData = printBuilder.giftcard(giftcardObj, customer, _ctx);

  let receiptURL = "";
  try {
    const { generateGiftCardReceiptPDF } = await import("../../../../pdfGenerator");
    let base64 = generateGiftCardReceiptPDF(receiptData);
    const storagePath = build_db_path.cloudStorage.giftCardReceiptPDF(giftcardObj.id, tenantID, storeID);

    const smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "giftCardReceipt");
    if (sendSMS && customer?.customerCell && smsTemplate) {
      const vars = { firstName, storeName, amount, link: "{link}" };
      let msg = applyVars(smsTemplate.content || smsTemplate.message || "", vars);
      const result = await dbUploadPDFAndSendSMS({
        base64,
        storagePath,
        message: msg,
        phoneNumber: customer.customerCell,
        customerID: customer.id || "",
        messageID: crypto.randomUUID(),
      });
      if (result?.data?.url) receiptURL = result.data.url;
      log("Sent gift card receipt SMS to", customer.customerCell);
    } else {
      const { uploadStringToStorage } = await import("../../../../db_calls");
      const uploadResult = await uploadStringToStorage(base64, storagePath, "base64");
      if (uploadResult?.downloadURL) receiptURL = uploadResult.downloadURL;
    }
  } catch (e) {
    log("Error generating/uploading gift card receipt PDF:", e);
  }

  if (sendEmail && customer?.email) {
    const emailTemplate = findTemplateByType(settings?.emailTemplates, "giftCardReceipt");
    if (emailTemplate) {
      const vars = { firstName, storeName, amount, link: receiptURL };
      let subject = applyVars(emailTemplate.subject || "", vars);
      const receiptLink = receiptURL
        ? "<p style='margin:24px 0'><a href='" + receiptURL + "' style='display:inline-block;padding:12px 24px;background-color:#4CAF50;color:white;text-decoration:none;border-radius:6px;font-size:14px'>View Gift Card Receipt</a></p>"
        : "";
      let html = applyVars(emailTemplate.content || emailTemplate.body || "", { ...vars, receiptLink });
      dbSendEmail(customer.email, subject, html);
      log("Sent gift card receipt email to", customer.email);
    }
  }
}
