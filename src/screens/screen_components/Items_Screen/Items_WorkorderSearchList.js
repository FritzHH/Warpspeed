/* eslint-disable */

import { useState, lazy, Suspense } from "react";
import { capitalizeFirstLetterOfString, formatCurrencyDisp, formatMillisForDisplay, formatPhoneForDisplay, resolveStatus, calculateRunningTotals, formatWorkorderNumber } from "../../../utils";
import {
  SmallLoadingIndicator,
  TouchableOpacity,
} from "../../../dom_components";
import {
  useWorkorderSearchStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useSettingsStore,
  useActiveSalesStore,
} from "../../../stores";
import { TAB_NAMES } from "../../../data";
import { C } from "../../../styles";
const ClosedWorkorderModal = lazy(() =>
  import("../modal_screens/ClosedWorkorderModal").then((m) => ({ default: m.ClosedWorkorderModal }))
);
import styles from "./Items_WorkorderSearchList.module.css";

export function Items_WorkorderSearchList({}) {
  const zResults = useWorkorderSearchStore((s) => s.searchResults);
  const zIsSearching = useWorkorderSearchStore((s) => s.isSearching);
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const taxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;
  const zActiveSales = useActiveSalesStore((s) => s.activeSales);

  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);

  function handleOpenWorkorderPress(wo) {
    useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.inventory,
    });
    useWorkorderSearchStore.getState().reset();
  }

  function handlePress(item) {
    if (item.isCompleted) {
      _sSetClosedWorkorder(item.data);
    } else {
      handleOpenWorkorderPress(item.data);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.list}>
        {zResults.length === 0 ? (
          <div className={styles.emptyState}>
            {zIsSearching ? (
              <SmallLoadingIndicator />
            ) : (
              <span className={styles.emptyText} style={{ color: C.textMuted }}>
                No workorders found
              </span>
            )}
          </div>
        ) : (
          zResults.map((item, index) => {
            const workorder = item.data;
            const rs = resolveStatus(workorder.status, statuses);
            const totals = calculateRunningTotals(
              workorder,
              taxPercent,
              [],
              false,
              !!workorder.taxFree
            );
            const itemCount = workorder.workorderLines?.length || 0;
            const accentColor = item.isCompleted
              ? C.blue
              : rs.backgroundColor || C.buttonLightGreenOutline;

            let sale = workorder.activeSaleID
              ? zActiveSales.find((s) => s.id === workorder.activeSaleID)
              : null;
            let paid = sale
              ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0)
              : 0;

            return (
              <TouchableOpacity
                key={(item.isCompleted ? "closed-" : "open-") + (workorder?.id || index)}
                onPress={() => handlePress(item)}
                className={styles.card}
                style={{
                  borderLeftColor: accentColor,
                  borderColor: C.buttonLightGreenOutline,
                  backgroundColor: C.listItemWhite,
                }}
              >
                {/* Row 1: Customer name + phone + status badge */}
                <div className={styles.row1}>
                  <div className={styles.row1Left}>
                    <span className={styles.nameText}>
                      {workorder.customerFirst
                        ? capitalizeFirstLetterOfString(workorder.customerFirst) +
                          " " +
                          capitalizeFirstLetterOfString(workorder.customerLast || "")
                        : "No customer"}
                    </span>
                    {!!workorder.customerCell && (
                      <span
                        className={styles.phoneText}
                        style={{ color: C.textMuted }}
                      >
                        {formatPhoneForDisplay(workorder.customerCell)}
                      </span>
                    )}
                  </div>
                  <div className={styles.row1Right}>
                    {item.isCompleted && (
                      <div
                        className={styles.closedBadge}
                        style={{ backgroundColor: C.blue }}
                      >
                        <span className={styles.closedBadgeText}>CLOSED</span>
                      </div>
                    )}
                    <div
                      className={styles.statusBadge}
                      style={{ backgroundColor: rs.backgroundColor }}
                    >
                      <span
                        className={styles.statusBadgeText}
                        style={{ color: rs.textColor }}
                      >
                        {rs.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Row 2: Brand / description + item count */}
                <div className={styles.row2}>
                  <div className={styles.row2Left}>
                    <span className={styles.brandText} style={{ color: C.text }}>
                      {workorder.brand || ""}
                    </span>
                    {!!workorder.description && (
                      <div className={styles.brandSeparator} />
                    )}
                    <span
                      className={styles.descriptionText}
                      style={{ color: C.text }}
                    >
                      {workorder.description || ""}
                    </span>
                    {itemCount > 0 && (
                      <div className={styles.itemCountBadge}>
                        <span className={styles.itemCountBadgeText}>
                          {itemCount}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 3: WO number + date + total */}
                <div className={styles.row3}>
                  <span className={styles.woNumberText} style={{ color: C.green }}>
                    {formatWorkorderNumber(workorder.workorderNumber) || ""}
                  </span>
                  <span className={styles.dateText}>
                    {formatMillisForDisplay(
                      workorder.startedOnMillis,
                      new Date(workorder.startedOnMillis).getFullYear() !==
                        new Date().getFullYear()
                    )}
                  </span>
                  {workorder.paymentComplete ? (
                    <span className={styles.totalText} style={{ color: C.green }}>
                      {"$" + formatCurrencyDisp(totals.finalTotal)}
                    </span>
                  ) : paid > 0 ? (
                    <span className={styles.totalText} style={{ color: C.orange }}>
                      {"$" + formatCurrencyDisp(paid) + " paid"}
                    </span>
                  ) : (
                    <span className={styles.totalText} style={{ color: C.text }}>
                      {"$" + formatCurrencyDisp(totals.finalTotal)}
                    </span>
                  )}
                </div>
              </TouchableOpacity>
            );
          })
        )}
      </div>
      {!!sClosedWorkorder && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <ClosedWorkorderModal
            workorder={sClosedWorkorder}
            onClose={() => _sSetClosedWorkorder(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
