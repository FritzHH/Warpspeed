import { jsPDF } from "jspdf";
import { DEFAULT_SALE_LABELS } from "./receiptLabels";

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

export function buildSaleReceiptPDF(data, labels) {
  let L = { ...DEFAULT_SALE_LABELS, ...(labels || {}) };
  let pageWidth = 226;
  let margin = 10;
  let contentWidth = pageWidth - margin * 2;
  let centerX = pageWidth / 2;
  let leftX = margin;
  let rightX = pageWidth - margin;

  let doc = new jsPDF({ unit: "pt", format: [pageWidth, 800] });
  let y = margin + 10;

  y = addShopHeader(doc, y, data, centerX);

  if (data.barcode) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(data.barcode, centerX, y, { align: "center" });
    y += 10;
  }

  y = addDivider(doc, y, leftX, rightX);

  y += 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(L.title, centerX, y, { align: "center" });
  y += 14;

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

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let custName = [cap(data.first), cap(data.last)].filter(Boolean).join(" ");
  if (custName) {
    doc.text(L.customer + ": " + custName, leftX, y);
    y += 11;
  }
  if (data.customerCell) {
    doc.text("Account Phone: " + (data.customerContact || data.customerCell), leftX, y);
    y += 11;
  } else if (data.customerContact) {
    doc.text(L.contact + ": " + data.customerContact, leftX, y);
    y += 11;
  }

  if (data.workorderNumber) {
    doc.text(L.woNumber + ": " + formatWorkorderNumber(data.workorderNumber), leftX, y);
    y += 11;
  }

  y += 4;
  y = addDivider(doc, y, leftX, rightX);

  y = addLineItems(doc, data.workorderLines, y, leftX, rightX, margin, true, L);
  y = addDivider(doc, y, leftX, rightX);

  y = addTotals(doc, y, data, leftX, rightX, L);
  y += 4;
  y = addDivider(doc, y, leftX, rightX);

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
      let type = p.method === "cash" ? L.cash : p.method === "check" ? "Check" : p.cardType || L.card;
      let amount = "$" + formatCents(p.amountCaptured || 0);
      let detail = p.last4 ? " (..." + p.last4 + ")" : "";
      doc.text(type + detail + "  " + amount, leftX + 4, y);
      y += 11;

      if (p.method === "card" && p.authorizationCode) {
        doc.text("  " + L.auth + ": " + p.authorizationCode, leftX + 4, y);
        y += 11;
      }

      if (p.method === "cash" && p.amountTendered > p.amountCaptured) {
        let change = p.amountTendered - p.amountCaptured;
        doc.text("  " + L.tendered + ": $" + formatCents(p.amountTendered) + "  " + L.change + ": $" + formatCents(change), leftX + 4, y);
        y += 11;
      }
    });
    y += 4;

    if (data.amountCaptured > 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(L.amountPaid + ": $" + formatCents(data.amountCaptured), leftX, y);
      y += 14;
    }

    y = addDivider(doc, y, leftX, rightX);
  }

  let customerNotes = data.customerNotes || [];
  if (customerNotes.length > 0) {
    y = checkPageBreak(doc, y, 30, margin);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(L.notesHeader, leftX, y);
    y += 13;

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

  if (data.taxFree) {
    y = checkPageBreak(doc, y, 20, margin);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    let taxFreeText = data.taxFreeReceiptNote
      || "* This ticket contained only labor, no sale items were transferred to the customer *";
    let taxFreeLines = doc.splitTextToSize(taxFreeText, contentWidth);
    taxFreeLines.forEach((line) => {
      doc.text(line, centerX, y, { align: "center" });
      y += 9;
    });
    doc.setTextColor(0);
    y += 6;
  }

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

  return doc;
}

export function saveSaleReceiptPDF(data, labels, filename) {
  let doc = buildSaleReceiptPDF(data, labels);
  let name = filename || ("receipt-" + (data.barcode || data.workorderNumber || Date.now()) + ".pdf");
  doc.save(name);
  return doc;
}
