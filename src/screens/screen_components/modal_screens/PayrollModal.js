/*eslint-disable*/
import {
  TouchableWithoutFeedback,
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
} from "react-native-web";
import { Button_, DropdownMenu, Image_, TextInput_ } from "../../../components";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  formatMillisForDisplay,
  convertMillisToHoursMins,
  trimToTwoDecimals,
  gray,
  log,
  generateRandomID,
  lightenRGBByPercent,
} from "../../../utils";
import dayjs from "dayjs";
import CalendarPicker, {
  useDefaultStyles,
} from "react-native-ui-datepicker";
import { cloneDeep, sortBy } from "lodash";
import { useSettingsStore, useAlertScreenStore } from "../../../stores";
import {
  dbGetPunchesByTimeFrame,
  dbSavePunchObject,
  dbSendEmail,
} from "../../../db_calls_wrapper";
import { TIME_PUNCH_PROTO } from "../../../data";
import {
  MILLIS_IN_DAY,
  MILLIS_IN_HOUR,
  MILLIS_IN_MINUTE,
} from "../../../constants";

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const BEGIN_OPTIONS = DAY_NAMES.map((d) => ({ label: d, value: "last" + d }));
const END_OPTIONS = DAY_NAMES.map((d) => ({ label: d, value: "this" + d }));

function resolveAnchor(anchor) {
  if (!anchor || typeof anchor !== "string") return dayjs();
  let isLast = anchor.startsWith("last");
  let dayName = isLast ? anchor.slice(4) : anchor.slice(4);
  let targetIdx = DAY_NAMES.indexOf(dayName);
  if (targetIdx === -1) return dayjs();
  let todayIdx = dayjs().day();
  if (isLast) {
    let diff = (todayIdx - targetIdx + 7) % 7;
    return dayjs().subtract(diff, "day").startOf("day");
  } else {
    let diff = (targetIdx - todayIdx + 7) % 7;
    return dayjs().add(diff, "day").endOf("day");
  }
}

function getTimeFrameRange(tf) {
  let begin = tf?.begin || "lastFriday";
  let end = tf?.end || "thisThursday";
  return {
    start: resolveAnchor(begin),
    end: resolveAnchor(end),
  };
}

