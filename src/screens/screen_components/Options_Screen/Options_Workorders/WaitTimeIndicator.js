/* eslint-disable */
import React from "react";
import { capitalizeFirstLetterOfString } from "../../../../utils";
import { C, ICONS } from "../../../../styles";
import { computeWaitInfo, formatPickupDeliveryTime, MONTH_LABELS_SHORT, DAY_LABELS_SHORT } from "./utils";
import styles from "./WaitTimeIndicator.module.css";

const WaitTimeIndicator = React.memo(function WaitTimeIndicator({ workorder }) {
  const isPickupDelivery = workorder.status === "pickup" || workorder.status === "delivery";
  const pd = workorder.pickupDelivery;

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
          ) : (
            <img src={ICONS.questionMark} className={styles.questionIcon} alt="" />
          )}
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
