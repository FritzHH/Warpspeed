/* eslint-disable */
import { jsPDF } from "jspdf";

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
  return y + 6;
}

function addShopHeader(doc, y, data, centerX) {
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(data.shopName || "Bonita Bikes LLC", centerX, y, { align: "center" });
  y += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let contactLines = (data.shopContactBlurb || "").split("\n").map((s) => s.trim());
  contactLines.forEach((line) => {
    doc.text(line, centerX, y, { align: "center" });
    y += 4;
  });

  return y + 2;
}

function addTotalRow(doc, y, label, value, leftX, rightX, bold) {
  doc.setFontSize(9);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.text(label, leftX, y);
  doc.text("$" + formatCents(value), rightX, y, { align: "right" });
  return y + 5;
}

function addTotals(doc, y, data, leftX, rightX) {
  y = addTotalRow(doc, y, "Subtotal", data.runningSubtotal || data.subtotal || 0, leftX, rightX, false);

  if ((data.runningDiscount || data.discount || 0) > 0) {
    y = addTotalRow(doc, y, "Discount", -(data.runningDiscount || data.discount || 0), leftX, rightX, false);
  }

  y = addTotalRow(doc, y, "Sales Tax", data.runningTax || data.tax || 0, leftX, rightX, false);

  if ((data.cardFee || 0) > 0) {
    let label = "Card Fee" + (data.cardFeePercent ? " (" + data.cardFeePercent + "%)" : "");
    y = addTotalRow(doc, y, label, data.cardFee, leftX, rightX, false);
  }

  y += 2;
  y = addTotalRow(doc, y, "TOTAL", data.runningTotal || data.total || 0, leftX, rightX, true);
  return y;
}

function addLineItems(doc, lines, y, leftX, rightX, margin, includeReceiptNotes) {
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Item", leftX, y);
  doc.text("Qty", rightX - 40, y, { align: "right" });
  doc.text("Price", rightX - 18, y, { align: "right" });
  doc.text("Total", rightX, y, { align: "right" });
  y += 2;
  doc.setDrawColor(180);
  doc.line(leftX, y, rightX, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  (lines || []).forEach((line) => {
    y = checkPageBreak(doc, y, 18, margin);

    let name = line.itemName || "Item";
    doc.setFontSize(9);
    doc.text(name, leftX, y, { maxWidth: rightX - leftX - 55 });
    let nameLines = doc.splitTextToSize(name, rightX - leftX - 55);
    let nameHeight = nameLines.length * 4;

    doc.setFontSize(8);
    let qty = String(line.qty || 1);
    let unitPrice = formatCents(line.price || 0);
    let lineTotal = formatCents((line.finalPrice || line.price || 0) * (line.qty || 1));
    doc.text(qty, rightX - 40, y, { align: "right" });
    doc.text("$" + unitPrice, rightX - 18, y, { align: "right" });
    doc.text("$" + lineTotal, rightX, y, { align: "right" });

    y += Math.max(nameHeight, 4) + 1;

    // Discount info
    if (line.discountName && (line.discountSavings || 0) > 0) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text("  Discount: " + line.discountName + " (-$" + formatCents(line.discountSavings) + ")", leftX, y);
      doc.setTextColor(0);
      y += 4;
    }

    // Receipt notes
    if (includeReceiptNotes && line.receiptNotes) {
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      let noteLines = doc.splitTextToSize("Note: " + line.receiptNotes, rightX - leftX - 10);
      noteLines.forEach((nl) => {
        y = checkPageBreak(doc, y, 5, margin);
        doc.text(nl, leftX + 4, y);
        y += 3.5;
      });
      doc.setTextColor(0);
      y += 1;
    }

    y += 2;
  });

  return y;
}

////////////////////////////////////////////////////////////////////////////////
// Sale Receipt PDF
////////////////////////////////////////////////////////////////////////////////

export function generateSaleReceiptPDF(data) {
  // Receipt-style narrow PDF (80mm wide)
  let pageWidth = 226; // ~80mm in pt
  let margin = 10;
  let contentWidth = pageWidth - margin * 2;
  let centerX = pageWidth / 2;
  let leftX = margin;
  let rightX = pageWidth - margin;

  let doc = new jsPDF({ unit: "pt", format: [pageWidth, 800] });
  let y = margin + 5;

  // Shop header
  y = addShopHeader(doc, y, data, centerX);
  y = addDivider(doc, y, leftX, rightX);

  // Receipt type
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("SALE RECEIPT", centerX, y, { align: "center" });
  y += 8;

  // Customer info
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let custName = [(data.first || ""), (data.last || "")].filter(Boolean).join(" ");
  if (custName) {
    doc.text("Customer: " + custName, leftX, y);
    y += 4;
  }
  if (data.customerContact) {
    doc.text("Contact: " + data.customerContact, leftX, y);
    y += 4;
  }

  // Workorder # and date
  if (data.workorderNumber) {
    doc.text("WO #: " + data.workorderNumber, leftX, y);
    y += 4;
  }
  if (data.millis || data.startedOnMillis) {
    let dateStr = new Date(Number(data.millis || data.startedOnMillis)).toLocaleDateString();
    doc.text("Date: " + dateStr, leftX, y);
    y += 4;
  }

  y += 2;
  y = addDivider(doc, y, leftX, rightX);

  // Line items
  y = addLineItems(doc, data.workorderLines, y, leftX, rightX, margin, false);
  y = addDivider(doc, y, leftX, rightX);

  // Totals
  y = addTotals(doc, y, data, leftX, rightX);
  y += 4;
  y = addDivider(doc, y, leftX, rightX);

  // Payments
  let payments = data.payments || [];
  if (payments.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Payments", leftX, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    payments.forEach((p) => {
      y = checkPageBreak(doc, y, 10, margin);
      let type = p.cash ? "Cash" : p.cardType || "Card";
      let amount = "$" + formatCents(p.amountCaptured || 0);
      let detail = p.last4 ? " (..."+  p.last4 + ")" : "";
      doc.text(type + detail + "  " + amount, leftX + 4, y);
      y += 4;

      if (p.cash && p.amountTendered > p.amountCaptured) {
        let change = p.amountTendered - p.amountCaptured;
        doc.text("  Tendered: $" + formatCents(p.amountTendered) + "  Change: $" + formatCents(change), leftX + 4, y);
        y += 4;
      }
    });
    y += 2;

    // Amount paid summary
    if (data.amountCaptured > 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Amount Paid: $" + formatCents(data.amountCaptured), leftX, y);
      y += 6;
    }

    y = addDivider(doc, y, leftX, rightX);
  }

  // Thank you blurb
  if (data.thankYouBlurb) {
    y = checkPageBreak(doc, y, 30, margin);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    let thankLines = doc.splitTextToSize(data.thankYouBlurb, contentWidth);
    thankLines.forEach((line) => {
      doc.text(line, centerX, y, { align: "center" });
      y += 3.5;
    });
    y += 4;
  }

  // Barcode text
  if (data.barcode) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(data.barcode, centerX, y, { align: "center" });
    y += 6;
  }

  // Return base64 for Cloud Storage upload
  return doc.output("datauristring").split(",")[1];
}

