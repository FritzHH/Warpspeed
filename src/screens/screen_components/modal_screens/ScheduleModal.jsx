/*eslint-disable*/
import React, { useState, useRef, useCallback } from "react";
import cloneDeep from "lodash/cloneDeep";
import debounce from "lodash/debounce";
import dayjs from "dayjs";
import { C, ICONS } from "../../../styles";
import { trimToTwoDecimals } from "../../../utils";
import {
  Image,
  TouchableOpacity,
  Button,
  Dialog,
  TimePicker,
  ModalFooter,
  ModalFooterButton,
} from "../../../dom_components";
import { useSettingsStore, useAlertScreenStore } from "../../../stores";
import { getWeekStart, getStoreHoursForDayIndex, parseTime, formatTimeShort } from "./scheduleUtils";
import styles from "./ScheduleModal.module.css";

// ─── helpers ────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatTime(hour, minute, period) {
  return `${hour}:${String(minute).padStart(2, "0")} ${period}`;
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

function pickerCoords(e) {
  let x = e.pageX ?? 0;
  let y = e.pageY ?? 0;
  let left = x - PICKER_W / 2;
  let top = y - PICKER_H + 40;
  let vw = window.innerWidth;
  let vh = window.innerHeight;
  if (left < 8) left = 8;
  if (left + PICKER_W > vw - 8) left = vw - PICKER_W - 8;
  if (top < 8) top = 8;
  if (top + PICKER_H > vh - 8) top = vh - PICKER_H - 8;
  return { left, top };
}

