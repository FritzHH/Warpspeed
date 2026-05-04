/**
 * Shared printBuilder module — CommonJS format.
 * Used by both the React frontend (via CRA webpack) and Cloud Functions (Node.js).
 * No React, Zustand, or Firebase dependencies.
 */

// ── Data constants (copied from data.js to avoid import issues) ──

const RECEIPT_TYPES = {
  workorder: "Workorder",
  sales: "Sale",
  intake: "Intake",
  register: "pop-register",
  test: "Test",
  refund: "Refund",
  transaction: "Transaction",
};

const RECEIPT_PROTO = {
  customerContact: "",
  workorderNumber: "",
  customerFirstName: "",
  customerLastName: "",
  customerCell: "",
  customerLandline: "",
  customerEmail: "",
  customerAddress: "",
  customerContactRestriction: "",
  barcode: "",
  id: "",
  startedBy: "",
  receiptType: "",
  dateTime: "",
  brand: "",
  color1: "",
  color2: "",
  description: "",
  partSource: "",
  partOrdered: "",
  waitTime: "",
  amountPaid: "",
  startedOnDate: "",
  finishedOnDate: "",
  status: "",
  labor: "",
  parts: "",
  discount: "",
  subtotal: "",
  tax: "",
  salesTaxPercent: "",
  total: "",
  shopName: "Bonita Bikes LLC",
  shopContactBlurb: "",
  thankYouBlurb: "",
  taxFree: false,
  popCashRegister: false,
  persistFlag: false,
  intakeBlurb: "",
  workorderLines: [],
  customerNotes: [],
  internalNotes: [],
  payments: [],
};


// ── String / formatting helpers ──

function capitalizeFirstLetterOfString(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatPhoneForDisplay(num) {
  if (!num) return "";
  let phone = num.toString();
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
  if (digits.length <= 10)
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6, 10) + " " + digits.slice(10);
}

function generateWorkorderNumber(barcodeNumber) {
  const numStr = String(barcodeNumber);
  if (!numStr || !/^\d{12,13}$/.test(numStr)) {
    throw new Error("Input must be 12 or 13 digits");
  }
  const indexes = [];
  while (indexes.length < 5) {
    const randomIndex = Math.floor(Math.random() * numStr.length);
    if (!indexes.includes(randomIndex)) {
      indexes.push(randomIndex);
    }
  }
  return indexes.map(function (index) { return numStr[index]; }).join("");
}


// ── Date helpers ──

function getWordDayOfWeek(millies, abbreviated) {
  var date = new Date();
  if (millies) date = new Date(millies);
  var numDay = date.getDay();
  switch (numDay) {
    case 0: return abbreviated ? "Sun" : "Sunday";
    case 1: return abbreviated ? "Mon" : "Monday";
    case 2: return abbreviated ? "Tues" : "Tuesday";
    case 3: return abbreviated ? "Weds" : "Wednesday";
    case 4: return abbreviated ? "Thurs" : "Thursday";
    case 5: return abbreviated ? "Fri" : "Friday";
    case 6: return abbreviated ? "Sat" : "Saturday";
  }
}

function getWordMonth(millis) {
  var date = new Date(millis);
  return date.toLocaleDateString("en-US", { month: "short" });
}


// ── Array helper (used by calculateRunningTotals) ──

function arrHasItem(arr, item, fieldName) {
  if (fieldName === undefined) fieldName = "id";
  if (!arr || item == null) return false;
  var itemType = typeof item;
  if (itemType === "string" || itemType === "number") {
    return arr.find(function (arrItem) { return arrItem === item; }) !== undefined;
  }
  if (itemType === "object" && item !== null) {
    return arr.find(function (arrItem) {
      return typeof arrItem === "object" && arrItem !== null && arrItem[fieldName] === item[fieldName];
    }) !== undefined;
  }
  return false;
}


// ── Core calculation ──

