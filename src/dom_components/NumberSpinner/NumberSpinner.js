import React, { forwardRef, useRef, useState, useEffect, useCallback } from "react";
import styles from "./NumberSpinner.module.css";

const ITEM_HEIGHT = 48;
const pad = (n, len = 2) => n.toString().padStart(len, "0");

export const NumberSpinner = forwardRef(function NumberSpinner(
  {
    min = 0,
    max = 100,
    value = 0,
    onChange,
    width = 80,
    visibleItems = 5,
    padZero = false,
    disabled = false,
    style = {},
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const scrollRef = useRef(null);
  const [selected, setSelected] = useState(value);
  const scrollTimeout = useRef(null);

  const numbers = [];
  for (let i = min; i <= max; i++) numbers.push(i);

  const padCount = Math.floor(visibleItems / 2);
  const containerHeight = ITEM_HEIGHT * visibleItems;

  useEffect(() => {
    if (scrollRef.current) {
      const idx = Math.max(0, value - min);
      scrollRef.current.scrollTop = idx * ITEM_HEIGHT;
      setSelected(value);
    }
  }, [value, min, max]);

  const handleScroll = useCallback(() => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const y = scrollRef.current.scrollTop;
      const idx = Math.round(y / ITEM_HEIGHT);
      const clampedIdx = Math.max(0, Math.min(numbers.length - 1, idx));
      scrollRef.current.scrollTo({ top: clampedIdx * ITEM_HEIGHT, behavior: "smooth" });
      setSelected(numbers[clampedIdx]);
      onChange?.(numbers[clampedIdx]);
    }, 80);
  }, [numbers, onChange]);

  useEffect(() => {
    return () => { if (scrollTimeout.current) clearTimeout(scrollTimeout.current); };
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.container} ${className}`}
      style={{ width, height: containerHeight, ...style }}
      role="spinbutton"
      aria-valuenow={selected}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-testid={testId}
    >
      <div
        ref={scrollRef}
        className={styles.scrollArea}
        style={{
          height: containerHeight,
          width,
          paddingTop: ITEM_HEIGHT * padCount,
          paddingBottom: ITEM_HEIGHT * padCount,
        }}
        onScroll={handleScroll}
      >
        {numbers.map((num) => {
          const distance = Math.abs(num - selected);
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : 0.3;
          return (
            <div
              key={num}
              className={styles.item}
              style={{ height: ITEM_HEIGHT, width, opacity }}
            >
              <span
                className={styles.itemText}
                style={{
                  fontWeight: num === selected ? "bold" : "normal",
                  fontSize: num === selected ? 26 : 20,
                  color: num === selected ? "#333" : "#999",
                }}
              >
                {padZero ? pad(num) : num}
              </span>
            </div>
          );
        })}
      </div>
      <div className={styles.highlight} style={{ height: ITEM_HEIGHT }} />
    </div>
  );
});