////////////////////////////////////////////////////////////////////////////////
// Workorder Ticket PDF
////////////////////////////////////////////////////////////////////////////////

export function generateWorkorderTicketPDF(data) {
  let pageWidth = 612; // letter width in pt
  let pageHeight = 792;
  let margin = 40;
  let leftX = margin;
  let rightX = pageWidth - margin;
  let centerX = pageWidth / 2;

  let doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = margin + 10;

  // Shop header
  y = addShopHeader(doc, y, data, centerX);
  y = addDivider(doc, y, leftX, rightX);

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("WORKORDER TICKET", centerX, y, { align: "center" });
  y += 10;

  // Workorder info row
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  let infoItems = [];
  if (data.workorderNumber) infoItems.push("WO #: " + data.workorderNumber);
  if (data.startedOnMillis) infoItems.push("Date: " + new Date(Number(data.startedOnMillis)).toLocaleDateString());
  if (data.status) infoItems.push("Status: " + data.status);
  if (data.startedBy) infoItems.push("By: " + data.startedBy);
  if (infoItems.length > 0) {
    doc.text(infoItems.join("   |   "), centerX, y, { align: "center" });
    y += 6;
  }

  y += 2;

  // Customer info
  let custName = [(data.first || ""), (data.last || "")].filter(Boolean).join(" ");
  if (custName) {
    doc.setFont("helvetica", "bold");
    doc.text("Customer: ", leftX, y);
    doc.setFont("helvetica", "normal");
    doc.text(custName, leftX + 50, y);
    y += 5;
  }
  if (data.customerContact) {
    doc.text("Contact: " + data.customerContact, leftX, y);
    y += 5;
  }

  y += 2;

  // Bike info
  let bikeInfo = [data.brand, data.model].filter(Boolean).join(" ");
  if (bikeInfo) {
    doc.setFont("helvetica", "bold");
    doc.text("Bike: ", leftX, y);
    doc.setFont("helvetica", "normal");
    doc.text(bikeInfo, leftX + 28, y);
    y += 5;
  }
  if (data.description) {
    doc.text("Description: " + data.description, leftX, y);
    y += 5;
  }
  let colors = [data.color1, data.color2].filter(Boolean).join(", ");
  if (colors) {
    doc.text("Colors: " + colors, leftX, y);
    y += 5;
  }
  if (data.waitTime) {
    doc.text("Estimate: " + data.waitTime, leftX, y);
    y += 5;
  }

  y += 2;
  y = addDivider(doc, y, leftX, rightX);

  // Line items (with receiptNotes, NO intakeNotes)
  y = addLineItems(doc, data.workorderLines, y, leftX, rightX, margin, true);
  y = addDivider(doc, y, leftX, rightX);

  // Totals
  let totalsLeftX = rightX - 150;
  y = addTotals(doc, y, data, totalsLeftX, rightX);

  y += 6;
  y = addDivider(doc, y, leftX, rightX);

  // Customer notes (NOT internalNotes)
  let customerNotes = data.customerNotes;
  if (customerNotes && customerNotes.length > 0) {
    y = checkPageBreak(doc, y, 20, margin);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Notes", leftX, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    customerNotes.forEach((note) => {
      y = checkPageBreak(doc, y, 10, margin);
      let noteText = typeof note === "string" ? note : note.text || note.note || "";
      if (noteText) {
        let noteLines = doc.splitTextToSize("• " + noteText, rightX - leftX - 10);
        noteLines.forEach((nl) => {
          doc.text(nl, leftX + 4, y);
          y += 4;
        });
        y += 2;
      }
    });
    y += 2;
    y = addDivider(doc, y, leftX, rightX);
  }

  // Intake blurb disclaimer
  if (data.intakeBlurb) {
    y = checkPageBreak(doc, y, 25, margin);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    let blurbLines = doc.splitTextToSize(data.intakeBlurb, rightX - leftX);
    blurbLines.forEach((line) => {
      doc.text(line, centerX, y, { align: "center" });
      y += 3.5;
    });
    doc.setTextColor(0);
    y += 6;
  }

  // Barcode text
  if (data.barcode) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(data.barcode, centerX, y, { align: "center" });
    y += 6;
  }

  // Return base64 for Cloud Storage upload
  return doc.output("datauristring").split(",")[1];
}
