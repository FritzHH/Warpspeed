import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import cloneDeep from "lodash/cloneDeep";
import { ROUTES } from "../../../routes";
import {
  useLoginStore,
  useSettingsStore,
  useAlertScreenStore,
} from "../../../stores";
import {
  dbListenToVendorOrders,
  dbSaveVendorOrder,
  dbDeleteVendorOrder,
} from "../../../db_calls_wrapper";
import { VENDOR_ORDER_PROTO } from "../../../data";
import { generate36CharUUID, formatMillisForDisplay } from "../../../utils";
import { ICONS } from "../../../styles";
import { AlertBox, SwipeBackHint } from "../../../dom_components";
import styles from "./OrderSelectScreen.module.css";

export function OrderSelectScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const switchMode = searchParams.get("switch") === "1";
  const zCurrentUser = useLoginStore((s) => s.currentUser);
  const zUsers = useSettingsStore((s) => s.settings?.users) || [];
  const zActiveOrderID = useSettingsStore(
    (s) => s.getSettings()?.activeVendorOrderID || "",
  );
  const zShowAlert = useAlertScreenStore((s) => s.showAlert);

  const [sOrders, _setOrders] = useState([]);
  const [sOrdersReady, _setOrdersReady] = useState(false);
  const [sShowCreate, _setShowCreate] = useState(false);
  const [sRenameOrder, _setRenameOrder] = useState(null);

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
        navigate(ROUTES.phone);
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
  // Auto-redirect should fire at most once per mount; otherwise the user can
  // never reach the list (selecting an order also writes activeVendorOrderID,
  // which would bounce them right back).
  const didRedirectRef = useRef(false);

  useEffect(() => {
    const unsub = dbListenToVendorOrders((data) => {
      _setOrders(Array.isArray(data) ? data : []);
      _setOrdersReady(true);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const openOrders = useMemo(
    () =>
      sOrders
        .filter((o) => !o.status || o.status === "open")
        .sort(
          (a, b) => (b.lastModifiedMillis || 0) - (a.lastModifiedMillis || 0),
        ),
    [sOrders],
  );

  // Auto-redirect to the active order when one is set, unless the user
  // explicitly arrived in switch mode (e.g., tapped "Switch Order" on the
  // scanner screen). Wait for the first listener payload so we don't decide
  // before knowing what's open.
  useEffect(() => {
    if (!sOrdersReady) return;
    if (switchMode) return;
    if (didRedirectRef.current) return;
    if (!zActiveOrderID) return;
    const exists = openOrders.some((o) => o.id === zActiveOrderID);
    if (!exists) return;
    didRedirectRef.current = true;
    navigate("/phone/ordering/" + zActiveOrderID, { replace: true });
  }, [sOrdersReady, switchMode, zActiveOrderID, openOrders, navigate]);

  function userName(userID) {
    if (!userID) return "";
    const u = zUsers.find((x) => x.id === userID);
    if (!u) return "";
    return (u.first || "") + (u.last ? " " + u.last[0] + "." : "");
  }

  async function handleCreateOrder(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const now = Date.now();
    const uid = zCurrentUser?.id || "";
    const newOrder = {
      ...cloneDeep(VENDOR_ORDER_PROTO),
      id: generate36CharUUID(),
      name: trimmed,
      createdMillis: now,
      createdByUserID: uid,
      lastModifiedMillis: now,
      lastModifiedByUserID: uid,
    };
    await dbSaveVendorOrder(newOrder);
    // First order ever (or first since the last one closed) → auto-promote
    // so the scanner has somewhere to send the next scan.
    if (openOrders.length === 0) {
      useSettingsStore.getState().setField("activeVendorOrderID", newOrder.id);
    }
    _setShowCreate(false);
    navigate("/phone/ordering/" + newOrder.id);
  }

  function handlePickOrder(orderID) {
    // Open the viewer (read-only browse). The user can "Set Active" from
    // there if they actually want to switch.
    navigate("/phone/ordering/" + orderID + "/view");
  }

  async function handleRenameSubmit(newName) {
    const order = sRenameOrder;
    if (!order) return;
    const trimmed = (newName || "").trim();
    if (!trimmed || trimmed === order.name) {
      _setRenameOrder(null);
      return;
    }
    const updated = {
      ...order,
      name: trimmed,
      lastModifiedMillis: Date.now(),
      lastModifiedByUserID: zCurrentUser?.id || "",
    };
    _setRenameOrder(null);
    await dbSaveVendorOrder(updated);
  }

  function handleDeleteOrder(order) {
    useAlertScreenStore.getState().setValues({
      title: "Delete Order",
      severity: "info",
      message: `Delete "${order.name || "this order"}"?`,
      subMessage: "This cannot be undone.",
      btn1Text: "Delete",
      btn2Text: "Cancel",
      handleBtn2Press: () =>
        useAlertScreenStore.getState().setShowAlert(false),
      handleBtn1Press: async () => {
        useAlertScreenStore.getState().setShowAlert(false);
        if (order.id === zActiveOrderID) {
          useSettingsStore.getState().setField("activeVendorOrderID", "");
        }
        await dbDeleteVendorOrder(order.id);
      },
    });
  }

  // Hold off on rendering until orders are loaded — otherwise we'd flash the
  // empty / "no orders" state before auto-redirect can decide.
  if (!sOrdersReady) {
    return <div className={styles.root} />;
  }

  return (
    <div
      className={styles.root}
      onTouchStart={handleSwipeStart}
      onTouchMove={handleSwipeMove}
      onTouchEnd={handleSwipeEnd}
      style={swipeStyle}
    >
      <SwipeBackHint label="Workorders" swipeX={sSwipeX} />
      <AlertBox showAlert={zShowAlert} />
      <div className={styles.header}>
        <span className={styles.title}>Ordering</span>
      </div>

      <div className={styles.actionRow}>
        <button
          className={styles.priceCheckBtn}
          onClick={() => navigate(ROUTES.phonePriceCheck)}
        >
          Price Check
        </button>
        <button
          className={styles.newBtn}
          onClick={() => _setShowCreate(true)}
        >
          + New
        </button>
      </div>

      <div className={styles.list}>
        {openOrders.map((order) => {
          const created = order.createdMillis
            ? formatMillisForDisplay(order.createdMillis, true, true, true)
            : null;
          const dateLabel = created
            ? `${created.wordDayOfMonth} ${created.dayOfMonth}, ${created.year} · ${created.hour}:${String(created.minutes).padStart(2, "0")} ${created.amPM}`
            : "Unknown date";
          const isActive = order.id === zActiveOrderID;
          return (
            <div
              key={order.id}
              role="button"
              tabIndex={0}
              className={styles.card}
              onClick={() => handlePickOrder(order.id)}
            >
              {isActive && (
                <span className={styles.activeBanner}>ACTIVE</span>
              )}
              <div className={styles.cardRow}>
                <div className={styles.cardTextCol}>
                  <span className={styles.cardDate}>
                    {order.name || dateLabel}
                  </span>
                  <span className={styles.cardMeta}>
                    Started by {userName(order.createdByUserID) || "—"}
                  </span>
                </div>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.cardIconBtn}
                    aria-label="Rename order"
                    onClick={(e) => {
                      e.stopPropagation();
                      _setRenameOrder(order);
                    }}
                  >
                    <img
                      src={ICONS.editPencil}
                      alt=""
                      className={styles.cardIconImg}
                    />
                  </button>
                  <button
                    type="button"
                    className={styles.cardIconBtn}
                    aria-label="Delete order"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteOrder(order);
                    }}
                  >
                    <img
                      src={ICONS.trash}
                      alt=""
                      className={styles.cardIconImg}
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {openOrders.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyText}>
              No open orders. Tap “+ New” to start one.
            </span>
          </div>
        )}
      </div>

      {sShowCreate && (
        <NewOrderModal
          onCancel={() => _setShowCreate(false)}
          onCreate={handleCreateOrder}
        />
      )}

      {sRenameOrder && (
        <RenameOrderModal
          order={sRenameOrder}
          onCancel={() => _setRenameOrder(null)}
          onSubmit={handleRenameSubmit}
        />
      )}
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
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.modalTitle}>New Order</span>
        <label className={styles.modalLabel} htmlFor="newOrderName">
          Order Name
        </label>
        <input
          id="newOrderName"
          ref={inputRef}
          type="text"
          className={styles.modalInput}
          value={sName}
          onChange={(e) => _setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.modalButtons}>
          <button
            type="button"
            className={styles.modalCancelBtn}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.modalCreateBtn}
            disabled={!sName.trim()}
            onClick={handleSubmit}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameOrderModal({ order, onCancel, onSubmit }) {
  const [sName, _setName] = useState(order?.name || "");
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
    onSubmit(trimmed);
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
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <span className={styles.modalTitle}>Rename Order</span>
        <label className={styles.modalLabel} htmlFor="renameOrderName">
          Order Name
        </label>
        <input
          id="renameOrderName"
          ref={inputRef}
          type="text"
          className={styles.modalInput}
          value={sName}
          onChange={(e) => _setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.modalButtons}>
          <button
            type="button"
            className={styles.modalCancelBtn}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.modalCreateBtn}
            disabled={!sName.trim()}
            onClick={handleSubmit}
          >
            Save
          </button>
        </div>
      </div>
    </div>
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
  hours = hours % 12 || 12;
  const minStr = String(minutes).padStart(2, "0");
  return `${dayName}, ${monthName} ${day}${ordinal(day)} ${hours}:${minStr} ${ampm}`;
}
