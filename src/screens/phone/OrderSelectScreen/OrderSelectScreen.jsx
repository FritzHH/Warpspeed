import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import cloneDeep from "lodash/cloneDeep";
import { ROUTES } from "../../../routes";
import { useLoginStore, useSettingsStore } from "../../../stores";
import {
  dbListenToVendorOrders,
  dbSaveVendorOrder,
} from "../../../db_calls_wrapper";
import { VENDOR_ORDER_PROTO } from "../../../data";
import { generate36CharUUID, formatMillisForDisplay } from "../../../utils";
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

  const [sOrders, _setOrders] = useState([]);
  const [sOrdersReady, _setOrdersReady] = useState(false);
  const [sShowCreate, _setShowCreate] = useState(false);
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

  // Hold off on rendering until orders are loaded — otherwise we'd flash the
  // empty / "no orders" state before auto-redirect can decide.
  if (!sOrdersReady) {
    return <div className={styles.root} />;
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => navigate(ROUTES.phone)}
        >
          ←
        </button>
        <span className={styles.title}>
          {switchMode ? "Switch Order" : "Vendor Orders"}
        </span>
        <button
          className={styles.newButton}
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
            <button
              key={order.id}
              className={styles.card}
              onClick={() => handlePickOrder(order.id)}
            >
              {isActive && (
                <span className={styles.activeBanner}>ACTIVE</span>
              )}
              <span className={styles.cardDate}>
                {order.name || dateLabel}
              </span>
              <span className={styles.cardMeta}>
                Started by {userName(order.createdByUserID) || "—"}
              </span>
            </button>
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
