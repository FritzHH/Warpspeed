import React, { forwardRef, useState, useRef, useImperativeHandle, useEffect } from "react";
import ReactDOM from "react-dom";
import { C, ICONS } from "../../styles";
import { lightenRGBByPercent, usdTypeMask } from "../../utils";
import { DISCOUNT_TYPES } from "../../constants";
import styles from "./LineActionsDropdown.module.css";
import { useZ } from "../../hooks/useZ";

const VIEWPORT_PAD = 10;
const SYSTEM_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", sans-serif';

const resolveImg = (icon) =>
  icon ? (typeof icon === "object" ? icon.default || icon : icon) : null;

const DiscountRow = ({ label, bg, selected, onClick }) => (
  <div
    className={styles.discountRow}
    style={{
      backgroundColor: selected ? lightenRGBByPercent(C.blue, 85) : bg,
      paddingRight: selected ? 28 : 10,
    }}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    role="menuitem"
  >
    <span
      className={styles.discountLabel}
      style={{ color: C.text, fontFamily: SYSTEM_FONT }}
    >
      {label}
    </span>
    {selected && (
      <span className={styles.checkmark} style={{ color: C.green }}>
        {"\u2713"}
      </span>
    )}
  </div>
);

const CustomInputRow = ({
  label,
  val,
  wide = false,
  placeholder,
  maxLength,
  onChange,
  onSubmit,
  canSubmit,
}) => (
  <div
    className={styles.customRow}
    style={{ backgroundColor: lightenRGBByPercent(C.blue, 60) }}
    onClick={(e) => e.stopPropagation()}
    onMouseDown={(e) => e.stopPropagation()}
  >
    <span className={styles.customLabel} style={{ color: C.textMuted }}>
      {label}
    </span>
    <input
      className={`${styles.customInput} ${wide ? styles.customInputWide : ""}`}
      value={val}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && canSubmit) onSubmit();
      }}
      style={{
        borderColor: C.buttonLightGreenOutline,
        color: C.text,
        backgroundColor: val ? lightenRGBByPercent(C.lightred, 60) : "white",
      }}
    />
    <button
      className={styles.customSubmit}
      onClick={onSubmit}
      aria-label="Apply"
      type="button"
      disabled={!canSubmit}
      style={{ opacity: canSubmit ? 1 : 0.3, cursor: canSubmit ? "pointer" : "not-allowed" }}
    >
      <img src={resolveImg(ICONS.check1)} alt="" style={{ width: 14, height: 14 }} />
    </button>
  </div>
);

