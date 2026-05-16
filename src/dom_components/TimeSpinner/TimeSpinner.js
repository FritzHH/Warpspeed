import React, { forwardRef, useMemo, useRef, useState, useCallback, useEffect } from "react";
import styles from "./TimeSpinner.module.css";

function generateTimes() {
  const times = [];
  for (let m = 0; m <= 12 * 60; m += 30) {
    let hours24 = Math.floor(m / 60);
    let minutes = m % 60;
    let period = hours24 < 12 ? "AM" : "PM";
    let hours12 = hours24 % 12;
    if (hours12 === 0) hours12 = 12;
    const label = `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
    times.push({ label, minutes: m });
  }
  return times;
}

export const TimeSpinner = forwardRef(function TimeSpinner(
  {
    onChange,
    initialMinutes = 0,
    itemHeight = 20,
    style = {},
    disabled = false,
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const times = useMemo(() => generateTimes(), []);
  const [selected, setSelected] = useState(initialMinutes);
  const listRef = useRef(null);
  const scrollTimeout = useRef(null);

  const containerHeight = itemHeight * 5;
  const initialIndex = times.findIndex((t) => t.minutes === initialMinutes);

  useEffect(() => {
    if (listRef.current && initialIndex > -1) {
      listRef.current.scrollTop = initialIndex * itemHeight;
    }
  }, [initialIndex, itemHeight]);

  const handleScroll = useCallback(() => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      if (!listRef.current) return;
      const y = listRef.current.scrollTop;
      const idx = Math.round(y / itemHeight);
      const clamped = Math.max(0, Math.min(times.length - 1, idx));
      listRef.current.scrollTo({ top: clamped * itemHeight, behavior: "smooth" });
      setSelected(times[clamped].minutes);
      onChange?.(times[clamped]);
    }, 80);
  }, [times, itemHeight, onChange]);

  useEffect(() => {
    return () => { if (scrollTimeout.current) clearTimeout(scrollTimeout.current); };
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.container} ${className}`}
      style={{ height: containerHeight, ...style }}
      role="listbox"
      aria-label={ariaLabel || "Time selector"}
      aria-disabled={disabled || undefined}
      data-testid={testId}
    >
      <div
        ref={listRef}
        className={styles.list}
        style={{ height: containerHeight }}
        onScroll={handleScroll}
      >
        {times.map((item) => {
          const isSelected = item.minutes === selected;
          return (
            <div
              key={item.minutes}
              className={styles.item}
              style={{ height: itemHeight }}
              onClick={() => {
                if (disabled) return;
                setSelected(item.minutes);
                onChange?.(item);
                if (listRef.current) {
                  const idx = times.indexOf(item);
                  listRef.current.scrollTo({ top: idx * itemHeight, behavior: "smooth" });
                }
              }}
              role="option"
              aria-selected={isSelected}
            >
              <span className={isSelected ? styles.selectedText : styles.text}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className={styles.selector}
        style={{ top: containerHeight / 2 - itemHeight / 2, height: itemHeight }}
      />
    </div>
  );
});
