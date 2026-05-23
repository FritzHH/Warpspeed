import { useState, useEffect, lazy, Suspense } from "react";
import { calculateRunningTotals, capitalizeFirstLetterOfString, formatCurrencyDisp, formatMillisForDisplay, formatPhoneWithDashes, lightenRGBByPercent, resolveStatus, formatWorkorderNumber, localStorageWrapper, findTemplateByType, log } from "../../../utils";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { useSettingsStore, useLoginStore, useAlertScreenStore, useOpenWorkordersStore } from "../../../stores";
import { Button, Dialog, DropdownMenu, SHADOW_PROTO, SmallLoadingIndicator, Tooltip } from "../../../dom_components";
import { dbGetCompletedSale, dbSavePrintObj, dbSendReceipt } from "../../../db_calls_wrapper";
import { build_db_path } from "../../../constants";
import { printBuilder } from "../../../utils";
import { saveIntakeReceiptPDF } from "../../../shared/intakeReceiptPdf";
import { readTransactions } from "./newCheckoutModalScreen/newCheckoutFirebaseCalls";
const FullSaleModal = lazy(() =>
  import("../../../dom_components/FullSaleModal/FullSaleModal").then((m) => ({ default: m.FullSaleModal }))
);
import styles from "./ClosedWorkorderModal.module.css";

// ─── Helper display components ──────────────────────────────────

const DetailRow = ({ label, value, valueColor, valueStyle, labelSize = 11, valueSize = 12 }) => {
  if (!value) return null;
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel} style={{ fontSize: labelSize, color: C.textMuted }}>{label}</span>
      <span className={styles.detailValue} style={{ fontSize: valueSize, color: valueColor || C.text, ...valueStyle }}>{value}</span>
    </div>
  );
};

const TotalRow = ({ label, value, isNegative, bold }) => (
  <div className={styles.totalRow}>
    <span className={styles.totalRowLabel} style={{ color: C.textMuted, fontWeight: bold ? 600 : 400 }}>
      {label}
    </span>
    <span
      className={bold ? styles.totalRowValueBold : styles.totalRowValue}
      style={{ color: isNegative ? C.lightred : C.text }}
    >
      {(isNegative ? "-" : "") + "$" + formatCurrencyDisp(Math.abs(value || 0))}
    </span>
  </div>
);

const SectionHeader = ({ text }) => (
  <span className={styles.sectionHeader} style={{ color: C.textMuted }}>
    {text}
  </span>
);

// ─── Sale Card ──────────────────────────────────────────────────

