/*eslint-disable*/
import { formatCurrencyDisp, formatMillisForDisplay, lightenRGBByPercent, localStorageWrapper } from "../../../utils";
import { C, ICONS, COLOR_GRADIENTS } from "../../../styles";
import { Button, Dialog, SHADOW_PROTO } from "../../../dom_components";
import { useSettingsStore, useLoginStore } from "../../../stores";
import { printBuilder, log } from "../../../utils";
import { dbSavePrintObj } from "../../../db_calls_wrapper";
import styles from "./TransactionModal.module.css";

// ─── Helper components ──────────────────────────────────

const DetailRow = ({ label, value, valueColor, valueStyle, onPress }) => {
  if (!value) return null;
  const labelEl = <span className={styles.detailLabel} style={{ color: C.textMuted }}>{label}</span>;
  const valueEl = (
    <span className={styles.detailValue} style={{ color: valueColor || C.text, ...valueStyle }}>
      {value}
    </span>
  );
  if (onPress) {
    return (
      <button type="button" className={styles.detailRowButton} onClick={onPress}>
        {labelEl}
        {valueEl}
      </button>
    );
  }
  return (
    <div className={styles.detailRow}>
      {labelEl}
      {valueEl}
    </div>
  );
};

const SectionHeader = ({ text }) => (
  <span className={styles.sectionHeader} style={{ color: C.textMuted }}>{text}</span>
);

// ─── Refund Infographic ─────────────────────────────────

const RefundInfoGraphic = ({ amountCaptured, totalRefunded }) => {
  let remaining = Math.max(0, amountCaptured - totalRefunded);
  let refundedPercent = amountCaptured > 0 ? Math.round((totalRefunded / amountCaptured) * 100) : 0;
  let fullyRefunded = remaining === 0;

  return (
    <div
      className={styles.refundInfoCard}
      style={{
        borderColor: lightenRGBByPercent(C.lightred, 40),
        backgroundColor: C.listItemWhite,
      }}
    >
      <div className={styles.refundInfoLabelsRow}>
        <div className={styles.refundInfoCol}>
          <span className={styles.refundInfoSmallLabel} style={{ color: C.textMuted }}>REFUNDED</span>
          <span className={styles.refundInfoAmount} style={{ color: C.lightred }}>
            {"$" + formatCurrencyDisp(totalRefunded)}
          </span>
        </div>
        <div className={styles.refundInfoColRight}>
          <span className={styles.refundInfoSmallLabel} style={{ color: C.textMuted }}>REMAINING</span>
          <span
            className={styles.refundInfoAmount}
            style={{ color: fullyRefunded ? C.textDisabled : C.green }}
          >
            {"$" + formatCurrencyDisp(remaining)}
          </span>
        </div>
      </div>
      <div
        className={styles.refundBar}
        style={{ backgroundColor: lightenRGBByPercent(C.green, 55) }}
      >
        <div
          className={styles.refundBarFill}
          style={{ width: refundedPercent + "%", backgroundColor: C.lightred }}
        />
      </div>
      <div className={styles.refundInfoPercent} style={{ color: C.textMuted }}>
        {refundedPercent + "% of $" + formatCurrencyDisp(amountCaptured) + " refunded"}
      </div>
    </div>
  );
};

// ─── Refund Card ────────────────────────────────────────

const RefundCard = ({ refund, index }) => {
  let r = refund;
  return (
    <div
      className={styles.refundCard}
      style={{
        borderColor: lightenRGBByPercent(C.lightred, 45),
        backgroundColor: C.listItemWhite,
      }}
    >
      <div className={styles.refundCardHeader}>
        <div className={styles.refundCardLeft}>
          <span
            className={styles.refundBadge}
            style={{
              backgroundColor: lightenRGBByPercent(C.lightred, 55),
              color: C.lightred,
            }}
          >
            {(r.method || "card").toUpperCase()}
          </span>
          <span className={styles.refundIndex} style={{ color: C.textMuted }}>
            {"Refund #" + (index + 1)}
          </span>
        </div>
        <span className={styles.refundAmount} style={{ color: C.lightred }}>
          {"-$" + formatCurrencyDisp(r.amount)}
        </span>
      </div>
      {!!r.notes && (
        <div className={styles.refundNotes} style={{ color: C.textMuted }}>
          {typeof r.notes === "string" ? r.notes : r.notes.reason || ""}
        </div>
      )}
      {!!r.millis && (
        <div className={styles.refundDate} style={{ color: C.textDisabled }}>
          {formatMillisForDisplay(r.millis, true)}
        </div>
      )}
    </div>
  );
};

