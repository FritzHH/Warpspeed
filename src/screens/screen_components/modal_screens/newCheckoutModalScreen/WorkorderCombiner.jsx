/* eslint-disable */
import { memo } from "react";
import { C, ICONS } from "../../../../styles";
import { Image, Button, GradientView, Tooltip, CheckBox } from "../../../../dom_components";
import { LineActionsDropdown } from "../../../../dom_components/LineActionsDropdown/LineActionsDropdown";
import { DISCOUNT_TYPES } from "../../../../constants";
import { formatCurrencyDisp, calculateRunningTotals, lightenRGBByPercent, applyDiscountToWorkorderItem, replaceOrAddToArr, formatWorkorderNumber } from "../../../../utils";
import cloneDeep from "lodash/cloneDeep";
import { useSettingsStore } from "../../../../stores";
import { dlog, DCAT } from "./checkoutDebugLog";
import styles from "./WorkorderCombiner.module.css";

export const WorkorderCombiner = memo(function WorkorderCombiner({
  combinedWorkorders = [],
  otherCustomerWorkorders = [],
  onToggle,
  onLineChange,
  primaryWorkorderID,
  salesTaxPercent = 0,
  saleTotal = 0,
  amountCaptured = 0,
}) {
  let discounts = useSettingsStore((s) => s.settings?.discounts) || [];

  function wouldDropBelowFloor(modifiedWoId, proposedLines) {
    if (amountCaptured <= 0) return false;
    let taxableTotal = 0;
    let taxFreeTotal = 0;
    combinedWorkorders.forEach((wo) => {
      let lines = wo.id === modifiedWoId ? proposedLines : wo.workorderLines;
      let result = calculateRunningTotals({ ...wo, workorderLines: lines }, 0);
      if (wo.taxFree) {
        taxFreeTotal += result.runningTotal;
      } else {
        taxableTotal += result.runningTotal;
      }
    });
    let tax = Math.round(taxableTotal * (salesTaxPercent / 100));
    let proposedTotal = Math.round(taxFreeTotal + taxableTotal + tax);
    return proposedTotal < amountCaptured;
  }

  function modifyQty(wo, lineIdx, direction) {
    dlog(DCAT.BUTTON, "modifyQty", "WorkorderCombiner", { woId: wo.id, lineId: wo.workorderLines[lineIdx]?.id, direction });
    let newLine = cloneDeep(wo.workorderLines[lineIdx]);
    if (direction === "up") {
      newLine.qty = newLine.qty + 1;
    } else {
      if (newLine.qty <= 1) return;
      newLine.qty = newLine.qty - 1;
    }
    if (newLine.discountObj?.name) {
      let recalc = applyDiscountToWorkorderItem(newLine);
      if (recalc.discountObj?.newPrice != null) newLine = recalc;
    }
    let lines = replaceOrAddToArr(wo.workorderLines, newLine);
    if (direction === "down" && wouldDropBelowFloor(wo.id, lines)) return;
    onLineChange(wo.id, lines);
  }

  function splitLine(wo, lineIdx) {
    dlog(DCAT.BUTTON, "splitLine", "WorkorderCombiner", { woId: wo.id, lineId: wo.workorderLines[lineIdx]?.id });
    let source = wo.workorderLines[lineIdx];
    if (!source || (source.qty || 1) <= 1) return;
    let num = source.qty;
    let lines = cloneDeep(wo.workorderLines);
    for (let i = 0; i < num; i++) {
      let newLine = cloneDeep(source);
      newLine.qty = 1;
      newLine.id = crypto.randomUUID();
      newLine.discountObj = null;
      if (i === 0) {
        lines[lineIdx] = newLine;
        continue;
      }
      lines.splice(lineIdx + i, 0, newLine);
    }
    onLineChange(wo.id, lines);
  }

  function deleteLine(wo, lineIdx) {
    dlog(DCAT.BUTTON, "deleteLine", "WorkorderCombiner", { woId: wo.id, lineId: wo.workorderLines[lineIdx]?.id });
    let lines = wo.workorderLines.filter((_, idx) => idx !== lineIdx);
    if (wouldDropBelowFloor(wo.id, lines)) return;
    onLineChange(wo.id, lines);
  }

  function handleDiscount(wo, line, discountObj) {
    dlog(DCAT.DROPDOWN, "handleDiscount", "WorkorderCombiner", { woId: wo.id, lineId: line.id, discountName: discountObj?.name || "No Discount" });
    let lines = wo.workorderLines.map((o) => {
      if (o.id === line.id) {
        let updated = { ...o, discountObj };
        return applyDiscountToWorkorderItem(updated);
      }
      return o;
    });
    if (wouldDropBelowFloor(wo.id, lines)) return;
    onLineChange(wo.id, lines);
  }

  let uncombinedWOs = otherCustomerWorkorders.filter(
    (wo) => !combinedWorkorders.find((c) => c.id === wo.id)
  );

  let allWOs = [...combinedWorkorders, ...uncombinedWOs];
  let hasCombinedNonPrimary = combinedWorkorders.length > 1;

  return (
    <div className={styles.root}>
      {amountCaptured > 0 && hasCombinedNonPrimary && (
        <div className={styles.uncombineWarn}>
          <Image src={ICONS.info} width={18} height={18} style={{ marginRight: 8 }} />
          <span className={styles.uncombineWarnText} style={{ color: C.text }}>
            {"Remove all payments and credits to uncombine workorders"}
          </span>
        </div>
      )}
      {allWOs.map((wo) => {
        let isCombined = !!combinedWorkorders.find((c) => c.id === wo.id);
        let isPrimary = wo.id === primaryWorkorderID;
        let totals = calculateRunningTotals(wo, 0);
        let effectiveTaxPercent = wo.taxFree ? 0 : salesTaxPercent;
        let bodyOpacity = isPrimary ? 1 : isCombined ? 1 : 0.4;

        return (
          <div key={wo.id}>
            <div
              className={styles.woCard}
              style={{
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: lightenRGBByPercent(C.backgroundWhite, 60),
              }}
            >
              <div className={styles.woHeader}>
                <span className={styles.woNumber} style={{ color: C.blue }}>
                  {"Workorder #" + formatWorkorderNumber(wo.workorderNumber)}
                </span>
                {!isPrimary && (
                  <CheckBox
                    enabled={isCombined ? !(amountCaptured > 0) : true}
                    buttonStyle={{ marginTop: 0, marginBottom: 0 }}
                    isChecked={isCombined}
                    textStyle={{ color: C.text }}
                    text={"ADD TO SALE"}
                    onCheck={() => { dlog(DCAT.CHECKBOX, "toggleWorkorder", "WorkorderCombiner", { woId: wo.id }); onToggle(wo); }}
                  />
                )}
              </div>

              <div className={styles.woBody} style={{ opacity: bodyOpacity }}>
                <div
                  className={styles.woMeta}
                  style={{ borderBottomColor: C.borderSubtle }}
                >
                  <div className={styles.woMetaLeft}>
                    <span className={styles.brand} style={{ color: C.text }}>{wo.brand || ""}</span>
                    {wo.description ? (
                      <span className={styles.description} style={{ color: C.text }}>
                        {"   " + wo.description}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.colorPills}>
                    {wo.color1?.backgroundColor ? (
                      <span
                        className={styles.colorPillLeft}
                        style={{
                          backgroundColor: wo.color1?.backgroundColor,
                          color: wo.color1?.textColor,
                        }}
                      >
                        {wo.color1?.label || ""}
                      </span>
                    ) : null}
                    {wo.color2?.backgroundColor ? (
                      <span
                        className={styles.colorPillRight}
                        style={{
                          backgroundColor: wo.color2?.backgroundColor,
                          color: wo.color2?.textColor,
                        }}
                      >
                        {wo.color2?.label || ""}
                      </span>
                    ) : null}
                  </div>
                </div>

                {(wo.workorderLines || []).map((line, lineIdx) => {
                  let name = line.inventoryItem?.catalogName || line.inventoryItem?.formalName || "Item";
                  let price = line.inventoryItem?.price || 0;

                  let canEdit = isCombined;
                  let hasPayments = amountCaptured > 0;
                  let buffer = saleTotal - amountCaptured;
                  let lineSubtotal = line.discountObj?.newPrice != null ? Number(line.discountObj.newPrice) : price * (line.qty || 1);
                  let lineWithTax = lineSubtotal + Math.round(lineSubtotal * effectiveTaxPercent / 100);
                  let oneUnitWithTax = price + Math.round(price * effectiveTaxPercent / 100);
                  let canDelete = !hasPayments || lineWithTax <= buffer;
                  let canQtyDown = (line.qty > 1) && (!hasPayments || oneUnitWithTax <= buffer);
                  let lineTotal = price * (line.qty || 1);
                  let currentSavings = line.discountObj?.savings || 0;
                  let safeDiscounts = discounts.filter((o) => {
                    if (o.type === "$" && Number(o.value) > lineTotal) return false;
                    if (!hasPayments) return true;
                    let newSavings = o.type === "%" ? Math.round(lineTotal * (Number(o.value) / 100)) : Math.min(Number(o.value), lineTotal);
                    let additional = newSavings - currentSavings;
                    if (additional <= 0) return true;
                    return additional + Math.round(additional * effectiveTaxPercent / 100) <= buffer;
                  });
                  let canDiscount = !hasPayments || safeDiscounts.length > 0 || !!line.discountObj?.name;

                  let lineBg = line.inventoryItem?.customLabor
                    ? lightenRGBByPercent(C.blue, 80)
                    : line.inventoryItem?.customPart
                    ? lightenRGBByPercent(C.green, 80)
                    : C.backgroundListWhite;
                  let lineBorderLeft = line.discountObj?.name ? C.lightred : lightenRGBByPercent(C.green, 60);

                  return (
                    <div key={line.id || lineIdx} className={styles.line}>
                      <div
                        className={styles.lineRow}
                        style={{
                          backgroundColor: lineBg,
                          borderColor: C.listItemBorder,
                          borderLeftColor: lineBorderLeft,
                        }}
                      >
                        <div className={styles.lineLeft}>
                          <div className={styles.lineLeftInner}>
                            {!!(line.discountObj?.name || line.discountObj?.discountName) && (
                              <div className={styles.discountRow}>
                                <span className={styles.discountName} style={{ color: C.lightred }}>
                                  {line.discountObj.name || line.discountObj.discountName}
                                </span>
                                {!!line.discountObj?.savings && (
                                  <span className={styles.discountSavings} style={{ color: C.lightred }}>
                                    {"-$" + formatCurrencyDisp(line.discountObj.savings)}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className={styles.nameRow}>
                              {(line.inventoryItem?.customPart || line.inventoryItem?.customLabor) && (
                                <div
                                  className={styles.typeTag}
                                  style={{
                                    backgroundColor: line.inventoryItem.customLabor
                                      ? lightenRGBByPercent(C.blue, 55)
                                      : lightenRGBByPercent(C.green, 55),
                                  }}
                                >
                                  <span
                                    className={styles.typeTagText}
                                    style={{
                                      color: line.inventoryItem.customLabor
                                        ? lightenRGBByPercent(C.blue, 15)
                                        : lightenRGBByPercent(C.green, 15),
                                    }}
                                  >
                                    {line.inventoryItem.customPart ? "ITEM" : line.inventoryItem.minutes ? line.inventoryItem.minutes + " MINS" : "LABOR"}
                                  </span>
                                </div>
                              )}
                              <span className={styles.itemName} style={{ color: C.text }}>
                                {line.inventoryItem?.catalogName || line.inventoryItem?.formalName || name}
                              </span>
                            </div>
                            {line.intakeNotes ? (
                              <span className={styles.intakeNotes} style={{ color: C.textSecondary }}>
                                {line.intakeNotes}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className={styles.lineRight}>
                          {canEdit ? (
                            <>
                              <div className={styles.qtyControls}>
                                <Button
                                  onPress={() => modifyQty(wo, lineIdx, "up")}
                                  buttonStyle={{
                                    backgroundColor: "transparent",
                                    paddingLeft: 3,
                                    paddingRight: 3,
                                  }}
                                  icon={ICONS.upArrowOrange}
                                  iconSize={19}
                                />
                                <Button
                                  enabled={canQtyDown}
                                  onPress={() => modifyQty(wo, lineIdx, "down")}
                                  buttonStyle={{
                                    backgroundColor: "transparent",
                                    paddingLeft: 4,
                                    paddingRight: 4,
                                    opacity: canQtyDown ? 1 : 0.25,
                                  }}
                                  icon={ICONS.downArrowOrange}
                                  iconSize={19}
                                />
                                <GradientView className={styles.qtyPill}>
                                  <span className={styles.qtyPillText} style={{ color: C.textWhite }}>
                                    {line.qty || 1}
                                  </span>
                                </GradientView>
                              </div>
                              <div
                                className={styles.priceBox}
                                style={{
                                  borderColor: C.listItemBorder,
                                  backgroundColor: C.backgroundWhite,
                                }}
                              >
                                {(line.qty > 1 || line.discountObj?.newPrice != null) && (
                                  <span
                                    className={styles.priceCrossed}
                                    style={{
                                      color: C.text,
                                      textDecorationLine: line.discountObj?.newPrice != null ? "line-through" : "none",
                                    }}
                                  >
                                    {"$ " + formatCurrencyDisp(price)}
                                  </span>
                                )}
                                <span className={styles.priceFinal} style={{ color: C.text }}>
                                  {line.discountObj?.newPrice != null
                                    ? "$ " + formatCurrencyDisp(line.discountObj.newPrice)
                                    : "$" + formatCurrencyDisp(price * (line.qty || 1))}
                                </span>
                              </div>
                              <div className={styles.actionsArea}>
                                <Tooltip text="Actions" position="top">
                                  <LineActionsDropdown
                                    enabled={canEdit && (canDelete || canDiscount)}
                                    showSplit={(line.qty || 1) > 1}
                                    onSplit={() => splitLine(wo, lineIdx)}
                                    onRemove={() => deleteLine(wo, lineIdx)}
                                    discounts={safeDiscounts}
                                    currentDiscount={line.discountObj}
                                    unitPriceCents={price}
                                    qty={line.qty || 1}
                                    onSelectDiscount={(discount) => {
                                      if (!discount) {
                                        handleDiscount(wo, line, null);
                                      } else {
                                        handleDiscount(wo, line, discount);
                                      }
                                    }}
                                    onCustomPercent={(num) => {
                                      handleDiscount(wo, line, { id: "custom_" + Date.now(), name: num + "% Off", value: String(num), type: DISCOUNT_TYPES.percent, custom: true });
                                    }}
                                    onCustomDollar={(cents, perItem) => {
                                      const dollars = (cents / 100).toFixed(2);
                                      const name = "$" + dollars + (perItem ? " Off Each" : " Off");
                                      handleDiscount(wo, line, { id: "custom_" + Date.now(), name, value: String(cents), type: DISCOUNT_TYPES.dollar, custom: true, perItem: !!perItem });
                                    }}
                                    triggerStyle={{ marginRight: 3 }}
                                  />
                                </Tooltip>
                              </div>
                            </>
                          ) : (
                            <>
                              <GradientView className={styles.qtyPillLarge}>
                                <span className={styles.qtyPillTextLarge} style={{ color: C.textWhite }}>
                                  {line.qty || 1}
                                </span>
                              </GradientView>
                              <div
                                className={styles.priceBoxRO}
                                style={{
                                  borderColor: C.listItemBorder,
                                  backgroundColor: C.backgroundWhite,
                                }}
                              >
                                {(line.qty > 1 || line.discountObj?.newPrice != null) && (
                                  <span
                                    style={{
                                      color: C.text,
                                      textDecorationLine: line.discountObj?.newPrice != null ? "line-through" : "none",
                                    }}
                                  >
                                    {"$ " + formatCurrencyDisp(price)}
                                  </span>
                                )}
                                <span className={styles.priceFinalRO} style={{ color: C.text }}>
                                  {line.discountObj?.newPrice != null
                                    ? "$ " + formatCurrencyDisp(line.discountObj.newPrice)
                                    : "$" + formatCurrencyDisp(price * (line.qty || 1))}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className={styles.totalsRow} style={{ borderTopColor: C.borderSubtle }}>
                  <span className={styles.totalsLabel} style={{ color: "gray" }}>
                    {"SUBTOTAL: "}
                    <span className={styles.totalsValue} style={{ color: C.text }}>
                      {"$" + formatCurrencyDisp(totals.runningSubtotal)}
                    </span>
                  </span>
                  <div className={styles.totalsDivider} style={{ backgroundColor: C.buttonLightGreenOutline }} />
                  {(totals.runningDiscount || 0) > 0 && (
                    <div>
                      <span className={styles.totalsLabel} style={{ color: C.lightred }}>
                        {"DISCOUNT: "}
                        <span className={styles.totalsValue} style={{ color: C.lightred }}>
                          {"$" + formatCurrencyDisp(totals.runningDiscount)}
                        </span>
                      </span>
                    </div>
                  )}
                  {(totals.runningDiscount || 0) > 0 && (
                    <div className={styles.totalsDivider} style={{ backgroundColor: C.buttonLightGreenOutline }} />
                  )}
                  <span className={styles.totalsLabel} style={{ color: "gray" }}>
                    {"TAX: "}
                    <span className={styles.totalsValue} style={{ color: C.text }}>
                      {"$" + formatCurrencyDisp((totals.runningTotal || 0) * effectiveTaxPercent / 100)}
                    </span>
                  </span>
                  <div className={styles.totalsDivider} style={{ backgroundColor: C.buttonLightGreenOutline }} />
                  <span
                    className={styles.totalsTotalWrap}
                    style={{ borderColor: C.buttonLightGreenOutline, color: "gray" }}
                  >
                    {"TOTAL: "}
                    <span className={styles.totalsTotalValue} style={{ color: C.text }}>
                      {"$" + formatCurrencyDisp(
                        (totals.runningTotal || 0) + (totals.runningTotal || 0) * effectiveTaxPercent / 100
                      )}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
