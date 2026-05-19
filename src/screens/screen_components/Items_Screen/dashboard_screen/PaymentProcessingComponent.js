import React from "react";
import styles from "./PaymentProcessingComponent.module.css";
import { CheckBox } from "../../../../dom_components";
import { C } from "../../../../styles";

export function PaymentProcessingComponent({
  zSettingsObj,
  handleSettingsFieldChange,
  children,
}) {
  return (
    <div className={styles.outerBox}>
      <div
        className={styles.innerBox}
        style={{
          borderColor: C.buttonLightGreenOutline,
          backgroundColor: C.listItemWhite,
        }}
      >
        <CheckBox
          isChecked={zSettingsObj?.autoConnectToCardReader}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          text={"Auto connect to card reader"}
          onCheck={() =>
            handleSettingsFieldChange(
              "autoConnectToCardReader",
              !zSettingsObj?.autoConnectToCardReader
            )
          }
        />
        {children}
      </div>
    </div>
  );
}
