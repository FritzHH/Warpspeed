import React from "react";
import { TextInput } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";
import { moveItemInArr } from "../../../../../utils";
import { DISCOUNT_TYPES } from "../../../../../constants";
import { BoxButton1, MoveArrows, BoxContainerInner } from "./_helpers";
import styles from "./ListOptions.module.css";

export const Discounts = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const list = zSettingsObj?.discounts || [];

  return (
    <BoxContainerInner borderless style={{ alignItems: "center" }}>
      <div className={styles.section}>
        <div className={styles.sectionWrapperDiscounts}>
          <div
            className={styles.sectionHeaderFull}
            style={{ backgroundColor: C.buttonLightGreen }}
          >
            <span style={{ color: C.text, marginRight: 20 }}>Discounts</span>
            <BoxButton1
              onPress={() => {
                let discount = {};
                discount.name = "";
                discount.type = DISCOUNT_TYPES.percent;
                discount.value = "20";
                discount.id = crypto.randomUUID();
                let discountsArr = [discount, ...(zSettingsObj.discounts || [])];
                handleSettingsFieldChange("discounts", discountsArr);
              }}
            />
          </div>
        </div>

        <div className={styles.listContainer}>
          {list.map((item, idx) => {
            const isEmptyName = !item.name || item.name.trim() === "";
            const rowBg = isEmptyName ? C.lightred : C.listItemWhite;
            return (
            <div key={item.id || idx} className={styles.rowSpaced} style={{ justifyContent: "center" }}>
              <TextInput
                debounceMs={500}
                onChangeText={(val) => {
                  let discountsArr = zSettingsObj.discounts.map((o) => {
                    if (o.id === item.id) return { ...o, name: val };
                    return o;
                  });
                  handleSettingsFieldChange("discounts", discountsArr);
                }}
                placeholder="Discount Name"
                placeholderTextColor={C.textDisabled}
                className={styles.discountInput}
                style={{
                  width: "50%",
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  backgroundColor: rowBg,
                }}
                value={item.name}
              />
              <TextInput
                debounceMs={500}
                onChangeText={(val) => {
                  let raw = val.replace(/[^0-9]/g, "");
                  let isPercent = item.type === DISCOUNT_TYPES.percent;
                  let stored;
                  if (raw === "") {
                    stored = "";
                  } else {
                    let num = Number(raw);
                    if (isPercent) {
                      if (num > 100) num = 100;
                      stored = String(num);
                    } else {
                      stored = String(num * 100);
                    }
                  }
                  let discountsArr = zSettingsObj.discounts.map((o) => {
                    if (o.id === item.id) return { ...o, value: stored };
                    return o;
                  });
                  handleSettingsFieldChange("discounts", discountsArr);
                }}
                placeholder="Value"
                placeholderTextColor={C.textDisabled}
                className={styles.discountInput}
                style={{
                  width: "10%",
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  backgroundColor: rowBg,
                }}
                value={
                  item.value === "" || item.value == null
                    ? ""
                    : item.type === DISCOUNT_TYPES.percent
                      ? item.value
                      : String(Math.round(Number(item.value) / 100))
                }
              />
              <div className={styles.actionsGroup40}>
                <button
                  type="button"
                  onClick={() => {
                    // Cycle: % -> $ (per-line) -> $ EA (per-item) -> %
                    const isPercent = item.type === DISCOUNT_TYPES.percent;
                    const isDollarPerLine =
                      item.type === DISCOUNT_TYPES.dollar && !item.perItem;
                    let next;
                    if (isPercent) {
                      next = { type: DISCOUNT_TYPES.dollar, perItem: false };
                    } else if (isDollarPerLine) {
                      next = { type: DISCOUNT_TYPES.dollar, perItem: true };
                    } else {
                      next = { type: DISCOUNT_TYPES.percent, perItem: false };
                    }
                    let discountsArr = zSettingsObj.discounts.map((o) => {
                      if (o.id === item.id) return { ...o, ...next };
                      return o;
                    });
                    handleSettingsFieldChange("discounts", discountsArr);
                  }}
                  className={styles.discountTypeToggle}
                  style={{
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: C.listItemWhite,
                  }}
                  aria-label={
                    item.type === DISCOUNT_TYPES.percent
                      ? "Percent (click for dollar per line)"
                      : item.perItem
                        ? "Dollar per item (click for percent)"
                        : "Dollar per line (click for dollar per item)"
                  }
                >
                  <span className={styles.discountTypeToggleText} style={{ color: C.text }}>
                    {item.type === DISCOUNT_TYPES.percent
                      ? "%"
                      : item.perItem
                        ? "$ EA"
                        : "$"}
                  </span>
                </button>
                <MoveArrows
                  index={idx}
                  listLength={list.length}
                  onMove={(i, dir) =>
                    handleSettingsFieldChange(
                      "discounts",
                      moveItemInArr(zSettingsObj.discounts, i, dir)
                    )
                  }
                />
                <BoxButton1
                  onPress={() => {
                    let arr = zSettingsObj.discounts.filter(
                      (o) => o.id !== item.id
                    );
                    handleSettingsFieldChange("discounts", arr);
                  }}
                  style={{ marginLeft: 5 }}
                  iconSize={15}
                  icon={ICONS.trash}
                />
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </BoxContainerInner>
  );
};
