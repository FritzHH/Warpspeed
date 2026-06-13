/*eslint-disable*/
import {
  Button,
  DropdownMenu,
  Image,
  TimePicker,
  SmallLoadingIndicator,
  Dialog,
  TouchableOpacity,
  LargeModalHeader,
  LargeModalHeaderButton,
  Tooltip,
} from "../../../dom_components";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  formatMillisForDisplay,
  convertMillisToHoursMins,
  trimToTwoDecimals,
  log,
  lightenRGBByPercent,
  deepEqual,
} from "../../../utils";
import dayjs from "dayjs";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import cloneDeep from "lodash/cloneDeep";
import sortBy from "lodash/sortBy";
import { useSettingsStore, useAlertScreenStore, useLoginStore } from "../../../stores";
import {
  dbGetPunchesByTimeFrame,
  dbSavePunchObject,
  dbDeletePunch,
  dbSendEmail,
} from "../../../db_calls_wrapper";
import { TIME_PUNCH_PROTO } from "../../../data";
import {
  MILLIS_IN_HOUR,
  MILLIS_IN_MINUTE,
} from "../../../constants";
import styles from "./PayrollModal.module.css";
import { useZ } from "../../../hooks/useZ";

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
  let start = resolveAnchor(begin);
  let endDate = resolveAnchor(end);
  let today = dayjs().endOf("day");
  if (today.isAfter(start) && today.isBefore(endDate)) {
    endDate = today;
  }
  return { start, end: endDate };
}

function getLastTimeFrameRange(tf) {
  let begin = tf?.begin || "lastFriday";
  let end = tf?.end || "thisThursday";
  let curStart = resolveAnchor(begin);
  let curEnd = resolveAnchor(end);
  return {
    start: curStart.subtract(7, "day").startOf("day"),
    end: curEnd.subtract(7, "day").endOf("day"),
  };
}