const STATIC_SHORTCUTS = [
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

/** Pair raw punch array into in/out rows for display */
function pairPunches(filteredArr) {
  let resArr = [];
  let resObj = {};
  let counter = 0;
  let lastOneWasClockIn = false;

  filteredArr.forEach((obj) => {
    obj = cloneDeep(obj);

    if (counter === 0 && obj.option === "out") {
      resObj.out = obj;
      resArr.push(resObj);
      resObj = {};
      counter++;
      lastOneWasClockIn = false;
      return;
    }

    if (counter === filteredArr.length - 1 && obj.option === "in") {
      resObj.in = obj;
      resArr.push(resObj);
      lastOneWasClockIn = true;
      counter++;
      return;
    }

    if (obj.option === "in" && lastOneWasClockIn) {
      resObj.in = obj;
      resArr.push(resObj);
      resObj = {};
      counter++;
      return;
    }

    if (obj.option === "in") {
      lastOneWasClockIn = true;
      resObj.in = obj;
    } else if (obj.option === "out") {
      lastOneWasClockIn = false;
      resObj.out = obj;
      resArr.push(resObj);
      resObj = {};
    }
    counter++;
  });

  let arr = [];
  let runningTotalMinutes = 0;

  resArr.forEach((obj) => {
    obj = cloneDeep(obj);

    if (obj.in) {
      obj.in = {
        ...obj.in,
        ...formatMillisForDisplay(obj.in.millis, true, true),
      };
    }
    if (obj.out) {
      obj.out = {
        ...obj.out,
        ...formatMillisForDisplay(obj.out.millis, true, true),
      };
    }

    if (obj.in && obj.out) {
      let total = convertMillisToHoursMins(obj.out.millis - obj.in.millis);
      obj.hoursDiff = total.hours;
      obj.minutesDiff = total.minutes;
      obj.totalMinutes = total.totalMinutes;
      runningTotalMinutes += total.totalMinutes;
      if (Number(obj.minutesDiff) < 10) {
        obj.minutesDiff = "0" + obj.minutesDiff.toString();
      }
    }

    arr.push(obj);
  });

  return { displayArr: arr, runningTotalMinutes };
}

export const PayrollModal = ({ handleExit }) => {
  const defaultStyles = useDefaultStyles();
  const zSettingsObj = useSettingsStore((state) => state.settings);

  let tf = zSettingsObj?.defaultPayrollTimeFrame || { begin: "lastFriday", end: "thisThursday" };
  let defaultRange = getTimeFrameRange(tf);

  // selected user
  const [sSelectedUser, _setSelectedUser] = useState(null);

  // date state — default to settings range
  const [sStartDate, _setStartDate] = useState(defaultRange.start);
  const [sEndDate, _setEndDate] = useState(defaultRange.end);
  const [sActiveShortcut, _setActiveShortcut] = useState("Pay Period");
  const [sPendingStart, _setPendingStart] = useState(null);
  const [sPendingEnd, _setPendingEnd] = useState(null);
  const [sEndCalMonth, _setEndCalMonth] = useState(dayjs().month());
  const [sEndCalYear, _setEndCalYear] = useState(dayjs().year());
  const [sCalKey, _setCalKey] = useState(0);

  // punch data
  const [sFilteredArr, _setFilteredArr] = useState([]);
  const [sLoading, _setLoading] = useState(false);
  const [sEditableRowIdx, _setEditableRowIdx] = useState(null);
  const [sHasUnsavedChanges, _setHasUnsavedChanges] = useState(false);
  const [sSaving, _setSaving] = useState(false);
  const [sEmailing, _setEmailing] = useState(false);
  const [sEmailStatus, _setEmailStatus] = useState(null); // "sent" | "error" | "no-email"

  // track which punch IDs have been modified
  const modifiedPunchIdsRef = useRef(new Set());
  const queryIdRef = useRef(0);

  // Manual fetch — called by Go button and shortcut buttons
  function fetchPunches(overrideStart, overrideEnd) {
    if (!sSelectedUser) return;
    let start = overrideStart || sStartDate;
    let end = overrideEnd || sEndDate;
    if (!start || !end) return;

    let startMillis = dayjs(start).startOf("day").valueOf();
    let endMillis = dayjs(end).endOf("day").valueOf();
    let thisQueryId = ++queryIdRef.current;

    _setLoading(true);
    _setEditableRowIdx(null);
    _setHasUnsavedChanges(false);
    modifiedPunchIdsRef.current = new Set();

    dbGetPunchesByTimeFrame(startMillis, endMillis, {
      userID: sSelectedUser.id,
      timestampField: "millis",
    })
      .then((resArr) => {
        if (thisQueryId !== queryIdRef.current) return;
        resArr = sortBy(resArr || [], "millis");
        _setFilteredArr(resArr);
        _setLoading(false);
      })
      .catch((e) => {
        if (thisQueryId !== queryIdRef.current) return;
        log("Error fetching punches:", e);
        _setFilteredArr([]);
        _setLoading(false);
      });
  }

  // Compute paired display data from raw punches
  let { displayArr, runningTotalMinutes } = pairPunches(sFilteredArr);
  let totalHoursObj = convertMillisToHoursMins(
    runningTotalMinutes * MILLIS_IN_MINUTE
  );
  let hourlyWage = Number(sSelectedUser?.hourlyWage) || 0;
  let totalWages = trimToTwoDecimals((runningTotalMinutes / 60) * hourlyWage);

  function handleDefaultRangeShortcut() {
    let curTf = zSettingsObj?.defaultPayrollTimeFrame || { begin: "lastFriday", end: "thisThursday" };
    let range = getTimeFrameRange(curTf);
    _setActiveShortcut("Pay Period");
    _setPendingStart(null);
    _setPendingEnd(null);
    _setStartDate(range.start);
    _setEndDate(range.end);
    _setEndCalMonth(range.end.month());
    _setEndCalYear(range.end.year());
    _setCalKey((prev) => prev + 1);
    fetchPunches(range.start, range.end);
  }

  function handleShortcut(shortcut) {
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
    fetchPunches(start, end);
  }

  function handleGoButton() {
    let start = sStartDate;
    let end = sEndDate;
    // If there's a pending calendar range, apply it first
    if (sPendingStart && sPendingEnd) {
      start = sPendingStart;
      end = sPendingEnd;
      _setActiveShortcut(null);
      _setStartDate(start);
      _setEndDate(end);
      _setEndCalMonth(end.month());
      _setEndCalYear(end.year());
      _setCalKey((prev) => prev + 1);
      _setPendingStart(null);
      _setPendingEnd(null);
    }
    fetchPunches(start, end);
  }

  function handleUserSelect(userObj) {
    _setSelectedUser(userObj);
    _setFilteredArr([]);
    _setEditableRowIdx(null);
    _setHasUnsavedChanges(false);
    modifiedPunchIdsRef.current = new Set();
  }

  function handleTimeEdit(rowObj, option) {
    rowObj = cloneDeep(rowObj);
    let millis;

    switch (option) {
      case "in-date-up":
        millis = rowObj.in.millis + MILLIS_IN_DAY;
        break;
      case "in-date-down":
        millis = rowObj.in.millis - MILLIS_IN_DAY;
        break;
      case "out-date-up":
        millis = rowObj.out.millis + MILLIS_IN_DAY;
        break;
      case "out-date-down":
        millis = rowObj.out.millis - MILLIS_IN_DAY;
        break;
      case "in-hour-up":
        millis = rowObj.in.millis + MILLIS_IN_HOUR;
        break;
      case "in-hour-down":
        millis = rowObj.in.millis - MILLIS_IN_HOUR;
        break;
      case "out-hour-up":
        millis = rowObj.out.millis + MILLIS_IN_HOUR;
        break;
      case "out-hour-down":
        millis = rowObj.out.millis - MILLIS_IN_HOUR;
        break;
      case "in-minutes-up":
        millis = rowObj.in.millis + MILLIS_IN_MINUTE;
        break;
      case "in-minutes-down":
        millis = rowObj.in.millis - MILLIS_IN_MINUTE;
        break;
      case "out-minutes-up":
        millis = rowObj.out.millis + MILLIS_IN_MINUTE;
        break;
      case "out-minutes-down":
        millis = rowObj.out.millis - MILLIS_IN_MINUTE;
        break;
      case "in-am-pm": {
        let val = 12 * MILLIS_IN_HOUR;
        if (rowObj.in.amPM === "PM") val = val * -1;
        millis = rowObj.in.millis + val;
        break;
      }
      case "out-am-pm": {
        let val = 12 * MILLIS_IN_HOUR;
        if (rowObj.out.amPM === "PM") val = val * -1;
        millis = rowObj.out.millis + val;
        break;
      }
      default:
        return;
    }

    let punchObj;
    let idx;
    if (option.includes("in-")) {
      idx = sFilteredArr.findIndex((o) => o.id === rowObj.in.id);
      punchObj = sFilteredArr[idx];
    } else {
      idx = sFilteredArr.findIndex((o) => o.id === rowObj.out.id);
      punchObj = sFilteredArr[idx];
    }

    // prevent in time >= out time
    if (option.includes("in-") && rowObj.in && rowObj.out) {
      if (millis >= rowObj.out.millis) return;
    }
    if (option.includes("out-") && rowObj.in && rowObj.out) {
      if (millis <= rowObj.in.millis) return;
    }

    let filteredArr = cloneDeep(sFilteredArr);
    punchObj = cloneDeep(punchObj);
    punchObj.millis = millis;
    filteredArr[idx] = punchObj;
    _setFilteredArr(filteredArr);
    _setHasUnsavedChanges(true);
    modifiedPunchIdsRef.current.add(punchObj.id);
  }

  function handleDirectTimeEdit(item, prefix, field, value) {
    let punch = prefix === "in" ? item.in : item.out;
    if (!punch) return;
    let numVal = parseInt(value, 10);
    if (isNaN(numVal)) return;

    let date = new Date(punch.millis);

    if (field === "hour") {
      if (numVal < 1 || numVal > 12) return;
      let hours24;
      if (punch.amPM === "AM") {
        hours24 = numVal === 12 ? 0 : numVal;
      } else {
        hours24 = numVal === 12 ? 12 : numVal + 12;
      }
      date.setHours(hours24);
    } else if (field === "minutes") {
      if (numVal < 0 || numVal > 59) return;
      date.setMinutes(numVal);
    }

    let newMillis = date.getTime();

    let idx = sFilteredArr.findIndex((o) => o.id === punch.id);
    if (idx === -1) return;

    let otherPunch = prefix === "in" ? item.out : item.in;
    if (prefix === "in" && otherPunch && newMillis >= otherPunch.millis) return;
    if (prefix === "out" && otherPunch && newMillis <= otherPunch.millis) return;

    let filteredArr = cloneDeep(sFilteredArr);
    filteredArr[idx] = { ...filteredArr[idx], millis: newMillis };
    _setFilteredArr(filteredArr);
    _setHasUnsavedChanges(true);
    modifiedPunchIdsRef.current.add(punch.id);
  }

  function handleCreateMissingPunch(displayItem, option) {
    let referencePunch = option === "in" ? displayItem.out : displayItem.in;
    if (!referencePunch) return;

    let newMillis = option === "in"
      ? referencePunch.millis - MILLIS_IN_HOUR
      : referencePunch.millis + MILLIS_IN_HOUR;

    let punchObj = { ...TIME_PUNCH_PROTO };
    punchObj.userID = sSelectedUser.id;
    punchObj.id = generateRandomID();
    punchObj.millis = newMillis;
    punchObj.option = option;

    let filteredArr = cloneDeep(sFilteredArr);
    filteredArr.push(punchObj);
    filteredArr = sortBy(filteredArr, "millis");
    _setFilteredArr(filteredArr);
    _setHasUnsavedChanges(true);
    modifiedPunchIdsRef.current.add(punchObj.id);
  }

  function handleNewPunchPress() {
    if (!sSelectedUser) return;
    let usePrevious = false;
    let prevPunchObj = sFilteredArr[sFilteredArr.length - 1];
    if (prevPunchObj && prevPunchObj.option === "in") usePrevious = true;

    let punchObj = { ...TIME_PUNCH_PROTO };
    punchObj.userID = sSelectedUser.id;
    punchObj.id = generateRandomID();
    punchObj.millis = usePrevious
      ? prevPunchObj.millis + MILLIS_IN_HOUR
      : new Date().getTime();
    punchObj.option = usePrevious ? "out" : "in";

    let filteredArr = cloneDeep(sFilteredArr);
    filteredArr.push(punchObj);
    _setFilteredArr(filteredArr);
    _setHasUnsavedChanges(true);
    modifiedPunchIdsRef.current.add(punchObj.id);
  }

  function handleDeletePunchPress(punchObj) {
    let arr = cloneDeep(sFilteredArr).filter((o) => o.id !== punchObj.id);
    _setFilteredArr(arr);
    _setHasUnsavedChanges(true);
    modifiedPunchIdsRef.current.add(punchObj.id);
  }

  async function handleSave() {
    if (!sHasUnsavedChanges) return;
    _setSaving(true);

    try {
      let promises = sFilteredArr
        .filter((p) => modifiedPunchIdsRef.current.has(p.id))
        .map((p) => dbSavePunchObject(p));

      await Promise.all(promises);
      _setHasUnsavedChanges(false);
      modifiedPunchIdsRef.current = new Set();
    } catch (e) {
      log("Error saving punches:", e);
    }

    _setSaving(false);
  }

  async function handleEmailPayroll() {
    if (!sSelectedUser) return;
    let userEmail = sSelectedUser.email;
    if (!userEmail) {
      _setEmailStatus("no-email");
      setTimeout(() => _setEmailStatus(null), 3000);
      return;
    }

    _setEmailing(true);
    _setEmailStatus(null);

    try {
      // Build daily breakdown from display data
      let dailyLines = displayArr.map((row) => {
        let date =
          (row.in?.wordDayOfWeek || row.out?.wordDayOfWeek || "") +
          ", " +
          (row.in?.wordDayOfMonth || row.out?.wordDayOfMonth || "") +
          " " +
          (row.in?.dayOfMonth || row.out?.dayOfMonth || "");
        let inTime = row.in
          ? row.in.hour + ":" + String(row.in.minutes).padStart(2, "0") + " " + row.in.amPM
          : "--";
        let outTime = row.out
          ? row.out.hour + ":" + String(row.out.minutes).padStart(2, "0") + " " + row.out.amPM
          : "--";
        let hours =
          row.hoursDiff != null || row.minutesDiff != null
            ? (row.hoursDiff || 0) + ":" + (row.minutesDiff || "00")
            : "--";
        return date + "  |  In: " + inTime + "  |  Out: " + outTime + "  |  " + hours;
      });

      let employeeName = sSelectedUser.first + " " + sSelectedUser.last;
      let payPeriod =
        dayjs(sStartDate).format("M/D/YYYY") +
        " – " +
        dayjs(sEndDate).format("M/D/YYYY");
      let totalHoursStr =
        totalHoursObj.hours + ":" + String(totalHoursObj.minutes).padStart(2, "0");
      let payRateStr = "$" + hourlyWage.toFixed(2) + "/hr";
      let totalPayStr = "$" + Number(totalWages).toLocaleString();
      let storeName = zSettingsObj?.storeInfo?.displayName || "";

      // Find the payroll template from settings
      let template = (zSettingsObj?.emailTemplates || []).find(
        (t) => t.id === "default_payroll_summary"
      );

      let subject, body;
      if (template) {
        subject = template.subject
          .replace(/\{employeeName\}/g, employeeName)
          .replace(/\{payPeriod\}/g, payPeriod);
        body = template.body
          .replace(/\{employeeName\}/g, employeeName)
          .replace(/\{payPeriod\}/g, payPeriod)
          .replace(/\{dailyBreakdown\}/g, dailyLines.join("\n"))
          .replace(/\{totalHours\}/g, totalHoursStr)
          .replace(/\{payRate\}/g, payRateStr)
          .replace(/\{totalPay\}/g, totalPayStr)
          .replace(/\{storeName\}/g, storeName);
      } else {
        subject = "Payroll Summary — " + employeeName + " — " + payPeriod;
        body =
          "Hi " + employeeName + ",\n\n" +
          "Here is your work summary for " + payPeriod + ":\n\n" +
          dailyLines.join("\n") + "\n\n" +
          "Total Hours: " + totalHoursStr + "\n" +
          "Pay Rate: " + payRateStr + "\n" +
          "Total Pay: " + totalPayStr + "\n\n" +
          "---\n" + storeName;
      }

      // Convert newlines to <br> for HTML email
      let htmlBody = body.replace(/\n/g, "<br>");

      let result = await dbSendEmail(userEmail, subject, htmlBody);
      _setEmailStatus(result.success ? "sent" : "error");
    } catch (e) {
      log("Error sending payroll email:", e);
      _setEmailStatus("error");
    }

    _setEmailing(false);
    setTimeout(() => _setEmailStatus(null), 3000);
  }

  function handleTimeFrameChange(field, value) {
    let updated = { ...tf, [field]: value };
    useSettingsStore.getState().setField("defaultPayrollTimeFrame", updated);
  }

  // Display dates
  let displayStart = sPendingStart || sStartDate;
  let displayEnd = sPendingEnd || sEndDate;
  let hasPendingRange = !!sPendingStart && !!sPendingEnd;
  let canGo = !!sSelectedUser && (hasPendingRange || (!!sStartDate && !!sEndDate));
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

  const iconSize = 26;

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
          {/* ═══ LEFT COLUMN: Users + Shortcuts ═══ */}
          <ScrollView
            style={{ width: 60 }}
            contentContainerStyle={{
              paddingVertical: 8,
              paddingHorizontal: 3,
              flexGrow: 1,
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: C.text,
                  marginBottom: 6,
                  textAlign: "center",
                }}
              >
                Payroll
              </Text>

              {/* User Buttons */}
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "600",
                  color: gray(0.5),
                  marginBottom: 3,
                  textAlign: "center",
                }}
              >
                SELECT USER
              </Text>
              {(zSettingsObj?.users || []).map((user) => {
                let isSelected = sSelectedUser?.id === user.id;
                return (
                  <TouchableOpacity
                    key={user.id}
                    onPress={() => handleUserSelect(user)}
                    style={{
                      backgroundColor: isSelected ? C.orange : C.blue,
                      borderRadius: 4,
                      paddingVertical: 5,
                      marginBottom: 3,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 11,
                        fontWeight: "600",
                      }}
                    >
                      {user.first} {user.last}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Divider */}
              <View
                style={{
                  height: 1,
                  backgroundColor: gray(0.8),
                  marginVertical: 6,
                }}
              />

              {/* Quick Buttons */}
              {/* Pay Period button */}
              <TouchableOpacity
                onPress={handleDefaultRangeShortcut}
                style={{
                  backgroundColor:
                    sActiveShortcut === "Pay Period" ? C.orange : C.blue,
                  borderRadius: 4,
                  paddingVertical: 5,
                  marginBottom: 3,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  Pay Period
                </Text>
              </TouchableOpacity>

              {STATIC_SHORTCUTS.map((sc) => {
                let isActive = sActiveShortcut === sc.label;
                return (
                  <TouchableOpacity
                    key={sc.label}
                    onPress={() => handleShortcut(sc)}
                    style={{
                      backgroundColor: isActive
                        ? C.orange
                        : lightenRGBByPercent(C.blue, 30),
                      borderRadius: 4,
                      paddingVertical: 5,
                      marginBottom: 3,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 11,
                        fontWeight: "600",
                      }}
                    >
                      {sc.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Divider */}
              <View
                style={{
                  height: 1,
                  backgroundColor: gray(0.8),
                  marginVertical: 6,
                }}
              />

              {/* Default Time Frame editor */}
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "600",
                  color: gray(0.5),
                  marginBottom: 2,
                  textAlign: "center",
                }}
              >
                PAY PERIOD
              </Text>
              <View style={{ marginBottom: 3 }}>
                <Text style={{ fontSize: 9, color: gray(0.5), marginBottom: 1 }}>
                  Start Day
                </Text>
                <DropdownMenu
                  dataArr={BEGIN_OPTIONS}
                  selectedIdx={BEGIN_OPTIONS.findIndex((o) => o.value === tf.begin)}
                  useSelectedAsButtonTitle={true}
                  onSelect={(item) => handleTimeFrameChange("begin", item.value)}
                  buttonStyle={{
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 4,
                    paddingVertical: 4,
                    paddingHorizontal: 6,
                    backgroundColor: C.listItemWhite,
                  }}
                  buttonTextStyle={{ fontSize: 11, color: C.text }}
                />
              </View>
              <View>
                <Text style={{ fontSize: 9, color: gray(0.5), marginBottom: 1 }}>
                  End Day
                </Text>
                <DropdownMenu
                  dataArr={END_OPTIONS}
                  selectedIdx={END_OPTIONS.findIndex((o) => o.value === tf.end)}
                  useSelectedAsButtonTitle={true}
                  onSelect={(item) => handleTimeFrameChange("end", item.value)}
                  buttonStyle={{
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 4,
                    paddingVertical: 4,
                    paddingHorizontal: 6,
                    backgroundColor: C.listItemWhite,
                  }}
                  buttonTextStyle={{ fontSize: 11, color: C.text }}
                />
              </View>
            </View>

            {/* Close Button */}
            <View style={{ alignItems: "center", paddingTop: 8 }}>
              <Button_
                text="CLOSE"
                colorGradientArr={COLOR_GRADIENTS.red}
                onPress={handleExit}
                buttonStyle={{
                  paddingLeft: 20,
                  paddingRight: 20,
                  paddingVertical: 8,
                }}
                textStyle={{ fontSize: 13, fontWeight: "700" }}
              />
            </View>
          </ScrollView>

          {/* ═══ MIDDLE COLUMN: Date Selectors ═══ */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 8 }}
          >
            <View>
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
                  <Text
                    style={{
                      color: C.orange,
                      fontSize: 10,
                      fontWeight: "600",
                      marginBottom: 2,
                    }}
                  >
                    Begin Date
                  </Text>
                  <CalendarPicker
                    key={"begin-" + sCalKey}
                    styles={calendarStyles}
                    mode="range"
                    startDate={displayStart}
                    endDate={displayEnd}
                    onChange={({ startDate }) => {
                      _setActiveShortcut(null);
                      _setPendingStart(dayjs(startDate));
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
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "white",
                      }}
                    >
                      {dayjs(displayStart).format("ddd M/D/YYYY")}
                    </Text>
                  ) : (
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "white",
                      }}
                    >
                      {dateChips.length} days:{" "}
                      <Text style={{ color: "white" }}>
                        {dayjs(displayStart).format("ddd M/D/YYYY")}
                      </Text>
                      {"  "}→{"  "}
                      <Text
                        style={{
                          color: lightenRGBByPercent(C.green, 40),
                        }}
                      >
                        {dayjs(displayEnd).format("ddd M/D/YYYY")}
                      </Text>
                    </Text>
                  )}
                </View>

                {/* End Calendar */}
                {(() => {
                  let beginMonth = dayjs(displayStart).month();
                  let beginYear = dayjs(displayStart).year();
                  let beginIsCurrentMonth = beginMonth === dayjs().month() && beginYear === dayjs().year();
                  let endSameAsBegin =
                    beginIsCurrentMonth &&
                    sEndCalMonth === beginMonth &&
                    sEndCalYear === beginYear;

                  function handleEndCalPrev() {
                    let d = dayjs()
                      .month(sEndCalMonth)
                      .year(sEndCalYear)
                      .subtract(1, "month");
                    _setEndCalMonth(d.month());
                    _setEndCalYear(d.year());
                  }
                  function handleEndCalNext() {
                    let d = dayjs()
                      .month(sEndCalMonth)
                      .year(sEndCalYear)
                      .add(1, "month");
                    _setEndCalMonth(d.month());
                    _setEndCalYear(d.year());
                  }

                  if (endSameAsBegin) return null;

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
                      <Text
                        style={{
                          color: lightenRGBByPercent(C.green, 40),
                          fontSize: 10,
                          fontWeight: "600",
                          marginBottom: 2,
                        }}
                      >
                        End Date
                      </Text>
                      {(
                        <CalendarPicker
                          key={
                            "end-" +
                            sCalKey +
                            "-" +
                            sEndCalMonth +
                            "-" +
                            sEndCalYear
                          }
                          styles={calendarStyles}
                          mode="range"
                          startDate={displayStart}
                          endDate={displayEnd}
                          month={sEndCalMonth}
                          year={sEndCalYear}
                          onChange={({ endDate }) => {
                            _setActiveShortcut(null);
                            _setPendingEnd(dayjs(endDate));
                          }}
                        />
                      )}
                    </View>
                  );
                })()}

                {/* Go Button */}
                <View style={{ alignItems: "center" }}>
                  <Button_
                    text="GO"
                    colorGradientArr={
                      canGo
                        ? COLOR_GRADIENTS.green
                        : COLOR_GRADIENTS.grey
                    }
                    onPress={handleGoButton}
                    disabled={!canGo}
                    buttonStyle={{
                      paddingLeft: 40,
                      paddingRight: 40,
                      paddingVertical: 10,
                    }}
                    textStyle={{ fontSize: 15, fontWeight: "700" }}
                  />
                </View>
              </View>
          </ScrollView>

          {/* ═══ RIGHT COLUMN: Punch List + Summary ═══ */}
          <View style={{ flex: 2 }}>
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center" }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.text,
                  }}
                >
                  {sSelectedUser
                    ? sSelectedUser.first + " " + sSelectedUser.last
                    : "Select a user"}
                </Text>
                {!!sSelectedUser && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: gray(0.5),
                      marginLeft: 10,
                    }}
                  >
                    ${hourlyWage.toFixed(2)}/hr
                  </Text>
                )}
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center" }}
              >
                {!!sSelectedUser && (
                  <Button_
                    text="Add Punch"
                    onPress={handleNewPunchPress}
                    colorGradientArr={COLOR_GRADIENTS.blue}
                    buttonStyle={{
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 5,
                      marginRight: 8,
                    }}
                    textStyle={{ fontSize: 12 }}
                  />
                )}
                {sLoading && (
                  <Text style={{ fontSize: 12, color: gray(0.4) }}>
                    Loading...
                  </Text>
                )}
                {!sLoading && !!sSelectedUser && (
                  <Text style={{ fontSize: 12, color: gray(0.4) }}>
                    {displayArr.length} entries
                  </Text>
                )}
              </View>
            </View>

            {/* Table Header */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "rgba(0,0,0,0.75)",
                paddingVertical: 6,
                paddingHorizontal: 8,
              }}
            >
              <Text
                style={{
                  flex: 0.8,
                  fontSize: 11,
                  fontWeight: "700",
                  color: "white",
                }}
              >
                Date
              </Text>
              <Text
                style={{
                  flex: 1.5,
                  fontSize: 11,
                  fontWeight: "700",
                  color: "white",
                  textAlign: "center",
                }}
              >
                Clock In
              </Text>
              <Text
                style={{
                  flex: 1.5,
                  fontSize: 11,
                  fontWeight: "700",
                  color: "white",
                  textAlign: "center",
                }}
              >
                Clock Out
              </Text>
              <Text
                style={{
                  flex: 0.8,
                  fontSize: 11,
                  fontWeight: "700",
                  color: "white",
                  textAlign: "center",
                }}
              >
                Hours
              </Text>
              <Text
                style={{
                  flex: 0.4,
                  fontSize: 11,
                  fontWeight: "700",
                  color: "white",
                  textAlign: "center",
                }}
              >
                Edit
              </Text>
            </View>

            {/* FlatList of punch pairs */}
            {!sSelectedUser ? (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: gray(0.5),
                    fontWeight: "500",
                  }}
                >
                  Select a user to view payroll
                </Text>
              </View>
            ) : (
              <FlatList
                style={{ flex: 1 }}
                data={displayArr}
                keyExtractor={(item, idx) =>
                  (item.in?.id || "") + (item.out?.id || "") + idx
                }
                renderItem={({ item, index }) => {
                  let editable = index === sEditableRowIdx;
                  let bgColor =
                    index % 2 === 0 ? C.listItemWhite : gray(0.075);

                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: bgColor,
                        paddingVertical: editable ? 4 : 6,
                        paddingHorizontal: 8,
                        opacity: editable
                          ? 1
                          : sEditableRowIdx != null
                          ? 0.3
                          : 1,
                      }}
                    >
                      {/* Date column */}
                      <View style={{ flex: 0.8 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            color: C.text,
                            fontWeight: "500",
                          }}
                        >
                          {item.in?.wordDayOfWeek ||
                            item.out?.wordDayOfWeek}
                        </Text>
                        <Text
                          style={{ fontSize: 11, color: gray(0.5) }}
                        >
                          {item.in?.wordDayOfMonth ||
                            item.out?.wordDayOfMonth}{" "}
                          {item.in?.dayOfMonth || item.out?.dayOfMonth}
                        </Text>
                      </View>

                      {/* Clock In column */}
                      <View
                        style={{
                          flex: 1.5,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {item.in ? (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <Image_
                              icon={ICONS.forwardGreen}
                              size={12}
                              style={{ marginRight: 4 }}
                            />
                            {editable ? (
                              <EditableTimeCell
                                timeObj={item.in}
                                prefix="in"
                                onEdit={(opt) =>
                                  handleTimeEdit(item, opt)
                                }
                                onDirectEdit={(prefix, field, val) =>
                                  handleDirectTimeEdit(item, prefix, field, val)
                                }
                                iconSize={iconSize}
                              />
                            ) : (
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: C.text,
                                }}
                              >
                                {item.in.hour}:
                                {String(item.in.minutes).padStart(
                                  2,
                                  "0"
                                )}{" "}
                                {item.in.amPM}
                              </Text>
                            )}
                          </View>
                        ) : editable ? (
                          <TouchableOpacity
                            onPress={() => handleCreateMissingPunch(item, "in")}
                          >
                            <View
                              style={{
                                backgroundColor: lightenRGBByPercent(C.green, 60),
                                borderRadius: 4,
                                paddingVertical: 3,
                                paddingHorizontal: 8,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: C.green,
                                  fontWeight: "600",
                                }}
                              >
                                + Add
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ) : (
                          <Text
                            style={{
                              fontSize: 12,
                              color: gray(0.5),
                              fontStyle: "italic",
                            }}
                          >
                            --
                          </Text>
                        )}
                      </View>

                      {/* Clock Out column */}
                      <View
                        style={{
                          flex: 1.5,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {item.out ? (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <Image_
                              icon={ICONS.backRed}
                              size={12}
                              style={{ marginRight: 4 }}
                            />
                            {editable ? (
                              <EditableTimeCell
                                timeObj={item.out}
                                prefix="out"
                                onEdit={(opt) =>
                                  handleTimeEdit(item, opt)
                                }
                                onDirectEdit={(prefix, field, val) =>
                                  handleDirectTimeEdit(item, prefix, field, val)
                                }
                                iconSize={iconSize}
                              />
                            ) : (
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: C.text,
                                }}
                              >
                                {item.out.hour}:
                                {String(item.out.minutes).padStart(
                                  2,
                                  "0"
                                )}{" "}
                                {item.out.amPM}
                              </Text>
                            )}
                          </View>
                        ) : editable ? (
                          <TouchableOpacity
                            onPress={() => handleCreateMissingPunch(item, "out")}
                          >
                            <View
                              style={{
                                backgroundColor: lightenRGBByPercent(C.lightred, 60),
                                borderRadius: 4,
                                paddingVertical: 3,
                                paddingHorizontal: 8,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: C.lightred,
                                  fontWeight: "600",
                                }}
                              >
                                + Add
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ) : (
                          <Text
                            style={{
                              fontSize: 12,
                              color: gray(0.5),
                              fontStyle: "italic",
                            }}
                          >
                            --
                          </Text>
                        )}
                      </View>

                      {/* Hours column */}
                      <View style={{ flex: 0.8, alignItems: "center" }}>
                        {item.hoursDiff != null ||
                        item.minutesDiff != null ? (
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color: C.text,
                            }}
                          >
                            {item.hoursDiff || 0}:
                            {item.minutesDiff || "00"}
                          </Text>
                        ) : (
                          <Text
                            style={{
                              fontSize: 12,
                              color: gray(0.5),
                              fontStyle: "italic",
                            }}
                          >
                            --
                          </Text>
                        )}
                      </View>

                      {/* Edit / Delete column */}
                      <View
                        style={{
                          flex: 0.4,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            if (sEditableRowIdx === index) {
                              _setEditableRowIdx(null);
                            } else {
                              _setEditableRowIdx(index);
                            }
                          }}
                          style={{ padding: 2 }}
                        >
                          <Image_ icon={ICONS.editPencil} size={16} />
                        </TouchableOpacity>
                        {editable && (
                          <TouchableOpacity
                            onPress={() => {
                              useAlertScreenStore.getState().setValues({
                                title: "Delete Punch",
                                message: "Are you sure you want to delete this entry?",
                                btn1Text: "Delete",
                                btn2Text: "Cancel",
                                handleBtn1Press: () => {
                                  handleDeletePunchPress(
                                    item.in || item.out
                                  );
                                  _setEditableRowIdx(null);
                                  useAlertScreenStore.getState().setShowAlert(false);
                                },
                                handleBtn2Press: () => {
                                  useAlertScreenStore.getState().setShowAlert(false);
                                },
                                canExitOnOuterClick: true,
                              });
                            }}
                            style={{ padding: 2, marginLeft: 4 }}
                          >
                            <Image_ icon={ICONS.close1} size={14} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            )}

            {/* Summary Footer */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-evenly",
                alignItems: "center",
                paddingVertical: 10,
                paddingHorizontal: 10,
                backgroundColor: "rgba(0,0,0,0.75)",
                borderTopWidth: 2,
                borderTopColor: C.buttonLightGreenOutline,
              }}
            >
              <PayrollSummaryItem
                label="Total Hours"
                value={
                  totalHoursObj.hours +
                  ":" +
                  String(totalHoursObj.minutes).padStart(2, "0")
                }
              />
              <PayrollSummaryItem
                label="Hourly Rate"
                value={"$" + hourlyWage.toFixed(2)}
              />
              <PayrollSummaryItem
                label="Total Wages"
                value={"$" + Number(totalWages).toLocaleString()}
                highlight={true}
              />
              <View
                style={{
                  marginLeft: 15,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Button_
                  text={sSaving ? "Saving..." : "SAVE"}
                  colorGradientArr={
                    sHasUnsavedChanges
                      ? COLOR_GRADIENTS.green
                      : COLOR_GRADIENTS.grey
                  }
                  onPress={handleSave}
                  disabled={!sHasUnsavedChanges || sSaving}
                  buttonStyle={{
                    paddingLeft: 25,
                    paddingRight: 25,
                    paddingVertical: 8,
                  }}
                  textStyle={{ fontSize: 14, fontWeight: "700" }}
                />
                <Button_
                  text={sEmailing ? "Sending..." : "EMAIL"}
                  colorGradientArr={
                    sSelectedUser && displayArr.length > 0
                      ? COLOR_GRADIENTS.purple
                      : COLOR_GRADIENTS.grey
                  }
                  onPress={handleEmailPayroll}
                  disabled={
                    !sSelectedUser ||
                    displayArr.length === 0 ||
                    sEmailing
                  }
                  icon={ICONS.notes}
                  iconSize={16}
                  buttonStyle={{
                    paddingLeft: 15,
                    paddingRight: 15,
                    paddingVertical: 8,
                    marginLeft: 8,
                  }}
                  textStyle={{ fontSize: 14, fontWeight: "700" }}
                />
                {sEmailStatus === "sent" && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: lightenRGBByPercent(C.green, 30),
                      fontWeight: "600",
                      marginLeft: 8,
                    }}
                  >
                    Sent!
                  </Text>
                )}
                {sEmailStatus === "error" && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.lightred,
                      fontWeight: "600",
                      marginLeft: 8,
                    }}
                  >
                    Failed
                  </Text>
                )}
                {sEmailStatus === "no-email" && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.orange,
                      fontWeight: "600",
                      marginLeft: 8,
                    }}
                  >
                    No email on file
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }, [
    sSelectedUser,
    sStartDate,
    sEndDate,
    sActiveShortcut,
    sPendingStart,
    sPendingEnd,
    sEndCalMonth,
    sEndCalYear,
    sCalKey,
    sFilteredArr,
    sLoading,
    sEditableRowIdx,
    sHasUnsavedChanges,
    sSaving,
    sEmailing,
    sEmailStatus,
    zSettingsObj,
  ]);

  return ReactDOM.createPortal(
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
      }}
    >
      <TouchableWithoutFeedback onPress={handleExit}>
        <View
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Component />
        </View>
      </TouchableWithoutFeedback>
    </View>,
    document.body
  );
};

