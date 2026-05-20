/* eslint-disable */
// ColorWheel.js
import React, { useMemo, useRef, useState, useCallback } from "react";

// ---------- Color utils ----------

function resolveToHex(input) {
  if (!input) return "#FF4D4D";
  if (typeof input === "string" && input.charAt(0) === "#") return input;
  // Browser-friendly named-color resolution via canvas
  if (typeof document !== "undefined") {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillStyle = input;
      const resolved = ctx.fillStyle; // canvas normalizes to #rrggbb or rgba(...)
      if (typeof resolved === "string" && resolved.charAt(0) === "#") return resolved.toUpperCase();
    } catch (e) {}
  }
  return "#FF4D4D";
}

// ---------- Component ----------
/**
 * Props:
 * - size: number (px)
 * - strokeWidth: number (thickness of hue ring)
 * - initialColor: string hex like '#FF00FF'
 * - onColorChange: ({hex, rgb, hsv}) => void
 */
export function ColorWheel({
  size = 260,
  strokeWidth = 26,
  initialColor = "#FF4D4D",
  onColorChange = () => {},
  style,
  thing,
}) {
  initialColor = resolveToHex(initialColor);

  // geometry
  const radius = size / 2;
  const ringOuter = radius;
  const ringInner = radius - strokeWidth;
  const svRadius = ringInner - 8; // small gap inside ring

  function clamp(v, min = 0, max = 1) {
    return Math.min(max, Math.max(min, v));
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const hp = (h % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0,
      g1 = 0,
      b1 = 0;
    if (0 <= hp && hp < 1) [r1, g1, b1] = [c, x, 0];
    else if (1 <= hp && hp < 2) [r1, g1, b1] = [x, c, 0];
    else if (2 <= hp && hp < 3) [r1, g1, b1] = [0, c, x];
    else if (3 <= hp && hp < 4) [r1, g1, b1] = [0, x, c];
    else if (4 <= hp && hp < 5) [r1, g1, b1] = [x, 0, c];
    else if (5 <= hp && hp < 6) [r1, g1, b1] = [c, 0, x];
    const m = v - c;
    const r = Math.round((r1 + m) * 255);
    const g = Math.round((g1 + m) * 255);
    const b = Math.round((b1 + m) * 255);
    return { r, g, b };
  }

  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r:
          h = 60 * (((g - b) / d) % 6);
          break;
        case g:
          h = 60 * ((b - r) / d + 2);
          break;
        case b:
          h = 60 * ((r - g) / d + 4);
          break;
        default:
          break;
      }
    }
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
  }

  function rgbToHex({ r, g, b }) {
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  function hexToRgb(hex) {
    let h = hex.replace("#", "").trim();
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const int = parseInt(h, 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
    };
  }

  // state
  const initialHsv = useMemo(() => {
    const { r, g, b } = hexToRgb(initialColor);
    return rgbToHsv(r, g, b);
  }, [initialColor]);

  const [hsv, setHsv] = useState(initialHsv);

  const uidRef = useRef("cw-" + Math.random().toString(36).slice(2, 8));
  const uid = uidRef.current;

  const svgRef = useRef(null);
  const center = { x: radius, y: radius };

  // derived current color
  const rgb = useMemo(() => hsvToRgb(hsv.h, hsv.s, hsv.v), [hsv]);
  const hex = useMemo(() => rgbToHex(rgb), [rgb]);

  // report to parent
  const emit = useCallback(
    (next) => {
      const rgb_ = hsvToRgb(next.h, next.s, next.v);
      onColorChange({
        hsv: next,
        rgb: rgb_,
        hex: rgbToHex(rgb_),
      });
    },
    [onColorChange]
  );

  // Helpers
  const polarFromPoint = (x, y) => {
    const dx = x - center.x;
    const dy = y - center.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    let theta = Math.atan2(-dy, dx);
    let deg = (theta * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return { r, deg, dx, dy };
  };

  const isInHueRing = (r) => r >= ringInner && r <= ringOuter + 1;
  const isInSV = (r) => r <= svRadius;

  // SV math (we use a square clipped to a circle)
  const svSquareSize = svRadius * Math.SQRT1_2 * 2; // max inscribed square
  const svSquareTopLeft = {
    x: center.x - svSquareSize / 2,
    y: center.y - svSquareSize / 2,
  };

  const pointToSV = (x, y) => {
    let sx = (x - svSquareTopLeft.x) / svSquareSize;
    let sy = (y - svSquareTopLeft.y) / svSquareSize;
    sx = clamp(sx);
    sy = clamp(sy);
    const s = sx;
    const v = 1 - sy;
    return { s, v };
  };

  const svToPoint = (s, v) => {
    const x = svSquareTopLeft.x + s * svSquareSize;
    const y = svSquareTopLeft.y + (1 - v) * svSquareSize;
    return { x, y };
  };

  // Pointer handling
  const activeZoneRef = useRef(""); // 'hue' | 'sv' | ''

  const getLocalCoords = (e) => {
    const node = svgRef.current;
    if (!node) return { x: 0, y: 0 };
    const rect = node.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const updateFromPoint = (evtX, evtY, forceZone) => {
    const { r, deg } = polarFromPoint(evtX, evtY);
    const zone =
      forceZone ||
      (isInHueRing(r) ? "hue" : isInSV(r) ? "sv" : activeZoneRef.current || "");

    if (!zone) return;

    if (zone === "hue") {
      const next = { ...hsv, h: deg };
      setHsv(next);
      emit(next);
      activeZoneRef.current = "hue";
    } else if (zone === "sv") {
      const { s, v } = pointToSV(evtX, evtY);
      const next = { ...hsv, s, v };
      setHsv(next);
      emit(next);
      activeZoneRef.current = "sv";
    }
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    const { x, y } = getLocalCoords(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    updateFromPoint(x, y);
  };

  const handlePointerMove = (e) => {
    if (!activeZoneRef.current) return;
    const { x, y } = getLocalCoords(e);
    updateFromPoint(x, y, activeZoneRef.current);
  };

  const handlePointerUp = (e) => {
    activeZoneRef.current = "";
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
  };

  // Build hue ring segments (sweep)
  const segments = useMemo(() => {
    const n = 180;
    const anglePer = 360 / n;
    const paths = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i * anglePer * Math.PI) / 180;
      const a1 = ((i + 1) * anglePer * Math.PI) / 180;
      const x0o = center.x + ringOuter * Math.cos(a0);
      const y0o = center.y - ringOuter * Math.sin(a0);
      const x1o = center.x + ringOuter * Math.cos(a1);
      const y1o = center.y - ringOuter * Math.sin(a1);
      const x0i = center.x + ringInner * Math.cos(a0);
      const y0i = center.y - ringInner * Math.sin(a0);
      const x1i = center.x + ringInner * Math.cos(a1);
      const y1i = center.y - ringInner * Math.sin(a1);

      const largeArc = anglePer > 180 ? 1 : 0;

      const d = [
        `M ${x0i} ${y0i}`,
        `L ${x0o} ${y0o}`,
        `A ${ringOuter} ${ringOuter} 0 ${largeArc} 0 ${x1o} ${y1o}`,
        `L ${x1i} ${y1i}`,
        `A ${ringInner} ${ringInner} 0 ${largeArc} 1 ${x0i} ${y0i}`,
        "Z",
      ].join(" ");

      const hue = (i * anglePer) % 360;
      const c = hsvToRgb(hue, 1, 1);
      const fill = rgbToHex(c);

      paths.push({ d, fill });
    }
    return paths;
  }, [size, strokeWidth]);

  // Markers
  const hueMarker = useMemo(() => {
    const theta = (hsv.h * Math.PI) / 180;
    const rMid = (ringInner + ringOuter) / 2;
    const x = center.x + rMid * Math.cos(theta);
    const y = center.y - rMid * Math.sin(theta);
    return { x, y };
  }, [hsv.h, size, strokeWidth]);

  const svMarker = useMemo(() => svToPoint(hsv.s, hsv.v), [hsv.s, hsv.v]);

  // current hue color for SV gradient
  const hueRgb = useMemo(() => hsvToRgb(hsv.h, 1, 1), [hsv.h]);
  const hueHex = useMemo(() => rgbToHex(hueRgb), [hueRgb]);

  return (
    <div style={style}>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: "none", userSelect: "none", display: "block" }}
      >
        <defs>
          {/* Clip inner SV square to a circle */}
          <clipPath id={"svClip-" + uid}>
            <circle cx={center.x} cy={center.y} r={svRadius} />
          </clipPath>

          {/* SV gradients */}
          <linearGradient id={"svSaturation-" + uid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor={hueHex} />
          </linearGradient>
          <linearGradient id={"svValue-" + uid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(0,0,0,0)" />
            <stop offset="1" stopColor="rgba(0,0,0,1)" />
          </linearGradient>
        </defs>

        {/* Hue ring (sweep) */}
        <g>
          {segments.map((seg, idx) => (
            <path key={idx} d={seg.d} fill={seg.fill} />
          ))}
        </g>

        {/* Inner SV area */}
        <g clipPath={"url(#svClip-" + uid + ")"}>
          <rect
            x={svSquareTopLeft.x}
            y={svSquareTopLeft.y}
            width={svSquareSize}
            height={svSquareSize}
            fill={"url(#svSaturation-" + uid + ")"}
          />
          <rect
            x={svSquareTopLeft.x}
            y={svSquareTopLeft.y}
            width={svSquareSize}
            height={svSquareSize}
            fill={"url(#svValue-" + uid + ")"}
          />
        </g>

        {/* Hue marker */}
        <circle
          cx={hueMarker.x}
          cy={hueMarker.y}
          r={strokeWidth / 2.6}
          stroke="#fff"
          strokeWidth={2}
          fill="none"
        />
        <circle
          cx={hueMarker.x}
          cy={hueMarker.y}
          r={strokeWidth / 2.6 - 4}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={2}
          fill="none"
        />

        {/* SV marker (crosshair) */}
        <g>
          <circle
            cx={svMarker.x}
            cy={svMarker.y}
            r={8}
            stroke="#fff"
            strokeWidth={2}
            fill="none"
          />
          <circle
            cx={svMarker.x}
            cy={svMarker.y}
            r={6}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={2}
            fill="none"
          />
        </g>

        {/* Current color preview (small dot at center) */}
        <circle
          cx={center.x}
          cy={center.y}
          r={6}
          fill={hex}
          stroke="#fff"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
