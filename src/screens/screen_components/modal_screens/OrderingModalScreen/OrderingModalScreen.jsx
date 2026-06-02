/*eslint-disable*/
/**
 * OrderingModalScreen — desktop polish view for vendor orders.
 *
 * Left rail lists open vendor orders (phone-scanned). Right pane shows the
 * selected order's items in a table where qty / price are editable and the
 * vendor catalog name renders under the store name when they differ.
 *
 * The "+ NEW ORDER" header button opens a small sub-modal that creates a
 * new vendor order with a name field pre-filled to a friendly timestamp.
 */

import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  Dialog,
  LargeModalHeader,
  LargeModalHeaderButton,
  ModalFooter,
  ModalFooterButton,
  TextInput,
  Tooltip,
} from "../../../../dom_components";
import { useZ } from "../../../../hooks/useZ";
import { C, ICONS } from "../../../../styles";
import {
  useAlertScreenStore,
  useInventoryStore,
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
} from "../../../../stores";
import {
  dbListenToVendorOrders,
  dbListenToVendorOrderItems,
  dbSaveVendorOrder,
  dbUpdateVendorOrderFields,
  dbSaveVendorOrderItem,
  dbDeleteVendorOrder,
  dbDeleteVendorOrderItem,
  dbUpdateVendorOrderItemFields,
  readInventoryQtyMap,
  checkInventoryAcrossWarehouses,
} from "../../../../db_calls_wrapper";
import { httpsCallable } from "firebase/functions";
import { FUNCTIONS } from "../../../../db_calls";
import { VENDOR_ORDER_PROTO, VENDOR_ORDER_ITEM_PROTO, VENDOR_CATALOGS } from "../../../../data";
import { formatCurrencyDisp, generate36CharUUID, resolveStatus, usdTypeMask } from "../../../../utils";
import { sortWorkorders, scoreWorkorder } from "../../Options_Screen/Options_Workorders/utils";
import { workerSearchInventory } from "../../../../inventorySearchManager";
import styles from "./OrderingModalScreen.module.css";

const InventoryItemModalScreen = lazy(() =>
  import("../InventoryItemModalScreen").then((m) => ({
    default: m.InventoryItemModalScreen,
  })),
);

