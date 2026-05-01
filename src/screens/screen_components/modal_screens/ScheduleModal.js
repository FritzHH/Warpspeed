/*eslint-disable*/
import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native-web";
import ReactDOM from "react-dom";
import { cloneDeep, debounce } from "lodash";
import dayjs from "dayjs";
import { C, ICONS } from "../../../styles";
import { gray, trimToTwoDecimals } from "../../../utils";
import { Image_, TimePicker_ } from "../../../components";
import { useSettingsStore, useAlertScreenStore } from "../../../stores";

// ─── helpers ────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function getWeekStart(date) {
  let d = dayjs(date).startOf("day");
  let dow = d.day(); // 0=Sun
  let mondayOffset = dow === 0 ? -6 : 1 - dow;
  return d.add(mondayOffset, "day").format("YYYY-MM-DD");
}

export function getStoreHoursForDayIndex(storeHours, dayIndex) {
  if (!storeHours?.standard) return null;
  // dayIndex 1=Mon..7=Sun maps to storeHours.standard[0]=Mon..[6]=Sun
  return storeHours.standard[dayIndex - 1] || null;
}

function parseTime(timeStr) {
  if (!timeStr) return { hour: 12, minute: 0, period: "PM" };
  let parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!parts) return { hour: 12, minute: 0, period: "PM" };
  return { hour: parseInt(parts[1]), minute: parseInt(parts[2]), period: parts[3].toUpperCase() };
}

