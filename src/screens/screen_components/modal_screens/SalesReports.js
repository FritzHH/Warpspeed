/*eslint-disable*/
import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  Button,
  Dialog,
  LoadingIndicator,
} from "../../../dom_components";
import { C, COLOR_GRADIENTS } from "../../../styles";
import { getPreviousMondayDayJS, capitalizeFirstLetterOfString, formatCurrencyDisp, formatMillisForDisplay, lightenRGBByPercent } from "../../../utils";
import dayjs from "dayjs";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import {
  queryCompletedSalesReport,
  queryActiveSalesForReport,
  queryTransactionsByDateRange,
} from "./newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { useActiveSalesStore, useCheckoutStore } from "../../../stores";
const FullSaleModal = lazy(() =>
  import("../../../dom_components/FullSaleModal/FullSaleModal").then((m) => ({ default: m.FullSaleModal }))
);
import styles from "./SalesReports.module.css";

const PAGE_SIZE = 50;

const DATE_SHORTCUTS = [
  { label: "Today",            start: () => dayjs().startOf("day"),                              end: () => dayjs().endOf("day") },
  { label: "Yesterday",        start: () => dayjs().subtract(1, "day").startOf("day"),           end: () => dayjs().subtract(1, "day").endOf("day") },
  { label: "Day Before",       start: () => dayjs().subtract(2, "day").startOf("day"),           end: () => dayjs().subtract(2, "day").endOf("day") },
  { label: "This Week",        start: () => getPreviousMondayDayJS(),                            end: () => dayjs() },
  { label: "Last Week",        start: () => getPreviousMondayDayJS().subtract(7, "day"),         end: () => getPreviousMondayDayJS().subtract(1, "day") },
  { label: "This Month",       start: () => dayjs().startOf("month"),                            end: () => dayjs() },
  { label: "Last Month",       start: () => dayjs().subtract(1, "month").startOf("month"),       end: () => dayjs().subtract(1, "month").endOf("month") },
  { label: "Last Yr Same Mo",  start: () => dayjs().subtract(1, "year").startOf("month"),        end: () => dayjs().subtract(1, "year").endOf("month") },
  { label: "This Year",        start: () => dayjs().startOf("year"),                             end: () => dayjs() },
  { label: "Last Year",        start: () => dayjs().subtract(1, "year").startOf("year"),         end: () => dayjs().subtract(1, "year").endOf("year") },
];

function generateDateChips(startDate, endDate) {
  if (!startDate || !endDate) return [];
  let chips = [];
  let current = dayjs(startDate).startOf("day");
  let end = dayjs(endDate).startOf("day");
  let maxChips = 365;
  while (current.isBefore(end) || current.isSame(end, "day")) {
    chips.push(current);
    current = current.add(1, "day");
    if (chips.length >= maxChips) break;
  }
  return chips;
}

