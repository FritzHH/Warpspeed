/* eslint-disable */
const { jsPDF } = require("jspdf");
const { buildSaleReceiptPDF } = require("./shared/saleReceiptPdf");
const { buildIntakeReceiptPDF } = require("./shared/intakeReceiptPdf");

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";

function formatWorkorderNumber(woNum) {
  if (!woNum || typeof woNum !== "string") return woNum || "";
  if (woNum.startsWith("W") && !woNum.startsWith("WO") && woNum.length >= 10) {
    return "W-" + woNum.slice(1, 6) + "-" + woNum.slice(6);
  }
  if (woNum.startsWith("WO") && woNum.length >= 7) {
    return woNum.slice(0, 2) + "-" + woNum.slice(2, 6) + "-" + woNum.slice(6);
  }
  return woNum;
}

////////////////////////////////////////////////////////////////////////////////
// Default label sets (exported so receiptTranslator can read the keys)
////////////////////////////////////////////////////////////////////////////////

const DEFAULT_SALE_LABELS = {
  title: "SALES RECEIPT",
  subtotal: "Subtotal",
  discount: "Discount",
  salesTax: "Sales Tax",
  cardFee: "Card Fee",
  total: "TOTAL",
  itemHeader: "Item",
  qtyHeader: "Qty",
  priceHeader: "Price",
  totalHeader: "Total",
  payments: "Payments",
  cash: "Cash",
  card: "Card",
  auth: "Auth",
  tendered: "Tendered",
  change: "Change",
  amountPaid: "Amount Paid",
  notesHeader: "Service Notes",
  customer: "Customer",
  contact: "Contact",
  woNumber: "WO #",
  discountPrefix: "Discount",
  notePrefix: "Note",
};

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

function formatCents(cents) {
  let val = Number(cents) || 0;
  return (val / 100).toFixed(2);
}

