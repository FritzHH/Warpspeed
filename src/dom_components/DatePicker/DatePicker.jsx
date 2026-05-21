import React, { forwardRef, useState, useRef, useEffect, useCallback } from "react";
import { C, ICONS } from "../../styles";

import styles from "./DatePicker.module.css";

const ITEM_H = 36;
const VISIBLE = 7;
const PAD = Math.floor(VISIBLE / 2);
const COL_W = 64;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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
                color: i === selIdx ? C.textOnAccent : C.textMuted,
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

export const DatePicker = forwardRef(function DatePicker(
  {
    initialMonth = new Date().getMonth() + 1,
    initialDay = new Date().getDate(),
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
  const [month, setMonth] = useState(initialMonth);
  const [day, setDay] = useState(initialDay);

  const months = [];
  for (let i = 1; i <= 12; i++) months.push(i);

  const maxDay = DAYS_IN_MONTH[month - 1] || 31;
  const days = [];
  for (let i = 1; i <= maxDay; i++) days.push(i);

  useEffect(() => {
    if (day > maxDay) setDay(maxDay);
  }, [month]);

  const resolveIcon = (icon) => typeof icon === "object" ? icon.default || icon : icon;

  return (
    <div
      ref={ref}
      className={`${styles.container} ${className}`}
      style={{ width: COL_W * 2 + 16, ...style }}
      role="group"
      aria-label={ariaLabel || "Date picker"}
      data-testid={testId}
    >
      <div className={styles.columnsWrapper}>
        <div className={styles.highlight} style={{ top: 22 + PAD * ITEM_H, height: ITEM_H }} />
        <div className={styles.columns}>
          <ScrollColumn items={months} selected={month} setter={setMonth} formatFn={(m) => MONTH_NAMES[m - 1]} initialValue={initialMonth} />
          <ScrollColumn items={days} selected={day} setter={setDay} formatFn={String} initialValue={initialDay} />
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.footerBtn} onClick={() => onConfirm?.({ month, day })} aria-label="Confirm">
          <img src={resolveIcon(ICONS.check)} alt="" style={{ width: 27, height: 27 }} />
        </button>
        <button className={styles.footerBtn} onClick={onCancel} aria-label="Cancel">
          <img src={resolveIcon(ICONS.close1)} alt="" style={{ width: 23, height: 23 }} />
        </button>
      </div>
    </div>
  );
});
