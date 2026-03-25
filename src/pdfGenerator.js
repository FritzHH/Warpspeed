/* eslint-disable */
import { jsPDF } from "jspdf";

////////////////////////////////////////////////////////////////////////////////
// Default label sets (exported so receiptTranslator can read the keys)
////////////////////////////////////////////////////////////////////////////////

export const DEFAULT_SALE_LABELS = {
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
  notesHeader: "Notes for our customer:",
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

  // Column headers
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

    // Discount info
    if (line.discountName && (line.discountSavings || 0) > 0) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text("  " + L.discountPrefix + ": " + line.discountName + " (-$" + formatCents(line.discountSavings) + ")", leftX, y);
      doc.setTextColor(0);
      y += 10;
    }

    // Receipt notes
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
// Sale Receipt PDF
////////////////////////////////////////////////////////////////////////////////

export function generateSaleReceiptPDF(data, labels) {
  let L = { ...DEFAULT_SALE_LABELS, ...(labels || {}) };
  let pageWidth = 226; // ~80mm in pt
  let margin = 10;
  let contentWidth = pageWidth - margin * 2;
  let centerX = pageWidth / 2;
  let leftX = margin;
  let rightX = pageWidth - margin;

  let doc = new jsPDF({ unit: "pt", format: [pageWidth, 800] });
  let y = margin + 10;

  // Shop header
  y = addShopHeader(doc, y, data, centerX);
  y = addDivider(doc, y, leftX, rightX);

  // Receipt type
  y += 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(L.title, centerX, y, { align: "center" });
  y += 14;

  // Transaction date/time — directly below title
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (data.transactionDateTime) {
    doc.text(data.transactionDateTime, centerX, y, { align: "center" });
    y += 10;
  } else if (data.millis || data.startedOnMillis) {
    let d = new Date(Number(data.millis || data.startedOnMillis));
    let dateStr = d.toLocaleDateString() + "  " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    doc.text(dateStr, centerX, y, { align: "center" });
    y += 10;
  }
  y += 6;

  // Customer info
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let custName = [(data.first || ""), (data.last || "")].filter(Boolean).join(" ");
  if (custName) {
    doc.text(L.customer + ": " + custName, leftX, y);
    y += 11;
  }
  if (data.customerContact) {
    doc.text(L.contact + ": " + data.customerContact, leftX, y);
    y += 11;
  }

  // Workorder #
  if (data.workorderNumber) {
    doc.text(L.woNumber + ": " + data.workorderNumber, leftX, y);
    y += 11;
  }

  y += 4;
  y = addDivider(doc, y, leftX, rightX);

  // Line items
  y = addLineItems(doc, data.workorderLines, y, leftX, rightX, margin, false, L);
  y = addDivider(doc, y, leftX, rightX);

  // Totals
  y = addTotals(doc, y, data, leftX, rightX, L);
  y += 4;
  y = addDivider(doc, y, leftX, rightX);

  // Payments
  let payments = data.payments || [];
  if (payments.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(L.payments, leftX, y);
    y += 13;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    payments.forEach((p) => {
      y = checkPageBreak(doc, y, 20, margin);
      let type = p.cash ? L.cash : p.cardType || L.card;
      let amount = "$" + formatCents(p.amountCaptured || 0);
      let detail = p.last4 ? " (..." + p.last4 + ")" : "";
      doc.text(type + detail + "  " + amount, leftX + 4, y);
      y += 11;

      if (!p.cash && p.authorizationCode) {
        doc.text("  " + L.auth + ": " + p.authorizationCode, leftX + 4, y);
        y += 11;
      }

      if (p.cash && p.amountTendered > p.amountCaptured) {
        let change = p.amountTendered - p.amountCaptured;
        doc.text("  " + L.tendered + ": $" + formatCents(p.amountTendered) + "  " + L.change + ": $" + formatCents(change), leftX + 4, y);
        y += 11;
      }
    });
    y += 4;

    // Amount paid summary
    if (data.amountCaptured > 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(L.amountPaid + ": $" + formatCents(data.amountCaptured), leftX, y);
      y += 14;
    }

    y = addDivider(doc, y, leftX, rightX);
  }

  // Notes section — receipt notes from line items, then customer notes
  let receiptNoteLines = (data.workorderLines || []).filter((l) => l.receiptNotes);
  let customerNotes = data.customerNotes || [];
  if (receiptNoteLines.length > 0 || customerNotes.length > 0) {
    y = checkPageBreak(doc, y, 30, margin);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(L.notesHeader, leftX, y);
    y += 13;

    // Receipt notes grouped by item
    receiptNoteLines.forEach((line) => {
      y = checkPageBreak(doc, y, 20, margin);
      let itemName = (line.itemName || L.itemHeader) + ":";
      doc.setFontSize(8);

      // Item name — bold underline, wraps on its own line(s)
      doc.setFont("helvetica", "bolditalic");
      let nameWrapped = doc.splitTextToSize(itemName, contentWidth);
      nameWrapped.forEach((nl, i) => {
        if (i > 0) { y += 9; y = checkPageBreak(doc, y, 10, margin); }
        doc.text(nl, leftX, y);
        let nlWidth = doc.getTextWidth(nl);
        doc.setLineWidth(0.4);
        doc.setDrawColor(0);
        doc.line(leftX, y + 1.5, leftX + nlWidth, y + 1.5);
      });
      y += 10;

      // Receipt note — normal font, indented
      doc.setFont("helvetica", "normal");
      let noteWrapped = doc.splitTextToSize(line.receiptNotes, contentWidth - 8);
      noteWrapped.forEach((nl, i) => {
        if (i > 0) { y += 9; y = checkPageBreak(doc, y, 10, margin); }
        doc.text(nl, leftX + 4, y);
      });
      y += 11;
    });

    // Whitespace between receipt notes and customer notes
    if (receiptNoteLines.length > 0 && customerNotes.length > 0) {
      y += 6;
    }

    // Customer notes
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    customerNotes.forEach((note) => {
      y = checkPageBreak(doc, y, 12, margin);
      let noteText = typeof note === "string" ? note : note.value || note.text || note.note || "";
      if (noteText) {
        let noteLines = doc.splitTextToSize("• " + noteText, contentWidth - 6);
        noteLines.forEach((nl) => {
          doc.text(nl, leftX + 2, y);
          y += 9;
        });
        y += 2;
      }
    });

    y += 2;
    y = addDivider(doc, y, leftX, rightX);
  }

  // Tax-free / labor-only disclaimer
  if (data.taxFree) {
    y = checkPageBreak(doc, y, 20, margin);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    let taxFreeText = "* This ticket contained only labor, no sale items were transferred to the customer *";
    let taxFreeLines = doc.splitTextToSize(taxFreeText, contentWidth);
    taxFreeLines.forEach((line) => {
      doc.text(line, centerX, y, { align: "center" });
      y += 9;
    });
    doc.setTextColor(0);
    y += 6;
  }

  // Thank you blurb
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

  // Barcode text
  if (data.barcode) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(data.barcode, centerX, y, { align: "center" });
    y += 10;
  }

  // Return base64 for Cloud Storage upload
  return doc.output("datauristring").split(",")[1];
}

