import React from "react";
import { Image } from "../Image/Image";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./ModalFooter.module.css";

export const ModalFooter = ({ size = "large", className = "", children, style }) => {
  const sizeClass = size === "small" ? styles.sizeSmall : styles.sizeLarge;
  const slots = React.Children.toArray(children).filter(Boolean);
  return (
    <div className={`${styles.footer} ${className}`} style={style}>
      {slots.map((child, i) => (
        <div key={child.key ?? i} className={styles.slot}>
          {React.isValidElement(child)
            ? React.cloneElement(child, { _sizeClass: sizeClass })
            : child}
        </div>
      ))}
    </div>
  );
};

export const ModalFooterButton = ({
  variant = "default",
  icon,
  iconSize = 16,
  disabled = false,
  tooltip,
  tooltipPosition = "top",
  onClick,
  type = "button",
  children,
  className = "",
  style,
  _sizeClass,
}) => {
  const variantClass =
    variant === "primary"
      ? styles.variantPrimary
      : variant === "accent"
        ? styles.variantAccent
        : variant === "danger"
          ? styles.variantDanger
          : styles.variantDefault;

  const effectiveVariant = disabled && variant !== "default" ? styles.variantDefault : variantClass;

  const button = (
    <button
      type={type}
      className={`${styles.btn} ${_sizeClass || styles.sizeLarge} ${effectiveVariant} ${className}`}
      style={style}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <Image icon={icon} size={iconSize} />}
      <span>{children}</span>
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
