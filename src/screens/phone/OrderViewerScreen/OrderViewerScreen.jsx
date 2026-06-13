import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "../../../routes";
import {
  useAlertScreenStore,
  useInventoryStore,
  useSettingsStore,
} from "../../../stores";
import {
  dbDeleteVendorOrderItem,
  dbListenToVendorOrderItems,
  dbUpdateVendorOrderItemFields,
} from "../../../db_calls_wrapper";
import {
  AlertBox,
  LineItemActionRow,
  SwipeBackHint,
  TouchableOpacity,
} from "../../../dom_components";
import styles from "./OrderViewerScreen.module.css";

export function OrderViewerScreen() {
  const navigate = useNavigate();
  const { orderID } = useParams();

  const zInventoryArr = useInventoryStore((s) => s.getInventoryArr?.()) || [];
  const zActiveOrderID = useSettingsStore(
    (s) => s.getSettings()?.activeVendorOrderID || "",
  );
  const zShowAlert = useAlertScreenStore((s) => s.showAlert);

  const [sItems, _setItems] = useState([]);
  const [sEditingItemID, _setEditingItemID] = useState(null);

  const [sSwipeX, _setSwipeX] = useState(0);
  const [sSwiping, _setSwiping] = useState(false);
  const swipeStartRef = useRef(null);

  function handleSwipeStart(e) {
    const t = e.touches[0];
    if (t.clientX > 30) return;
    swipeStartRef.current = { x: t.clientX, time: Date.now() };
    _setSwiping(true);
  }
  function handleSwipeMove(e) {
    if (!swipeStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeStartRef.current.x;
    if (dx > 0) _setSwipeX(dx);
  }
  function handleSwipeEnd() {
    if (!swipeStartRef.current) return;
    const elapsed = Date.now() - swipeStartRef.current.time;
    const velocity = sSwipeX / Math.max(elapsed, 1);
    const commitThreshold = window.innerWidth * 0.3;
    const isCommit = sSwipeX > commitThreshold || velocity > 0.5;
    swipeStartRef.current = null;
    _setSwiping(false);
    if (isCommit) {
      _setSwipeX(window.innerWidth);
      setTimeout(() => {
        navigate(ROUTES.phoneOrdering + "?switch=1");
        _setSwipeX(0);
      }, 200);
    } else {
      _setSwipeX(0);
    }
  }
  const swipeStyle = {
    transform: `translateX(${sSwipeX}px)`,
    transition: sSwiping ? "none" : "transform 200ms ease",
  };

  // Items listener — read-only here; the row component just renders.
  useEffect(() => {
    if (!orderID) return;
    const unsub = dbListenToVendorOrderItems(orderID, (data) => {
      _setItems(Array.isArray(data) ? data : []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [orderID]);

  async function handleQtyChange(item, direction) {
    const current = Number(item.qty || 0);
    const next = direction === "up" ? current + 1 : Math.max(current - 1, 1);
    if (next === current) return;
    try {
      await dbUpdateVendorOrderItemFields(orderID, item.id, { qty: next });
    } catch {}
  }

  async function handleDeleteItem(item) {
    _setEditingItemID(null);
    try {
      await dbDeleteVendorOrderItem(orderID, item.id);
    } catch {}
  }

  function handleSetActive() {
    useSettingsStore.getState().setField("activeVendorOrderID", orderID);
    navigate("/phone/ordering/" + orderID);
  }

  function handleScanItems() {
    navigate("/phone/ordering/" + orderID);
  }

  const isActive = orderID === zActiveOrderID;

  return (
    <div
      className={styles.root}
      onTouchStart={handleSwipeStart}
      onTouchMove={handleSwipeMove}
      onTouchEnd={handleSwipeEnd}
      style={swipeStyle}
    >
      <SwipeBackHint label="Ordering" swipeX={sSwipeX} />
      <AlertBox showAlert={zShowAlert} />

      {!isActive && (
        <button
          className={styles.setActiveFab}
          onClick={handleSetActive}
        >
          Set Active
        </button>
      )}

      <div className={styles.list}>
        {sItems.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyText}>No items in this order yet.</span>
          </div>
        )}
        {sItems.map((item) => {
          const isEditing = sEditingItemID === item.id;
          return (
            <ItemRow
              key={item.id}
              item={item}
              inventory={zInventoryArr}
              isEditing={isEditing}
              onToggleEdit={() =>
                _setEditingItemID(isEditing ? null : item.id)
              }
              onQtyChange={(direction) => handleQtyChange(item, direction)}
              onDelete={() => handleDeleteItem(item)}
            />
          );
        })}
      </div>

      <button
        type="button"
        className={styles.scanBtn}
        onClick={handleScanItems}
      >
        SCAN ITEMS
      </button>
    </div>
  );
}

function ItemRow({
  item,
  inventory,
  isEditing,
  onToggleEdit,
  onQtyChange,
  onDelete,
}) {
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

  const catalogName = String(
    item.catalogSnapshot?.catalogName || item.catalogSnapshot?.name || "",
  );
  const storeName = localMatch?.catalogName || localMatch?.formalName || "";
  const displayName =
    storeName || catalogName || item.scannedBarcode || "(unknown)";

  const [sSwipeX, _setSwipeX] = useState(0);
  const [sSwiping, _setSwiping] = useState(false);
  const swipeStartRef = useRef(null);

  function handleTouchStart(e) {
    const t = e.touches[0];
    // Leave the leftmost edge to the screen-level back-swipe handler.
    if (t.clientX < 50) return;
    swipeStartRef.current = { x: t.clientX, time: Date.now() };
    _setSwiping(true);
  }
  function handleTouchMove(e) {
    if (!swipeStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeStartRef.current.x;
    _setSwipeX(dx < 0 ? dx : 0);
  }
  function handleTouchEnd() {
    if (!swipeStartRef.current) return;
    const elapsed = Date.now() - swipeStartRef.current.time;
    const distance = Math.abs(sSwipeX);
    const velocity = distance / Math.max(elapsed, 1);
    const commitThreshold = window.innerWidth * 0.35;
    const isCommit = distance > commitThreshold || velocity > 0.6;
    swipeStartRef.current = null;
    _setSwiping(false);
    if (isCommit) {
      _setSwipeX(-window.innerWidth);
      setTimeout(() => onDelete(), 180);
    } else {
      _setSwipeX(0);
    }
  }

  const swipeStyle = {
    transform: `translateX(${sSwipeX}px)`,
    transition: sSwiping ? "none" : "transform 200ms ease",
    touchAction: "pan-y",
  };

  return (
    <div
      className={styles.itemRow}
      style={swipeStyle}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <TouchableOpacity onPress={onToggleEdit} className={styles.itemTopRow}>
        <span className={styles.itemName}>{displayName}</span>
        <span className={styles.itemQty}>×{item.qty || 0}</span>
      </TouchableOpacity>
      {isEditing && (
        <LineItemActionRow
          qty={item.qty || 1}
          itemName={displayName}
          deleteMessage={`${displayName} will be removed from this order.`}
          onQtyChange={onQtyChange}
          onDelete={onDelete}
          skipConfirm={true}
        />
      )}
    </div>
  );
}