const STATIC_SHORTCUTS = [
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
    label: "This Month",
    start: () => dayjs().startOf("month"),
    end: () => dayjs().endOf("day"),
  },
  {
    label: "Last Month",
    start: () => dayjs().subtract(1, "month").startOf("month"),
    end: () => dayjs().subtract(1, "month").endOf("month"),
  },
  {
    label: "This Year",
    start: () => dayjs().startOf("year"),
    end: () => dayjs().endOf("day"),
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

/** Pair sorted punches into in/out rows. Consecutive ins flush the prior in
 *  as an orphan row; an out with no open in becomes an orphan-out row. */
function pairPunches(filteredArr) {
  let resArr = [];
  let pending = null;

  filteredArr.forEach((rawObj) => {
    let obj = cloneDeep(rawObj);
    if (obj.option === "in") {
      if (pending) resArr.push({ in: pending });
      pending = obj;
    } else if (obj.option === "out") {
      if (pending) {
        let sameDay = dayjs(pending.millis).isSame(dayjs(obj.millis), "day");
        if (sameDay) {
          resArr.push({ in: pending, out: obj });
        } else {
          resArr.push({ in: pending });
          resArr.push({ out: obj });
        }
        pending = null;
      } else {
        resArr.push({ out: obj });
      }
    }
  });
  if (pending) resArr.push({ in: pending });

  let arr = [];
  let runningTotalMinutes = 0;
  resArr.forEach((obj) => {
    obj = cloneDeep(obj);
    if (obj.in) {
      obj.in = { ...obj.in, ...formatMillisForDisplay(obj.in.millis, true, true) };
    }
    if (obj.out) {
      obj.out = { ...obj.out, ...formatMillisForDisplay(obj.out.millis, true, true) };
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

export const PayrollModal = ({ handleExit, employeeUser, preselectedUser }) => {
  const zDefaultPayrollTimeFrame = useSettingsStore((s) => s.settings?.defaultPayrollTimeFrame, deepEqual);
  const zStoreDisplayName = useSettingsStore((s) => s.settings?.storeInfo?.displayName);
  const zEmailTemplates = useSettingsStore((s) => s.settings?.emailTemplates, deepEqual);
  const zUsers = useSettingsStore((s) => s.settings?.users, deepEqual);
  const zCurrentUserLevel = useLoginStore((s) => s.currentUser?.permissions?.level || 0);

  const z = useZ("modal");

  let isAdmin = !employeeUser && zCurrentUserLevel >= 4;

  let tf = zDefaultPayrollTimeFrame || { begin: "lastFriday", end: "thisThursday" };
  let defaultRange = getTimeFrameRange(tf);

  const [sSelectedUser, _setSelectedUser] = useState(employeeUser || preselectedUser || null);

  const last2DaysStart = dayjs().subtract(1, "day").startOf("day");
  const last2DaysEnd = dayjs().endOf("day");

  const [sStartDate, _setStartDate] = useState(
    employeeUser ? dayjs().startOf("day") : (preselectedUser ? last2DaysStart : defaultRange.start)
  );
  const [sEndDate, _setEndDate] = useState(
    employeeUser ? dayjs().endOf("day") : (preselectedUser ? last2DaysEnd : defaultRange.end)
  );
  const [sActiveShortcut, _setActiveShortcut] = useState(
    employeeUser ? "Today" : null
  );

  const [sFilteredArr, _setFilteredArr] = useState([]);
  const [sLoading, _setLoading] = useState(false);
  const [sHasUnsavedChanges, _setHasUnsavedChanges] = useState(false);
  const [sSaving, _setSaving] = useState(false);
  const [sEmailing, _setEmailing] = useState(false);
  const [sEmailStatus, _setEmailStatus] = useState(null);
  const [sShowRate, _setShowRate] = useState(false);

  const modifiedPunchIdsRef = useRef(new Set());
  const deletedPunchIdsRef = useRef(new Set());
  const rowSnapshotRef = useRef(null);
  const queryIdRef = useRef(0);
  const hasAutoFetchedRef = useRef(false);

  function fetchPunches(overrideStart, overrideEnd, overrideUser) {
    let user = overrideUser || sSelectedUser;
    if (!user) return;
    let start = overrideStart || sStartDate;
    let end = overrideEnd || sEndDate;
    if (!start || !end) return;

    let startMillis = dayjs(start).startOf("day").valueOf();
    let endMillis = dayjs(end).endOf("day").valueOf();
    let thisQueryId = ++queryIdRef.current;

    _setLoading(true);
    _setHasUnsavedChanges(false);
    modifiedPunchIdsRef.current = new Set();
    deletedPunchIdsRef.current = new Set();

    dbGetPunchesByTimeFrame(startMillis, endMillis, {
      userID: user.id,
      timestampField: "millis",
    })
      .then((resArr) => {
        if (thisQueryId !== queryIdRef.current) return;
        resArr = sortBy(resArr || [], "millis");
        let paired = pairPunches(resArr);
        console.log(
          JSON.stringify(
            {
              user: { id: user.id, first: user.first, last: user.last },
              range: {
                start: dayjs(start).format("YYYY-MM-DD"),
                end: dayjs(end).format("YYYY-MM-DD"),
              },
              totalMinutes: paired.runningTotalMinutes,
              totalHours: convertMillisToHoursMins(
                paired.runningTotalMinutes * MILLIS_IN_MINUTE
              ),
              displayArr: paired.displayArr,
              rawPunches: resArr,
            },
            null,
            2
          )
        );
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

  useEffect(() => {
    if (hasAutoFetchedRef.current) return;
    if (!sSelectedUser) return;
    hasAutoFetchedRef.current = true;
    fetchPunches(sStartDate, sEndDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let { displayArr, runningTotalMinutes } = pairPunches(sFilteredArr);
  let totalHoursObj = convertMillisToHoursMins(
    runningTotalMinutes * MILLIS_IN_MINUTE
  );
  let hourlyWage = Number(sSelectedUser?.hourlyWage) || 0;
  let totalWages = trimToTwoDecimals((runningTotalMinutes / 60) * hourlyWage);

  function handleDefaultRangeShortcut() {
    let curTf = zDefaultPayrollTimeFrame || { begin: "lastFriday", end: "thisThursday" };
    let range = getTimeFrameRange(curTf);
    _setActiveShortcut("Pay Period");
    _setStartDate(range.start);
    _setEndDate(range.end);
    fetchPunches(range.start, range.end);
  }

  function handleLastPayPeriodShortcut() {
    let curTf = zDefaultPayrollTimeFrame || { begin: "lastFriday", end: "thisThursday" };
    let range = getLastTimeFrameRange(curTf);
    _setActiveShortcut("Last Pay Period");
    _setStartDate(range.start);
    _setEndDate(range.end);
    fetchPunches(range.start, range.end);
  }

  function handleShortcut(shortcut) {
    let start = shortcut.start();
    let end = shortcut.end();
    _setActiveShortcut(shortcut.label);
    _setStartDate(start);
    _setEndDate(end);
    fetchPunches(start, end);
  }

  function handleGoButton() {
    if (sStartDate && sEndDate) fetchPunches(sStartDate, sEndDate);
  }

  function handleRangeSelect(range) {
    _setActiveShortcut(null);
    _setStartDate(range?.from ? dayjs(range.from).startOf("day") : null);
    _setEndDate(range?.to ? dayjs(range.to).endOf("day") : null);
  }

  function handleClearRange() {
    _setActiveShortcut(null);
    _setStartDate(null);
    _setEndDate(null);
  }

  function handleUserSelect(userObj) {
    _setSelectedUser(userObj);
    _setFilteredArr([]);
    _setHasUnsavedChanges(false);
    modifiedPunchIdsRef.current = new Set();
    if (sStartDate && sEndDate) fetchPunches(sStartDate, sEndDate, userObj);
  }

  function handleFullTimeChange(item, prefix, hour, minute, period) {
    let punch = prefix === "in" ? item.in : item.out;
    if (!punch) return;

    let date = new Date(punch.millis);
    let hours24;
    if (period === "AM") {
      hours24 = hour === 12 ? 0 : hour;
    } else {
      hours24 = hour === 12 ? 12 : hour + 12;
    }
    date.setHours(hours24);
    date.setMinutes(minute);
    let newMillis = date.getTime();

    let otherPunch = prefix === "in" ? item.out : item.in;
    if (prefix === "in" && otherPunch && newMillis >= otherPunch.millis) return;
    if (prefix === "out" && otherPunch && newMillis <= otherPunch.millis) return;

    let idx = sFilteredArr.findIndex((o) => o.id === punch.id);
    if (idx === -1) return;

    let filteredArr = cloneDeep(sFilteredArr);
    filteredArr[idx] = { ...filteredArr[idx], millis: newMillis };
    _setFilteredArr(filteredArr);
    _setHasUnsavedChanges(true);
    modifiedPunchIdsRef.current.add(punch.id);
  }

  function handleCreateMissingPunch(displayItem, option, customTime) {
    let referencePunch = option === "in" ? displayItem.out : displayItem.in;
    if (!referencePunch) return;

    let newMillis;
    if (customTime) {
      let { hour, minute, period } = customTime;
      let hours24;
      if (period === "AM") hours24 = hour === 12 ? 0 : hour;
      else hours24 = hour === 12 ? 12 : hour + 12;
      let date = new Date(referencePunch.millis);
      date.setHours(hours24);
      date.setMinutes(minute);
      date.setSeconds(0);
      date.setMilliseconds(0);
      newMillis = date.getTime();
      if (option === "in" && newMillis >= referencePunch.millis) return;
      if (option === "out" && newMillis <= referencePunch.millis) return;
    } else {
      newMillis = option === "in"
        ? referencePunch.millis - MILLIS_IN_HOUR
        : referencePunch.millis + MILLIS_IN_HOUR;
    }

    let punchObj = { ...TIME_PUNCH_PROTO };
    punchObj.userID = sSelectedUser.id;
    punchObj.id = crypto.randomUUID();
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
    punchObj.id = crypto.randomUUID();
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
    modifiedPunchIdsRef.current.delete(punchObj.id);
    deletedPunchIdsRef.current.add(punchObj.id);
  }

  async function handleSave() {
    if (!sHasUnsavedChanges) return;
    _setSaving(true);

    try {
      let savePromises = sFilteredArr
        .filter((p) => modifiedPunchIdsRef.current.has(p.id))
        .map((p) => dbSavePunchObject(p));

      let deletePromises = Array.from(deletedPunchIdsRef.current).map((id) =>
        dbDeletePunch(id)
      );

      await Promise.all([...savePromises, ...deletePromises]);
      _setHasUnsavedChanges(false);
      modifiedPunchIdsRef.current = new Set();
      deletedPunchIdsRef.current = new Set();
    } catch (e) {
      log("Error saving punches:", e);
    }

    _setSaving(false);
  }

  function handleEnterRowEdit() {
    rowSnapshotRef.current = {
      filteredArr: cloneDeep(sFilteredArr),
      modifiedIds: new Set(modifiedPunchIdsRef.current),
      deletedIds: new Set(deletedPunchIdsRef.current),
    };
  }

  function handleCancelRowEdit() {
    if (!rowSnapshotRef.current) return;
    _setFilteredArr(rowSnapshotRef.current.filteredArr);
    modifiedPunchIdsRef.current = rowSnapshotRef.current.modifiedIds;
    deletedPunchIdsRef.current = rowSnapshotRef.current.deletedIds;
    _setHasUnsavedChanges(
      modifiedPunchIdsRef.current.size > 0 || deletedPunchIdsRef.current.size > 0
    );
    rowSnapshotRef.current = null;
  }

  async function handleSaveRowEdit() {
    _setSaving(true);
    try {
      let savePromises = sFilteredArr
        .filter((p) => modifiedPunchIdsRef.current.has(p.id))
        .map((p) => dbSavePunchObject(p));
      let deletePromises = Array.from(deletedPunchIdsRef.current).map((id) =>
        dbDeletePunch(id)
      );
      await Promise.all([...savePromises, ...deletePromises]);
      modifiedPunchIdsRef.current = new Set();
      deletedPunchIdsRef.current = new Set();
      _setHasUnsavedChanges(false);
    } catch (e) {
      log("Error saving row:", e);
    }
    _setSaving(false);
    rowSnapshotRef.current = null;
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
      let storeName = zStoreDisplayName || "";

      let template = (zEmailTemplates || []).find(
        (t) => t.id === "default_payroll_summary"
      );

      let subject, body;
      if (template) {
        subject = template.subject
          .replace(/\{employeeName\}/g, employeeName)
          .replace(/\{payPeriod\}/g, payPeriod);
        body = template.message
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

  async function handleEmployeeEmailCSV() {
    if (!sSelectedUser) return;
    let userEmail = sSelectedUser.email;
    if (!userEmail) {
      useAlertScreenStore.getState().setValues({
        title: "No Email",
        message: "No email address on file for your account. Please contact your manager.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
      return;
    }

    _setEmailing(true);

    try {
      let csvLines = ["Date,Day,Clock In,Clock Out,Hours"];
      displayArr.forEach((row) => {
        let date = (row.in?.wordDayOfMonth || row.out?.wordDayOfMonth || "") + " " + (row.in?.dayOfMonth || row.out?.dayOfMonth || "");
        let day = row.in?.wordDayOfWeek || row.out?.wordDayOfWeek || "";
        let inTime = row.in ? row.in.hour + ":" + String(row.in.minutes).padStart(2, "0") + " " + row.in.amPM : "";
        let outTime = row.out ? row.out.hour + ":" + String(row.out.minutes).padStart(2, "0") + " " + row.out.amPM : "";
        let hours = row.hoursDiff != null || row.minutesDiff != null
          ? (row.hoursDiff || 0) + ":" + (row.minutesDiff || "00")
          : "";
        csvLines.push('"' + date + '","' + day + '","' + inTime + '","' + outTime + '","' + hours + '"');
      });

      let totalHoursStr = totalHoursObj.hours + ":" + String(totalHoursObj.minutes).padStart(2, "0");
      csvLines.push('"","","","Total",' + '"' + totalHoursStr + '"');
      let csvString = csvLines.join("\n");

      let employeeName = sSelectedUser.first + " " + sSelectedUser.last;
      let payPeriod = dayjs(sStartDate).format("M/D/YYYY") + " - " + dayjs(sEndDate).format("M/D/YYYY");
      let subject = "Punch History - " + employeeName + " - " + payPeriod;
      let htmlBody = "Hi " + sSelectedUser.first + ",<br><br>Your punch history for " + payPeriod + " is attached.<br><br>Total Hours: " + totalHoursStr;

      let result = await dbSendEmail(userEmail, subject, htmlBody, [
        { filename: "punch_history.csv", content: csvString, contentType: "text/csv" },
      ]);

      useAlertScreenStore.getState().setValues({
        title: result.success ? "Email Sent" : "Email Failed",
        message: result.success
          ? "Your punch history has been sent to " + userEmail
          : "Failed to send email. Please try again.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    } catch (e) {
      log("Error sending employee CSV email:", e);
      useAlertScreenStore.getState().setValues({
        title: "Email Failed",
        message: "An error occurred while sending the email. Please try again.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    }

    _setEmailing(false);
  }

  function handleTimeFrameChange(field, value) {
    let updated = { ...tf, [field]: value };
    useSettingsStore.getState().setField("defaultPayrollTimeFrame", updated);
  }

  let displayStart = sStartDate;
  let displayEnd = sEndDate;
  let canGo = !!sSelectedUser && !!sStartDate && !!sEndDate;
  let hasRange = !!sStartDate || !!sEndDate;
  let dateChips = generateDateChips(displayStart, displayEnd);

  let selectedRange = hasRange
    ? {
        from: sStartDate ? dayjs(sStartDate).toDate() : undefined,
        to: sEndDate ? dayjs(sEndDate).toDate() : undefined,
      }
    : undefined;

  let dayPickerWrapperStyle = {
    color: "white",
    "--rdp-accent-color": C.blue,
    "--rdp-accent-background-color": lightenRGBByPercent(C.blue, 60),
    "--rdp-today-color": C.red,
    "--rdp-day-height": "32px",
    "--rdp-day-width": "32px",
  };

  let beginMatchLabel = BEGIN_OPTIONS.find((o) => o.value === tf.begin)?.label;
  let endMatchLabel = END_OPTIONS.find((o) => o.value === tf.end)?.label;

  // Theme + grayscale CSS variables injected once on .card; all CSS classes consume these.
  let cardThemeVars = {
    backgroundColor: C.backgroundWhite,
    "--c-text": C.text,
    "--c-blue": C.blue,
    "--c-blue-lighter": lightenRGBByPercent(C.blue, 30),
    "--c-orange": C.orange,
    "--c-red": C.red,
    "--c-green": C.green,
    "--c-lightred": C.lightred,
    "--c-green-light": lightenRGBByPercent(C.green, 30),
    "--c-green-pill": lightenRGBByPercent(C.green, 60),
    "--c-red-pill": lightenRGBByPercent(C.lightred, 60),
    "--c-list-item-white": C.listItemWhite,
    "--c-button-light-green-outline": C.buttonLightGreenOutline,
    "--g-40": "rgb(153,153,153)",
    "--g-50": "rgb(128,128,128)",
    "--g-70": "rgb(77,77,77)",
    "--g-80": "rgb(51,51,51)",
    "--g-85": "rgb(38,38,38)",
    "--g-95": "rgb(13,13,13)",
    "--g-20": "rgb(204,204,204)",
    "--g-075": "rgb(236,236,236)",
  };

  return (
    <DialogPrimitive.Root open={true} onOpenChange={(open) => { if (!open) handleExit(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.radixOverlay} style={{ zIndex: z }} />
        <DialogPrimitive.Content
          className={styles.radixContent}
          style={{ zIndex: z + 1 }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            const t = e.target;
            if (t && typeof t.closest === "function" && (t.closest("[data-dropdown-menu-portal]") || t.closest("[data-alert-portal]"))) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            const t = e.target;
            if (t && typeof t.closest === "function" && (t.closest("[data-dropdown-menu-portal]") || t.closest("[data-alert-portal]"))) {
              e.preventDefault();
            }
          }}
          onFocusOutside={(e) => {
            const t = e.target;
            if (t && typeof t.closest === "function" && (t.closest("[data-dropdown-menu-portal]") || t.closest("[data-alert-portal]"))) {
              e.preventDefault();
            }
          }}
          aria-label="Payroll"
        >
          <DialogPrimitive.Title className={styles.srOnly}>Payroll</DialogPrimitive.Title>
          <div className={styles.card} style={cardThemeVars}>
        <LargeModalHeader
          title="Payroll"
          actions={
            <LargeModalHeaderButton variant="default" onClick={handleExit}>
              Close
            </LargeModalHeaderButton>
          }
        />
        <div className={styles.cardContent}>
        {/* ═══ LEFT RAIL ═══ */}
        <div className={styles.leftRail}>
          {isAdmin && (
            <>
              <span className={styles.blockSection}>SELECT USER</span>
              <div className={styles.userListScroll}>
                {(zUsers || []).map((user) => {
                  let isSelected = sSelectedUser?.id === user.id;
                  return (
                    <TouchableOpacity
                      key={user.id}
                      onPress={() => handleUserSelect(user)}
                      className={`${styles.userRow} ${isSelected ? styles.isSelected : ""}`}
                    >
                      <span className={styles.userRowText}>
                        {user.first} {user.last}
                      </span>
                    </TouchableOpacity>
                  );
                })}
              </div>
            </>
          )}
          <div className={styles.leftRailTop}>
            <span
              className={`${styles.blockSection} ${isAdmin ? styles.blockSpacedTop : ""}`}
            >
              SELECT TIME RANGE
            </span>

            {/* Pay Period button */}
            <TouchableOpacity
              onPress={handleDefaultRangeShortcut}
              className={`${styles.shortcutRow} ${sActiveShortcut === "Pay Period" ? styles.isActive : ""}`}
            >
              <span className={styles.shortcutRowText}>
                Pay Period{" "}
                <span className={styles.shortcutRowSubText}>
                  {(zDefaultPayrollTimeFrame?.begin || "lastFriday").slice(4, 7)} → {(zDefaultPayrollTimeFrame?.end || "thisThursday").slice(4, 7)}
                </span>
              </span>
            </TouchableOpacity>

            {/* Last Pay Period button */}
            <TouchableOpacity
              onPress={handleLastPayPeriodShortcut}
              className={`${styles.shortcutRow} ${sActiveShortcut === "Last Pay Period" ? styles.isActive : ""}`}
            >
              <span className={styles.shortcutRowText}>
                Last Pay Period
              </span>
            </TouchableOpacity>

            {STATIC_SHORTCUTS.map((sc) => {
              let isActive = sActiveShortcut === sc.label;
              return (
                <TouchableOpacity
                  key={sc.label}
                  onPress={() => handleShortcut(sc)}
                  className={`${styles.shortcutRow} ${isActive ? styles.isActive : ""}`}
                >
                  <span className={styles.shortcutRowText}>{sc.label}</span>
                </TouchableOpacity>
              );
            })}

            {isAdmin && (
              <div className={`${styles.payPeriodBox} ${styles.blockSpacedTop}`}>
                <span className={styles.blockPayPeriod}>PAY PERIOD</span>
                <div className={styles.dropdownGroup}>
                  <span className={`${styles.smallLabel} ${styles.textG50}`}>Start Day</span>
                  <DropdownMenu
                    dataArr={BEGIN_OPTIONS}
                    matchValue={beginMatchLabel}
                    useSelectedAsButtonTitle={true}
                    onSelect={(item) => handleTimeFrameChange("begin", item.value)}
                    buttonClassName={styles.payrollDropdown}
                    buttonTextClassName={styles.payrollDropdownText}
                  />
                </div>
                <div className={styles.dropdownGroup}>
                  <span className={`${styles.smallLabel} ${styles.textG50}`}>End Day</span>
                  <DropdownMenu
                    dataArr={END_OPTIONS}
                    matchValue={endMatchLabel}
                    useSelectedAsButtonTitle={true}
                    onSelect={(item) => handleTimeFrameChange("end", item.value)}
                    buttonClassName={styles.payrollDropdown}
                    buttonTextClassName={styles.payrollDropdownText}
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ═══ MIDDLE COLUMN ═══ */}
        <div className={styles.middleColumn}>
          <div className={styles.calendarCard}>
            <span className={`${styles.calendarHeader} ${styles.textOrange}`}>Date Range</span>
            <div style={dayPickerWrapperStyle}>
              <DayPicker
                mode="range"
                selected={selectedRange}
                defaultMonth={selectedRange?.from || new Date()}
                onSelect={handleRangeSelect}
              />
            </div>
          </div>

          <div className={`${styles.dateSummary} ${styles.bgG20}`}>
            {dateChips.length === 0 ? (
              <span className={`${styles.dateSummaryEmpty} ${styles.textG50}`}>
                No range selected
              </span>
            ) : dateChips.length === 1 ? (
              <span className={`${styles.dateSummaryText} ${styles.textG70}`}>
                {dayjs(displayStart).format("ddd M/D/YYYY")}
              </span>
            ) : (
              <span className={`${styles.dateSummaryText} ${styles.textG70}`}>
                {dateChips.length} days:{" "}
                <span className={styles.textBlue}>
                  {dayjs(displayStart).format("ddd M/D/YYYY")}
                </span>
                {"  "}→{"  "}
                <span className={styles.textRed}>
                  {dayjs(displayEnd).format("ddd M/D/YYYY")}
                </span>
              </span>
            )}
          </div>

          <div className={styles.actionRow}>
            {sLoading ? (
              <SmallLoadingIndicator color={C.blue} message="" />
            ) : (
              <>
                <Button
                  text="GO"
                  colorGradientArr={
                    canGo ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey
                  }
                  onPress={handleGoButton}
                  enabled={canGo}
                  innerClassName={styles.btnGo}
                  textClassName={styles.btnTxt15}
                />
                <div className={styles.actionRowSpacer} />
                <Button
                  text="CLEAR"
                  colorGradientArr={
                    hasRange ? COLOR_GRADIENTS.red : COLOR_GRADIENTS.grey
                  }
                  onPress={handleClearRange}
                  enabled={hasRange}
                  innerClassName={styles.btnClear}
                  textClassName={styles.btnTxt13}
                />
              </>
            )}
          </div>
        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div className={styles.rightColumn}>
          <PunchListHeader
            sSelectedUser={sSelectedUser}
            isAdmin={isAdmin}
            sLoading={sLoading}
            displayArr={displayArr}
            handleNewPunchPress={handleNewPunchPress}
          />

          {/* Table Header */}
          <div className={`${styles.tableHeader} ${!isAdmin ? styles.tableHeaderNoEdit : ""}`}>
            <span className={styles.thDate}>Date</span>
            <span className={styles.thIn}>Clock In</span>
            <span className={styles.thOut}>Clock Out</span>
            <span className={styles.thHours}>Hours</span>
            {isAdmin && <span className={styles.thEdit}>Edit</span>}
          </div>

          {!sSelectedUser ? (
            <div className={styles.emptyState}>
              <span className={`${styles.emptyStateText} ${styles.textG50}`}>
                Select a user to view payroll
              </span>
            </div>
          ) : (
            <PunchList
              displayArr={displayArr}
              handleFullTimeChange={handleFullTimeChange}
              handleCreateMissingPunch={handleCreateMissingPunch}
              handleDeletePunchPress={handleDeletePunchPress}
              handleEnterRowEdit={handleEnterRowEdit}
              handleCancelRowEdit={handleCancelRowEdit}
              handleSaveRowEdit={handleSaveRowEdit}
              sSaving={sSaving}
              isAdmin={isAdmin}
            />
          )}

          {/* Summary Footer */}
          <div className={`${styles.footer} ${styles.borderTopGreen}`}>
            <PayrollSummaryItem
              label="Total Hours"
              value={
                totalHoursObj.hours +
                ":" +
                String(totalHoursObj.minutes).padStart(2, "0")
              }
            />
            {isAdmin && (
              <div className={styles.summaryItem}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Hourly Rate</span>
                  <TouchableOpacity onPress={() => _setShowRate((p) => !p)} className={styles.eyeToggle}>
                    <Image
                      icon={ICONS.downChevron}
                      size={16}
                      style={{ transform: sShowRate ? "none" : "rotate(-90deg)" }}
                    />
                  </TouchableOpacity>
                </div>
                <span className={styles.summaryValue}>
                  {sShowRate ? "$" + hourlyWage.toFixed(2) : "***"}
                </span>
              </div>
            )}
            {isAdmin && (
              <div className={styles.summaryItem}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Total Wages</span>
                  <TouchableOpacity onPress={() => _setShowRate((p) => !p)} className={styles.eyeToggle}>
                    <Image
                      icon={ICONS.downChevron}
                      size={16}
                      style={{ transform: sShowRate ? "none" : "rotate(-90deg)" }}
                    />
                  </TouchableOpacity>
                </div>
                <span className={`${styles.summaryValue} ${styles.textGreenLight}`}>
                  {sShowRate ? "$" + Number(totalWages).toLocaleString() : "***"}
                </span>
              </div>
            )}
            <div className={styles.footerActions}>
              <Tooltip text={isAdmin ? "Email payroll report" : "Email CSV to yourself"} position="top">
                <Button
                  text={sEmailing ? "Sending..." : "EMAIL"}
                  colorGradientArr={
                    sSelectedUser && displayArr.length > 0
                      ? COLOR_GRADIENTS.purple
                      : COLOR_GRADIENTS.grey
                  }
                  onPress={() => {
                    if (!sSelectedUser || displayArr.length === 0 || sEmailing) return;
                    isAdmin ? handleEmailPayroll() : handleEmployeeEmailCSV();
                  }}
                  enabled={
                    !!sSelectedUser &&
                    displayArr.length > 0 &&
                    !sEmailing
                  }
                  icon={ICONS.notes}
                  iconSize={16}
                  innerClassName={isAdmin ? styles.btnEmail : styles.btnEmailSolo}
                  textClassName={styles.btnTxt14}
                />
              </Tooltip>
              {sEmailing && !isAdmin && (
                <SmallLoadingIndicator color="white" className={styles.loadingSpacerLeft} />
              )}
              {sEmailStatus === "sent" && (
                <span className={`${styles.statusMsg} ${styles.textGreenLight}`}>Sent!</span>
              )}
              {sEmailStatus === "error" && (
                <span className={`${styles.statusMsg} ${styles.textLightred}`}>Failed</span>
              )}
              {sEmailStatus === "no-email" && (
                <span className={`${styles.statusMsg} ${styles.textOrange}`}>
                  No email on file
                </span>
              )}
            </div>
          </div>
        </div>
        </div>

          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

/** Reusable editable time cell — tappable time that opens TimePicker */
const EditableTimeCell = ({ timeObj, prefix, onTimeChange }) => {
  const [sShowPicker, _sSetShowPicker] = useState(false);
  return (
    <div className={styles.editableTimeWrap}>
      <TouchableOpacity
        onPress={() => _sSetShowPicker(true)}
        className={`${styles.editableTimeChip} ${styles.bgBlue}`}
      >
        <span className={styles.editableTimeChipText}>
          {timeObj.hour}:{String(timeObj.minutes).padStart(2, "0")} {timeObj.amPM}
        </span>
      </TouchableOpacity>
      <Dialog visible={sShowPicker} onClose={() => _sSetShowPicker(false)} overlayColor={C.surfaceOverlay}>
        <TimePicker
          initialHour={timeObj.hour}
          initialMinute={timeObj.minutes}
          initialPeriod={timeObj.amPM}
          onConfirm={({ hour, minute, period }) => {
            onTimeChange(prefix, hour, minute, period);
            _sSetShowPicker(false);
          }}
          onCancel={() => _sSetShowPicker(false)}
        />
      </Dialog>
    </div>
  );
};

/** "+ Add" pill that opens a TimePicker; chosen time fills this row's missing slot */
const AddMissingPunchCell = ({ option, referencePunch, onAdd, pillClassName }) => {
  const [sShowPicker, _sSetShowPicker] = useState(false);

  let initHour = 12;
  let initMinute = 0;
  let initPeriod = "AM";
  if (referencePunch?.millis) {
    let refDate = new Date(referencePunch.millis);
    let h24 = refDate.getHours();
    initPeriod = h24 >= 12 ? "PM" : "AM";
    initHour = h24 % 12;
    if (initHour === 0) initHour = 12;
    initMinute = refDate.getMinutes();
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => _sSetShowPicker(true)}
        className={`${styles.addPill} ${pillClassName || ""}`}
      >
        <span className={styles.addPillText}>+ Add</span>
      </TouchableOpacity>
      <Dialog
        visible={sShowPicker}
        onClose={() => _sSetShowPicker(false)}
        overlayColor={C.surfaceOverlay}
      >
        <TimePicker
          initialHour={initHour}
          initialMinute={initMinute}
          initialPeriod={initPeriod}
          onConfirm={({ hour, minute, period }) => {
            onAdd({ hour, minute, period });
            _sSetShowPicker(false);
          }}
          onCancel={() => _sSetShowPicker(false)}
        />
      </Dialog>
    </>
  );
};

const PayrollSummaryItem = ({ label, value, highlight }) => (
  <div className={styles.summaryItem}>
    <span className={styles.summaryLabel}>{label}</span>
    <span className={`${styles.summaryValue} ${highlight ? styles.textGreenLight : ""}`}>
      {value}
    </span>
  </div>
);

const PunchListHeader = ({ sSelectedUser, isAdmin, sLoading, displayArr, handleNewPunchPress }) => {
  const zPunchClock = useLoginStore((state) => state.punchClock);
  const isClockedIn = sSelectedUser ? !!zPunchClock[sSelectedUser.id] : false;

  function handleClockToggle() {
    if (!sSelectedUser) return;
    let millis = Date.now();
    let option = isClockedIn ? "out" : "in";
    useLoginStore.getState().setCreateUserClock(sSelectedUser.id, millis, option);
  }

  return (
    <div className={styles.empHeader}>
      <div className={styles.empNameWrap}>
        <span className={`${styles.empName} ${styles.textC}`}>
          {sSelectedUser
            ? sSelectedUser.first + " " + sSelectedUser.last
            : "Select a user"}
        </span>
      </div>
      {!!sSelectedUser && (
        <div className={styles.clockWrap}>
          <div className={`${styles.clockDot} ${isClockedIn ? styles.bgGreen : styles.bgRed}`} />
          <span className={`${styles.clockText} ${isClockedIn ? styles.textGreen : styles.textRed}`}>
            {isClockedIn ? "Clocked In" : "Clocked Out"}
          </span>
          <Button
            text={isClockedIn ? "CLOCK OUT" : "CLOCK IN"}
            onPress={handleClockToggle}
            colorGradientArr={isClockedIn ? COLOR_GRADIENTS.red : COLOR_GRADIENTS.green}
            innerClassName={styles.btnClock}
            textClassName={styles.btnTxt10}
          />
        </div>
      )}
      <div className={styles.headerActions}>
        {isAdmin && !!sSelectedUser && (
          <Button
            text="Add Punch"
            onPress={handleNewPunchPress}
            colorGradientArr={COLOR_GRADIENTS.blue}
            innerClassName={styles.btnAddPunch}
            textClassName={styles.btnTxt12}
          />
        )}
        {!!sSelectedUser && !sLoading && (
          <span className={`${styles.entryCount} ${styles.textG40}`}>
            {displayArr.length} entries
          </span>
        )}
      </div>
    </div>
  );
};

const PAGE_SIZE = 50;

const PunchList = ({ displayArr, handleFullTimeChange, handleCreateMissingPunch, handleDeletePunchPress, handleEnterRowEdit, handleCancelRowEdit, handleSaveRowEdit, sSaving, isAdmin }) => {
  const [sEditableRowIdx, _setEditableRowIdx] = useState(null);
  const [sPage, _setPage] = useState(0);
  const scrollRef = useRef(null);

  let reversed = [...displayArr].reverse();
  let totalPages = Math.max(1, Math.ceil(reversed.length / PAGE_SIZE));
  let page = Math.min(sPage, totalPages - 1);
  let pageData = reversed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  let prevLenRef = useRef(displayArr.length);
  if (displayArr.length !== prevLenRef.current) {
    prevLenRef.current = displayArr.length;
    if (sPage !== 0) _setPage(0);
  }

  function goPage(p) {
    _setEditableRowIdx(null);
    _setPage(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  return (
    <div className={styles.listWrap}>
      <div ref={scrollRef} className={styles.listScroll}>
        {pageData.map((item, index) => {
          let globalIdx = page * PAGE_SIZE + index;
          let editable = globalIdx === sEditableRowIdx;
          let altBg = index % 2 !== 0;

          return (
            <div
              key={(item.in?.id || "") + (item.out?.id || "") + globalIdx}
              className={`${styles.row} ${editable ? styles.rowEditable : ""} ${!isAdmin ? styles.rowNoEdit : ""} ${altBg ? styles.bgRowAlt : styles.bgListItem}`}
              style={{ opacity: editable ? 1 : sEditableRowIdx != null ? 0.3 : 1 }}
            >
              {/* Date */}
              <div className={styles.cellDate}>
                <span className={`${styles.cellTextPrimary} ${styles.textC} ${styles.dispBlock}`}>
                  {item.in?.wordDayOfWeek || item.out?.wordDayOfWeek}
                </span>
                <span className={`${styles.cellTextSecondary} ${styles.textG50} ${styles.dispBlock}`}>
                  {item.in?.wordDayOfMonth || item.out?.wordDayOfMonth}{" "}
                  {item.in?.dayOfMonth || item.out?.dayOfMonth}
                </span>
              </div>

              {/* Clock In */}
              <div className={styles.cellIn}>
                {item.in ? (
                  <div className={styles.editableTimeWrap}>
                    <Image icon={ICONS.forwardGreen} size={14} className={styles.cellInIcon} />
                    {editable ? (
                      <EditableTimeCell
                        timeObj={item.in}
                        prefix="in"
                        onTimeChange={(prefix, hour, minute, period) =>
                          handleFullTimeChange(item, prefix, hour, minute, period)
                        }
                      />
                    ) : (
                      <span className={`${styles.cellTime} ${styles.textC}`}>
                        {item.in.hour}:{String(item.in.minutes).padStart(2, "0")} {item.in.amPM}
                      </span>
                    )}
                  </div>
                ) : editable ? (
                  <AddMissingPunchCell
                    option="in"
                    referencePunch={item.out}
                    onAdd={(customTime) => handleCreateMissingPunch(item, "in", customTime)}
                    pillClassName={styles.addPillGreen}
                  />
                ) : (
                  <span className={`${styles.cellTimeMuted} ${styles.textG50}`}>--</span>
                )}
              </div>

              {/* Clock Out */}
              <div className={styles.cellOut}>
                {item.out ? (
                  <div className={styles.editableTimeWrap}>
                    {editable ? (
                      <EditableTimeCell
                        timeObj={item.out}
                        prefix="out"
                        onTimeChange={(prefix, hour, minute, period) =>
                          handleFullTimeChange(item, prefix, hour, minute, period)
                        }
                      />
                    ) : (
                      <span className={`${styles.cellTime} ${styles.textC}`}>
                        {item.out.hour}:{String(item.out.minutes).padStart(2, "0")} {item.out.amPM}
                      </span>
                    )}
                  </div>
                ) : editable ? (
                  <AddMissingPunchCell
                    option="out"
                    referencePunch={item.in}
                    onAdd={(customTime) => handleCreateMissingPunch(item, "out", customTime)}
                    pillClassName={styles.addPillRed}
                  />
                ) : (
                  <span className={`${styles.cellTimeMuted} ${styles.textG50}`}>--</span>
                )}
              </div>

              {/* Hours */}
              <div className={styles.cellHours}>
                {item.hoursDiff != null || item.minutesDiff != null ? (
                  <span className={`${styles.cellTime} ${styles.cellHoursValue} ${styles.textC}`}>
                    {item.hoursDiff || 0}:{item.minutesDiff || "00"}
                  </span>
                ) : (
                  <span className={`${styles.cellTimeMuted} ${styles.textG50}`}>--</span>
                )}
              </div>

              {/* Edit / Delete */}
              {isAdmin && (
                <div className={styles.cellEdit}>
                  {editable ? (
                    <>
                      <Tooltip text="Cancel changes" position="left">
                        <TouchableOpacity
                          onPress={() => {
                            if (sSaving) return;
                            handleCancelRowEdit();
                            _setEditableRowIdx(null);
                          }}
                          className={styles.iconBtn}
                        >
                          <Image icon={ICONS.redx} size={21} />
                        </TouchableOpacity>
                      </Tooltip>
                      <Tooltip text="Save changes" position="left">
                        <TouchableOpacity
                          onPress={() => {
                            if (sSaving) return;
                            if (item.in && item.out && (item.out.millis - item.in.millis) < MILLIS_IN_MINUTE) {
                              useAlertScreenStore.getState().setValues({
                                title: "Invalid Time",
                                message: "Clock in must be at least 1 minute before clock out.",
                                btn1Text: "OK",
                                handleBtn1Press: () => {
                                  useAlertScreenStore.getState().setShowAlert(false);
                                },
                                canExitOnOuterClick: true,
                              });
                              return;
                            }
                            handleSaveRowEdit();
                            _setEditableRowIdx(null);
                          }}
                          className={`${styles.iconBtn} ${styles.iconBtnLeft}`}
                        >
                          <Image icon={ICONS.check} size={21} />
                        </TouchableOpacity>
                      </Tooltip>
                      <Tooltip text="Delete entry" position="left">
                        <TouchableOpacity
                          onPress={() => {
                            useAlertScreenStore.getState().setValues({
                              title: "Delete Punch",
                              message: "Are you sure you want to delete this entry?",
                              btn1Text: "Delete",
                              btn2Text: "Cancel",
                              handleBtn1Press: () => {
                                let isOrphanOnly = (!!item.in && !item.out) || (!item.in && !!item.out);
                                handleDeletePunchPress(item.in || item.out);
                                if (isOrphanOnly) _setEditableRowIdx(null);
                                useAlertScreenStore.getState().setShowAlert(false);
                              },
                              handleBtn2Press: () => {
                                useAlertScreenStore.getState().setShowAlert(false);
                              },
                              canExitOnOuterClick: true,
                            });
                          }}
                          className={`${styles.iconBtn} ${styles.iconBtnLeft}`}
                        >
                          <Image icon={ICONS.trash} size={19} />
                        </TouchableOpacity>
                      </Tooltip>
                    </>
                  ) : (
                    <Tooltip text="Edit entry" position="left">
                      <TouchableOpacity
                        onPress={() => {
                          handleEnterRowEdit();
                          _setEditableRowIdx(globalIdx);
                        }}
                        className={styles.iconBtn}
                      >
                        <Image icon={ICONS.editPencil} size={18} />
                      </TouchableOpacity>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination bar */}
      {totalPages > 1 && (
        <div className={`${styles.pagination} ${styles.bgPagination} ${styles.borderTopG85}`}>
          <TouchableOpacity
            onPress={() => goPage(page - 1)}
            disabled={page === 0}
            className={`${styles.pagBtn} ${page === 0 ? styles.dimmed : ""}`}
          >
            <Image icon={ICONS.greenLeftArrow} size={16} />
          </TouchableOpacity>
          <span className={`${styles.pagText} ${styles.textC}`}>
            Page {page + 1} of {totalPages}
          </span>
          <TouchableOpacity
            onPress={() => goPage(page + 1)}
            disabled={page >= totalPages - 1}
            className={`${styles.pagBtn} ${page >= totalPages - 1 ? styles.dimmed : ""}`}
          >
            <Image icon={ICONS.greenRightArrow} size={16} />
          </TouchableOpacity>
        </div>
      )}
    </div>
  );
};
