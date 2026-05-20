import React, { forwardRef, useState, useCallback, useRef } from "react";
import { C, COLOR_GRADIENTS, ICONS } from "../../styles";
import { SHADOW_PROTO, SHADOW_NONE } from "../shadows";
import styles from "./Button.module.css";

export const Button = forwardRef(function Button(
  {
    handleMouseOver = () => {},
    handleMouseExit = () => {},
    visible = true,
    icon = null,
    iconSize = 25,
    onPress = () => {},
    onLongPress,
    numLines = 1,
    text,
    enableMouseOver = true,
    TextComponent,
    mouseOverOptions = {
      opacity: 0.82,
      highlightColor: "",
      textColor: "",
    },
    shadow = false,
    allCaps = false,
    colorGradientArr = [],
    buttonStyle = {},
    textStyle = {},
    iconStyle = {},
    viewStyle = {},
    enabled = true,
    // Additive props
    className = "",
    innerClassName = "",
    textClassName = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const [sMouseOver, _setMouseOver] = useState(false);
  const longPressTimer = useRef(null);
  const displayText = allCaps && text ? text.toUpperCase() : text;
  const shadowStyle = shadow ? SHADOW_PROTO : SHADOW_NONE;

  const HEIGHT = buttonStyle.height;
  const WIDTH = buttonStyle.width;

  if (!visible) {
    return (
      <div style={{ width: WIDTH, height: HEIGHT, backgroundColor: "transparent" }} />
    );
  }

  function handleButtonPress(e) {
    if (!enabled) return;
    _setMouseOver(false);
    onPress(e);
  }

  function getBackgroundColor() {
    if (sMouseOver && enabled) {
      return mouseOverOptions.highlightColor || buttonStyle.backgroundColor;
    }
    return buttonStyle.backgroundColor || C.buttonLightGreen;
  }

  function getOpacity() {
    if (sMouseOver && enabled) {
      return mouseOverOptions.opacity;
    } else if (!enabled) {
      return null;
    }
    return 1;
  }

  const resolveIcon = (src) => {
    if (!src) return null;
    return typeof src === "object" ? src.default || src : src;
  };

  // Build gradient background
  const gradient =
    colorGradientArr && colorGradientArr.length >= 2
      ? `linear-gradient(to right, ${colorGradientArr.join(", ")})`
      : undefined;

  // Compute paddingHorizontal/paddingVertical from buttonStyle
  const paddingH = buttonStyle.paddingHorizontal;
  const paddingV = buttonStyle.paddingVertical;

  // When innerClassName is supplied, defer all padding to that CSS class so it
  // isn't overridden by inline style defaults.
  const hasInnerClass = !!innerClassName;
  const innerStyle = {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    borderRadius: 5,
    ...(hasInnerClass ? {} : {
      paddingLeft: icon ? 10 : (paddingH != null ? paddingH : 15),
      paddingRight: paddingH != null ? paddingH : 15,
      paddingTop: paddingV != null ? paddingV : 5,
      paddingBottom: paddingV != null ? paddingV : 5,
    }),
    ...shadowStyle,
    ...buttonStyle,
    background: gradient || undefined,
    backgroundColor: gradient ? undefined : (icon && !displayText ? undefined : getBackgroundColor()),
    opacity: enabled ? (buttonStyle.opacity ?? 1) : 0.2,
  };

  // Remove RNW-only props from inline style
  delete innerStyle.paddingHorizontal;
  delete innerStyle.paddingVertical;
  delete innerStyle.marginHorizontal;
  delete innerStyle.marginVertical;

  // Handle marginHorizontal/marginVertical on buttonStyle
  if (buttonStyle.marginHorizontal != null) {
    innerStyle.marginLeft = innerStyle.marginLeft ?? buttonStyle.marginHorizontal;
    innerStyle.marginRight = innerStyle.marginRight ?? buttonStyle.marginHorizontal;
  }
  if (buttonStyle.marginVertical != null) {
    innerStyle.marginTop = innerStyle.marginTop ?? buttonStyle.marginVertical;
    innerStyle.marginBottom = innerStyle.marginBottom ?? buttonStyle.marginVertical;
  }

  const textClampStyle =
    numLines && numLines > 0
      ? {
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: numLines,
          WebkitBoxOrient: "vertical",
        }
      : {};

  return (
    <div
      className={styles.wrapper}
      style={{ cursor: !enabled ? "default" : undefined }}
    >
      <div
        ref={ref}
        className={`${styles.touchable} ${!enabled ? styles.disabled : ""} ${className}`}
        style={{
          opacity: getOpacity(),
          cursor: !enabled ? "default" : "pointer",
          ...viewStyle,
        }}
        onClick={handleButtonPress}
        onPointerDown={() => {
          if (!enabled || !onLongPress) return;
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            onLongPress();
          }, 500);
        }}
        onPointerUp={() => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }}
        onPointerCancel={() => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }}
        onMouseOver={() => {
          if (!enabled) return;
          handleMouseOver();
          if (enableMouseOver) _setMouseOver(true);
        }}
        onMouseLeave={() => {
          handleMouseExit();
          _setMouseOver(false);
        }}
        role="button"
        tabIndex={enabled ? 0 : -1}
        aria-label={ariaLabel || displayText}
        aria-disabled={!enabled || undefined}
        data-testid={testId}
        onKeyDown={(e) => {
          if (enabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            handleButtonPress(e);
          }
        }}
      >
        <div className={`${styles.inner} ${innerClassName}`} style={innerStyle}>
          {!!icon && (
            <img
              src={resolveIcon(icon)}
              alt=""
              className={styles.icon}
              style={{
                width: iconSize,
                height: iconSize,
                marginRight: displayText ? 10 : 0,
                objectFit: "contain",
                opacity: sMouseOver ? mouseOverOptions.opacity : (buttonStyle.opacity ?? undefined),
                ...iconStyle,
              }}
            />
          )}
          {TextComponent ? (
            <TextComponent />
          ) : (
            <span
              className={`${styles.text} ${textClassName}`}
              style={{
                textAlign: "center",
                fontSize: 15,
                color: C.textWhite,
                ...textStyle,
                ...textClampStyle,
              }}
            >
              {displayText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
