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
import { gray } from "../../../utils";
import { Image_ } from "../../../components";
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

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 15, 30, 45];
const PERIODS = ["AM", "PM"];

// ─── time dropdown ──────────────────────────────────────────────────────────

function TimeDropdownRow({ label, timeStr, onChange }) {
  let { hour, minute, period } = parseTime(timeStr);

  function handleChange(newHour, newMinute, newPeriod) {
    onChange(formatTime(newHour, newMinute, newPeriod));
  }

  let selectStyle = {
    fontSize: 16,
    fontWeight: "600",
    color: C.text,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    textAlign: "center",
    cursor: "pointer",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: "600", color: gray(0.45), width: 50 }}>{label}</Text>
      <select
        value={hour}
        onChange={(e) => handleChange(parseInt(e.target.value), minute, period)}
        style={{ ...selectStyle, width: 56, marginRight: 6 }}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <select
        value={minute}
        onChange={(e) => handleChange(hour, parseInt(e.target.value), period)}
        style={{ ...selectStyle, width: 60, marginRight: 6 }}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
      <select
        value={period}
        onChange={(e) => handleChange(hour, minute, e.target.value)}
        style={{ ...selectStyle, width: 62 }}
      >
        {PERIODS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </View>
  );
}

// ─── shift edit popover ─────────────────────────────────────────────────────

function ShiftEditPopover({ shift, onUpdate, onRemove, onClose }) {
  return (
    <View
      style={{
        position: "absolute",
        top: "100%",
        left: "50%",
        transform: [{ translateX: "-50%" }],
        zIndex: 9999,
        backgroundColor: "white",
        borderRadius: 12,
        borderWidth: 2,
        borderColor: C.buttonLightGreenOutline,
        padding: 14,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        minWidth: 250,
      }}
    >
      <TimeDropdownRow
        label="Start"
        timeStr={shift.startTime}
        onChange={(t) => onUpdate({ ...shift, startTime: t })}
      />
      <TimeDropdownRow
        label="End"
        timeStr={shift.endTime}
        onChange={(t) => onUpdate({ ...shift, endTime: t })}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <TouchableOpacity
          onPress={onRemove}
          style={{
            backgroundColor: C.red,
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 16,
            flex: 1,
            marginRight: 8,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>Remove</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClose}
          style={{
            backgroundColor: gray(0.85),
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 16,
            flex: 1,
            alignItems: "center",
          }}
        >
          <Text style={{ color: C.text, fontSize: 14, fontWeight: "600" }}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── shift cell ─────────────────────────────────────────────────────────────

function ShiftCell({ shift, isClosed, storeHoursDay, onAdd, onUpdate, onRemove }) {
  let [sShowPopover, _setShowPopover] = useState(false);
  let [sHover, _setHover] = useState(false);

  if (isClosed) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 60,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: gray(0.94),
          borderRadius: 6,
          margin: 2,
        }}
      >
        <Text style={{ fontSize: 11, color: gray(0.55), fontWeight: "500" }}>CLOSED</Text>
      </View>
    );
  }

  if (!shift) {
    return (
      <TouchableOpacity
        onPress={onAdd}
        onMouseEnter={() => _setHover(true)}
        onMouseLeave={() => _setHover(false)}
        style={{
          flex: 1,
          minHeight: 60,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: sHover ? "#e8f5e9" : gray(0.96),
          borderRadius: 6,
          margin: 2,
          borderWidth: 1,
          borderColor: sHover ? C.green : "transparent",
          borderStyle: "dashed",
          cursor: "pointer",
        }}
      >
        <Text style={{ fontSize: 24, color: sHover ? C.green : gray(0.5), fontWeight: "300" }}>+</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ flex: 1, margin: 2, position: "relative" }}>
      <TouchableOpacity
        onPress={() => _setShowPopover(!sShowPopover)}
        onMouseEnter={() => _setHover(true)}
        onMouseLeave={() => _setHover(false)}
        style={{
          minHeight: 60,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: sHover ? "#e3f2fd" : "#e8f5e9",
          borderRadius: 6,
          borderWidth: 1,
          borderColor: C.green,
          paddingVertical: 6,
          paddingHorizontal: 4,
          cursor: "pointer",
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>
          {formatTimeShort(shift.startTime)}
        </Text>
        <Text style={{ fontSize: 11, color: gray(0.45), fontWeight: "500" }}>to</Text>
        <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>
          {formatTimeShort(shift.endTime)}
        </Text>
      </TouchableOpacity>
      {sShowPopover && (
        <ShiftEditPopover
          shift={shift}
          onUpdate={(updated) => {
            onUpdate(updated);
          }}
          onRemove={() => {
            onRemove();
            _setShowPopover(false);
          }}
          onClose={() => _setShowPopover(false)}
        />
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
  let [sEditingCell, _setEditingCell] = useState(null);

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

  function handleAddShift(userID, dayIndex) {
    let day = getStoreHoursForDayIndex(storeHours, dayIndex);
    let startTime = day?.open || "9:00 AM";
    let endTime = day?.close || "5:00 PM";
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

  // week date range label
  let weekStartDay = dayjs(sWeekStart);
  let weekEndDay = weekStartDay.add(6, "day");
  let weekLabel =
    weekStartDay.format("MMM D") + " - " + weekEndDay.format("MMM D, YYYY");
  let isCurrentWeek = sWeekStart === getWeekStart(new Date());

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
              borderBottomColor: gray(0.12),
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
                  backgroundColor: gray(0.92),
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
                  backgroundColor: gray(0.92),
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
                onPress={handleCopyLastWeek}
                style={{
                  backgroundColor: C.green,
                  borderRadius: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  marginRight: 16,
                }}
              >
                <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>
                  Copy Last Week
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleExit}
                style={{
                  width: 40,
                  height: 40,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 20,
                  backgroundColor: gray(0.9),
                }}
              >
                <Image_ icon={ICONS.close1} size={16} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ─── grid ────────────────────────────────────────────────── */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
            {/* day header row */}
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              <View style={{ width: 120, paddingRight: 8 }} />
              {dayColumns.map((col) => (
                <View
                  key={col.dayIndex}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 8,
                    margin: 2,
                    backgroundColor: col.isClosed ? gray(0.94) : "#f0f7f0",
                    borderRadius: 8,
                    opacity: col.isClosed ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: col.isClosed ? gray(0.5) : C.text,
                    }}
                  >
                    {col.name} {col.date}
                  </Text>
                  {col.isClosed ? (
                    <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 2 }}>Closed</Text>
                  ) : (
                    <Text style={{ fontSize: 11, color: gray(0.45), marginTop: 2 }}>
                      {formatTimeShort(col.openTime)} - {formatTimeShort(col.closeTime)}
                    </Text>
                  )}
                </View>
              ))}
            </View>

            {/* employee rows */}
            {users.map((user) => (
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
                    width: 120,
                    justifyContent: "center",
                    paddingRight: 8,
                    paddingLeft: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
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
                        fontSize: 12,
                        color: gray(0.5),
                        fontWeight: "500",
                      }}
                      numberOfLines={1}
                    >
                      {user.last}
                    </Text>
                  )}
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
                      onAdd={() => handleAddShift(user.id, col.dayIndex)}
                      onUpdate={(updated) => handleUpdateShift(shiftKey, updated)}
                      onRemove={() => handleRemoveShift(shiftKey)}
                    />
                  );
                })}
              </View>
            ))}
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
