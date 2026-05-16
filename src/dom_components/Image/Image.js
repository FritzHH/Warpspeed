import React, { forwardRef } from "react";
import styles from "./Image.module.css";

const RESIZE_MAP = {
  contain: "contain",
  cover: "cover",
  stretch: "fill",
  center: "none",
};

export const Image = forwardRef(function Image(
  {
    src,
    icon,
    size,
    width,
    height,
    resizeMode = "contain",
    alt = "",
    style = {},
    className = "",
    "data-testid": testId,
    ...rest
  },
  ref
) {
  const source = src || icon;
  const resolvedSrc = typeof source === "object" ? source.default || source : source;

  const imgWidth = size || width || style.width || 30;
  const imgHeight = size || height || style.height || 30;

  return (
    <img
      ref={ref}
      src={resolvedSrc}
      alt={alt}
      className={`${styles.image} ${className}`}
      style={{
        width: imgWidth,
        height: imgHeight,
        objectFit: RESIZE_MAP[resizeMode] || "contain",
        ...style,
      }}
      data-testid={testId}
      draggable={false}
      {...rest}
    />
  );
});