function calculateRunningTotals(workorders, salesTaxRatePercent, workorderlinesArr, isRefund, taxFree) {
  if (!workorderlinesArr) workorderlinesArr = [];
  if (!taxFree) taxFree = false;

  var runningTotal = 0;
  var runningDiscount = 0;
  var runningSubtotal = 0;
  var runningQty = 0;

  if (!Array.isArray(workorders)) workorders = [workorders];
  workorders.forEach(function (workorderObj) {
    var arrToIterate = isRefund ? workorderlinesArr : workorderObj.workorderLines;
    (arrToIterate || []).forEach(function (line) {
      if (
        isRefund &&
        !arrHasItem(
          workorderObj.workorderLines.map(function (o) { return o.inventoryItem; }),
          line.inventoryItem
        )
      ) return;
      var qty = line.qty;
      var discountPrice = line.discountObj?.newPrice;
      var discountSavings = line.discountObj?.savings;
      runningSubtotal = runningSubtotal + line.inventoryItem.price * qty;
      if (discountPrice) {
        runningTotal = runningTotal + Number(discountPrice);
        runningDiscount = runningDiscount + Number(discountSavings);
      } else {
        runningTotal = runningTotal + line.inventoryItem.price * qty;
      }
      runningQty += qty;
    });
  });
  var runningTax = taxFree ? 0 : runningTotal * (salesTaxRatePercent / 100);
  return {
    finalTotal: runningTotal + runningTax,
    runningTotal: runningTotal,
    runningSubtotal: runningSubtotal,
    runningDiscount: runningDiscount,
    runningTax: runningTax,
    runningQty: runningQty,
  };
}


// ── Status resolver ──

function resolveStatus(statusId, statuses) {
  if (!statusId || !statuses?.length)
    return { id: "", label: "", textColor: "black", backgroundColor: "whitesmoke" };
  return statuses.find(function (s) { return s.id === statusId; })
    || { id: statusId, label: "Unknown", textColor: "black", backgroundColor: "gray" };
}


// ── Print constants ──

var SHOP_CONTACT_BLURB = "9102 Bonita Beach Rd SE\n Bonita Springs, FL\n" +
  "(239) 291-9396\n" +
  "support@bonitabikes.com\n" +
  "www.bonitabikes.com";
var INTAKE_BLURB = "This ticket is an estimate only. We will contact you with any major additions or changes. Minor additions or changes will be made at our discretion.";
var THANK_YOU_BLURB = "Thanks you for visiting Bonita Bikes! \nWe value your business.";
var WAIT_TIME_BLURB_WITH_ESTIMATE = "Wait times are a BEST ESTIMATE only; We will call/text/email when service is complete!";
var WAIT_TIME_BLURB_WITHOUT_ESTIMATE = "We will call/text/email when service is complete!";
var SHOP_NAME = "Bonita Bikes LLC";


// ── Print receipt builders ──

function parseWorkorderLines(wo) {
  var newLines = [];
  (wo.workorderLines || []).forEach(function (workorderLine) {
    var line = Object.assign({}, workorderLine);
    line.itemName = workorderLine.inventoryItem.formalName;
    line.discountName = workorderLine.discountObj?.name;
    line.discountSavings = workorderLine.discountObj?.savings;
    line.price = workorderLine.inventoryItem.price;
    line.salePrice = workorderLine.inventoryItem.salePrice;
    var qty = workorderLine.qty || 1;
    line.quantityAdjustedPrice = workorderLine.inventoryItem.price * qty;
    if (workorderLine.discountObj?.newPrice) {
      line.finalPrice = workorderLine.discountObj.newPrice;
    } else {
      line.finalPrice = (workorderLine.inventoryItem.salePrice || workorderLine.inventoryItem.price) * qty;
    }
    newLines.push(line);
  });
  return newLines;
}

/**
 * Calculate wait time estimate label for a workorder.
 * @param {object} workorder
 * @param {object} [settings] - App settings (storeHours, waitTimeLabelCategories)
 */
