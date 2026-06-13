import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import cloneDeep from "lodash/cloneDeep";
import { ROUTES } from "../../../routes";
import { useLoginStore, useInventoryStore } from "../../../stores";
import {
  dbSaveVendorOrderItem,
  dbUpdateVendorOrderItemFields,
  dbDeleteVendorOrderItem,
  dbResolveOrderItem,
  dbUpdateVendorOrderFields,
  dbListenToVendorOrderItems,
} from "../../../db_calls_wrapper";
import { VENDOR_ORDER_ITEM_PROTO } from "../../../data";
import { generate36CharUUID } from "../../../utils";
import { ICONS } from "../../../styles";
import { useZ } from "../../../hooks/useZ";
import { SwipeBackHint, Toast } from "../../../dom_components";
import styles from "./OrderingScreen.module.css";

const SCAN_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
];

const SAME_CODE_LOCKOUT_MS = 1500;
const ANY_SCAN_LOCKOUT_MS = 400;

export function OrderingScreen() {
  const navigate = useNavigate();
  const { orderID } = useParams();
  const zCurrentUser = useLoginStore((s) => s.currentUser);
  const userID = zCurrentUser?.id || "";

  const readerRef = useRef(null);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastScanRef = useRef({ code: null, millis: 0 });
  const modalOpenRef = useRef(false);

  const [sItemCount, _setItemCount] = useState(0);
  const [sScannedItem, _setScannedItem] = useState(null);
  const [sCameraError, _setCameraError] = useState("");
  const [sShowOrderPanel, _setShowOrderPanel] = useState(false);
  const [sCatalogChecking, _setCatalogChecking] = useState(false);

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

  const userIDRef = useRef(userID);
  useEffect(() => {
    userIDRef.current = userID;
  }, [userID]);

  useEffect(() => {
    if (!orderID) navigate(ROUTES.phoneOrdering, { replace: true });
  }, [orderID, navigate]);

  async function handleScan(code) {
    if (!orderID) return;
    modalOpenRef.current = true;
    const now = Date.now();
    const uid = userIDRef.current;

    const itemID = generate36CharUUID();
    const newItem = {
      ...cloneDeep(VENDOR_ORDER_ITEM_PROTO),
      id: itemID,
      scannedBarcode: code,
      qty: 0,
      addedMillis: now,
      addedByUserID: uid,
      lookupStatus: "pending",
    };

    dbUpdateVendorOrderFields(orderID, {
      lastModifiedMillis: now,
      lastModifiedByUserID: uid,
    });

    // Synchronous local-inventory check picks the UX path before any await:
    // local hit → open qty modal immediately; local miss → show "checking
    // catalog" toast while the resolver queries vendor catalogs.
    const inventory =
      useInventoryStore.getState().getInventoryArr?.() || [];
    const localMatch = inventory.find((inv) => {
      if (!inv) return false;
      if (inv.primaryBarcode === code) return true;
      const codes = Array.isArray(inv.barcodes) ? inv.barcodes : [];
      return codes.includes(code);
    });

    if (localMatch) {
      const localDisplay =
        localMatch.catalogName || localMatch.formalName || "";
      _setScannedItem({ ...newItem, displayName: localDisplay, resolved: true });
      dbSaveVendorOrderItem(orderID, newItem).then(() => {
        dbResolveOrderItem(orderID, newItem);
      });
      return;
    }

    _setCatalogChecking(true);
    await dbSaveVendorOrderItem(orderID, newItem);
    const res = await dbResolveOrderItem(orderID, newItem);
    _setCatalogChecking(false);
    _setScannedItem({
      ...newItem,
      displayName: res?.displayName || "",
      resolved: true,
    });
  }

  const handleScanRef = useRef(handleScan);
  useEffect(() => {
    handleScanRef.current = handleScan;
  });

  function handleDecode(result) {
    if (!result) return;
    if (modalOpenRef.current) return;
    const code = result.getText();
    const now = Date.now();
    if (now - lastScanRef.current.millis < ANY_SCAN_LOCKOUT_MS) return;
    if (
      code === lastScanRef.current.code &&
      now - lastScanRef.current.millis < SAME_CODE_LOCKOUT_MS
    )
      return;
    lastScanRef.current = { code, millis: now };
    handleScanRef.current(code);
  }

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, SCAN_FORMATS);
    const reader = new BrowserMultiFormatReader(hints);
    readerRef.current = reader;

    let cancelled = false;
    (async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          handleDecode,
        );
        if (cancelled) {
          try {
            controls?.stop();
          } catch {
            // ignore
          }
        } else {
          controlsRef.current = controls;
        }
      } catch (e) {
        _setCameraError(e?.message || "Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {
        // ignore
      }
      controlsRef.current = null;
      readerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleQtySubmit(qty) {
    const item = sScannedItem;
    if (!item || !orderID) return;
    if (!qty || qty < 1) return;
    _setScannedItem(null);
    _setItemCount((c) => c + 1);
    modalOpenRef.current = false;
    lastScanRef.current = { code: item.scannedBarcode, millis: Date.now() };
    try {
      await dbUpdateVendorOrderItemFields(orderID, item.id, { qty });
    } catch {
      // ignore; user already moved on
    }
  }

  async function handleQtyDismiss() {
    const item = sScannedItem;
    _setScannedItem(null);
    modalOpenRef.current = false;
    if (!item || !orderID) return;
    lastScanRef.current = { code: item.scannedBarcode, millis: Date.now() };
    try {
      await dbDeleteVendorOrderItem(orderID, item.id);
    } catch {
      // ignore; modal was already dismissed locally
    }
  }

  return (
    <div
      className={styles.root}
      onTouchStart={handleSwipeStart}
      onTouchMove={handleSwipeMove}
      onTouchEnd={handleSwipeEnd}
      style={swipeStyle}
    >
      <SwipeBackHint label="Open Orders" swipeX={sSwipeX} />
      <div className={styles.body}>
        <video
          ref={videoRef}
          className={styles.video}
          muted
          playsInline
          autoPlay
        />
        {sCameraError ? (
          <div className={styles.errorBanner}>{sCameraError}</div>
        ) : (
          <div className={styles.hint}>Point at a UPC to scan</div>
        )}
      </div>
      {sScannedItem && (
        <QtyModal
          itemName={sScannedItem.displayName}
          scannedBarcode={sScannedItem.scannedBarcode}
          resolved={sScannedItem.resolved}
          onSubmit={handleQtySubmit}
          onDismiss={handleQtyDismiss}
        />
      )}
      <Toast
        text="Not in inventory · checking catalog…"
        visible={sCatalogChecking}
        duration={0}
        position="mid-top-middle"
      />
      {sShowOrderPanel && (
        <OrderPanelModal
          orderID={orderID}
          onClose={() => _setShowOrderPanel(false)}
        />
      )}
    </div>
  );
}

