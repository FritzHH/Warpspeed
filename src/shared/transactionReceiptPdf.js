import { jsPDF } from "jspdf";

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

function formatPhone(phone) {
  if (!phone || phone.length < 10) return phone || "";
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  return phone;
}

export function buildTransactionReceiptPDF(data) {
  let pageWidth = 226;
  let margin = 10;
  let contentWidth = pageWidth - margin * 2;
  let centerX = pageWidth / 2;
  let leftX = margin;
  let rightX = pageWidth - margin;

  let doc = new jsPDF({ unit: "pt", format: [pageWidth, 800] });
  let y = margin + 10;

  if (data.barcode || data.id) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(data.barcode || data.id, centerX, y, { align: "center" });
    y += 12;
  }

  y = addShopHeader(doc, y, data, centerX);

  let depositType = (data.depositType || "").toLowerCase();
  let titleText = depositType === "giftcard" ? "Gift Card Purchase"
    : depositType === "deposit" ? "Customer Deposit"
    : "Transaction Receipt";
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(titleText, centerX, y, { align: "center" });
  y += 16;

  let dateStr = data.transactionDateTime || data.dateTime || "";
  if (dateStr) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(dateStr, centerX, y, { align: "center" });
    y += 12;
  }

  let custName = [(data.customerFirstName || ""), (data.customerLastName || "")].filter(Boolean).join(" ").toUpperCase();
  if (custName) {
    y += 4;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(custName, centerX, y, { align: "center" });
    y += 14;
  }

  let contact = data.customerContact || formatPhone(data.customerCell) || data.customerEmail || "";
  if (contact) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(contact, centerX, y, { align: "center" });
    y += 12;
  }

  y += 2;
  y = addDashedSeparator(doc, y, leftX, rightX);
  if (data.startedBy) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("processed by: " + data.startedBy, centerX, y, { align: "center" });
    y += 12;
  }
  y = addDashedSeparator(doc, y, leftX, rightX);

  let amountLabel = depositType === "giftcard" ? "Gift Card Amount:" : "Deposit Amount:";
  y += 4;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(amountLabel, rightX - doc.getTextWidth("$" + formatCents(data.amountCaptured || data.total || 0)) - 4 - doc.getTextWidth(amountLabel + " "), y);
  doc.text("$" + formatCents(data.amountCaptured || data.total || 0), rightX, y, { align: "right" });
  y += 16;

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

  let payments = data.payments || [];
  payments.forEach((p) => {
    y = addDashedSeparator(doc, y, leftX, rightX);
    y = checkPageBreak(doc, y, 40, margin);

    let payType = (p.paymentType || p.method || "").toUpperCase();

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(payType + " PAYMENT", rightX, y, { align: "right" });
    y += 13;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Amount charged:", rightX - doc.getTextWidth("$" + formatCents(p.amountCaptured || 0)) - 4 - doc.getTextWidth("Amount charged: "), y);
    doc.text("$" + formatCents(p.amountCaptured || 0), rightX, y, { align: "right" });
    y += 12;

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
      let refAmount = r.refundAmount != null ? r.refundAmount : r.amount;
      if (refAmount != null) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Refund:", rightX - doc.getTextWidth("$" + formatCents(refAmount)) - 4 - doc.getTextWidth("Refund: "), y);
        doc.text("$" + formatCents(refAmount), rightX, y, { align: "right" });
        y += 12;
      }
      doc.setFont("helvetica", "normal");
      let refType = r.refundType || r.method;
      if (refType) {
        doc.text("Refunded via:", rightX - doc.getTextWidth(refType) - 4 - doc.getTextWidth("Refunded via: "), y);
        doc.text(refType, rightX, y, { align: "right" });
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

  return doc;
}

export function saveTransactionReceiptPDF(data, filename) {
  let doc = buildTransactionReceiptPDF(data);
  let name = filename || ("transaction-" + (data.barcode || data.id || Date.now()) + ".pdf");
  doc.save(name);
  return doc;
}
