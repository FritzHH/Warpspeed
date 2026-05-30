import React, { forwardRef, useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { C, Fonts } from "../../styles";
import { lightenRGBByPercent, capitalizeFirstLetterOfString } from "../../utils";
import styles from "./NoteHelper.module.css";
import { useZ } from "../../hooks/useZ";
import { ModalFooter, ModalFooterButton } from "../ModalFooter/ModalFooter";

export const NoteHelper = forwardRef(function NoteHelper(
  {
    visible,
    onClose,
    workorderLine,
    onUpdateLine,
    anchorPosition = { x: 0, y: 0 },
    anchorX,
    anchorY,
    noteHelpers = [],
    noteHelpersTarget = "intakeNotes",
    centered = false,
    fontSizeAdj = 0,
    chipPaddingVertAdj = 0,
    onViewItem,
    readOnly = false,
    className = "",
    "data-testid": testId,
  },
  ref
) {
  const [sTarget, _sSetTarget] = useState(noteHelpersTarget);
  const [sClickedMap, _sSetClickedMap] = useState({});
  const [sMeasuredHeight, _setMeasuredHeight] = useState(0);
  const z = useZ("modal", visible);
  const openTimeRef = useRef(0);
  const prevVisibleRef = useRef(visible);
  const dropdownRef = useRef(null);

  useLayoutEffect(() => {
    if (visible && dropdownRef.current) {
      const h = dropdownRef.current.offsetHeight;
      if (h > 0 && h !== sMeasuredHeight) _setMeasuredHeight(h);
    }
  });

  useEffect(() => {
    if (!visible) _setMeasuredHeight(0);
  }, [visible]);

  if (visible && !prevVisibleRef.current) {
    openTimeRef.current = Date.now();
  }
  prevVisibleRef.current = visible;

  useEffect(() => {
    if (visible) {
      _sSetTarget(noteHelpersTarget);
      _sSetClickedMap({});
    }
  }, [visible, noteHelpersTarget]);

  const getInsertText = useCallback((item) => {
    if (typeof item === "string") return item;
    return (item.text || item.buttonLabel || "").trim();
  }, []);

  const getDisplayLabel = useCallback((item) => {
    if (typeof item === "string") return item;
    return item.buttonLabel || "";
  }, []);

  const isChipActive = useCallback((catId, item, targetOverride) => {
    const target = targetOverride || sTarget;
    const insertText = getInsertText(item);
    const notes = workorderLine[target] || "";
    const parts = notes.split(", ").map((s) => s.trim()).filter(Boolean);
    if (!parts.includes(insertText)) return false;
    const trackedCat = sClickedMap[target + "|" + insertText];
    if (trackedCat !== undefined) return trackedCat === catId;
    return true;
  }, [workorderLine, sTarget, sClickedMap, getInsertText]);

  const toggleChip = useCallback((item, targetOverride, catId) => {
    const target = targetOverride || sTarget;
    const insertText = getInsertText(item);
    const notes = workorderLine[target] || "";
    const parts = notes.split(", ").map((s) => s.trim()).filter(Boolean);
    const key = target + "|" + insertText;
    const idx = parts.indexOf(insertText);
    if (idx !== -1) {
      parts.splice(idx, 1);
      _sSetClickedMap((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } else {
      parts.push(insertText);
      _sSetClickedMap((prev) => ({ ...prev, [key]: catId }));
    }
    onUpdateLine({ ...workorderLine, [target]: parts.join(", ") });
  }, [sTarget, workorderLine, onUpdateLine, getInsertText]);

  if (!visible) return null;

  const dropdownWidth = 580;
  const margin = 10;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const clickX = anchorX ?? anchorPosition?.x ?? 0;
  const clickY = anchorY ?? anchorPosition?.y ?? 0;
  let left = centered ? (vw - dropdownWidth) / 2 : clickX + 8;
  if (left + dropdownWidth > vw - margin) left = vw - dropdownWidth - margin;
  if (left < margin) left = margin;
  const bottomMargin = 20;
  const modalHeight = sMeasuredHeight || 600;
  let top = clickY + 5;
  if (top + modalHeight > vh - bottomMargin) top = vh - modalHeight - bottomMargin;
  if (top < margin) top = margin;
  const positionStyle = { top, left, width: dropdownWidth, visibility: sMeasuredHeight ? "visible" : "hidden" };

  const renderCategory = (category, targetForRender) => {
    return (
      <div key={category.id} className={styles.category}>
        <span
          className={styles.categoryLabel}
          style={{ fontSize: 14 + fontSizeAdj, color: C.textMuted }}
        >
          {category.label}
        </span>
        <div className={styles.chipGrid}>
          {(category.items || []).map((item, i) => {
            const active = isChipActive(category.id, item, targetForRender);
            const label = getDisplayLabel(item);
            return (
              <button
                key={(item.id || label) + i}
                className={styles.chip}
                disabled={readOnly}
                onClick={() => toggleChip(item, targetForRender, category.id)}
                style={{
                  backgroundColor: active ? lightenRGBByPercent(C.red, 70) : C.buttonLightGreenOutline,
                  paddingTop: 5 + chipPaddingVertAdj,
                  paddingBottom: 5 + chipPaddingVertAdj,
                  cursor: readOnly ? "default" : "pointer",
                }}
              >
                <span style={{ fontSize: 15 + fontSizeAdj, color: active ? C.red : C.textMuted }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderColumns = (targetForRender) => {
    const helpers = noteHelpers.filter((cat) => cat[targetForRender] === true);
    return (
      <div className={styles.columnsContainer}>
        <div className={styles.column}>
          {helpers.filter((_, i) => i % 2 === 0).map((cat) => renderCategory(cat, targetForRender))}
        </div>
        <div className={styles.divider} style={{ backgroundColor: C.buttonLightGreenOutline }} />
        <div className={styles.column} style={{ paddingLeft: 14 }}>
          {helpers.filter((_, i) => i % 2 === 1).map((cat) => renderCategory(cat, targetForRender))}
        </div>
      </div>
    );
  };

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className={`${styles.backdrop} ${className}`}
      style={{ zIndex: z }}
      onClick={() => { if (Date.now() - openTimeRef.current > 150) onClose(); }}
      data-testid={testId}
    >
      <div
        ref={dropdownRef}
        className={styles.dropdown}
        style={{ zIndex: z + 1, ...positionStyle }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.cardInner}>
        {/* Item header */}
        <div className={styles.header} style={{ borderBottomColor: C.buttonLightGreenOutline }}>
          <div className={styles.itemNameRow}>
            <span className={styles.itemName} style={{ fontSize: 13 + fontSizeAdj, color: C.text }}>
              {workorderLine.inventoryItem?.formalName || workorderLine.inventoryItem?.informalName || "Item"}
            </span>
            {onViewItem && (
              <button
                type="button"
                className={styles.viewItemBtn}
                onClick={() => onViewItem(workorderLine.inventoryItem)}
                style={{ borderColor: C.buttonLightGreenOutline, color: C.text }}
              >
                View Inventory Item
              </button>
            )}
          </div>
          <div className={styles.targetRow}>
            <span className={styles.addingTo} style={{ color: C.textMuted }}>Adding to:</span>
            <button
              className={styles.targetBtn}
              onClick={() => _sSetTarget("intakeNotes")}
              style={{ backgroundColor: sTarget === "intakeNotes" ? "orange" : C.surfaceAlt }}
            >
              <span style={{ fontSize: 12 + fontSizeAdj, color: sTarget === "intakeNotes" ? "white" : C.textMuted }}>
                Intake
              </span>
            </button>
            <button
              className={styles.targetBtn}
              onClick={() => _sSetTarget("receiptNotes")}
              style={{ backgroundColor: sTarget === "receiptNotes" ? "green" : C.surfaceAlt }}
            >
              <span style={{ fontSize: 12 + fontSizeAdj, color: sTarget === "receiptNotes" ? "white" : C.textMuted }}>
                Receipt
              </span>
            </button>
          </div>
        </div>

        {/* Both targets rendered stacked in a single grid cell so the
            container always sizes to the max of intake/receipt heights. */}
        <div className={styles.swapContainer}>
          <div
            className={styles.swapLayer}
            style={{
              visibility: sTarget === "intakeNotes" ? "visible" : "hidden",
              pointerEvents: sTarget === "intakeNotes" ? "auto" : "none",
            }}
            aria-hidden={sTarget !== "intakeNotes"}
          >
            {renderColumns("intakeNotes")}
          </div>
          <div
            className={styles.swapLayer}
            style={{
              visibility: sTarget === "receiptNotes" ? "visible" : "hidden",
              pointerEvents: sTarget === "receiptNotes" ? "auto" : "none",
            }}
            aria-hidden={sTarget !== "receiptNotes"}
          >
            {renderColumns("receiptNotes")}
          </div>
        </div>

        {/* Notes inputs at bottom */}
        <div className={styles.notesSection} style={{ borderTopColor: C.buttonLightGreenOutline }}>
          <div className={styles.noteBlock}>
            <span className={styles.noteLabel} style={{ fontSize: 11 + fontSizeAdj, color: C.textMuted }}>Intake notes</span>
            <textarea
              className={styles.noteTextarea}
              disabled={readOnly}
              value={workorderLine.intakeNotes || ""}
              onChange={(e) => onUpdateLine({ ...workorderLine, intakeNotes: capitalizeFirstLetterOfString(e.target.value) })}
              placeholder="Intake notes"
              style={{ fontSize: 15 + fontSizeAdj, color: "orange", borderColor: C.borderStrong, minHeight: 32 + fontSizeAdj, cursor: readOnly ? "default" : "text" }}
            />
          </div>
          <div className={styles.noteBlock}>
            <span className={styles.noteLabel} style={{ fontSize: 11 + fontSizeAdj, color: C.textMuted }}>Receipt notes</span>
            <textarea
              className={styles.noteTextarea}
              disabled={readOnly}
              value={workorderLine.receiptNotes || ""}
              onChange={(e) => onUpdateLine({ ...workorderLine, receiptNotes: capitalizeFirstLetterOfString(e.target.value) })}
              placeholder="Receipt notes"
              style={{ fontSize: 15 + fontSizeAdj, color: "green", borderColor: C.borderStrong, minHeight: 32 + fontSizeAdj, cursor: readOnly ? "default" : "text" }}
            />
          </div>
        </div>
        </div>

        <ModalFooter size="small">
          <ModalFooterButton variant="default" onClick={onClose}>
            Close
          </ModalFooterButton>
        </ModalFooter>
      </div>
    </div>,
    document.body
  );
});
