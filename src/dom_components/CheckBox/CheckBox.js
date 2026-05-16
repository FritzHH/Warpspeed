import React, { forwardRef } from "react";
import { ICONS, C } from "../../styles";
import { Button } from "../Button/Button";

export const CheckBox = forwardRef(function CheckBox(
  {
    text,
    onCheck,
    iconSize = 25,
    mouseOverOptions,
    isChecked,
    buttonStyle = {},
    textStyle = {},
    enabled = true,
    enableMouseOver = true,
    // Additive props
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  return (
    <Button
      ref={ref}
      enabled={enabled}
      mouseOverOptions={mouseOverOptions}
      icon={isChecked ? ICONS.checkbox : ICONS.checkoxEmpty}
      iconSize={15}
      text={text}
      buttonStyle={{
        backgroundColor: "transparent",
        paddingHorizontal: 0,
        paddingVertical: 0,
        ...buttonStyle,
      }}
      textStyle={{ color: C.text, fontSize: 15, ...textStyle }}
      onPress={onCheck}
      enableMouseOver={enableMouseOver}
      className={className}
      aria-label={ariaLabel || text}
      data-testid={testId}
    />
  );
});
