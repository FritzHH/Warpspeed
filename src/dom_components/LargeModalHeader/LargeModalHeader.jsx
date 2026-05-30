import React from "react";
import { Image } from "../Image/Image";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./LargeModalHeader.module.css";

const MAX_ACTIONS = 5;

export const LargeModalHeader = ({
  layout = "standard",
  title,
  actions,
  iconSize,
  splitWidth = "35%",
  borderBottom = true,
  className = "",
  style,
}) => {
  const slots = React.Children.toArray(actions).filter(Boolean);
  if (slots.length > MAX_ACTIONS) {
    throw new Error(
      `LargeModalHeader: actions slot cannot contain more than ${MAX_ACTIONS} buttons (got ${slots.length})`
    );
  }

  const layoutClass =
    layout === "split"
      ? styles.layoutSplit
      : layout === "actionsOnly"
        ? styles.layoutActionsOnly
        : styles.layoutStandard;

  const isFillMode = layout === "split" || layout === "actionsOnly";
  const showTitle = layout !== "actionsOnly";

  return (
    <div className={`${styles.header} ${layoutClass} ${borderBottom ? styles.headerWithBorder : ""} ${className}`} style={style}>
      {showTitle && <div className={styles.title}>{title}</div>}
      {slots.length > 0 && (
        <div
          className={styles.actions}
          style={layout === "split" ? { width: splitWidth } : undefined}
        >
          {slots.map((child, i) => {
            if (!React.isValidElement(child)) return child;
            const cloneProps = { _equalWidth: isFillMode, key: child.key ?? i };
            if (iconSize != null && child.props.iconSize == null) {
              cloneProps.iconSize = iconSize;
            }
            return React.cloneElement(child, cloneProps);
          })}
        </div>
      )}
    </div>
  );
};

export const LargeModalHeaderButton = ({
  variant = "default",
  icon,
  iconSize,
  iconPosition = "left",
  tooltip,
  tooltipPosition = "bottom",
  onClick,
  disabled = false,
  type = "button",
  children,
  className = "",
  style,
  _equalWidth,
}) => {
  const effectiveIconSize = iconSize ?? (iconPosition === "only" ? 20 : 16);
  const variantClass =
    variant === "primary"
      ? styles.variantPrimary
      : variant === "accent"
        ? styles.variantAccent
        : variant === "danger"
          ? styles.variantDanger
          : styles.variantDefault;

  const effectiveVariant = disabled && variant !== "default" ? styles.variantDefault : variantClass;
  const iconOnlyClass = iconPosition === "only" ? styles.btnIconOnly : "";
  const widthClass = _equalWidth ? styles.btnEqualWidth : styles.btnNatural;

  const showIconLeft = icon && (iconPosition === "left" || iconPosition === "only");
  const showIconRight = icon && iconPosition === "right";
  const showLabel = iconPosition !== "only" && children;

  const button = (
    <button
      type={type}
      className={`${styles.btn} ${widthClass} ${effectiveVariant} ${iconOnlyClass} ${className}`}
      style={style}
      disabled={disabled}
      onClick={onClick}
      aria-label={iconPosition === "only" ? tooltip : undefined}
    >
      {showIconLeft && <Image icon={icon} size={effectiveIconSize} />}
      {showLabel && <span>{children}</span>}
      {showIconRight && <Image icon={icon} size={effectiveIconSize} />}
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip text={tooltip} position={tooltipPosition}>
        {button}
      </Tooltip>
    );
  }
  return button;
};
