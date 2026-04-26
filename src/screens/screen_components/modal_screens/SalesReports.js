/*eslint-disable*/
import {
  TouchableWithoutFeedback,
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
} from "react-native-web";
import { Button_ } from "../../../components";
import { C, COLOR_GRADIENTS } from "../../../styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  getPreviousMondayDayJS,
  capitalizeFirstLetterOfString,
  formatCurrencyDisp,
  formatMillisForDisplay,
  gray,
  lightenRGBByPercent,
  log,
} from "../../../utils";
import dayjs from "dayjs";
import CalendarPicker, {
  useDefaultStyles,
} from "react-native-ui-datepicker";
import { queryCompletedSalesReport, queryActiveSalesForReport, queryTransactionsByDateRange } from "./newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { useActiveSalesStore, useCheckoutStore } from "../../../stores";
import { FullSaleModal } from "./FullSaleModal";

const PAGE_SIZE = 50;

const DATE_SHORTCUTS = [
  {
    label: "Today",
    start: () => dayjs().startOf("day"),
    end: () => dayjs().endOf("day"),
  },
  {
    label: "Yesterday",
    start: () => dayjs().subtract(1, "day").startOf("day"),
    end: () => dayjs().subtract(1, "day").endOf("day"),
  },
  {
    label: "Day Before",
    start: () => dayjs().subtract(2, "day").startOf("day"),
    end: () => dayjs().subtract(2, "day").endOf("day"),
  },
  {
    label: "This Week",
    start: () => getPreviousMondayDayJS(),
    end: () => dayjs(),
  },
  {
    label: "Last Week",
    start: () => getPreviousMondayDayJS().subtract(7, "day"),
    end: () => getPreviousMondayDayJS().subtract(1, "day"),
  },
  {
    label: "This Month",
    start: () => dayjs().startOf("month"),
    end: () => dayjs(),
  },
  {
    label: "Last Month",
    start: () => dayjs().subtract(1, "month").startOf("month"),
    end: () => dayjs().subtract(1, "month").endOf("month"),
  },
  {
    label: "Last Yr Same Mo",
    start: () => dayjs().subtract(1, "year").startOf("month"),
    end: () => dayjs().subtract(1, "year").endOf("month"),
  },
  {
    label: "This Year",
    start: () => dayjs().startOf("year"),
    end: () => dayjs(),
  },
  {
    label: "Last Year",
    start: () => dayjs().subtract(1, "year").startOf("year"),
    end: () => dayjs().subtract(1, "year").endOf("year"),
  },
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
  const defaultStyles = useDefaultStyles();

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
  const [sViewMode, _setViewMode] = useState("sale"); // "sale" or "transaction"
  const [sSortField, _setSortField] = useState("date");
  const [sSortDir, _setSortDir] = useState("desc");
  const [sTransactionResults, _setTransactionResults] = useState([]);
  const [sTransactionLoading, _setTransactionLoading] = useState(false);
  const queryIdRef = useRef(0);
  const txnQueryIdRef = useRef(0);
  const hasUserSelected = useRef(false);

  // Fetch data when dates change
  useEffect(() => {
    if (!hasUserSelected.current) return;
    if (!sStartDate || !sEndDate) return;
    let startMillis = dayjs(sStartDate).startOf("day").valueOf();
    let endMillis = dayjs(sEndDate).endOf("day").valueOf();
    let thisQueryId = ++queryIdRef.current;
    _setLoading(true);
    _setPage(0);

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
        _setResults(combined);
        _setLoading(false);
        console.log("[SalesReport]", JSON.stringify(combined, null, 2));
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

  // Display dates: pending overrides active for calendar display
  let displayStart = sPendingStart || sStartDate;
  let displayEnd = sPendingEnd || sEndDate;
  let hasPendingRange = !!sPendingStart && !!sPendingEnd;

  // Search filtering — filter transactions, then group
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

  // Mode-aware data processing
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
    flatSorted = filteredResults
      .filter((tx) => tx.type !== "pending")
      .sort((a, b) => {
        let dir = sSortDir === "asc" ? 1 : -1;
        if (sSortField === "amount") return ((a.amountCaptured || 0) - (b.amountCaptured || 0)) * dir;
        if (sSortField === "method") return (a.method || "").toLowerCase().localeCompare((b.method || "").toLowerCase()) * dir;
        if (sSortField === "type") return (a.type || "").toLowerCase().localeCompare((b.type || "").toLowerCase()) * dir;
        return ((a.millis || 0) - (b.millis || 0)) * dir;
      });
  }

  // Mode-aware pagination
  let itemCount = sViewMode === "sale" ? groups.length : flatSorted.length;
  let totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));
  let pageGroups = sViewMode === "sale" ? groups.slice(sPage * PAGE_SIZE, (sPage + 1) * PAGE_SIZE) : [];
  let pageTransactions = sViewMode === "transaction" ? flatSorted.slice(sPage * PAGE_SIZE, (sPage + 1) * PAGE_SIZE) : [];

  // Summary calculations over all filtered transactions
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

  let calendarStyles = {
    ...defaultStyles,
    today: {
      borderColor: C.lightred,
      borderWidth: 2,
      borderRadius: 100,
    },
    selected: {
      borderRadius: 100,
      backgroundColor: C.blue,
    },
    selected_label: { color: "white" },
    range: {
      backgroundColor: lightenRGBByPercent(C.blue, 70),
      borderRadius: 0,
    },
    range_label: { color: C.text },
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
      <View
        key={"gh-" + group.saleID}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 6,
          paddingHorizontal: 10,
          backgroundColor: gray(0.06),
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.darkBlue }}>
          {!hasCustomer && <Text style={{ color: labelColor }}>{label}</Text>}
          {hasCustomer && customerName}
        </Text>
        {isActive && (
          <View style={{
            marginLeft: 8,
            backgroundColor: C.orange,
            borderRadius: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "white" }}>Active</Text>
          </View>
        )}
      </View>
    );
  }

  function renderTransactionRow(tx, index) {
    let isRefund = tx.type === "refund";
    let isDeposit = tx.type === "deposit";
    let isActive = tx.source === "active";
    let bgColor = isRefund
      ? lightenRGBByPercent(C.red, 85)
      : C.listItemWhite;

    return (
      <TouchableOpacity
        key={tx.id || tx.saleID + "-" + index}
        onPress={() => handleRowPress(tx)}
        activeOpacity={0.6}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 8,
          paddingHorizontal: 10,
          backgroundColor: bgColor,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.05),
        }}
      >
        {isActive && (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange, marginRight: 4 }} />
        )}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: "600",
            color: isRefund ? C.red : isDeposit ? C.green : C.text,
            paddingLeft: isActive ? 0 : 10,
          }}
        >
          {capitalizeFirstLetterOfString(tx.type || "payment")}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            flex: 0.8,
            fontSize: 14,
            color: gray(0.5),
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {capitalizeFirstLetterOfString(tx.method || "")}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: "600",
            color: isRefund ? C.red : C.text,
            textAlign: "right",
          }}
        >
          {isRefund ? "-" : ""}{formatCurrencyDisp(tx.amountCaptured || 0, true)}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            flex: 1.5,
            fontSize: 13,
            color: gray(0.45),
            textAlign: "right",
            paddingRight: 5,
          }}
        >
          {tx.millis ? (() => {
            let d = formatMillisForDisplay(tx.millis, true, true, true);
            let min = String(d.minutes).padStart(2, "0");
            return d.wordDayOfWeek + ", " + d.wordDayOfMonth + " " + d.dayOfMonth + " '" + d.year + "  " + d.hour + ":" + min + " " + d.amPM;
          })() : ""}
        </Text>
      </TouchableOpacity>
    );
  }

  function renderHeader() {
    let headers = [
      { field: "type", label: "Type", flex: 1, align: "flex-start", padLeft: 10 },
      { field: "method", label: "Method", flex: 0.8, align: "center" },
      { field: "amount", label: "Amount", flex: 1, align: "flex-end" },
      { field: "date", label: "Date", flex: 1.5, align: "flex-end", padRight: 5 },
    ];
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 6,
          paddingHorizontal: 10,
          backgroundColor: "rgba(0,0,0,0.75)",
          borderBottomWidth: 2,
          borderBottomColor: C.buttonLightGreenOutline,
        }}
      >
        {headers.map((h) => {
          let isActive = sSortField === h.field;
          let arrow = isActive ? (sSortDir === "asc" ? " \u25B2" : " \u25BC") : "";
          let caretColor = isActive ? C.orange : "white";
          let tooltip = isActive
            ? "Sorted by " + h.label.toLowerCase() + " (" + (sSortDir === "asc" ? "ascending" : "descending") + "). Click to reverse."
            : "Click to sort by " + h.label.toLowerCase();
          return (
            <TouchableOpacity
              key={h.field}
              onPress={() => handleHeaderSort(h.field)}
              title={tooltip}
              activeOpacity={0.6}
              style={{
                flex: h.flex,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: h.align,
                paddingLeft: h.padLeft || 0,
                paddingRight: h.padRight || 0,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: isActive ? C.orange : "white" }}>
                {h.label}{arrow}
              </Text>
              <Text style={{ fontSize: 9, fontWeight: "700", color: caretColor, marginLeft: 4 }}>{"\u25B8"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  let Component = useCallback(() => {
    return (
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "92%",
            height: "94%",
            backgroundColor: C.backgroundWhite,
            borderRadius: 15,
            overflow: "hidden",
            flexDirection: "row",
          }}
        >
          {/* ═══ LEFT COLUMN: Quick Buttons ═══ */}
          <View
            style={{
              width: 165,
              paddingVertical: 8,
              paddingHorizontal: 6,
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 8, textAlign: "center" }}>
                Sales Reports
              </Text>
              {DATE_SHORTCUTS.map((sc) => {
                let isActive = sActiveShortcut === sc.label;
                return (
                  <TouchableOpacity
                    key={sc.label}
                    onPress={() => handleShortcut(sc)}
                    style={{
                      backgroundColor: isActive ? C.orange : C.blue,
                      borderRadius: 5,
                      paddingVertical: 8,
                      marginBottom: 6,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>
                      {sc.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ alignItems: "center", paddingTop: 8 }}>
              <Button_
                text="CLOSE"
                colorGradientArr={COLOR_GRADIENTS.red}
                onPress={handleExit}
                buttonStyle={{ paddingLeft: 30, paddingRight: 30, paddingVertical: 10 }}
                textStyle={{ fontSize: 15, fontWeight: "700" }}
              />
            </View>
          </View>

          {/* ═══ MIDDLE COLUMN: Date Selectors ═══ */}
          <ScrollView
            style={{
              flex: 1,
              maxWidth: "28%",
            }}
            contentContainerStyle={{ padding: 8 }}
          >
            {/* Begin Calendar */}
            <View
              style={{
                backgroundColor: "rgba(0,0,0,0.75)",
                borderRadius: 10,
                paddingVertical: 4,
                paddingHorizontal: 2,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: C.orange, fontSize: 10, fontWeight: "600", marginBottom: 2 }}>
                Begin Date
              </Text>
              <CalendarPicker
                key={"begin-" + sCalKey}
                styles={calendarStyles}
                mode="range"
                startDate={displayStart}
                endDate={displayEnd}
                onChange={({ startDate, endDate }) => {
                  _setActiveShortcut(null);
                  _setPendingStart(dayjs(startDate));
                  if (endDate) _setPendingEnd(dayjs(endDate));
                }}
              />
            </View>

            {/* Date Range Summary */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: C.blue,
                borderRadius: 6,
                paddingVertical: 6,
                paddingHorizontal: 10,
                marginBottom: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {dateChips.length === 1 ? (
                <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>
                  {dayjs(displayStart).format("ddd M/D/YYYY")}
                </Text>
              ) : (
                <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>
                  {dateChips.length} days:  <Text style={{ color: "white" }}>{dayjs(displayStart).format("ddd M/D/YYYY")}</Text>  →  <Text style={{ color: lightenRGBByPercent(C.green, 40) }}>{dayjs(displayEnd).format("ddd M/D/YYYY")}</Text>
                </Text>
              )}
            </View>

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
                <View
                  style={{
                    backgroundColor: "rgba(0,0,0,0.75)",
                    borderRadius: 10,
                    paddingVertical: 4,
                    paddingHorizontal: 2,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: lightenRGBByPercent(C.green, 40), fontSize: 10, fontWeight: "600", marginBottom: 2 }}>
                    End Date
                  </Text>
                  {endSameAsBegin ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                      }}
                    >
                      <TouchableOpacity onPress={handleEndCalPrev} style={{ padding: 4 }}>
                        <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>{"<"}</Text>
                      </TouchableOpacity>
                      <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>
                        {dayjs().month(sEndCalMonth).year(sEndCalYear).format("MMMM YYYY")}
                      </Text>
                      <TouchableOpacity onPress={handleEndCalNext} style={{ padding: 4 }}>
                        <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>{">"}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <CalendarPicker
                      key={"end-" + sCalKey + "-" + sEndCalMonth + "-" + sEndCalYear}
                      styles={calendarStyles}
                      mode="range"
                      startDate={displayStart}
                      endDate={displayEnd}
                      month={sEndCalMonth}
                      year={sEndCalYear}
                      onChange={({ endDate }) => { _setActiveShortcut(null); _setPendingEnd(dayjs(endDate)); }}
                    />
                  )}
                </View>
              );
            })()}

            {/* Go Button */}
            <View style={{ alignItems: "center" }}>
              <Button_
                text="GO"
                colorGradientArr={hasPendingRange ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
                onPress={handleGoButton}
                disabled={!hasPendingRange}
                buttonStyle={{ paddingLeft: 40, paddingRight: 40, paddingVertical: 10 }}
                textStyle={{ fontSize: 15, fontWeight: "700" }}
              />
            </View>
          </ScrollView>

          {/* ═══ RIGHT COLUMN: Results ═══ */}
          <View style={{ flex: 2 }}>
            {/* Results Count + Loading */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ fontSize: 12, color: gray(0.4) }}>
                {sLoading
                  ? "Loading..."
                  : sViewMode === "sale"
                  ? (searchQuery
                      ? groups.length + " sales (" + filteredResults.length + " transactions) of " + sResults.length
                      : groups.length + " sales (" + sResults.length + " transactions)")
                  : (searchQuery
                      ? flatSorted.length + " transactions of " + sResults.length
                      : flatSorted.length + " transactions")}
              </Text>
              <Text style={{ fontSize: 12, color: gray(0.4) }}>
                Page {sPage + 1} of {totalPages}
              </Text>
            </View>

            {/* Search Bar */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 10,
                paddingBottom: 5,
              }}
            >
              {/* View Mode Toggle */}
              <View style={{ flexDirection: "row", marginRight: 10 }}>
                <TouchableOpacity
                  onPress={() => { _setViewMode("sale"); _setPage(0); }}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    backgroundColor: sViewMode === "sale" ? C.blue : gray(0.85),
                    borderTopLeftRadius: 6,
                    borderBottomLeftRadius: 6,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: sViewMode === "sale" ? "white" : gray(0.4) }}>
                    By Sale
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    _setViewMode("transaction");
                    _setPage(0);
                    if (!sStartDate || !sEndDate) return;
                    let startMillis = dayjs(sStartDate).startOf("day").valueOf();
                    let endMillis = dayjs(sEndDate).endOf("day").valueOf();
                    let thisQueryId = ++txnQueryIdRef.current;
                    _setTransactionLoading(true);
                    queryTransactionsByDateRange(startMillis, endMillis)
                      .then((txns) => {
                        if (thisQueryId !== txnQueryIdRef.current) return;
                        console.log("[SalesReport] [By Transaction]", JSON.stringify(txns, null, 2));
                        _setTransactionResults(txns);
                        _setTransactionLoading(false);
                      })
                      .catch(() => {
                        if (thisQueryId !== txnQueryIdRef.current) return;
                        _setTransactionResults([]);
                        _setTransactionLoading(false);
                      });
                  }}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    backgroundColor: sViewMode === "transaction" ? C.blue : gray(0.85),
                    borderTopRightRadius: 6,
                    borderBottomRightRadius: 6,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: sViewMode === "transaction" ? "white" : gray(0.4) }}>
                    By Transaction
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={sSearchText}
                onChangeText={(text) => {
                  _setSearchText(text);
                  _setPage(0);
                }}
                placeholder={sViewMode === "transaction" ? "Search by amount or payment type" : "Search customer name or phone"}
                placeholderTextColor={gray(0.65)}
                style={{
                  flex: 1,
                  maxWidth: "50%",
                  borderWidth: 2,
                  borderColor: C.buttonLightGreenOutline,
                  borderRadius: 8,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  fontSize: 13,
                  color: C.text,
                  backgroundColor: C.listItemWhite,
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  _setSearchText("");
                  _setPage(0);
                }}
                disabled={!searchQuery}
                style={{
                  marginLeft: 8,
                  backgroundColor: searchQuery ? C.orange : gray(0.8),
                  borderRadius: 5,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                }}
              >
                <Text
                  style={{
                    color: searchQuery ? "white" : gray(0.5),
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  Clear Search
                </Text>
              </TouchableOpacity>
            </View>

            {/* Table Header */}
            {renderHeader()}

            {/* Transaction List */}
            <ScrollView style={{ flex: 1 }}>
              {sViewMode === "sale" ? (
                pageGroups.map((group) => (
                  <View key={group.saleID}>
                    {renderGroupHeader(group)}
                    {group.transactions.map((tx, idx) => renderTransactionRow(tx, idx))}
                  </View>
                ))
              ) : (
                pageTransactions.map((tx, idx) => renderTransactionRow(tx, idx))
              )}
              {((sViewMode === "sale" && pageGroups.length === 0) ||
                (sViewMode === "transaction" && pageTransactions.length === 0)) &&
                !sLoading && (
                  <View style={{ paddingVertical: 30, alignItems: "center" }}>
                    <Text style={{ fontSize: 14, color: gray(0.5) }}>
                      {sResults.length === 0 ? "Select a date range to view transactions" : "No matching transactions"}
                    </Text>
                  </View>
                )}
            </ScrollView>

            {/* Pagination Controls */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                paddingVertical: 4,
                borderTopWidth: 1,
                borderTopColor: gray(0.85),
              }}
            >
              <TouchableOpacity
                onPress={() => _setPage(Math.max(0, sPage - 1))}
                disabled={sPage === 0}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  backgroundColor: sPage === 0 ? gray(0.85) : C.blue,
                  borderRadius: 5,
                  marginRight: 8,
                }}
              >
                <Text
                  style={{
                    color: sPage === 0 ? gray(0.5) : "white",
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  Prev
                </Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: C.text, marginRight: 8 }}>
                {sPage + 1} / {totalPages}
              </Text>
              <TouchableOpacity
                onPress={() => _setPage(Math.min(totalPages - 1, sPage + 1))}
                disabled={sPage >= totalPages - 1}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  backgroundColor: sPage >= totalPages - 1 ? gray(0.85) : C.blue,
                  borderRadius: 5,
                }}
              >
                <Text
                  style={{
                    color: sPage >= totalPages - 1 ? gray(0.5) : "white",
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  Next
                </Text>
              </TouchableOpacity>
            </View>

            {/* Summary Footer */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-evenly",
                paddingVertical: 8,
                paddingHorizontal: 10,
                backgroundColor: "rgba(0,0,0,0.75)",
                borderTopWidth: 2,
                borderTopColor: C.buttonLightGreenOutline,
              }}
            >
              {sViewMode === "sale" ? (
                <>
                  <SummaryItem label="Total Payments" value={totalPayments} />
                  <SummaryItem label="Tax-Exempt" value={taxExemptTotal} />
                  <SummaryItem label="Taxable" value={taxableTotal} />
                  <SummaryItem label="Sales Tax" value={salesTax} />
                  <SummaryItem label="Refunds" value={refundsTotal} isNegative={true} />
                </>
              ) : (
                <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "500", fontStyle: "italic", paddingVertical: 4, textAlign: "center" }}>Transactions include deposits and no customer information attached. Return to Sale Mode to see information</Text>
              )}
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }, [sStartDate, sEndDate, sResults, sPage, sLoading, sSaleModalItem, sActiveShortcut, sSearchText, sPendingStart, sPendingEnd, sEndCalMonth, sEndCalYear, sCalKey, sViewMode, sSortField, sSortDir]);

  return ReactDOM.createPortal(
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
      <TouchableWithoutFeedback onPress={handleExit}>
        <View style={{ width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <Component />
        </View>
      </TouchableWithoutFeedback>
      {/* Full Sale Modal */}
      {!!sSaleModalItem && (
        <FullSaleModal
          item={sSaleModalItem}
          onClose={() => _setSaleModalItem(null)}
          onRefund={handleRefundFromSaleModal}
        />
      )}
      {/* Loading Overlay */}
      {sLoading && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <View
            style={{
              backgroundColor: C.backgroundWhite,
              borderRadius: 15,
              padding: 30,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 15 }}>
              Loading Sales Data...
            </Text>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 4,
                borderColor: gray(0.85),
                borderTopColor: C.blue,
                marginBottom: 20,
              }}
            />
            <Button_
              text="Cancel"
              colorGradientArr={COLOR_GRADIENTS.red}
              onPress={handleCancelQuery}
              buttonStyle={{ paddingHorizontal: 30, paddingVertical: 10 }}
              textStyle={{ fontSize: 14 }}
            />
          </View>
        </View>
      )}
    </View>,
    document.body
  );
};

const SummaryItem = ({ label, value, isNegative }) => (
  <View style={{ alignItems: "center", marginHorizontal: 8, marginVertical: 2 }}>
    <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "600" }}>
      {label}
    </Text>
    <Text
      style={{
        fontSize: 16,
        fontWeight: "700",
        color: isNegative ? C.lightred : "white",
      }}
    >
      {isNegative ? "-" : ""}
      {formatCurrencyDisp(value, true)}
    </Text>
  </View>
);

