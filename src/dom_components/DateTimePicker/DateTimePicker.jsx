import React, { forwardRef } from "react";
import { DayPicker } from "react-day-picker";
import { C, Radius } from "../../styles";
import styles from "./DateTimePicker.module.css";
import "react-day-picker/style.css";

const DEFAULT_MODIFIERS_STYLES = {
  today: {
    borderColor: C.lightred,
    borderWidth: 2,
    borderStyle: "solid",
    borderRadius: Radius.pill,
  },
  selected: {
    borderRadius: Radius.pill,
    backgroundColor: C.blue,
    color: "white",
  },
};

export const DateTimePicker = forwardRef(function DateTimePicker(
  {
    range,
    handleDateRangeChange,
    onChange,
    month,
    onMonthChange,
    modifiersStyles,
    numberOfMonths,
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

  const mergedModifiersStyles = modifiersStyles
    ? { ...DEFAULT_MODIFIERS_STYLES, ...modifiersStyles }
    : DEFAULT_MODIFIERS_STYLES;

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
          month={month}
          onMonthChange={onMonthChange}
          numberOfMonths={numberOfMonths}
          modifiersStyles={mergedModifiersStyles}
        />
      </div>
    </div>
  );
});
