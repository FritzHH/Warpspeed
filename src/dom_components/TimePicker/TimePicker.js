import React, { forwardRef, useState, useRef, useEffect, useCallback } from "react";
import { ICONS } from "../../styles";
import { gray } from "../../utils";
import styles from "./TimePicker.module.css";

const ITEM_H = 36;
const VISIBLE = 7;
const PAD = Math.floor(VISIBLE / 2);
const COL_W = 64;

function ScrollColumn({ items, selected, setter, formatFn, initialValue }) {
  const ref = useRef(null);
  const ready = useRef(false);
  const timer = useRef(null);
  const selIdx = items.indexOf(selected);

  useEffect(() => {
    if (ref.current && !ready.current) {
      ready.current = true;
      const idx = items.indexOf(initialValue);
      ref.current.scrollTop = Math.max(0, idx) * ITEM_H;
    }
  }, []);

  const handleScroll = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!ref.current) return;
      const y = ref.current.scrollTop;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
      ref.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
      setter(items[idx]);
    }, 75);
  }, [items, setter]);

  const nudge = (dir) => {
    const idx = items.indexOf(selected) + dir;
    if (idx >= 0 && idx < items.length) {
      ref.current?.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
      setter(items[idx]);
    }
  };

  return (
    <div className={styles.column} style={{ width: COL_W }}>
      <div className={styles.nudge} style={{ width: COL_W }} onClick={() => nudge(-1)}>▲</div>
      <div className={styles.scrollArea} style={{ height: ITEM_H * VISIBLE }}>
        <div
          ref={ref}
          className={styles.scrollInner}
          style={{ paddingTop: ITEM_H * PAD, paddingBottom: ITEM_H * PAD }}
          onScroll={handleScroll}
        >
          {items.map((item, i) => (
            <div
              key={i}
              className={styles.scrollItem}
              style={{ height: ITEM_H }}
              onClick={() => {
                ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
                setter(item);
              }}
            >
              <span style={{
                fontSize: i === selIdx ? 19 : 17,
                fontWeight: i === selIdx ? "600" : "400",
                color: i === selIdx ? "#fff" : gray(0.55),
              }}>
                {formatFn(item)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.nudge} style={{ width: COL_W }} onClick={() => nudge(1)}>▼</div>
    </div>
  );
}

export const TimePicker = forwardRef(function TimePicker(
  {
    initialHour = 12,
    initialMinute = 0,
    initialPeriod = "PM",
    onConfirm,
    onCancel,
    style = {},
    disabled = false,
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const [period, setPeriod] = useState(initialPeriod);

  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const mins = [];
  for (let i = 0; i < 60; i++) mins.push(i);

  const confirmResult = () => {
    const h24 = period === "PM" ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
    onConfirm?.({ hour, minute, period, totalMinutes: h24 * 60 + minute });
  };

  const resolveIcon = (icon) => typeof icon === "object" ? icon.default || icon : icon;

  return (
    <div
      ref={ref}
      className={`${styles.container} ${className}`}
      style={{ width: COL_W * 3 + 16, ...style }}
      role="group"
      aria-label={ariaLabel || "Time picker"}
      data-testid={testId}
    >
      <div className={styles.columnsWrapper}>
        <div className={styles.highlight} style={{ top: 22 + PAD * ITEM_H, height: ITEM_H }} />
        <div className={styles.columns}>
          <ScrollColumn items={hours} selected={hour} setter={setHour} formatFn={String} initialValue={initialHour} />
          <ScrollColumn items={mins} selected={minute} setter={setMinute} formatFn={(m) => String(m).padStart(2, "0")} initialValue={initialMinute} />

          {/* AM/PM column */}
          <div className={styles.column} style={{ width: COL_W }}>
            <div style={{ height: 22 }} />
            <div className={styles.scrollArea} style={{ height: ITEM_H * VISIBLE }}>
              <div style={{ marginTop: period === "AM" ? PAD * ITEM_H : (PAD - 1) * ITEM_H }}>
                <div
                  className={styles.scrollItem}
                  style={{ height: ITEM_H }}
                  onClick={() => setPeriod("AM")}
                >
                  <span style={{
                    fontSize: period === "AM" ? 19 : 17,
                    fontWeight: period === "AM" ? "600" : "400",
                    color: period === "AM" ? "#fff" : gray(0.55),
                  }}>AM</span>
                </div>
                <div
                  className={styles.scrollItem}
                  style={{ height: ITEM_H }}
                  onClick={() => setPeriod("PM")}
                >
                  <span style={{
                    fontSize: period === "PM" ? 19 : 17,
                    fontWeight: period === "PM" ? "600" : "400",
                    color: period === "PM" ? "#fff" : gray(0.55),
                  }}>PM</span>
                </div>
              </div>
            </div>
            <div style={{ height: 22 }} />
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.footerBtn} onClick={confirmResult} aria-label="Confirm">
          <img src={resolveIcon(ICONS.check)} alt="" style={{ width: 27, height: 27 }} />
        </button>
        <button className={styles.footerBtn} onClick={onCancel} aria-label="Cancel">
          <img src={resolveIcon(ICONS.close1)} alt="" style={{ width: 23, height: 23 }} />
        </button>
      </div>
    </div>
  );
});
