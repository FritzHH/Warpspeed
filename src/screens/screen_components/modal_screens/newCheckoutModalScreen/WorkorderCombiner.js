/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { C, Fonts, ICONS } from "../../../../styles";
import { CheckBox_, Image_, Button_, DropdownMenu } from "../../../../components";
import {
  formatCurrencyDisp,
  calculateRunningTotals,
  lightenRGBByPercent,
  gray,
  applyDiscountToWorkorderItem,
  replaceOrAddToArr,
} from "../../../../utils";
import { cloneDeep } from "lodash";
import { useSettingsStore } from "../../../../stores";

export function WorkorderCombiner({
  combinedWorkorders = [],
  otherCustomerWorkorders = [],
  onToggle,
  onLineChange,
  primaryWorkorderID,
  saleHasPayments = false,
  salesTaxPercent = 0,
}) {
  let discounts = useSettingsStore((s) => s.settings?.discounts) || [];

  function modifyQty(wo, lineIdx, direction) {
    let newLine = cloneDeep(wo.workorderLines[lineIdx]);
    if (direction === "up") {
      newLine.qty = newLine.qty + 1;
    } else {
      if (newLine.qty <= 1) return;
      newLine.qty = newLine.qty - 1;
    }
    if (newLine.discountObj?.name) {
      let recalc = applyDiscountToWorkorderItem(newLine);
      if (recalc.discountObj?.newPrice > 0) newLine = recalc;
    }
    onLineChange(wo.id, replaceOrAddToArr(wo.workorderLines, newLine));
  }

  function deleteLine(wo, lineIdx) {
    let lines = wo.workorderLines.filter((_, idx) => idx !== lineIdx);
    onLineChange(wo.id, lines);
  }

  function handleDiscount(wo, line, discountObj) {
    let lines = wo.workorderLines.map((o) => {
      if (o.id === line.id) {
        let updated = { ...o, discountObj };
        return applyDiscountToWorkorderItem(updated);
      }
      return o;
    });
    onLineChange(wo.id, lines);
  }

  // Other workorders are ones belonging to the same customer
  // that are NOT yet in the combined list
  let uncombinedWOs = otherCustomerWorkorders.filter(
    (wo) => !combinedWorkorders.find((c) => c.id === wo.id)
  );

  // Build the full display list: combined first, then uncombined
  let allWOs = [...combinedWorkorders, ...uncombinedWOs];

  return (
    <View>
      {allWOs.map((wo, idx) => {
        let isCombined = !!combinedWorkorders.find((c) => c.id === wo.id);
        let isPrimary = wo.id === primaryWorkorderID;
        let totals = calculateRunningTotals(wo, 0);
        let subtotal = totals.runningTotal || 0;
        let effectiveTaxPercent = wo.taxFree ? 0 : salesTaxPercent;

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
                  alignItems: "center",
                  padding: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: gray(0.1),
                  marginBottom: 10,
                }}
              >
                {wo.isStandaloneSale ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%" }}>
                    <Image_
                      source={ICONS.shoppingCart}
                      style={{ width: 22, height: 22, marginRight: 8, opacity: 0.7, tintColor: C.green }}
                    />
                    <Text
                      style={{
                        color: C.green,
                        fontSize: 17,
                        fontWeight: "600",
                        letterSpacing: 1,
                      }}
                    >
                      {"STANDALONE SALE"}
                    </Text>
                  </View>
                ) : (
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
                )}
                {!wo.isStandaloneSale && (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {wo.color1?.backgroundColor ? (
                      <Text
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderTopLeftRadius: 100,
                          borderBottomLeftRadius: 100,
                          backgroundColor: wo.color1?.backgroundColor,
                          color: wo.color1?.textColor,
                        }}
                      >
                        {wo.color1?.label || ""}
                      </Text>
                    ) : null}
                    {wo.color2?.backgroundColor ? (
                      <Text
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderTopRightRadius: 100,
                          borderBottomRightRadius: 100,
                          backgroundColor: wo.color2?.backgroundColor,
                          color: wo.color2?.textColor,
                        }}
                      >
                        {wo.color2?.label || ""}
                      </Text>
                    ) : null}
                  </View>
                )}
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
                      {wo.isStandaloneSale ? (
                        <>
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Button_
                              onPress={() => modifyQty(wo, lineIdx, "up")}
                              buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 3 }}
                              icon={ICONS.upArrowOrange}
                              iconSize={23}
                            />
                            <Button_
                              onPress={() => modifyQty(wo, lineIdx, "down")}
                              buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 3, marginRight: 5 }}
                              icon={ICONS.downArrowOrange}
                              iconSize={23}
                            />
                          </View>
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "500",
                              color: C.text,
                              width: 30,
                              textAlign: "center",
                              marginRight: 5,
                            }}
                          >
                            {line.qty || 1}
                          </Text>
                          <View
                            style={{
                              alignItems: "flex-end",
                              minWidth: 85,
                              marginRight: 0,
                              borderWidth: 1,
                              borderRadius: 7,
                              borderColor: C.listItemBorder,
                              paddingRight: 2,
                              backgroundColor: C.backgroundWhite,
                              justifyContent: "center",
                            }}
                          >
                            {(line.qty > 1 || line.discountObj?.newPrice) && (
                              <Text style={{ color: C.text }}>
                                {"$ " + formatCurrencyDisp(price)}
                              </Text>
                            )}
                            {discount > 0 && (
                              <Text style={{ color: C.lightText }}>
                                {"$ -" + formatCurrencyDisp(discount)}
                              </Text>
                            )}
                            <Text style={{ fontWeight: "500", color: C.text }}>
                              {line.discountObj?.newPrice
                                ? "$ " + formatCurrencyDisp(line.discountObj.newPrice)
                                : "$ " + formatCurrencyDisp(price * (line.qty || 1))}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <DropdownMenu
                              buttonIcon={ICONS.dollarYellow}
                              buttonIconSize={25}
                              modalCoordY={25}
                              modalCoordX={-80}
                              buttonStyle={{ borderWidth: 0, backgroundColor: "transparent" }}
                              dataArr={[
                                { label: "No Discount" },
                                ...discounts.map((o) => ({ label: o.name })),
                              ]}
                              onSelect={(item) => {
                                if (item.label === "No Discount") {
                                  handleDiscount(wo, line, null);
                                } else {
                                  handleDiscount(wo, line, discounts.find((o) => o.name === item.label));
                                }
                              }}
                            />
                            <Button_
                              onPress={() => deleteLine(wo, lineIdx)}
                              icon={ICONS.trash}
                              iconSize={21}
                              buttonStyle={{ paddingRight: 2, marginLeft: -8 }}
                            />
                          </View>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
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
                    {"$" + formatCurrencyDisp((totals.runningTotal || 0) * effectiveTaxPercent / 100)}
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
                      (totals.runningTotal || 0) + (totals.runningTotal || 0) * effectiveTaxPercent / 100
                    )}
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
