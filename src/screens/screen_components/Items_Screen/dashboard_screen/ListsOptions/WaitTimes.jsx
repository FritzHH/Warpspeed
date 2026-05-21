import React from "react";
import { TextInput } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";
import { moveItemInArr } from "../../../../../utils";
import { BoxButton1, MoveArrows, BoxContainerInner } from "./_helpers";
import styles from "./ListOptions.module.css";

export const WaitTimes = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const sortedWaitTimes = [...(zSettingsObj?.waitTimes || [])].sort(
    (a, b) => (Number(a.maxWaitTimeDays) || 0) - (Number(b.maxWaitTimeDays) || 0)
  );

  return (
    <BoxContainerInner borderless style={{ alignItems: "center" }}>
      <div className={styles.section}>
        <div className={styles.sectionWrapper}>
          <div
            className={styles.sectionHeaderFull}
            style={{ backgroundColor: C.buttonLightGreen }}
          >
            <span style={{ color: C.text, marginRight: 20 }}>Wait Estimates</span>
            <BoxButton1
              onPress={() => {
                let waitTimesArr = zSettingsObj.waitTimes;
                let waitTime = {};
                waitTime.label = "New wait time...";
                waitTime.maxWaitTimeDays = 0;
                waitTime.id = crypto.randomUUID();
                waitTimesArr.push(waitTime);
                handleSettingsFieldChange("waitTimes", waitTimesArr);
              }}
            />
          </div>
        </div>

        <div className={styles.colHeaderRow}>
          <div className={styles.colHeader66}>
            <span style={{ color: C.text }}>Label</span>
          </div>
          <div className={styles.colHeader10Center}>
            <span style={{ color: C.text, textAlign: "center", fontSize: 12 }}>
              Max Wait Days
            </span>
          </div>
          <div className={styles.colHeader20}></div>
        </div>

        <div className={styles.listContainer}>
          {sortedWaitTimes.map((item, idx) => (
            <div key={item.id || idx} className={styles.rowSpaced}>
              <TextInput
                debounceMs={500}
                onChangeText={(val) => {
                  let arr = zSettingsObj.waitTimes.map((o) => {
                    if (o.id === item.id) return { ...o, label: val };
                    return o;
                  });
                  handleSettingsFieldChange("waitTimes", arr);
                }}
                placeholder="Wait time label"
                placeholderTextColor={C.textDisabled}
                className={styles.smallInput}
                style={{
                  width: "70%",
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  backgroundColor: C.listItemWhite,
                }}
                value={item.label}
              />
              <TextInput
                debounceMs={500}
                onChangeText={(val) => {
                  let arr = zSettingsObj.waitTimes.map((o) => {
                    if (o.id === item.id) return { ...o, maxWaitTimeDays: val };
                    return o;
                  });
                  handleSettingsFieldChange("waitTimes", arr);
                }}
                placeholder="Days"
                placeholderTextColor={C.textDisabled}
                className={styles.smallInput}
                style={{
                  width: "10%",
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  backgroundColor: C.listItemWhite,
                }}
                value={item.maxWaitTimeDays}
              />
              <div className={styles.actionsGroup20}>
                <MoveArrows
                  index={idx}
                  listLength={sortedWaitTimes.length}
                  onMove={(i, dir) =>
                    handleSettingsFieldChange(
                      "waitTimes",
                      moveItemInArr(sortedWaitTimes, i, dir)
                    )
                  }
                />
                <BoxButton1
                  onPress={() => {
                    let arr = zSettingsObj.waitTimes.filter(
                      (o) => o.id !== item.id
                    );
                    handleSettingsFieldChange("waitTimes", arr);
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
