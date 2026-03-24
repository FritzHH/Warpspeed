/*eslint-disable*/
import {
  TouchableWithoutFeedback,
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
} from "react-native-web";
import { Button_ } from "../../../components";
import { C, COLOR_GRADIENTS } from "../../../styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  getPreviousMondayDayJS,
  formatCurrencyDisp,
  formatMillisForDisplay,
  formatPhoneWithDashes,
  gray,
  lightenRGBByPercent,
  log,
} from "../../../utils";
import dayjs from "dayjs";
import CalendarPicker, {
  useDefaultStyles,
} from "react-native-ui-datepicker";
import { querySalesIndex } from "./newCheckoutModalScreen/newCheckoutFirebaseCalls";

const PAGE_SIZE = 100;

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
  const [sResults, _setResults] = useState([
    {
      id: "s12345678901",
      type: "sale",
      saleID: "s12345678901",
      millis: dayjs().subtract(1, "hour").valueOf(),
      customerFirst: "John",
      customerLast: "Davidson",
      customerCell: "2392919396",
      customerID: "cust001",
      total: 15000,
      subtotal: 13636,
      tax: 1364,
      salesTaxPercent: 10,
      discount: 0,
      amountRefunded: 0,
      itemCount: 3,
      highestItemName: "Continental Tire 700c",
      highestItemPrice: 8000,
      isStandaloneSale: false,
      workorderIDs: ["wo001"],
      paymentType: "Card",
    },
    {
      id: "s22345678902",
      type: "sale",
      saleID: "s22345678902",
      millis: dayjs().subtract(3, "hour").valueOf(),
      customerFirst: "Sarah",
      customerLast: "Mitchell",
      customerCell: "2395551234",
      customerID: "cust002",
      total: 4250,
      subtotal: 4250,
      tax: 0,
      salesTaxPercent: 0,
      discount: 500,
      amountRefunded: 0,
      itemCount: 1,
      highestItemName: "Brake Cable Set",
      highestItemPrice: 4250,
      isStandaloneSale: true,
      workorderIDs: [],
      paymentType: "Cash",
    },
    {
      id: "r33345678903",
      type: "refund",
      saleID: "s12345678901",
      millis: dayjs().subtract(30, "minute").valueOf(),
      customerFirst: "John",
      customerLast: "Davidson",
      customerCell: "2392919396",
      customerID: "cust001",
      total: 0,
      subtotal: 0,
      tax: 0,
      salesTaxPercent: 0,
      discount: 0,
      amountRefunded: 2500,
      itemCount: 1,
      highestItemName: "Inner Tube 700c",
      highestItemPrice: 2500,
      isStandaloneSale: false,
      workorderIDs: ["wo001"],
      paymentType: "Refund",
    },
    {
      id: "s44345678904",
      type: "sale",
      saleID: "s44345678904",
      millis: dayjs().subtract(5, "hour").valueOf(),
      customerFirst: "Maria",
      customerLast: "Gonzalez",
      customerCell: "2398675309",
      customerID: "cust003",
      total: 52499,
      subtotal: 47726,
      tax: 4773,
      salesTaxPercent: 10,
      discount: 2000,
      amountRefunded: 0,
      itemCount: 7,
      highestItemName: "Shimano Ultegra Groupset",
      highestItemPrice: 32000,
      isStandaloneSale: false,
      workorderIDs: ["wo002", "wo003"],
      paymentType: "Split",
    },
    {
      id: "s55345678905",
      type: "sale",
      saleID: "s55345678905",
      millis: dayjs().subtract(1, "day").valueOf(),
      customerFirst: "Robert",
      customerLast: "Chen",
      customerCell: "2391112222",
      customerID: "cust004",
      total: 1299,
      subtotal: 1299,
      tax: 0,
      salesTaxPercent: 0,
      discount: 0,
      amountRefunded: 0,
      itemCount: 2,
      highestItemName: "Water Bottle",
      highestItemPrice: 899,
      isStandaloneSale: true,
      workorderIDs: [],
      paymentType: "Card",
    },
  ]);
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
  const queryIdRef = useRef(0);
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
    querySalesIndex(startMillis, endMillis)
      .then((results) => {
        if (thisQueryId !== queryIdRef.current) return;
        _setResults(results || []);
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

  // Search filtering
  let searchQuery = sSearchText.trim().toLowerCase();
  let filteredResults = sResults;
  if (searchQuery) {
    filteredResults = sResults.filter((r) => {
      let first = (r.customerFirst || "").toLowerCase();
      let last = (r.customerLast || "").toLowerCase();
      let phone = (r.customerCell || "").toLowerCase();
      let item = (r.highestItemName || "").toLowerCase();
      return (
        first.includes(searchQuery) ||
        last.includes(searchQuery) ||
        phone.includes(searchQuery) ||
        item.includes(searchQuery) ||
        (first + " " + last).includes(searchQuery)
      );
    });
  }

  // Pagination
  let totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  let pageData = filteredResults.slice(sPage * PAGE_SIZE, (sPage + 1) * PAGE_SIZE);

  // Summary calculations over filtered results
  let totalSales = 0;
  let taxExemptSales = 0;
  let taxableSales = 0;
  let salesTax = 0;
  let refundsTotal = 0;
  filteredResults.forEach((r) => {
    if (r.type === "refund") {
      refundsTotal += r.amountRefunded || 0;
    } else {
      totalSales += r.total || 0;
      salesTax += r.tax || 0;
      if (r.tax === 0) {
        taxExemptSales += r.subtotal || 0;
      } else {
        taxableSales += r.subtotal || 0;
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

  function renderRow({ item, index }) {
    let isRefund = item.type === "refund";
    let bgColor =
      isRefund
        ? lightenRGBByPercent(C.red, 80)
        : index % 2 === 0
        ? C.listItemWhite
        : gray(0.075);

    let displayAmount = isRefund
      ? "-" + formatCurrencyDisp(item.amountRefunded, true)
      : formatCurrencyDisp(item.total, true);

    let typeLabel = isRefund
      ? "Refund"
      : item.isStandaloneSale
      ? "Sale"
      : "WO";

    let dateStr = formatMillisForDisplay(item.millis) || "";

    let topItemStr = item.highestItemName
      ? item.highestItemName +
        " " +
        formatCurrencyDisp(item.highestItemPrice, true)
      : "";

    let phoneStr = "";
    if (item.customerCell) {
      let digits = item.customerCell.toString().replace(/\D/g, "");
      if (digits.length === 10) phoneStr = "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
      else phoneStr = formatPhoneWithDashes(item.customerCell);
    }

    let paymentLabel = item.paymentType || "";

    return (
      <TouchableOpacity
        onPress={() => _setSaleModalItem(item)}
        activeOpacity={0.6}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 8,
          paddingHorizontal: 10,
          backgroundColor: bgColor,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.9),
        }}
      >
        <View style={{ flex: 1.6, paddingRight: 5 }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: 15, color: C.text, fontWeight: "600" }}
          >
            {item.customerFirst} {item.customerLast}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 14, color: gray(0.4) }}>
            {phoneStr}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 15,
            color: isRefund ? C.red : C.text,
            fontWeight: "600",
            textAlign: "right",
          }}
        >
          {displayAmount}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            flex: 0.7,
            fontSize: 14,
            color: gray(0.35),
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {paymentLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            flex: 0.5,
            fontSize: 15,
            color: C.text,
            textAlign: "center",
          }}
        >
          {item.itemCount}
        </Text>
        <Text
          numberOfLines={1}
          style={{ flex: 1.5, fontSize: 14, color: gray(0.35), paddingLeft: 5 }}
        >
          {dateStr}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            flex: 0.7,
            fontSize: 14,
            color: isRefund ? C.red : C.blue,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {typeLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={{ flex: 2.5, fontSize: 14, color: gray(0.35), paddingLeft: 5 }}
        >
          {topItemStr}
        </Text>
      </TouchableOpacity>
    );
  }

  function renderHeader() {
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
        <Text style={{ flex: 1.6, fontSize: 11, fontWeight: "700", color: "white" }}>
          Customer
        </Text>
        <Text
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: "700",
            color: "white",
            textAlign: "right",
          }}
        >
          Total
        </Text>
        <Text
          style={{
            flex: 0.7,
            fontSize: 11,
            fontWeight: "700",
            color: "white",
            textAlign: "center",
          }}
        >
          Payment
        </Text>
        <Text
          style={{
            flex: 0.5,
            fontSize: 11,
            fontWeight: "700",
            color: "white",
            textAlign: "center",
          }}
        >
          Qty
        </Text>
        <Text
          style={{
            flex: 1.5,
            fontSize: 11,
            fontWeight: "700",
            color: "white",
            paddingLeft: 5,
          }}
        >
          Date
        </Text>
        <Text
          style={{
            flex: 0.7,
            fontSize: 11,
            fontWeight: "700",
            color: "white",
            textAlign: "center",
          }}
        >
          Type
        </Text>
        <Text
          style={{
            flex: 2.5,
            fontSize: 11,
            fontWeight: "700",
            color: "white",
            paddingLeft: 5,
          }}
        >
          Top Item
        </Text>
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
                onChange={({ startDate }) => { _setActiveShortcut(null); _setPendingStart(dayjs(startDate)); }}
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
                  : searchQuery
                  ? filteredResults.length + " of " + sResults.length + " results"
                  : sResults.length + " results"}
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
              <TextInput
                value={sSearchText}
                onChangeText={(text) => {
                  _setSearchText(text);
                  _setPage(0);
                }}
                placeholder="Search name, phone, keyword"
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

            {/* FlatList */}
            <FlatList
              style={{ flex: 1 }}
              data={pageData}
              keyExtractor={(item, idx) => item.id || String(idx)}
              renderItem={renderRow}
            />

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
              <SummaryItem label="Total Sales" value={totalSales} />
              <SummaryItem label="Tax-Exempt" value={taxExemptSales} />
              <SummaryItem label="Taxable" value={taxableSales} />
              <SummaryItem label="Sales Tax" value={salesTax} />
              <SummaryItem
                label="Refunds"
                value={refundsTotal}
                isNegative={true}
              />
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }, [sStartDate, sEndDate, sResults, sPage, sLoading, sSaleModalItem, sActiveShortcut, sSearchText, sPendingStart, sPendingEnd, sEndCalMonth, sEndCalYear, sCalKey]);

  return ReactDOM.createPortal(
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
      <TouchableWithoutFeedback onPress={handleExit}>
        <View style={{ width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <Component />
        </View>
      </TouchableWithoutFeedback>
      {/* Sale TODO Modal */}
      {!!sSaleModalItem && (
        <SaleTodoModal
          item={sSaleModalItem}
          handleClose={() => _setSaleModalItem(null)}
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

const SaleTodoModal = ({ item, handleClose }) => {
  let TodoComponent = useCallback(() => {
    return (
      <TouchableWithoutFeedback>
        <View
          style={{
            width: 400,
            backgroundColor: C.backgroundWhite,
            borderRadius: 15,
            padding: 25,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 10 }}>
            {item.type === "refund" ? "Refund" : "Sale"}: {item.saleID || item.id}
          </Text>
          <Text style={{ fontSize: 13, color: gray(0.4), marginBottom: 5 }}>
            {item.customerFirst} {item.customerLast}
          </Text>
          <Text style={{ fontSize: 13, color: gray(0.4), marginBottom: 15 }}>
            {formatMillisForDisplay(item.millis)}
          </Text>
          <View
            style={{
              backgroundColor: lightenRGBByPercent(C.blue, 85),
              borderRadius: 10,
              padding: 15,
              width: "100%",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 14, color: C.blue, fontWeight: "600" }}>
              TODO: Full sale viewer coming soon
            </Text>
          </View>
          <Button_
            text="Close"
            colorGradientArr={COLOR_GRADIENTS.grey}
            onPress={handleClose}
            buttonStyle={{ paddingHorizontal: 30, paddingVertical: 8 }}
            textStyle={{ fontSize: 13 }}
          />
        </View>
      </TouchableWithoutFeedback>
    );
  }, [item]);

  return ReactDOM.createPortal(
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1001 }}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={{ width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <TodoComponent />
        </View>
      </TouchableWithoutFeedback>
    </View>,
    document.body
  );
};
