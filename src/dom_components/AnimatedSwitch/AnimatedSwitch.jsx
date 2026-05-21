import React from "react";
import styles from "./AnimatedSwitch.module.css";

export const AnimatedSwitch = ({
  children,
  animationType = "fade",
  duration = 300,
}) => {
  const child = React.Children.only(children);
  const animClass = styles[animationType] || styles.fade;

  return (
    <div
      key={child?.key ?? "default"}
      className={animClass}
      style={{ "--duration": `${duration}ms` }}
    >
      {child}
    </div>
  );
};