function ShiftCell({ shift, isClosed, storeHoursDay, onAddWithTimes, onUpdate, onRemove, isPastWeek }) {
  let [sPickerFor, _setPickerFor] = useState(null);
  let [sPickerPos, _setPickerPos] = useState(null);

  if (isClosed) {
    return (
      <div className={`${styles.shiftCell} ${styles.shiftCellClosed}`}>
        <span className={styles.shiftCellClosedText}>CLOSED</span>
      </div>
    );
  }

  let defaultStart = parseTime(storeHoursDay?.openTime || "9:00 AM");
  let defaultEnd = parseTime(storeHoursDay?.closeTime || "5:00 PM");
  let hasShift = !!shift;

  let inInitial = hasShift ? parseTime(shift.startTime) : defaultStart;
  let outInitial = hasShift ? parseTime(shift.endTime) : defaultEnd;

  let filledBg = isPastWeek ? C.textMuted : C.textSecondary;

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
    _setPickerPos(null);
  }

  if (isPastWeek && !hasShift) {
    return (
      <div className={`${styles.shiftCell} ${styles.shiftCellEmpty}`}>
        <span className={styles.pastEmptyText}>-</span>
      </div>
    );
  }

  if (isPastWeek && hasShift) {
    return (
      <div className={`${styles.shiftCell} ${styles.shiftCellPastFilled}`}>
        <div className={styles.timeBox} style={{ backgroundColor: filledBg }}>
          <span className={styles.timeBtnText}>{formatTimeShort(shift.startTime)}</span>
        </div>
        <div className={`${styles.timeBox} ${styles.timeBoxLast}`} style={{ backgroundColor: filledBg }}>
          <span className={styles.timeBtnText}>{formatTimeShort(shift.endTime)}</span>
        </div>
      </div>
    );
  }

  let cellClass = hasShift
    ? `${styles.shiftCell} ${styles.shiftCellHasShift}`
    : `${styles.shiftCell} ${styles.shiftCellEditable}`;

  return (
    <div className={cellClass} style={hasShift ? { borderColor: C.green } : undefined}>
      {hasShift && (
        <button className={styles.removeBtn} onClick={onRemove}>
          <span className={styles.removeBtnText}>x</span>
        </button>
      )}
      <button
        className={`${styles.timeBox} ${styles.timeBtn}`}
        style={{ backgroundColor: hasShift ? filledBg : C.green }}
        onClick={(e) => {
          _setPickerPos(pickerCoords(e));
          _setPickerFor("in");
        }}
      >
        <span className={styles.timeBtnText}>
          {hasShift ? formatTimeShort(shift.startTime) : "In"}
        </span>
      </button>
      <button
        className={`${styles.timeBox} ${styles.timeBoxLast} ${styles.timeBtn}`}
        style={{ backgroundColor: hasShift ? filledBg : C.blue }}
        onClick={(e) => {
          _setPickerPos(pickerCoords(e));
          _setPickerFor("out");
        }}
      >
        <span className={styles.timeBtnText}>
          {hasShift ? formatTimeShort(shift.endTime) : "Out"}
        </span>
      </button>
      {!!sPickerFor && sPickerPos && (
        <div
          className={styles.pickerBackdrop}
          onClick={() => {
            _setPickerFor(null);
            _setPickerPos(null);
          }}
        >
          <div
            className={styles.pickerWrap}
            style={{ left: sPickerPos.left, top: sPickerPos.top }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className={styles.pickerTitle}>
              {sPickerFor === "in" ? "Clock In Time" : "Clock Out Time"}
            </span>
            <TimePicker
              initialHour={sPickerFor === "in" ? inInitial.hour : outInitial.hour}
              initialMinute={sPickerFor === "in" ? inInitial.minute : outInitial.minute}
              initialPeriod={sPickerFor === "in" ? inInitial.period : outInitial.period}
              onConfirm={handlePickerConfirm}
              onCancel={() => {
                _setPickerFor(null);
                _setPickerPos(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
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

  let weekStartDay = dayjs(sWeekStart);
  let weekEndDay = weekStartDay.add(6, "day");
  let weekLabel =
    weekStartDay.format("MMM D") + " - " + weekEndDay.format("MMM D, YYYY");
  let currentWeekStart = getWeekStart(new Date());
  let isCurrentWeek = sWeekStart === currentWeekStart;
  let isPastWeek = sWeekStart < currentWeekStart;

  let dayColumns = [];
  for (let i = 0; i < 7; i++) {
    let dayIndex = i + 1;
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
    <Dialog visible={true} onClose={handleExit} title="Schedule">
      <div
        style={{
          width: "92%",
          height: "94%",
          backgroundColor: C.backgroundWhite,
          borderRadius: 15,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        {/* ─── header ──────────────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.navBtn} onClick={() => navigateWeek(-1)} style={{ color: C.text }}>
              {"<"}
            </button>
            <span className={styles.weekLabel} style={{ color: C.text }}>
              {weekLabel}
            </span>
            <button className={styles.navBtn} onClick={() => navigateWeek(1)} style={{ color: C.text }}>
              {">"}
            </button>
            {!isCurrentWeek && (
              <Button
                text="Today"
                onPress={goToToday}
                buttonStyle={{
                  marginLeft: 16,
                  backgroundColor: C.blue,
                  borderRadius: 8,
                  paddingTop: 8,
                  paddingBottom: 8,
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
                textStyle={{ color: "white", fontSize: 14, fontWeight: "700" }}
              />
            )}
          </div>

          <div className={styles.headerRight}>
            <Button
              text="Copy Last Week"
              onPress={handleCopyLastWeek}
              enabled={!isPastWeek}
              buttonStyle={{
                backgroundColor: C.green,
                borderRadius: 8,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 18,
                paddingRight: 18,
                marginRight: 16,
                opacity: isPastWeek ? 0.4 : 1,
              }}
              textStyle={{ color: "white", fontSize: 14, fontWeight: "700" }}
            />
            <Button
              text="Copy Forward"
              onPress={handleCopyForward}
              enabled={!isPastWeek}
              buttonStyle={{
                backgroundColor: C.orange,
                borderRadius: 8,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 18,
                paddingRight: 18,
                marginRight: 16,
                opacity: isPastWeek ? 0.4 : 1,
              }}
              textStyle={{ color: "white", fontSize: 14, fontWeight: "700" }}
            />
          </div>
        </div>

        {/* ─── grid ────────────────────────────────────────────────── */}
        <div className={styles.gridScroll}>
          {/* day header row */}
          <div className={styles.dayHeaderRow}>
            <div className={styles.dayHeaderSpacer} />
            {dayColumns.map((col) => (
              <div
                key={col.dayIndex}
                className={`${styles.dayHeaderCell} ${col.isClosed ? styles.dayHeaderCellClosed : ""}`}
                style={{ backgroundColor: col.isClosed ? C.borderSubtle : C.blue }}
              >
                <span
                  className={styles.dayHeaderName}
                  style={{ color: col.isClosed ? C.textMuted : C.textOnAccent }}
                >
                  {col.name} {col.date}
                </span>
                {col.isClosed ? (
                  <span className={styles.dayHeaderHours} style={{ color: C.textMuted }}>
                    Closed
                  </span>
                ) : (
                  <span className={styles.dayHeaderHours} style={{ color: "rgba(255,255,255,0.75)" }}>
                    {formatTimeShort(col.openTime)} - {formatTimeShort(col.closeTime)}
                  </span>
                )}
              </div>
            ))}
            {sShowPay && (
              <div className={styles.payCol}>
                <span className={styles.payColHeaderText} style={{ color: C.text }}>Pay</span>
              </div>
            )}
          </div>

          {/* employee rows */}
          {users.map((user) => {
            let weekHours = getUserWeekHours(user.id, sShifts);
            let wage = Number(user.hourlyWage) || 0;
            let weekPay = trimToTwoDecimals(weekHours * wage);
            return (
              <div key={user.id} className={styles.employeeRow}>
                <div className={styles.employeeNameCol}>
                  <span className={styles.employeeFirst} style={{ color: C.text }}>
                    {user.first}
                  </span>
                  {!!user.last && (
                    <span className={styles.employeeLast}>{user.last}</span>
                  )}
                  <span className={styles.employeeHours}>
                    {trimToTwoDecimals(weekHours)}
                  </span>
                </div>

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
                  <div className={styles.payCol}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                      ${weekPay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* ─── summary row ──────────────────────────────────────── */}
          <div className={styles.summaryRow}>
            <div className={styles.summaryLabelCol}>
              <span className={styles.summaryLabel} style={{ color: C.text }}>Total</span>
            </div>
            <div className={styles.summaryHoursCol}>
              <span className={styles.summaryHoursText}>
                {totalHours} scheduled
              </span>
            </div>
            {sShowPay && (
              <div className={styles.payCol}>
                <span className={styles.summaryPay} style={{ color: C.text }}>
                  ${totalPay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <Button
              text={sShowPay ? "Hide Pay" : "Show Pay"}
              onPress={() => _setShowPay(!sShowPay)}
              buttonStyle={{
                backgroundColor: sShowPay ? "rgb(180,180,180)" : "rgb(103,124,231)",
                borderRadius: 8,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 14,
                paddingRight: 14,
                marginLeft: 12,
              }}
              textStyle={{ color: "white", fontSize: 13, fontWeight: "700" }}
            />
          </div>
        </div>
        <ModalFooter>
          <ModalFooterButton onClick={handleExit}>Close</ModalFooterButton>
        </ModalFooter>
      </div>
    </Dialog>
  );
}
