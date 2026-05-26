import React, { forwardRef, useState, useRef, useCallback, useEffect, useImperativeHandle } from "react";
import ReactDOM from "react-dom";
import { C, ICONS } from "../../styles";
import { lightenRGBByPercent, ifNumIsOdd, usdTypeMask } from "../../utils";
import { DISCOUNT_TYPES } from "../../constants";
import styles from "./DropdownMenu.module.css";
import { useZ } from "../../hooks/useZ";

const VIEWPORT_PAD = 10;
const SYSTEM_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", sans-serif';

const CustomDiscountInput = ({ label, onApply, maxLength = 3, maxVal, currencyMode = false, maxCents = 0 }) => {
  const [val, setVal] = useState("");
  const [cents, setCents] = useState(0);

  const submit = () => {
    if (currencyMode) {
      if (!cents) return;
      onApply(cents);
      setVal("");
      setCents(0);
    } else {
      const num = Number(val);
      if (!num) return;
      setVal("");
      onApply(num);
    }
  };

  return (
    <div className={styles.customInputRow} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <span className={styles.customInputLabel} style={{ color: C.textMuted }}>{label}</span>
      <input
        className={`${styles.customInput} ${currencyMode ? styles.customInputWide : ""}`}
        value={val}
        placeholder={currencyMode ? "0.00" : "0"}
        maxLength={currencyMode ? undefined : maxLength}
        onChange={(e) => {
          const v = e.target.value;
          if (currencyMode) {
            let result = usdTypeMask(v);
            if (maxCents && result.cents > maxCents) result = usdTypeMask(String(maxCents));
            setVal(result.display);
            setCents(result.cents);
          } else {
            let cleaned = v.replace(/[^0-9]/g, "");
            if (maxVal && Number(cleaned) > maxVal) cleaned = String(maxVal);
            setVal(cleaned);
          }
        }}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        style={{ borderColor: C.buttonLightGreenOutline, color: C.text }}
      />
      <button className={styles.customSubmit} onClick={submit} aria-label="Apply">
        <img src={typeof ICONS.check1 === "object" ? ICONS.check1.default || ICONS.check1 : ICONS.check1} alt="" style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
};

export const DropdownMenu = forwardRef(function DropdownMenu(
  {
    enabled = true,
    dataArr = [],
    onSelect,
    open: openProp,
    onOpenChange,
    buttonIcon,
    buttonIconSize,
    itemTextStyle = {},
    itemStyle = {},
    buttonStyle = {},
    buttonTextStyle = {},
    buttonText,
    menuButtonStyle = { borderRadius: 5 },
    matchValue,
    preserveItemBackground = false,
    selectedItemOpacity = 0.55,
    useSelectedAsButtonTitle = false,
    menuMaxHeight,
    menuBorderColor,
    isDiscountMenu = false,
    discountMaxCents = 0,
    itemTextAlign = "center",
    itemSeparatorStyle = {},
    disabled = false,
    portal = true,
    className = "",
    buttonClassName = "",
    buttonTextClassName = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : internalOpen;
  const z = useZ("dropdown", isOpen);
  const [menuPos, setMenuPos] = useState({ anchorCenterX: 0, anchorBottom: 10, anchorWidth: 0 });
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const anchorRef = useRef(null);
  const menuRef = useRef(null);

  const isDisabled = disabled || enabled === false;

  function setOpen(val) {
    if (!isControlled) setInternalOpen(val);
    onOpenChange?.(val);
    if (!val) setFocusedIdx(-1);
  }

  useImperativeHandle(ref, () => ({
    open: () => { calcPosition(); setOpen(true); },
    close: () => setOpen(false),
    toggle: () => { if (!isOpen) calcPosition(); setOpen(!isOpen); },
  }));

  function calcPosition() {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setMenuPos({
      anchorCenterX: rect.left + rect.width / 2,
      anchorBottom: rect.bottom + 4,
      anchorWidth: rect.width,
    });
  }

  const discountRows = isDiscountMenu ? [
    { _isDivider: true },
    {
      _isCustomInput: true,
      component: (
        <CustomDiscountInput label="Custom %" maxLength={3} maxVal={100} onApply={(num) => {
          setOpen(false);
          onSelect({ _customDiscount: { id: "custom_" + Date.now(), name: num + "% Off", value: String(num), type: DISCOUNT_TYPES.percent, custom: true } });
        }} />
      ),
    },
    {
      _isCustomInput: true,
      component: (
        <CustomDiscountInput label="Custom $" currencyMode maxCents={discountMaxCents || 99900} onApply={(cents) => {
          setOpen(false);
          const dollars = (cents / 100).toFixed(2);
          onSelect({ _customDiscount: { id: "custom_" + Date.now(), name: "$" + dollars + " Off", value: String(cents), type: DISCOUNT_TYPES.dollar, custom: true } });
        }} />
      ),
    },
  ] : [];

  const fullDataArr = [...dataArr, ...discountRows];
  const selectableItems = fullDataArr.filter((item) => !item._isDivider && !item._isCustomInput && !item.component && !item.disabled);
  const br = menuButtonStyle.borderRadius || 5;

  const matchNorm = matchValue == null || matchValue === ""
    ? null
    : String(matchValue).trim().toLowerCase();
  const effectiveSelectedIdx = matchNorm == null
    ? -1
    : dataArr.findIndex((item) => {
        if (item && typeof item === "object") {
          if (item.id != null && String(item.id).toLowerCase() === matchNorm) return true;
          if (typeof item.label === "string" && item.label.toLowerCase() === matchNorm) return true;
          return false;
        }
        return typeof item === "string" && item.toLowerCase() === matchNorm;
      });

  const resolvedItemStyle = {
    ...itemStyle,
    ...(itemStyle.paddingVertical != null ? { paddingTop: itemStyle.paddingVertical, paddingBottom: itemStyle.paddingVertical } : {}),
    ...(itemStyle.paddingHorizontal != null ? { paddingLeft: itemStyle.paddingHorizontal, paddingRight: itemStyle.paddingHorizontal } : {}),
  };
  delete resolvedItemStyle.paddingVertical;
  delete resolvedItemStyle.paddingHorizontal;

  const resolvedIcon = buttonIcon === undefined ? ICONS.menu2 : buttonIcon;
  const resolvedIconSrc = resolvedIcon ? (typeof resolvedIcon === "object" ? resolvedIcon.default || resolvedIcon : resolvedIcon) : null;
  const resolvedIconSize = buttonIconSize || 11;
  const displayText = useSelectedAsButtonTitle ? (dataArr[effectiveSelectedIdx]?.label || buttonText) : buttonText;

  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((prev) => Math.min(prev + 1, selectableItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && focusedIdx >= 0) {
      e.preventDefault();
      setOpen(false);
      onSelect(selectableItems[focusedIdx], focusedIdx);
    }
  }, [isOpen, focusedIdx, selectableItems]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e) => {
      const t = e.target;
      if (anchorRef.current && anchorRef.current.contains(t)) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      setOpen(false);
    };
    // Capture-phase listener: stop pointerdowns inside the menu from reaching
    // Radix's DismissableLayer handler (which calls preventDefault on outside
    // events and blocks input focus inside portaled menu content).
    const onPointerDownCapture = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) {
        e.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen]);

  function getItemBg(rgbString = "", index) {
    if (!rgbString) return null;
    if (preserveItemBackground || ifNumIsOdd(index) || !rgbString.includes("rgb")) return rgbString;
    return lightenRGBByPercent(rgbString, 40);
  }

  function itemBorderRadius(idx) {
    const isFirst = idx === 0;
    const isLast = idx === fullDataArr.length - 1;
    return {
      borderTopLeftRadius: isFirst ? br : 0,
      borderTopRightRadius: isFirst ? br : 0,
      borderBottomLeftRadius: isLast ? br : 0,
      borderBottomRightRadius: isLast ? br : 0,
    };
  }

  const triggerStyle = {
    backgroundColor: C.buttonLightGreen,
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 5,
    ...buttonStyle,
    ...(buttonStyle.paddingVertical != null ? { paddingTop: buttonStyle.paddingVertical, paddingBottom: buttonStyle.paddingVertical } : {}),
    ...(buttonStyle.paddingHorizontal != null ? { paddingLeft: buttonStyle.paddingHorizontal, paddingRight: buttonStyle.paddingHorizontal } : {}),
  };
  delete triggerStyle.paddingVertical;
  delete triggerStyle.paddingHorizontal;

  return (
    <div style={{ display: "flex", flex: 1 }}>
      <div
        ref={anchorRef}
        className={`${styles.trigger} ${displayText ? styles.triggerHasText : ""} ${isDisabled ? styles.disabled : ""} ${className} ${buttonClassName}`}
        style={triggerStyle}
        onClick={() => { if (!isDisabled) { calcPosition(); setOpen(!isOpen); } }}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel || displayText}
        aria-disabled={isDisabled || undefined}
        tabIndex={isDisabled ? -1 : 0}
        data-testid={testId}
        onKeyDown={(e) => {
          if (!isDisabled && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
            e.preventDefault();
            calcPosition();
            setOpen(true);
          }
        }}
      >
        {!!resolvedIconSrc && (
          <img
            className={styles.triggerIcon}
            src={resolvedIconSrc}
            style={{ width: resolvedIconSize, height: resolvedIconSize, marginRight: displayText ? 6 : 0 }}
            draggable={false}
            alt=""
          />
        )}
        {displayText && (
          <span
            className={`${styles.triggerText} ${buttonTextClassName}`}
            style={{ color: C.textMuted, fontFamily: SYSTEM_FONT, ...buttonTextStyle }}
          >
            {displayText}
          </span>
        )}
      </div>

      {isOpen && (() => {
        const menuNode = (
        <div
            ref={(el) => {
              menuRef.current = el;
              if (!el) return;
              const h = el.scrollHeight;
              const w = el.offsetWidth;
              const vp = window.innerHeight;
              let top = menuPos.anchorBottom || VIEWPORT_PAD;
              if (top + h > vp - VIEWPORT_PAD) top = Math.max(VIEWPORT_PAD, vp - VIEWPORT_PAD - Math.min(h, vp - VIEWPORT_PAD * 2));
              let left = (menuPos.anchorCenterX || 0) - w / 2;
              if (left + w > window.innerWidth - VIEWPORT_PAD) left = window.innerWidth - VIEWPORT_PAD - w;
              if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
              el.style.top = top + "px";
              el.style.left = left + "px";
            }}
            className={styles.menu}
            style={{
              zIndex: z,
              borderColor: menuBorderColor || C.borderSubtle,
              borderRadius: br,
              minWidth: menuPos.anchorWidth || undefined,
              maxHeight: menuMaxHeight || "calc(100vh - 20px)",
              pointerEvents: "auto",
            }}
            role="listbox"
            data-dropdown-menu-portal=""
          >
            {fullDataArr.map((item, idx) => {
              if (item._isDivider) {
                return <div key={"div_" + idx} style={{ height: 1, backgroundColor: C.borderSubtle, width: "100%" }} />;
              }

              if (item._isCustomInput || item.component) {
                return (
                  <div
                    key={"cmp_" + idx}
                    style={{
                      display: "flex",
                      height: 40,
                      backgroundColor: lightenRGBByPercent(C.blue, 60),
                      ...itemBorderRadius(idx),
                    }}
                  >
                    {item.component}
                  </div>
                );
              }

              const isFocused = selectableItems.indexOf(item) === focusedIdx;
              const isSelected = idx === effectiveSelectedIdx;
              const isItemDisabled = !!item.disabled;
              return (
                <div
                  key={item.id ?? item.label ?? idx}
                  className={styles.item}
                  style={{
                    position: "relative",
                    paddingRight: isSelected ? 28 : undefined,
                    backgroundColor: isSelected && !preserveItemBackground
                      ? lightenRGBByPercent(C.blue, 85)
                      : (getItemBg(item.backgroundColor, idx) || getItemBg(C.surfaceAlt, idx)),
                    opacity: isItemDisabled ? 0.4 : (isSelected && preserveItemBackground ? selectedItemOpacity : undefined),
                    outline: isFocused ? `2px solid ${C.borderFocus}` : undefined,
                    cursor: isItemDisabled ? "not-allowed" : undefined,
                    ...itemBorderRadius(idx),
                    ...resolvedItemStyle,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isItemDisabled) return;
                    setOpen(false);
                    onSelect(item, idx);
                  }}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={isItemDisabled || undefined}
                >
                  <span
                    className={styles.itemLabel}
                    style={{
                      fontFamily: SYSTEM_FONT,
                      textAlign: itemTextAlign,
                      ...itemTextStyle,
                      color: item.textColor || C.text,
                      ...(item.strikethrough ? { textDecoration: "line-through" } : {}),
                    }}
                  >
                    {item.label != null ? item.label : item}
                  </span>
                  {isSelected && (
                    <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: item.textColor || C.green }}>
                      {"\u2713"}
                    </span>
                  )}
                  {item.subtitle && (
                    <span className={styles.itemSubtitle} style={{ color: C.textMuted, fontFamily: SYSTEM_FONT }}>
                      {item.subtitle}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
        return portal ? ReactDOM.createPortal(menuNode, document.body) : menuNode;
      })()}
    </div>
  );
});
