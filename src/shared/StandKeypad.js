/* eslint-disable */
import { C } from "../styles";
import { gray } from "../utils";

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
  borderRadius: 6,
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

function KeyButton({ keyLabel, displayLabel, onClick, style }) {
  return (
    <div
      onClick={() => onClick(keyLabel)}
      onMouseDown={(e) => { e.currentTarget.style.backgroundColor = gray(0.1); }}
      onMouseUp={(e) => { e.currentTarget.style.backgroundColor = C.listItemWhite; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = C.listItemWhite; }}
      style={{ ...KEY_STYLE, ...style }}
    >
      {displayLabel || keyLabel}
    </div>
  );
}

export function StandKeypad({ mode, onKeyPress, showNumberRow, fontSizeAdj = 0, paddingAdj = 0 }) {
  const fAdj = fontSizeAdj;
  const pAdj = paddingAdj;
  const _actionColor = (key) => (key === "CLR" || key === "\u232B") ? { color: gray(0.4) } : {};

  if (mode === "phone") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {PHONE_KEYS.map((row, ri) => (
          <div key={ri} style={{ display: "flex", flexDirection: "row", gap: 6, justifyContent: "center" }}>
            {row.map((key) => (
              <KeyButton key={key} keyLabel={key} onClick={onKeyPress} style={{ width: 102 + pAdj * 2, height: 84 + pAdj * 2, fontSize: 28 + fAdj, ..._actionColor(key) }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {showNumberRow && (
        <div style={{ display: "flex", flexDirection: "row", gap: 3, justifyContent: "center" }}>
          {NUMBER_ROW.map((key) => (
            <KeyButton key={key} keyLabel={key} onClick={onKeyPress} style={{ flex: 1, height: 84 + pAdj * 2, maxWidth: 90 + pAdj * 2, fontSize: 28 + fAdj }} />
          ))}
        </div>
      )}
      {QWERTY_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: "flex", flexDirection: "row", gap: 3, justifyContent: "center" }}>
          {row.map((key) => (
            <KeyButton key={key} keyLabel={key} onClick={onKeyPress} style={{ flex: 1, height: 84 + pAdj * 2, maxWidth: 90 + pAdj * 2, fontSize: 28 + fAdj, ..._actionColor(key) }} />
          ))}
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "row", gap: 3, justifyContent: "center" }}>
        <KeyButton keyLabel=" " displayLabel="SPACE" onClick={onKeyPress} style={{ flex: 3, height: 78 + pAdj * 2, fontSize: 28 + fAdj }} />
        <KeyButton keyLabel="CLR" onClick={onKeyPress} style={{ flex: 1, height: 78 + pAdj * 2, fontSize: 18 + fAdj, color: gray(0.4) }} />
      </div>
    </div>
  );
}
