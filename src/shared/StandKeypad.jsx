/* eslint-disable */
import { useRef, useState } from "react";
import { C, Radius } from "../styles";
import { useKeypadScaleStore } from "../stores";

export const PHONE_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["CLR", "0", "\u232B"],
];

export const NUMBER_ROW = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export const QWERTY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M", "\u232B"],
];

const KEY_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: Radius.control,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: C.buttonLightGreenOutline,
  backgroundColor: C.listItemWhite,
  cursor: "pointer",
  userSelect: "none",
  fontWeight: "600",
  fontSize: 28,
  color: C.text,
};

let _touchFired = false;
function KeyButton({ keyLabel, displayLabel, onClick, style, mountTime }) {
  return (
    <div
      onClick={() => { if (_touchFired) { _touchFired = false; return; } if (Date.now() - mountTime < 500) return; onClick(keyLabel); }}
      onTouchStart={(e) => { e.preventDefault(); _touchFired = true; e.currentTarget.style.backgroundColor = C.surfaceAlt; onClick(keyLabel); }}
      onTouchEnd={(e) => { e.currentTarget.style.backgroundColor = C.listItemWhite; }}
      onMouseDown={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
      onMouseUp={(e) => { e.currentTarget.style.backgroundColor = C.listItemWhite; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = C.listItemWhite; }}
      style={{ ...KEY_STYLE, ...style }}
    >
      {displayLabel || keyLabel}
    </div>
  );
}

export function StandKeypad({ mode, onKeyPress, showNumberRow, scale = 1, toggleLabel, onToggle }) {
  const mountTimeRef = useRef(Date.now());
  const mt = mountTimeRef.current;
  const userScale = useKeypadScaleStore((st) => st.scale);
  const adjustScale = useKeypadScaleStore((st) => st.adjustScale);
  const s = scale * userScale;
  const [shifted, setShifted] = useState(false);
  const [showCog, setShowCog] = useState(false);
  const _actionColor = (key) => (key === "CLR" || key === "\u232B") ? { color: C.textMuted } : {};
  const _backspaceStyle = (key) => key === "\u232B" ? { flex: 3, maxWidth: 200 * s, fontSize: 72 * s } : {};

  function handleKey(key) {
    if (/^[A-Z]$/.test(key)) {
      let out = shifted ? key : key.toLowerCase();
      onKeyPress(out);
      if (shifted) setShifted(false);
      return;
    }
    onKeyPress(key);
  }

  if (mode === "phone") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {PHONE_KEYS.map((row, ri) => (
          <div key={ri} style={{ display: "flex", flexDirection: "row", gap: 6, justifyContent: "center" }}>
            {row.map((key) => (
              <KeyButton key={key} keyLabel={key} onClick={handleKey} mountTime={mt} style={{ width: 102 * s, height: 84 * s, fontSize: 28 * s, ..._actionColor(key) }} />
            ))}
            {ri === PHONE_KEYS.length - 1 && toggleLabel && onToggle && (
              <div
                onClick={() => { if (_touchFired) { _touchFired = false; return; } onToggle(); }}
                onTouchStart={(e) => { e.preventDefault(); _touchFired = true; onToggle(); }}
                style={{ ...KEY_STYLE, width: 102 * s, height: 84 * s, fontSize: 20 * s, backgroundColor: C.blue, color: "white", borderColor: C.blue }}
              >
                {toggleLabel}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  const shiftButton = (
    <div
      onClick={() => { if (_touchFired) { _touchFired = false; return; } setShifted((p) => !p); }}
      onTouchStart={(e) => { e.preventDefault(); _touchFired = true; setShifted((p) => !p); }}
      style={{ ...KEY_STYLE, flex: 1, height: 78 * s, fontSize: 28 * s, backgroundColor: shifted ? C.blue : C.listItemWhite, color: shifted ? "white" : C.text, borderColor: shifted ? C.blue : C.buttonLightGreenOutline }}
    >
      ⇧
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {showNumberRow && (
        <div style={{ display: "flex", flexDirection: "row", gap: 3, justifyContent: "center" }}>
          {NUMBER_ROW.map((key) => (
            <KeyButton key={key} keyLabel={key} onClick={handleKey} mountTime={mt} style={{ flex: 1, height: 84 * s, maxWidth: 90 * s, fontSize: 28 * s }} />
          ))}
        </div>
      )}
      {QWERTY_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: "flex", flexDirection: "row", gap: 3, justifyContent: "center" }}>
          {row.map((key) => (
            <KeyButton key={key} keyLabel={key} onClick={handleKey} mountTime={mt} style={{ flex: 1, height: 84 * s, maxWidth: 90 * s, fontSize: 28 * s, ..._actionColor(key), ..._backspaceStyle(key) }} />
          ))}
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "row", gap: 3, justifyContent: "center" }}>
        <KeyButton keyLabel=" " displayLabel="SPACE" onClick={handleKey} mountTime={mt} style={{ flex: toggleLabel && onToggle ? 3 : 1, height: 78 * s, fontSize: 28 * s }} />
        {toggleLabel && onToggle && (
          <div
            onClick={() => { if (_touchFired) { _touchFired = false; return; } onToggle(); }}
            onTouchStart={(e) => { e.preventDefault(); _touchFired = true; onToggle(); }}
            style={{ ...KEY_STYLE, flex: 1.3, height: 78 * s, fontSize: 20 * s, backgroundColor: C.blue, color: "white", borderColor: C.blue }}
          >
            {toggleLabel}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "row", gap: 3, justifyContent: "center" }}>
        <KeyButton keyLabel="CLR" displayLabel="CLEAR" onClick={handleKey} mountTime={mt} style={{ flex: 1, height: 78 * s, fontSize: 18 * s, color: C.textMuted }} />
        {shiftButton}
        <KeyButton keyLabel="ENTER" displayLabel="NEW LINE" onClick={handleKey} mountTime={mt} style={{ flex: 1, height: 78 * s, fontSize: 18 * s }} />
        <div
          onClick={() => { if (_touchFired) { _touchFired = false; return; } setShowCog((p) => !p); }}
          onTouchStart={(e) => { e.preventDefault(); _touchFired = true; setShowCog((p) => !p); }}
          style={{ ...KEY_STYLE, flex: 0.6, height: 78 * s, fontSize: 28 * s, backgroundColor: showCog ? C.blue : C.listItemWhite, color: showCog ? "white" : C.textMuted, borderColor: showCog ? C.blue : C.buttonLightGreenOutline }}
        >
          ⚙
        </div>
      </div>
      {showCog && (
        <div
          onClick={() => { if (_touchFired) { _touchFired = false; return; } setShowCog(false); }}
          onTouchStart={(e) => { e.preventDefault(); _touchFired = true; setShowCog(false); }}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", zIndex: 99999 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{ display: "flex", flexDirection: "column", gap: 20, padding: 28, borderRadius: Radius.container, backgroundColor: C.listItemWhite, boxShadow: "0 12px 40px rgba(0,0,0,0.35)", minWidth: 360 }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: C.textMuted, letterSpacing: 1, textAlign: "center" }}>KEYPAD SIZE</span>
            <div style={{ display: "flex", flexDirection: "row", gap: 16, justifyContent: "center", alignItems: "center" }}>
              <div
                onClick={() => { if (_touchFired) { _touchFired = false; return; } adjustScale(-0.1); }}
                onTouchStart={(e) => { e.preventDefault(); _touchFired = true; adjustScale(-0.1); }}
                style={{ ...KEY_STYLE, width: 72, height: 64, fontSize: 36 }}
              >
                −
              </div>
              <span style={{ fontSize: 28, fontWeight: 700, color: C.text, minWidth: 90, textAlign: "center" }}>{userScale.toFixed(1)}×</span>
              <div
                onClick={() => { if (_touchFired) { _touchFired = false; return; } adjustScale(0.1); }}
                onTouchStart={(e) => { e.preventDefault(); _touchFired = true; adjustScale(0.1); }}
                style={{ ...KEY_STYLE, width: 72, height: 64, fontSize: 36 }}
              >
                +
              </div>
            </div>
            <div
              onClick={() => { if (_touchFired) { _touchFired = false; return; } setShowCog(false); }}
              onTouchStart={(e) => { e.preventDefault(); _touchFired = true; setShowCog(false); }}
              style={{ ...KEY_STYLE, height: 52, fontSize: 16, color: C.textMuted }}
            >
              CLOSE
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
