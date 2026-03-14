/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { C, Fonts } from "../../../../styles";
import { CheckBox_ } from "../../../../components";
import {
  formatCurrencyDisp,
  calculateRunningTotals,
  lightenRGBByPercent,
  gray,
} from "../../../../utils";

export function WorkorderCombiner({
  combinedWorkorders = [],
  otherCustomerWorkorders = [],
  onToggle,
  primaryWorkorderID,
  saleHasPayments = false,
  salesTaxPercent = 0,
}) {
  // Other workorders are ones belonging to the same customer
  // that are NOT yet in the combined list
  let uncombinedWOs = otherCustomerWorkorders.filter(
    (wo) => !combinedWorkorders.find((c) => c.id === wo.id)
  );

  // Build the full display list: combined first, then uncombined
  let allWOs = [...combinedWorkorders, ...uncombinedWOs];

  return (
    <ScrollView style={{ maxHeight: 300 }}>
      {allWOs.map((wo, idx) => {
        let isCombined = !!combinedWorkorders.find((c) => c.id === wo.id);
        let isPrimary = wo.id === primaryWorkorderID;
        let totals = calculateRunningTotals(wo, 0);
        let subtotal = totals.runningTotal || 0;

        return (
          <View key={wo.id}>
            {/* Combine checkbox — only for non-primary workorders */}
            {!isPrimary && (
              <CheckBox_
                enabled={!saleHasPayments}
                buttonStyle={{
                  alignSelf: "flex-start",
                  marginTop: 5,
                  marginBottom: 5,
                }}
                isChecked={isCombined}
                textStyle={{ color: C.text }}
                text={"ADD TO SALE"}
                onCheck={() => onToggle(wo)}
              />
            )}

            {/* Workorder card */}
            <View
              style={{
                opacity: isPrimary ? 1 : isCombined ? 1 : 0.4,
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 1,
                borderRadius: 8,
                padding: 10,
                marginBottom: 7,
                backgroundColor: lightenRGBByPercent(C.backgroundWhite, 60),
              }}
            >
              {/* WO Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  padding: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: gray(0.1),
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: "row" }}>
                  <Text
                    style={{
                      color: C.text,
                      fontSize: 16,
                      fontWeight: "500",
                    }}
                  >
                    {wo.brand || ""}
                  </Text>
                  {wo.model ? (
                    <Text
                      style={{
                        color: gray(0.6),
                        fontSize: 16,
                        fontWeight: "500",
                        fontStyle: "italic",
                        marginRight: 10,
                      }}
                    >
                      {"     " + wo.model}
                    </Text>
                  ) : null}
                  {wo.description ? (
                    <Text
                      style={{
                        color: C.text,
                        fontSize: 16,
                        fontWeight: "500",
                      }}
                    >
                      {"   " + wo.description}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {wo.color1?.backgroundColor && (
                    <Text
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 100,
                        backgroundColor: wo.color1?.backgroundColor,
                        color: wo.color1?.textColor,
                      }}
                    >
                      {wo.color1?.label || ""}
                    </Text>
                  )}
                  {wo.color2?.backgroundColor && (
                    <Text
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 100,
                        backgroundColor: wo.color2?.backgroundColor,
                        color: wo.color2?.textColor,
                      }}
                    >
                      {wo.color2?.label || ""}
                    </Text>
                  )}
                </View>
              </View>

              {/* WO Line Items */}
              {(wo.workorderLines || []).map((line, lineIdx) => {
                let name =
                  line.inventoryItem?.formalName ||
                  line.inventoryItem?.informalName ||
                  "Item";
                let price = line.inventoryItem?.price || 0;
                let discount = line.discountObj?.savings || 0;

                return (
                  <View
                    key={line.id || lineIdx}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: C.listItemWhite,
                      paddingVertical: 2,
                      marginBottom: 5,
                      borderLeftWidth: 2,
                      borderLeftColor: lightenRGBByPercent(C.green, 60),
                      paddingLeft: 10,
                      paddingRight: 10,
                      borderRadius: 5,
                    }}
                  >
                    <View style={{ width: "65%", flexDirection: "row", alignItems: "center" }}>
                      <View>
                        {discount > 0 && (
                          <Text style={{ color: C.lightred, fontSize: 12 }}>
                            {line.discountObj?.name}
                          </Text>
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            color: C.text,
                            fontWeight: "400",
                          }}
                        >
                          {name}
                        </Text>
                        {line.intakeNotes ? (
                          <Text
                            style={{
                              fontSize: 14,
                              color: gray(0.65),
                              fontWeight: "500",
                            }}
                          >
                            {line.intakeNotes}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View
                      style={{
                        width: "35%",
                        flexDirection: "row",
                        justifyContent: "flex-end",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "500",
                          color: C.text,
                          width: 30,
                          textAlign: "center",
                        }}
                      >
                        {line.qty || 1}
                      </Text>
                      <View style={{ alignItems: "flex-end", minWidth: 80 }}>
                        <Text>
                          {"$ " + formatCurrencyDisp(price)}
                        </Text>
                        {discount > 0 && (
                          <Text style={{ color: C.lightred }}>
                            {"$ -" + formatCurrencyDisp(discount)}
                          </Text>
                        )}
                        {discount > 0 && line.discountObj?.newPrice != null && (
                          <Text style={{ fontWeight: "600", color: C.text }}>
                            {formatCurrencyDisp(line.discountObj.newPrice)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* Subtotals Summary Row */}
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  justifyContent: "space-around",
                  alignItems: "center",
                  borderTopWidth: 1,
                  borderTopColor: gray(0.1),
                  marginTop: 5,
                  paddingTop: 5,
                }}
              >
                <Text style={{ fontSize: 13, color: "gray" }}>
                  {"SUBTOTAL: "}
                  <Text style={{ color: C.text, fontWeight: "500", fontSize: 14 }}>
                    {"$" + formatCurrencyDisp(totals.runningSubtotal)}
                  </Text>
                </Text>
                <View style={{ width: 1, height: "100%", backgroundColor: C.buttonLightGreenOutline }} />
                {(totals.runningDiscount || 0) > 0 && (
                  <View>
                    <Text style={{ fontSize: 13, color: C.lightred }}>
                      {"DISCOUNT: "}
                      <Text style={{ fontWeight: "500", color: C.lightred, fontSize: 14 }}>
                        {"$" + formatCurrencyDisp(totals.runningDiscount)}
                      </Text>
                    </Text>
                  </View>
                )}
                {(totals.runningDiscount || 0) > 0 && (
                  <View style={{ width: 1, height: "100%", backgroundColor: C.buttonLightGreenOutline }} />
                )}
                <Text style={{ fontSize: 13, color: "gray" }}>
                  {"TAX: "}
                  <Text style={{ color: C.text, fontWeight: "500", fontSize: 14 }}>
                    {"$" + formatCurrencyDisp((totals.runningTotal || 0) * salesTaxPercent / 100)}
                  </Text>
                </Text>
                <View style={{ width: 1, height: "100%", backgroundColor: C.buttonLightGreenOutline }} />
                <Text
                  style={{
                    fontSize: 13,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 15,
                    borderWidth: 1,
                    paddingHorizontal: 14,
                    paddingVertical: 3,
                    color: "gray",
                  }}
                >
                  {"TOTAL: "}
                  <Text style={{ fontWeight: "700", color: C.text, fontSize: 15 }}>
                    {"$" + formatCurrencyDisp(
                      (totals.runningTotal || 0) + (totals.runningTotal || 0) * salesTaxPercent / 100
                    )}
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
