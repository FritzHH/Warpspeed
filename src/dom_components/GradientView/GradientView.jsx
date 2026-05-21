import React, { forwardRef } from "react";
import { COLOR_GRADIENTS } from "../../styles";
import styles from "./GradientView.module.css";

export const GradientView = forwardRef(function GradientView(
  {
    colorArr = COLOR_GRADIENTS.blue,
    children,
    style,
    pointerEvents,
    className = "",
    "data-testid": testId,
    ...props
  },
  ref
) {
  const gradient =
    colorArr && colorArr.length >= 2
      ? `linear-gradient(to right, ${colorArr.join(", ")})`
      : undefined;

  return (
    <div
      ref={ref}
      className={`${styles.container} ${className}`}
      style={{
        background: gradient,
        justifyContent: "center",
        alignItems: "center",
        ...style,
        ...(pointerEvents ? { pointerEvents } : {}),
      }}
      data-testid={testId}
      {...props}
    >
      {children}
    </div>
  );
});