export const SalesReportsModal = ({ handleExit }) => {
  const [sStartDate, _setStartDate] = useState(dayjs().startOf("day"));
  const [sEndDate, _setEndDate] = useState(dayjs().endOf("day"));
  const [sResults, _setResults] = useState([]);
  const [sPage, _setPage] = useState(0);
  const [sLoading, _setLoading] = useState(false);
  const [sSaleModalItem, _setSaleModalItem] = useState(null);
  const [sActiveShortcut, _setActiveShortcut] = useState("Today");
  const [sSearchText, _setSearchText] = useState("");
  const [sPendingStart, _setPendingStart] = useState(null);
  const [sPendingEnd, _setPendingEnd] = useState(null);
  const [sEndCalMonth, _setEndCalMonth] = useState(dayjs().month());
  const [sEndCalYear, _setEndCalYear] = useState(dayjs().year());
  const [sCalKey, _setCalKey] = useState(0);
  const [sViewMode, _setViewMode] = useState("sale");
  const [sSortField, _setSortField] = useState("date");
  const [sSortDir, _setSortDir] = useState("desc");
  const [sTransactionResults, _setTransactionResults] = useState([]);
  const [sTransactionLoading, _setTransactionLoading] = useState(false);
  const [sTransactionModalItem, _setTransactionModalItem] = useState(null);
  const queryIdRef = useRef(0);
  const txnQueryIdRef = useRef(0);
  const hasUserSelected = useRef(false);

  const saleCacheRef = useRef(null);
  const txnCacheRef = useRef(null);

  // Fetch data when dates change (with session cache)
  useEffect(() => {
    if (!hasUserSelected.current) return;
    if (!sStartDate || !sEndDate) return;
    let startMillis = dayjs(sStartDate).startOf("day").valueOf();
    let endMillis = dayjs(sEndDate).endOf("day").valueOf();
    _setPage(0);

    let cache = saleCacheRef.current;
    if (cache && startMillis >= cache.startMillis && endMillis <= cache.endMillis) {
      let filtered = cache.data.filter((r) => {
        let m = r.millis || 0;
        return m >= startMillis && m <= endMillis;
      });
      _setResults(filtered);
      return;
    }

    let thisQueryId = ++queryIdRef.current;
    _setLoading(true);

    let activeSales = useActiveSalesStore.getState().getActiveSales();
    let filteredActive = activeSales.filter((s) => {
      let m = s.millis || 0;
      return m >= startMillis && m <= endMillis;
    });

    Promise.all([
      queryCompletedSalesReport(startMillis, endMillis),
      queryActiveSalesForReport(filteredActive),
    ])
      .then(([completedRows, activeRows]) => {
        if (thisQueryId !== queryIdRef.current) return;
        let tagged = (completedRows || []).map((r) => ({ ...r, source: "completed" }));
        let combined = [...tagged, ...(activeRows || [])];
        saleCacheRef.current = { startMillis, endMillis, data: combined };
        _setResults(combined);
        _setLoading(false);
      })
      .catch(() => {
        if (thisQueryId !== queryIdRef.current) return;
        _setResults([]);
        _setLoading(false);
      });
  }, [sStartDate, sEndDate]);

  function handleCancelQuery() {
    queryIdRef.current++;
    _setLoading(false);
  }

  function handleRowPress(tx) {
    if (!tx.saleID) {
      _setTransactionModalItem(tx);
      return;
    }
    if (tx.source === "active") {
      let sale = useActiveSalesStore.getState().getActiveSale(tx.saleID);
      if (sale) {
        handleExit();
        useCheckoutStore.getState().setViewOnlySale(sale);
        useCheckoutStore.getState().setIsCheckingOut(true);
      }
    } else {
      _setSaleModalItem(tx);
    }
  }

  function handleRefundFromSaleModal(saleID) {
    _setSaleModalItem(null);
    handleExit();
    useCheckoutStore.getState().setStringOnly(saleID);
  }

  function handleHeaderSort(field) {
    if (sSortField === field) {
      _setSortDir(sSortDir === "asc" ? "desc" : "asc");
    } else {
      _setSortField(field);
      _setSortDir(field === "amount" || field === "date" ? "desc" : "asc");
    }
  }

  function handleShortcut(shortcut) {
    hasUserSelected.current = true;
    let start = shortcut.start();
    let end = shortcut.end();
    _setActiveShortcut(shortcut.label);
    _setPendingStart(null);
    _setPendingEnd(null);
    _setStartDate(start);
    _setEndDate(end);
    _setEndCalMonth(end.month());
    _setEndCalYear(end.year());
    _setCalKey((prev) => prev + 1);
  }

  function handleGoButton() {
    if (!sPendingStart || !sPendingEnd) return;
    hasUserSelected.current = true;
    _setActiveShortcut(null);
    _setStartDate(sPendingStart);
    _setEndDate(sPendingEnd);
    _setEndCalMonth(sPendingEnd.month());
    _setEndCalYear(sPendingEnd.year());
    _setCalKey((prev) => prev + 1);
    _setPendingStart(null);
    _setPendingEnd(null);
  }

  function handleViewModeTransaction() {
    _setViewMode("transaction");
    _setPage(0);
    if (!sStartDate || !sEndDate) return;
    let startMillis = dayjs(sStartDate).startOf("day").valueOf();
    let endMillis = dayjs(sEndDate).endOf("day").valueOf();

    let cache = txnCacheRef.current;
    if (cache && startMillis >= cache.startMillis && endMillis <= cache.endMillis) {
      let filtered = cache.data.filter((tx) => {
        let m = tx.millis || tx.createdAt || 0;
        return m >= startMillis && m <= endMillis;
      });
      _setTransactionResults(filtered);
      return;
    }

    let thisQueryId = ++txnQueryIdRef.current;
    _setTransactionLoading(true);
    queryTransactionsByDateRange(startMillis, endMillis)
      .then((txns) => {
        if (thisQueryId !== txnQueryIdRef.current) return;
        txnCacheRef.current = { startMillis, endMillis, data: txns };
        _setTransactionResults(txns);
        _setTransactionLoading(false);
      })
      .catch(() => {
        if (thisQueryId !== txnQueryIdRef.current) return;
        _setTransactionResults([]);
        _setTransactionLoading(false);
      });
  }

  let displayStart = sPendingStart || sStartDate;
  let displayEnd = sPendingEnd || sEndDate;
  let hasPendingRange = !!sPendingStart && !!sPendingEnd;

  let searchQuery = sSearchText.trim().toLowerCase();
  let filteredResults = sResults;
  if (searchQuery) {
    let isAmountSearch = searchQuery.includes(".");
    if (isAmountSearch) {
      let searchAmount = searchQuery.replace(/[^0-9.]/g, "");
      filteredResults = sResults.filter((tx) => {
        let txAmount = formatCurrencyDisp(tx.amountCaptured || 0);
        return txAmount.includes(searchAmount);
      });
    } else {
      filteredResults = sResults.filter((tx) => {
        let first = (tx.customerFirst || "").toLowerCase();
        let last = (tx.customerLast || "").toLowerCase();
        let phone = (tx.customerCell || "").toLowerCase();
        return (
          first.includes(searchQuery) ||
          last.includes(searchQuery) ||
          phone.includes(searchQuery) ||
          (first + " " + last).includes(searchQuery)
        );
      });
    }
  }

  let filteredTransactions = sTransactionResults;
  if (searchQuery) {
    let isAmountSearch = searchQuery.includes(".");
    if (isAmountSearch) {
      let searchAmount = searchQuery.replace(/[^0-9.]/g, "");
      filteredTransactions = sTransactionResults.filter((tx) => {
        let txAmount = formatCurrencyDisp(tx.amountCaptured || 0);
        return txAmount.includes(searchAmount);
      });
    } else {
      filteredTransactions = sTransactionResults.filter((tx) => {
        let method = (tx.method || "").toLowerCase();
        let type = (tx.type || "").toLowerCase();
        let cardType = (tx.cardType || "").toLowerCase();
        let cardIssuer = (tx.cardIssuer || "").toLowerCase();
        return (
          method.includes(searchQuery) ||
          type.includes(searchQuery) ||
          cardType.includes(searchQuery) ||
          cardIssuer.includes(searchQuery)
        );
      });
    }
  }

  let groups = [];
  let flatSorted = [];

  if (sViewMode === "sale") {
    let grouped = {};
    filteredResults.forEach((tx) => {
      if (!grouped[tx.saleID]) {
        grouped[tx.saleID] = {
          saleID: tx.saleID,
          customerFirst: tx.customerFirst || "",
          customerLast: tx.customerLast || "",
          transactions: [],
          source: tx.source || "completed",
        };
      }
      grouped[tx.saleID].transactions.push(tx);
      if (tx.source === "active") grouped[tx.saleID].source = "active";
    });
    groups = Object.values(grouped);
    groups.sort((a, b) => {
      let dir = sSortDir === "asc" ? 1 : -1;
      if (sSortField === "amount") {
        let aVal = a.transactions.reduce((s, t) => s + (t.amountCaptured || 0), 0);
        let bVal = b.transactions.reduce((s, t) => s + (t.amountCaptured || 0), 0);
        return (aVal - bVal) * dir;
      }
      if (sSortField === "method") {
        let aVal = (a.transactions[0]?.method || "").toLowerCase();
        let bVal = (b.transactions[0]?.method || "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }
      if (sSortField === "type") {
        let aVal = (a.transactions[0]?.type || "").toLowerCase();
        let bVal = (b.transactions[0]?.type || "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }
      let aMin = Math.min(...a.transactions.map((t) => t.millis || 0));
      let bMin = Math.min(...b.transactions.map((t) => t.millis || 0));
      return (aMin - bMin) * dir;
    });
  } else {
    flatSorted = filteredTransactions
      .filter((tx) => tx.type !== "pending")
      .sort((a, b) => {
        let dir = sSortDir === "asc" ? 1 : -1;
        if (sSortField === "amount") return ((a.amountCaptured || 0) - (b.amountCaptured || 0)) * dir;
        if (sSortField === "method") return (a.method || "").toLowerCase().localeCompare((b.method || "").toLowerCase()) * dir;
        if (sSortField === "type") return (a.type || "").toLowerCase().localeCompare((b.type || "").toLowerCase()) * dir;
        return ((a.millis || 0) - (b.millis || 0)) * dir;
      });
  }

  let itemCount = sViewMode === "sale" ? groups.length : flatSorted.length;
  let totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));
  let pageGroups = sViewMode === "sale" ? groups.slice(sPage * PAGE_SIZE, (sPage + 1) * PAGE_SIZE) : [];
  let pageTransactions = sViewMode === "transaction" ? flatSorted.slice(sPage * PAGE_SIZE, (sPage + 1) * PAGE_SIZE) : [];

  let totalPayments = 0;
  let taxExemptTotal = 0;
  let taxableTotal = 0;
  let salesTax = 0;
  let refundsTotal = 0;
  filteredResults.forEach((tx) => {
    if (tx.type === "refund") {
      refundsTotal += tx.amountCaptured || 0;
    } else {
      totalPayments += tx.amountCaptured || 0;
      salesTax += tx.salesTax || 0;
      if ((tx.salesTax || 0) === 0) {
        taxExemptTotal += tx.amountCaptured || 0;
      } else {
        taxableTotal += tx.amountCaptured || 0;
      }
    }
  });

  let dateChips = generateDateChips(displayStart, displayEnd);

  let calendarModifiersStyles = {
    range_middle: {
      backgroundColor: lightenRGBByPercent(C.blue, 70),
      color: C.text,
      borderRadius: 0,
    },
  };

  let dayPickerWrapperStyle = {
    color: "white",
    "--rdp-accent-color": C.blue,
    "--rdp-accent-background-color": lightenRGBByPercent(C.blue, 60),
    "--rdp-today-color": C.red,
    "--rdp-day-height": "32px",
    "--rdp-day-width": "32px",
  };

  function renderGroupHeader(group) {
    let isDeposit = group.transactions.some((tx) => tx.isDepositSale);
    let label = isDeposit ? "Deposit" : "Sale";
    let labelColor = isDeposit ? C.green : C.orange;
    let isActive = group.source === "active";
    let hasCustomer = !!(group.customerFirst || group.customerLast);
    let customerName = hasCustomer
      ? (capitalizeFirstLetterOfString(group.customerFirst) + " " + capitalizeFirstLetterOfString(group.customerLast)).trim()
      : "";
    return (
      <div
        key={"gh-" + group.saleID}
        className={styles.groupHeader}
        style={{ backgroundColor: C.surfaceAlt }}
      >
        <span className={styles.groupHeaderText} style={{ color: C.darkBlue }}>
          {!hasCustomer && <span style={{ color: labelColor }}>{label}</span>}
          {hasCustomer && customerName}
        </span>
        {isActive && (
          <div className={styles.activeBadge} style={{ backgroundColor: C.orange }}>
            <span className={styles.activeBadgeText}>Active</span>
          </div>
        )}
      </div>
    );
  }

  function renderTransactionRow(tx, index) {
    let isRefund = tx.type === "refund";
    let isDeposit = tx.depositType === "deposit";
    let isGiftCard = tx.method === "credit";
    let isActive = tx.source === "active";
    let bgColor = isRefund ? lightenRGBByPercent(C.red, 85) : C.listItemWhite;
    let typeColor = isRefund ? C.red : (isDeposit || isGiftCard) ? C.green : C.text;
    let dateStr = "";
    if (tx.millis) {
      let d = formatMillisForDisplay(tx.millis, true, true, true);
      let min = String(d.minutes).padStart(2, "0");
      dateStr = d.wordDayOfWeek + ", " + d.wordDayOfMonth + " " + d.dayOfMonth + " '" + d.year + "  " + d.hour + ":" + min + " " + d.amPM;
    }

    return (
      <button
        type="button"
        key={tx.id || tx.saleID + "-" + index}
        onClick={() => handleRowPress(tx)}
        className={styles.row}
        style={{
          backgroundColor: bgColor,
          borderBottomColor: C.borderSubtle,
          background: bgColor,
          border: "none",
          borderBottom: "1px solid " + C.borderSubtle,
          font: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div className={`${styles.cell} ${styles.cellType}`}>
          {isActive && (
            <div className={styles.activeDot} style={{ backgroundColor: C.orange }} />
          )}
          <span
            className={styles.cellTypeText}
            style={{
              color: typeColor,
              paddingLeft: isActive ? 0 : 10,
              width: "100%",
            }}
          >
            {isDeposit ? "Deposit" : isGiftCard ? "Gift Card" : capitalizeFirstLetterOfString(tx.type || "payment")}
          </span>
        </div>
        <div className={`${styles.cell} ${styles.cellMethod}`}>
          <span className={styles.cellMethodText} style={{ color: C.textMuted, width: "100%" }}>
            {capitalizeFirstLetterOfString(tx.method || "")}
          </span>
        </div>
        <div className={`${styles.cell} ${styles.cellAmount}`}>
          <span
            className={styles.cellAmountText}
            style={{ color: isRefund ? C.red : C.text, width: "100%" }}
          >
            {isRefund ? "-" : ""}
            {formatCurrencyDisp(tx.amountCaptured || 0, true)}
          </span>
        </div>
        <div className={`${styles.cell} ${styles.cellDate}`}>
          <span className={styles.cellDateText} style={{ color: C.textMuted, width: "100%" }}>
            {dateStr}
          </span>
        </div>
      </button>
    );
  }

  function renderHeader() {
    let headers = [
      { field: "type", label: "Type", cls: styles.thType },
      { field: "method", label: "Method", cls: styles.thMethod },
      { field: "amount", label: "Amount", cls: styles.thAmount },
      { field: "date", label: "Date", cls: styles.thDate },
    ];
    return (
      <div
        className={styles.tableHeader}
        style={{ borderBottomColor: C.buttonLightGreenOutline }}
      >
        {headers.map((h) => {
          let isActive = sSortField === h.field;
          let arrow = isActive ? (sSortDir === "asc" ? " \u25B2" : " \u25BC") : "";
          let caretColor = isActive ? C.orange : "white";
          let tooltip = isActive
            ? "Sorted by " + h.label.toLowerCase() + " (" + (sSortDir === "asc" ? "ascending" : "descending") + "). Click to reverse."
            : "Click to sort by " + h.label.toLowerCase();
          return (
            <button
              type="button"
              key={h.field}
              onClick={() => handleHeaderSort(h.field)}
              title={tooltip}
              className={`${styles.thCell} ${h.cls}`}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                cursor: "pointer",
                color: "inherit",
              }}
            >
              <span className={styles.thText} style={{ color: isActive ? C.orange : "white" }}>
                {h.label}
                {arrow}
              </span>
              <span className={styles.thCaret} style={{ color: caretColor }}>
                {"\u25B8"}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <Dialog
        visible={true}
        onClose={handleExit}
        overlayColor={C.surfaceOverlay}
        title="Sales History"
      >
        <div className={styles.card}>
          {/* ═══ LEFT COLUMN: Quick Buttons ═══ */}
          <div className={styles.leftRail}>
            <div className={styles.leftRailTop}>
              <span className={styles.title} style={{ color: C.text }}>
                Sales History
              </span>
              {DATE_SHORTCUTS.map((sc) => {
                let isActive = sActiveShortcut === sc.label;
                return (
                  <button
                    type="button"
                    key={sc.label}
                    onClick={() => handleShortcut(sc)}
                    className={styles.shortcutRow}
                    style={{
                      backgroundColor: isActive ? C.orange : C.blue,
                      border: "none",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    <span className={styles.shortcutRowText}>{sc.label}</span>
                  </button>
                );
              })}
            </div>
            <div className={styles.leftRailBottom}>
              <Button
                text="CLOSE"
                colorGradientArr={COLOR_GRADIENTS.red}
                onPress={handleExit}
                buttonStyle={{ paddingLeft: 30, paddingRight: 30, paddingVertical: 10 }}
                textStyle={{ fontSize: 15, fontWeight: "700" }}
              />
            </div>
          </div>

          {/* ═══ MIDDLE COLUMN: Date Selectors ═══ */}
          <div className={styles.middleColumn}>
            {/* Begin Calendar */}
            <div className={styles.calendarCard}>
              <span className={styles.calendarHeader} style={{ color: C.orange }}>
                Begin Date
              </span>
              <div style={dayPickerWrapperStyle}>
                <DayPicker
                  key={"begin-" + sCalKey}
                  mode="range"
                  modifiersStyles={calendarModifiersStyles}
                  selected={{
                    from: displayStart ? new Date(displayStart) : undefined,
                    to: displayEnd ? new Date(displayEnd) : undefined,
                  }}
                  onSelect={(r) => {
                    _setActiveShortcut(null);
                    if (r?.from) _setPendingStart(dayjs(r.from));
                    if (r?.to || r?.from) _setPendingEnd(dayjs(r?.to || r?.from));
                  }}
                />
              </div>
            </div>

            {/* Date Range Summary */}
            <div className={styles.dateSummary} style={{ backgroundColor: C.blue }}>
              {dateChips.length === 1 ? (
                <span className={styles.dateSummaryText}>
                  {dayjs(displayStart).format("ddd M/D/YYYY")}
                </span>
              ) : (
                <span className={styles.dateSummaryText}>
                  {dateChips.length} days:{"  "}
                  <span>{dayjs(displayStart).format("ddd M/D/YYYY")}</span>
                  {"  →  "}
                  <span style={{ color: lightenRGBByPercent(C.green, 40) }}>
                    {dayjs(displayEnd).format("ddd M/D/YYYY")}
                  </span>
                </span>
              )}
            </div>

            {/* End Calendar */}
            {(() => {
              let beginMonth = dayjs(displayStart).month();
              let beginYear = dayjs(displayStart).year();
              let endSameAsBegin = sEndCalMonth === beginMonth && sEndCalYear === beginYear;

              function handleEndCalPrev() {
                let d = dayjs().month(sEndCalMonth).year(sEndCalYear).subtract(1, "month");
                _setEndCalMonth(d.month());
                _setEndCalYear(d.year());
              }
              function handleEndCalNext() {
                let d = dayjs().month(sEndCalMonth).year(sEndCalYear).add(1, "month");
                _setEndCalMonth(d.month());
                _setEndCalYear(d.year());
              }

              return (
                <div className={styles.calendarCard}>
                  <span
                    className={styles.calendarHeader}
                    style={{ color: lightenRGBByPercent(C.green, 40) }}
                  >
                    End Date
                  </span>
                  {endSameAsBegin ? (
                    <div className={styles.endCalNavRow}>
                      <button
                        type="button"
                        onClick={handleEndCalPrev}
                        className={styles.endCalNavBtn}
                        style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}
                      >
                        <span className={styles.endCalNavArrow}>{"<"}</span>
                      </button>
                      <span className={styles.endCalNavText}>
                        {dayjs().month(sEndCalMonth).year(sEndCalYear).format("MMMM YYYY")}
                      </span>
                      <button
                        type="button"
                        onClick={handleEndCalNext}
                        className={styles.endCalNavBtn}
                        style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}
                      >
                        <span className={styles.endCalNavArrow}>{">"}</span>
                      </button>
                    </div>
                  ) : (
                    <div style={dayPickerWrapperStyle}>
                      <DayPicker
                        key={"end-" + sCalKey + "-" + sEndCalMonth + "-" + sEndCalYear}
                        mode="range"
                        modifiersStyles={calendarModifiersStyles}
                        selected={{
                          from: displayStart ? new Date(displayStart) : undefined,
                          to: displayEnd ? new Date(displayEnd) : undefined,
                        }}
                        month={new Date(sEndCalYear, sEndCalMonth, 1)}
                        onMonthChange={(d) => {
                          _setEndCalMonth(d.getMonth());
                          _setEndCalYear(d.getFullYear());
                        }}
                        onSelect={(r) => {
                          _setActiveShortcut(null);
                          if (r?.from) _setPendingStart(dayjs(r.from));
                          if (r?.to || r?.from) _setPendingEnd(dayjs(r?.to || r?.from));
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Go Button */}
            <div className={styles.actionRow}>
              <Button
                text="GO"
                colorGradientArr={hasPendingRange ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
                onPress={handleGoButton}
                enabled={hasPendingRange}
                buttonStyle={{ paddingLeft: 40, paddingRight: 40, paddingVertical: 10 }}
                textStyle={{ fontSize: 15, fontWeight: "700" }}
              />
            </div>
          </div>

          {/* ═══ RIGHT COLUMN: Results ═══ */}
          <div className={styles.rightColumn}>
            {(sLoading || sTransactionLoading) && (
              <LoadingIndicator
                message={sLoading ? "Loading sales..." : "Loading transactions..."}
                color={C.blue}
              />
            )}

            {/* Results Count + Page Info */}
            <div className={styles.resultsHeader}>
              <span className={styles.resultsCount} style={{ color: C.textMuted }}>
                {sLoading
                  ? "Loading..."
                  : sViewMode === "sale"
                  ? (searchQuery
                      ? groups.length + " sales (" + filteredResults.length + " transactions) of " + sResults.length
                      : groups.length + " sales (" + sResults.length + " transactions)")
                  : sTransactionLoading
                  ? "Loading transactions..."
                  : (searchQuery
                      ? flatSorted.length + " transactions of " + sTransactionResults.length
                      : flatSorted.length + " transactions")}
              </span>
              <span className={styles.pageOf} style={{ color: C.textMuted }}>
                Page {sPage + 1} of {totalPages}
              </span>
            </div>

            {/* Search Bar */}
            <div className={styles.searchRow}>
              <div className={styles.viewModeToggle}>
                <button
                  type="button"
                  onClick={() => { _setViewMode("sale"); _setPage(0); }}
                  className={`${styles.viewModeBtn} ${styles.viewModeBtnLeft}`}
                  style={{
                    backgroundColor: sViewMode === "sale" ? C.blue : C.surfaceAlt,
                    border: "none",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <span
                    className={styles.viewModeText}
                    style={{ color: sViewMode === "sale" ? "white" : C.textMuted }}
                  >
                    By Sale
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleViewModeTransaction}
                  className={`${styles.viewModeBtn} ${styles.viewModeBtnRight}`}
                  style={{
                    backgroundColor: sViewMode === "transaction" ? C.blue : C.surfaceAlt,
                    border: "none",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <span
                    className={styles.viewModeText}
                    style={{ color: sViewMode === "transaction" ? "white" : C.textMuted }}
                  >
                    By Transaction
                  </span>
                </button>
              </div>
              <input
                type="text"
                value={sSearchText}
                onChange={(e) => {
                  _setSearchText(e.target.value);
                  _setPage(0);
                }}
                placeholder={
                  sViewMode === "transaction"
                    ? "Search by amount or payment type"
                    : "Search customer name or phone"
                }
                className={styles.searchInput}
                style={{
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  backgroundColor: C.listItemWhite,
                }}
              />
              <button
                type="button"
                onClick={() => {
                  _setSearchText("");
                  _setPage(0);
                }}
                disabled={!searchQuery}
                className={styles.clearBtn}
                style={{
                  backgroundColor: searchQuery ? C.orange : C.surfaceAlt,
                  border: "none",
                  cursor: searchQuery ? "pointer" : "default",
                  font: "inherit",
                }}
              >
                <span
                  className={styles.clearBtnText}
                  style={{ color: searchQuery ? "white" : C.textMuted }}
                >
                  Clear Search
                </span>
              </button>
            </div>

            {/* Table Header */}
            {renderHeader()}

            {/* Transaction List */}
            <div className={styles.listScroll}>
              {sViewMode === "sale"
                ? pageGroups.map((group) => (
                    <div key={group.saleID}>
                      {renderGroupHeader(group)}
                      {group.transactions.map((tx, idx) => renderTransactionRow(tx, idx))}
                    </div>
                  ))
                : pageTransactions.map((tx, idx) => renderTransactionRow(tx, idx))}
              {((sViewMode === "sale" && pageGroups.length === 0) ||
                (sViewMode === "transaction" && pageTransactions.length === 0)) &&
                !sLoading && (
                  <div className={styles.emptyState}>
                    <span className={styles.emptyStateText} style={{ color: C.textMuted }}>
                      {sResults.length === 0
                        ? "Select a date range to view transactions"
                        : "No matching transactions"}
                    </span>
                  </div>
                )}
            </div>

            {/* Pagination Controls */}
            <div className={styles.pagination} style={{ borderTopColor: C.borderStrong }}>
              <button
                type="button"
                onClick={() => _setPage(Math.max(0, sPage - 1))}
                disabled={sPage === 0}
                className={styles.pagBtn}
                style={{
                  backgroundColor: sPage === 0 ? C.surfaceAlt : C.blue,
                  border: "none",
                  cursor: sPage === 0 ? "default" : "pointer",
                  font: "inherit",
                  marginRight: 8,
                }}
              >
                <span
                  className={styles.pagBtnText}
                  style={{ color: sPage === 0 ? C.textMuted : "white" }}
                >
                  Prev
                </span>
              </button>
              <span className={styles.pagInfo} style={{ color: C.text }}>
                {sPage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => _setPage(Math.min(totalPages - 1, sPage + 1))}
                disabled={sPage >= totalPages - 1}
                className={styles.pagBtn}
                style={{
                  backgroundColor: sPage >= totalPages - 1 ? C.surfaceAlt : C.blue,
                  border: "none",
                  cursor: sPage >= totalPages - 1 ? "default" : "pointer",
                  font: "inherit",
                }}
              >
                <span
                  className={styles.pagBtnText}
                  style={{ color: sPage >= totalPages - 1 ? C.textMuted : "white" }}
                >
                  Next
                </span>
              </button>
            </div>

            {/* Summary Footer */}
            <div className={styles.footer} style={{ borderTopColor: C.buttonLightGreenOutline }}>
              {sViewMode === "sale" ? (
                <>
                  <SummaryItem label="Total Payments" value={totalPayments} />
                  <SummaryItem label="Tax-Exempt" value={taxExemptTotal} />
                  <SummaryItem label="Taxable" value={taxableTotal} />
                  <SummaryItem label="Sales Tax" value={salesTax} />
                  <SummaryItem label="Refunds" value={refundsTotal} isNegative={true} />
                </>
              ) : (
                <span className={styles.txModeNote}>
                  Transactions include deposits and no customer information attached. Return to Sale Mode to see information
                </span>
              )}
            </div>
          </div>

          {/* Loading Overlay (full-card) */}
          {sLoading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingCard}>
                <span className={styles.loadingTitle} style={{ color: C.text }}>
                  Loading Sales Data...
                </span>
                <LoadingIndicator
                  size="large"
                  color={C.blue}
                  message=""
                  centered={false}
                  style={{ marginBottom: 20 }}
                />
                <Button
                  text="Cancel"
                  colorGradientArr={COLOR_GRADIENTS.red}
                  onPress={handleCancelQuery}
                  buttonStyle={{ paddingHorizontal: 30, paddingVertical: 10 }}
                  textStyle={{ fontSize: 14 }}
                />
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Full Sale Modal (nested) */}
      {!!sSaleModalItem && (
        <Suspense fallback={<LoadingIndicator />}>
          <FullSaleModal
            item={sSaleModalItem}
            onClose={() => _setSaleModalItem(null)}
            onRefund={handleRefundFromSaleModal}
          />
        </Suspense>
      )}

      {/* Transaction Viewer Modal (nested) */}
      {!!sTransactionModalItem && (
        <TransactionViewerModal
          tx={sTransactionModalItem}
          onClose={() => _setTransactionModalItem(null)}
        />
      )}
    </>
  );
};

const TransactionViewerModal = ({ tx, onClose }) => {
  if (!tx) return null;

  let isRefund = tx.type === "refund";
  let dateStr = "";
  if (tx.millis) {
    let d = formatMillisForDisplay(tx.millis, true, true, true);
    let min = String(d.minutes).padStart(2, "0");
    dateStr = d.wordDayOfWeek + ", " + d.wordDayOfMonth + " " + d.dayOfMonth + " " + d.year + "  " + d.hour + ":" + min + " " + d.amPM;
  }

  let rows = [
    { label: "Type", value: capitalizeFirstLetterOfString(tx.type || "payment") },
    { label: "Method", value: capitalizeFirstLetterOfString(tx.method || "") },
    {
      label: "Amount",
      value: (isRefund ? "-" : "") + "$" + formatCurrencyDisp(tx.amountCaptured || 0),
      color: isRefund ? C.lightred : C.text,
    },
    { label: "Date", value: dateStr },
  ];
  if (tx.method === "card") {
    if (tx.cardType || tx.last4) rows.push({ label: "Card", value: (tx.cardType || "Card") + (tx.last4 ? "  ..." + tx.last4 : "") });
    if (tx.cardIssuer) rows.push({ label: "Issuer", value: tx.cardIssuer });
    if (tx.expMonth && tx.expYear) rows.push({ label: "Exp", value: tx.expMonth + "/" + tx.expYear });
    if (tx.authorizationCode) rows.push({ label: "Auth Code", value: tx.authorizationCode });
    if (tx.chargeID) rows.push({ label: "Charge ID", value: tx.chargeID });
  }
  if (tx.method === "cash" && tx.amountTendered) rows.push({ label: "Tendered", value: "$" + formatCurrencyDisp(tx.amountTendered) });
  if (tx.id) rows.push({ label: "Transaction ID", value: tx.id });

  return (
    <Dialog
      visible={true}
      onClose={onClose}
      overlayColor={C.surfaceOverlay}
      title="Transaction Details"
    >
      <div className={styles.txModalCard}>
        <div className={styles.txModalHeader}>
          <span className={styles.txModalHeaderText}>Transaction Details</span>
        </div>
        <div className={styles.txModalBody}>
          {rows.map((row, idx) => {
            let isLast = idx === rows.length - 1;
            return (
              <div
                key={idx}
                className={`${styles.txModalRow} ${isLast ? styles.txModalRowLast : ""}`}
                style={{ borderBottomColor: C.borderSubtle }}
              >
                <span className={styles.txModalLabel} style={{ color: C.textMuted }}>
                  {row.label}
                </span>
                <span
                  className={styles.txModalValue}
                  style={{ color: row.color || C.text }}
                >
                  {row.value}
                </span>
              </div>
            );
          })}
        </div>
        <div className={styles.txModalFooter}>
          <Button
            text="Close"
            colorGradientArr={COLOR_GRADIENTS.grey}
            onPress={onClose}
            buttonStyle={{ paddingHorizontal: 30, paddingVertical: 8 }}
            textStyle={{ fontSize: 13 }}
          />
        </div>
      </div>
    </Dialog>
  );
};

const SummaryItem = ({ label, value, isNegative }) => (
  <div className={styles.summaryItem}>
    <span className={styles.summaryLabel}>{label}</span>
    <span
      className={styles.summaryValue}
      style={isNegative ? { color: C.lightred } : undefined}
    >
      {isNegative ? "-" : ""}
      {formatCurrencyDisp(value, true)}
    </span>
  </div>
);
