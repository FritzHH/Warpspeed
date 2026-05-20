/* eslint-disable */

import { useState } from "react";
import { formatCurrencyDisp, formatMillisForDisplay, formatWorkorderNumber, lightenRGBByPercent } from "../../../utils";
import {
  SmallLoadingIndicator,
  TouchableOpacity,
} from "../../../dom_components";
import {
  useTicketSearchStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useActiveSalesStore,
  useAlertScreenStore,
} from "../../../stores";
import { TAB_NAMES } from "../../../data";
import { C } from "../../../styles";
import { ClosedWorkorderModal } from "../modal_screens/ClosedWorkorderModal";
import { TransactionModal } from "../modal_screens/TransactionModal";
import { FullSaleModal } from "../../../dom_components";
import { NewRefundModalScreen } from "../modal_screens/newCheckoutModalScreen/NewRefundModalScreen";
import {
  readTransactions,
  findSaleByTransactionID,
} from "../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import styles from "./Items_TicketSearchResults.module.css";

export function Items_TicketSearchResults({}) {
  const zResults = useTicketSearchStore((state) => state.getResults());
  const zIsSearching = useTicketSearchStore((state) => state.getIsSearching());
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);
  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);
  const [sTransaction, _sSetTransaction] = useState(null);
  const [sSale, _sSetSale] = useState(null);
  const [sRefundSaleID, _sSetRefundSaleID] = useState(null);
  const [sRefundInitialPayment, _sSetRefundInitialPayment] = useState(null);

  function handleWorkorderPress(wo, isCompleted) {
    if (isCompleted) {
      _sSetClosedWorkorder(wo);
      return;
    }

    let existing = useOpenWorkordersStore.getState().getWorkorders() || [];
    let found = existing.find((w) => w.id === wo.id);
    if (!found) {
      useOpenWorkordersStore.getState().setWorkorder(wo);
    }

    useOpenWorkordersStore.getState().setOpenWorkorder(wo);

    if (wo.paymentComplete) {
      useOpenWorkordersStore.getState().setLockedWorkorderID(wo.id);
    }

    useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  async function handleSalePress(sale) {
    let txns = [];
    if (sale.transactionIDs?.length > 0) {
      txns = await readTransactions(sale.transactionIDs);
    }
    _sSetSale({ ...sale, _transactions: txns });
  }

  function handleTransactionPress(txn) {
    _sSetTransaction(txn);
  }

  async function handleTransactionRefund(txn) {
    let sale = await findSaleByTransactionID(txn.id);
    if (!sale) {
      useAlertScreenStore.getState().setAlert({
        title: "Sale Not Found",
        message: "Could not find the sale associated with this transaction.",
      });
      return;
    }
    _sSetTransaction(null);
    _sSetRefundInitialPayment(txn);
    _sSetRefundSaleID(sale.id);
  }

  function handlePress(item) {
    if (item.type === "workorder") {
      handleWorkorderPress(item.data, item.isCompleted);
    } else if (item.type === "sale") {
      handleSalePress(item.data);
    } else if (item.type === "transaction") {
      handleTransactionPress(item.data);
    }
  }

  function renderWorkorderCard(item) {
    let wo = item.data;
    let isPaid = wo.paymentComplete || !!wo.saleID;
    let sale = wo.activeSaleID
      ? zActiveSales.find((s) => s.id === wo.activeSaleID)
      : null;
    let paid = sale ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0) : 0;
    return (
      <div className={styles.cardBody}>
        <div className={styles.cardLeft}>
          <span className={styles.titleText} style={{ color: C.text }}>
            WO #{formatWorkorderNumber(wo.workorderNumber) || wo.id}
          </span>
          <span className={styles.subText} style={{ color: C.textMuted }}>
            {[wo.brand, wo.description].filter(Boolean).join(" / ") ||
              "No vehicle info"}
          </span>
          {wo.customerFirst ? (
            <span className={styles.metaText} style={{ color: C.textMuted }}>
              {wo.customerFirst} {wo.customerLast || ""}
            </span>
          ) : null}
        </div>
        <div className={styles.cardRight}>
          <span
            className={isPaid ? styles.badgePill : styles.badgePlain}
            style={{
              color: isPaid ? C.textOnAccent : item.isCompleted ? C.blue : C.green,
              backgroundColor: isPaid ? C.red : "transparent",
            }}
          >
            {isPaid ? "PAID" : item.isCompleted ? "COMPLETED" : "OPEN"}
          </span>
          {paid > 0 && !wo.paymentComplete ? (
            <span className={styles.partialText} style={{ color: C.orange }}>
              Partial: {formatCurrencyDisp(paid, true)}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  function renderSaleCard(item) {
    let sale = item.data;
    return (
      <div className={styles.cardBody}>
        <div className={styles.cardLeft}>
          <span className={styles.titleText} style={{ color: C.text }}>
            Sale {"#" + sale.id.slice(-4)}
          </span>
          <span className={styles.subText} style={{ color: C.textMuted }}>
            Total: {formatCurrencyDisp(sale.total, true)}
          </span>
          {sale.millis ? (
            <span className={styles.metaText} style={{ color: C.textMuted }}>
              {formatMillisForDisplay(sale.millis)}
            </span>
          ) : null}
        </div>
        <div className={styles.cardRight}>
          <span
            className={item.isCompleted ? styles.badgePill : styles.badgePlain}
            style={{
              color: item.isCompleted ? C.textOnAccent : C.orange,
              backgroundColor: item.isCompleted ? C.green : "transparent",
            }}
          >
            {item.isCompleted ? "COMPLETED" : "PARTIAL"}
          </span>
          {sale.amountCaptured > 0 && !sale.paymentComplete ? (
            <span className={styles.partialText} style={{ color: C.orange }}>
              Captured: {formatCurrencyDisp(sale.amountCaptured, true)}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  function renderTransactionCard(item) {
    let txn = item.data;
    let isCard = txn.method === "card";
    return (
      <div className={styles.cardBody}>
        <div className={styles.cardLeft}>
          <span className={styles.titleText} style={{ color: C.text }}>
            Txn {"#" + txn.id.slice(-4)}
          </span>
          <span className={styles.subText} style={{ color: C.textMuted }}>
            {(txn.method || "unknown").toUpperCase()}
            {isCard && txn.last4 ? " ..." + txn.last4 : ""}
            {" - " + formatCurrencyDisp(txn.amountCaptured || 0, true)}
          </span>
          {txn.millis ? (
            <span className={styles.metaText} style={{ color: C.textMuted }}>
              {formatMillisForDisplay(txn.millis)}
            </span>
          ) : null}
        </div>
        <div className={styles.cardRight}>
          <div
            className={styles.methodBadge}
            style={{
              backgroundColor: isCard
                ? lightenRGBByPercent(C.blue, 60)
                : lightenRGBByPercent(C.green, 60),
            }}
          >
            <span
              className={styles.methodBadgeText}
              style={{ color: isCard ? C.blue : C.green }}
            >
              {isCard ? "CARD" : "CASH"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  function renderItem(item, index) {
    const borderColor =
      item.type === "sale"
        ? C.blue
        : item.type === "transaction"
          ? C.purple
          : C.buttonLightGreenOutline;
    const keyPrefix =
      item.type === "workorder"
        ? "wo-"
        : item.type === "transaction"
          ? "txn-"
          : "sale-";
    return (
      <TouchableOpacity
        key={keyPrefix + (item.data?.id || index)}
        onPress={() => handlePress(item)}
        className={styles.card}
        style={{
          backgroundColor: C.listItemWhite,
          borderColor,
        }}
      >
        {item.type === "workorder"
          ? renderWorkorderCard(item)
          : item.type === "transaction"
            ? renderTransactionCard(item)
            : renderSaleCard(item)}
      </TouchableOpacity>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerText} style={{ color: C.text }}>
          Ticket Search Results ({zResults.length})
        </span>
      </div>
      <div className={styles.list}>
        {zResults.length === 0 ? (
          zIsSearching ? (
            <SmallLoadingIndicator />
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyText} style={{ color: C.textMuted }}>
                No results found
              </span>
            </div>
          )
        ) : (
          zResults.map((item, index) => renderItem(item, index))
        )}
      </div>
      <ClosedWorkorderModal
        workorder={sClosedWorkorder}
        onClose={() => _sSetClosedWorkorder(null)}
      />
      <TransactionModal
        transaction={sTransaction}
        onClose={() => _sSetTransaction(null)}
        onRefund={handleTransactionRefund}
      />
      {!!sSale && (
        <FullSaleModal
          item={{ saleID: sSale.id }}
          onClose={() => _sSetSale(null)}
        />
      )}
      {!!sRefundSaleID && (
        <NewRefundModalScreen
          visible={true}
          saleID={sRefundSaleID}
          initialPayment={sRefundInitialPayment}
          onClose={() => {
            _sSetRefundSaleID(null);
            _sSetRefundInitialPayment(null);
          }}
        />
      )}
    </div>
  );
}