function checkPageBreak(doc, y, needed, margin) {
  let pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function addDivider(doc, y, x1, x2) {
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
  return y + 10;
}

function addShopHeader(doc, y, data, centerX) {
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(data.shopName || "Bonita Bikes LLC", centerX, y, { align: "center" });
  y += 16;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let contactLines = (data.shopContactBlurb || "").split("\n").map((s) => s.trim()).filter(Boolean);
  contactLines.forEach((line) => {
    doc.text(line, centerX, y, { align: "center" });
    y += 10;
  });

  return y + 4;
}

function addTotalRow(doc, y, label, value, leftX, rightX, bold) {
  doc.setFontSize(9);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.text(label, leftX, y);
  doc.text("$" + formatCents(value), rightX, y, { align: "right" });
  return y + 13;
}

function addTotals(doc, y, data, leftX, rightX, L) {
  if (!L) L = DEFAULT_SALE_LABELS;
  y = addTotalRow(doc, y, L.subtotal, data.runningSubtotal || data.subtotal || 0, leftX, rightX, false);

  if ((data.amountPaid || 0) > 0) {
    y = addTotalRow(doc, y, L.amountPaid, -(data.amountPaid || 0), leftX, rightX, false);
  }

  if ((data.runningDiscount || data.discount || 0) > 0) {
    y = addTotalRow(doc, y, L.discount, -(data.runningDiscount || data.discount || 0), leftX, rightX, false);
  }

  y = addTotalRow(doc, y, L.salesTax, data.runningTax || data.tax || 0, leftX, rightX, false);

  if ((data.cardFee || 0) > 0) {
    let label = L.cardFee + (data.cardFeePercent ? " (" + data.cardFeePercent + "%)" : "");
    y = addTotalRow(doc, y, label, data.cardFee, leftX, rightX, false);
  }

  y += 2;
  y = addTotalRow(doc, y, L.total, data.finalTotal || data.total || 0, leftX, rightX, true);
  return y;
}

function addLineItems(doc, lines, y, leftX, rightX, margin, includeReceiptNotes, L) {
  if (!L) L = DEFAULT_SALE_LABELS;
  let contentWidth = rightX - leftX;
  let qtyX = rightX - 90;
  let priceX = rightX - 45;
  let nameMaxWidth = qtyX - leftX - 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(L.itemHeader, leftX, y);
  doc.text(L.qtyHeader, qtyX, y, { align: "right" });
  doc.text(L.priceHeader, priceX, y, { align: "right" });
  doc.text(L.totalHeader, rightX, y, { align: "right" });
  y += 4;
  doc.setDrawColor(180);
  doc.line(leftX, y, rightX, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  (lines || []).forEach((line) => {
    y = checkPageBreak(doc, y, 30, margin);

    let name = line.itemName || L.itemHeader;
    doc.setFontSize(9);
    let nameLines = doc.splitTextToSize(name, nameMaxWidth);
    nameLines.forEach((nl, i) => {
      doc.text(nl, leftX, y + (i * 11));
    });
    let nameHeight = nameLines.length * 11;

    doc.setFontSize(8);
    let qty = String(line.qty || 1);
    let unitPrice = formatCents(line.price || 0);
    let lineTotal = formatCents(line.finalPrice || 0);
    doc.text(qty, qtyX, y, { align: "right" });
    doc.text("$" + unitPrice, priceX, y, { align: "right" });
    doc.text("$" + lineTotal, rightX, y, { align: "right" });

    y += Math.max(nameHeight, 12);

    if (line.discountName && (line.discountSavings || 0) > 0) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text("  " + L.discountPrefix + ": " + line.discountName + " (-$" + formatCents(line.discountSavings) + ")", leftX, y);
      doc.setTextColor(0);
      y += 10;
    }

    if (includeReceiptNotes && line.receiptNotes) {
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      let noteLines = doc.splitTextToSize(L.notePrefix + ": " + line.receiptNotes, contentWidth - 10);
      noteLines.forEach((nl) => {
        y = checkPageBreak(doc, y, 10, margin);
        doc.text(nl, leftX + 4, y);
        y += 9;
      });
      doc.setTextColor(0);
      y += 2;
    }

    y += 4;
  });

  return y;
}

////////////////////////////////////////////////////////////////////////////////
// Sale Receipt PDF — delegates to shared builder (src/shared/saleReceiptPdf.js)
////////////////////////////////////////////////////////////////////////////////

function generateSaleReceiptPDF(data, labels) {
  let doc = buildSaleReceiptPDF(data, labels);
  return doc.output("datauristring").split(",")[1];
}


////////////////////////////////////////////////////////////////////////////////
// Refund Receipt PDF
////////////////////////////////////////////////////////////////////////////////

function generateRefundReceiptPDF(data) {
  let pageWidth = 226;
  let margin = 10;
  let contentWidth = pageWidth - margin * 2;
  let centerX = pageWidth / 2;
  let leftX = margin;
  let rightX = pageWidth - margin;

  let doc = new jsPDF({ unit: "pt", format: [pageWidth, 800] });
  let y = margin + 10;

  y = addShopHeader(doc, y, data, centerX);
  y = addDivider(doc, y, leftX, rightX);

  y += 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("REFUND RECEIPT", centerX, y, { align: "center" });
  y += 14;

  if (data.barcode || data.id) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(data.barcode || data.id, centerX, y, { align: "center" });
    y += 10;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (data.millis || data.startedOnMillis) {
    let d = new Date(Number(data.millis || data.startedOnMillis));
    let dateStr = d.toLocaleDateString() + "  " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    doc.text(dateStr, centerX, y, { align: "center" });
    y += 10;
  }
  y += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let custName = [cap(data.customerFirstName), cap(data.customerLastName)].filter(Boolean).join(" ");
  if (custName) {
    doc.text("Customer: " + custName, leftX, y);
    y += 11;
  }
  if (data.customerContact) {
    doc.text("Contact: " + data.customerContact, leftX, y);
    y += 11;
  }
  if (data.startedBy) {
    doc.text("Processed by: " + data.startedBy, leftX, y);
    y += 11;
  }

  y += 4;
  y = addDivider(doc, y, leftX, rightX);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  let typeLabel = (data.refundType || "").toUpperCase() || "REFUND";
  doc.text(typeLabel + " REFUND", leftX, y);
  y += 14;

  if ((data.refundType || "").toLowerCase() === "card") {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    let cardName = data.cardIssuer && data.cardIssuer !== "Unknown" ? data.cardIssuer : (data.cardType || "Card");
    let last4 = data.cardLast4 || "";
    if (cardName || last4) {
      doc.text(cardName + (last4 ? "  \u2022\u2022\u2022\u2022 " + last4 : ""), leftX, y);
      y += 11;
    }
    if (data.cardExpMonth && data.cardExpYear) {
      let mm = String(data.cardExpMonth).padStart(2, "0");
      let yy = String(data.cardExpYear).slice(-2);
      doc.text("Exp: " + mm + "/" + yy, leftX, y);
      y += 11;
    }
    if (data.cardRefundID) {
      doc.text("Ref ID: " + data.cardRefundID, leftX, y);
      y += 11;
    }
    y += 2;
  }

  if (data.workorderLines && data.workorderLines.length > 0) {
    y = addLineItems(doc, data.workorderLines, y, leftX, rightX, margin, false, DEFAULT_SALE_LABELS);
    y = addDivider(doc, y, leftX, rightX);
    y = addTotals(doc, y, data, leftX, rightX, DEFAULT_SALE_LABELS);
    y += 4;
    y = addDivider(doc, y, leftX, rightX);
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Refund Amount: $" + formatCents(data.refundAmount || data.total || 0), leftX, y);
  y += 16;

  let reasonText = "";
  let reasonInitials = "";
  if (data.refundNotes && typeof data.refundNotes === "object") {
    reasonText = data.refundNotes.reason || "";
    reasonInitials = data.refundNotes.userInitials || "";
  } else if (typeof data.refundNotes === "string") {
    reasonText = data.refundNotes;
  }
  if (reasonText) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Reason:", leftX, y);
    y += 11;
    doc.setFont("helvetica", "normal");
    let noteLines = doc.splitTextToSize(reasonText, contentWidth);
    noteLines.forEach(function (nl) {
      doc.text(nl, leftX, y);
      y += 10;
    });
    if (reasonInitials) {
      doc.setFont("helvetica", "italic");
      doc.text("- " + reasonInitials, leftX, y);
      y += 10;
    }
    y += 4;
  }

  y = addDivider(doc, y, leftX, rightX);

  if (data.thankYouBlurb) {
    y = checkPageBreak(doc, y, 40, margin);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    let thankLines = doc.splitTextToSize(data.thankYouBlurb, contentWidth);
    thankLines.forEach(function (line) {
      doc.text(line, centerX, y, { align: "center" });
      y += 9;
    });
    y += 6;
  }

  return doc.output("datauristring").split(",")[1];
}

////////////////////////////////////////////////////////////////////////////////
// Credit Receipt PDF
////////////////////////////////////////////////////////////////////////////////

function generateCreditReceiptPDF(data) {
  let pageWidth = 226;
  let margin = 10;
  let contentWidth = pageWidth - margin * 2;
  let centerX = pageWidth / 2;
  let leftX = margin;
  let rightX = pageWidth - margin;

  let doc = new jsPDF({ unit: "pt", format: [pageWidth, 500] });
  let y = margin + 10;

  y = addShopHeader(doc, y, data, centerX);
  y = addDivider(doc, y, leftX, rightX);

  y += 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("STORE CREDIT RECEIPT", centerX, y, { align: "center" });
  y += 14;

  if (data.barcode || data.id) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Credit ID: " + (data.barcode || data.id), centerX, y, { align: "center" });
    y += 12;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (data.transactionDateTime) {
    doc.text(data.transactionDateTime, centerX, y, { align: "center" });
    y += 10;
  }
  y += 6;

  let custName = [cap(data.first || data.customerFirstName), cap(data.last || data.customerLastName)].filter(Boolean).join(" ");
  if (custName) {
    doc.text("Customer: " + custName, leftX, y);
    y += 11;
  }
  if (data.customerCell) {
    doc.text("Account Phone: " + (data.customerContact || data.customerCell), leftX, y);
    y += 11;
  }
  if (data.startedBy) {
    doc.text("Processed by: " + data.startedBy, leftX, y);
    y += 11;
  }

  y += 4;
  y = addDivider(doc, y, leftX, rightX);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Credit Amount: $" + formatCents(data.depositAmountCents || data.creditAmount || 0), leftX, y);
  y += 16;

  if (data.depositNote || data.creditNote) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    let noteLines = doc.splitTextToSize("Reason: " + (data.depositNote || data.creditNote), contentWidth);
    noteLines.forEach(function (nl) {
      doc.text(nl, leftX, y);
      y += 10;
    });
    y += 4;
  }

  y = addDivider(doc, y, leftX, rightX);

  if (data.thankYouBlurb) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    let thankLines = doc.splitTextToSize(data.thankYouBlurb, contentWidth);
    thankLines.forEach(function (line) {
      doc.text(line, centerX, y, { align: "center" });
      y += 9;
    });
    y += 6;
  }

  return doc.output("datauristring").split(",")[1];
}

