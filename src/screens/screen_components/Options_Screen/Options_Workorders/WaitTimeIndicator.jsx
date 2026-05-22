/* eslint-disable */
import React from "react";
import { capitalizeFirstLetterOfString, lightenRGBByPercent } from "../../../../utils";
import { C, ICONS } from "../../../../styles";
import { computeWaitInfo, formatPickupDeliveryTime, isFinishedStatus, MONTH_LABELS_SHORT, DAY_LABELS_SHORT, NUM_MILLIS_IN_DAY } from "./utils";
import styles from "./WaitTimeIndicator.module.css";

const WaitTimeIndicator = React.memo(function WaitTimeIndicator({ workorder, daysSinceLastText }) {
  const isPickupDelivery = workorder.status === "pickup" || workorder.status === "delivery";
  const pd = workorder.pickupDelivery;

  if (isFinishedStatus(workorder)) {
    const showPill = daysSinceLastText != null && daysSinceLastText >= 3;
    let daysInShop = 0;
    if (workorder.startedOnMillis) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfStart = new Date(workorder.startedOnMillis);
      startOfStart.setHours(0, 0, 0, 0);
      daysInShop = Math.round((startOfToday.getTime() - startOfStart.getTime()) / NUM_MILLIS_IN_DAY);
    }
    const showInShop = daysInShop >= 10;

    let pillBg = null;
    if (showPill) {
      if (daysSinceLastText <= 3) pillBg = lightenRGBByPercent(C.green, 65);
      else if (daysSinceLastText <= 5) pillBg = lightenRGBByPercent(C.orange, 55);
      else pillBg = lightenRGBByPercent(C.lightred, 35);
    }

    return (
      <div
        className={styles.container}
        style={{
          backgroundColor: C.buttonLightGreen,
          borderColor: C.buttonLightGreenOutline,
          justifyContent: "center",
          paddingRight: 0,
          flexDirection: "column",
        }}
      >
        {showPill && (
          <div className={styles.daysPill} style={{ backgroundColor: pillBg }}>
            <img src={ICONS.cellPhone} alt="" className={styles.daysPillIcon} />
            <span className={styles.daysPillText} style={{ color: C.text }}>{daysSinceLastText} days</span>
          </div>
        )}
        {showInShop && (
          <span className={styles.inShopText}>{daysInShop} days in shop</span>
        )}
      </div>
    );
  }

  if (isPickupDelivery) {
    const hasDate = pd?.month && pd?.day;
    let dateStr = "";
    let timeStr = "";
    let isToday = false;
    let isTomorrow = false;
    if (hasDate) {
      const now = new Date();
      const d = new Date(now.getFullYear(), Number(pd.month) - 1, Number(pd.day));
      isToday = Number(pd.month) === now.getMonth() + 1 && Number(pd.day) === now.getDate();
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      isTomorrow = Number(pd.month) === tom.getMonth() + 1 && Number(pd.day) === tom.getDate();
      dateStr = DAY_LABELS_SHORT[d.getDay()] + ", " + MONTH_LABELS_SHORT[Number(pd.month) - 1] + " " + pd.day;
      timeStr = pd.startTime
        ? formatPickupDeliveryTime(pd.startTime) + (pd.endTime ? "-" + formatPickupDeliveryTime(pd.endTime) : "")
        : "";
    }
    const textColor = isToday ? C.red : isTomorrow ? C.green : C.text;

    return (
      <div
        className={styles.container}
        style={{
          backgroundColor: C.buttonLightGreen,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        <div className={styles.content} style={{ alignItems: "flex-end" }}>
          {hasDate ? (
            <>
              {isToday ? (
                <span className={styles.dateText} style={{ color: textColor, fontSize: 13 }}>Today</span>
              ) : isTomorrow ? (
                <span className={styles.dateText} style={{ color: textColor, fontSize: 13 }}>Tomorrow</span>
              ) : (
                <span className={styles.dateText} style={{ color: textColor, fontSize: 12 }}>
                  {dateStr}
                </span>
              )}
              {!!timeStr && (
                <span className={styles.timeText} style={{ color: C.text }}>
                  {timeStr}
                </span>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  const info = computeWaitInfo(workorder);

  return (
    <div
      className={styles.container}
      style={{
        backgroundColor: C.buttonLightGreen,
        borderColor: C.buttonLightGreenOutline,
      }}
    >
      <div className={styles.content} style={{ alignItems: "flex-end" }}>
        {info.isMissing ? null : !!info.waitEndDay && info.waitEndDay.includes("\n") ? (
          <>
            <span className={styles.prefixText} style={{ color: info.textColor }}>
              {capitalizeFirstLetterOfString(info.waitEndDay.split("\n")[0])}
            </span>
            <span className={styles.dayText} style={{ color: info.textColor }}>
              {info.waitEndDay.split("\n")[1]}
            </span>
          </>
        ) : !!info.waitEndDay ? (
          <span className={styles.dayText} style={{ color: info.textColor, fontStyle: info.isItalic ? "italic" : "normal" }}>
            {capitalizeFirstLetterOfString(info.waitEndDay)}
          </span>
        ) : null}
      </div>
    </div>
  );
});

export default WaitTimeIndicator;
