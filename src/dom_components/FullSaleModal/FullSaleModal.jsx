/*eslint-disable*/
import React, { useState, useEffect, lazy, Suspense } from "react";
import { C, COLOR_GRADIENTS, ICONS } from "../../styles";
import { Button } from "../Button/Button";
import { SmallLoadingIndicator } from "../LoadingIndicator/LoadingIndicator";
import { Dialog } from "../Dialog/Dialog";
import { useSettingsStore, useCheckoutStore, useLoginStore } from "../../stores";
import { formatCurrencyDisp, formatMillisForDisplay, capitalizeFirstLetterOfString, formatPhoneWithDashes, lightenRGBByPercent, calculateRunningTotals, resolveStatus, log, printBuilder, localStorageWrapper } from "../../utils";
import { dbSavePrintObj } from "../../db_calls_wrapper";
import {
  readActiveSale,
  readCompletedSale,
  readTransactions,
  newCheckoutFetchWorkordersForSale,
} from "../../screens/screen_components/modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
const ClosedWorkorderModal = lazy(() =>
  import("../../screens/screen_components/modal_screens/ClosedWorkorderModal").then((m) => ({ default: m.ClosedWorkorderModal }))
);
import styles from "./FullSaleModal.module.css";

// ─── Helper components ──────────────────────────────────

const TotalRow = ({ label, value, isNegative, bold }) => (
  <div className={styles.totalRow}>
    <span className={`${styles.totalRowLabel} ${bold ? styles.totalRowLabelBold : ""}`}>
      {label}
    </span>
    <span
      className={`${styles.totalRowValue} ${bold ? styles.totalRowValueBold : ""}`}
      style={{ color: isNegative ? C.lightred : C.text }}
    >
      {(isNegative ? "-" : "") + "$" + formatCurrencyDisp(Math.abs(value || 0))}
    </span>
  </div>
);

const SectionHeader = ({ text }) => (
  <span className={styles.sectionHeader}>{text}</span>
);

const DetailRow = ({ label, value }) => {
  if (!value) return null;
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue} style={{ color: C.text }}>{value}</span>
    </div>
  );
};

// ─── Main Modal ─────────────────────────────────────────

