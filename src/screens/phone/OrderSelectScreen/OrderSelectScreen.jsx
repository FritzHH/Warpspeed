import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const zCurrentUser = useLoginStore((s) => s.currentUser);
  const zUsers = useSettingsStore((s) => s.settings?.users) || [];

  const [sOrders, _setOrders] = useState([]);

  useEffect(() => {
    const unsub = dbListenToVendorOrders((data) => {
      _setOrders(Array.isArray(data) ? data : []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const openOrders = sOrders
    .filter((o) => !o.status || o.status === "open")
    .sort((a, b) => (b.lastModifiedMillis || 0) - (a.lastModifiedMillis || 0));

  function userName(userID) {
    if (!userID) return "";
    const u = zUsers.find((x) => x.id === userID);
    if (!u) return "";
    return (u.first || "") + (u.last ? " " + u.last[0] + "." : "");
  }

  async function handleNewOrder() {
    const now = Date.now();
    const uid = zCurrentUser?.id || "";
    const newOrder = {
      ...cloneDeep(VENDOR_ORDER_PROTO),
      id: generate36CharUUID(),
      createdMillis: now,
      createdByUserID: uid,
      lastModifiedMillis: now,
      lastModifiedByUserID: uid,
    };
    await dbSaveVendorOrder(newOrder);
    navigate("/phone/ordering/" + newOrder.id);
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
        <span className={styles.title}>Vendor Orders</span>
        <button className={styles.newButton} onClick={handleNewOrder}>
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
          return (
            <button
              key={order.id}
              className={styles.card}
              onClick={() => navigate("/phone/ordering/" + order.id)}
            >
              <span className={styles.cardDate}>{dateLabel}</span>
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
    </div>
  );
}
