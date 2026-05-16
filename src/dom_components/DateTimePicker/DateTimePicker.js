import React, { forwardRef } from "react";
import { DayPicker } from "react-day-picker";
import { C } from "../../styles";
import styles from "./DateTimePicker.module.css";
import "react-day-picker/style.css";

export const DateTimePicker = forwardRef(function DateTimePicker(
  {
    range,
    handleDateRangeChange,
    onChange,
    style = {},
    className = "",
    disabled = false,
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const handler = handleDateRangeChange || onChange;

  const selected = range
    ? { from: range.startDate ? new Date(range.startDate) : undefined, to: range.endDate ? new Date(range.endDate) : undefined }
    : undefined;

  const handleSelect = (rangeValue) => {
    if (!handler) return;
    handler({
      startDate: rangeValue?.from || null,
      endDate: rangeValue?.to || rangeValue?.from || null,
    });
  };

  return (
    <div
      ref={ref}
      className={`${styles.container} ${className}`}
      style={style}
      aria-label={ariaLabel || "Date range picker"}
      data-testid={testId}
    >
      <div className={styles.inner}>
        <DayPicker
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          disabled={disabled}
          modifiersStyles={{
            today: {
              borderColor: C.lightred,
              borderWidth: 2,
              borderStyle: "solid",
              borderRadius: "50%",
            },
            selected: {
              borderRadius: "50%",
              backgroundColor: C.blue,
              color: "white",
            },
          }}
        />
      </div>
    </div>
  );
});
