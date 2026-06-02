import { useMemo, useState } from "react";
import {
  useAlertScreenStore,
  useInventoryReconciliationModalStore,
  useOrderingModalStore,
  useSettingsStore,
} from "../../../../../stores";
import { VENDOR_CATALOGS } from "../../../../../data";
import { ICONS } from "../../../../../styles";
import { generate36CharUUID } from "../../../../../utils";
import styles from "./OrderingComponent.module.css";

export function OrderingComponent() {
  const zVendors = useSettingsStore((s) => s.getSettings()?.vendors) || {};
  const [sNewName, _setNewName] = useState("");

  const lockedVendors = useMemo(
    () =>
      VENDOR_CATALOGS.filter((v) => v.id !== "other").map((v) => ({
        id: v.id,
        displayName: v.displayName,
      })),
    [],
  );

  const customVendors = useMemo(() => {
    const arr = [];
    Object.entries(zVendors).forEach(([id, cfg]) => {
      if (cfg && cfg.isCustom) {
        arr.push({ id, displayName: cfg.displayName || id });
      }
    });
    arr.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return arr;
  }, [zVendors]);

  function handleOpenOrdering() {
    useOrderingModalStore.getState().show();
  }

  function handleOpenReconciliation() {
    useInventoryReconciliationModalStore.getState().show();
  }

  function handleAddVendor() {
    const name = sNewName.trim();
    if (!name) return;
    const nameLower = name.toLowerCase();
    const duplicateLocked = lockedVendors.some(
      (v) => v.displayName.toLowerCase() === nameLower,
    );
    const duplicateCustom = customVendors.some(
      (v) => v.displayName.toLowerCase() === nameLower,
    );
    if (duplicateLocked || duplicateCustom) {
      useAlertScreenStore.getState().setValues({
        title: "DUPLICATE VENDOR",
        message: `A vendor named "${name}" already exists.`,
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    const newID = generate36CharUUID();
    const updated = {
      ...zVendors,
      [newID]: { displayName: name, isCustom: true },
    };
    useSettingsStore.getState().setField("vendors", updated);
    _setNewName("");
  }

  function handleDeleteVendor(vendor) {
    useAlertScreenStore.getState().setValues({
      title: "DELETE VENDOR",
      message: `Are you sure you want to delete "${vendor.displayName}"?`,
      btn1Text: "DELETE",
      btn2Text: "CANCEL",
      handleBtn1Press: () => {
        const updated = { ...zVendors };
        delete updated[vendor.id];
        useSettingsStore.getState().setField("vendors", updated);
        useAlertScreenStore.getState().resetAll();
      },
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: false,
    });
  }

  function handleAddKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddVendor();
    }
  }

  return (
    <div className={styles.outerBox}>
      <div className={styles.section}>
        <button
          type="button"
          className={styles.openOrderingButton}
          onClick={handleOpenOrdering}
        >
          Open Ordering
        </button>
        <button
          type="button"
          className={styles.reconcileButton}
          onClick={handleOpenReconciliation}
        >
          Reconcile Inventory
        </button>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>Vendors</span>
        <div className={styles.vendorList}>
          {lockedVendors.map((v) => (
            <div
              key={v.id}
              className={`${styles.vendorRow} ${styles.vendorRowLocked}`}
            >
              <div className={styles.vendorLeft}>
                <span className={styles.vendorName}>{v.displayName}</span>
              </div>
            </div>
          ))}
          {customVendors.length === 0 && (
            <span className={styles.emptyHint}>
              No custom vendors yet. Add one below.
            </span>
          )}
          {customVendors.map((v) => (
            <div key={v.id} className={styles.vendorRow}>
              <div className={styles.vendorLeft}>
                <span className={styles.vendorName}>{v.displayName}</span>
                <span className={styles.customBadge}>Custom</span>
              </div>
              <button
                type="button"
                className={styles.deleteBtn}
                aria-label="Delete vendor"
                onClick={() => handleDeleteVendor(v)}
              >
                <img
                  src={ICONS.trash}
                  alt=""
                  className={styles.deleteIcon}
                />
              </button>
            </div>
          ))}
        </div>

        <div className={styles.addRow}>
          <input
            type="text"
            className={styles.addInput}
            value={sNewName}
            onChange={(e) => _setNewName(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder="Vendor name (e.g. AliExpress, Amazon)"
          />
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAddVendor}
            disabled={!sNewName.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
