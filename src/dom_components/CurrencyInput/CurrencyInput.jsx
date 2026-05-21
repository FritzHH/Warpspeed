import React, { useState } from "react";
import { formatCurrencyDisp, usdTypeMask } from "../../utils";

export const CurrencyInput = ({
  cents = 0,
  onChangeCents,
  placeholder = "$0.00",
  className = "",
  style = {},
  autoFocus = false,
  disabled = false,
  "aria-label": ariaLabel,
  "data-testid": testId,
}) => {
  const [sFocused, setFocused] = useState(false);
  const [sLocalDisplay, setLocalDisplay] = useState("");

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      style={style}
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-testid={testId}
      value={sFocused ? sLocalDisplay : formatCurrencyDisp(cents)}
      onFocus={() => {
        setFocused(true);
        setLocalDisplay("");
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        const { display, cents: newCents } = usdTypeMask(digits);
        setLocalDisplay(display);
        if (onChangeCents) onChangeCents(newCents);
      }}
    />
  );
};
