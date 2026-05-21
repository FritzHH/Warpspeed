import React from "react";
import { Button, TouchableOpacity, Image } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";


export function BoxButton1({
  label,
  style = {},
  icon,
  iconSize,
  textStyle,
  onPress,
  colorGradientArr,
}) {
  return (
    <Button
      colorGradientArr={colorGradientArr}
      text={label}
      icon={icon || ICONS.add}
      iconSize={iconSize || 30}
      textStyle={{ fontSize: 14, color: C.textSecondary, ...textStyle }}
      buttonStyle={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        borderRadius: 5,
        backgroundColor: C.surfaceAlt,
        marginBottom: 0,
        ...style,
      }}
      onPress={onPress}
    />
  );
}

export function MoveArrows({ index, listLength, onMove }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginLeft: 5, flexShrink: 0 }}>
      <TouchableOpacity
        disabled={index === 0}
        onPress={() => onMove(index, "up")}
        style={{ padding: 4, opacity: index === 0 ? 0.25 : 1 }}
      >
        <Image icon={ICONS.upChevron} size={13} />
      </TouchableOpacity>
      <TouchableOpacity
        disabled={index === listLength - 1}
        onPress={() => onMove(index, "down")}
        style={{ padding: 4, opacity: index === listLength - 1 ? 0.25 : 1 }}
      >
        <Image icon={ICONS.downChevron} size={13} />
      </TouchableOpacity>
    </div>
  );
}

export function BoxContainerOuter({ style = {}, children }) {
  return (
    <div
      style={{
        width: "97%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function BoxContainerInner({ style = {}, children, borderless = false }) {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: borderless ? "center" : "flex-end",
        borderWidth: borderless ? 0 : 1,
        borderStyle: "solid",
        borderColor: C.buttonLightGreenOutline,
        backgroundColor: C.listItemWhite,
        borderRadius: 10,
        padding: 15,
        boxSizing: "border-box",
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