function formatTime(hour, minute, period) {
  return `${hour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatTimeShort(timeStr) {
  let { hour, minute, period } = parseTime(timeStr);
  let m = minute > 0 ? `:${String(minute).padStart(2, "0")}` : "";
  return `${hour}${m}${period.toLowerCase()[0]}`;
}

function pruneOldWeeks(schedulesObj) {
  let cutoff = dayjs().subtract(8, "week").format("YYYY-MM-DD");
  let pruned = {};
  Object.keys(schedulesObj).forEach((key) => {
    if (key >= cutoff) pruned[key] = schedulesObj[key];
  });
  return pruned;
}

function timeToMinutes(timeStr) {
  let { hour, minute, period } = parseTime(timeStr);
  let h24 = period === "PM" ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
  return h24 * 60 + minute;
}

function getShiftHours(shift) {
  if (!shift) return 0;
  let start = timeToMinutes(shift.startTime);
  let end = timeToMinutes(shift.endTime);
  if (end <= start) end += 1440;
  return (end - start) / 60;
}

function getUserWeekHours(userId, shifts) {
  let total = 0;
  for (let dayIndex = 1; dayIndex <= 7; dayIndex++) {
    let shift = shifts[`${userId}_${dayIndex}`];
    if (shift) total += getShiftHours(shift);
  }
  return total;
}

// ─── shift cell ─────────────────────────────────────────────────────────────

const PICKER_W = 208;
const PICKER_H = 360;

function openPickerAt(e, setter) {
  let x = e.nativeEvent?.pageX ?? e.pageX ?? 0;
  let y = e.nativeEvent?.pageY ?? e.pageY ?? 0;
  let left = x - PICKER_W / 2;
  let top = y - PICKER_H + 40;
  let vw = window.innerWidth;
  let vh = window.innerHeight;
  if (left < 8) left = 8;
  if (left + PICKER_W > vw - 8) left = vw - PICKER_W - 8;
  if (top < 8) top = 8;
  if (top + PICKER_H > vh - 8) top = vh - PICKER_H - 8;
  setter({ left, top });
}

function ShiftCell({ shift, isClosed, storeHoursDay, onAddWithTimes, onUpdate, onRemove, isPastWeek }) {
  let [sPickerFor, _setPickerFor] = useState(null);
  let [sPickerPos, _setPickerPos] = useState(null);

  if (isClosed) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 60,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "rgb(235,235,235)",
          borderRadius: 6,
          margin: 2,
        }}
      >
        <Text style={{ fontSize: 11, color: "rgb(140,140,140)", fontWeight: "500" }}>CLOSED</Text>
      </View>
    );
  }

  let defaultStart = parseTime(storeHoursDay?.openTime || "9:00 AM");
  let defaultEnd = parseTime(storeHoursDay?.closeTime || "5:00 PM");
  let hasShift = !!shift;

  let inInitial = hasShift ? parseTime(shift.startTime) : defaultStart;
  let outInitial = hasShift ? parseTime(shift.endTime) : defaultEnd;

  // past week: light gray; current/future: dark gray
  let filledBg = isPastWeek ? "rgb(190,190,190)" : "rgb(120,120,120)";

  function handlePickerConfirm({ hour, minute, period }) {
    let newTime = formatTime(hour, minute, period);
    if (sPickerFor === "in") {
      if (hasShift) {
        onUpdate({ ...shift, startTime: newTime });
      } else {
        let endTime = formatTime(defaultEnd.hour, defaultEnd.minute, defaultEnd.period);
        onAddWithTimes(newTime, endTime);
      }
    } else {
      if (hasShift) {
        onUpdate({ ...shift, endTime: newTime });
      } else {
        let startTime = formatTime(defaultStart.hour, defaultStart.minute, defaultStart.period);
        onAddWithTimes(startTime, newTime);
      }
    }
    _setPickerFor(null);
  }

  // past week with no shift: just an empty gray cell
  if (isPastWeek && !hasShift) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 60,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "rgb(240,240,240)",
          borderRadius: 6,
          margin: 2,
        }}
      >
        <Text style={{ fontSize: 12, color: "rgb(190,190,190)" }}>-</Text>
      </View>
    );
  }

  // past week with shift: read-only display
  if (isPastWeek && hasShift) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 60,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "rgb(240,240,240)",
          borderRadius: 6,
          margin: 2,
        }}
      >
        <View style={{ backgroundColor: filledBg, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4, marginBottom: 3, width: "90%", alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: "white", fontWeight: "700" }}>{formatTimeShort(shift.startTime)}</Text>
        </View>
        <View style={{ backgroundColor: filledBg, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4, width: "90%", alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: "white", fontWeight: "700" }}>{formatTimeShort(shift.endTime)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        minHeight: 60,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: hasShift ? "#e8f5e9" : "rgb(240,240,240)",
        borderRadius: 6,
        margin: 2,
        borderWidth: hasShift ? 1 : 0,
        borderColor: hasShift ? C.green : "transparent",
        position: "relative",
      }}
    >
      {hasShift && (
        <TouchableOpacity
          onPress={onRemove}
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "rgb(210,210,210)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: "rgb(100,100,100)", marginTop: -1 }}>x</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={(e) => { openPickerAt(e, _setPickerPos); _setPickerFor("in"); }}
        style={{
          backgroundColor: hasShift ? filledBg : C.green,
          borderRadius: 5,
          paddingHorizontal: 6,
          paddingVertical: 4,
          marginBottom: 3,
          width: "90%",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 12, color: "white", fontWeight: "700" }}>
          {hasShift ? formatTimeShort(shift.startTime) : "In"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={(e) => { openPickerAt(e, _setPickerPos); _setPickerFor("out"); }}
        style={{
          backgroundColor: hasShift ? filledBg : C.blue,
          borderRadius: 5,
          paddingHorizontal: 6,
          paddingVertical: 4,
          width: "90%",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 12, color: "white", fontWeight: "700" }}>
          {hasShift ? formatTimeShort(shift.endTime) : "Out"}
        </Text>
      </TouchableOpacity>
      {!!sPickerFor && sPickerPos && ReactDOM.createPortal(
        <View
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000,
          }}
        >
          <TouchableWithoutFeedback onPress={() => { _setPickerFor(null); _setPickerPos(null); }}>
            <View style={{ width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.25)" }}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View
                  style={{
                    position: "absolute",
                    left: sPickerPos.left,
                    top: sPickerPos.top,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "white", marginBottom: 6 }}>
                    {sPickerFor === "in" ? "Clock In Time" : "Clock Out Time"}
                  </Text>
                  <TimePicker_
                    initialHour={sPickerFor === "in" ? inInitial.hour : outInitial.hour}
                    initialMinute={sPickerFor === "in" ? inInitial.minute : outInitial.minute}
                    initialPeriod={sPickerFor === "in" ? inInitial.period : outInitial.period}
                    onConfirm={(val) => { handlePickerConfirm(val); _setPickerPos(null); }}
                    onCancel={() => { _setPickerFor(null); _setPickerPos(null); }}
                  />
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </View>,
        document.body
      )}
    </View>
  );
}

// ─── main modal ─────────────────────────────────────────────────────────────

export function ScheduleModal({ handleExit }) {
  let settings = useSettingsStore((state) => state.settings);
  let users = settings?.users || [];
  let storeHours = settings?.storeHours;

  let [sWeekStart, _setWeekStart] = useState(getWeekStart(new Date()));
  let [sShifts, _setShifts] = useState(() => {
    let weekKey = getWeekStart(new Date());
    return cloneDeep(settings?.schedules?.[weekKey]?.shifts || {});
  });
  let [sShowPay, _setShowPay] = useState(false);

  let debouncedSaveRef = useRef(
    debounce((allSchedules) => {
      useSettingsStore.getState().setField("schedules", allSchedules);
    }, 500)
  );

  function saveShifts(updatedShifts, weekKey) {
    _setShifts(updatedShifts);
    let allSchedules = cloneDeep(settings?.schedules || {});
    if (!weekKey) weekKey = sWeekStart;
    allSchedules[weekKey] = { weekStart: weekKey, shifts: updatedShifts };
    allSchedules = pruneOldWeeks(allSchedules);
    useSettingsStore.getState().setField("schedules", allSchedules, false);
    debouncedSaveRef.current(allSchedules);
  }

  function handleAddShift(userID, dayIndex, startTime, endTime) {
    let key = `${userID}_${dayIndex}`;
    let updated = { ...sShifts };
    updated[key] = { id: key, userID, dayIndex, startTime, endTime };
    saveShifts(updated);
  }

  function handleUpdateShift(key, shift) {
    let updated = { ...sShifts, [key]: shift };
    saveShifts(updated);
  }

  function handleRemoveShift(key) {
    let updated = { ...sShifts };
    delete updated[key];
    saveShifts(updated);
  }

  function navigateWeek(dir) {
    let newStart = dayjs(sWeekStart).add(dir * 7, "day").format("YYYY-MM-DD");
    _setWeekStart(newStart);
    let existingShifts = settings?.schedules?.[newStart]?.shifts || {};
    _setShifts(cloneDeep(existingShifts));
  }

  function goToToday() {
    let today = getWeekStart(new Date());
    _setWeekStart(today);
    let existingShifts = settings?.schedules?.[today]?.shifts || {};
    _setShifts(cloneDeep(existingShifts));
  }

  function handleCopyLastWeek() {
    let prevStart = dayjs(sWeekStart).subtract(7, "day").format("YYYY-MM-DD");
    let prevShifts = settings?.schedules?.[prevStart]?.shifts;
    if (!prevShifts || Object.keys(prevShifts).length === 0) {
      useAlertScreenStore.getState().setValues({
        title: "No Previous Schedule",
        message: "There is no schedule from the previous week to copy.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
      return;
    }

    let hasCurrentShifts = Object.keys(sShifts).length > 0;
    if (hasCurrentShifts) {
      useAlertScreenStore.getState().setValues({
        title: "Copy Previous Week",
        message: "This will replace all shifts for this week with last week's schedule. Continue?",
        btn1Text: "Copy",
        btn2Text: "Cancel",
        handleBtn1Press: () => {
          useAlertScreenStore.getState().setShowAlert(false);
          let copied = cloneDeep(prevShifts);
          saveShifts(copied);
        },
        handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    } else {
      let copied = cloneDeep(prevShifts);
      saveShifts(copied);
    }
  }

  function handleCopyForward() {
    if (Object.keys(sShifts).length === 0) {
      useAlertScreenStore.getState().setValues({
        title: "No Schedule",
        message: "There are no shifts on this week to copy forward.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
      return;
    }

    let nextStart = dayjs(sWeekStart).add(7, "day").format("YYYY-MM-DD");
    let nextShifts = settings?.schedules?.[nextStart]?.shifts;
    let hasNextShifts = nextShifts && Object.keys(nextShifts).length > 0;

    if (hasNextShifts) {
      useAlertScreenStore.getState().setValues({
        title: "Copy Forward",
        message: "This will replace all shifts for next week with this week's schedule. Continue?",
        btn1Text: "Copy",
        btn2Text: "Cancel",
        handleBtn1Press: () => {
          useAlertScreenStore.getState().setShowAlert(false);
          let copied = cloneDeep(sShifts);
          let allSchedules = cloneDeep(settings?.schedules || {});
          allSchedules[nextStart] = { weekStart: nextStart, shifts: copied };
          allSchedules = pruneOldWeeks(allSchedules);
          useSettingsStore.getState().setField("schedules", allSchedules, false);
          debouncedSaveRef.current(allSchedules);
        },
        handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    } else {
      let copied = cloneDeep(sShifts);
      let allSchedules = cloneDeep(settings?.schedules || {});
      allSchedules[nextStart] = { weekStart: nextStart, shifts: copied };
      allSchedules = pruneOldWeeks(allSchedules);
      useSettingsStore.getState().setField("schedules", allSchedules, false);
      debouncedSaveRef.current(allSchedules);
    }
  }

  // week date range label
  let weekStartDay = dayjs(sWeekStart);
  let weekEndDay = weekStartDay.add(6, "day");
  let weekLabel =
    weekStartDay.format("MMM D") + " - " + weekEndDay.format("MMM D, YYYY");
  let currentWeekStart = getWeekStart(new Date());
  let isCurrentWeek = sWeekStart === currentWeekStart;
  let isPastWeek = sWeekStart < currentWeekStart;

  // build day columns
  let dayColumns = [];
  for (let i = 0; i < 7; i++) {
    let dayIndex = i + 1; // 1=Mon..7=Sun
    let date = weekStartDay.add(i, "day");
    let storeDay = getStoreHoursForDayIndex(storeHours, dayIndex);
    dayColumns.push({
      dayIndex,
      name: DAY_NAMES[i],
      fullName: DAY_NAMES_FULL[i],
      date: date.format("M/D"),
      dateObj: date,
      isClosed: storeDay ? !storeDay.isOpen : false,
      openTime: storeDay?.open || "",
      closeTime: storeDay?.close || "",
    });
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
            flexDirection: "column",
          }}
        >
          {/* ─── header ──────────────────────────────────────────────── */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "rgb(220,220,220)",
              backgroundColor: "white",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => navigateWeek(-1)}
                style={{
                  width: 44,
                  height: 44,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: "rgb(230,230,230)",
                  borderRadius: 10,
                }}
              >
                <Text style={{ fontSize: 20, color: C.text, fontWeight: "700" }}>{"<"}</Text>
              </TouchableOpacity>

              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: C.text,
                  marginHorizontal: 16,
                  minWidth: 220,
                  textAlign: "center",
                }}
              >
                {weekLabel}
              </Text>

              <TouchableOpacity
                onPress={() => navigateWeek(1)}
                style={{
                  width: 44,
                  height: 44,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: "rgb(230,230,230)",
                  borderRadius: 10,
                }}
              >
                <Text style={{ fontSize: 20, color: C.text, fontWeight: "700" }}>{">"}</Text>
              </TouchableOpacity>

              {!isCurrentWeek && (
                <TouchableOpacity
                  onPress={goToToday}
                  style={{
                    marginLeft: 16,
                    backgroundColor: C.blue,
                    borderRadius: 8,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                  }}
                >
                  <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>Today</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TouchableOpacity
                onPress={isPastWeek ? undefined : handleCopyLastWeek}
                style={{
                  backgroundColor: C.green,
                  borderRadius: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  marginRight: 16,
                  opacity: isPastWeek ? 0.4 : 1,
                }}
                disabled={isPastWeek}
              >
                <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>
                  Copy Last Week
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={isPastWeek ? undefined : handleCopyForward}
                style={{
                  backgroundColor: C.orange,
                  borderRadius: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  marginRight: 16,
                  opacity: isPastWeek ? 0.4 : 1,
                }}
                disabled={isPastWeek}
              >
                <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>
                  Copy Forward
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => _setShowPay(!sShowPay)}
                style={{
                  backgroundColor: sShowPay ? "rgb(180,180,180)" : "rgb(103,124,231)",
                  borderRadius: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  marginRight: 16,
                }}
              >
                <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>
                  {sShowPay ? "Hide Pay" : "Show Pay"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleExit}
                style={{
                  width: 40,
                  height: 40,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Image_ icon={ICONS.close1} size={31} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ─── grid ────────────────────────────────────────────────── */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
            {/* day header row */}
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              <View style={{ width: 100, paddingRight: 8 }} />
              {dayColumns.map((col) => (
                <View
                  key={col.dayIndex}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 8,
                    margin: 2,
                    backgroundColor: col.isClosed ? "rgb(235,235,235)" : C.blue,
                    borderRadius: 8,
                    opacity: col.isClosed ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "600",
                      color: col.isClosed ? "rgb(140,140,140)" : "white",
                    }}
                  >
                    {col.name} {col.date}
                  </Text>
                  {col.isClosed ? (
                    <Text style={{ fontSize: 11, color: "rgb(140,140,140)", marginTop: 2 }}>Closed</Text>
                  ) : (
                    <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
                      {formatTimeShort(col.openTime)} - {formatTimeShort(col.closeTime)}
                    </Text>
                  )}
                </View>
              ))}
              {sShowPay && (
                <View style={{ width: 80, justifyContent: "center", alignItems: "center", margin: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>Pay</Text>
                </View>
              )}
            </View>

            {/* employee rows */}
            {users.map((user) => {
              let weekHours = getUserWeekHours(user.id, sShifts);
              let wage = Number(user.hourlyWage) || 0;
              let weekPay = trimToTwoDecimals(weekHours * wage);
              return (
                <View
                  key={user.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "stretch",
                    marginBottom: 4,
                    minHeight: 64,
                  }}
                >
                  <View
                    style={{
                      width: 100,
                      justifyContent: "center",
                      paddingRight: 6,
                      paddingLeft: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: C.text,
                      }}
                      numberOfLines={1}
                    >
                      {user.first}
                    </Text>
                    {!!user.last && (
                      <Text
                        style={{
                          fontSize: 11,
                          color: "rgb(140,140,140)",
                          fontWeight: "500",
                        }}
                        numberOfLines={1}
                      >
                        {user.last}
                      </Text>
                    )}
                    <Text style={{ fontSize: 10, color: "rgb(160,160,160)", fontWeight: "500", marginTop: 1 }}>
                      {trimToTwoDecimals(weekHours)}
                    </Text>
                  </View>

                  {dayColumns.map((col) => {
                    let shiftKey = `${user.id}_${col.dayIndex}`;
                    let shift = sShifts[shiftKey] || null;
                    return (
                      <ShiftCell
                        key={shiftKey}
                        shift={shift}
                        isClosed={col.isClosed}
                        storeHoursDay={col}
                        isPastWeek={isPastWeek}
                        onAddWithTimes={(startTime, endTime) => handleAddShift(user.id, col.dayIndex, startTime, endTime)}
                        onUpdate={(updated) => handleUpdateShift(shiftKey, updated)}
                        onRemove={() => handleRemoveShift(shiftKey)}
                      />
                    );
                  })}

                  {sShowPay && (
                    <View style={{ width: 80, justifyContent: "center", alignItems: "center", margin: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>
                        ${weekPay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            {/* ─── summary row ──────────────────────────────────────── */}
            {(() => {
              let totalHours = 0;
              let totalPay = 0;
              users.forEach((user) => {
                let h = getUserWeekHours(user.id, sShifts);
                totalHours += h;
                totalPay += h * (Number(user.hourlyWage) || 0);
              });
              totalHours = trimToTwoDecimals(totalHours);
              totalPay = trimToTwoDecimals(totalPay);
              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 8,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: "rgb(220,220,220)",
                  }}
                >
                  <View style={{ width: 100, paddingLeft: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>Total</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "rgb(100,100,100)" }}>
                      {totalHours} scheduled
                    </Text>
                  </View>
                  {sShowPay && (
                    <View style={{ width: 80, alignItems: "center" }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>
                        ${totalPay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    );
  });

  return ReactDOM.createPortal(
    <View
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9998,
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
}
