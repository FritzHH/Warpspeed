/* eslint-disable */
import { useState } from "react";
import cloneDeep from "lodash/cloneDeep";
import { TAB_NAMES, RECEIPT_TYPES, WORKORDER_PROTO } from "../../../data";
import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useLoginStore,
  useCheckoutStore,
  useActiveSalesStore,
  useSettingsStore,
} from "../../../stores";
import { Button, ScreenModal, Tooltip } from "../../../dom_components";
import { TicketSearchInput } from "../../../shared/TicketSearchInput";
import { generateEAN13Barcode, formatCurrencyDisp, formatMillisForDisplay, localStorageWrapper, getPrinterStatus } from "../../../utils";
import { C, COLOR_GRADIENTS, ICONS, Radius } from "../../../styles";
import { dbSavePrintObj } from "../../../db_calls_wrapper";
import styles from "./Info_StandaloneSale.module.css";

export const StandaloneSaleComponent = ({}) => {
  const zOpenWorkorder = useOpenWorkordersStore((state) => state.getOpenWorkorder());
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);
  const zSettings = useSettingsStore((state) => state.settings);
  const standaloneSales = zActiveSales.filter((s) => !s.customerID && !s.paymentComplete);
  const [sShowActiveSalesModal, _setShowActiveSalesModal] = useState(false);

  const { isPrinterOffline, offlineLabel: printerOfflineLabel } = getPrinterStatus(zSettings);

  const clearDisabled =
    !zOpenWorkorder ||
    ((zOpenWorkorder.workorderLines || []).length === 0 &&
      (zOpenWorkorder.customerNotes || []).length === 0 &&
      (zOpenWorkorder.internalNotes || []).length === 0);

  function handleSelectActiveSale(sale) {
    _setShowActiveSalesModal(false);
    // Find matching workorder by saleID or create a temp one
    const store = useOpenWorkordersStore.getState();
    const woID = sale.workorderIDs?.[0];
    if (woID) {
      const existingWo = store.workorders.find((w) => w.id === woID);
      if (existingWo) {
        store.setOpenWorkorderID(existingWo.id);
      } else {
        // Workorder isn't loaded — set it with the activeSaleID so checkout can resume
        const wo = cloneDeep(WORKORDER_PROTO);
        wo.id = woID;
        wo.activeSaleID = sale.id;
        wo.startedOnMillis = sale.millis || Date.now();
        store.setWorkorder(wo, false);
        store.setOpenWorkorderID(wo.id);
      }
    }
    useCheckoutStore.getState().setIsCheckingOut(true);
  }

  function handleClearSale() {
    if (clearDisabled) return;
    const store = useOpenWorkordersStore.getState();
    const oldWo = store.getOpenWorkorder();
    if (!oldWo) return;
    store.removeWorkorder(oldWo.id);
    const wo = cloneDeep(WORKORDER_PROTO);
    wo.id = generateEAN13Barcode();
    wo.startedBy = useLoginStore.getState().currentUser?.id;
    wo.startedOnMillis = Date.now();
    store.setWorkorder(wo);
    store.setOpenWorkorderID(wo.id);
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  return (
    <div className={styles.container}>
      <TicketSearchInput />

      <div className={styles.titleBlock}>
        <span className={styles.titleText} style={{ color: C.textDisabled, opacity: 0.38 }}>SALE</span>
        <Button
          text={`Active Sales (${standaloneSales.length})`}
          enabled={standaloneSales.length > 0}
          onPress={() => _setShowActiveSalesModal(true)}
          colorGradientArr={standaloneSales.length > 0 ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
          buttonStyle={{
            borderRadius: Radius.control,
            paddingHorizontal: 20,
            paddingVertical: 8,
            marginTop: 20,
          }}
          textStyle={{ color: C.textWhite, fontSize: 13, fontWeight: "600" }}
        />
      </div>

      {/* Active Sales Modal */}
      {sShowActiveSalesModal && (
        <ScreenModal
          showOuterModal={true}
          modalVisible={sShowActiveSalesModal}
          setModalVisibility={_setShowActiveSalesModal}
          handleOuterClick={() => _setShowActiveSalesModal(false)}
          Component={() => (
            <div className={styles.modalContent} style={{ backgroundColor: C.backgroundWhite }}>
              <span className={styles.modalTitle} style={{ color: C.text }}>Active Sales</span>
              {standaloneSales.length === 0 ? (
                <span className={styles.emptyText} style={{ color: C.textMuted }}>No active sales</span>
              ) : (
                <div className={styles.salesList}>
                  {standaloneSales.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectActiveSale(item)}
                      className={styles.saleRow}
                      style={{
                        borderColor: C.buttonLightGreenOutline,
                        backgroundColor: C.listItemWhite,
                      }}
                    >
                      <div className={styles.saleRowTop}>
                        <span className={styles.saleRowTotal} style={{ color: C.text }}>
                          {"$" + formatCurrencyDisp(item.total || 0)}
                        </span>
                        <span className={styles.saleRowDate} style={{ color: C.textMuted }}>
                          {item.millis ? formatMillisForDisplay(item.millis) : ""}
                        </span>
                      </div>
                      <div className={styles.saleRowBottom}>
                        <span className={styles.saleRowMoney} style={{ color: C.textMuted }}>
                          {"Paid: $" + formatCurrencyDisp(item.amountCaptured || 0)}
                        </span>
                        <span className={styles.saleRowMoney} style={{ color: C.green }}>
                          {"Remaining: $" + formatCurrencyDisp(Math.max(0, (item.total || 0) - (item.amountCaptured || 0)))}
                        </span>
                      </div>
                      {item.createdBy && (
                        <span className={styles.saleRowAuthor} style={{ color: C.textMuted }}>
                          {"By " + item.createdBy}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <Button
                text="Close"
                onPress={() => _setShowActiveSalesModal(false)}
                buttonStyle={{ marginTop: 10, alignSelf: "center", paddingHorizontal: 30 }}
                textStyle={{ fontSize: 13 }}
              />
            </div>
          )}
        />
      )}

      <div className={styles.clearWrap} style={{ opacity: clearDisabled ? 0 : 1 }}>
        <Button
          text="CLEAR SALE"
          onPress={handleClearSale}
          colorGradientArr={COLOR_GRADIENTS.red}
          buttonStyle={{
            borderRadius: Radius.control,
            paddingHorizontal: 30,
            paddingVertical: 10,
            marginBottom: 30,
          }}
          textStyle={{ color: C.textWhite, fontSize: 14, fontWeight: "600" }}
        />
      </div>

      <div className={styles.bottomRow}>
        <Tooltip text="New workorder / customer lookup" position="top" offsetX={63}>
          <Button
            onPress={() => {
              useTabNamesStore.getState().setItems({
                infoTabName: TAB_NAMES.infoTab.customer,
                itemsTabName: TAB_NAMES.itemsTab.empty,
                optionsTabName: TAB_NAMES.optionsTab.workorders,
              });
            }}
            icon={ICONS.bicycle}
            iconSize={55}
            buttonStyle={{ marginBottom: 0, paddingLeft: 15 }}
          />
        </Tooltip>
        {!!zOpenWorkorder?.customerID && (
          <Tooltip text="Back to workorder" position="top">
            <Button
              onPress={() => {
                useTabNamesStore.getState().setItems({
                  infoTabName: TAB_NAMES.infoTab.workorder,
                  itemsTabName: TAB_NAMES.itemsTab.workorderItems,
                  optionsTabName: TAB_NAMES.optionsTab.inventory,
                });
              }}
              icon={ICONS.letterW}
              iconSize={35}
              buttonStyle={{
                backgroundColor: "transparent",
                paddingHorizontal: 0,
                paddingVertical: 0,
              }}
            />
          </Tooltip>
        )}
        <Tooltip text={isPrinterOffline ? printerOfflineLabel : "Pop cash register"} position="top">
          <Button
            icon={ICONS.openCashRegister}
            iconSize={40}
            enabled={!isPrinterOffline}
            onPress={() =>
              dbSavePrintObj(
                { id: crypto.randomUUID(), receiptType: RECEIPT_TYPES.register },
                localStorageWrapper.getItem("selectedPrinterID") || ""
              )
            }
          />
        </Tooltip>
      </div>
    </div>
  );
};