function calculateWaitEstimateLabel(workorder, settings) {
  var waitObj = workorder?.waitTime;
  if (!waitObj || !waitObj.label) return "Missing estimate";
  if (waitObj.label === "No Estimate") return "No estimate";

  var maxWaitDays = Number(waitObj.maxWaitTimeDays);
  if (!maxWaitDays || maxWaitDays <= 0) return "";

  var startedOnMillis = Number(workorder.startedOnMillis);
  if (!startedOnMillis) return "";

  if (!settings) settings = {};

  var categories = settings.waitTimeLabelCategories || [];
  if (categories.length === 0) {
    categories = [
      { id: "default1", label: "First half {weekDayName}" },
      { id: "default2", label: "Second half {weekDayName}" },
    ];
  }

  var standardHours = settings.storeHours?.standard || [];
  var dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var openDayNames = new Set(standardHours.filter(function (d) { return d.isOpen; }).map(function (d) { return d.name; }));

  var date = new Date(startedOnMillis);
  var openDaysCounted = 0;
  var safety = 0;
  while (openDaysCounted < maxWaitDays && safety < 365) {
    date.setDate(date.getDate() + 1);
    safety++;
    if (openDayNames.has(dayNames[date.getDay()])) openDaysCounted++;
  }

  var endDate = new Date(date);
  endDate.setHours(0, 0, 0, 0);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var endTime = endDate.getTime();
  var todayTime = today.getTime();
  var daysOut = Math.round((endTime - todayTime) / 86400000);

  var categoryIdx = 0;
  if (daysOut === 0) {
    var hoursIntoDay = new Date().getHours();
    var segmentSize = 24 / categories.length;
    categoryIdx = Math.min(Math.floor(hoursIntoDay / segmentSize), categories.length - 1);
  }
  var categoryLabel = (categories[categoryIdx]?.label || "").replace("{weekDayName}", "").trim();

  function dateSuffix(d) {
    return d === 1 || d === 21 || d === 31 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th";
  }

  if (daysOut < 0) {
    var daysOverdue = Math.abs(daysOut);
    if (daysOverdue === 1) return "Overdue yesterday";
    if (daysOverdue <= 6) return "Overdue " + dayNames[endDate.getDay()];
    var shortDay = getWordDayOfWeek(endTime, true);
    var month = getWordMonth(endTime);
    var day = endDate.getDate();
    return "Overdue " + shortDay + ", " + month + " " + day + dateSuffix(day);
  }

  if (daysOut === 0) return categoryLabel ? categoryLabel + " today" : "Today";
  if (daysOut === 1) {
    // If started today with 1-day wait, always use last category ("Second half")
    var startDate = new Date(startedOnMillis);
    startDate.setHours(0, 0, 0, 0);
    if (startDate.getTime() === todayTime && categories.length > 1) {
      var lastCatLabel = (categories[categories.length - 1]?.label || "").replace("{weekDayName}", "").trim();
      return lastCatLabel ? lastCatLabel + " tomorrow" : "Tomorrow";
    }
    return categoryLabel ? categoryLabel + " tomorrow" : "Tomorrow";
  }

  if (daysOut >= 2 && daysOut <= 3) {
    var targetDayName = dayNames[endDate.getDay()];
    return categoryLabel ? categoryLabel + " " + targetDayName : targetDayName;
  }

  if (daysOut >= 4 && daysOut <= 6) return dayNames[endDate.getDay()];

  var shortDay2 = getWordDayOfWeek(endTime, true);
  var month2 = getWordMonth(endTime);
  var day2 = endDate.getDate();
  return shortDay2 + ", " + month2 + " " + day2 + dateSuffix(day2);
}

/**
 * Build the base print receipt object.
 * @param {object} workorder
 * @param {object} customer
 * @param {number} salesTaxPercent
 * @param {object} [context] - { currentUser, settings }
 */
