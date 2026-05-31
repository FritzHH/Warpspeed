/*eslint-disable*/
/**
 * OrderingModalScreen — desktop polish view for vendor orders.
 *
 * Left rail lists open vendor orders (phone-scanned). Right pane shows the
 * selected order's items in a table where qty / price are editable and the
 * vendor catalog name renders under the store name when they differ.
 *
 * This is structural scaffolding — many fields (price, qty-in-catalog) are
 * intentionally left blank until the data wiring is settled.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  LargeModalHeader,
  LargeModalHeaderButton,
} from "../../../../dom_components";
import { C } from "../../../../styles";
import { useInventoryStore } from "../../../../stores";
import {
  dbListenToVendorOrders,
  dbListenToVendorOrderItems,
} from "../../../../db_calls_wrapper";
import styles from "./OrderingModalScreen.module.css";

export const OrderingModalScreen = ({ handleExit }) => {
  const [sOrders, _setOrders] = useState([]);
  const [sSelectedOrderID, _setSelectedOrderID] = useState(null);
  const [sItems, _setItems] = useState([]);
  const zInventoryArr = useInventoryStore((s) => s.getInventoryArr?.()) || [];

  useEffect(() => {
    const unsub = dbListenToVendorOrders((data) => {
      _setOrders(Array.isArray(data) ? data : []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  useEffect(() => {
    if (!sSelectedOrderID) {
      _setItems([]);
      return;
    }
    const unsub = dbListenToVendorOrderItems(sSelectedOrderID, (data) => {
      _setItems(Array.isArray(data) ? data : []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [sSelectedOrderID]);

  const openOrders = useMemo(
    () =>
      sOrders
        .filter((o) => !o.status || o.status === "open")
        .sort((a, b) => (b.lastModifiedMillis || 0) - (a.lastModifiedMillis || 0)),
    [sOrders],
  );

  return (
    <Dialog visible={true} onClose={handleExit} overlayColor={C.surfaceOverlay}>
      <div className={styles.card}>
        <LargeModalHeader
          title={
            <div className={styles.headerLeft}>
              <span className={styles.title}>Ordering</span>
              <span className={styles.subtitle}>
                {openOrders.length} open order{openOrders.length === 1 ? "" : "s"}
              </span>
            </div>
          }
          actions={
            <LargeModalHeaderButton variant="default" onClick={handleExit}>
              CLOSE
            </LargeModalHeaderButton>
          }
        />

        <div className={styles.body}>
          <div className={styles.leftRail}>
            <div className={styles.railHeader}>Open Orders</div>
            <div className={styles.orderList}>
              {openOrders.map((order) => {
                const dateLabel = order.createdMillis
                  ? new Date(order.createdMillis).toLocaleString()
                  : "Unknown date";
                const active = order.id === sSelectedOrderID;
                return (
                  <button
                    key={order.id}
                    type="button"
                    className={`${styles.orderRow} ${active ? styles.orderRowActive : ""}`}
                    onClick={() => _setSelectedOrderID(order.id)}
                  >
                    <span className={styles.orderDate}>{dateLabel}</span>
                    <span className={styles.orderMeta}>
                      {(order.id || "").slice(0, 8)}
                    </span>
                  </button>
                );
              })}
              {openOrders.length === 0 && (
                <div className={styles.emptyState}>No open orders.</div>
              )}
            </div>
          </div>

          <div className={styles.rightPane}>
            {!sSelectedOrderID ? (
              <div className={styles.emptyDetail}>
                Select an order on the left to see its contents.
              </div>
            ) : (
              <OrderItemsTable items={sItems} inventory={zInventoryArr} />
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};

function OrderItemsTable({ items, inventory }) {
  return (
    <div className={styles.tableWrap}>
      <div className={`${styles.row} ${styles.headerRow}`}>
        <div className={styles.colName}>Item</div>
        <div className={styles.colVendor}>Vendor</div>
        <div className={styles.colCost}>Cost</div>
        <div className={styles.colQty}>Qty Ordered</div>
        <div className={styles.colQty}>Qty In Catalog</div>
        <div className={styles.colPrice}>Price</div>
      </div>

      {items.map((item) => (
        <OrderItemRow key={item.id} item={item} inventory={inventory} />
      ))}

      {items.length === 0 && (
        <div className={styles.emptyDetail}>No items on this order yet.</div>
      )}
    </div>
  );
}

function OrderItemRow({ item, inventory }) {
  const localMatch = useMemo(() => {
    const code = String(item.scannedBarcode || "");
    if (!code) return null;
    return (
      inventory.find((inv) => {
        if (!inv) return false;
        if (inv.primaryBarcode === code) return true;
        const codes = Array.isArray(inv.barcodes) ? inv.barcodes : [];
        return codes.includes(code);
      }) || null
    );
  }, [item.scannedBarcode, inventory]);

  const catalogName =
    item.catalogSnapshot?.description ||
    item.catalogSnapshot?.item_description ||
    item.catalogSnapshot?.short_description ||
    item.catalogSnapshot?.product_name ||
    "";

  const storeName = localMatch?.formalName || localMatch?.informalName || "";
  const primaryName = storeName || catalogName || item.scannedBarcode || "(unknown)";
  const showCatalogSub =
    !!storeName && !!catalogName && storeName !== catalogName;

  const cost = item.catalogSnapshot?.cost ?? localMatch?.cost ?? "";
  const vendorID = item.vendorCatalogID || "";

  return (
    <div className={styles.row}>
      <div className={styles.colName}>
        <span className={styles.itemName}>{primaryName}</span>
        {showCatalogSub && (
          <span className={styles.catalogSubName}>{catalogName}</span>
        )}
      </div>
      <div className={styles.colVendor}>{vendorID}</div>
      <div className={styles.colCost}>{cost}</div>
      <div className={styles.colQty}>
        <EditableNumberField initialValue={item.qty ?? ""} />
      </div>
      <div className={styles.colQty}>{/* qty-in-catalog wired later */}</div>
      <div className={styles.colPrice}>
        <EditableNumberField initialValue={""} />
      </div>
    </div>
  );
}

function EditableNumberField({ initialValue }) {
  const [sValue, _setValue] = useState(String(initialValue ?? ""));
  const originalRef = useRef(String(initialValue ?? ""));

  useEffect(() => {
    originalRef.current = String(initialValue ?? "");
    _setValue(String(initialValue ?? ""));
  }, [initialValue]);

  function handleFocus() {
    _setValue("");
  }
  function handleBlur() {
    if (sValue.trim() === "") {
      _setValue(originalRef.current);
      return;
    }
    originalRef.current = sValue;
    // save wired later
  }
  function handleChange(e) {
    const v = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(v)) _setValue(v);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={styles.editInput}
      value={sValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
}