////////////////////////////////////////////////////////////////////////////////
// Gift Card Receipt PDF
////////////////////////////////////////////////////////////////////////////////

function generateGiftCardReceiptPDF(data) {
  let pageWidth = 226;
  let margin = 10;
  let contentWidth = pageWidth - margin * 2;
  let centerX = pageWidth / 2;
  let leftX = margin;
  let rightX = pageWidth - margin;

  let doc = new jsPDF({ unit: "pt", format: [pageWidth, 500] });
  let y = margin + 10;

  y = addShopHeader(doc, y, data, centerX);
  y = addDivider(doc, y, leftX, rightX);

  y += 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("GIFT CARD RECEIPT", centerX, y, { align: "center" });
  y += 14;

  if (data.barcode || data.id) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Gift Card ID: " + (data.barcode || data.id), centerX, y, { align: "center" });
    y += 12;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (data.transactionDateTime) {
    doc.text(data.transactionDateTime, centerX, y, { align: "center" });
    y += 10;
  }
  y += 6;

  let custName = [cap(data.first || data.customerFirstName), cap(data.last || data.customerLastName)].filter(Boolean).join(" ");
  if (custName) {
    doc.text("Customer: " + custName, leftX, y);
    y += 11;
  }
  if (data.customerCell) {
    doc.text("Account Phone: " + (data.customerContact || data.customerCell), leftX, y);
    y += 11;
  }
  if (data.startedBy) {
    doc.text("Processed by: " + data.startedBy, leftX, y);
    y += 11;
  }

  y += 4;
  y = addDivider(doc, y, leftX, rightX);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Gift Card Amount: $" + formatCents(data.giftCardAmount || 0), leftX, y);
  y += 16;

  if (data.giftCardNote) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    let noteLines = doc.splitTextToSize("Note: " + data.giftCardNote, contentWidth);
    noteLines.forEach(function (nl) {
      doc.text(nl, leftX, y);
      y += 10;
    });
    y += 4;
  }

  y = addDivider(doc, y, leftX, rightX);

  if (data.thankYouBlurb) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    let thankLines = doc.splitTextToSize(data.thankYouBlurb, contentWidth);
    thankLines.forEach(function (line) {
      doc.text(line, centerX, y, { align: "center" });
      y += 9;
    });
    y += 6;
  }

  return doc.output("datauristring").split(",")[1];
}

