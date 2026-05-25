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
                let discountsArr = zSettingsObj.discounts;
                let discount = {};
                discount.name = "";
                discount.type = DISCOUNT_TYPES.percent;
                discount.value = "20";
                discount.id = crypto.randomUUID();
                discountsArr.push(discount);
                handleSettingsFieldChange("discounts", discountsArr);
              }}
            />
          </div>
        </div>

        <div className={styles.listContainer}>
          {list.map((item, idx) => (
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
                  backgroundColor: C.listItemWhite,
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
                  backgroundColor: C.listItemWhite,
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
                    let newType =
                      item.type === DISCOUNT_TYPES.percent
                        ? DISCOUNT_TYPES.dollar
                        : DISCOUNT_TYPES.percent;
                    let discountsArr = zSettingsObj.discounts.map((o) => {
                      if (o.id === item.id) return { ...o, type: newType };
                      return o;
                    });
                    handleSettingsFieldChange("discounts", discountsArr);
                  }}
                  className={styles.discountTypeToggle}
                  style={{
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: C.listItemWhite,
                  }}
                >
                  <span className={styles.discountTypeToggleText} style={{ color: C.text }}>
                    {item.type === DISCOUNT_TYPES.percent ? "%" : "$"}
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
          ))}
        </div>
      </div>
    </BoxContainerInner>
  );
};