const MenuContent = ({
  showSplit,
  onSplit,
  onRemove,
  filteredDiscounts,
  noDiscountSelected,
  matchedPresetId,
  pctInitial,
  dolInitialDisplay,
  dolInitialCents,
  maxDiscountCents,
  close,
  onSelectDiscount,
  onCustomPercent,
  onCustomDollar,
}) => {
  const [pct, setPct] = useState(pctInitial);
  const [dol, setDol] = useState(dolInitialDisplay);
  const [dolCents, setDolCents] = useState(dolInitialCents);

  const handlePctChange = (raw) => {
    let cleaned = raw.replace(/[^0-9]/g, "");
    if (Number(cleaned) > 100) cleaned = "100";
    setPct(cleaned);
    if (cleaned) {
      setDol("");
      setDolCents(0);
    }
  };

  const handleDolChange = (raw) => {
    let result = usdTypeMask(raw);
    if (maxDiscountCents && result.cents > maxDiscountCents) {
      result = usdTypeMask(String(maxDiscountCents));
    }
    setDol(result.display);
    setDolCents(result.cents);
    if (result.display) {
      setPct("");
    }
  };

  const submitPct = () => {
    const num = Number(pct);
    if (!num) return;
    close();
    onCustomPercent?.(num);
  };

  const submitDol = () => {
    if (!dolCents) return;
    close();
    onCustomDollar?.(dolCents);
  };

  return (
    <>
      <div className={styles.iconRow} style={{ borderBottomColor: C.borderSubtle }}>
        {showSplit && (
          <button
            className={styles.iconBtn}
            style={{
              width: "50%",
              backgroundColor: lightenRGBByPercent(C.blue, 85),
            }}
            onClick={(e) => {
              e.stopPropagation();
              close();
              onSplit?.();
            }}
            aria-label="Split into individual lines"
            type="button"
          >
            <img
              src={resolveImg(ICONS.axe)}
              alt=""
              style={{ width: 28, height: 28, objectFit: "contain" }}
            />
          </button>
        )}
        <button
          className={styles.iconBtn}
          style={{
            width: showSplit ? "50%" : "100%",
            backgroundColor: lightenRGBByPercent(C.lightred, 85),
            borderLeft: showSplit ? `1px solid ${C.borderSubtle}` : "none",
          }}
          onClick={(e) => {
            e.stopPropagation();
            close();
            onRemove?.();
          }}
          aria-label="Remove item"
          type="button"
        >
          <img
            src={resolveImg(ICONS.trash)}
            alt=""
            style={{ width: 28, height: 28, objectFit: "contain" }}
          />
        </button>
      </div>

      <DiscountRow
        label="No Discount"
        bg={C.surfaceAlt}
        selected={noDiscountSelected}
        onClick={() => {
          close();
          onSelectDiscount?.(null);
        }}
      />

      {filteredDiscounts.map((discount, dIdx) => (
        <DiscountRow
          key={discount.id ?? `${discount.name}_${dIdx}`}
          label={discount.name}
          bg={dIdx % 2 === 0 ? C.surfaceBase : C.surfaceAlt}
          selected={matchedPresetId === discount.id}
          onClick={() => {
            close();
            onSelectDiscount?.(discount);
          }}
        />
      ))}

      <div className={styles.divider} style={{ backgroundColor: C.borderSubtle }} />

      <CustomInputRow
        label="Custom %"
        val={pct}
        placeholder="0"
        maxLength={3}
        onChange={handlePctChange}
        onSubmit={submitPct}
        canSubmit={Number(pct) > 0}
      />
      <CustomInputRow
        label="Custom $"
        val={dol}
        wide
        placeholder="0.00"
        onChange={handleDolChange}
        onSubmit={submitDol}
        canSubmit={dolCents > 0}
      />
    </>
  );
};

