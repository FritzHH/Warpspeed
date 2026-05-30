import React from "react";
import { Image } from "../Image/Image";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./ModalHeader.module.css";

const MAX_ACTIONS = 5;

/**
 * ModalHeader — title row at the top of a modal card.
 *
 * Action buttons render right-aligned in source order. The close button
 * MUST be the rightmost (last) entry in the `actions` array, matching the
 * platform convention of a top-right close affordance.
 */
export const ModalHeader = ({
  title,
  severity = "default",
  severityIcon,
  actions,
  className = "",
  style,
}) => {
  const slots = React.Children.toArray(actions).filter(Boolean);
  if (slots.length > MAX_ACTIONS) {
    throw new Error(
      `ModalHeader: actions slot cannot contain more than ${MAX_ACTIONS} buttons (got ${slots.length})`
    );
  }

  const severityClass =
    severity === "info"
      ? styles.severityInfo
      : severity === "warning"
        ? styles.severityWarning
        : "";

  return (
    <div className={`${styles.header} ${severityClass} ${className}`} style={style}>
      {severityIcon && (
        <div className={styles.severityIcon}>
          <Image icon={severityIcon} size={20} />
        </div>
      )}
      <div className={styles.title}>{title}</div>
      {slots.length > 0 && (
        <div className={styles.actions}>{slots}</div>
      )}
    </div>
  );
};

export const ModalHeaderButton = ({
  label,
  icon,
  iconSize = 20,
  iconPosition = "left",
  tooltip,
  tooltipPosition = "top",
  onClick,
  disabled = false,
  variant = "default",
  type = "button",
  className = "",
  style,
}) => {
  const variantClass =
    variant === "primary" ? styles.variantPrimary : styles.variantDefault;
  const effectiveVariant =
    disabled && variant !== "default" ? styles.variantDefault : variantClass;
  const iconOnlyClass = iconPosition === "only" ? styles.btnIconOnly : "";

  const showIconLeft = icon && (iconPosition === "left" || iconPosition === "only");
  const showIconRight = icon && iconPosition === "right";
  const showLabel = iconPosition !== "only" && label;

  const button = (
    <button
      type={type}
      className={`${styles.btn} ${effectiveVariant} ${iconOnlyClass} ${className}`}
      style={style}
      disabled={disabled}
      onClick={onClick}
      aria-label={iconPosition === "only" ? label || tooltip : undefined}
    >
      {showIconLeft && <Image icon={icon} size={iconSize} />}
      {showLabel && <span>{label}</span>}
      {showIconRight && <Image icon={icon} size={iconSize} />}
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip text={tooltip} position={tooltipPosition} darkMode>
        {button}
      </Tooltip>
    );
  }
  return button;
};
