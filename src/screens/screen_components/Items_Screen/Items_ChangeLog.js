/* eslint-disable */

import { gray, deepEqual } from "../../../utils";
import { C, Fonts } from "../../../styles";
import { useOpenWorkordersStore } from "../../../stores";
import styles from "./Items_ChangeLog.module.css";

const DAY_NAMES = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ordinalSuffix(n) {
  if (n >= 11 && n <= 13) return "th";
  let last = n % 10;
  if (last === 1) return "st";
  if (last === 2) return "nd";
  if (last === 3) return "rd";
  return "th";
}

function formatTimestamp(millis) {
  let d = new Date(millis);
  let day = DAY_NAMES[d.getDay()];
  let month = MONTH_NAMES[d.getMonth()];
  let date = d.getDate();
  let hour = d.getHours();
  let amPM = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  let min = d.getMinutes().toString().padStart(2, "0");
  return day + ", " + month + " " + date + ordinalSuffix(date) + " " + hour + ":" + min + " " + amPM;
}

function formatTimestampFull(millis) {
  let d = new Date(millis);
  let day = DAY_NAMES[d.getDay()];
  let month = MONTH_NAMES[d.getMonth()];
  let date = d.getDate();
  let year = d.getFullYear();
  let hour = d.getHours();
  let amPM = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  let min = d.getMinutes().toString().padStart(2, "0");
  return day + ", " + month + " " + date + ordinalSuffix(date) + " " + year + " " + hour + ":" + min + " " + amPM;
}

function describeEntry(entry) {
  if (entry.field === "workorderLines") {
    if (entry.action === "added") return "added '" + entry.to + "' to line items";
    if (entry.action === "removed") return "removed '" + entry.from + "' from line items";
    if (entry.action === "changed") return "changed " + entry.detail + " on '" + entry.item + "' from '" + entry.from + "' to '" + entry.to + "'";
  }
  if (entry.field === "status") return "changed status from '" + entry.from + "' to '" + entry.to + "'";
  if (entry.field === "color1" || entry.field === "color2") {
    let label = entry.field === "color1" ? "primary color" : "secondary color";
    return "changed " + label + (entry.from ? " from '" + entry.from + "'" : "") + " to '" + entry.to + "'";
  }
  if (entry.field === "taxFree") return "changed tax exempt from '" + entry.from + "' to '" + entry.to + "'";
  let fieldLabel = entry.field === "partOrdered" ? "part ordered" : entry.field === "partSource" ? "part source" : entry.field;
  return "changed " + fieldLabel + (entry.from ? " from '" + entry.from + "'" : "") + " to '" + entry.to + "'";
}

function ChangeLogRow({ entry, index }) {
  return (
    <div
      className={styles.row}
      style={{
        backgroundColor: index % 2 === 0 ? C.listItemWhite : gray(0.06),
      }}
    >
      <div className={styles.timeCell} style={{ color: gray(0.45) }}>
        {formatTimestamp(entry.timestamp)}
      </div>
      <div className={styles.changeCell} style={{ color: C.text }}>
        <span className={styles.userName} style={{ fontWeight: Fonts.weight.textHeavy }}>
          {entry.user}
        </span>
        {"  "}
        {describeEntry(entry)}
      </div>
    </div>
  );
}

export function Items_ChangeLog() {
  const zWorkorder = useOpenWorkordersStore((state) => {
    let id = state.openWorkorderID;
    return state.workorders.find((o) => o.id === id);
  }, deepEqual);
  const zChangeLog = zWorkorder?.changeLog || [];

  let changeLog = zChangeLog.filter((e) => e && typeof e === "object" && e.timestamp);
  let sorted = [...changeLog].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.emptyText} style={{ color: gray(0.5) }}>
          No changes recorded
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Started info */}
      <div
        className={styles.headerBar}
        style={{
          backgroundColor: C.backgroundListWhite,
          borderBottomColor: C.buttonLightGreenOutline,
        }}
      >
        <div className={styles.headerLabel} style={{ color: gray(0.5) }}>
          {"Started: "}
          <span
            className={styles.headerValue}
            style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
          >
            {zWorkorder?.startedOnMillis ? formatTimestampFull(zWorkorder.startedOnMillis) : "N/A"}
          </span>
          {"   by "}
          <span
            className={styles.headerValue}
            style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
          >
            {zWorkorder?.startedBy || "Unknown"}
          </span>
        </div>
      </div>
      {/* Column headers */}
      <div
        className={styles.columnHeaderRow}
        style={{
          backgroundColor: C.listItemWhite,
          borderBottomColor: C.buttonLightGreenOutline,
        }}
      >
        <div
          className={styles.colTime}
          style={{ color: gray(0.45), fontWeight: Fonts.weight.textHeavy }}
        >
          Time
        </div>
        <div
          className={styles.colChange}
          style={{ color: gray(0.45), fontWeight: Fonts.weight.textHeavy }}
        >
          Change
        </div>
      </div>
      <div className={styles.list}>
        {sorted.map((item, index) => (
          <ChangeLogRow
            key={item.timestamp + "-" + index}
            entry={item}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}
