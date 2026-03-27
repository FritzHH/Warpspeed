/* eslint-disable */
import { memo } from "react";
import { View, Text } from "react-native-web";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import { Button_ } from "../../../../components";
import { gray } from "../../../../utils";

export const SaleHeader = memo(function SaleHeader({
  sale,
  customer,
  onClose,
  onReprint,
  isStandalone = false,
}) {
  let saleComplete = sale?.paymentComplete;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 5,
      }}
    >
      {/* Reprint */}
      {saleComplete && onReprint && (
        <Button_
          text="REPRINT"
          onPress={onReprint}
          colorGradientArr={COLOR_GRADIENTS.greenblue}
          textStyle={{ color: C.textWhite }}
          buttonStyle={{ width: 150, marginRight: 10 }}
        />
      )}

      {/* Close / Cancel */}
      <Button_
        text={saleComplete ? "CLOSE" : "CANCEL"}
        onPress={onClose}
        enabled={
          saleComplete ||
          (!sale?.amountCaptured > 0 && !saleComplete)
        }
        colorGradientArr={COLOR_GRADIENTS.red}
        textStyle={{ color: C.textWhite }}
        buttonStyle={{ width: 150 }}
      />
    </View>
  );
});
