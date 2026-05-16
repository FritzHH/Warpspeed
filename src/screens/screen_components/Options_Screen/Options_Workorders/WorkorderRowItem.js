/* eslint-disable */
import React from "react";
import {
  calculateRunningTotals,
  capitalizeFirstLetterOfString,
  formatCurrencyDisp,
  formatMillisForDisplay,
  lightenRGBByPercent,
  resolveStatus,
} from "../../../../utils";
import { Tooltip, WebPageModal, DropdownMenu } from "../../../../components";
import { C, ICONS } from "../../../../styles";
import {
  useOpenWorkordersStore,
  useSettingsStore,
  useAlertScreenStore,
} from "../../../../stores";
import { NUM_MILLIS_IN_DAY } from "./utils";
import WaitTimeIndicator from "./WaitTimeIndicator";
import styles from "./WorkorderRowItem.module.css";

const WorkorderRowItem = React.memo(function WorkorderRowItem({
  workorder, isSelected, isPreviewed, paidAmount, isLinkedSale, onSelect, onHoverEnter, onHoverExit
}) {
  const rs = resolveStatus(workorder.status, useSettingsStore.getState().settings?.statuses);
  let wipUser = "";
  if (workorder.status === "work_in_progress" && workorder.changeLog?.length) {
    for (let i = workorder.changeLog.length - 1; i >= 0; i--) {
      let entry = workorder.changeLog[i];
      if (entry.field === "status" && entry.to === rs.label) { wipUser = entry.user || ""; break; }
    }
  }

  let rowClassName = styles.row;
  if (isSelected) rowClassName += " " + styles.selected;
  if (isPreviewed) rowClassName += " " + styles.previewed;

  return (
      <div
        className={rowClassName}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(workorder)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(workorder); }}
        style={{
          borderLeftColor: rs.backgroundColor || C.buttonLightGreenOutline,
          borderColor: C.buttonLightGreenOutline,
          borderLeftWidth: 4,
          backgroundColor: isSelected
            ? lightenRGBByPercent(C.lightred, 85)
            : workorder.status?.toLowerCase().includes("finished")
              ? lightenRGBByPercent(C.green, 85)
              : C.listItemWhite,
        }}
      >
        <div className={styles.mainContent}>
          <div className={styles.topRow}>
            <div className={styles.customerInfo}>
              <div className={styles.nameRow}>
                {workorder.hasNewSMS && (
                  <span className={styles.smsDot} style={{ backgroundColor: C.green }} />
                )}
                <span className={styles.customerName}>
                  {capitalizeFirstLetterOfString(workorder.customerFirst) + " " + capitalizeFirstLetterOfString(workorder.customerLast)}
                </span>
                {paidAmount > 0 && (
                  <span className={styles.paidLabel} style={{ color: C.green }}>
                    {"Paid $" + formatCurrencyDisp(paidAmount)}
                  </span>
                )}
                {isLinkedSale && (
                  <span className={styles.paidLabel} style={{ color: C.orange }}>
                    Combined Sale
                  </span>
                )}
              </div>
              <div className={styles.brandRow}>
                {!!workorder.color1?.backgroundColor && (
                  <span className={styles.colorDot} style={{ backgroundColor: workorder.color1.backgroundColor }} />
                )}
                {!!workorder.color2?.backgroundColor && (
                  <span className={styles.colorDot} style={{ backgroundColor: workorder.color2.backgroundColor }} />
                )}
                <span className={styles.brandText} style={{ color: C.text }}>
                  {capitalizeFirstLetterOfString(workorder.brand) || ""}
                </span>
                {!!workorder.description && (
                  <span className={styles.separator} style={{ width: 7 }} />
                )}
                <span className={styles.descriptionText} style={{ color: C.text }}>
                  {capitalizeFirstLetterOfString(workorder.description)}
                </span>
                {workorder.workorderLines?.length > 0 && (
                  <span className={styles.lineCountBadge}>
                    <span className={styles.lineCountText}>
                      {workorder.workorderLines.length}
                    </span>
                  </span>
                )}
                {workorder.workorderLines?.length > 0 && (() => {
                  let totals = calculateRunningTotals(workorder, useSettingsStore.getState().getSettings()?.salesTaxPercent, [], false, !!workorder?.taxFree);
                  let hasDiscount = totals.runningDiscount > 0;
                  return totals.runningSubtotal > 0 ? (
                    <span className={styles.totalsRow}>
                      {hasDiscount && (
                        <span className={styles.strikethroughPrice}>
                          {"$" + formatCurrencyDisp(totals.runningSubtotal)}
                        </span>
                      )}
                      <span className={styles.totalPrice}>
                        {"$" + formatCurrencyDisp(totals.finalTotal)}
                      </span>
                    </span>
                  ) : null;
                })()}
                {!!workorder.itemNotHere && (
                  <span className={styles.itemNotHereBadge}>
                    <span className={styles.itemNotHereText}>
                      Item not here
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className={styles.rightColumn}>
              <div className={styles.statusColumn}>
                <span className={styles.dateText}>
                  {(() => {
                    let d = new Date(workorder.startedOnMillis);
                    let h = d.getHours();
                    let m = d.getMinutes();
                    h = h % 12 || 12;
                    return h + ":" + (m < 10 ? "0" : "") + m + "  ";
                  })()}
                  {formatMillisForDisplay(
                    workorder.startedOnMillis,
                    new Date(workorder.startedOnMillis).getFullYear() !== new Date().getFullYear()
                  )}
                </span>
                <div className={styles.spacer} />
                {workorder.status === "work_in_progress" ? (
                  <div className={styles.wipPill} style={{ backgroundColor: rs.backgroundColor }}>
                    {!!wipUser && (
                      <span className={styles.wipUser} style={{ color: C.red }}>{wipUser}</span>
                    )}
                    <DropdownMenu
                      enabled={true}
                      dataArr={(useSettingsStore.getState().getSettings()?.users || []).map((u) => ({
                        label: (u.first || "") + (u.last ? " " + u.last.charAt(0) + "." : ""),
                      }))}
                      onSelect={(item) => {
                        let changeLog = [...(workorder.changeLog || [])];
                        for (let i = changeLog.length - 1; i >= 0; i--) {
                          if (changeLog[i].field === "status" && changeLog[i].to === rs.label) {
                            changeLog[i] = { ...changeLog[i], user: item.label };
                            break;
                          }
                        }
                        useOpenWorkordersStore.getState().setWorkorder({ ...workorder, changeLog }, true);
                      }}
                      buttonText={rs.label}
                      buttonStyle={{
                        backgroundColor: "transparent",
                        borderColor: "transparent",
                        borderRadius: 0,
                        paddingHorizontal: 11,
                        paddingLeft: 0,
                        paddingVertical: 2,
                        borderWidth: 0,
                      }}
                      buttonTextStyle={{
                        color: rs.textColor,
                        fontSize: 11,
                        fontWeight: "normal",
                      }}
                      buttonIcon={null}
                      showButtonShadow={false}
                      modalCoordX={-80}
                      modalCoordY={25}
                      menuMaxHeight={200}
                      centerMenuVertically={true}
                    />
                  </div>
                ) : (
                  <div
                    className={`${styles.statusPill}${workorder.status === "finished" ? " " + styles.clickable : ""}`}
                    role={workorder.status === "finished" ? "button" : undefined}
                    onClick={(e) => {
                      if (workorder.status !== "finished") return;
                      e.stopPropagation();
                      useAlertScreenStore.getState().setValues({
                        title: "Customer Contacted",
                        message: "Has this customer been contacted?",
                        btn1Text: "Yes",
                        handleBtn1Press: () => {
                          useOpenWorkordersStore.getState().setField("contacted", true, workorder.id);
                          useAlertScreenStore.getState().setShowAlert(false);
                        },
                        btn2Text: "No",
                        handleBtn2Press: () => {
                          useOpenWorkordersStore.getState().setField("contacted", false, workorder.id);
                          useAlertScreenStore.getState().setShowAlert(false);
                        },
                        canExitOnOuterClick: true,
                      });
                    }}
                    style={{
                      backgroundColor: rs.backgroundColor,
                      cursor: workorder.status === "finished" ? "pointer" : "default",
                    }}
                  >
                    {workorder.status === "finished" && (
                      <span className={styles.contactedIcon} style={{ color: workorder.contacted ? rs.textColor : C.red }}>
                        {workorder.contacted ? "\u2713" : "\u2717"}
                      </span>
                    )}
                    <span className={styles.statusLabel} style={{ color: rs.textColor }}>
                      {rs.label}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {!!(workorder.partOrdered || workorder.partSource || workorder.trackingNumber) && (
            <div className={styles.partRow}>
              {!!workorder.partOrdered && (
                <span className={styles.truncate} style={{ fontSize: 14, color: C.blue, fontWeight: "500" }}>
                  {capitalizeFirstLetterOfString(workorder.partOrdered)}
                </span>
              )}
              {!!(workorder.partOrdered && workorder.partSource) && (
                <span className={styles.separator} style={{ width: 5 }} />
              )}
              {!!workorder.partSource && (
                <span className={styles.truncate} style={{ fontSize: 14, color: C.orange }}>
                  {capitalizeFirstLetterOfString(workorder.partSource)}
                </span>
              )}
              {!!(workorder.partOrderedMillis && workorder.partOrderEstimateMillis && Math.round((workorder.partOrderEstimateMillis - workorder.partOrderedMillis) / NUM_MILLIS_IN_DAY) > 0) && (
                <span className={styles.truncate} style={{ fontSize: 12, color: "dimgray", marginLeft: 6 }}>
                  {formatMillisForDisplay(workorder.partOrderedMillis)}
                  {" \u2192 " + formatMillisForDisplay(workorder.partOrderEstimateMillis)}
                </span>
              )}
              {!!workorder.trackingNumber && (() => {
                const inputVal = workorder.trackingNumber.trim();
                const isURL = /^https?:\/\/|^www\./i.test(inputVal);
                if (isURL) {
                  const openUrl = inputVal.startsWith("www.") ? "https://" + inputVal : inputVal;
                  return (
                    <div onContextMenu={(e) => { e.preventDefault(); navigator.clipboard.writeText(inputVal); }} style={{ marginLeft: 6 }}>
                      <Tooltip text="Click to open website, right-click to copy link" position="top">
                        <div
                          role="button"
                          onClick={() => window.open(openUrl, "_blank")}
                          className={styles.trackingButton}
                          style={{ backgroundColor: lightenRGBByPercent(C.blue, 75) }}
                        >
                          <span className={styles.trackingButtonText} style={{ color: C.blue }}>Open Tracking</span>
                        </div>
                      </Tooltip>
                    </div>
                  );
                }
                return (
                  <div onContextMenu={(e) => { e.preventDefault(); navigator.clipboard.writeText(inputVal); }} style={{ marginLeft: 6 }}>
                    <Tooltip text="Click to open tracker, right-click to copy tracking number" position="top">
                      <WebPageModal
                        url={"https://parcelsapp.com/en/tracking/" + inputVal}
                        title="Package Tracking"
                        subtitle={inputVal}
                        buttonLabel="Open Tracking"
                        buttonStyle={{ paddingVertical: 1, paddingHorizontal: 8, borderRadius: 4, backgroundColor: lightenRGBByPercent(C.blue, 75) }}
                        buttonTextStyle={{ fontSize: 11, color: C.blue, fontWeight: "500" }}
                      />
                    </Tooltip>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <div
          className={styles.waitHoverZone}
          onMouseOver={() => onHoverEnter(workorder)}
          onMouseLeave={() => onHoverExit()}
        >
          <WaitTimeIndicator workorder={workorder} />
        </div>
      </div>
  );
}, (prev, next) => {
  if (prev.workorder !== next.workorder) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isPreviewed !== next.isPreviewed) return false;
  if (prev.paidAmount !== next.paidAmount) return false;
  if (prev.isLinkedSale !== next.isLinkedSale) return false;
  return true;
});

export default WorkorderRowItem;