export const LineActionsDropdown = forwardRef(function LineActionsDropdown(
  {
    enabled = true,
    showSplit = false,
    onSplit,
    onRemove,
    discounts = [],
    currentDiscount = null,
    maxDiscountCents = 0,
    onSelectDiscount,
    onCustomPercent,
    onCustomDollar,
    triggerIcon = ICONS.menu2,
    triggerIconSize = 22,
    triggerStyle = {},
    open: openProp,
    onOpenChange,
    "aria-label": ariaLabel = "Line actions",
  },
  ref
) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : internalOpen;
  const z = useZ("dropdown", isOpen);
  const [menuPos, setMenuPos] = useState({
    anchorCenterX: 0,
    anchorBottom: 10,
    anchorWidth: 0,
  });
  const anchorRef = useRef(null);
  const menuRef = useRef(null);

  const isDisabled = enabled === false;

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e) => {
      const t = e.target;
      if (anchorRef.current && anchorRef.current.contains(t)) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      setOpen(false);
    };
    // Capture-phase listener: when the target is inside the menu, stop the
    // event from bubbling to Radix's DismissableLayer pointerdown handler
    // (which calls preventDefault on outside events and blocks input focus).
    const onPointerDownCapture = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) {
        e.stopPropagation();
      }
    };
    // Capture-phase focus listeners: the menu portals to document.body, OUTSIDE
    // any parent Radix Dialog's FocusScope. Without these handlers, FocusScope
    // sees focus moving "outside" the dialog and yanks it back, preventing the
    // inputs in this menu from ever holding focus (so typing does nothing).
    const onFocusInCapture = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) {
        e.stopPropagation();
      }
    };
    const onFocusOutCapture = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) {
        e.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusInCapture, true);
    document.addEventListener("focusout", onFocusOutCapture, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusInCapture, true);
      document.removeEventListener("focusout", onFocusOutCapture, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const setOpen = (val) => {
    if (!isControlled) setInternalOpen(val);
    onOpenChange?.(val);
  };

  const calcPosition = () => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setMenuPos({
      anchorCenterX: rect.left + rect.width / 2,
      anchorBottom: rect.bottom + 4,
      anchorWidth: rect.width,
    });
  };

  useImperativeHandle(ref, () => ({
    open: () => {
      calcPosition();
      setOpen(true);
    },
    close: () => setOpen(false),
    toggle: () => {
      if (!isOpen) calcPosition();
      setOpen(!isOpen);
    },
  }));

  const noDiscountSelected = !currentDiscount;
  const matchedPresetId =
    currentDiscount && !currentDiscount.custom ? currentDiscount.id : null;

  const isCustomPct =
    currentDiscount?.custom && currentDiscount?.type === DISCOUNT_TYPES.percent;
  const isCustomDol =
    currentDiscount?.custom && currentDiscount?.type === DISCOUNT_TYPES.dollar;
  const pctInitial = isCustomPct ? String(currentDiscount.value || "") : "";
  const dolInitialCents = isCustomDol ? Number(currentDiscount.value || 0) : 0;
  const dolInitialDisplay =
    dolInitialCents > 0 ? (dolInitialCents / 100).toFixed(2) : "";

  const filteredDiscounts = (discounts || []).filter(
    (o) =>
      o.type !== DISCOUNT_TYPES.dollar ||
      Number(o.value) <= (maxDiscountCents || 0)
  );

  const close = () => setOpen(false);

  const triggerSrc = resolveImg(triggerIcon);

  return (
    <>
      <button
        ref={anchorRef}
        className={styles.trigger}
        style={triggerStyle}
        onClick={() => {
          if (!isDisabled) {
            calcPosition();
            setOpen(!isOpen);
          }
        }}
        disabled={isDisabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        type="button"
      >
        {triggerSrc && (
          <img
            src={triggerSrc}
            alt=""
            draggable={false}
            style={{
              width: triggerIconSize,
              height: triggerIconSize,
              objectFit: "contain",
            }}
          />
        )}
      </button>

      {isOpen &&
        ReactDOM.createPortal(
          <div
            ref={(el) => {
              menuRef.current = el;
              if (!el) return;
              const h = el.scrollHeight;
              const w = el.offsetWidth;
              const vp = window.innerHeight;
              let top = menuPos.anchorBottom || VIEWPORT_PAD;
              if (top + h > vp - VIEWPORT_PAD) {
                top = Math.max(
                  VIEWPORT_PAD,
                  vp - VIEWPORT_PAD - Math.min(h, vp - VIEWPORT_PAD * 2)
                );
              }
              let left = (menuPos.anchorCenterX || 0) - w / 2;
              if (left + w > window.innerWidth - VIEWPORT_PAD) {
                left = window.innerWidth - VIEWPORT_PAD - w;
              }
              if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
              el.style.top = top + "px";
              el.style.left = left + "px";
            }}
            className={styles.menu}
            style={{ zIndex: z, borderColor: C.borderSubtle }}
            role="menu"
          >
            <MenuContent
              showSplit={showSplit}
              onSplit={onSplit}
              onRemove={onRemove}
              filteredDiscounts={filteredDiscounts}
              noDiscountSelected={noDiscountSelected}
              matchedPresetId={matchedPresetId}
              pctInitial={pctInitial}
              dolInitialDisplay={dolInitialDisplay}
              dolInitialCents={dolInitialCents}
              maxDiscountCents={maxDiscountCents}
              close={close}
              onSelectDiscount={onSelectDiscount}
              onCustomPercent={onCustomPercent}
              onCustomDollar={onCustomDollar}
            />
          </div>,
          document.body
        )}
    </>
  );
});