////////////////////////////////////////////////////////////////////////////////
// Workorder Ticket PDF — delegates to shared builder (src/shared/intakeReceiptPdf.js)
////////////////////////////////////////////////////////////////////////////////

function generateWorkorderTicketPDF(data) {
  let doc = buildIntakeReceiptPDF(data);
  return doc.output("datauristring").split(",")[1];
}


////////////////////////////////////////////////////////////////////////////////
// Transaction Receipt PDF (deposits, gift card purchases, standalone txns)
////////////////////////////////////////////////////////////////////////////////

function generateTransactionReceiptPDF(data) {
  let pageWidth = 226;
  let margin = 10;
  let contentWidth = pageWidth - margin * 2;
  let centerX = pageWidth / 2;
  let leftX = margin;
  let rightX = pageWidth - margin;

  let doc = new jsPDF({ unit: "pt", format: [pageWidth, 800] });
  let y = margin + 10;

  // Barcode ID
  if (data.barcode || data.id) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(data.barcode || data.id, centerX, y, { align: "center" });
    y += 12;
  }

  // Shop header
  y = addShopHeader(doc, y, data, centerX);

  // Title based on depositType
  let depositType = (data.depositType || "").toLowerCase();
  let titleText = depositType === "giftcard" ? "Gift Card Purchase"
    : depositType === "deposit" ? "Customer Deposit"
    : "Transaction Receipt";
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(titleText, centerX, y, { align: "center" });
  y += 16;

  // Date
  let dateStr = data.transactionDateTime || data.dateTime || "";
  if (dateStr) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(dateStr, centerX, y, { align: "center" });
    y += 12;
  }

  // Customer name (uppercase)
  let custName = [(data.customerFirstName || ""), (data.customerLastName || "")].filter(Boolean).join(" ").toUpperCase();
  if (custName) {
    y += 4;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(custName, centerX, y, { align: "center" });
    y += 14;
  }

  // Customer contact
  let contact = data.customerContact || formatPhone(data.customerCell) || data.customerEmail || "";
  if (contact) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(contact, centerX, y, { align: "center" });
    y += 12;
  }

  // Processed by
  y += 2;
  y = addDashedSeparator(doc, y, leftX, rightX);
  if (data.startedBy) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("processed by: " + data.startedBy, centerX, y, { align: "center" });
    y += 12;
  }
  y = addDashedSeparator(doc, y, leftX, rightX);

  // Deposit/gift card amount
  let amountLabel = depositType === "giftcard" ? "Gift Card Amount:" : "Deposit Amount:";
  y += 4;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(amountLabel, rightX - doc.getTextWidth("$" + formatCents(data.amountCaptured || data.total || 0)) - 4 - doc.getTextWidth(amountLabel + " "), y);
  doc.text("$" + formatCents(data.amountCaptured || data.total || 0), rightX, y, { align: "right" });
  y += 16;

  // Note
  if (data.depositNote) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Note:", leftX, y);
    let noteUnderlineWidth = doc.getTextWidth("Note:");
    doc.line(leftX, y + 1, leftX + noteUnderlineWidth, y + 1);
    y += 12;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    let noteLines = doc.splitTextToSize(data.depositNote, contentWidth);
    noteLines.forEach((nl) => {
      y = checkPageBreak(doc, y, 10, margin);
      doc.text(nl, leftX, y);
      y += 10;
    });
    y += 4;
  }

  // Payments
  let payments = data.payments || [];
  payments.forEach((p) => {
    y = addDashedSeparator(doc, y, leftX, rightX);
    y = checkPageBreak(doc, y, 40, margin);

    let payType = (p.paymentType || p.method || "").toUpperCase();

    // Payment type header
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(payType + " PAYMENT", rightX, y, { align: "right" });
    y += 13;

    // Amount charged
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Amount charged:", rightX - doc.getTextWidth("$" + formatCents(p.amountCaptured || 0)) - 4 - doc.getTextWidth("Amount charged: "), y);
    doc.text("$" + formatCents(p.amountCaptured || 0), rightX, y, { align: "right" });
    y += 12;

    // Card details block
    let pLast4 = p.last4 || data.last4 || "";
    if (pLast4) {
      let pCardType = (p.cardType || data.cardType || "").toUpperCase();
      if (pCardType) {
        doc.text(pCardType + "  *****" + pLast4, rightX, y, { align: "right" });
        y += 11;
      }
      if (data.cardIssuer) {
        doc.text(data.cardIssuer, rightX, y, { align: "right" });
        y += 11;
      }
      let expMonth = p.expMonth || data.expMonth || "";
      let expYear = p.expYear || data.expYear || "";
      if (expMonth && expYear) {
        doc.text(expMonth + "/" + expYear, rightX, y, { align: "right" });
        y += 11;
      }
      let authCode = p.authorizationCode || data.authorizationCode || "";
      if (authCode) {
        doc.text("authorization:    " + authCode, rightX, y, { align: "right" });
        y += 11;
      }
    }

    // Cash/check block
    if (payType === "CASH" || payType === "CHECK") {
      let tendered = p.amountTendered != null ? p.amountTendered : (data.amountTendered || 0);
      doc.text("Cash amount tendered:", rightX - doc.getTextWidth("$" + formatCents(tendered)) - 4 - doc.getTextWidth("Cash amount tendered: "), y);
      doc.text("$" + formatCents(tendered), rightX, y, { align: "right" });
      y += 12;
      let changeDisplay = data.cashChangeGivenDisplay || "$0.00";
      doc.text("Change given:", rightX - doc.getTextWidth(changeDisplay) - 4 - doc.getTextWidth("Change given: "), y);
      doc.text(changeDisplay, rightX, y, { align: "right" });
      y += 12;
    }

    y += 2;
  });

  // Refunds section
  let refunds = data.refunds || [];
  if (refunds.length > 0) {
    y = addDashedSeparator(doc, y, leftX, rightX);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("PREVIOUS REFUNDS", centerX, y, { align: "center" });
    y += 12;
    y = addDashedSeparator(doc, y, leftX, rightX);

    refunds.forEach((r, idx) => {
      y = checkPageBreak(doc, y, 40, margin);
      if (r.refundAmount != null) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Refund:", rightX - doc.getTextWidth("$" + formatCents(r.refundAmount)) - 4 - doc.getTextWidth("Refund: "), y);
        doc.text("$" + formatCents(r.refundAmount), rightX, y, { align: "right" });
        y += 12;
      }
      doc.setFont("helvetica", "normal");
      if (r.refundType) {
        doc.text("Refunded via:", rightX - doc.getTextWidth(r.refundType) - 4 - doc.getTextWidth("Refunded via: "), y);
        doc.text(r.refundType, rightX, y, { align: "right" });
        y += 12;
      }
      if (r.cardRefundID) {
        doc.text("Ref ID:", rightX - doc.getTextWidth(r.cardRefundID) - 4 - doc.getTextWidth("Ref ID: "), y);
        doc.text(r.cardRefundID, rightX, y, { align: "right" });
        y += 12;
      }
      if (idx < refunds.length - 1) {
        y = addDashedSeparator(doc, y, leftX, rightX);
      }
    });

    y = addDashedSeparator(doc, y, leftX, rightX);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Total Refunded:", rightX - doc.getTextWidth("$" + formatCents(data.totalRefunded || 0)) - 4 - doc.getTextWidth("Total Refunded: "), y);
    doc.text("$" + formatCents(data.totalRefunded || 0), rightX, y, { align: "right" });
    y += 14;
  }

  // Thank you blurb
  y = addDashedSeparator(doc, y, leftX, rightX);
  if (data.thankYouBlurb) {
    y = checkPageBreak(doc, y, 40, margin);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    let thankLines = doc.splitTextToSize(data.thankYouBlurb, contentWidth);
    thankLines.forEach((line) => {
      doc.text(line, centerX, y, { align: "center" });
      y += 9;
    });
    y += 6;
  }

  return doc.output("datauristring").split(",")[1];
}

function formatPhone(phone) {
  if (!phone || phone.length < 10) return phone || "";
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  return phone;
}

function addDashedSeparator(doc, y, x1, x2) {
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let dash = "- ";
  let dashWidth = doc.getTextWidth(dash);
  let totalWidth = x2 - x1;
  let count = Math.floor(totalWidth / dashWidth);
  let dashes = dash.repeat(count);
  doc.text(dashes, x1, y);
  return y + 10;
}

module.exports = {
  generateSaleReceiptPDF,
  generateRefundReceiptPDF,
  generateCreditReceiptPDF,
  generateGiftCardReceiptPDF,
  generateWorkorderTicketPDF,
  generateTransactionReceiptPDF,
  DEFAULT_SALE_LABELS,
};
