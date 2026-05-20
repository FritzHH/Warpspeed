/* eslint-disable */
import React, { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ICONS } from "../../styles";
import { AlertBox, Image } from "../../dom_components";
import {
  useOpenWorkordersStore,
  useInventoryStore,
  useAlertScreenStore,
  useLayoutStore,
} from "../../stores";
import {
  dbGetOpenWorkorders,
  dbGetInventoryItems,
} from "../../db_calls_wrapper";
import { log } from "../../utils";
import styles from "./MobileBaseScreen.module.css";

export function MobileBaseScreen() {
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);
  const height = useLayoutStore((state) => state.height);
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === "/";

  useEffect(() => {
    fetchFreshData();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchFreshData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  async function fetchFreshData() {
    try {
      const [workorders, inventory] = await Promise.all([
        dbGetOpenWorkorders(),
        dbGetInventoryItems(),
      ]);
      if (workorders) useOpenWorkordersStore.getState().setOpenWorkorders(workorders);
      if (inventory) useInventoryStore.getState().setItems(inventory);
    } catch (e) {
      log("Mobile data refresh failed:", e);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {!isHome ? (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={styles.backButton}
          >
            <Image icon={ICONS.backRed} size={20} />
            <span className={styles.backLabel}>Back</span>
          </button>
        ) : (
          <div className={styles.homeTitle}>
            <Image icon={ICONS.gears1} size={24} style={{ marginRight: 8 }} />
            <span className={styles.homeTitleText}>WARPSPEED</span>
          </div>
        )}
      </div>

      <AlertBox showAlert={zShowAlert} />

      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