export const OrderingModalScreen = ({ handleExit }) => {
  const [sOrders, _setOrders] = useState([]);
  const [sSelectedOrderID, _setSelectedOrderID] = useState(null);
  const [sItems, _setItems] = useState([]);
  const [sActiveItems, _setActiveItems] = useState([]);
  const [sShowNewOrderModal, _setShowNewOrderModal] = useState(false);
  const zInventoryArr = useInventoryStore((s) => s.getInventoryArr?.()) || [];
  const zActiveOrderID = useSettingsStore(
    (s) => s.getSettings()?.activeVendorOrderID || "",
  );

  useEffect(() => {
    const unsub = dbListenToVendorOrders((data) => {
      _setOrders(Array.isArray(data) ? data : []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const openOrders = useMemo(
    () =>
      sOrders
        .filter((o) => !o.status || o.status === "open")
        .sort((a, b) => (b.lastModifiedMillis || 0) - (a.lastModifiedMillis || 0)),
    [sOrders],
  );

  const activeOrder = useMemo(
    () => sOrders.find((o) => o.id === zActiveOrderID) || null,
    [sOrders, zActiveOrderID],
  );

  // Default to the most-recently-modified open order until the user picks one.
  const effectiveSelectedID = sSelectedOrderID || openOrders[0]?.id || null;

  useEffect(() => {
    if (!effectiveSelectedID) {
      _setItems([]);
      return;
    }
    const unsub = dbListenToVendorOrderItems(effectiveSelectedID, (data) => {
      _setItems(Array.isArray(data) ? data : []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [effectiveSelectedID]);

  // Dedicated live listener on the active order's items. Mounts when the modal
  // mounts (component lifecycle), follows settings.activeVendorOrderID, and
  // unmounts on close. When the user hits the "set as active" button on a
  // different row, zActiveOrderID flips and the effect re-subscribes.
  useEffect(() => {
    if (!zActiveOrderID) {
      _setActiveItems([]);
      return;
    }
    const unsub = dbListenToVendorOrderItems(zActiveOrderID, (data) => {
      _setActiveItems(Array.isArray(data) ? data : []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [zActiveOrderID]);

  function handleCreateOrder(name) {
    const currentUser = useLoginStore.getState().getCurrentUser?.() || {};
    const now = Date.now();
    const order = cloneDeep(VENDOR_ORDER_PROTO);
    order.id = generate36CharUUID();
    order.name = name;
    order.createdMillis = now;
    order.createdByUserID = currentUser.id || "";
    order.lastModifiedMillis = now;
    order.lastModifiedByUserID = currentUser.id || "";
    dbSaveVendorOrder(order);
    // First order in the store → auto-promote to active so incoming scans
    // have somewhere to land without an extra tap.
    if (openOrders.length === 0) {
      useSettingsStore.getState().setField("activeVendorOrderID", order.id);
    }
    _setShowNewOrderModal(false);
    _setSelectedOrderID(order.id);
  }

  const [sSubmittingJBI, _setSubmittingJBI] = useState(false);

  function handleSubmitToJBI() {
    if (!effectiveSelectedID) return;
    const order = openOrders.find((o) => o.id === effectiveSelectedID) || null;
    const jbiItems = sItems.filter(
      (it) => it && it.vendorCatalogID === "jbi",
    );
    if (jbiItems.length === 0) {
      useAlertScreenStore.getState().setValues({
        title: "NO JBI ITEMS",
        message:
          "This order doesn't have any items tagged to the JBI catalog. Only resolved JBI items are submitted.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    useAlertScreenStore.getState().setValues({
      title: "SUBMIT TO JBI",
      message: `Submit ${jbiItems.length} item${jbiItems.length === 1 ? "" : "s"} to JBI for "${order?.name || effectiveSelectedID}"?`,
      btn1Text: "SUBMIT",
      btn2Text: "CANCEL",
      handleBtn1Press: async () => {
        useAlertScreenStore.getState().resetAll();
        _setSubmittingJBI(true);
        try {
          const callable = httpsCallable(FUNCTIONS, "submitJbiOrderCallable");
          const res = await callable({ orderID: effectiveSelectedID });
          const data = (res && res.data) || {};
          useAlertScreenStore.getState().setValues({
            title: "SUBMITTED",
            message: `JBI accepted the order via ${data?.result?.channel || "submission"}. ${data?.result?.itemCount || jbiItems.length} item${(data?.result?.itemCount || jbiItems.length) === 1 ? "" : "s"} sent.`,
            btn1Text: "OK",
            handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
            showAlert: true,
            canExitOnOuterClick: true,
          });
          if (effectiveSelectedID === zActiveOrderID) {
            useSettingsStore.getState().setField("activeVendorOrderID", "");
          }
          if (sSelectedOrderID === effectiveSelectedID) {
            _setSelectedOrderID(null);
          }
        } catch (err) {
          const message =
            (err && err.message) ||
            "Submission failed. Check the order and try again.";
          useAlertScreenStore.getState().setValues({
            title: "SUBMISSION FAILED",
            message,
            btn1Text: "OK",
            handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
            showAlert: true,
            canExitOnOuterClick: true,
          });
        } finally {
          _setSubmittingJBI(false);
        }
      },
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: false,
    });
  }

  function handleDeleteOrder(order) {
    if (!order || !order.id) return;
    const displayName = order.name || "this order";
    useAlertScreenStore.getState().setValues({
      title: "DELETE ORDER",
      message: `Are you sure you want to delete "${displayName}"?\n\nAll scanned items on this order will be removed.`,
      btn1Text: "DELETE",
      btn2Text: "CANCEL",
      handleBtn1Press: async () => {
        if (order.id === zActiveOrderID) {
          useSettingsStore.getState().setField("activeVendorOrderID", "");
        }
        if (order.id === sSelectedOrderID) {
          _setSelectedOrderID(null);
        }
        await dbDeleteVendorOrder(order.id);
      },
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: false,
    });
  }

  return (
    <>
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
            actions={[
              <LargeModalHeaderButton
                key="new"
                variant="accent"
                tooltip="Add to open order"
                onClick={() => _setShowNewOrderModal(true)}
              >
                + NEW ORDER
              </LargeModalHeaderButton>,
              <LargeModalHeaderButton
                key="submit-jbi"
                variant="primary"
                tooltip="Submit JBI items on the selected order to JBI"
                disabled={!effectiveSelectedID || sSubmittingJBI}
                onClick={handleSubmitToJBI}
              >
                {sSubmittingJBI ? "SUBMITTING…" : "SUBMIT TO JBI"}
              </LargeModalHeaderButton>,
              <LargeModalHeaderButton
                key="close"
                variant="default"
                onClick={handleExit}
              >
                CLOSE
              </LargeModalHeaderButton>,
            ]}
          />

          <div className={styles.body}>
            <div className={styles.leftRail}>
              <div className={styles.railHeader}>Open Orders</div>
              <div className={styles.orderList}>
                {openOrders.map((order) => (
                  <OrderListRow
                    key={order.id}
                    order={order}
                    active={order.id === effectiveSelectedID}
                    isActiveOrder={order.id === zActiveOrderID}
                    onSelect={() => _setSelectedOrderID(order.id)}
                    onDelete={() => handleDeleteOrder(order)}
                  />
                ))}
                {openOrders.length === 0 && (
                  <div className={styles.emptyState}>No open orders.</div>
                )}
              </div>
            </div>

            <div className={styles.rightPane}>
              {!effectiveSelectedID ? (
                <div className={styles.emptyDetail}>
                  Select an order on the left to see its contents.
                </div>
              ) : (
                <OrderItemsTable
                  items={sItems}
                  inventory={zInventoryArr}
                  orderID={effectiveSelectedID}
                />
              )}
            </div>
          </div>
        </div>
      </Dialog>

      {sShowNewOrderModal && (
        <NewOrderModal
          onCancel={() => _setShowNewOrderModal(false)}
          onCreate={handleCreateOrder}
        />
      )}
    </>
  );
};

function OrderListRow({ order, active, isActiveOrder, onSelect, onDelete }) {
  const [sEditing, _setEditing] = useState(false);
  const [sName, _setName] = useState(order.name || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!sEditing) _setName(order.name || "");
  }, [order.name, sEditing]);

  const dateLabel = order.createdMillis
    ? new Date(order.createdMillis).toLocaleString()
    : "Unknown date";

  function persistName(val) {
    const currentUser = useLoginStore.getState().getCurrentUser?.() || {};
    dbUpdateVendorOrderFields(order.id, {
      name: val,
      lastModifiedMillis: Date.now(),
      lastModifiedByUserID: currentUser.id || "",
    });
  }

  function handleNameChange(val) {
    _setName(val);
    persistName(val);
  }

  function handleStartEdit(e) {
    e.stopPropagation();
    _setEditing(true);
  }

  function handleFinishEdit() {
    _setEditing(false);
  }

  function handleSetActive(e) {
    e.stopPropagation();
    useSettingsStore.getState().setField("activeVendorOrderID", order.id);
  }

  return (
    <div
      className={`${styles.orderRow} ${active ? styles.orderRowActive : ""}`}
      role="button"
      tabIndex={sEditing ? -1 : 0}
      onClick={() => { if (!sEditing) onSelect(); }}
      onKeyDown={(e) => {
        if (sEditing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {isActiveOrder && (
        <div className={styles.orderActiveBanner}>ACTIVE</div>
      )}
      {sEditing ? (
        <TextInput
          inputRef={inputRef}
          value={sName}
          onChangeText={handleNameChange}
          autoFocus
          multiline
          onBlur={handleFinishEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              inputRef.current?.blur();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={styles.orderNameInput}
          style={{ lineHeight: "18px" }}
        />
      ) : (
        <span className={styles.orderDate}>
          {order.name || dateLabel}
        </span>
      )}
      <div className={styles.orderActions}>
        {!isActiveOrder && (
          <Tooltip text="Set as active order (incoming scans append here)" position="top" darkMode>
            <button
              type="button"
              className={styles.orderEditBtn}
              aria-label="Set as active order"
              onClick={handleSetActive}
            >
              <img src={ICONS.check} alt="" className={styles.orderEditIcon} />
            </button>
          </Tooltip>
        )}
        <Tooltip text={sEditing ? "Done editing" : "Edit name"} position="top" darkMode>
          <button
            type="button"
            className={styles.orderEditBtn}
            aria-label={sEditing ? "Done editing" : "Edit name"}
            onClick={sEditing ? (e) => { e.stopPropagation(); inputRef.current?.blur(); } : handleStartEdit}
          >
            <img src={ICONS.editPencil} alt="" className={styles.orderEditIcon} />
          </button>
        </Tooltip>
        <Tooltip text="Delete order" position="top" darkMode>
          <button
            type="button"
            className={styles.orderEditBtn}
            aria-label="Delete order"
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          >
            <img src={ICONS.trash} alt="" className={styles.orderEditIcon} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function NewOrderModal({ onCancel, onCreate }) {
  const [sName, _setName] = useState(() => formatOrderDate(new Date()));
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  function handleSubmit() {
    const trimmed = sName.trim();
    if (!trimmed) return;
    onCreate(trimmed);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <Dialog visible={true} onClose={onCancel} overlayColor={C.surfaceOverlay}>
      <div className={styles.newOrderCard}>
        <LargeModalHeader
          title={<span className={styles.title}>New Order</span>}
        />
        <div className={styles.newOrderBody}>
          <label className={styles.newOrderLabel} htmlFor="newOrderName">
            Order Name
          </label>
          <input
            id="newOrderName"
            ref={inputRef}
            type="text"
            className={styles.newOrderInput}
            value={sName}
            onChange={(e) => _setName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <ModalFooter>
          <ModalFooterButton variant="default" onClick={onCancel}>
            CANCEL
          </ModalFooterButton>
          <ModalFooterButton
            variant="accent"
            disabled={!sName.trim()}
            onClick={handleSubmit}
          >
            CREATE
          </ModalFooterButton>
        </ModalFooter>
      </div>
    </Dialog>
  );
}

function formatOrderDate(date) {
  const days = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const day = date.getDate();
  const ordinal = (n) => {
    if (n >= 11 && n <= 13) return "th";
    const last = n % 10;
    if (last === 1) return "st";
    if (last === 2) return "nd";
    if (last === 3) return "rd";
    return "th";
  };
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const mm = minutes.toString().padStart(2, "0");
  return `${dayName}, ${monthName} ${day}${ordinal(day)}, ${hours}:${mm} ${ampm}`;
}

const SPOOF_VENDORS = ["QBP", "BTI", "JBI", "HLC", "OGC"];
const SPOOF_QTYS = [2, 4, 1, 3, 6];

// Stable fallback so the qtyMap effect dep doesn't flip to a fresh {} every
// render when settings.vendors is undefined (tenants with no custom vendors).
const EMPTY_VENDORS = Object.freeze({});

function OrderItemsTable({ items, inventory, orderID }) {
  const settingsVendors =
    useSettingsStore((s) => s.getSettings()?.vendors) || EMPTY_VENDORS;
  const previewItems = useMemo(() => {
    if (items.length > 0) return items;
    const candidates = inventory
      .filter(
        (inv) =>
          inv &&
          (inv.formalName || inv.informalName) &&
          Number(inv.price) > 0,
      )
      .map((inv) => ({
        inv,
        name: inv.formalName || inv.informalName || "",
      }))
      .sort((a, b) => b.name.length - a.name.length)
      .slice(0, 5);
    return candidates.map(({ inv }, i) => ({
      id: "spoof-" + (inv.id || i),
      scannedBarcode:
        inv.primaryBarcode ||
        (Array.isArray(inv.barcodes) ? inv.barcodes[0] : "") ||
        "",
      catalogSnapshot: {},
      qty: SPOOF_QTYS[i % SPOOF_QTYS.length],
      price: inv.price,
      vendorCatalogID: SPOOF_VENDORS[i % SPOOF_VENDORS.length],
    }));
  }, [items, inventory]);

  // Warehouse-stock map: itemID → qty at the store's home warehouse for that
  // vendor. Built by grouping previewItems by vendorCatalogID and firing one
  // batched `in`-query per vendor (chunked internally to Firestore's 30 cap).
  // Missing entries = 0 stock per the "no doc = zero" semantic.
  const [sQtyMap, _setQtyMap] = useState(() => new Map());

  // Stable join key for the effect — vendor:item pairs joined and sorted so
  // identical lists don't trigger refetches on every render.
  const lookupKey = useMemo(() => {
    return previewItems
      .filter((it) => it.vendorCatalogID && it.vendorItemID)
      .map((it) => `${it.vendorCatalogID}:${it.vendorItemID}`)
      .sort()
      .join(",");
  }, [previewItems]);

  useEffect(() => {
    if (!lookupKey) {
      _setQtyMap((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    let cancelled = false;
    const byVendor = new Map();
    lookupKey.split(",").forEach((pair) => {
      const [vendorID, itemID] = pair.split(":");
      if (!byVendor.has(vendorID)) byVendor.set(vendorID, []);
      byVendor.get(vendorID).push(itemID);
    });
    (async () => {
      const next = new Map();
      await Promise.all(
        Array.from(byVendor.entries()).map(async ([vendorID, itemIDs]) => {
          const warehouseCode = settingsVendors?.[vendorID]?.warehouseCode || "";
          if (!warehouseCode) return;
          const qtyForVendor = await readInventoryQtyMap(vendorID, warehouseCode, itemIDs);
          qtyForVendor.forEach((qty, itemID) => next.set(itemID, qty));
        }),
      );
      if (!cancelled) _setQtyMap(next);
    })();
    return () => { cancelled = true; };
  }, [lookupKey, settingsVendors]);

  return (
    <>
      <OrderItemSearchRow orderID={orderID} items={items} inventory={inventory} />

      <div className={styles.tableWrap}>
        <div className={`${styles.row} ${styles.headerRow}`}>
          <div className={styles.colName}>Item</div>
          <div className={styles.colVendor}>Vendor</div>
          <div className={styles.colQty}>{"Qty\nOrdered"}</div>
          <div className={styles.colQty}>{"Qty\nAvailable"}</div>
          <div className={styles.colCost}>Cost</div>
          <div className={styles.colPrice}>{"Our\nPrice"}</div>
          <div className={styles.colPrice}>MSRP</div>
          <div className={styles.colPrice}>{"Sale\nPrice"}</div>
        </div>

        {previewItems.map((item) => (
          <OrderItemRow
            key={item.id}
            item={item}
            inventory={inventory}
            orderID={orderID}
            warehouseQty={
              item.vendorItemID && sQtyMap.has(item.vendorItemID)
                ? sQtyMap.get(item.vendorItemID)
                : null
            }
            homeWarehouseCode={
              settingsVendors?.[item.vendorCatalogID]?.warehouseCode || ""
            }
          />
        ))}
      </div>
    </>
  );
}

const SEARCH_ROW_DEFAULT_QTY = "1";

function OrderItemSearchRow({ orderID, items = [], inventory = [] }) {
  const inventoryByBarcode = useMemo(() => {
    const map = new Map();
    inventory.forEach((inv) => {
      if (!inv) return;
      if (inv.primaryBarcode) map.set(inv.primaryBarcode, inv);
      if (Array.isArray(inv.barcodes)) {
        inv.barcodes.forEach((b) => {
          if (b) map.set(b, inv);
        });
      }
    });
    return map;
  }, [inventory]);

  const vendorTotals = useMemo(() => {
    const map = {};
    items.forEach((it) => {
      const vid = it.vendorCatalogID || "other";
      const qty = parseInt(it.qty, 10) || 0;
      const invMatch = inventoryByBarcode.get(it.scannedBarcode);
      const rawCost = it.catalogSnapshot?.cost ?? invMatch?.cost ?? 0;
      const cost = parseFloat(rawCost) || 0;
      const total = qty * cost;
      map[vid] = (map[vid] || 0) + total;
    });
    return map;
  }, [items, inventoryByBarcode]);
  const vendorTotalEntries = Object.entries(vendorTotals);

  const [sQuery, _setQuery] = useState("");
  const [sResults, _setResults] = useState([]);
  const [sOpen, _setOpen] = useState(false);
  const [sSelectedIndex, _setSelectedIndex] = useState(0);
  const [sQtyByID, _setQtyByID] = useState({});
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  function getRowQty(invID) {
    const v = sQtyByID[invID];
    return v === undefined ? SEARCH_ROW_DEFAULT_QTY : v;
  }
  function setRowQty(invID, value) {
    _setQtyByID((prev) => ({ ...prev, [invID]: value }));
  }
  function isRowAdjusted(invID) {
    const v = sQtyByID[invID];
    return v !== undefined && v !== "" && v !== SEARCH_ROW_DEFAULT_QTY;
  }

  useEffect(() => {
    const q = sQuery.trim();
    if (q.length < 2) {
      _setResults([]);
      _setOpen(false);
      return;
    }
    workerSearchInventory(q, (results) => {
      _setResults((results || []).slice(0, 35));
      _setSelectedIndex(0);
      _setOpen(true);
    });
  }, [sQuery]);

  useEffect(() => {
    if (!sOpen) return;
    const el = wrapRef.current;
    function handleDocClick(e) {
      if (el && !el.contains(e.target)) {
        _setOpen(false);
      }
    }
    // Native listener on the wrap so we can stopPropagation BEFORE the
    // event bubbles up to Radix Dialog's document-level Esc handler.
    function handleEscLocal(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        _setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("mousedown", handleDocClick);
    el?.addEventListener("keydown", handleEscLocal);
    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      el?.removeEventListener("keydown", handleEscLocal);
    };
  }, [sOpen]);

  async function addSingleItem(invItem, qty) {
    if (!orderID || !invItem || !qty || qty < 1) return;
    const currentUser = useLoginStore.getState().getCurrentUser?.() || {};
    const orderItem = cloneDeep(VENDOR_ORDER_ITEM_PROTO);
    orderItem.id = generate36CharUUID();
    orderItem.scannedBarcode =
      invItem.primaryBarcode ||
      (Array.isArray(invItem.barcodes) ? invItem.barcodes[0] : "") ||
      "";
    orderItem.qty = qty;
    orderItem.addedMillis = Date.now();
    orderItem.addedByUserID = currentUser.id || "";
    orderItem.lookupStatus = "matched";
    orderItem.vendorItemID = invItem.id;
    await dbSaveVendorOrderItem(orderID, orderItem);
  }

  function resetSearch() {
    _setQuery("");
    _setResults([]);
    _setOpen(false);
    _setQtyByID({});
    _setSelectedIndex(0);
  }

  async function commitAdjustedOrFallback() {
    const adjusted = sResults
      .map((inv) => ({ inv, qtyStr: sQtyByID[inv.id] }))
      .filter(
        ({ qtyStr }) =>
          qtyStr !== undefined &&
          qtyStr !== "" &&
          qtyStr !== SEARCH_ROW_DEFAULT_QTY,
      );
    if (adjusted.length > 0) {
      await Promise.all(
        adjusted.map(({ inv, qtyStr }) =>
          addSingleItem(inv, parseInt(qtyStr, 10) || 0),
        ),
      );
      resetSearch();
      return;
    }
    const sel = sResults[sSelectedIndex];
    if (sel) {
      await addSingleItem(sel, 1);
      resetSearch();
    }
  }

  async function commitSingleRow(invItem) {
    const qtyStr = getRowQty(invItem.id);
    const qty = parseInt(qtyStr, 10) || 0;
    if (qty < 1) return;
    await addSingleItem(invItem, qty);
    resetSearch();
  }

  return (
    <div className={styles.searchRow} ref={wrapRef}>
      <div className={styles.searchInputWrap}>
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search inventory…"
          value={sQuery}
          onChange={(e) => _setQuery(e.target.value)}
          onFocus={() => {
            if (sResults.length > 0) _setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!sOpen || sResults.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              _setSelectedIndex((i) =>
                Math.min(i + 1, sResults.length - 1),
              );
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              _setSelectedIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              commitAdjustedOrFallback();
            }
          }}
        />
      </div>
      <div className={styles.orderSummary}>
        {vendorTotalEntries.map(([vid, total]) => {
          const vendor = VENDOR_CATALOGS.find((v) => v.id === vid);
          const label = vendor?.displayName || vid;
          return (
            <div key={vid} className={styles.vendorTotalChip}>
              <span className={styles.vendorTotalLabel}>{label}</span>
              <span className={styles.vendorTotalValue}>
                {formatCurrencyDisp(total, true)}
              </span>
            </div>
          );
        })}
      </div>
      {sOpen && sResults.length > 0 && (
        <div className={styles.searchDropdown}>
          {sResults.map((inv, idx) => (
            <SearchResultRow
              key={inv.id}
              inv={inv}
              isSelected={idx === sSelectedIndex}
              onHover={() => _setSelectedIndex(idx)}
              qty={getRowQty(inv.id)}
              qtyChanged={isRowAdjusted(inv.id)}
              onQtyChange={(v) => setRowQty(inv.id, v)}
              onCommitAll={commitAdjustedOrFallback}
              onCommitRow={() => commitSingleRow(inv)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({
  inv,
  isSelected,
  onHover,
  qty,
  qtyChanged,
  onQtyChange,
  onCommitAll,
  onCommitRow,
}) {
  const rowRef = useRef(null);

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  function handleQtyFocus() {
    onQtyChange("");
  }
  function handleQtyBlur() {
    if (typeof qty === "string" && qty.trim() === "") {
      onQtyChange(SEARCH_ROW_DEFAULT_QTY);
    }
  }
  function handleQtyChange(e) {
    const v = e.target.value;
    if (/^\d*$/.test(v)) onQtyChange(v);
  }
  function handleQtyIncrement() {
    const base = qty !== "" ? qty : SEARCH_ROW_DEFAULT_QTY;
    const current = parseInt(base, 10) || 0;
    onQtyChange(String(current + 1));
  }

  const name = inv.formalName || inv.informalName || "(unnamed)";

  return (
    <div
      ref={rowRef}
      className={`${styles.searchResultRow} ${isSelected ? styles.searchResultRowSelected : ""}`}
      onClick={onCommitRow}
      onMouseEnter={onHover}
      role="button"
      tabIndex={0}
    >
      <span className={styles.searchResultName}>{name}</span>
      <button
        type="button"
        className={styles.qtyUpBtn}
        aria-label="Increment quantity"
        onClick={(e) => {
          e.stopPropagation();
          handleQtyIncrement();
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <img
          src={ICONS.upArrowOrange}
          alt=""
          className={styles.qtyUpIcon}
        />
      </button>
      <input
        type="text"
        inputMode="numeric"
        className={styles.searchResultQty}
        value={qty}
        onFocus={handleQtyFocus}
        onBlur={handleQtyBlur}
        onChange={handleQtyChange}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            onCommitAll();
          }
        }}
      />
      <button
        type="button"
        className={`${styles.searchResultSaveBtn} ${qtyChanged ? "" : styles.searchResultSaveBtnHidden}`}
        aria-label="Add to order"
        tabIndex={qtyChanged ? 0 : -1}
        onClick={(e) => {
          e.stopPropagation();
          onCommitAll();
        }}
      >
        <img
          src={ICONS.check1}
          alt=""
          className={styles.searchResultSaveIcon}
        />
      </button>
    </div>
  );
}

// Renders the home-warehouse stock count for a line item. When qty is 0 (out
// of stock at home) and there's a known vendor + item, an info icon opens a
// popover that fans out across every warehouse for the vendor and streams
// results in as each getDoc resolves.
//   qty === null   → no vendor item or no warehouse configured; show "—"
//   qty > 0        → green, no icon (in stock at home)
//   qty === 0      → red + check-elsewhere icon (out at home)
function WarehouseAvailability({
  vendorID,
  vendorItemID,
  qty,
  homeWarehouseCode,
  isOpen,
  onOpenChange,
}) {
  const popoverZ = useZ("dropdown", isOpen);
  const [sResults, _setResults] = useState([]);
  const [sLoading, _setLoading] = useState(false);
  const canCheckElsewhere = !!vendorID && !!vendorItemID && qty === 0;
  const display = qty === null || qty === undefined ? "—" : String(qty);
  const valueClass =
    qty === null || qty === undefined
      ? styles.qtyAvailMuted
      : qty > 0
        ? styles.qtyAvailInStock
        : styles.qtyAvailOut;

  useEffect(() => {
    if (!isOpen || !canCheckElsewhere) return;
    let cancelled = false;
    _setResults([]);
    _setLoading(true);
    checkInventoryAcrossWarehouses(vendorID, vendorItemID, {
      homeWarehouseCode,
      onResult: (entry) => {
        if (cancelled) return;
        _setResults((prev) => {
          const next = prev.concat(entry);
          next.sort((a, b) => {
            if (a.isHome !== b.isHome) return a.isHome ? -1 : 1;
            if ((a.qty > 0) !== (b.qty > 0)) return a.qty > 0 ? -1 : 1;
            return b.qty - a.qty;
          });
          return next;
        });
      },
    }).finally(() => {
      if (!cancelled) _setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, canCheckElsewhere, vendorID, vendorItemID, homeWarehouseCode]);

  if (!canCheckElsewhere) {
    return <span className={`${styles.qtyAvailValue} ${valueClass}`}>{display}</span>;
  }

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor asChild>
        <button
          type="button"
          className={styles.qtyAvailBtn}
          onClick={(e) => { e.stopPropagation(); onOpenChange(!isOpen); }}
          aria-label="Check stock at other warehouses"
        >
          <span className={`${styles.qtyAvailValue} ${valueClass}`}>{display}</span>
          <span className={styles.qtyAvailHint}>›</span>
        </button>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="right"
          align="center"
          sideOffset={6}
          collisionPadding={10}
          style={{ zIndex: popoverZ }}
          className={styles.warehousePopover}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.warehousePopoverTitle}>Stock by warehouse</div>
          {sResults.length === 0 && sLoading && (
            <div className={styles.warehousePopoverEmpty}>Checking…</div>
          )}
          {sResults.length === 0 && !sLoading && (
            <div className={styles.warehousePopoverEmpty}>Out everywhere</div>
          )}
          {sResults.map((r) => (
            <div
              key={r.code}
              className={`${styles.warehouseRow} ${r.isHome ? styles.warehouseRowHome : ""}`}
            >
              <span className={styles.warehouseLabel}>
                {r.name}
                {r.state ? <span className={styles.warehouseState}> · {r.state}</span> : null}
                {r.isHome ? <span className={styles.warehouseHomeTag}> · home</span> : null}
              </span>
              <span
                className={
                  r.qty > 0 ? styles.warehouseQtyInStock : styles.warehouseQtyOut
                }
              >
                {r.qty}
              </span>
            </div>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function OrderItemRow({ item, inventory, orderID, warehouseQty, homeWarehouseCode }) {
  const qtyRef = useRef(null);
  const [sInvModalItem, _setInvModalItem] = useState(null);
  const [sCheckElsewhereOpen, _setCheckElsewhereOpen] = useState(false);
  const [sShowWorkorderPicker, _setShowWorkorderPicker] = useState(false);
  function handleDelete() {
    if (!orderID || !item?.id) return;
    dbDeleteVendorOrderItem(orderID, item.id);
  }

  function handleAssignWorkorder(workorder) {
    if (!orderID || !item?.id) return;
    const fields = workorder
      ? {
          workorderID: workorder.id || "",
          customerName: workorderCustomerName(workorder),
        }
      : { workorderID: "", customerName: "" };
    dbUpdateVendorOrderItemFields(orderID, item.id, fields);
    _setShowWorkorderPicker(false);
  }
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
  const costDisplay = formatCentsAsDollars(cost);
  const inventoryPrice = localMatch?.price;
  const hasInventoryPrice =
    typeof inventoryPrice === "number" && inventoryPrice > 0;
  const inventoryPriceDisplay = hasInventoryPrice
    ? formatCentsAsDollars(inventoryPrice)
    : "";
  const inventorySalePrice = localMatch?.salePrice;
  const hasInventorySalePrice =
    typeof inventorySalePrice === "number" && inventorySalePrice > 0;
  const inventorySalePriceDisplay = hasInventorySalePrice
    ? formatCentsAsDollars(inventorySalePrice)
    : "";

  const pricePlaceholder = useMemo(() => {
    if (hasInventoryPrice) return "";
    const msrp = localMatch?.msrp;
    if (typeof msrp === "number" && msrp > 0) {
      return formatCentsAsDollars(msrp);
    }
    const costRaw = localMatch?.cost;
    const costNum =
      typeof costRaw === "number"
        ? costRaw
        : costRaw
          ? parseFloat(costRaw)
          : NaN;
    if (!isNaN(costNum) && costNum > 0) {
      return formatCentsAsDollars(costNum * 2);
    }
    return formatCentsAsDollars(0) || "0.00";
  }, [hasInventoryPrice, localMatch?.msrp, localMatch?.cost]);

  const [sPriceValue, _setPriceValue] = useState(inventoryPriceDisplay);
  const [sPriceBaseline, _setPriceBaseline] = useState(inventoryPriceDisplay);
  const [sPriceFocused, _setPriceFocused] = useState(false);

  useEffect(() => {
    _setPriceValue(inventoryPriceDisplay);
    _setPriceBaseline(inventoryPriceDisplay);
  }, [inventoryPriceDisplay]);

  const priceChanged =
    sPriceValue !== sPriceBaseline && sPriceValue.trim() !== "";

  function handlePriceChange(e) {
    const raw = e.target.value;
    const onlyDigits = raw.replace(/\D/g, "");
    if (onlyDigits === "") {
      _setPriceValue("");
      return;
    }
    _setPriceValue(usdTypeMask(onlyDigits).display);
  }

  function handlePriceFocus() {
    _setPriceFocused(true);
    _setPriceValue("");
  }

  function handlePriceBlur() {
    _setPriceFocused(false);
    if (sPriceValue.trim() === "") {
      _setPriceValue(sPriceBaseline);
    }
    // save wired later
  }

  function handlePriceConfirm() {
    _setPriceBaseline(sPriceValue);
    // save wired later
  }

  function handlePriceReset() {
    _setPriceValue(sPriceBaseline);
  }

  const priceHintValue = sPriceBaseline || pricePlaceholder;
  const showPriceHint =
    sPriceFocused && sPriceValue === "" && !!priceHintValue;

  const [sSalePriceValue, _setSalePriceValue] = useState(inventorySalePriceDisplay);
  const [sSalePriceBaseline, _setSalePriceBaseline] = useState(inventorySalePriceDisplay);
  const [sSalePriceFocused, _setSalePriceFocused] = useState(false);

  useEffect(() => {
    _setSalePriceValue(inventorySalePriceDisplay);
    _setSalePriceBaseline(inventorySalePriceDisplay);
  }, [inventorySalePriceDisplay]);

  const salePriceChanged =
    sSalePriceValue !== sSalePriceBaseline && sSalePriceValue.trim() !== "";

  function handleSalePriceChange(e) {
    const raw = e.target.value;
    const onlyDigits = raw.replace(/\D/g, "");
    if (onlyDigits === "") {
      _setSalePriceValue("");
      return;
    }
    _setSalePriceValue(usdTypeMask(onlyDigits).display);
  }

  function handleSalePriceFocus() {
    _setSalePriceFocused(true);
    _setSalePriceValue("");
  }

  function handleSalePriceBlur() {
    _setSalePriceFocused(false);
    if (sSalePriceValue.trim() === "") {
      _setSalePriceValue(sSalePriceBaseline);
    }
    // save wired later
  }

  function handleSalePriceConfirm() {
    _setSalePriceBaseline(sSalePriceValue);
    // save wired later
  }

  function handleSalePriceReset() {
    _setSalePriceValue(sSalePriceBaseline);
  }

  const salePricePlaceholder = "0.00";
  const salePriceHintValue = sSalePriceBaseline || salePricePlaceholder;
  const showSalePriceHint =
    sSalePriceFocused && sSalePriceValue === "" && !!salePriceHintValue;

  const effectivePriceCents = useMemo(() => {
    const source =
      sPriceValue && sPriceValue.trim() !== "" ? sPriceValue : pricePlaceholder;
    if (!source) return 0;
    const digits = String(source).replace(/\D/g, "");
    return digits ? parseInt(digits, 10) : 0;
  }, [sPriceValue, pricePlaceholder]);

  const effectiveCostCents = useMemo(() => {
    if (typeof cost === "number") return cost;
    if (typeof cost === "string" && cost) {
      const n = parseFloat(cost);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }, [cost]);

  const marginDisplay = useMemo(() => {
    if (!effectivePriceCents) return "";
    if (!effectiveCostCents) return "";
    const m =
      ((effectivePriceCents - effectiveCostCents) / effectivePriceCents) * 100;
    if (!Number.isFinite(m)) return "";
    return `${Math.round(m)}%`;
  }, [effectivePriceCents, effectiveCostCents]);

  const effectiveSalePriceCents = useMemo(() => {
    const source =
      sSalePriceValue && sSalePriceValue.trim() !== ""
        ? sSalePriceValue
        : salePricePlaceholder;
    if (!source) return 0;
    const digits = String(source).replace(/\D/g, "");
    return digits ? parseInt(digits, 10) : 0;
  }, [sSalePriceValue, salePricePlaceholder]);

  const salePriceMarginDisplay = useMemo(() => {
    if (!effectiveSalePriceCents) return "";
    if (!effectiveCostCents) return "";
    const m =
      ((effectiveSalePriceCents - effectiveCostCents) / effectiveSalePriceCents) *
      100;
    if (!Number.isFinite(m)) return "";
    return `${Math.round(m)}%`;
  }, [effectiveSalePriceCents, effectiveCostCents]);

  function handleOpenInvModal() {
    if (!localMatch) return;
    _setInvModalItem(localMatch);
  }

  return (
    <div className={styles.row}>
      <div className={styles.colNameWrap}>
        <Tooltip
          text={item.workorderID ? "Reassign / unassign workorder" : "Assign to workorder"}
          position="top"
          darkMode
        >
          <button
            type="button"
            className={`${styles.assignBtn} ${item.workorderID ? styles.assignBtnAssigned : ""}`}
            aria-label="Assign to workorder"
            onClick={(e) => {
              e.stopPropagation();
              _setShowWorkorderPicker(true);
            }}
          >
            <img src={ICONS.person} alt="" className={styles.assignIcon} />
          </button>
        </Tooltip>
        <div
          className={`${styles.colName} ${localMatch ? styles.colNameClickable : ""}`}
          role={localMatch ? "button" : undefined}
          tabIndex={localMatch ? 0 : undefined}
          onClick={handleOpenInvModal}
          onKeyDown={(e) => {
            if (!localMatch) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleOpenInvModal();
            }
          }}
        >
          <span className={styles.itemName}>{primaryName}</span>
          {showCatalogSub && (
            <span className={styles.catalogSubName}>{catalogName}</span>
          )}
          {item.customerName && (
            <span className={styles.customerSubName}>{item.customerName}</span>
          )}
        </div>
      </div>
      <div className={styles.colVendor}>{vendorID}</div>
      <div className={styles.colQty}>
        <div className={styles.qtyOrderedWrap}>
          <button
            type="button"
            className={styles.qtyUpBtn}
            aria-label="Increment quantity"
            onClick={() => qtyRef.current?.increment()}
          >
            <img
              src={ICONS.upArrowOrange}
              alt=""
              className={styles.qtyUpIcon}
            />
          </button>
          <EditableNumberField ref={qtyRef} initialValue={item.qty ?? ""} />
          <button
            type="button"
            className={styles.trashBtn}
            aria-label="Remove item"
            onClick={handleDelete}
          >
            <img src={ICONS.trash} alt="" className={styles.trashIcon} />
          </button>
        </div>
      </div>
      <div className={styles.colQty}>
        <WarehouseAvailability
          vendorID={vendorID}
          vendorItemID={item.vendorItemID || ""}
          qty={warehouseQty}
          homeWarehouseCode={homeWarehouseCode}
          isOpen={sCheckElsewhereOpen}
          onOpenChange={_setCheckElsewhereOpen}
        />
      </div>
      <div className={styles.colCost}>{costDisplay}</div>
      <div className={styles.colPrice}>
        <div className={styles.priceWrap}>
          <div className={styles.priceInputWrap}>
            {showPriceHint && (
              <span className={styles.previousValueHint}>
                {priceHintValue}
              </span>
            )}
            {marginDisplay && (
              <span className={styles.priceMargin}>{marginDisplay}</span>
            )}
            <input
              type="text"
              inputMode="numeric"
              className={`${styles.editInput} ${styles.priceInput}`}
              value={sPriceValue}
              placeholder={pricePlaceholder}
              onFocus={handlePriceFocus}
              onBlur={handlePriceBlur}
              onChange={handlePriceChange}
            />
          </div>
          <div
            className={`${styles.priceBtnStack} ${priceChanged ? "" : styles.priceBtnStackHidden}`}
          >
            <Tooltip text="Save new price" position="right">
              <button
                type="button"
                className={styles.priceSaveBtn}
                aria-label="Save price"
                tabIndex={priceChanged ? 0 : -1}
                onClick={handlePriceConfirm}
              >
                <img src={ICONS.check1} alt="" className={styles.priceSaveIcon} />
              </button>
            </Tooltip>
            <Tooltip text="Reset to original" position="right">
              <button
                type="button"
                className={styles.priceResetBtn}
                aria-label="Reset price"
                tabIndex={priceChanged ? 0 : -1}
                onClick={handlePriceReset}
              >
                <img src={ICONS.reset1} alt="" className={styles.priceResetIcon} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className={styles.colPrice} />
      <div className={styles.colPrice}>
        <div className={styles.priceWrap}>
          <div className={styles.priceInputWrap}>
            {showSalePriceHint && (
              <span className={styles.previousValueHint}>
                {salePriceHintValue}
              </span>
            )}
            {salePriceMarginDisplay && (
              <span className={styles.priceMargin}>{salePriceMarginDisplay}</span>
            )}
            <input
              type="text"
              inputMode="numeric"
              className={`${styles.editInput} ${styles.priceInput}`}
              value={sSalePriceValue}
              placeholder={salePricePlaceholder}
              onFocus={handleSalePriceFocus}
              onBlur={handleSalePriceBlur}
              onChange={handleSalePriceChange}
            />
          </div>
          <div
            className={`${styles.priceBtnStack} ${salePriceChanged ? "" : styles.priceBtnStackHidden}`}
          >
            <Tooltip text="Save new sale price" position="right">
              <button
                type="button"
                className={styles.priceSaveBtn}
                aria-label="Save sale price"
                tabIndex={salePriceChanged ? 0 : -1}
                onClick={handleSalePriceConfirm}
              >
                <img src={ICONS.check1} alt="" className={styles.priceSaveIcon} />
              </button>
            </Tooltip>
            <Tooltip text="Reset to original" position="right">
              <button
                type="button"
                className={styles.priceResetBtn}
                aria-label="Reset sale price"
                tabIndex={salePriceChanged ? 0 : -1}
                onClick={handleSalePriceReset}
              >
                <img src={ICONS.reset1} alt="" className={styles.priceResetIcon} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      {sInvModalItem && (
        <Suspense fallback={null}>
          <InventoryItemModalScreen
            key={sInvModalItem.id}
            item={sInvModalItem}
            isNew={false}
            handleExit={() => _setInvModalItem(null)}
          />
        </Suspense>
      )}
      {sShowWorkorderPicker && (
        <WorkorderPickerModal
          currentWorkorderID={item.workorderID || ""}
          onCancel={() => _setShowWorkorderPicker(false)}
          onPick={handleAssignWorkorder}
        />
      )}
    </div>
  );
}

function workorderCustomerName(wo) {
  if (!wo) return "";
  const first = wo.customerFirst || "";
  const last = wo.customerLast || "";
  const joined = (first + " " + last).trim();
  return joined;
}

function WorkorderPickerModal({ currentWorkorderID, onCancel, onPick }) {
  const z = useZ("modal");
  const zWorkorders =
    useOpenWorkordersStore((s) => s.getWorkorders?.()) || [];
  const zCurrentUser = useLoginStore((s) => s.currentUser);
  const zStatuses = useSettingsStore((s) => s.getSettings()?.statuses) || [];
  const [sFilter, _setFilter] = useState("");

  // Mirror Options_Workorders ordering: customer-linked workorders only,
  // sortWorkorders for the default order, scoreWorkorder ranking when searching.
  const ranked = useMemo(() => {
    const customerWOs = (Array.isArray(zWorkorders) ? zWorkorders : []).filter(
      (wo) => !!wo.customerID,
    );
    const q = sFilter.trim();
    if (q) {
      const scored = customerWOs
        .map((wo) => ({ wo, score: scoreWorkorder(wo, q) }))
        .filter((s) => s.score > 0);
      scored.sort((a, b) => b.score - a.score);
      return scored.map((s) => s.wo);
    }
    return sortWorkorders(customerWOs, zStatuses, zCurrentUser);
  }, [zWorkorders, sFilter, zStatuses, zCurrentUser]);

  return (
    <div
      className={styles.pickerOverlay}
      style={{ zIndex: z }}
      onClick={onCancel}
    >
      <div
        className={styles.pickerCard}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.pickerHeader}>
          <span className={styles.pickerTitle}>Assign to Workorder</span>
          <button
            type="button"
            className={styles.pickerCloseBtn}
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <input
          type="text"
          className={styles.pickerSearch}
          placeholder="Search by customer / brand / description…"
          value={sFilter}
          onChange={(e) => _setFilter(e.target.value)}
          autoFocus
        />
        <div className={styles.pickerList}>
          <button
            type="button"
            className={`${styles.pickerRow} ${!currentWorkorderID ? styles.pickerRowActive : ""}`}
            onClick={() => onPick(null)}
          >
            <div className={styles.pickerRowMain}>
              <span className={styles.pickerRowName}>Stock order (no customer)</span>
              <span className={styles.pickerRowMeta}>
                Clears any current assignment.
              </span>
            </div>
          </button>
          {ranked.map((wo) => {
            const name = workorderCustomerName(wo) || "(no customer)";
            const meta = [wo.brand, wo.description]
              .filter(Boolean)
              .join(" · ");
            const rs = resolveStatus(wo.status, zStatuses);
            const isCurrent = wo.id === currentWorkorderID;
            return (
              <button
                key={wo.id}
                type="button"
                className={`${styles.pickerRow} ${isCurrent ? styles.pickerRowActive : ""}`}
                style={{ borderLeftColor: rs.backgroundColor }}
                onClick={() => onPick(wo)}
              >
                <div className={styles.pickerRowMain}>
                  <span className={styles.pickerRowName}>{name}</span>
                  {meta && (
                    <span className={styles.pickerRowMeta}>{meta}</span>
                  )}
                </div>
                {rs.label && (
                  <span
                    className={styles.pickerStatusPill}
                    style={{
                      backgroundColor: rs.backgroundColor,
                      color: rs.textColor,
                    }}
                  >
                    {rs.label}
                  </span>
                )}
              </button>
            );
          })}
          {ranked.length === 0 && (
            <div className={styles.pickerEmpty}>No matching workorders.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCentsAsDollars(v) {
  if (v === "" || v == null) return "";
  return formatCurrencyDisp(v);
}

const EditableNumberField = forwardRef(function EditableNumberField(
  { initialValue },
  ref,
) {
  const [sValue, _setValue] = useState(String(initialValue ?? ""));
  const originalRef = useRef(String(initialValue ?? ""));

  useEffect(() => {
    originalRef.current = String(initialValue ?? "");
    _setValue(String(initialValue ?? ""));
  }, [initialValue]);

  useImperativeHandle(ref, () => ({
    increment: () => {
      const base = sValue !== "" ? sValue : originalRef.current;
      const current = parseFloat(base) || 0;
      const next = String(Math.floor(current) + 1);
      _setValue(next);
      originalRef.current = next;
    },
  }));

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

  const showHint = sValue === "" && originalRef.current !== "";

  return (
    <div className={styles.inputWrap}>
      {showHint && (
        <span className={styles.previousValueHint}>
          {originalRef.current}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        className={styles.editInput}
        value={sValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
      />
    </div>
  );
});