function createPrintBase(workorder, customer, salesTaxPercent, context) {
  var _ctx = context || {};
  var currentUser = _ctx.currentUser || {};
  var _settings = _ctx.settings || {};

  var r = Object.assign({}, workorder, customer, calculateRunningTotals(workorder, salesTaxPercent, [], false, !!workorder.taxFree));
  r.customerFirstName = capitalizeFirstLetterOfString((customer?.first || customer?.customerFirstName || "").trim());
  r.customerLastName = capitalizeFirstLetterOfString((customer?.last || customer?.customerLastName || "").trim());
  r.first = r.customerFirstName;
  r.last = r.customerLastName;
  r.customerFirst = r.customerFirstName;
  r.customerLast = r.customerLastName;
  r.workorderLines = parseWorkorderLines(workorder);
  r.status = resolveStatus(workorder.status, _settings.statuses || []).label;
  r.salesTaxPercent = salesTaxPercent;
  r.color1 = workorder.color1?.label || "";
  r.color2 = workorder.color2?.label || "";
  r.barcode = r.id;
  r.shopName = _settings.storeInfo?.displayName || SHOP_NAME;
  r.waitTime = workorder.waitTime?.label;
  r.waitTimeEstimateLabel = calculateWaitEstimateLabel(workorder, _settings) || "";
  if (workorder.partOrderEstimateMillis) {
    var d = new Date(Number(workorder.partOrderEstimateMillis));
    r.partEstimatedDelivery = getWordDayOfWeek(workorder.partOrderEstimateMillis, true) + ", " + getWordMonth(workorder.partOrderEstimateMillis) + " " + d.getDate();
  } else {
    r.partEstimatedDelivery = "";
  }

  var userFirst = capitalizeFirstLetterOfString((currentUser?.first || "").trim());
  var userLastInitial = (currentUser?.last || "").trim().charAt(0).toUpperCase();
  r.startedBy = userFirst + (userLastInitial ? " " + userLastInitial + "." : "");
  r.workorderNumber = "";
  r.shopContactBlurb = _settings.shopContactBlurb || SHOP_CONTACT_BLURB;
  r.thankYouBlurb = _settings.thankYouBlurb || THANK_YOU_BLURB;
  r.intakeBlurb = _settings.intakeBlurb || INTAKE_BLURB;
  r.customerContact = formatPhoneForDisplay(customer.customerCell) || formatPhoneForDisplay(customer.customerLandline) || customer.email;

  delete r.changeLog;
  delete r.media;

  return r;
}

// Simple unique ID for test receipts (no Firebase dependency)
function _generateSimpleID() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

