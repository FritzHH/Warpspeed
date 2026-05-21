/* eslint-disable */
import { memo } from "react";
import styles from "./SaleHeader.module.css";
import { C, COLOR_GRADIENTS } from "../../../../styles";
import { Button } from "../../../../dom_components";
import { dlog, DCAT } from "./checkoutDebugLog";

export const SaleHeader = memo(function SaleHeader({
  sale,
  customer,
  onClose,
  onReprint,
  isStandalone = false,
}) {
  let saleComplete = sale?.paymentComplete;

  return (
    <div className={styles.header}>
      {saleComplete && onReprint && (
        <div className={styles.reprintWrap}>
          <Button
            text="REPRINT"
            onPress={() => { dlog(DCAT.BUTTON, "reprint", "SaleHeader", {}); onReprint(); }}
            colorGradientArr={COLOR_GRADIENTS.greenblue}
            textStyle={{ color: C.textWhite }}
            buttonStyle={{ width: 150 }}
          />
        </div>
      )}
      <Button
        text={saleComplete ? "CLOSE" : "CANCEL"}
        onPress={() => { dlog(DCAT.BUTTON, saleComplete ? "close" : "cancel", "SaleHeader", {}); onClose(); }}
        enabled={
          saleComplete ||
          (!sale?.amountCaptured > 0 && !saleComplete)
        }
        colorGradientArr={COLOR_GRADIENTS.red}
        textStyle={{ color: C.textWhite }}
        buttonStyle={{ width: 150 }}
      />
    </div>
  );
});
