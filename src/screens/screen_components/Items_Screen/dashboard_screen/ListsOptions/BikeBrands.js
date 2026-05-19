import React from "react";
import { TextInput } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";
import { moveItemInArr } from "../../../../../utils";
import { BoxButton1, MoveArrows, BoxContainerInner } from "./_helpers";
import styles from "./ListOptions.module.css";

const BrandListSection = ({
  zSettingsObj,
  handleSettingsFieldChange,
  fieldKey,
  nameFieldKey,
  headerLabel,
  headerHasInput,
  addLabel,
  topMargin = 0,
  bottomMargin = 0,
}) => {
  const list = zSettingsObj?.[fieldKey] || [];
  return (
    <div className={styles.section}>
      <div
        className={styles.sectionHeaderEnd}
        style={{
          backgroundColor: C.buttonLightGreen,
          marginTop: topMargin,
          marginBottom: bottomMargin,
          justifyContent: headerHasInput ? "flex-end" : "center",
          padding: headerHasInput ? "5px" : "5px 20px",
        }}
      >
        {headerHasInput ? (
          <>
            <span style={{ color: C.text }}>Category Name:</span>
            <TextInput
              debounceMs={500}
              className={styles.greenInput}
              style={{
                width: "50%",
                marginLeft: 10,
                marginRight: 10,
                borderWidth: 2,
                borderColor: C.buttonLightGreenOutline,
                color: C.text,
              }}
              value={zSettingsObj?.[nameFieldKey]}
              onChangeText={(val) => {
                handleSettingsFieldChange(nameFieldKey, val);
              }}
            />
          </>
        ) : (
          <span style={{ color: C.text, marginRight: 20 }}>{headerLabel}</span>
        )}
        <BoxButton1
          onPress={() => {
            let arr = zSettingsObj?.[fieldKey];
            arr.push(addLabel);
            handleSettingsFieldChange(fieldKey, arr);
          }}
        />
      </div>

      <div className={styles.listContainer}>
        {list.map((brandName, idx) => (
          <div key={idx} className={styles.row}>
            <TextInput
              debounceMs={500}
              onChangeText={(val) => {
                let arr = zSettingsObj[fieldKey];
                arr[idx] = val;
                handleSettingsFieldChange(fieldKey, arr);
              }}
              className={styles.brandInput}
              style={{
                borderColor: C.buttonLightGreenOutline,
                color: C.text,
              }}
              value={brandName}
            />
            <MoveArrows
              index={idx}
              listLength={list.length}
              onMove={(i, dir) =>
                handleSettingsFieldChange(
                  fieldKey,
                  moveItemInArr(zSettingsObj[fieldKey], i, dir)
                )
              }
            />
            <BoxButton1
              onPress={() => {
                let arr = zSettingsObj[fieldKey].filter(
                  (name) => name !== brandName
                );
                handleSettingsFieldChange(fieldKey, arr);
              }}
              style={{ marginLeft: 5 }}
              iconSize={15}
              icon={ICONS.trash}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export const BikeBrands = ({ zSettingsObj, handleSettingsFieldChange }) => {
  return (
    <BoxContainerInner borderless style={{ alignItems: "center" }}>
      <BrandListSection
        zSettingsObj={zSettingsObj}
        handleSettingsFieldChange={handleSettingsFieldChange}
        fieldKey="bikeBrands"
        nameFieldKey="bikeBrandsName"
        headerHasInput
        addLabel="New Bike Brand..."
      />
      <BrandListSection
        zSettingsObj={zSettingsObj}
        handleSettingsFieldChange={handleSettingsFieldChange}
        fieldKey="bikeOptionalBrands"
        nameFieldKey="bikeOptionalBrandsName"
        headerHasInput
        addLabel="New Bike Brand..."
        topMargin={20}
        bottomMargin={10}
      />
      <BrandListSection
        zSettingsObj={zSettingsObj}
        handleSettingsFieldChange={handleSettingsFieldChange}
        fieldKey="bikeDescriptions"
        headerLabel="Bike Descriptions"
        addLabel="New Bike Description..."
        topMargin={20}
        bottomMargin={10}
      />
    </BoxContainerInner>
  );
};