var printBuilder = {
  test: function () {
    return Object.assign({}, RECEIPT_PROTO, {
      id: _generateSimpleID(),
      receiptType: RECEIPT_TYPES.test,
    });
  },
  workorder: function (workorder, customer, salesTaxPercent, context) {
    var receipt = createPrintBase(workorder, customer, salesTaxPercent, context);
    receipt.receiptType = RECEIPT_TYPES.workorder;
    return receipt;
  },
  intake: function (workorder, customer, salesTaxPercent, context) {
    var receipt = createPrintBase(workorder, customer, salesTaxPercent, context);
    receipt.receiptType = RECEIPT_TYPES.intake;
    var _settings = (context || {}).settings || {};
    var hasWaitInfo = !!(receipt.waitTime || receipt.waitTimeEstimateLabel);
    receipt.waitTimeBlurb = hasWaitInfo
      ? (_settings.waitTimeBlurbWithEstimate || WAIT_TIME_BLURB_WITH_ESTIMATE)
      : (_settings.waitTimeBlurbWithoutEstimate || WAIT_TIME_BLURB_WITHOUT_ESTIMATE);
    return receipt;
  },
  refund: function (refund, sale, customer, workorder, salesTaxPercent, context) {
    var _ctx = context || {};
    var _settings = _ctx.settings || {};
    var currentUser = _ctx.currentUser || {};

    var receipt = Object.assign({}, RECEIPT_PROTO);
    receipt.receiptType = RECEIPT_TYPES.refund;
    receipt.barcode = sale?.id || refund.id;
    receipt.id = refund.id;
    receipt.shopName = _settings.storeInfo?.displayName || SHOP_NAME;
    receipt.shopContactBlurb = _settings.shopContactBlurb || SHOP_CONTACT_BLURB;
    receipt.thankYouBlurb = _settings.thankYouBlurb || THANK_YOU_BLURB;
    receipt.salesTaxPercent = salesTaxPercent;
    receipt.taxFree = !!workorder?.taxFree;

    // Customer info
    receipt.customerFirstName = capitalizeFirstLetterOfString((customer?.first || customer?.customerFirstName || "").trim());
    receipt.customerLastName = capitalizeFirstLetterOfString((customer?.last || customer?.customerLastName || "").trim());
    receipt.customerCell = customer?.phone || customer?.customerCell || "";
    receipt.customerEmail = customer?.email || customer?.customerEmail || "";
    receipt.customerContact = formatPhoneForDisplay(receipt.customerCell) || receipt.customerEmail;

    // User who processed the refund
    var userFirst = capitalizeFirstLetterOfString((currentUser?.first || "").trim());
    var userLastInitial = (currentUser?.last || "").trim().charAt(0).toUpperCase();
    receipt.startedBy = userFirst + (userLastInitial ? " " + userLastInitial + "." : "");

    // Refund-specific fields
    receipt.refundAmount = refund.amount || 0;
    receipt.refundType = refund.method || ""; // "cash" or "card"
    var rawNotes = refund.notes;
    if (rawNotes && typeof rawNotes === "object") {
      receipt.refundNotes = {
        reason: rawNotes.reason || "",
        millis: String(rawNotes.millis || refund.millis || Date.now()),
        userInitials: rawNotes.userInitials || "",
        userID: rawNotes.userID || "",
      };
    } else {
      receipt.refundNotes = {
        reason: rawNotes || "",
        millis: String(refund.millis || Date.now()),
        userInitials: currentUser ? (((currentUser.first || "")[0] || "") + ((currentUser.last || "")[0] || "")) : "",
        userID: currentUser?.id || "",
      };
    }
    receipt.originalSaleID = sale?.id || "";
    receipt.originalSaleTotal = sale?.total || 0;
    receipt.cardRefundID = refund.stripeRefundID || "";

    receipt.previousRefunds = (_ctx.previousRefunds || []).map(function (pr) {
      var prNotes = pr.notes;
      var normalizedNotes;
      if (prNotes && typeof prNotes === "object") {
        normalizedNotes = {
          reason: prNotes.reason || "",
          millis: String(prNotes.millis || pr.millis || 0),
          userInitials: prNotes.userInitials || "",
          userID: prNotes.userID || "",
        };
      } else {
        normalizedNotes = {
          reason: prNotes || "",
          millis: String(pr.millis || 0),
          userInitials: "",
          userID: "",
        };
      }
      var entry = {
        id: pr.id || "",
        refundAmount: String(pr.amount || 0),
        refundType: pr.method || "",
        refundNotes: normalizedNotes,
      };
      if (pr.method === "card" && pr.stripeRefundID) {
        entry.cardRefundID = pr.stripeRefundID;
      }
      return entry;
    }).sort(function (a, b) {
      return Number(a.refundNotes.millis) - Number(b.refundNotes.millis);
    });

    // Refunded line items
    if (refund.workorderLines && refund.workorderLines.length > 0) {
      receipt.workorderLines = refund.workorderLines.map(function (line) {
        var parsed = Object.assign({}, line);
        parsed.itemName = line.inventoryItem?.formalName || line.inventoryItem?.informalName || "";
        parsed.price = line.inventoryItem?.price || 0;
        parsed.discountName = line.discountObj?.name;
        parsed.discountSavings = line.discountObj?.savings;
        parsed.finalPrice = line.discountObj?.newPrice != null
          ? line.discountObj.newPrice
          : line.inventoryItem?.price || 0;
        parsed.qty = line.qty || 1;
        return parsed;
      });

      // Calculate refund totals from items
      var totals = calculateRunningTotals(
        workorder || { workorderLines: [] },
        salesTaxPercent,
        refund.workorderLines,
        true,
        !!workorder?.taxFree
      );
      receipt.subtotal = totals.runningTotal;
      receipt.discount = totals.runningDiscount;
      receipt.tax = totals.runningTax;
      receipt.total = totals.finalTotal;
    } else {
      // Payment-based or custom amount refund (no items)
      receipt.workorderLines = [];
      receipt.subtotal = refund.amount || 0;
      receipt.discount = 0;
      receipt.tax = 0;
      receipt.total = refund.amount || 0;
    }

    // Pop cash register for cash/check refunds
    receipt.popCashRegister = refund.method === "cash" || refund.method === "check";

    // Transaction timestamp
    var txDate = refund.millis ? new Date(Number(refund.millis)) : new Date();
    receipt.transactionDateTime = txDate.toLocaleDateString() + "  " + txDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    return receipt;
  },
  sale: function (sale, payments, customer, workorder, salesTaxPercent, context, credits) {
    var receipt = createPrintBase(workorder, customer, salesTaxPercent, context);
    receipt = Object.assign({}, receipt, sale);
    receipt.tax = sale.salesTax != null ? sale.salesTax : (receipt.tax || 0);
    receipt.barcode = sale.id;
    receipt.receiptType = RECEIPT_TYPES.sales;
    // Build unified payments[]: cash/card/check transactions + credits/deposits/gift cards
    var allPayments = (payments || []).map(function (p) {
      var type = p.method === "cash" ? "Cash" : p.method === "check" ? "Check" : "Card";
      return Object.assign({}, p, { paymentType: type });
    });

    var custPhone = customer?.customerCell || customer?.cell || customer?.phone || "";
    (credits || []).forEach(function (c) {
      var method, paymentType;
      if (c.type === "credit") { method = "credit"; paymentType = "Credit"; }
      else if (c.type === "giftcard") { method = "gift_card"; paymentType = "Gift Card"; }
      else { method = "deposit"; paymentType = "Deposit"; }

      var creditSalesTax = 0;
      if (sale.total > 0 && sale.salesTax > 0) {
        creditSalesTax = Math.round(sale.salesTax * ((c.amount || 0) / sale.total));
      }

      allPayments.push({
        id: c.id,
        method: method,
        paymentType: paymentType,
        amountCaptured: c.amount || 0,
        millis: c._appliedMillis || c.appliedMillis || c._millis || c.millis || Date.now(),
        salesTax: creditSalesTax,
        accountID: c.id,
        accountPhone: c._ownerPhone || c.ownerPhone || custPhone,
        remainingBalance: c._remainingBalance != null ? c._remainingBalance : (c.remainingBalance != null ? c.remainingBalance : 0),
      });
    });

    receipt.payments = allPayments;
    receipt.transactionIDs = allPayments.map(function (p) { return p.id; });

    delete receipt.depositsApplied;
    delete receipt.creditsApplied;

    receipt.paymentMethod = (function () {
      var types = [];
      var has = {};
      allPayments.forEach(function (p) {
        if (p.method === "cash") has.cash = true;
        else if (p.method === "check") has.check = true;
        else if (p.method === "card") has.card = true;
        else has.stored = true;
      });
      if (has.cash) types.push("Cash");
      if (has.card) types.push("Card");
      if (has.check) types.push("Check");
      if (has.stored) types.push("Credit/Deposit");
      return types.join(" / ") || "None";
    })();
    receipt.popCashRegister = (payments || []).some(function (p) {
      return p.method === "cash" && p.amountTendered > p.amountCaptured;
    });
    var cashChange = 0;
    (payments || []).forEach(function (p) {
      if (p.method === "cash" && p.amountTendered > p.amountCaptured) {
        cashChange += p.amountTendered - p.amountCaptured;
      }
    });
    receipt.cashChangeGiven = cashChange;
    receipt.cashChangeGivenDisplay = cashChange ? "$" + (cashChange / 100).toFixed(2) : "";
    var txDate = workorder?.finishedOnMillis ? new Date(Number(workorder.finishedOnMillis)) : new Date();
    receipt.transactionDateTime = txDate.toLocaleDateString() + "  " + txDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    // Deposit/credit sale fields
    receipt.isDepositSale = !!sale.isDepositSale;
    receipt.depositType = sale.depositType || "";
    receipt.depositNote = sale.depositNote || "";
    receipt.depositAmountCents = sale.isDepositSale ? (sale.subtotal || 0) : 0;

    // Transaction-only flag — when true, receipt covers a single payment only
    receipt.transactionOnly = false;

    return receipt;
  },
  transaction: function (txn, context) {
    var _ctx = context || {};
    var _settings = _ctx.settings || {};
    var currentUser = _ctx.currentUser || {};

    var receipt = Object.assign({}, RECEIPT_PROTO);
    receipt.receiptType = RECEIPT_TYPES.transaction;
    receipt.id = txn.id;
    receipt.barcode = txn.id;
    receipt.transactionOnly = true;
    receipt.shopName = _settings.storeInfo?.displayName || SHOP_NAME;
    receipt.shopContactBlurb = _settings.shopContactBlurb || SHOP_CONTACT_BLURB;
    receipt.thankYouBlurb = _settings.thankYouBlurb || THANK_YOU_BLURB;

    // User who printed
    var userFirst = capitalizeFirstLetterOfString((currentUser?.first || "").trim());
    var userLastInitial = (currentUser?.last || "").trim().charAt(0).toUpperCase();
    receipt.startedBy = userFirst + (userLastInitial ? " " + userLastInitial + "." : "");

    // Payment method
    receipt.paymentMethod = (txn.method || "card").toUpperCase();

    // Amounts (all in cents)
    receipt.amountCaptured = txn.amountCaptured || 0;
    receipt.total = txn.amountCaptured || 0;
    receipt.subtotal = txn.amountCaptured || 0;
    receipt.tax = txn.salesTax || 0;
    receipt.salesTaxPercent = _settings.salesTaxPercent || 0;

    // Cash fields
    receipt.amountTendered = txn.amountTendered || 0;
    var cashChange = txn.method === "cash" && txn.amountTendered > txn.amountCaptured
      ? txn.amountTendered - txn.amountCaptured : 0;
    receipt.cashChangeGiven = cashChange;
    receipt.cashChangeGivenDisplay = cashChange ? "$" + (cashChange / 100).toFixed(2) : "";
    receipt.popCashRegister = false;

    // Card fields
    receipt.cardType = txn.cardType || "";
    receipt.last4 = txn.last4 || "";
    receipt.expMonth = txn.expMonth || "";
    receipt.expYear = txn.expYear || "";
    receipt.authorizationCode = txn.authorizationCode || "";
    receipt.cardIssuer = txn.cardIssuer || "";
    receipt.chargeID = txn.chargeID || "";
    receipt.paymentIntentID = txn.paymentIntentID || "";
    receipt.networkTransactionID = txn.networkTransactionID || "";
    receipt.receiptURL = txn.receiptURL || "";
    receipt.paymentProcessor = txn.paymentProcessor || "";

    // Single payment entry for the receipt renderer
    receipt.payments = [{
      method: txn.method || "card",
      paymentType: txn.method === "cash" ? "Cash" : txn.method === "check" ? "Check" : "Card",
      amountCaptured: txn.amountCaptured || 0,
      amountTendered: txn.amountTendered || 0,
      cardType: txn.cardType || "",
      last4: txn.last4 || "",
    }];

    // Refunds
    var refunds = txn.refunds || [];
    receipt.refunds = refunds;
    receipt.totalRefunded = refunds.reduce(function (s, r) { return s + (r.amount || 0); }, 0);

    // Timestamp
    var txDate = txn.millis ? new Date(Number(txn.millis)) : new Date();
    receipt.transactionDateTime = txDate.toLocaleDateString() + "  " + txDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    receipt.dateTime = receipt.transactionDateTime;

    return receipt;
  },
  credit: function (creditObj, customer, context) {
    var _ctx = context || {};
    var _settings = _ctx.settings || {};
    var currentUser = _ctx.currentUser || {};

    var receipt = Object.assign({}, RECEIPT_PROTO);
    receipt.receiptType = "Credit";
    receipt.id = creditObj.id || "";
    receipt.barcode = creditObj.id || "";
    receipt.shopName = _settings.storeInfo?.displayName || SHOP_NAME;
    receipt.shopContactBlurb = _settings.shopContactBlurb || SHOP_CONTACT_BLURB;
    receipt.thankYouBlurb = _settings.thankYouBlurb || THANK_YOU_BLURB;

    receipt.first = capitalizeFirstLetterOfString((customer?.first || "").trim());
    receipt.last = capitalizeFirstLetterOfString((customer?.last || "").trim());
    receipt.customerFirstName = receipt.first;
    receipt.customerLastName = receipt.last;
    receipt.customerCell = customer?.customerCell || customer?.cell || customer?.phone || "";
    receipt.customerEmail = customer?.email || "";
    receipt.customerContact = formatPhoneForDisplay(receipt.customerCell) || receipt.customerEmail;

    var userFirst = capitalizeFirstLetterOfString((currentUser?.first || "").trim());
    var userLastInitial = (currentUser?.last || "").trim().charAt(0).toUpperCase();
    receipt.startedBy = userFirst + (userLastInitial ? " " + userLastInitial + "." : "");

    receipt.creditAmount = creditObj.amountCents || 0;
    receipt.creditNote = creditObj.text || creditObj.note || "";

    var txDate = new Date(Number(creditObj.millis) || Date.now());
    receipt.transactionDateTime = txDate.toLocaleDateString() + "  " + txDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    return receipt;
  },
  giftcard: function (giftcardObj, customer, context) {
    var _ctx = context || {};
    var _settings = _ctx.settings || {};
    var currentUser = _ctx.currentUser || {};

    var receipt = Object.assign({}, RECEIPT_PROTO);
    receipt.receiptType = "GiftCard";
    receipt.id = giftcardObj.id || "";
    receipt.barcode = giftcardObj.id || "";
    receipt.shopName = _settings.storeInfo?.displayName || SHOP_NAME;
    receipt.shopContactBlurb = _settings.shopContactBlurb || SHOP_CONTACT_BLURB;
    receipt.thankYouBlurb = _settings.thankYouBlurb || THANK_YOU_BLURB;

    receipt.first = capitalizeFirstLetterOfString((customer?.first || "").trim());
    receipt.last = capitalizeFirstLetterOfString((customer?.last || "").trim());
    receipt.customerFirstName = receipt.first;
    receipt.customerLastName = receipt.last;
    receipt.customerCell = customer?.customerCell || customer?.cell || customer?.phone || "";
    receipt.customerEmail = customer?.email || "";
    receipt.customerContact = formatPhoneForDisplay(receipt.customerCell) || receipt.customerEmail;

    var userFirst = capitalizeFirstLetterOfString((currentUser?.first || "").trim());
    var userLastInitial = (currentUser?.last || "").trim().charAt(0).toUpperCase();
    receipt.startedBy = userFirst + (userLastInitial ? " " + userLastInitial + "." : "");

    receipt.giftCardAmount = giftcardObj.amountCents || 0;
    receipt.giftCardNote = giftcardObj.note || "";

    var txDate = new Date(Number(giftcardObj.millis) || Date.now());
    receipt.transactionDateTime = txDate.toLocaleDateString() + "  " + txDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    return receipt;
  },
};

module.exports = {
  printBuilder: printBuilder,
  createPrintBase: createPrintBase,
  calculateWaitEstimateLabel: calculateWaitEstimateLabel,
  parseWorkorderLines: parseWorkorderLines,
  calculateRunningTotals: calculateRunningTotals,
  resolveStatus: resolveStatus,
  formatPhoneForDisplay: formatPhoneForDisplay,
  capitalizeFirstLetterOfString: capitalizeFirstLetterOfString,
  generateWorkorderNumber: generateWorkorderNumber,
  RECEIPT_TYPES: RECEIPT_TYPES,
  RECEIPT_PROTO: RECEIPT_PROTO,
  SHOP_NAME: SHOP_NAME,
  SHOP_CONTACT_BLURB: SHOP_CONTACT_BLURB,
  THANK_YOU_BLURB: THANK_YOU_BLURB,
  INTAKE_BLURB: INTAKE_BLURB,
};