function OrderPanelModal({ orderID, onClose }) {
  const z = useZ("modal");
  const [sItems, _setItems] = useState([]);
  const [sSwipeX, _setSwipeX] = useState(0);
  const [sSwiping, _setSwiping] = useState(false);
  const swipeStartRef = useRef(null);

  useEffect(() => {
    if (!orderID) return;
    const unsub = dbListenToVendorOrderItems(orderID, (data) => {
      _setItems(Array.isArray(data) ? data : []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [orderID]);

  const swipeHandlers = {
    onTouchStart: (e) => {
      const t = e.touches[0];
      if (t.clientX > 30) return;
      e.stopPropagation();
      swipeStartRef.current = { x: t.clientX, time: Date.now() };
      _setSwiping(true);
    },
    onTouchMove: (e) => {
      if (!swipeStartRef.current) return;
      e.stopPropagation();
      const t = e.touches[0];
      const dx = t.clientX - swipeStartRef.current.x;
      if (dx > 0) _setSwipeX(dx);
    },
    onTouchEnd: (e) => {
      if (!swipeStartRef.current) return;
      e.stopPropagation();
      const elapsed = Date.now() - swipeStartRef.current.time;
      const velocity = sSwipeX / Math.max(elapsed, 1);
      const commitThreshold = window.innerWidth * 0.3;
      const isCommit = sSwipeX > commitThreshold || velocity > 0.5;
      swipeStartRef.current = null;
      _setSwiping(false);
      if (isCommit) {
        _setSwipeX(window.innerWidth);
        setTimeout(() => { onClose(); _setSwipeX(0); }, 200);
      } else {
        _setSwipeX(0);
      }
    },
  };

  const swipeStyle = {
    transform: `translateX(${sSwipeX}px)`,
    transition: sSwiping ? "none" : "transform 200ms ease",
  };

  return (
    <div
      className={styles.orderPanel}
      style={{ zIndex: z, ...swipeStyle }}
      {...swipeHandlers}
    >
      <SwipeBackHint label="Scanner" swipeX={sSwipeX} />
      <div className={styles.orderPanelList}>
        {sItems.length === 0 ? (
          <div className={styles.orderEmpty}>
            <span className={styles.orderEmptyText}>No items yet</span>
          </div>
        ) : (
          sItems.map((item) => {
            const name =
              item.catalogSnapshot?.catalogName ||
              item.catalogSnapshot?.name ||
              item.scannedBarcode ||
              "(unknown)";
            return (
              <div key={item.id} className={styles.orderItemRow}>
                <span className={styles.orderItemName}>{name}</span>
                <span className={styles.orderItemQty}>×{item.qty || 0}</span>
              </div>
            );
          })
        )}
      </div>
      <div className={styles.orderPanelFooter}>
        <button
          type="button"
          className={styles.orderPanelCloseBtn}
          onClick={onClose}
          aria-label="Close order panel"
        >
          <img src={ICONS.redx} alt="" className={styles.orderPanelCloseIcon} />
        </button>
        <span className={styles.orderPanelTitle}>Order Contents</span>
      </div>
    </div>
  );
}

function QtyModal({ itemName, scannedBarcode, resolved, onSubmit, onDismiss }) {
  const z = useZ("modal");
  const [sCustom, _setCustom] = useState(10);
  const [sFocused, _setFocused] = useState(false);
  const justFocusedRef = useRef(false);

  function handleNumPress(n) {
    if (sFocused) {
      if (justFocusedRef.current) {
        _setCustom(n);
        justFocusedRef.current = false;
        return;
      }
      _setCustom((cur) => {
        const next = parseInt(String(cur) + String(n), 10);
        if (!Number.isFinite(next) || next > 9999) return cur;
        return next;
      });
      return;
    }
    if (n === 0) return;
    onSubmit(n);
  }

  function bump(delta) {
    _setCustom((cur) => {
      const n = (parseInt(cur, 10) || 0) + delta;
      return n < 1 ? 1 : n;
    });
  }

  function focusInput() {
    _setFocused(true);
    justFocusedRef.current = true;
  }

  function submit() {
    const n = parseInt(sCustom, 10);
    if (!n || n < 1) return;
    onSubmit(n);
  }

  return (
    <div
      className={styles.modalOverlay}
      style={{ zIndex: z }}
      onClick={onDismiss}
    >
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          {itemName ? (
            <span className={styles.itemName}>{itemName}</span>
          ) : resolved ? (
            <span className={styles.itemPending}>
              No match · {scannedBarcode}
            </span>
          ) : (
            <span className={styles.itemPending}>
              Looking up {scannedBarcode}…
            </span>
          )}
        </div>
        <div className={styles.qtyLabel}>Quantity</div>
        <div className={styles.keypadGrid}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              className={`${styles.numButton} ${
                sFocused ? styles.numButtonGreen : ""
              }`}
              onClick={() => handleNumPress(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className={styles.spinnerRow}>
          <button
            className={styles.arrowButton}
            onClick={() => bump(-1)}
            aria-label="Decrease quantity"
          >
            <img
              src={ICONS.downChevron}
              alt=""
              className={styles.arrowIcon}
            />
          </button>
          <button
            className={`${styles.numButton} ${
              sFocused ? styles.numButtonGreen : ""
            }`}
            onClick={() => handleNumPress(0)}
          >
            0
          </button>
          <button
            type="button"
            className={`${styles.customInput} ${
              sFocused ? styles.customInputFocused : ""
            }`}
            onClick={focusInput}
          >
            {sCustom}
          </button>
          <button
            className={styles.arrowButton}
            onClick={() => bump(1)}
            aria-label="Increase quantity"
          >
            <img src={ICONS.upChevron} alt="" className={styles.arrowIcon} />
          </button>
        </div>
        <button className={styles.submitButton} onClick={submit}>
          Submit
        </button>
      </div>
    </div>
  );
}
