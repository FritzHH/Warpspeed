/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { C, Fonts } from "../../../../styles";
import { CheckBox_ } from "../../../../components";
import { formatCurrencyDisp, gray } from "../../../../utils";

function RefundItemRow({
  line,
  workorderNumber,
  isSelected,
  isRefunded,
  onToggle,
}) {
  let name =
    line.inventoryItem?.formalName ||
    line.inventoryItem?.informalName ||
    "Unknown Item";
  let price = line.discountObj?.newPrice != null
    ? line.discountObj.newPrice
    : line.inventoryItem?.price || 0;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: gray(0.05),
        backgroundColor: isRefunded
          ? gray(0.04)
          : isSelected
          ? "rgb(252, 235, 235)"
          : "transparent",
        opacity: isRefunded ? 0.5 : 1,
        borderRadius: 3,
      }}
    >
      <CheckBox_
        isChecked={isSelected || isRefunded}
        onCheck={() => {
          if (!isRefunded) onToggle(line);
        }}
        enabled={!isRefunded}
        buttonStyle={{ marginRight: 8 }}
      />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={{
              fontSize: 12,
              color: isRefunded ? C.lightText : C.text,
              textDecorationLine: isRefunded ? "line-through" : "none",
            }}
          >
            {name}
          </Text>
          {isRefunded && (
            <View
              style={{
                backgroundColor: C.lightred,
                borderRadius: 3,
                paddingHorizontal: 4,
                paddingVertical: 1,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  color: "white",
                  fontWeight: Fonts.weight.textHeavy,
                }}
              >
                REFUNDED
              </Text>
            </View>
          )}
        </View>
        {workorderNumber && (
          <Text style={{ fontSize: 10, color: C.lightText }}>
            WO #{workorderNumber}
          </Text>
        )}
      </View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: Fonts.weight.textHeavy,
          color: isRefunded ? C.lightText : C.text,
        }}
      >
        {formatCurrencyDisp(price)}
      </Text>
    </View>
  );
}

export function RefundItemSelector({
  workordersInSale = [],
  selectedItems = [],
  onToggleItem,
  previouslyRefundedIDs = [],
}) {
  function isItemSelected(line) {
    return selectedItems.some((s) => s.id === line.id);
  }

  function isItemRefunded(line) {
    return previouslyRefundedIDs.includes(line.id) ||
      previouslyRefundedIDs.includes(line._originalLineId);
  }

  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: Fonts.weight.textHeavy,
          color: C.text,
          paddingHorizontal: 6,
          paddingBottom: 6,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.1),
        }}
      >
        SELECT ITEMS TO REFUND
      </Text>

      <ScrollView style={{ flex: 1, paddingTop: 4 }}>
        {workordersInSale.map((wo) => (
          <View key={wo.id}>
            {/* Workorder header */}
            {workordersInSale.length > 1 && (
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: Fonts.weight.textHeavy,
                  color: C.lightText,
                  paddingHorizontal: 6,
                  paddingTop: 6,
                  paddingBottom: 2,
                }}
              >
                WO #{wo.workorderNumber || wo.id?.slice(-4)}
              </Text>
            )}

            {(wo.workorderLines || []).map((line, idx) => (
              <RefundItemRow
                key={line.id || idx}
                line={line}
                workorderNumber={
                  workordersInSale.length > 1
                    ? wo.workorderNumber || wo.id?.slice(-4)
                    : null
                }
                isSelected={isItemSelected(line)}
                isRefunded={isItemRefunded(line)}
                onToggle={onToggleItem}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
