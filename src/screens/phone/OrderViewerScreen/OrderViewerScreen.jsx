import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useInventoryStore, useSettingsStore } from "../../../stores";
import {
  dbListenToVendorOrderItems,
  dbListenToVendorOrders,
  readInventoryQtyMap,
} from "../../../db_calls_wrapper";
import { VENDOR_CATALOGS } from "../../../data";
import { formatCurrencyDisp } from "../../../utils";
import styles from "./OrderViewerScreen.module.css";

const TOGGLE_FIELDS = [
  { key: "vendor",    label: "Vendor"     },
  { key: "qtyAvail",  label: "Qty Avail"  },
  { key: "cost",      label: "Cost"       },
  { key: "price",     label: "Price"      },
  { key: "salePrice", label: "Sale Price" },
  { key: "msrp",      label: "MSRP"       },
];

export function OrderViewerScreen() {
  const navigate = useNavigate();
  const { orderID } = useParams();

  const zInventoryArr = useInventoryStore((s) => s.getInventoryArr?.()) || [];
  const zActiveOrderID = useSettingsStore(
    (s) => s.getSettings()?.activeVendorOrderID || "",
  );
  const zVendors = useSettingsStore((s) => s.getSettings()?.vendors) || {};

  const [sOrder, _setOrder] = useState(null);
  const [sItems, _setItems] = useState([]);
  const [sVisible, _setVisible] = useState(() => ({
    vendor: false,
    qtyAvail: false,
    cost: false,
    price: false,
    salePrice: false,
    msrp: false,
  }));
  const [sQtyMap, _setQtyMap] = useState(() => new Map());

  // Order header listener — gives us the name + lets us notice if it gets
  // closed/deleted while the user is viewing.
  useEffect(() => {
    const unsub = dbListenToVendorOrders((data) => {
      const arr = Array.isArray(data) ? data : [];
      _setOrder(arr.find((o) => o.id === orderID) || null);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [orderID]);

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

  // Per-vendor batched qty-avail lookup. Only runs when the qty-avail toggle
  // is on so we don't burn reads users didn't ask for.
  const lookupKey = useMemo(() => {
    if (!sVisible.qtyAvail) return "";
    return sItems
      .filter((it) => it.vendorCatalogID && it.vendorItemID)
      .map((it) => `${it.vendorCatalogID}:${it.vendorItemID}`)
      .sort()
      .join(",");
  }, [sItems, sVisible.qtyAvail]);

  useEffect(() => {
    if (!lookupKey) {
      _setQtyMap(new Map());
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
          const warehouseCode = zVendors?.[vendorID]?.warehouseCode || "";
          if (!warehouseCode) return;
          const qtyForVendor = await readInventoryQtyMap(
            vendorID,
            warehouseCode,
            itemIDs,
          );
          qtyForVendor.forEach((qty, itemID) => next.set(itemID, qty));
        }),
      );
      if (!cancelled) _setQtyMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [lookupKey, zVendors]);

  function toggleField(key) {
    _setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSetActive() {
    useSettingsStore.getState().setField("activeVendorOrderID", orderID);
    navigate("/phone/ordering/" + orderID);
  }

  const isActive = orderID === zActiveOrderID;
  const orderName = sOrder?.name || "Order";

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => navigate("/phone/ordering?switch=1")}
        >
          ←
        </button>
        <span className={styles.title}>{orderName}</span>
        {isActive ? (
          <span className={styles.activeTag}>ACTIVE</span>
        ) : (
          <button
            className={styles.setActiveBtn}
            onClick={handleSetActive}
          >
            Set Active
          </button>
        )}
      </div>

      <div className={styles.toggleBar}>
        {TOGGLE_FIELDS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={
              sVisible[f.key]
                ? `${styles.toggleChip} ${styles.toggleChipOn}`
                : styles.toggleChip
            }
            onClick={() => toggleField(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {sItems.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyText}>No items in this order yet.</span>
          </div>
        )}
        {sItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            inventory={zInventoryArr}
            visible={sVisible}
            warehouseQty={
              item.vendorItemID && sQtyMap.has(item.vendorItemID)
                ? sQtyMap.get(item.vendorItemID)
                : null
            }
          />
        ))}
      </div>
    </div>
  );
}

function ItemRow({ item, inventory, visible, warehouseQty }) {
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

  const catalogName = String(item.catalogSnapshot?.name || "");
  const storeName = localMatch?.formalName || localMatch?.informalName || "";
  const displayName =
    storeName || catalogName || item.scannedBarcode || "(unknown)";

  const vendorID = item.vendorCatalogID || "";
  const vendorName =
    VENDOR_CATALOGS.find((v) => v.id === vendorID)?.displayName ||
    vendorID ||
    "—";

  const cost = item.catalogSnapshot?.cost ?? localMatch?.cost ?? "";
  const price = localMatch?.price;
  const salePrice = localMatch?.salePrice;
  const msrp = localMatch?.msrp;

  return (
    <div className={styles.itemRow}>
      <div className={styles.itemTopRow}>
        <span className={styles.itemName}>{displayName}</span>
        <span className={styles.itemQty}>×{item.qty || 0}</span>
      </div>
      {(visible.vendor ||
        visible.qtyAvail ||
        visible.cost ||
        visible.price ||
        visible.salePrice ||
        visible.msrp) && (
        <div className={styles.itemDetails}>
          {visible.vendor && (
            <DetailChip label="Vendor" value={vendorName} />
          )}
          {visible.qtyAvail && (
            <DetailChip
              label="Avail"
              value={warehouseQty == null ? "—" : String(warehouseQty)}
            />
          )}
          {visible.cost && (
            <DetailChip label="Cost" value={fmtMoney(cost)} />
          )}
          {visible.price && (
            <DetailChip label="Price" value={fmtMoney(price)} />
          )}
          {visible.salePrice && (
            <DetailChip label="Sale" value={fmtMoney(salePrice)} />
          )}
          {visible.msrp && <DetailChip label="MSRP" value={fmtMoney(msrp)} />}
        </div>
      )}
    </div>
  );
}

function DetailChip({ label, value }) {
  return (
    <div className={styles.detailChip}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value || "—"}</span>
    </div>
  );
}

function fmtMoney(v) {
  if (v === "" || v == null) return "";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n) || n <= 0) return "";
  return formatCurrencyDisp(n);
}
