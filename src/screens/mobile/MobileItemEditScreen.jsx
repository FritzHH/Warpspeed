/* eslint-disable */
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import cloneDeep from "lodash/cloneDeep";
import { TextInput, Button, DropdownMenu, Image } from "../../dom_components";
import { C, COLOR_GRADIENTS, ICONS, Radius } from "../../styles";
import { formatCurrencyDisp, calculateRunningTotals, applyDiscountToWorkorderItem, replaceOrAddToArr } from "../../utils";
import { workerSearchInventory } from "../../inventorySearchManager";
import {
  useOpenWorkordersStore,
  useInventoryStore,
  useSettingsStore,
} from "../../stores";
import { WORKORDER_ITEM_PROTO } from "../../data";
import styles from "./MobileItemEditScreen.module.css";

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
      <div className={styles.notFound}>
        <span className={styles.notFoundText} style={{ color: C.lightText }}>
          Workorder not found
        </span>
      </div>
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
    let workorderLines = zWorkorder.workorderLines || [];
    let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
    const { _score, ...cleanItem } = item;
    lineItem.inventoryItem = cleanItem;
    lineItem.id = crypto.randomUUID();
    workorderLines = [...workorderLines, lineItem];
    useOpenWorkordersStore
      .getState()
      .setField("workorderLines", workorderLines, id);
    _setSearchText("");
    _setSearchResults([]);
    _setShowSearch(false);
  }

  //////////////////////////////////////////////////////////////
  // Delete item
  //////////////////////////////////////////////////////////////
  function deleteItem(index) {
    let workorderLines = zWorkorder.workorderLines.filter(
      (o, idx) => idx !== index
    );
    useOpenWorkordersStore
      .getState()
      .setField("workorderLines", workorderLines, id);
  }

  //////////////////////////////////////////////////////////////
  // Modify qty
  //////////////////////////////////////////////////////////////
  function modifyQty(workorderLine, option) {
    let newLine = cloneDeep(workorderLine);
    if (option === "up") {
      newLine.qty = newLine.qty + 1;
    } else {
      if (newLine.qty <= 1) return;
      newLine.qty = newLine.qty - 1;
    }
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
  }

  //////////////////////////////////////////////////////////////
  // Split items
  //////////////////////////////////////////////////////////////
  function splitItem(workorderLine, index) {
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
  }

  //////////////////////////////////////////////////////////////
  // Apply discount
  //////////////////////////////////////////////////////////////
  function applyDiscount(workorderLine, discountObj) {
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
  }

  function clearDiscount(workorderLine) {
    let workorderLines = zWorkorder.workorderLines.map((o) => {
      if (o.id === workorderLine.id) {
        return { ...workorderLine, discountObj: null };
      }
      return o;
    });
    useOpenWorkordersStore
      .getState()
      .setField("workorderLines", workorderLines, id);
  }

  //////////////////////////////////////////////////////////////
  // Render
  //////////////////////////////////////////////////////////////
  return (
    <div className={styles.root} style={{ backgroundColor: C.backgroundWhite }}>
      {/* Search bar */}
      <div
        className={styles.searchBar}
        style={{
          backgroundColor: C.buttonLightGreen,
          borderBottomColor: C.buttonLightGreenOutline,
        }}
      >
        {sShowSearch ? (
          <div>
            <div className={styles.searchRow}>
              <div className={styles.searchInputWrap}>
                <TextInput
                  placeholder="Search inventory..."
                  value={sSearchText}
                  onChangeText={handleSearch}
                  autoFocus={true}
                  style={{
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: Radius.row,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    fontSize: 16,
                    color: C.text,
                    backgroundColor: C.listItemWhite,
                    outlineWidth: 0,
                  }}
                  debounceMs={200}
                />
              </div>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => {
                  _setShowSearch(false);
                  _setSearchText("");
                  _setSearchResults([]);
                }}
              >
                <span className={styles.cancelText} style={{ color: C.red }}>
                  Cancel
                </span>
              </button>
            </div>

            {/* Search results */}
            {sSearchResults.length > 0 && (
              <div
                className={styles.resultsBox}
                style={{
                  backgroundColor: C.listItemWhite,
                  borderColor: C.borderStrong,
                }}
              >
                <div className={styles.resultsScroll}>
                  {sSearchResults.map((item, idx) => (
                    <button
                      type="button"
                      key={item.id || idx}
                      onClick={() => addItem(item)}
                      className={styles.resultRow}
                      style={{
                        borderTop:
                          idx > 0 ? `1px solid ${C.borderStrong}` : "none",
                      }}
                    >
                      <span
                        className={styles.resultName}
                        style={{ color: C.text }}
                      >
                        {item.formalName || item.informalName || "Unknown"}
                      </span>
                      <span
                        className={styles.resultPrice}
                        style={{ color: C.green }}
                      >
                        ${formatCurrencyDisp(item.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Button
            text="Add Item"
            icon={ICONS.new}
            iconSize={20}
            colorGradientArr={COLOR_GRADIENTS.green}
            onPress={() => _setShowSearch(true)}
            buttonStyle={{
              paddingVertical: 12,
              borderRadius: Radius.control,
            }}
            textStyle={{ fontSize: 16, fontWeight: "500" }}
          />
        )}
      </div>

      {/* Current items list */}
      <div className={styles.itemsScroll}>
        {(!zWorkorder.workorderLines ||
          zWorkorder.workorderLines.length === 0) && (
          <div className={styles.empty}>
            <span className={styles.emptyText} style={{ color: C.lightText }}>
              No items added yet
            </span>
          </div>
        )}

        {zWorkorder.workorderLines?.map((line, idx) => {
          const item = line.inventoryItem;
          const unitPrice = line.useSalePrice ? item?.salePrice : item?.price;
          const lineTotal = line.discountObj?.newPrice
            ? line.discountObj.newPrice
            : (unitPrice || 0) * (line.qty || 1);

          return (
            <div
              key={line.id || idx}
              className={styles.lineCard}
              style={{
                backgroundColor: idx % 2 === 0 ? C.listItemWhite : C.surfaceAlt,
                borderColor: C.borderStrong,
              }}
            >
              {/* Item name + price */}
              <div className={styles.nameRow}>
                <span className={styles.itemName} style={{ color: C.text }}>
                  {item?.formalName || "Unknown Item"}
                </span>
                <span className={styles.itemTotal} style={{ color: C.text }}>
                  ${formatCurrencyDisp(lineTotal)}
                </span>
              </div>

              {/* Unit price if qty > 1 */}
              {line.qty > 1 && (
                <span
                  className={styles.unitPrice}
                  style={{ color: C.lightText }}
                >
                  ${formatCurrencyDisp(unitPrice)} each
                </span>
              )}

              {/* Discount display */}
              {!!line.discountObj?.name && (
                <span
                  className={styles.discountText}
                  style={{ color: C.lightred }}
                >
                  {line.discountObj.name}
                  {line.discountObj.savings
                    ? " (-$" +
                      formatCurrencyDisp(line.discountObj.savings) +
                      ")"
                    : ""}
                </span>
              )}

              {/* Intake notes */}
              {!!line.intakeNotes && (
                <span
                  className={styles.intakeText}
                  style={{ color: "orange" }}
                >
                  {line.intakeNotes}
                </span>
              )}

              {/* Receipt notes */}
              {!!line.receiptNotes && (
                <span
                  className={styles.receiptText}
                  style={{ color: C.green }}
                >
                  {line.receiptNotes}
                </span>
              )}

              {/* Qty row */}
              <div className={styles.qtyRow}>
                <span className={styles.qtyLabel} style={{ color: C.lightText }}>
                  Qty
                </span>
                <button
                  type="button"
                  onClick={() => modifyQty(line, "down")}
                  className={styles.qtyBtn}
                  style={{
                    backgroundColor: line.qty <= 1 ? C.surfaceAlt : C.blue,
                  }}
                >
                  <span className={styles.qtyBtnText}>−</span>
                </button>
                <span className={styles.qtyValue} style={{ color: C.text }}>
                  {line.qty}
                </span>
                <button
                  type="button"
                  onClick={() => modifyQty(line, "up")}
                  className={styles.qtyBtn}
                  style={{ backgroundColor: C.blue }}
                >
                  <span className={styles.qtyBtnText}>+</span>
                </button>
              </div>

              {/* Actions row: Split + Discount + Remove */}
              <div className={styles.actionsRow}>
                {/* Split button — only if qty > 1 */}
                {line.qty > 1 && (
                  <button
                    type="button"
                    onClick={() => splitItem(line, idx)}
                    className={styles.splitBtn}
                    style={{
                      backgroundColor: C.buttonLightGreen,
                      borderColor: C.buttonLightGreenOutline,
                    }}
                  >
                    <span className={styles.splitText} style={{ color: C.text }}>
                      Split
                    </span>
                  </button>
                )}

                {/* Discount dropdown */}
                <div className={styles.discountWrap}>
                  <DropdownMenu
                    buttonText="Discount"
                    buttonStyle={{
                      backgroundColor: C.buttonLightGreen,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: Radius.control,
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
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => deleteItem(idx)}
                  className={styles.removeBtn}
                  style={{ backgroundColor: C.lightred }}
                >
                  <Image icon={ICONS.trash} size={16} />
                  <span className={styles.removeText}>Remove</span>
                </button>
              </div>
            </div>
          );
        })}

        {/* Bottom spacer for totals bar */}
        <div className={styles.bottomSpacer} />
      </div>

      {/* Bottom totals bar */}
      <div
        className={styles.totalsBar}
        style={{
          backgroundColor: C.buttonLightGreen,
          borderTopColor: C.buttonLightGreenOutline,
        }}
      >
        <div className={styles.totalsLeft}>
          <span className={styles.totalsSmall} style={{ color: C.lightText }}>
            {sTotals.runningQty} item{sTotals.runningQty !== 1 ? "s" : ""}
          </span>
          {sTotals.runningDiscount > 0 && (
            <span
              className={styles.totalsDiscount}
              style={{ color: C.lightred }}
            >
              Disc: -${formatCurrencyDisp(sTotals.runningDiscount)}
            </span>
          )}
        </div>
        <div className={styles.totalsRight}>
          <span className={styles.totalsSmall} style={{ color: C.lightText }}>
            Sub: ${formatCurrencyDisp(sTotals.runningTotal)} + Tax: $
            {formatCurrencyDisp(sTotals.runningTax)}
          </span>
          <span className={styles.totalsFinal} style={{ color: C.text }}>
            ${formatCurrencyDisp(sTotals.finalTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