const SaleCard = ({ sale, transactions = [], onPress }) => {
  const payments = transactions;
  const credits = [...(sale.creditsApplied || []), ...(sale.depositsApplied || [])];
  const allRefunds = transactions.flatMap((t) => (t.refunds || []).map((r) => ({ ...r, _parentMethod: t.method })));
  const totalRefunded = allRefunds.reduce((s, r) => s + (r.amount || 0), 0);
  const hasRefunds = totalRefunded > 0;

  return (
    <button
      type="button"
      onClick={() => onPress && onPress(sale)}
      className={`${styles.saleCard} ${!onPress ? styles.saleCardStatic : ""}`}
      style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
    >
      {/* Header */}
      <div className={styles.saleCardHeader}>
        <span className={styles.saleIdText} style={{ color: C.textDisabled }}>
          {"Sale ID: " + sale.id}
        </span>
      </div>

      {!!sale.millis && (
        <span className={styles.saleDateText} style={{ color: C.textMuted, display: "block" }}>
          {formatMillisForDisplay(sale.millis)}
        </span>
      )}

      {/* Totals */}
      <div className={styles.saleTotalsBlock}>
        <div className={styles.saleRow}>
          <span className={styles.saleRowLabel} style={{ color: C.textMuted }}>Subtotal</span>
          <span className={styles.saleRowValue} style={{ color: C.text }}>{"$" + formatCurrencyDisp(sale.subtotal)}</span>
        </div>
        {(sale.discount || 0) > 0 && (
          <div className={styles.saleRow}>
            <span className={styles.saleRowLabel} style={{ color: C.textMuted }}>Discount</span>
            <span className={styles.saleRowValue} style={{ color: C.lightred }}>{"-$" + formatCurrencyDisp(sale.discount)}</span>
          </div>
        )}
        {(sale.salesTax || sale.tax || 0) > 0 && (
          <div className={styles.saleRow}>
            <span className={styles.saleRowLabel} style={{ color: C.textMuted }}>Tax</span>
            <span className={styles.saleRowValue} style={{ color: C.text }}>{"$" + formatCurrencyDisp(sale.salesTax || sale.tax)}</span>
          </div>
        )}
        <div className={styles.hairline} style={{ backgroundColor: C.surfaceAlt }} />
        <div className={styles.saleTotalRow}>
          <span className={styles.saleTotalLabel} style={{ color: C.textMuted }}>Total</span>
          <span className={styles.saleTotalValue} style={{ color: C.text }}>{"$" + formatCurrencyDisp(sale.total)}</span>
        </div>
      </div>

      {/* Payments */}
      {payments.length > 0 && (
        <div className={styles.saleSection}>
          <span className={styles.saleSectionTitle} style={{ color: C.textMuted }}>PAYMENTS</span>
          {payments.map((p, idx) => (
            <div key={p.id || idx} className={styles.saleRow}>
              <span className={styles.saleRowLabel} style={{ color: C.textMuted }}>
                {p.method === "cash" ? "Cash" : p.method === "check" ? "Check" : (p.cardType || "Card") + (p.last4 ? " ..." + p.last4 : "")}
              </span>
              <span className={styles.saleRowValue} style={{ color: C.text }}>{"$" + formatCurrencyDisp(p.amountCaptured)}</span>
            </div>
          ))}
          {(sale.amountCaptured || 0) > 0 && (
            <div className={styles.saleEmphasisRow}>
              <span className={styles.saleEmphasisLabel} style={{ color: C.textMuted }}>Amount Captured</span>
              <span className={styles.saleEmphasisValue} style={{ color: C.text }}>{"$" + formatCurrencyDisp(sale.amountCaptured)}</span>
            </div>
          )}
        </div>
      )}

      {/* Credits / Deposits */}
      {credits.length > 0 && (
        <div className={styles.saleSection}>
          <span className={styles.saleSectionTitle} style={{ color: C.orange }}>CREDITS / DEPOSITS</span>
          {credits.map((c, idx) => (
            <div key={c.id || idx} className={styles.saleRow}>
              <span className={styles.saleRowLabel} style={{ color: C.orange }}>
                {capitalizeFirstLetterOfString(c.type || "deposit")}
              </span>
              <span className={styles.saleRowValue} style={{ color: C.text }}>{"$" + formatCurrencyDisp(c.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Refunds */}
      {hasRefunds && (
        <div className={styles.saleSection}>
          <span className={styles.saleSectionTitle} style={{ color: C.lightred }}>REFUNDS</span>
          {allRefunds.map((r, idx) => (
            <div key={r.id || idx} className={styles.saleRow}>
              <span className={styles.saleRowLabel} style={{ color: C.lightred }}>
                {r.notes ? (typeof r.notes === "string" ? r.notes : r.notes.reason || "") : (r.method || "card").toUpperCase() + " Refund"}
              </span>
              <span className={styles.saleRowValue} style={{ color: C.lightred }}>{"-$" + formatCurrencyDisp(r.amount)}</span>
            </div>
          ))}
          <div className={styles.saleEmphasisRow}>
            <span className={styles.saleEmphasisLabel} style={{ color: C.lightred }}>Total Refunded</span>
            <span className={styles.saleEmphasisValue} style={{ color: C.lightred }}>{"-$" + formatCurrencyDisp(totalRefunded)}</span>
          </div>
        </div>
      )}
    </button>
  );
};

// ─── Note Item ──────────────────────────────────────────────────

const NoteItem = ({ note, color }) => {
  if (!note) return null;
  const text = typeof note === "string" ? note : note.text || note.note || "";
  const millis = note.millis || note.timestamp || null;
  const user = note.user || note.userName || "";
  if (!text) return null;
  return (
    <div className={styles.noteItem} style={{ borderLeftColor: color }}>
      <span className={styles.noteText} style={{ color: C.text }}>{text}</span>
      {(!!millis || !!user) && (
        <span className={styles.noteMeta} style={{ color: C.textMuted }}>
          {[user, millis ? formatMillisForDisplay(millis) : ""].filter(Boolean).join(" - ")}
        </span>
      )}
    </div>
  );
};

// ─── Change Log Entry ───────────────────────────────────────────

function formatShortDate(millis) {
  const d = new Date(millis);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  let hours = d.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const mins = d.getMinutes().toString().padStart(2, "0");
  return days[d.getDay()] + ", " + months[d.getMonth()] + " " + day + suffix + ", '" + String(d.getFullYear()).slice(2) + " -- " + hours + ":" + mins + " " + ampm;
}

const ChangeLogEntry = ({ entry, index }) => {
  if (!entry) return null;
  const message = entry.message || entry.text || JSON.stringify(entry);
  const millis = entry.millis || entry.timestamp || null;
  const user = entry.user || entry.userName || "";
  const isAlt = index % 2 === 1;
  return (
    <div
      className={`${styles.changeLogEntry} ${isAlt ? styles.changeLogEntryAlt : ""}`}
      style={{
        borderLeftColor: C.borderSubtle,
        backgroundColor: isAlt ? C.surfaceAlt : "transparent",
      }}
    >
      <span className={styles.changeLogMessage} style={{ color: isAlt ? C.textMuted : C.textMuted }}>{message}</span>
      {(!!millis || !!user) && (
        <span className={styles.changeLogMeta} style={{ color: isAlt ? C.textDisabled : C.textDisabled }}>
          {[user, millis ? formatShortDate(millis) : ""].filter(Boolean).join(" - ")}
        </span>
      )}
    </div>
  );
};

// ─── Main Modal ─────────────────────────────────────────────────

export const ClosedWorkorderModal = ({ workorder, onClose, onGoToWorkorder, onRefund, onArchive }) => {
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const taxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;
  const sIsInOpenList = useOpenWorkordersStore((s) => !!s.workorders.find((w) => w.id === workorder?.id));

  const [sSales, _sSetSales] = useState([]);
  const [sTransactionsMap, _sSetTransactionsMap] = useState({});
  const [sLoadingSales, _sSetLoadingSales] = useState(false);
  const [sShowChangeLog, _sSetShowChangeLog] = useState(false);
  const [sSaleForModal, _sSetSaleForModal] = useState(null);

  // Fetch associated sales when workorder opens
  useEffect(() => {
    if (!workorder) { _sSetSales([]); _sSetTransactionsMap({}); return; }
    const saleIDs = [];
    if (workorder.activeSaleID) saleIDs.push(workorder.activeSaleID);
    if (workorder.saleID && !saleIDs.includes(workorder.saleID)) saleIDs.push(workorder.saleID);
    if (saleIDs.length === 0) { _sSetSales([]); _sSetTransactionsMap({}); return; }

    _sSetLoadingSales(true);
    Promise.all(saleIDs.map((id) => dbGetCompletedSale(id)))
      .then(async (results) => {
        let sales = results.filter(Boolean);
        _sSetSales(sales);
        let txnMap = {};
        await Promise.all(sales.map(async (sale) => {
          if (sale.transactionIDs?.length > 0) {
            txnMap[sale.id] = (await readTransactions(sale.transactionIDs)).filter(Boolean);
          } else {
            txnMap[sale.id] = [];
          }
        }));
        _sSetTransactionsMap(txnMap);
      })
      .finally(() => _sSetLoadingSales(false));
  }, [workorder?.id]);

  if (!workorder) return null;

  const isClosed = !!workorder.paymentComplete;
  const rs = resolveStatus(workorder.status, statuses);
  const totals = calculateRunningTotals(workorder, taxPercent, [], false, !!workorder.taxFree);
  const lines = workorder.workorderLines || [];
  const internalNotes = workorder.internalNotes || [];
  const customerNotes = workorder.customerNotes || [];
  const changeLog = workorder.changeLog || [];
  const mediaCount = workorder.media?.length || 0;

  const customerName = (
    capitalizeFirstLetterOfString(workorder.customerFirst || "") +
    " " +
    capitalizeFirstLetterOfString(workorder.customerLast || "")
  ).trim();

  function handleClose() {
    onClose && onClose();
  }

  function _getCustomerFromWorkorder() {
    return {
      customerCell: workorder.customerCell || "",
      customerLandline: workorder.customerLandline || "",
      email: workorder.customerEmail || "",
      first: workorder.customerFirst || "",
      last: workorder.customerLast || "",
    };
  }

  function handlePrintWorkorder() {
    const _settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.workorder(workorder, _getCustomerFromWorkorder(), _settings?.salesTaxPercent, _ctx);
    dbSavePrintObj(toPrint, localStorageWrapper.getItem("selectedPrinterID") || "");
  }

  function handleDownloadEstimate() {
    const _settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    const receiptData = printBuilder.intake(workorder, _getCustomerFromWorkorder(), _settings?.salesTaxPercent, _ctx);
    saveIntakeReceiptPDF(receiptData);
  }

  function handleDownloadFinalized() {
    const _settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    const receiptData = printBuilder.workorder(workorder, _getCustomerFromWorkorder(), _settings?.salesTaxPercent, _ctx);
    saveIntakeReceiptPDF(receiptData);
  }

  function _sendReceiptForType(receiptType) {
    const _settings = useSettingsStore.getState().getSettings();
    const customer = _getCustomerFromWorkorder();

    const smsTemplate = findTemplateByType(_settings?.smsTemplates || _settings?.textTemplates, "intakeReceipt");
    const emailTemplate = findTemplateByType(_settings?.emailTemplates, "intakeReceipt");

    const shouldSMS = !!customer.customerCell;
    const shouldEmail = !!customer.email;

    const smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
    const emailContent = emailTemplate?.message || emailTemplate?.content || emailTemplate?.body || "";

    const emptyParts = [];
    if (shouldSMS && !smsContent.trim()) emptyParts.push("SMS");
    if (shouldEmail && !emailContent.trim()) emptyParts.push("email");
    if (emptyParts.length > 0) {
      useAlertScreenStore.getState().setValues({
        title: "Empty Template",
        message: "The intake receipt " + emptyParts.join(" and ") + " template is empty. Fill in the template content in Dashboard > " + (emptyParts.includes("SMS") ? "Text Templates" : "Email Templates") + ".",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    }

    const canSMS = shouldSMS && smsContent.trim();
    const canEmail = shouldEmail && emailContent.trim();
    if (!canSMS && !canEmail) {
      useAlertScreenStore.getState().setValues({
        title: "No Contact Info",
        message: "This customer has no phone or email on file.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
      return;
    }

    const sendingMessage = (
      <>
        {canSMS && !!customer.customerCell && (
          <span style={{ display: "block" }}>
            <span style={{ color: C.blue, fontWeight: 600 }}>TEXT</span>
            {" sending to " + formatPhoneWithDashes(customer.customerCell)}
          </span>
        )}
        {canEmail && !!customer.email && (
          <span style={{ display: "block" }}>
            <span style={{ color: C.green, fontWeight: 600 }}>EMAIL</span>
            {" sending to " + customer.email}
          </span>
        )}
      </>
    );
    useAlertScreenStore.getState().setValues({ title: "Sending", message: sendingMessage, canExitOnOuterClick: true, autoDismiss: true, autoDismissMs: 1300 });

    const { tenantID, storeID } = _settings;
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    const receiptData = receiptType === "intake"
      ? printBuilder.intake(workorder, customer, _settings?.salesTaxPercent, _ctx)
      : printBuilder.workorder(workorder, customer, _settings?.salesTaxPercent, _ctx);
    const storagePath = build_db_path.cloudStorage.intakeReceiptPDF(workorder.id, tenantID, storeID);

    const woID = workorder.id;
    useOpenWorkordersStore.getState().setSendStatus?.(woID, "sent");

    dbSendReceipt({
      receiptType,
      receiptData,
      storagePath,
      sendSMS: !!(canSMS && customer.customerCell),
      sendEmail: !!(canEmail && customer.email),
      customerEmail: customer.email || "",
      customerCell: customer.customerCell || "",
      customerID: workorder.customerID || "",
      workorderID: woID,
      saleID: workorder?.activeSaleID || "",
      templateVars: {
        firstName: capitalizeFirstLetterOfString((customer?.first || "Customer").trim()),
        storeName: _settings?.storeInfo?.displayName || "our store",
        brand: workorder.brand || "",
        description: workorder.description || "",
      },
      smsMessageID: crypto.randomUUID(),
      updateWorkorderField: { workorderID: woID, field: "intakeReceiptURL" },
    }).then((result) => {
      if (result?.data?.receiptURL) {
        useOpenWorkordersStore.getState().setField?.("intakeReceiptURL", result.data.receiptURL, woID);
      }
    }).catch((e) => {
      log("sendReceipt (" + receiptType + ") error:", e?.message || String(e));
      useOpenWorkordersStore.getState().setSendStatus?.(woID, "failed");
    });
  }

  function handleSendEstimate() { _sendReceiptForType("intake"); }
  function handleSendFinalized() { _sendReceiptForType("workorder"); }

  const pdfMenuItems = isClosed
    ? [
        { id: "downloadFinalized", label: "Download Finalized Ticket" },
        { id: "sendFinalized", label: "Send Finalized Ticket" },
      ]
    : [
        { id: "downloadEstimate", label: "Download Estimate" },
        { id: "downloadFinalized", label: "Download Finalized Ticket" },
        { id: "sendEstimate", label: "Send Estimate" },
        { id: "sendFinalized", label: "Send Finalized Ticket" },
      ];

  function handlePdfMenuSelect(item) {
    if (!item) return;
    if (item.id === "downloadEstimate") handleDownloadEstimate();
    else if (item.id === "downloadFinalized") handleDownloadFinalized();
    else if (item.id === "sendEstimate") handleSendEstimate();
    else if (item.id === "sendFinalized") handleSendFinalized();
  }

  return (
  <>
    <Dialog visible={true} onClose={onClose} overlayColor={C.surfaceOverlayHeavy}>
      <div
        className={styles.shell}
        style={{
          backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
          ...SHADOW_PROTO,
        }}
      >
        {/* ── Header ── */}
        <div className={styles.header} style={{ backgroundColor: C.backgroundWhite }}>
          <div className={styles.headerLeft}>
            {!!workorder.workorderNumber && (
              <span className={styles.woNumber} style={{ color: C.text }}>
                {"#" + formatWorkorderNumber(workorder.workorderNumber)}
              </span>
            )}
            <span className={styles.idText} style={{ color: C.textDisabled }}>
              {"ID: " + workorder.id}
            </span>
            {!!workorder._importSource && (
              <span
                className={styles.importBadge}
                style={{
                  backgroundColor: lightenRGBByPercent(C.blue, 60),
                  color: C.blue,
                }}
              >
                {workorder._importSource}
              </span>
            )}
            {!!workorder.taxFree && (
              <span
                className={styles.taxFreeBadge}
                style={{
                  backgroundColor: lightenRGBByPercent(C.orange, 60),
                  color: C.orange,
                }}
              >
                TAX FREE
              </span>
            )}
          </div>
          <div className={styles.headerRight}>
            <Button
              text="Print Workorder"
              icon={ICONS.receipt}
              iconSize={16}
              onPress={handlePrintWorkorder}
              buttonStyle={{ paddingHorizontal: 14, height: 32, marginRight: 8, outlineStyle: "none" }}
              textStyle={{ fontSize: 12, color: C.text }}
            />
            <div style={{ marginRight: 8 }}>
              <DropdownMenu
                buttonText="PDF Options"
                dataArr={pdfMenuItems}
                onSelect={handlePdfMenuSelect}
                buttonStyle={{ paddingHorizontal: 14, height: 32 }}
                buttonTextStyle={{ fontSize: 12, color: C.text }}
                itemStyle={{ paddingVertical: 8, paddingHorizontal: 12 }}
                itemTextStyle={{ fontSize: 12 }}
                itemTextAlign="left"
              />
            </div>
            <Button
              text="Close"
              colorGradientArr={COLOR_GRADIENTS.red}
              onPress={handleClose}
              buttonStyle={{ paddingHorizontal: 16, height: 32 }}
              textStyle={{ color: C.textWhite, fontSize: 12 }}
            />
          </div>
        </div>

        {/* ── Active / Closed Banner ── */}
        <div
          className={styles.banner}
          style={{
            backgroundColor: isClosed
              ? lightenRGBByPercent(C.lightred, 55)
              : lightenRGBByPercent(C.green, 55),
          }}
        >
          <span
            className={styles.bannerStatusBadge}
            style={{ backgroundColor: rs.backgroundColor, color: rs.textColor }}
          >
            {rs.label}
          </span>
          <span
            className={styles.bannerTitle}
            style={{ color: isClosed ? C.lightred : C.green }}
          >
            {isClosed ? "CLOSED WORKORDER" : "ACTIVE WORKORDER"}
          </span>
          {!isClosed && onGoToWorkorder && (
            <Button
              text="Go to Workorder"
              colorGradientArr={COLOR_GRADIENTS.green}
              onPress={() => onGoToWorkorder(workorder)}
              buttonStyle={{ paddingHorizontal: 16, height: 32, marginRight: 8 }}
              textStyle={{ color: C.textWhite, fontSize: 12 }}
            />
          )}
          {onArchive && sIsInOpenList && (
            <Tooltip text="Move workorder out of open list" position="bottom">
              <Button
                text="Save & Archive Workorder"
                colorGradientArr={COLOR_GRADIENTS.green}
                onPress={() => onArchive(workorder)}
                buttonStyle={{ paddingHorizontal: 16, height: 32, marginRight: 8 }}
                textStyle={{ color: C.textWhite, fontSize: 12 }}
              />
            </Tooltip>
          )}
          {sSales.length > 0 && (
            <button
              type="button"
              className={styles.viewSaleBtn}
              onClick={() => {
                let sale = sSales[0];
                let enriched = { ...sale, _transactions: sTransactionsMap[sale.id] || [] };
                _sSetSaleForModal(enriched);
              }}
            >
              View Sale
            </button>
          )}
        </div>

        {/* ── Body: three columns ── */}
        <div className={styles.body}>
          {/* ── Column 1: customer info (narrow) ── */}
          <div className={styles.col1}>
            {!workorder.customerID ? (
              <div className={styles.standaloneEmpty}>
                <img src={ICONS.workorder} alt="" className={styles.standaloneIcon} />
                <span className={styles.standaloneTitle} style={{ color: C.textDisabled }}>
                  Standalone Sale
                </span>
                <span className={styles.standaloneSub} style={{ color: C.textDisabled }}>
                  No customer attached
                </span>
              </div>
            ) : (
              <div>
                <SectionHeader text="CUSTOMER" />
                <DetailRow label="Name" value={customerName || null} labelSize={13} valueSize={14} />
                {!!workorder.customerCell && (
                  <DetailRow label="Phone" value={formatPhoneWithDashes(workorder.customerCell)} labelSize={13} valueSize={14} />
                )}
                {!!workorder.customerLandline && (
                  <DetailRow label="Landline" value={formatPhoneWithDashes(workorder.customerLandline)} labelSize={13} valueSize={14} />
                )}
                {!!workorder.customerEmail && (
                  <DetailRow label="Email" value={workorder.customerEmail} labelSize={13} valueSize={14} />
                )}
                {!!workorder.customerContactRestriction && (
                  <DetailRow label="Contact Pref" value={workorder.customerContactRestriction} labelSize={13} valueSize={14} />
                )}
              </div>
            )}

            {/* Bike */}
            <SectionHeader text="BIKE" />
            <DetailRow label="Brand" value={workorder.brand} labelSize={13} valueSize={14} />
            <DetailRow label="Description" value={workorder.description} labelSize={13} valueSize={14} />

            {/* Colors */}
            {(!!workorder.color1?.label || !!workorder.color2?.label) && (
              <div className={styles.colorChipsRow}>
                <span className={styles.colorChipsLabel} style={{ color: C.textMuted }}>Colors</span>
                {!!workorder.color1?.label && (
                  <span
                    className={styles.colorChip}
                    style={{
                      backgroundColor: workorder.color1.backgroundColor,
                      color: workorder.color1.textColor,
                    }}
                  >
                    {workorder.color1.label}
                  </span>
                )}
                {!!workorder.color2?.label && (
                  <span
                    className={`${styles.colorChip} ${styles.colorChipSpaced}`}
                    style={{
                      backgroundColor: workorder.color2.backgroundColor,
                      color: workorder.color2.textColor,
                    }}
                  >
                    {workorder.color2.label}
                  </span>
                )}
              </div>
            )}

            {/* Dates */}
            <SectionHeader text="DATES" />
            <DetailRow
              label="Started"
              labelSize={13}
              valueSize={14}
              value={workorder.startedOnMillis ? formatMillisForDisplay(workorder.startedOnMillis, true) : null}
            />
            <DetailRow
              label="Finished"
              labelSize={13}
              valueSize={14}
              value={workorder.finishedOnMillis ? formatMillisForDisplay(workorder.finishedOnMillis, true) : null}
            />
            <DetailRow
              label="Ended"
              labelSize={13}
              valueSize={14}
              value={workorder.endedOnMillis ? formatMillisForDisplay(workorder.endedOnMillis, true) : null}
            />
            <DetailRow label="Started By" value={workorder.startedBy} labelSize={13} valueSize={14} />

            {/* Service */}
            <SectionHeader text="SERVICE" />
            {!!workorder.waitTime?.label && (
              <DetailRow label="Wait Time" value={workorder.waitTime.label} />
            )}
            {!!workorder.waitTimeEstimateLabel && (
              <DetailRow label="Estimate" value={workorder.waitTimeEstimateLabel} />
            )}
            {!!workorder.partOrdered && (
              <DetailRow label="Part Ordered" value={workorder.partOrdered} />
            )}
            {!!workorder.partSource && (
              <DetailRow label="Part Source" value={workorder.partSource} />
            )}
            {!!workorder.partOrderedMillis && (
              <DetailRow
                label="Part Order Date"
                value={formatMillisForDisplay(workorder.partOrderedMillis, true)}
              />
            )}
            {!!workorder.partOrderEstimateMillis && (
              <DetailRow
                label="Part ETA"
                value={formatMillisForDisplay(workorder.partOrderEstimateMillis, true)}
              />
            )}

            {/* Payment status */}
            {(() => {
              let salePaid = sSales.reduce((sum, s) => sum + (s.amountCaptured || 0) - (s.amountRefunded || 0), 0);
              if (workorder.paymentComplete) {
                return (
                  <DetailRow
                    label="Payment"
                    value={"Paid - $" + formatCurrencyDisp(salePaid || totals.finalTotal)}
                    valueColor={C.green}
                    valueStyle={{ fontWeight: "600" }}
                  />
                );
              }
              if (salePaid > 0) {
                return (
                  <DetailRow
                    label="Partial Paid"
                    value={"$" + formatCurrencyDisp(salePaid)}
                    valueColor={C.orange}
                    valueStyle={{ fontWeight: "600" }}
                  />
                );
              }
              return null;
            })()}

            {/* Media */}
            {mediaCount > 0 && (
              <DetailRow label="Media" value={mediaCount + " item" + (mediaCount > 1 ? "s" : "")} />
            )}

            {/* Tax free note */}
            {!!workorder.taxFree && !!workorder.taxFreeReceiptNote && (
              <DetailRow label="Tax Free Note" value={workorder.taxFreeReceiptNote} valueColor={C.orange} />
            )}

            {/* Internal Notes */}
            {internalNotes.length > 0 && (
              <div>
                <SectionHeader text={"INTERNAL NOTES (" + internalNotes.length + ")"} />
                {internalNotes.map((note, idx) => (
                  <NoteItem key={idx} note={note} color={C.blue} />
                ))}
              </div>
            )}

            {/* Customer Notes */}
            {customerNotes.length > 0 && (
              <div>
                <SectionHeader text={"CUSTOMER NOTES (" + customerNotes.length + ")"} />
                {customerNotes.map((note, idx) => (
                  <NoteItem key={idx} note={note} color={C.green} />
                ))}
              </div>
            )}

            {/* Change Log */}
            {changeLog.length > 0 && (
              <div>
                <button
                  type="button"
                  className={styles.changeLogToggle}
                  onClick={() => _sSetShowChangeLog(!sShowChangeLog)}
                >
                  <span className={styles.changeLogToggleTitle} style={{ color: C.textMuted }}>
                    {"CHANGE LOG (" + changeLog.length + ")"}
                  </span>
                  <span className={styles.changeLogToggleHint} style={{ color: C.textDisabled }}>
                    {sShowChangeLog ? "Hide" : "Show"}
                  </span>
                </button>
                {sShowChangeLog && changeLog.map((entry, idx) => (
                  <ChangeLogEntry key={idx} entry={entry} index={idx} />
                ))}
              </div>
            )}

            <div className={styles.spacerBottom} />
          </div>

          {/* ── Vertical divider ── */}
          <div className={styles.divider} />

          {/* ── Column 2: line items + totals ── */}
          <div className={styles.col2}>
            <SectionHeader text={"ITEMS (" + lines.length + ")"} />
            <div className={styles.itemsList}>
              {lines.map((item, idx) => {
                const inv = item.inventoryItem || {};
                const name = inv.formalName || inv.informalName || "Item";
                const price = item.useSalePrice ? (inv.salePrice || inv.price || 0) : (inv.price || 0);
                const hasDiscount = !!item.discountObj?.name;
                return (
                  <div
                    key={item.id || idx}
                    className={styles.lineCard}
                    style={{ backgroundColor: C.listItemWhite }}
                  >
                    <div className={styles.lineHeaderRow}>
                      <span className={styles.lineName} style={{ color: C.text }}>
                        <span className={styles.lineQty}>{item.qty + "x  "}</span>
                        {name}
                      </span>
                      <span
                        className={`${styles.linePrice} ${hasDiscount ? styles.linePriceStruck : ""}`}
                        style={{ color: hasDiscount ? C.lightred : C.text }}
                      >
                        {"$" + formatCurrencyDisp(price * item.qty)}
                      </span>
                    </div>

                    {hasDiscount && (
                      <div className={styles.lineDiscountRow}>
                        <span className={styles.lineDiscountName} style={{ color: C.lightred }}>
                          {item.discountObj.name}
                        </span>
                        <span className={styles.lineDiscountPrice} style={{ color: C.green }}>
                          {"$" + formatCurrencyDisp(item.discountObj.newPrice * item.qty)}
                        </span>
                      </div>
                    )}

                    {!!item.warranty && (
                      <span className={styles.lineWarranty} style={{ color: C.blue, display: "block" }}>Warranty</span>
                    )}

                    {!!item.intakeNotes && (
                      <span className={styles.lineIntakeNote} style={{ color: C.orange, display: "block" }}>
                        {"Intake: " + item.intakeNotes}
                      </span>
                    )}

                    {!!item.receiptNotes && (
                      <span className={styles.lineReceiptNote} style={{ color: C.green, display: "block" }}>
                        {"Receipt: " + item.receiptNotes}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className={styles.totalsFooter}>
              <TotalRow label="Subtotal" value={totals.runningSubtotal} />
              {totals.runningDiscount > 0 && (
                <TotalRow label="Discount" value={totals.runningDiscount} isNegative />
              )}
              {!!totals.runningTax && <TotalRow label="Tax" value={totals.runningTax} />}
              <div className={styles.hairline} style={{ backgroundColor: C.surfaceAlt }} />
              <TotalRow label="Total" value={totals.finalTotal} bold />
            </div>
          </div>

          {/* ── Vertical divider ── */}
          <div className={styles.divider} />

          {/* ── Column 3: sales ── */}
          <div className={styles.col3}>
            <SectionHeader text={"SALES (" + sSales.length + ")"} />
            {sLoadingSales ? (
              <span className={styles.italicMuted} style={{ color: C.textMuted }}>Loading sales...</span>
            ) : sSales.length > 0 ? (
              <div className={styles.scrollY}>
                {sSales.map((sale) => (
                  <SaleCard
                    key={sale.id}
                    sale={sale}
                    transactions={sTransactionsMap[sale.id] || []}
                    onPress={(s) => {
                      let enriched = { ...s, _transactions: sTransactionsMap[s.id] || [] };
                      _sSetSaleForModal(enriched);
                    }}
                  />
                ))}
              </div>
            ) : (
              <span className={styles.italicMuted} style={{ color: C.textDisabled }}>
                No associated sales
              </span>
            )}
          </div>
        </div>
      </div>
    </Dialog>
    {!!sSaleForModal && (
      <Suspense fallback={<SmallLoadingIndicator />}>
        <FullSaleModal
          item={{ saleID: sSaleForModal.id }}
          onClose={() => _sSetSaleForModal(null)}
          onRefund={onRefund ? (saleID) => {
            _sSetSaleForModal(null);
            onRefund(saleID);
          } : undefined}
        />
      </Suspense>
    )}
  </>
  );
};