// ─── Main Modal ─────────────────────────────────────────

export const TransactionModal = ({ transaction, onClose, onRefund }) => {
  if (!transaction) return null;

  const txn = transaction;
  const isCard = txn.method === "card";
  const isCash = txn.method === "cash";
  const refunds = txn.refunds || [];
  const totalRefunded = refunds.reduce((s, r) => s + (r.amount || 0), 0);
  const hasRefunds = totalRefunded > 0;
  const changeGiven = isCash && txn.amountTendered > txn.amountCaptured
    ? txn.amountTendered - txn.amountCaptured
    : 0;

  function handleClose() {
    onClose && onClose();
  }

  function handlePrintTransaction() {
    const _settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.transaction(txn, _ctx);
    log("DEV — transaction receipt:", toPrint);
    dbSavePrintObj(toPrint, localStorageWrapper.getItem("selectedPrinterID") || "");
  }

  function handleRefund() {
    onRefund && onRefund(txn);
  }

  return (
    <Dialog visible={true} onClose={onClose} overlayColor={C.surfaceOverlayHeavy} title="Transaction">
      <div
        className={styles.container}
        style={{
          backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
          ...SHADOW_PROTO,
        }}
      >
        {/* ── Header ── */}
        <div
          className={styles.header}
          style={{ borderBottomColor: C.borderSubtle, backgroundColor: C.backgroundWhite }}
        >
          <div className={styles.headerLeft}>
            <span
              className={styles.methodBadge}
              style={{
                backgroundColor: isCard
                  ? lightenRGBByPercent(C.blue, 60)
                  : lightenRGBByPercent(C.green, 60),
                color: isCard ? C.blue : C.green,
              }}
            >
              {(txn.method || "unknown").toUpperCase()}
            </span>
            <span className={styles.txnIdLabel} style={{ color: C.textDisabled }}>
              {"Txn ID: " + txn.id}
            </span>
          </div>
          <div className={styles.headerRight}>
            <Button
              text="Refund"
              colorGradientArr={COLOR_GRADIENTS.red}
              onPress={handleRefund}
              buttonStyle={{ paddingHorizontal: 16, height: 32 }}
              textStyle={{ fontSize: 12, color: C.textOnAccent }}
            />
            <Button
              text="Print Transaction"
              icon={ICONS.receipt}
              iconSize={16}
              onPress={handlePrintTransaction}
              buttonStyle={{ paddingHorizontal: 14, height: 32, borderWidth: 1, borderColor: C.buttonLightGreenOutline }}
              textStyle={{ fontSize: 12, color: C.text }}
            />
            <Button
              text="Close"
              icon={ICONS.close1}
              iconSize={14}
              onPress={handleClose}
              buttonStyle={{ paddingHorizontal: 16, height: 32 }}
              textStyle={{ color: C.textMuted, fontSize: 12 }}
            />
          </div>
        </div>

        {/* ── Transaction Viewer Banner ── */}
        <div className={styles.banner} style={{ backgroundColor: lightenRGBByPercent(C.green, 55) }}>
          <span className={styles.bannerText} style={{ color: C.green }}>
            Transaction View
          </span>
        </div>

        {/* ── Date Banner ── */}
        {!!txn.millis && (
          <div className={styles.dateBanner} style={{ backgroundColor: C.surfaceAlt }}>
            <span className={styles.dateBannerText} style={{ color: C.textMuted }}>
              {formatMillisForDisplay(txn.millis, true)}
            </span>
          </div>
        )}

        {/* ── Body ── */}
        <div className={styles.scroll}>
          {/* Amount section */}
          <SectionHeader text="AMOUNT" />
          <div
            className={styles.amountCard}
            style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
          >
            <div className={styles.amountRow}>
              <span className={styles.amountLabelMain} style={{ color: C.textMuted }}>Amount Captured</span>
              <span className={styles.amountValueMain} style={{ color: C.text }}>
                {"$" + formatCurrencyDisp(txn.amountCaptured || 0)}
              </span>
            </div>
            {(txn.salesTax || 0) > 0 && (
              <div className={styles.amountRow}>
                <span className={styles.amountLabelSub} style={{ color: C.textMuted }}>Sales Tax</span>
                <span className={styles.amountValueSub} style={{ color: C.text }}>
                  {"$" + formatCurrencyDisp(txn.salesTax)}
                </span>
              </div>
            )}
            {isCash && !!txn.amountTendered && (
              <div className={styles.amountRow}>
                <span className={styles.amountLabelSub} style={{ color: C.textMuted }}>Amount Tendered</span>
                <span className={styles.amountValueSub} style={{ color: C.text }}>
                  {"$" + formatCurrencyDisp(txn.amountTendered)}
                </span>
              </div>
            )}
            {changeGiven > 0 && (
              <div className={styles.amountRow} style={{ marginBottom: 0 }}>
                <span className={styles.amountLabelSub} style={{ color: C.textMuted }}>Change Given</span>
                <span className={styles.amountValueSub} style={{ color: C.green }}>
                  {"$" + formatCurrencyDisp(changeGiven)}
                </span>
              </div>
            )}
          </div>

          {/* Refund infographic + card list (only if refunds exist) */}
          {hasRefunds && (
            <div>
              <SectionHeader text={"REFUNDS (" + refunds.length + ")"} />
              <RefundInfoGraphic
                amountCaptured={txn.amountCaptured || 0}
                totalRefunded={totalRefunded}
              />
              {refunds.map((r, idx) => (
                <RefundCard key={r.id || idx} refund={r} index={idx} />
              ))}
            </div>
          )}

          {/* Card details */}
          {isCard && (
            <div>
              <SectionHeader text="CARD DETAILS" />
              <DetailRow label="Card Type" value={txn.cardType} />
              <DetailRow label="Last 4" value={txn.last4 ? "..." + txn.last4 : null} />
              <DetailRow
                label="Expiration"
                value={txn.expMonth && txn.expYear ? txn.expMonth + "/" + txn.expYear : null}
              />
              <DetailRow label="Card Issuer" value={txn.cardIssuer} />
              <DetailRow label="Auth Code" value={txn.authorizationCode} />
              <DetailRow label="Processor" value={txn.paymentProcessor} />

              <SectionHeader text="STRIPE" />
              <DetailRow label="Charge ID" value={txn.chargeID} valueStyle={{ fontSize: 11 }} />
              <DetailRow label="Payment Intent" value={txn.paymentIntentID} valueStyle={{ fontSize: 11 }} />
              <DetailRow label="Network Txn ID" value={txn.networkTransactionID} valueStyle={{ fontSize: 11 }} />
              {!!txn.receiptURL && (
                <DetailRow
                  label="Receipt URL"
                  value="View Receipt"
                  valueColor={C.blue}
                  valueStyle={{ textDecoration: "underline" }}
                  onPress={() => {
                    try { window.open(txn.receiptURL, "_blank"); } catch (e) {}
                  }}
                />
              )}
            </div>
          )}

          {/* Cash details */}
          {isCash && (
            <div>
              <SectionHeader text="CASH DETAILS" />
              <DetailRow label="Processor" value={txn.paymentProcessor || "cash"} />
            </div>
          )}

          {/* Bottom spacer */}
          <div className={styles.bottomSpacer} />
        </div>
      </div>
    </Dialog>
  );
};
