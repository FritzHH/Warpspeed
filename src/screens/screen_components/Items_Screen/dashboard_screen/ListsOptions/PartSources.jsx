import React from "react";
import { TextInput } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";
import { moveItemInArr } from "../../../../../utils";
import { BoxButton1, MoveArrows, BoxContainerInner } from "./_helpers";
import styles from "./ListOptions.module.css";

export const PartSources = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const list = zSettingsObj?.partSources || [];

  return (
    <BoxContainerInner borderless style={{ alignItems: "center" }}>
      <div className={styles.section}>
        <div
          className={styles.sectionHeader}
          style={{ backgroundColor: C.buttonLightGreen, padding: "5px 0" }}
        >
          <span style={{ color: C.text, marginRight: 20 }}>Part Sources</span>
          <BoxButton1
            onPress={() => {
              let partSourcesArr = zSettingsObj?.partSources;
              partSourcesArr.push("New part source...");
              handleSettingsFieldChange("partSources", partSourcesArr);
            }}
          />
        </div>

        <div className={styles.listContainer}>
          {list.map((partSourceName, idx) => (
            <div key={idx} className={styles.row}>
              <TextInput
                debounceMs={500}
                onChangeText={(val) => {
                  let partSourcesArr = zSettingsObj.partSources;
                  partSourcesArr[idx] = val;
                  handleSettingsFieldChange("partSources", partSourcesArr);
                }}
                className={styles.brandInput}
                style={{
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                }}
                value={partSourceName}
              />
              <MoveArrows
                index={idx}
                listLength={list.length}
                onMove={(i, dir) =>
                  handleSettingsFieldChange(
                    "partSources",
                    moveItemInArr(zSettingsObj.partSources, i, dir)
                  )
                }
              />
              <BoxButton1
                onPress={() => {
                  let arr = zSettingsObj.partSources.filter(
                    (name) => name !== partSourceName
                  );
                  handleSettingsFieldChange("partSources", arr);
                }}
                style={{ marginLeft: 5 }}
                iconSize={15}
                icon={ICONS.trash}
              />
            </div>
          ))}
        </div>
      </div>
    </BoxContainerInner>
  );
};