/** Reusable editable time cell with up/down chevrons */
const timeInputStyle = {
  fontSize: 12,
  textAlign: "center",
  width: 24,
  paddingVertical: 1,
  paddingHorizontal: 2,
  borderWidth: 1,
  borderColor: gray(0.8),
  borderRadius: 3,
  outlineWidth: 0,
};

const EditableTimeCell = ({ timeObj, prefix, onEdit, onDirectEdit, iconSize }) => (
  <View style={{ flexDirection: "row", alignItems: "center" }}>
    {/* Date adjust */}
    <View style={{ alignItems: "center" }}>
      <Button_
        icon={ICONS.upChevron}
        iconSize={iconSize}
        onPress={() => onEdit(prefix + "-date-up")}
        buttonStyle={{ paddingVertical: 0, paddingHorizontal: 0 }}
      />
      <Text style={{ fontSize: 12, textAlign: "center", width: 20 }}>
        {timeObj.dayOfMonth}
      </Text>
      <Button_
        icon={ICONS.downChevron}
        iconSize={iconSize}
        onPress={() => onEdit(prefix + "-date-down")}
        buttonStyle={{ paddingVertical: 0, paddingHorizontal: 0 }}
      />
    </View>
    {/* Hour adjust */}
    <View style={{ alignItems: "center", marginLeft: 4 }}>
      <Button_
        icon={ICONS.upChevron}
        iconSize={iconSize}
        onPress={() => onEdit(prefix + "-hour-up")}
        buttonStyle={{ paddingVertical: 0, paddingHorizontal: 0 }}
      />
      <TextInput_
        value={String(timeObj.hour)}
        onChangeText={(val) => onDirectEdit(prefix, "hour", val)}
        style={timeInputStyle}
        debounceMs={800}
      />
      <Button_
        icon={ICONS.downChevron}
        iconSize={iconSize}
        onPress={() => onEdit(prefix + "-hour-down")}
        buttonStyle={{ paddingVertical: 0, paddingHorizontal: 0 }}
      />
    </View>
    <Text style={{ paddingHorizontal: 1, fontSize: 12 }}>:</Text>
    {/* Minutes adjust */}
    <View style={{ alignItems: "center" }}>
      <Button_
        icon={ICONS.upChevron}
        iconSize={iconSize}
        onPress={() => onEdit(prefix + "-minutes-up")}
        buttonStyle={{ paddingVertical: 0, paddingHorizontal: 0 }}
      />
      <TextInput_
        value={String(timeObj.minutes).padStart(2, "0")}
        onChangeText={(val) => onDirectEdit(prefix, "minutes", val)}
        style={timeInputStyle}
        debounceMs={800}
      />
      <Button_
        icon={ICONS.downChevron}
        iconSize={iconSize}
        onPress={() => onEdit(prefix + "-minutes-down")}
        buttonStyle={{ paddingVertical: 0, paddingHorizontal: 0 }}
      />
    </View>
    {/* AM/PM toggle */}
    <TouchableOpacity
      onPress={() => onEdit(prefix + "-am-pm")}
      style={{
        paddingHorizontal: 3,
        paddingVertical: 2,
        borderRadius: 3,
        backgroundColor: gray(0.9),
        marginLeft: 2,
      }}
    >
      <Text style={{ fontSize: 11, color: gray(0.5) }}>
        {timeObj.amPM}
      </Text>
    </TouchableOpacity>
  </View>
);

const PayrollSummaryItem = ({ label, value, highlight }) => (
  <View
    style={{
      alignItems: "center",
      marginHorizontal: 10,
      marginVertical: 2,
    }}
  >
    <Text
      style={{
        fontSize: 12,
        color: "rgba(255,255,255,0.7)",
        fontWeight: "600",
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        fontSize: 16,
        fontWeight: "700",
        color: highlight ? lightenRGBByPercent(C.green, 30) : "white",
      }}
    >
      {value}
    </Text>
  </View>
);