////////////////////////////////////////////////////////////////////////////////
// Workorder Ticket PDF
////////////////////////////////////////////////////////////////////////////////

export function generateWorkorderTicketPDF(data) {
  let pageWidth = 340;
  let margin = 14;
  let leftX = margin;
  let rightX = pageWidth - margin;
  let centerX = pageWidth / 2;
  let contentWidth = rightX - leftX;

  let doc = new jsPDF({ unit: "pt", format: [pageWidth, 900] });
  let y = margin + 10;

  // Shop header
  y = addShopHeader(doc, y, data, centerX);
  y = addDivider(doc, y, leftX, rightX);

  // Title
  y += 10;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  let ticketTitle = data.receiptType === "Intake" ? "INTAKE TICKET" : "WORKORDER TICKET";
  doc.text(ticketTitle, centerX, y, { align: "center" });
  y += 18;

  // Workorder info
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (data.workorderNumber) { doc.text("WO #: " + data.workorderNumber, leftX, y); y += 12; }
  if (data.startedOnMillis) { doc.text("Date: " + new Date(Number(data.startedOnMillis)).toLocaleDateString(), leftX, y); y += 12; }
  if (data.status) { doc.text("Status: " + data.status, leftX, y); y += 12; }
  if (data.startedBy) { doc.text("By: " + data.startedBy, leftX, y); y += 12; }

  y += 4;

  // Customer info
  let custName = [(data.first || ""), (data.last || "")].filter(Boolean).join(" ");
  if (custName) {
    doc.setFont("helvetica", "bold");
    doc.text("Customer: ", leftX, y);
    doc.setFont("helvetica", "normal");
    doc.text(custName, leftX + 55, y);
    y += 12;
  }
  if (data.customerContact) {
    doc.text("Contact: " + data.customerContact, leftX, y);
    y += 12;
  }

  y += 4;

  // Bike info
  let bikeInfo = [data.brand, data.model].filter(Boolean).join(" ");
  if (bikeInfo) {
    doc.setFont("helvetica", "bold");
    doc.text("Bike: ", leftX, y);
    doc.setFont("helvetica", "normal");
    doc.text(bikeInfo, leftX + 28, y);
    y += 12;
  }
  if (data.description) {
    doc.text("Description: " + data.description, leftX, y);
    y += 12;
  }
  let colors = [data.color1, data.color2].filter(Boolean).join(", ");
  if (colors) {
    doc.text("Colors: " + colors, leftX, y);
    y += 12;
  }
  if (data.waitTime) {
    doc.text("Estimate: " + data.waitTime, leftX, y);
    y += 12;
  }
  if (data.waitTimeEstimateLabel) {
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(data.waitTimeEstimateLabel, leftX, y);
    doc.setTextColor(0);
    doc.setFontSize(9);
    y += 12;
  }

  y += 4;
  y = addDivider(doc, y, leftX, rightX);

  // Line items (with receiptNotes, NO intakeNotes)
  y = addLineItems(doc, data.workorderLines, y, leftX, rightX, margin, true);
  y = addDivider(doc, y, leftX, rightX);

  // Totals
  y = addTotals(doc, y, data, leftX, rightX);

  y += 6;
  y = addDivider(doc, y, leftX, rightX);

  // Customer notes (NOT internalNotes)
  let customerNotes = data.customerNotes;
  if (customerNotes && customerNotes.length > 0) {
    y = checkPageBreak(doc, y, 30, margin);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Notes", leftX, y);
    y += 14;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    customerNotes.forEach((note) => {
      y = checkPageBreak(doc, y, 15, margin);
      let noteText = typeof note === "string" ? note : note.value || note.text || note.note || "";
      if (noteText) {
        let noteLines = doc.splitTextToSize("• " + noteText, contentWidth - 10);
        noteLines.forEach((nl) => {
          doc.text(nl, leftX + 4, y);
          y += 10;
        });
        y += 4;
      }
    });
    y += 4;
    y = addDivider(doc, y, leftX, rightX);
  }

  // Intake blurb disclaimer
  if (data.intakeBlurb) {
    y = checkPageBreak(doc, y, 40, margin);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    let blurbLines = doc.splitTextToSize(data.intakeBlurb, contentWidth);
    blurbLines.forEach((line) => {
      doc.text(line, centerX, y, { align: "center" });
      y += 9;
    });
    doc.setTextColor(0);
    y += 8;
  }

  // Barcode text
  if (data.barcode) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(data.barcode, centerX, y, { align: "center" });
    y += 10;
  }

  // Return base64 for Cloud Storage upload
  return doc.output("datauristring").split(",")[1];
}
