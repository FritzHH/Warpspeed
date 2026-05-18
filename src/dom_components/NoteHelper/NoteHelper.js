import React, { forwardRef, useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { C, Fonts } from "../../styles";
import { gray, lightenRGBByPercent } from "../../utils";
import styles from "./NoteHelper.module.css";

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
    className = "",
    "data-testid": testId,
  },
  ref
) {
  const [sTarget, _sSetTarget] = useState(noteHelpersTarget);
  const [sClickedMap, _sSetClickedMap] = useState({});
  const openTimeRef = useRef(0);
  const prevVisibleRef = useRef(visible);

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

  const isChipActive = useCallback((catId, item) => {
    const insertText = getInsertText(item);
    const notes = workorderLine[sTarget] || "";
    const parts = notes.split(", ").map((s) => s.trim()).filter(Boolean);
    if (!parts.includes(insertText)) return false;
    const trackedCat = sClickedMap[sTarget + "|" + insertText];
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

  const filteredHelpers = noteHelpers.filter((cat) => cat[sTarget] === true);
  const dropdownWidth = 580;
  const margin = 10;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const clickX = anchorX ?? anchorPosition?.x ?? 0;
  const clickY = anchorY ?? anchorPosition?.y ?? 0;
  let left = centered ? (vw - dropdownWidth) / 2 : clickX + 8;
  if (left + dropdownWidth > vw - margin) left = vw - dropdownWidth - margin;
  if (left < margin) left = margin;
  let top = clickY + 5;
  if (top + 400 > vh - margin) top = vh - 400 - margin;
  if (top < margin) top = margin;

  const renderCategory = (category, chipIdx) => {
    return (
      <div key={category.id} className={styles.category}>
        <span
          className={styles.categoryLabel}
          style={{ fontSize: 14 + fontSizeAdj, color: gray(0.4) }}
        >
          {category.label}
        </span>
        <div className={styles.chipGrid}>
          {(category.items || []).map((item, i) => {
            const active = isChipActive(category.id, item);
            const label = getDisplayLabel(item);
            return (
              <button
                key={(item.id || label) + i}
                className={styles.chip}
                onClick={() => toggleChip(item, null, category.id)}
                style={{
                  backgroundColor: active ? lightenRGBByPercent(C.red, 70) : C.buttonLightGreenOutline,
                  paddingTop: 5 + chipPaddingVertAdj,
                  paddingBottom: 5 + chipPaddingVertAdj,
                }}
              >
                <span style={{ fontSize: 15 + fontSizeAdj, color: active ? C.red : gray(0.5) }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className={`${styles.backdrop} ${className}`}
      onClick={() => { if (Date.now() - openTimeRef.current > 150) onClose(); }}
      data-testid={testId}
    >
      <div
        className={styles.dropdown}
        style={{ top, left, width: dropdownWidth, maxHeight: vh - top - margin, borderColor: C.buttonLightGreenOutline }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Item header */}
        <div className={styles.header} style={{ borderBottomColor: C.buttonLightGreenOutline }}>
          <span className={styles.itemName} style={{ fontSize: 13 + fontSizeAdj, color: C.text }}>
            {workorderLine.inventoryItem?.informalName || workorderLine.inventoryItem?.formalName || "Item"}
          </span>
          <div className={styles.targetRow}>
            <span className={styles.addingTo} style={{ color: gray(0.5) }}>Adding to:</span>
            <button
              className={styles.targetBtn}
              onClick={() => _sSetTarget("intakeNotes")}
              style={{ backgroundColor: sTarget === "intakeNotes" ? "orange" : gray(0.08) }}
            >
              <span style={{ fontSize: 12 + fontSizeAdj, color: sTarget === "intakeNotes" ? "white" : gray(0.5) }}>
                Intake
              </span>
            </button>
            <button
              className={styles.targetBtn}
              onClick={() => _sSetTarget("receiptNotes")}
              style={{ backgroundColor: sTarget === "receiptNotes" ? "green" : gray(0.08) }}
            >
              <span style={{ fontSize: 12 + fontSizeAdj, color: sTarget === "receiptNotes" ? "white" : gray(0.5) }}>
                Receipt
              </span>
            </button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className={styles.columnsContainer}>
          <div className={styles.column}>
            {filteredHelpers.filter((_, i) => i % 2 === 0).map(renderCategory)}
          </div>
          <div className={styles.divider} style={{ backgroundColor: C.buttonLightGreenOutline }} />
          <div className={styles.column} style={{ paddingLeft: 14 }}>
            {filteredHelpers.filter((_, i) => i % 2 === 1).map(renderCategory)}
          </div>
        </div>

        {/* Notes inputs at bottom */}
        <div className={styles.notesSection} style={{ borderTopColor: C.buttonLightGreenOutline }}>
          <div className={styles.noteBlock}>
            <span className={styles.noteLabel} style={{ fontSize: 11 + fontSizeAdj, color: gray(0.4) }}>Intake notes</span>
            <textarea
              className={styles.noteTextarea}
              value={workorderLine.intakeNotes || ""}
              onChange={(e) => onUpdateLine({ ...workorderLine, intakeNotes: e.target.value })}
              placeholder="Intake notes"
              style={{ fontSize: 15 + fontSizeAdj, color: "orange", borderColor: gray(0.25), minHeight: 32 + fontSizeAdj }}
            />
          </div>
          <div className={styles.noteBlock}>
            <span className={styles.noteLabel} style={{ fontSize: 11 + fontSizeAdj, color: gray(0.4) }}>Receipt notes</span>
            <textarea
              className={styles.noteTextarea}
              value={workorderLine.receiptNotes || ""}
              onChange={(e) => onUpdateLine({ ...workorderLine, receiptNotes: e.target.value })}
              placeholder="Receipt notes"
              style={{ fontSize: 15 + fontSizeAdj, color: "green", borderColor: gray(0.25), minHeight: 32 + fontSizeAdj }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});
