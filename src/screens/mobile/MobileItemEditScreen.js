/* eslint-disable */
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from "react-native-web";
import { useParams } from "react-router-dom";
import { cloneDeep } from "lodash";
import { TextInput_, Button_, DropdownMenu, Image_ } from "../../components";
import { C, COLOR_GRADIENTS, ICONS } from "../../styles";
import {
  formatCurrencyDisp,
  calculateRunningTotals,
  applyDiscountToWorkorderItem,
  replaceOrAddToArr,
  gray,
  log,
} from "../../utils";
import { workerSearchInventory } from "../../inventorySearchManager";
import {
  useOpenWorkordersStore,
  useInventoryStore,
  useSettingsStore,
  useLoginStore,
} from "../../stores";
import { WORKORDER_ITEM_PROTO } from "../../data";

export function MobileItemEditScreen() {
  const { id } = useParams();
  const zWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === id) || null
  );
  const zInventoryArr = useInventoryStore((state) => state.items);
  const zDiscounts = useSettingsStore((state) => state.settings?.discounts);
  const zSalesTaxPercent = useSettingsStore(
    (state) => state.settings?.salesTaxPercent
  );

  const [sSearchText, _setSearchText] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sShowSearch, _setShowSearch] = useState(false);
  const [sTotals, _setTotals] = useState({
    runningQty: 0,
    runningTotal: 0,
    runningDiscount: 0,
    runningSubtotal: 0,
    runningTax: 0,
    finalTotal: 0,
  });

  // Recalculate running totals when workorder lines change
  useEffect(() => {
    if (!zWorkorder) return;
    const totals = calculateRunningTotals(
      zWorkorder,
      zSalesTaxPercent || 0,
      [],
      false,
      !!zWorkorder.taxFree
    );
    _setTotals(totals);
  }, [zWorkorder?.workorderLines, zSalesTaxPercent]);

  if (!zWorkorder) {
    return (
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <Text style={{ color: C.lightText, fontSize: 16 }}>
          Workorder not found
        </Text>
      </View>
    );
  }

  //////////////////////////////////////////////////////////////
  // Inventory search
  //////////////////////////////////////////////////////////////
  function handleSearch(text) {
    _setSearchText(text);
    if (text.length < 2) {
      _setSearchResults([]);
      return;
    }
    workerSearchInventory(text, (results) => {
      _setSearchResults(results.slice(0, 20));
    });
  }

  //////////////////////////////////////////////////////////////
  // Add item to workorder
  //////////////////////////////////////////////////////////////
  function addItem(item) {
    useLoginStore.getState().requireLogin(() => {
      let workorderLines = zWorkorder.workorderLines || [];
      let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
      lineItem.inventoryItem = item;
      lineItem.id = crypto.randomUUID();
      workorderLines = [...workorderLines, lineItem];
      useOpenWorkordersStore
        .getState()
        .setField("workorderLines", workorderLines, id);
      _setSearchText("");
      _setSearchResults([]);
      _setShowSearch(false);
    });
  }

  //////////////////////////////////////////////////////////////
  // Delete item
  //////////////////////////////////////////////////////////////
  function deleteItem(index) {
    useLoginStore.getState().requireLogin(() => {
      let workorderLines = zWorkorder.workorderLines.filter(
        (o, idx) => idx !== index
      );
      useOpenWorkordersStore
        .getState()
        .setField("workorderLines", workorderLines, id);
    });
  }

  //////////////////////////////////////////////////////////////
  // Modify qty
  //////////////////////////////////////////////////////////////
  function modifyQty(workorderLine, option) {
    useLoginStore.getState().requireLogin(() => {
      let newLine = cloneDeep(workorderLine);
      if (option === "up") {
        newLine.qty = newLine.qty + 1;
      } else {
        if (newLine.qty <= 1) return;
        newLine.qty = newLine.qty - 1;
      }
      // Recalculate discount if applied
      if (newLine.discountObj?.name) {
        let discounted = applyDiscountToWorkorderItem(newLine);
        if (discounted.discountObj?.newPrice > 0) newLine = discounted;
      }
      useOpenWorkordersStore
        .getState()
        .setField(
          "workorderLines",
          replaceOrAddToArr(zWorkorder.workorderLines, newLine),
          id
        );
    });
  }

  //////////////////////////////////////////////////////////////
  // Split items
  //////////////////////////////////////////////////////////////
  function splitItem(workorderLine, index) {
    useLoginStore.getState().requireLogin(() => {
      let num = workorderLine.qty;
      let workorderLines = cloneDeep(zWorkorder.workorderLines);
      for (let i = 0; i <= num - 1; i++) {
        let newLine = cloneDeep(workorderLine);
        newLine.qty = 1;
        newLine.id = crypto.randomUUID();
        newLine.discountObj = null;
        if (i === 0) {
          workorderLines[index] = newLine;
          continue;
        }
        workorderLines.splice(index + 1, 0, newLine);
      }
      useOpenWorkordersStore
        .getState()
        .setField("workorderLines", workorderLines, id);
    });
  }

  //////////////////////////////////////////////////////////////
  // Apply discount
  //////////////////////////////////////////////////////////////
  function applyDiscount(workorderLine, discountObj) {
    useLoginStore.getState().requireLogin(() => {
      let workorderLines = zWorkorder.workorderLines.map((o) => {
        if (o.id === workorderLine.id) {
          workorderLine = { ...workorderLine, discountObj };
          return applyDiscountToWorkorderItem(workorderLine);
        }
        return o;
      });
      useOpenWorkordersStore
        .getState()
        .setField("workorderLines", workorderLines, id);
    });
  }

  function clearDiscount(workorderLine) {
    useLoginStore.getState().requireLogin(() => {
      let workorderLines = zWorkorder.workorderLines.map((o) => {
        if (o.id === workorderLine.id) {
          return { ...workorderLine, discountObj: null };
        }
        return o;
      });
      useOpenWorkordersStore
        .getState()
        .setField("workorderLines", workorderLines, id);
    });
  }

  //////////////////////////////////////////////////////////////
  // Render
  //////////////////////////////////////////////////////////////
  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWhite }}>
      {/* Search bar */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: C.buttonLightGreen,
          borderBottomWidth: 1,
          borderBottomColor: C.buttonLightGreenOutline,
        }}
      >
        {sShowSearch ? (
          <View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <TextInput_
                  placeholder="Search inventory..."
                  value={sSearchText}
                  onChangeText={handleSearch}
                  autoFocus={true}
                  style={{
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    fontSize: 16,
                    color: C.text,
                    backgroundColor: C.listItemWhite,
                    outlineWidth: 0,
                  }}
                  debounceMS={200}
                />
              </View>
              <TouchableOpacity
                onPress={() => {
                  _setShowSearch(false);
                  _setSearchText("");
                  _setSearchResults([]);
                }}
                style={{ marginLeft: 10, paddingVertical: 8 }}
              >
                <Text
                  style={{ color: C.red, fontSize: 15, fontWeight: "500" }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search results */}
            {sSearchResults.length > 0 && (
              <View
                style={{
                  marginTop: 8,
                  maxHeight: 250,
                  backgroundColor: C.listItemWhite,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: gray(0.85),
                }}
              >
                <ScrollView>
                  {sSearchResults.map((item, idx) => (
                    <TouchableOpacity
                      key={item.id || idx}
                      onPress={() => addItem(item)}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderTopWidth: idx > 0 ? 1 : 0,
                        borderTopColor: gray(0.92),
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 15,
                          color: C.text,
                          flex: 1,
                          marginRight: 10,
                        }}
                      >
                        {item.formalName || item.informalName || "Unknown"}
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          color: C.green,
                          fontWeight: "500",
                        }}
                      >
                        ${formatCurrencyDisp(item.price)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        ) : (
          <Button_
            text="Add Item"
            icon={ICONS.new}
            iconSize={20}
            colorGradientArr={COLOR_GRADIENTS.green}
            onPress={() => _setShowSearch(true)}
            buttonStyle={{
              paddingVertical: 12,
              borderRadius: 5,
            }}
            textStyle={{ fontSize: 16, fontWeight: "500" }}
          />
        )}
      </View>

      {/* Current items list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
      >
        {(!zWorkorder.workorderLines ||
          zWorkorder.workorderLines.length === 0) && (
          <View
            style={{
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 40,
            }}
          >
            <Text style={{ fontSize: 15, color: C.lightText }}>
              No items added yet
            </Text>
          </View>
        )}

        {zWorkorder.workorderLines?.map((line, idx) => {
          const item = line.inventoryItem;
          const unitPrice = line.useSalePrice ? item?.salePrice : item?.price;
          const lineTotal = line.discountObj?.newPrice
            ? line.discountObj.newPrice
            : (unitPrice || 0) * (line.qty || 1);

          return (
            <View
              key={line.id || idx}
              style={{
                backgroundColor: idx % 2 === 0 ? C.listItemWhite : gray(0.97),
                borderRadius: 10,
                padding: 14,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: gray(0.9),
              }}
            >
              {/* Item name + price */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 8,
                }}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 15,
                    fontWeight: "500",
                    color: C.text,
                    flex: 1,
                    marginRight: 8,
                  }}
                >
                  {item?.formalName || "Unknown Item"}
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: C.text,
                  }}
                >
                  ${formatCurrencyDisp(lineTotal)}
                </Text>
              </View>

              {/* Unit price if qty > 1 */}
              {line.qty > 1 && (
                <Text
                  style={{
                    fontSize: 13,
                    color: C.lightText,
                    marginBottom: 6,
                  }}
                >
                  ${formatCurrencyDisp(unitPrice)} each
                </Text>
              )}

              {/* Discount display */}
              {!!line.discountObj?.name && (
                <Text
                  style={{
                    fontSize: 13,
                    color: C.lightred,
                    marginBottom: 6,
                  }}
                >
                  {line.discountObj.name}
                  {line.discountObj.savings
                    ? " (-$" +
                      formatCurrencyDisp(line.discountObj.savings) +
                      ")"
                    : ""}
                </Text>
              )}

              {/* Intake notes */}
              {!!line.intakeNotes && (
                <Text
                  style={{
                    fontSize: 13,
                    color: "orange",
                    marginBottom: 6,
                  }}
                >
                  {line.intakeNotes}
                </Text>
              )}

              {/* Receipt notes */}
              {!!line.receiptNotes && (
                <Text
                  style={{
                    fontSize: 13,
                    color: C.green,
                    marginBottom: 6,
                  }}
                >
                  {line.receiptNotes}
                </Text>
              )}

              {/* Qty row */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: C.lightText,
                    marginRight: 10,
                  }}
                >
                  Qty
                </Text>
                <TouchableOpacity
                  onPress={() => modifyQty(line, "down")}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    backgroundColor: line.qty <= 1 ? gray(0.85) : C.blue,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    −
                  </Text>
                </TouchableOpacity>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "600",
                    color: C.text,
                    minWidth: 40,
                    textAlign: "center",
                  }}
                >
                  {line.qty}
                </Text>
                <TouchableOpacity
                  onPress={() => modifyQty(line, "up")}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    backgroundColor: C.blue,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    +
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Actions row: Split + Discount + Remove */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {/* Split button — only if qty > 1 */}
                {line.qty > 1 && (
                  <TouchableOpacity
                    onPress={() => splitItem(line, idx)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: C.buttonLightGreen,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 6,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      marginRight: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: C.text,
                        fontWeight: "500",
                      }}
                    >
                      Split
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Discount dropdown */}
                <View style={{ marginRight: 8 }}>
                  <DropdownMenu
                    buttonText="Discount"
                    buttonStyle={{
                      backgroundColor: C.buttonLightGreen,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 6,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}
                    buttonTextStyle={{
                      fontSize: 13,
                      color: C.text,
                      fontWeight: "500",
                    }}
                    dataArr={[
                      { label: "No Discount" },
                      ...(zDiscounts || []).map((o) => ({
                        label: o.name,
                      })),
                    ]}
                    onSelect={(selected) => {
                      if (selected.label === "No Discount") {
                        clearDiscount(line);
                      } else {
                        let discountObj = zDiscounts.find(
                          (o) => o.name === selected.label
                        );
                        if (discountObj) applyDiscount(line, discountObj);
                      }
                    }}
                  />
                </View>

                {/* Remove button */}
                <TouchableOpacity
                  onPress={() => deleteItem(idx)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: C.lightred,
                    borderRadius: 6,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    marginLeft: "auto",
                  }}
                >
                  <Image_ icon={ICONS.trash} size={16} />
                  <Text
                    style={{
                      fontSize: 13,
                      color: "white",
                      fontWeight: "500",
                      marginLeft: 4,
                    }}
                  >
                    Remove
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* Bottom spacer for totals bar */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Bottom totals bar */}
      <View
        style={{
          backgroundColor: C.buttonLightGreen,
          borderTopWidth: 1,
          borderTopColor: C.buttonLightGreenOutline,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View>
          <Text style={{ fontSize: 12, color: C.lightText }}>
            {sTotals.runningQty} item{sTotals.runningQty !== 1 ? "s" : ""}
          </Text>
          {sTotals.runningDiscount > 0 && (
            <Text style={{ fontSize: 12, color: C.lightred }}>
              Disc: -${formatCurrencyDisp(sTotals.runningDiscount)}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, color: C.lightText }}>
            Sub: ${formatCurrencyDisp(sTotals.runningTotal)} + Tax: $
            {formatCurrencyDisp(sTotals.runningTax)}
          </Text>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: C.text,
            }}
          >
            ${formatCurrencyDisp(sTotals.finalTotal)}
          </Text>
        </View>
      </View>
    </View>
  );
}