export const FullSaleModal = ({ item, onClose, onRefund }) => {
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const salesTaxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;

  const [sSale, _setSale] = useState(null);
  const [sTransactions, _setTransactions] = useState([]);
  const [sLoadingSale, _setLoadingSale] = useState(true);
  const [sWorkorders, _setWorkorders] = useState([]);
  const [sLoadingWorkorders, _setLoadingWorkorders] = useState(false);
  const [sError, _setError] = useState("");
  const [sCreditDetail, _sCreditDetail] = useState(null);
  const [sSelectedWorkorder, _sSetSelectedWorkorder] = useState(null);

  useEffect(() => {
    if (!item?.saleID) {
      _setLoadingSale(false);
      _setError("No sale ID");
      return;
    }
    let cancelled = false;
    async function load() {
      _setLoadingSale(true);
      _setError("");
      try {
        let sale = await readActiveSale(item.saleID);
        if (!sale) sale = await readCompletedSale(item.saleID);
        if (cancelled) return;
        if (!sale) {
          _setError("Sale not found");
          _setLoadingSale(false);
          return;
        }
        _setSale(sale);

        if (sale.transactionIDs?.length > 0) {
          let txns = (await readTransactions(sale.transactionIDs)).filter(Boolean);
          if (!cancelled) _setTransactions(txns);
        }

        _setLoadingSale(false);

        if (sale.workorderIDs && sale.workorderIDs.length > 0) {
          _setLoadingWorkorders(true);
          let workorders = await newCheckoutFetchWorkordersForSale(sale.workorderIDs);
          if (!cancelled) {
            _setWorkorders(workorders || []);
            _setLoadingWorkorders(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          log("FullSaleModal load error:", err);
          _setError("Failed to load sale");
          _setLoadingSale(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [item?.saleID]);

  // Derived
  const payments = sTransactions;
  const credits = [...(sSale?.creditsApplied || []), ...(sSale?.depositsApplied || [])];
  const allRefunds = sTransactions.flatMap((t) => (t.refunds || []).map((r) => ({ ...r, _parentMethod: t.method, _parentLast4: t.last4 })));
  const totalRefunded = allRefunds.reduce((s, r) => s + (r.amount || 0), 0);
  const hasRefunds = totalRefunded > 0;

  function handlePrintSale() {
    const _settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    const customer = {
      first: item.customerFirst || "",
      last: item.customerLast || "",
      cell: item.customerCell || "",
      email: item.customerEmail || "",
    };
    const wo = sWorkorders[0] || {};
    const creds = [...(sSale.creditsApplied || []), ...(sSale.depositsApplied || [])];
    let toPrint = printBuilder.sale(sSale, sTransactions, customer, wo, _settings?.salesTaxPercent, _ctx, creds);
    toPrint.popCashRegister = false;
    log("DEV — sale receipt:", toPrint);
    dbSavePrintObj(toPrint, localStorageWrapper.getItem("selectedPrinterID") || "");
  }

  function handleRefund() {
    if (onRefund) {
      onRefund(sSale.id);
    } else {
      onClose();
      useCheckoutStore.getState().setStringOnly(sSale.id);
    }
  }

  const cardBg = lightenRGBByPercent(C.backgroundWhite, 35);

  // ── Loading / Error state ──
  if (sLoadingSale || sError) {
    return (
      <Dialog visible={true} onClose={onClose} aria-label="Sale loading">
        <div
          className={styles.loadingCard}
          style={{ "--card-bg": C.backgroundWhite }}
        >
          {sLoadingSale ? (
            <>
              <SmallLoadingIndicator />
              <span className={styles.loadingText}>Loading sale...</span>
            </>
          ) : (
            <>
              <span className={styles.errorText} style={{ "--error-color": C.lightred }}>
                {sError}
              </span>
              <Button
                text="Close"
                colorGradientArr={COLOR_GRADIENTS.grey}
                onPress={onClose}
                buttonStyle={{ paddingHorizontal: 30, paddingVertical: 8 }}
                textStyle={{ fontSize: 13 }}
              />
            </>
          )}
        </div>
      </Dialog>
    );
  }

  // ── Workorder drill-down (still RN-web) ──
  if (sSelectedWorkorder) {
    return (
      <Suspense fallback={<SmallLoadingIndicator />}>
        <ClosedWorkorderModal
          workorder={sSelectedWorkorder}
          onClose={() => _sSetSelectedWorkorder(null)}
        />
      </Suspense>
    );
  }

  // ── Full modal ──
  return (
    <>
      <Dialog visible={true} onClose={onClose} aria-label="Sale view">
        <div
          className={styles.card}
          style={{
            "--card-bg": cardBg,
            "--header-bg": C.backgroundWhite,
            "--list-item-bg": C.listItemWhite,
            "--totals-border": C.buttonLightGreenOutline,
          }}
        >
          {/* ── Header ── */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={styles.saleIdText}>
                {"Sale ID: " + sSale.id}
              </span>
              {!!sSale._importSource && (
                <div
                  className={styles.importBadge}
                  style={{
                    "--import-bg": lightenRGBByPercent(C.blue, 60),
                    "--import-color": C.blue,
                  }}
                >
                  <span className={styles.importBadgeText}>{sSale._importSource}</span>
                </div>
              )}
            </div>
            <div className={styles.headerRight}>
              <Button
                text="Refund"
                colorGradientArr={COLOR_GRADIENTS.red}
                onPress={handleRefund}
                enabled={totalRefunded < sSale?.total}
                buttonStyle={{ paddingHorizontal: 20, height: 32, marginRight: 8 }}
                textStyle={{ color: C.textWhite, fontSize: 12 }}
              />
              <Button
                text="Print Sale"
                icon={ICONS.receipt}
                iconSize={16}
                onPress={handlePrintSale}
                buttonStyle={{ paddingHorizontal: 14, height: 32, borderWidth: 1, borderColor: C.buttonLightGreenOutline }}
                textStyle={{ fontSize: 12, color: C.text }}
              />
            </div>
          </div>

          {/* ── Sale View Banner ── */}
          <div
            className={styles.banner}
            style={{
              "--banner-bg": lightenRGBByPercent(C.blue, 55),
              "--banner-color": C.blue,
            }}
          >
            <span className={styles.bannerTitle}>Sale View</span>
            {(item.customerFirst || item.customerLast) && (
              <span className={styles.bannerSubtitle}>
                {(capitalizeFirstLetterOfString(item.customerFirst || "") + " " + capitalizeFirstLetterOfString(item.customerLast || "")).trim()
                  + (item.customerCell ? "  ·  " + formatPhoneWithDashes(item.customerCell) : "")
                  + (item.customerEmail ? "  ·  " + item.customerEmail : "")}
              </span>
            )}
          </div>

          {/* ── Date Banner ── */}
          {!!sSale.millis && (
            <div className={styles.dateBanner}>
              <span className={styles.dateText}>
                {formatMillisForDisplay(sSale.millis, true)}
              </span>
            </div>
          )}

          {/* ── Body ── */}
          <div className={styles.body}>
            {/* ── Left column ── */}
            <div className={styles.colLeft}>
              <SectionHeader text="TOTALS" />
              <div className={styles.totalsBox}>
                <TotalRow label="Subtotal" value={sSale.subtotal} />
                {(sSale.discount || 0) > 0 && <TotalRow label="Discount" value={sSale.discount} isNegative />}
                <TotalRow label="Tax" value={sSale.salesTax || sSale.tax || 0} />
                {(sSale.cardFee || 0) > 0 && <TotalRow label="Card Fee" value={sSale.cardFee} />}
                <div className={styles.totalsDivider} />
                <TotalRow label="Total" value={sSale.total} bold />
              </div>

              {/* Amount info */}
              <div className={styles.amountInfo}>
                <div className={styles.amountRow}>
                  <span className={styles.amountLabel}>Original Amount</span>
                  <span className={styles.amountValue} style={{ "--amount-color": C.green }}>
                    {"$" + formatCurrencyDisp(sSale.amountCaptured + totalRefunded)}
                  </span>
                </div>
                {totalRefunded > 0 && (
                  <div className={styles.amountRow}>
                    <span className={styles.amountLabel}>Refunded</span>
                    <span className={styles.amountValue} style={{ "--amount-color": C.lightred }}>
                      {"-$" + formatCurrencyDisp(totalRefunded)}
                    </span>
                  </div>
                )}
                <div className={styles.amountRow}>
                  <span className={styles.amountLabel}>Refundable</span>
                  <span
                    className={styles.amountValue}
                    style={{ "--amount-color": totalRefunded > 0 ? C.orange : C.green }}
                  >
                    {"$" + formatCurrencyDisp(sSale.amountCaptured)}
                  </span>
                </div>
              </div>

              {/* Customer info */}
              {(item.customerFirst || item.customerLast) && (
                <div>
                  <SectionHeader text="CUSTOMER" />
                  <DetailRow
                    label="Name"
                    value={
                      (capitalizeFirstLetterOfString(item.customerFirst || "") +
                        " " +
                        capitalizeFirstLetterOfString(item.customerLast || "")).trim()
                    }
                  />
                  <DetailRow label="Phone" value={item.customerCell ? formatPhoneWithDashes(item.customerCell) : ""} />
                  <DetailRow label="Email" value={item.customerEmail || ""} />
                </div>
              )}

              {/* Workorders */}
              <div>
                <SectionHeader text={"WORKORDERS" + (sWorkorders.length > 0 ? " (" + sWorkorders.length + ")" : "")} />
                {sLoadingWorkorders ? (
                  <div className={styles.workordersLoadingBlock}>
                    <SmallLoadingIndicator />
                    <span className={styles.workordersLoadingText}>Loading workorders...</span>
                  </div>
                ) : sWorkorders.length > 0 ? (
                  sWorkorders.map((wo) => (
                    <button
                      key={wo.id}
                      className={styles.workorderBtn}
                      onClick={() => _sSetSelectedWorkorder(wo)}
                    >
                      <WorkorderCard workorder={wo} statuses={statuses} salesTaxPercent={salesTaxPercent} />
                    </button>
                  ))
                ) : (
                  <span className={styles.emptyHint}>No workorders found</span>
                )}
              </div>
            </div>

            {/* ── Divider ── */}
            <div className={styles.divider} />

            {/* ── Right column ── */}
            <div className={styles.colRight}>
              <SectionHeader text={"PAYMENTS (" + payments.length + ")"} />
              {payments.map((p, idx) => (
                <div key={p.id || idx} className={styles.paymentCard}>
                  <div className={styles.paymentTopRow}>
                    <span className={styles.paymentMethod} style={{ color: C.text }}>
                      {(p.method || "card").toUpperCase()}
                    </span>
                    <span className={styles.paymentAmount} style={{ color: C.text }}>
                      {"$" + formatCurrencyDisp(p.amountCaptured)}
                    </span>
                  </div>

                  {!!p.millis && (
                    <span className={styles.paymentTimestamp}>
                      {formatMillisForDisplay(p.millis, true)}
                    </span>
                  )}

                  {p.method === "card" && (
                    <div>
                      {(!!p.cardType || !!p.last4) && (
                        <span className={styles.paymentDetailLine}>
                          {(p.cardType || "Card") + (p.last4 ? "  ..." + p.last4 : "")}
                          {p.expMonth && p.expYear ? "  Exp " + p.expMonth + "/" + p.expYear : ""}
                        </span>
                      )}
                      {!!p.authorizationCode && (
                        <span className={styles.paymentAuthLine}>
                          {"Auth: " + p.authorizationCode}
                        </span>
                      )}
                    </div>
                  )}

                  {p.method === "cash" && !!p.amountTendered && (
                    <span className={styles.paymentCashTendered}>
                      {"Tendered: $" + formatCurrencyDisp(p.amountTendered)}
                    </span>
                  )}

                  {(p.refunds || []).length > 0 && (
                    <span className={styles.paymentRefundedLine} style={{ "--refund-color": C.lightred }}>
                      {"Refunded: $" + formatCurrencyDisp((p.refunds || []).reduce((s, r) => s + (r.amount || 0), 0))}
                    </span>
                  )}
                </div>
              ))}

              {payments.length === 0 && (
                <span className={styles.emptyHint}>No payments recorded</span>
              )}

              {/* Credits / Deposits */}
              {credits.length > 0 && (
                <div>
                  <SectionHeader text={"CREDITS / DEPOSITS (" + credits.length + ")"} />
                  {credits.map((c, idx) => (
                    <button
                      key={c.id || idx}
                      className={styles.creditCard}
                      onClick={() => _sCreditDetail(c)}
                    >
                      <div className={styles.creditTopRow}>
                        <span className={styles.creditType} style={{ "--credit-color": C.orange }}>
                          {capitalizeFirstLetterOfString(c.type || "deposit")}
                        </span>
                        <span className={styles.creditAmount} style={{ color: C.text }}>
                          {"$" + formatCurrencyDisp(c.amount)}
                        </span>
                      </div>
                      {!!c.id && (
                        <span className={styles.creditId}>{"ID: " + c.id}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Refund history */}
              {hasRefunds && (
                <div>
                  <SectionHeader text="REFUNDS" />
                  <div className={styles.refundTotalsRow}>
                    <span className={styles.refundTotalsLabel} style={{ "--refund-color": C.lightred }}>
                      Total Refunded
                    </span>
                    <span className={styles.refundTotalsValue} style={{ "--refund-color": C.lightred }}>
                      {"-$" + formatCurrencyDisp(totalRefunded)}
                    </span>
                  </div>
                  {allRefunds.map((r, idx) => (
                    <div key={r.id || idx} className={styles.refundCard}>
                      <div className={styles.refundTopRow}>
                        <span className={styles.refundMethod} style={{ "--refund-color": C.lightred }}>
                          {(r.method || "card").toUpperCase() + " Refund"}
                        </span>
                        <span className={styles.refundAmount} style={{ "--refund-color": C.lightred }}>
                          {"-$" + formatCurrencyDisp(r.amount)}
                        </span>
                      </div>
                      {!!r.notes && (
                        <span className={styles.refundNotes}>
                          {typeof r.notes === "string" ? r.notes : r.notes.reason || ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className={styles.footer}>
            <Button
              text="Close"
              icon={ICONS.close1}
              iconSize={14}
              onPress={onClose}
              buttonStyle={{ paddingHorizontal: 16, height: 34 }}
              textStyle={{ color: C.textMuted, fontSize: 13 }}
            />
          </div>
        </div>
      </Dialog>

      {!!sCreditDetail && (
        <CreditDetailModal credit={sCreditDetail} onClose={() => _sCreditDetail(null)} />
      )}
    </>
  );
};

// ─── Credit / Deposit Detail Modal ──────────────────────

const CreditDetailModal = ({ credit, onClose }) => {
  const c = credit;
  const typeLabel = capitalizeFirstLetterOfString(c.type || "deposit");
  const isGiftCard = c.type === "giftcard";
  const badgeColor = isGiftCard || c.type === "credit" ? C.orange : C.blue;

  return (
    <Dialog visible={true} onClose={onClose} aria-label="Credit detail">
      <div
        className={styles.creditDetailCard}
        style={{
          "--card-bg": lightenRGBByPercent(C.backgroundWhite, 35),
          "--header-bg": C.backgroundWhite,
          "--list-item-bg": C.listItemWhite,
          "--totals-border": C.buttonLightGreenOutline,
        }}
      >
        <div className={styles.creditDetailHeader}>
          <div
            className={styles.creditDetailBadge}
            style={{
              "--badge-bg": lightenRGBByPercent(badgeColor, 60),
              "--badge-color": badgeColor,
            }}
          >
            <span className={styles.creditDetailBadgeText}>{typeLabel.toUpperCase()}</span>
          </div>
          <Button
            text="Close"
            icon={ICONS.close1}
            iconSize={14}
            onPress={onClose}
            buttonStyle={{ paddingHorizontal: 16, height: 32 }}
            textStyle={{ color: C.textMuted, fontSize: 12 }}
          />
        </div>

        <div className={styles.creditDetailBody}>
          <SectionHeader text="DETAILS" />
          <DetailRow label="Type" value={typeLabel} />
          <DetailRow label="ID" value={c.id || "—"} />
          {!!c.transactionId && <DetailRow label="Txn ID" value={c.transactionId} />}
          <SectionHeader text="AMOUNT" />
          <div className={styles.creditDetailAmountBox}>
            <div className={styles.creditDetailAmountRow}>
              <span className={styles.creditDetailAmountLabel}>Amount Applied</span>
              <span className={styles.creditDetailAmountValue} style={{ color: C.text }}>
                {"$" + formatCurrencyDisp(c.amount || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

// ─── Workorder Card ─────────────────────────────────────

const WorkorderCard = ({ workorder, statuses, salesTaxPercent }) => {
  const wo = workorder;
  const woRs = resolveStatus(wo.status, statuses);
  const lines = wo.workorderLines || [];
  const totals = lines.length > 0 ? calculateRunningTotals(wo, salesTaxPercent) : null;

  return (
    <div
      className={styles.workorderCard}
      style={{ "--wo-status-color": woRs.backgroundColor || C.textDisabled }}
    >
      <div className={styles.workorderHeader}>
        <span className={styles.workorderTitle} style={{ color: C.text }}>
          {(wo.brand || "") + (wo.description ? " — " + wo.description : "")}
        </span>
        <div
          className={styles.statusBadge}
          style={{
            "--badge-bg": woRs.backgroundColor,
            "--badge-color": woRs.textColor,
          }}
        >
          <span className={styles.statusBadgeText}>{woRs.label}</span>
        </div>
      </div>

      {(wo.color1?.label || wo.color2?.label) && (
        <div className={styles.colorRow}>
          {!!wo.color1?.label && (
            <div
              className={styles.colorBadge}
              style={{
                "--badge-bg": wo.color1.backgroundColor || C.textDisabled,
                "--badge-color": wo.color1.textColor || C.text,
              }}
            >
              <span className={styles.colorBadgeText}>{wo.color1.label}</span>
            </div>
          )}
          {!!wo.color2?.label && (
            <div
              className={styles.colorBadge}
              style={{
                "--badge-bg": wo.color2.backgroundColor || C.textDisabled,
                "--badge-color": wo.color2.textColor || C.text,
              }}
            >
              <span className={styles.colorBadgeText}>{wo.color2.label}</span>
            </div>
          )}
        </div>
      )}

      {!!wo.startedOnMillis && (
        <span className={styles.workorderDate}>
          {"Started: " + formatMillisForDisplay(wo.startedOnMillis, true)}
        </span>
      )}
      {!!wo.finishedOnMillis && (
        <span className={styles.workorderDate}>
          {"Finished: " + formatMillisForDisplay(wo.finishedOnMillis, true)}
        </span>
      )}

      {!!wo.taxFree && (
        <div
          className={styles.taxFreeBadge}
          style={{
            "--badge-bg": lightenRGBByPercent(C.orange, 60),
            "--badge-color": C.orange,
          }}
        >
          <span className={styles.taxFreeBadgeText}>Tax-Free</span>
        </div>
      )}

      {lines.length > 0 && (
        <div className={styles.lineItemsBlock}>
          {lines.map((line, idx) => (
            <LineItemRow key={line.id || idx} line={line} index={idx} />
          ))}
          {totals && (
            <div className={styles.lineItemSubtotalRow}>
              <span className={styles.lineItemSubtotalLabel}>Subtotal</span>
              <span className={styles.lineItemSubtotalValue} style={{ color: C.text }}>
                {"$" + formatCurrencyDisp(totals.runningTotal)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Line Item Row ──────────────────────────────────────

const LineItemRow = ({ line, index }) => {
  const inv = line.inventoryItem || {};
  const name = inv.formalName || inv.informalName || "Item";
  const qty = line.qty || 1;
  const hasDiscount = !!line.discountObj?.name;
  const price = hasDiscount ? (line.discountObj.newPrice || 0) : (inv.price || 0) * qty;

  return (
    <div className={styles.lineItemRow}>
      <span className={styles.lineItemName} style={{ color: C.text }}>
        {qty > 1 ? qty + "x " : ""}{name}
      </span>
      <div className={styles.lineItemRight}>
        {hasDiscount && (
          <span className={styles.lineItemDiscount} style={{ "--discount-color": C.green }}>
            {line.discountObj.name}
          </span>
        )}
        <span className={styles.lineItemPrice} style={{ color: C.text }}>
          {"$" + formatCurrencyDisp(price)}
        </span>
      </div>
    </div>
  );
};
