import { cloneDeep } from "lodash";
import {
  generateUPCBarcode,
  calculateRunningTotals,
  formatCurrencyDisp,
} from "../../../../utils";
import {
  SALE_PROTO,
  PAYMENT_OBJECT_PROTO,
  REFUND_PROTO,
} from "../../../../data";

// ─── Sale ID ──────────────────────────────────────────────────
// Sale IDs start with "s" + 11 digits so scanners can distinguish
// them from workorder IDs (pure 12-digit numeric).

export function generateSaleID() {
  const base = generateUPCBarcode("sale"); // 12 digits starting with "2"
  return { id: "s" + base.substring(1), barcode: base };
}

export function isSaleID(id) {
  return (
    typeof id === "string" && id.length === 12 && id.startsWith("s")
  );
}

// ─── New Sale Object ──────────────────────────────────────────
// Extends SALE_PROTO with fields needed by the new checkout system.

export function createNewSale(settings, createdBy = "") {
  let sale = cloneDeep(SALE_PROTO);
  const { id, barcode } = generateSaleID();
  sale.id = id;
  sale.barcode = barcode;
  sale.millis = Date.now();
  sale.salesTaxPercent = settings?.salesTaxPercent || 0;
  sale.status = "active";
  sale.cardFee = 0;
  sale.cardFeePercent = settings?.useCardFee ? settings.cardFeePercent || 0 : 0;
  sale.addedItems = [];
  sale.customerID = "";
  sale.createdBy = createdBy;
  return sale;
}

// ─── Totals Calculation ───────────────────────────────────────
// Calculates subtotal, discount, tax, card fee, and grand total
// for an array of combined workorders + separately-added items.

export function calculateSaleTotals(combinedWorkorders, addedItems, settings) {
  let allWorkorders = cloneDeep(combinedWorkorders || []);

  // Build a temporary workorder-like object for added items so we
  // can feed them through the same calculateRunningTotals pipeline.
  if (addedItems && addedItems.length > 0) {
    let addedItemsWO = {
      workorderLines: addedItems.map((item) => ({
        qty: item.qty || 1,
        inventoryItem: item.inventoryItem || item,
        discountObj: item.discountObj || null,
        id: item.id,
      })),
      taxFree: false,
    };
    allWorkorders = [...allWorkorders, addedItemsWO];
  }

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
    subtotal: totalSubtotal,
    discount: totalDiscount,
    discountedTotal,
    tax,
    cardFee,
    cardFeePercent: settings?.useCardFee ? settings.cardFeePercent : 0,
    salesTaxPercent,
    total: grandTotal,
    qty: totalQty,
  };
}

// ─── Update Sale With Totals ──────────────────────────────────
// Takes a sale object and recalculates all total fields in-place.

export function updateSaleWithTotals(sale, combinedWorkorders, addedItems, settings) {
  let updated = cloneDeep(sale);
  let totals = calculateSaleTotals(combinedWorkorders, addedItems, settings);

  updated.subtotal = totals.subtotal;
  updated.discount = totals.discount > 0 ? totals.discount : null;
  updated.tax = totals.tax;
  updated.cardFee = totals.cardFee;
  updated.cardFeePercent = totals.cardFeePercent;
  updated.salesTaxPercent = totals.salesTaxPercent;
  updated.total = totals.total;

  return updated;
}

// ─── Build Payment Object ─────────────────────────────────────

export function buildCashPayment(amountCaptured, amountTendered, isCheck) {
  let payment = cloneDeep(PAYMENT_OBJECT_PROTO);
  payment.id = generateUPCBarcode();
  payment.amountCaptured = amountCaptured;
  payment.amountTendered = amountTendered;
  payment.cash = !isCheck;
  payment.check = isCheck;
  payment.millis = Date.now();
  payment.paymentProcessor = isCheck ? "check" : "cash";
  return payment;
}

export function buildCardPayment(stripeChargeData) {
  let payment = cloneDeep(PAYMENT_OBJECT_PROTO);
  let card = stripeChargeData?.payment_method_details?.card_present;

  payment.id = generateUPCBarcode();
  payment.amountCaptured = stripeChargeData.amount_captured || 0;
  payment.cardIssuer = card?.receipt?.application_preferred_name || "Unknown";
  payment.cardType = card?.description || "";
  payment.millis = Date.now();
  payment.authorizationCode = card?.receipt?.authorization_code || "";
  payment.paymentIntentID = stripeChargeData.payment_intent || "";
  payment.chargeID = stripeChargeData.id || "";
  payment.paymentProcessor = "stripe";
  payment.receiptURL = stripeChargeData.receipt_url || "";
  payment.last4 = card?.last4 || "";
  payment.expMonth = card?.exp_month || "";
  payment.expYear = card?.exp_year || "";
  payment.networkTransactionID = card?.network_transaction_id || "";
  payment.amountRefunded = stripeChargeData.amount_refunded || 0;
  payment.cash = false;

  return payment;
}

// ─── Refund Validation ────────────────────────────────────────

export function calculateRefundLimits(originalSale, settings) {
  if (!originalSale) return { maxRefund: 0, previouslyRefunded: 0 };

  let totalPreviouslyRefunded = 0;
  if (originalSale.refunds && originalSale.refunds.length > 0) {
    totalPreviouslyRefunded = originalSale.refunds.reduce(
      (sum, r) => sum + (r.amountRefunded || 0),
      0
    );
  }

  let maxRefund = originalSale.total - totalPreviouslyRefunded;
  if (maxRefund < 0) maxRefund = 0;

  // If cardFeeRefund is false, subtract the card fee from the max refund
  let cardFeeDeduction = 0;
  if (!settings?.cardFeeRefund && originalSale.cardFee > 0) {
    // Only deduct card fee if it hasn't already been accounted for
    // in previous refunds
    cardFeeDeduction = originalSale.cardFee;
    // If previous refunds already excluded card fee, don't deduct again
    if (totalPreviouslyRefunded === 0) {
      maxRefund = maxRefund - cardFeeDeduction;
      if (maxRefund < 0) maxRefund = 0;
    }
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
  let available = payment.amountCaptured - (payment.amountRefunded || 0);
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

export function buildRefundObject(amountRefunded, selectedLines, cardRefundID, notes) {
  let refund = cloneDeep(REFUND_PROTO);
  refund.id = generateUPCBarcode();
  refund.amountRefunded = amountRefunded;
  refund.workorderLines = selectedLines || [];
  refund.millis = Date.now();
  refund.cardRefundID = cardRefundID || "";
  refund.notes = notes || "";
  return refund;
}

// ─── Get Previously Refunded Line IDs ─────────────────────────

export function getPreviouslyRefundedLineIDs(sale) {
  if (!sale?.refunds) return [];
  let refundedIDs = [];
  sale.refunds.forEach((refund) => {
    if (refund.workorderLines) {
      refund.workorderLines.forEach((line) => {
        refundedIDs.push(line.id);
      });
    }
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
