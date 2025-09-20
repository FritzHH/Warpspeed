/* eslint-disable */
// ColorWheel.js
import React, { useMemo, useRef, useState, useCallback } from "react";
import { View, PanResponder } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  ClipPath,
} from "react-native-svg";
import { log } from "./utils";
import { processColor } from "react-native";

// ---------- Color utils ----------

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
  // log("iniital", initialColor);
  if (!initialColor.includes("#")) {
    let intColor = processColor(initialColor);
    initialColor = (intColor >>> 0).toString(16).padStart(8, "0").toUpperCase();
  }
  // if (!initialColor.includes("#")) initialColor = rgbToHex(initialRGB);
  // log("thin", thing);
  // geometry
  const radius = size / 2;
  const ringOuter = radius;
  const ringInner = radius - strokeWidth;
  const svRadius = ringInner - 8; // small gap inside ring
  function clamp(v, min = 0, max = 1) {
    return Math.min(max, Math.max(min, v));
  }

  function hsvToRgb(h, s, v) {
    // h in [0, 360), s,v in [0,1]
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
    // atan2(y, x) but SVG y+ is down, so invert dy for angle
    let theta = Math.atan2(-dy, dx); // in radians
    let deg = (theta * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return { r, deg, dx, dy };
  };

  const isInHueRing = (r) => r >= ringInner && r <= ringOuter + 1;
  const isInSV = (r) => r <= svRadius;

  // SV math (we use a square clipped to a circle)
  const svSquareSize = svRadius * Math.SQRT1_2 * 2; // square inside circle (max inscribed square)
  const svSquareTopLeft = {
    x: center.x - svSquareSize / 2,
    y: center.y - svSquareSize / 2,
  };

  const pointToSV = (x, y) => {
    // normalize to square
    let sx = (x - svSquareTopLeft.x) / svSquareSize; // 0..1
    let sy = (y - svSquareTopLeft.y) / svSquareSize; // 0..1
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

  // Pan handling
  const activeZoneRef = useRef(""); // 'hue' | 'sv' | ''

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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          updateFromPoint(locationX, locationY);
        },
        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          updateFromPoint(locationX, locationY, activeZoneRef.current);
        },
        onPanResponderRelease: () => {
          activeZoneRef.current = "";
        },
        onPanResponderTerminate: () => {
          activeZoneRef.current = "";
        },
      }),
    [hsv]
  );

  // Build hue ring segments (sweep)
  const segments = useMemo(() => {
    const n = 180; // segments (higher = smoother)
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
    <View style={style} {...panResponder.panHandlers}>
      <Svg width={size} height={size}>
        <Defs>
          {/* Clip inner SV square to a circle */}
          <ClipPath id="svClip">
            <Circle cx={center.x} cy={center.y} r={svRadius} />
          </ClipPath>

          {/* SV gradients (horizontal: white -> hue), (vertical overlay: transparent -> black) */}
          <LinearGradient id="svSaturation" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="1" stopColor={hueHex} />
          </LinearGradient>
          <LinearGradient id="svValue" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="rgba(0,0,0,0)" />
            <Stop offset="1" stopColor="rgba(0,0,0,1)" />
          </LinearGradient>
        </Defs>

        {/* Hue ring (sweep) */}
        <G>
          {segments.map((seg, idx) => (
            <Path key={idx} d={seg.d} fill={seg.fill} />
          ))}
        </G>

        {/* Inner SV area */}
        <G clipPath="url(#svClip)">
          {/* Base white->hue gradient */}
          <Rect
            x={svSquareTopLeft.x}
            y={svSquareTopLeft.y}
            width={svSquareSize}
            height={svSquareSize}
            fill="url(#svSaturation)"
          />
          {/* Overlay top->bottom to darken (value) */}
          <Rect
            x={svSquareTopLeft.x}
            y={svSquareTopLeft.y}
            width={svSquareSize}
            height={svSquareSize}
            fill="url(#svValue)"
          />
        </G>

        {/* Hue marker */}
        <Circle
          cx={hueMarker.x}
          cy={hueMarker.y}
          r={strokeWidth / 2.6}
          stroke="#fff"
          strokeWidth={2}
          fill="none"
        />
        <Circle
          cx={hueMarker.x}
          cy={hueMarker.y}
          r={strokeWidth / 2.6 - 4}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={2}
          fill="none"
        />

        {/* SV marker (crosshair) */}
        <G>
          <Circle
            cx={svMarker.x}
            cy={svMarker.y}
            r={8}
            stroke="#fff"
            strokeWidth={2}
            fill="none"
          />
          <Circle
            cx={svMarker.x}
            cy={svMarker.y}
            r={6}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={2}
            fill="none"
          />
        </G>

        {/* Current color preview (small dot at center) */}
        <Circle
          cx={center.x}
          cy={center.y}
          r={6}
          fill={hex}
          stroke="#fff"
          strokeWidth={1.5}
        />
      </Svg>
    </View>
  );
}
